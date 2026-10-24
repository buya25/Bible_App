import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newItem, review, dueItems, isLearned, firstLetters, compareTyped, INTERVALS } from '../js/memory.js';
import { buildIcs, reminderDue } from '../js/reminders.js';
import { wrapLines } from '../js/verse-image.js';
import { parseVerseList } from '../js/prayers.js';

const kjv = JSON.parse(readFileSync(new URL('../data/translations/kjv.json', import.meta.url), 'utf8'));

test('spaced repetition moves verses up on success and back to tomorrow on a miss', () => {
  let item = newItem(42, 3, [17, 16], 'kjv', '2026-01-01');
  assert.deepEqual(item.verses, [16, 17]);
  assert.equal(item.due, '2026-01-01');
  item = review(item, true, '2026-01-01');
  assert.equal(item.level, 1);
  assert.equal(item.due, '2026-01-03'); // INTERVALS[1] = 2 days
  item = review(item, true, '2026-01-03');
  assert.equal(item.due, '2026-01-07');
  item = review(item, false, '2026-01-07');
  assert.deepEqual([item.level, item.due, item.reviews], [0, '2026-01-08', 3]);
  for (let i = 0; i < 20; i++) item = review(item, true, item.due);
  assert.equal(item.level, INTERVALS.length - 1);
  assert.ok(isLearned(item));
  const due = dueItems([{ due: '2026-02-01' }, { due: '2026-01-01' }, { due: '2027-01-01' }], '2026-03-01');
  assert.deepEqual(due.map((d) => d.due), ['2026-01-01', '2026-02-01']);
});

test('first letters and typed answers are checked word by word', () => {
  assert.equal(firstLetters('For God so loved the world, that he gave'), 'F G s l t w, t h g');
  const perfect = compareTyped('For God so loved the world', 'for god so loved the world!');
  assert.equal(perfect.score, 1);
  const missing = compareTyped('For God so loved the world', 'For God loved the world');
  assert.ok(missing.score > 0.8 && missing.score < 1);
  assert.deepEqual(missing.marked.filter(([, ok]) => !ok).map(([w]) => w), ['so']);
  assert.equal(compareTyped('Jesus wept.', '').score, 0);
});

test('calendar reminder is a valid daily recurring event', () => {
  const ics = buildIcs({ time: '07:30', url: 'https://example.org/bible/#/today', now: new Date(2026, 4, 9, 12) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20260509T073000\r\n/);
  assert.match(ics, /RRULE:FREQ=DAILY\r\n/);
  assert.ok(ics.split('\r\n').every((line) => line.length <= 75));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('reminder shows once, after the chosen time, only if not read today', () => {
  const settings = { reminder: true, reminderTime: '07:00' };
  const at = (h) => new Date(2026, 4, 9, h);
  assert.equal(reminderDue(settings, { readDates: [], reminderShown: null }, at(6)), false);
  assert.equal(reminderDue(settings, { readDates: [], reminderShown: null }, at(8)), true);
  assert.equal(reminderDue(settings, { readDates: ['2026-05-09'], reminderShown: null }, at(8)), false);
  assert.equal(reminderDue(settings, { readDates: [], reminderShown: '2026-05-09' }, at(8)), false);
  assert.equal(reminderDue({ ...settings, reminder: false }, { readDates: [] }, at(8)), false);
});

test('verse images wrap text to width and prayers parse verse lists', () => {
  const lines = wrapLines((s) => s.length * 10, 'For God so loved the world that he gave', 100);
  assert.ok(lines.every((l) => l.length * 10 <= 100 || !l.includes(' ')));
  assert.equal(lines.join(' '), 'For God so loved the world that he gave');
  const refs = parseVerseList('Philippians 4:6-7; Psalm 23; nonsense', kjv);
  assert.deepEqual(refs, [{ book: 49, chapter: 4, verses: [6, 7] }, { book: 18, chapter: 23, verses: [] }]);
});
