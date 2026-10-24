import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeHebrew, decodeGreek } from '../js/morph.js';
import { normalizeStrong, lexiconChunk, pickEntry, searchLexicon, unpackRef } from '../js/data.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

test('every translation is aligned to the same verse structure', () => {
  const list = read('data/translations/index.json');
  assert.deepEqual(list.map((t) => t.id), ['kjv', 'web', 'bsb', 'ylt', 'asv']);
  const kjv = read('data/translations/kjv.json');
  for (const { id } of list) {
    const t = read(`data/translations/${id}.json`);
    assert.equal(t.books.length, 66, id);
    t.books.forEach((book, b) => {
      assert.equal(book.length, kjv.books[b].length, `${id} book ${b}`);
      book.forEach((ch, c) => assert.equal(ch.length, kjv.books[b][c].length, `${id} ${b}.${c + 1}`));
    });
    const empty = t.books.flat(2).filter((v) => !v).length;
    assert.ok(empty <= 20, `${id} has ${empty} empty verses`);
  }
  // KJV keeps "LORD" (the divine name) distinct from "Lord".
  assert.match(kjv.books[0][1][3], /LORD God/);
  // The well-known verses absent from older manuscripts are blank in the BSB, present in the KJV.
  const bsb = read('data/translations/bsb.json');
  assert.equal(bsb.books[43][7][36], '');
  assert.ok(kjv.books[43][7][36].length > 0);
});

test('original-language text covers every verse', () => {
  const kjv = read('data/translations/kjv.json');
  for (let b = 0; b < 66; b++) {
    const o = read(`data/original/${b}.json`);
    assert.equal(o.lang, b < 39 ? 'hbo' : 'grc');
    assert.equal(o.chapters.length, kjv.books[b].length);
    o.chapters.forEach((ch, c) => {
      assert.equal(ch.length, kjv.books[b][c].length, `${b}.${c + 1}`);
      ch.forEach((v, i) => assert.ok(v.w.length > 0, `empty ${b}.${c + 1}.${i + 1}`));
    });
  }
  const john316 = read('data/original/42.json').chapters[2][15].w;
  assert.equal(john316[0][0], 'οὕτως');
  assert.ok(john316.some((w) => w[3] === 'G2316' && w[2] === 'God'));
  const gen11 = read('data/original/0.json').chapters[0][0].w;
  assert.equal(gen11[1][3], 'H1254A'); // bara, "created"
});

test('manuscript differences are recorded for well-known verses', () => {
  const variants = read('data/variants.json');
  const find = (b, c, v) => variants.find((x) => x.r[0] === b && x.r[1] === c && x.r[2] === v);
  assert.equal(find(43, 8, 37).whole, true); // Acts 8:37
  assert.equal(find(39, 17, 21).whole, true); // Matthew 17:21
  const comma = find(61, 5, 7); // 1 John 5:7
  assert.ok(comma.k > 10 && !comma.whole);
  assert.ok(find(0, 4, 8).x > 0); // Genesis 4:8 "let us go into the field"
  assert.equal(find(42, 3, 16), undefined);
});

test('morphology codes decode to plain English', () => {
  assert.equal(decodeHebrew('HVqp3ms'), 'Hebrew: Verb Qal perfect 3rd person masculine singular');
  assert.equal(decodeHebrew('HR/Ncfsa'), 'Hebrew: Preposition + Noun feminine singular absolute');
  assert.equal(decodeHebrew('HC/Vqw3ms'), 'Hebrew: Conjunction + Verb Qal sequential imperfect (narrative past) 3rd person masculine singular');
  assert.match(decodeHebrew('AVqp3ms'), /^Aramaic: Verb Peal/);
  assert.equal(decodeGreek('V-AAI-3S'), 'Greek: Verb aorist active indicative 3rd person singular');
  assert.equal(decodeGreek('V-PAP-NSM'), 'Greek: Verb present active participle nominative singular masculine');
  assert.equal(decodeGreek('N-GSM-P'), 'Greek: Noun genitive singular masculine (person)');
  assert.equal(decodeGreek('P-1GS'), 'Greek: Personal pronoun 1st person genitive singular');
  assert.equal(decodeGreek('CONJ'), 'Greek: Conjunction');
  assert.equal(decodeGreek('V-2AAN'), 'Greek: Verb second aorist active infinitive');
});

test("Strong's numbers normalise and map to lexicon chunks", () => {
  assert.equal(normalizeStrong('g26'), 'G0026');
  assert.equal(normalizeStrong('H430'), 'H0430');
  assert.equal(normalizeStrong('H0430G'), 'H0430G');
  assert.equal(normalizeStrong('love'), null);
  assert.equal(lexiconChunk('H0430G'), 'H0');
  assert.equal(lexiconChunk('G2316'), 'G4');
  assert.deepEqual(unpackRef(42003016), { book: 42, chapter: 3, verse: 16 });
});

test('lexicon lookup falls back to related senses', () => {
  const chunk = { H0430G: { g: 'God' }, H0431: { g: 'behold' } };
  assert.equal(pickEntry(chunk, 'H0430G').key, 'H0430G');
  assert.equal(pickEntry(chunk, 'H0430J').key, 'H0430G');
  assert.equal(pickEntry(chunk, 'H0432'), null);
  // Every word tagged in the original text resolves to a dictionary entry.
  const chunks = {};
  let missing = 0;
  for (const b of [0, 18, 42, 44]) {
    for (const ch of read(`data/original/${b}.json`).chapters) {
      for (const v of ch) {
        for (const w of v.w) {
          const name = lexiconChunk(w[3]);
          chunks[name] ??= read(`data/lexicon/${name}.json`);
          if (!pickEntry(chunks[name], w[3])) missing++;
        }
      }
    }
  }
  assert.equal(missing, 0);
});

test('dictionary search finds words by English, original word and number', () => {
  const index = read('data/lexicon/index.json');
  const love = searchLexicon(index, 'love').map((e) => e[0]);
  assert.ok(love.includes('G0026') && love.some((k) => k.startsWith('H0157')), love.slice(0, 10).join());
  assert.equal(searchLexicon(index, 'agape')[0][0], 'G0026');
  assert.equal(searchLexicon(index, 'G26')[0][0], 'G0026');
  assert.ok(searchLexicon(index, 'ἀγάπη').some((e) => e[0] === 'G0026'));
  assert.deepEqual(searchLexicon(index, '   '), []);
});
