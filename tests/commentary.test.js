import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { sectionsFor, commentaryHtml } from '../js/commentary.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const book = (id, b) => JSON.parse(gunzipSync(readFileSync(new URL(`../data/commentary/${id}/${b}.json.gz`, import.meta.url))).toString('utf8'));

test('commentaries cover the Bible', () => {
  const list = read('data/commentary/index.json');
  assert.deepEqual(list.map((c) => c.id), ['matthew-henry', 'jamieson-fausset-brown']);
  assert.equal(list[0].books.length, 65); // Song of Solomon is missing from the source edition
  assert.ok(!list[0].books.includes(21));
  assert.equal(list[1].books.length, 66);
});

test('sections are found for the verses asked about', () => {
  const jfb = book('jamieson-fausset-brown', 42);
  const { covering } = sectionsFor(jfb, 3, [16]);
  assert.equal(covering[0][0], 16);
  assert.match(covering[0][2], /For God so loved/);
  const mh = book('matthew-henry', 42);
  const res = sectionsFor(mh, 3, [16]);
  assert.ok(res.intro && res.covering[0][0] <= 16 && res.covering[0][1] >= 16);
  assert.deepEqual(sectionsFor(null, 1, [1]), { intro: null, covering: [] });
});

test('commentary text becomes paragraphs with safe verse links', () => {
  const html = commentaryHtml('See Joh 3:16 and Rom. 8:28.\n\nSecond <para> & more');
  assert.match(html, /^<p>See <a href="#\/read\/john\/3\/16">Joh 3:16<\/a> and <a href="#\/read\/romans\/8\/28">Rom\. 8:28<\/a>\.<\/p>/);
  assert.match(html, /<p>Second &lt;para&gt; &amp; more<\/p>$/);
  assert.equal(commentaryHtml('Chapter 3:16 is not a book'), '<p>Chapter 3:16 is not a book</p>');
});
