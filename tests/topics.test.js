import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchByName } from '../js/topics.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const kjv = read('data/translations/kjv.json');
const valid = (n) => kjv.books[Math.floor(n / 1e6)]?.[(Math.floor(n / 1e3) % 1000) - 1]?.[(n % 1000) - 1] !== undefined;

test("Nave's topics parse into themed lines with valid verse references", () => {
  const index = read('data/topics/index.json');
  assert.ok(index.length > 5000);
  const slugs = new Set(index.map((r) => r[0]));
  const forgiveness = read('data/topics/f.json').forgiveness;
  assert.equal(forgiveness.n, 'Forgiveness');
  const enemies = forgiveness.l.find((l) => l.t === 'Of Enemies');
  assert.ok(enemies.r.includes(1023004)); // Exodus 23:4
  assert.ok(enemies.r.some((t) => Array.isArray(t) && t[0] === 39005039 && t[1] === 39005041)); // Matthew 5:39-41
  const joseph = forgiveness.l.find((l) => l.t === 'Joseph forgives his brothers');
  assert.deepEqual(joseph.r[0], [45005, 45015]); // Genesis 45:5-15
  for (const letter of ['a', 'f', 'p']) {
    for (const t of Object.values(read(`data/topics/${letter}.json`))) {
      for (const l of t.l) {
        for (const r of l.r || []) for (const n of Array.isArray(r) ? r : [r]) assert.ok(valid(n), `${t.n}: ${n}`);
        for (const [, s] of l.see || []) assert.ok(slugs.has(s), `${t.n} -> ${s}`);
      }
    }
  }
});

test('Bible dictionary has Easton and Smith articles', () => {
  const index = read('data/dictionary/index.json');
  assert.ok(index.length > 5000);
  const tabernacle = read('data/dictionary/t.json').tabernacle;
  assert.deepEqual(tabernacle.d.map((d) => d[0]), ['EAS', 'SMI']);
  assert.match(tabernacle.d[0][1], /dwelling/);
});

test('name search ranks exact and prefix matches first', () => {
  const index = read('data/topics/index.json');
  assert.equal(searchByName(index, 'prayer')[0][1], 'Prayer');
  assert.ok(searchByName(index, 'forgiv').every((r) => r[1].toLowerCase().split(/[\s,()-]+/).some((w) => w.startsWith('forgiv'))));
  assert.deepEqual(searchByName(index, ' '), []);
});
