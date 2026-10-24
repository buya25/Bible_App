import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeTarget, targetText } from '../js/crossrefs.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const kjv = read('data/translations/kjv.json');

test('cross references cover the Bible and point at real verses', () => {
  let verses = 0;
  let withRefs = 0;
  let total = 0;
  for (let b = 0; b < 66; b++) {
    const data = read(`data/crossrefs/${b}.json`);
    assert.equal(data.length, kjv.books[b].length, `book ${b}`);
    data.forEach((ch, c) => {
      assert.equal(ch.length, kjv.books[b][c].length, `${b}.${c + 1}`);
      for (const list of ch) {
        verses++;
        if (list.length) withRefs++;
        total += list.length;
        for (const t of list) {
          for (const n of Array.isArray(t) ? t : [t]) {
            const bk = Math.floor(n / 1e6);
            const cc = Math.floor(n / 1e3) % 1000;
            const vv = n % 1000;
            assert.ok(kjv.books[bk]?.[cc - 1]?.[vv - 1] !== undefined, `bad target ${n}`);
          }
          if (Array.isArray(t)) assert.ok(t[1] > t[0]);
        }
      }
    });
  }
  assert.equal(verses, 31102);
  assert.ok(withRefs / verses > 0.9, `${withRefs} of ${verses} verses have cross references`);
  assert.ok(total > 300000);
  // Strongest links come first: John 3:16 → Romans 5:8.
  assert.equal(read('data/crossrefs/42.json')[2][15][0], 44005008);
});

test('targets are labelled and their text is gathered across chapters', () => {
  assert.equal(describeTarget(44005008).label, 'Romans 5:8');
  assert.equal(describeTarget([61004009, 61004010]).label, '1 John 4:9-10');
  assert.equal(describeTarget([31055, 32002]).label, 'Genesis 31:55–32:2');
  assert.equal(describeTarget([61004009, 61004010], { short: true }).label, '1 John 4:9-10');
  assert.equal(targetText(kjv, 44005008), kjv.books[44][4][7]);
  const span = targetText(kjv, [31055, 32002]);
  assert.ok(span.startsWith(kjv.books[0][30][54]) && span.includes(kjv.books[0][31][1]));
  const long = targetText(kjv, [18119001, 18119176]);
  assert.ok(long.endsWith(' …'));
});
