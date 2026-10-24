import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatYear, formatSpan, eraOf } from '../js/timeline.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

test('years and spans are formatted BC/AD', () => {
  assert.equal(formatYear(-1447), '1447 BC');
  assert.equal(formatYear(30), 'AD 30');
  assert.equal(formatSpan(-1011, -971), '1011–971 BC');
  assert.equal(formatSpan(-5, 30), '5 BC–AD 30');
});

test('timeline data is ordered and assigned to eras', () => {
  const t = read('data/timeline.json');
  const years = t.events.map((e) => e[0]);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  const exodus = t.events.find((e) => e[1] === 'The Exodus');
  assert.equal(exodus[0], -1447);
  assert.equal(eraOf(t.eras, exodus[0])[1], 'Exodus and Wilderness');
  const david = t.spans.find((s) => s[2] === 'The reign of David');
  assert.deepEqual(david.slice(0, 2), [-1011, -971]);
  assert.equal(eraOf(t.eras, david[0])[1], 'The United Kingdom');
  assert.ok(t.events.some((e) => e[4] === 'nt' && e[0] === 30));
  assert.ok(t.spans.filter((s) => s[3] === 'reign').length >= 40);
});

test('places per chapter point at located places', () => {
  const index = read('data/names/index.json');
  const located = new Set(index.filter((r) => r.length > 10).map((r) => r[0]));
  const acts13 = read('data/places/43.json')['13'].map(([id]) => id);
  for (const name of ['Paphos', 'Perga', 'Iconium', 'Salamis', 'Seleucia']) assert.ok(acts13.some((id) => id.startsWith(`${name}@`)), name);
  for (let b = 0; b < 66; b++) {
    for (const list of Object.values(read(`data/places/${b}.json`))) for (const [id] of list) assert.ok(located.has(id), id);
  }
});
