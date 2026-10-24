import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePassage, passageVerses, toParagraphs } from '../js/stories.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const kjv = read('data/translations/kjv.json');
const sections = read('data/stories.json');
const stories = sections.flatMap((s) => s.stories);

test('every story has a valid passage inside the Bible text', () => {
  assert.ok(stories.length >= 140, `${stories.length} stories`);
  const ids = new Set();
  for (const [id, title, ref, summary] of stories) {
    assert.ok(!ids.has(id), `duplicate id ${id}`);
    ids.add(id);
    assert.ok(title && summary && summary.length < 200, id);
    const p = parsePassage(ref);
    assert.ok(p, `cannot parse ${ref}`);
    const lastChapter = kjv.books[p.book][p.end.chapter - 1];
    assert.ok(lastChapter, `${ref}: chapter out of range`);
    assert.ok(p.end.verse <= lastChapter.length, `${ref}: verse out of range`);
    assert.ok(p.end.chapter > p.start.chapter || p.end.verse >= p.start.verse, `${ref}: ends before it starts`);
    const verses = passageVerses(kjv, p);
    assert.ok(verses.length >= 3, `${ref}: too short`);
  }
});

test('passages spanning chapters include every verse in between', () => {
  const p = parsePassage('Genesis 1:1-2:3');
  assert.deepEqual(p, { book: 0, start: { chapter: 1, verse: 1 }, end: { chapter: 2, verse: 3 } });
  const verses = passageVerses(kjv, p);
  assert.equal(verses.length, 31 + 3);
  assert.deepEqual(verses.at(-1).chapter, 2);
  assert.deepEqual(parsePassage('1 Samuel 17:1-58').book, 8);
  assert.equal(parsePassage('not a ref'), null);
});

test('story text is grouped into paragraphs without losing verses', () => {
  const verses = passageVerses(kjv, parsePassage('Luke 15:11-32'));
  const paras = toParagraphs(verses);
  assert.equal(paras.flat().length, verses.length);
  assert.ok(paras.length >= 4 && paras.every((p) => p.length <= 6));
});
