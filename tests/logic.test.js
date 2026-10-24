import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOOKS, findBook, parseReference, formatReference, search, highlightTerms } from '../js/bible.js';
import { PLANS, buildSchedule, describeDay, currentPlanDay, computeStreak } from '../js/plans.js';
import { VERSES, verseOfTheDay } from '../js/votd.js';

const bible = JSON.parse(readFileSync(new URL('../data/kjv.json', import.meta.url), 'utf8'));

test('bible data is complete', () => {
  assert.equal(bible.books.length, 66);
  assert.equal(BOOKS.length, 66);
  const verses = bible.books.flat(2).length;
  assert.equal(verses, 31102);
  assert.equal(bible.books.flat().length, 1189);
});

test('findBook resolves names and abbreviations', () => {
  const cases = { gen: 0, Genesis: 0, ps: 18, psalm: 18, 'song of songs': 21, jn: 42, John: 42, '1 jn': 61, 'I John': 61, '1john': 61, '3 jn': 63, phil: 49, phm: 56, jude: 64, rev: 65, matt: 39, mk: 40, ezek: 25, xyz: -1 };
  for (const [input, expected] of Object.entries(cases)) assert.equal(findBook(input), expected, input);
});

test('parseReference handles common formats', () => {
  assert.deepEqual(parseReference('John 3:16', bible), { book: 42, chapter: 3, verse: 16, verseEnd: null });
  assert.deepEqual(parseReference('ps 23:1-4', bible), { book: 18, chapter: 23, verse: 1, verseEnd: 4 });
  assert.deepEqual(parseReference('1 Cor 13', bible), { book: 45, chapter: 13, verse: null, verseEnd: null });
  assert.deepEqual(parseReference('Jude 3', bible), { book: 64, chapter: 1, verse: 3, verseEnd: null });
  assert.deepEqual(parseReference('Genesis', bible), { book: 0, chapter: 1, verse: null, verseEnd: null });
  assert.equal(parseReference('John 30', bible), null);
  assert.equal(parseReference('John 3:99', bible), null);
  assert.equal(parseReference('love one another', bible), null);
});

test('formatReference collapses verse ranges', () => {
  assert.equal(formatReference(42, 3), 'John 3');
  assert.equal(formatReference(42, 3, [16]), 'John 3:16');
  assert.equal(formatReference(42, 3, [17, 16, 19, 20, 21]), 'John 3:16-17, 19-21');
});

test('search finds words and phrases with scope', () => {
  const r = search(bible, '"God so loved"');
  assert.equal(r.total, 2); // John 3:16 and 1 John 4:11
  assert.deepEqual([r.results[0].book, r.results[0].chapter, r.results[0].verse], [42, 3, 16]);
  const nt = search(bible, 'faith hope charity', { scope: 'NT' });
  assert.ok(nt.results.some((x) => x.book === 45 && x.chapter === 13 && x.verse === 13));
  assert.ok(nt.results.every((x) => x.book >= 39));
  assert.equal(search(bible, 'shepherd', { scope: 18 }).results.every((x) => x.book === 18), true);
  assert.equal(search(bible, '   ').total, 0);
  assert.equal(highlightTerms('God is love', 'love'), 'God is <mark>love</mark>');
});

test('every reading plan covers each chapter exactly once with no empty days', () => {
  for (const plan of PLANS) {
    const schedule = buildSchedule(bible, plan);
    assert.equal(schedule.length, plan.days, plan.id);
    assert.ok(schedule.every((d) => d.length > 0), `${plan.id} has an empty day`);
    const flat = schedule.flat();
    const expected = plan.books.reduce((n, b) => n + bible.books[b].length, 0);
    assert.equal(flat.length, expected, plan.id);
    assert.equal(new Set(flat.map((r) => `${r.book}.${r.chapter}`)).size, expected, plan.id);
  }
});

test('describeDay groups consecutive chapters', () => {
  assert.equal(describeDay([{ book: 0, chapter: 1 }, { book: 0, chapter: 2 }, { book: 0, chapter: 3 }]), 'Genesis 1-3');
  assert.equal(describeDay([{ book: 7, chapter: 4 }, { book: 8, chapter: 1 }]), 'Ruth 4; 1 Samuel 1');
});

test('plan day and streak calculations', () => {
  assert.equal(currentPlanDay('2026-01-01', new Date(2026, 0, 1), 365), 0);
  assert.equal(currentPlanDay('2026-01-01', new Date(2026, 0, 11), 365), 10);
  assert.equal(currentPlanDay('2026-01-01', new Date(2028, 0, 1), 30), 29);
  const today = new Date(2026, 4, 10);
  assert.equal(computeStreak(['2026-05-08', '2026-05-09', '2026-05-10'], today), 3);
  assert.equal(computeStreak(['2026-05-08', '2026-05-09'], today), 2); // not read yet today
  assert.equal(computeStreak(['2026-05-07'], today), 0);
});

test('every verse of the day is a valid reference', () => {
  for (const ref of VERSES) assert.ok(parseReference(ref, bible), ref);
  assert.ok(VERSES.includes(verseOfTheDay(new Date(2026, 6, 4))));
});
