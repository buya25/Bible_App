import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchNames, namesByStrong, nameChunk } from '../js/names.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const index = read('data/names/index.json');
const entry = (id) => read(`data/names/${nameChunk(id)}.json`)[id];

test('people & places index is complete and consistent', () => {
  assert.ok(index.length > 4000);
  const kinds = index.reduce((acc, r) => ({ ...acc, [r[2]]: (acc[r[2]] || 0) + 1 }), {});
  assert.ok(kinds.person > 3000 && kinds.place > 900 && kinds.other > 50, JSON.stringify(kinds));
  // Every index row resolves to an entry whose relations point at existing entries.
  const ids = new Set(index.map((r) => r[0]));
  for (const letter of ['A', 'J', 'M']) {
    for (const [id, e] of Object.entries(read(`data/names/${letter}.json`))) {
      assert.ok(ids.has(id), id);
      for (const list of Object.values(e.rel || {})) for (const [rid] of list) assert.ok(ids.has(rid), `${id} -> ${rid}`);
      for (const ref of e.r) assert.ok(ref >= 1001 && ref < 66000000, `${id} ${ref}`);
    }
  }
});

test('entries carry family, names, places and verses', () => {
  const abraham = entry('Abraham@Gen.11.26-1Pe');
  assert.equal(abraham.k, 'person');
  assert.deepEqual(abraham.rel.parents, [['Terah@Gen.11.24-Luk']]);
  assert.ok(abraham.rel.children.some(([id]) => id === 'Isaac@Gen.17.19-Jas'));
  assert.ok(abraham.names.some(([name, orig, strong]) => name === 'Abram' && orig === 'אַבְרָם' && strong === 'H0087'));
  assert.ok(abraham.r.includes(1 * 0 + 0 * 1e6 + 12 * 1000 + 1)); // Genesis 12:1
  assert.match(abraham.a, /data-ref="0\.12\.1"/);
  const jerusalem = entry('Jerusalem@Gen.14.18-Rev');
  assert.equal(jerusalem.k, 'place');
  assert.ok(Math.abs(jerusalem.geo[0] - 31.78) < 0.1 && Math.abs(jerusalem.geo[1] - 35.23) < 0.1);
  assert.ok(jerusalem.r.length > 700);
});

test('name search ranks exact names and alternative names first', () => {
  assert.equal(searchNames(index, 'Abraham')[0][0], 'Abraham@Gen.11.26-1Pe');
  assert.equal(searchNames(index, 'abram')[0][0], 'Abraham@Gen.11.26-1Pe'); // other name
  const marys = searchNames(index, 'Mary');
  assert.ok(marys.slice(0, 6).every((r) => r[1] === 'Mary' || r[5].split('|').includes('Mary')), marys.slice(0, 6).map((r) => r[1]).join());
  assert.ok(marys.some((r) => r[1] === 'Martha')); // description mentions Mary
  assert.ok(!marys.some((r) => r[8])); // anonymous genealogy entries only match by name
  assert.ok(searchNames(index, 'Bethlehem', { kind: 'place' }).every((r) => r[2] === 'place'));
  assert.deepEqual(searchNames(index, '  '), []);
});

test('names in the original text are recognised by Strong number', () => {
  const map = namesByStrong(index);
  assert.ok(map.get('H0085').some((r) => r[1] === 'Abraham'));
  assert.ok(map.get('G2424G').some((r) => r[1] === 'Jesus'));
});
