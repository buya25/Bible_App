import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePassage, passageVerses } from '../js/stories.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const kjv = read('data/translations/kjv.json');
const collections = read('data/collections.json');

function checkRef(ref, where) {
  const p = parsePassage(ref);
  assert.ok(p, `${where}: cannot parse ${ref}`);
  const ch = kjv.books[p.book][p.end.chapter - 1];
  assert.ok(ch, `${where}: ${ref} chapter out of range`);
  assert.ok(p.end.verse <= ch.length, `${where}: ${ref} verse out of range`);
  assert.ok(p.end.chapter > p.start.chapter || p.end.verse >= p.start.verse, `${where}: ${ref} ends before it starts`);
  assert.ok(passageVerses(kjv, p).length >= 1, `${where}: ${ref} is empty`);
}

test('collections are well formed and every passage exists', () => {
  const ids = new Set();
  for (const c of collections) {
    assert.ok(c.id && c.title && c.description && c.icon, 'collection fields');
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`);
    ids.add(c.id);
    assert.ok(c.items.length >= 10, `${c.id} has ${c.items.length} items`);
    for (const [title, ref, explanation, related = []] of c.items) {
      assert.ok(title && explanation && explanation.length < 260, `${c.id}: ${title}`);
      checkRef(ref, `${c.id}/${title}`);
      for (const r of related) checkRef(r, `${c.id}/${title} related`);
    }
  }
  for (const id of ['parables', 'miracles', 'ten-commandments', 'law-of-moses', 'prayers', 'psalms', 'teachings', 'promises']) assert.ok(ids.has(id), id);
});

test('the ten commandments are all there, in order', () => {
  const tc = collections.find((c) => c.id === 'ten-commandments');
  const numbered = tc.items.map(([t]) => t).filter((t) => /^\d+\./.test(t));
  assert.deepEqual(numbered.map((t) => Number(t.split('.')[0])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('kids versions are linked from collections and every kids story has a picture', async () => {
  const { artIds } = await import('../js/story-art.js');
  const kids = read('data/kids-stories.json');
  const art = new Set(artIds());
  for (const id of Object.keys(kids)) {
    assert.ok(art.has(id), `${id} has no picture`);
    assert.equal(kids[id].quiz.length, 3, id);
    for (const q of kids[id].quiz) assert.ok(q.answer >= 0 && q.answer < q.options.length, `${id}: ${q.q}`);
  }
  const { kidsStoryFor } = await import('../js/collections.js');
  const stories = read('data/stories.json').flatMap((s) => s.stories).map(([id, , ref]) => {
    const p = parsePassage(ref);
    return { id, book: p.book, chapter: p.start.chapter, verse: p.start.verse };
  });
  const linked = collections.flatMap((c) => c.items.map(([, ref]) => kidsStoryFor(parsePassage(ref), stories, kids)?.id).filter(Boolean));
  for (const id of ['sower', 'builders', 'talents', 'wine', 'roof', 'jairus', 'bartimaeus', 'lazarus', 'prodigal', 'storm']) assert.ok(linked.includes(id), id);
});
