import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quizScore, starsText } from '../js/stories.js';
import { storyArt, hasArt, artIds } from '../js/story-art.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const kids = read('data/kids-stories.json');
const storyIds = new Set(read('data/stories.json').flatMap((s) => s.stories.map(([id]) => id)));

test('every kids story is a real story with text, a picture and a 3-question quiz', () => {
  assert.equal(Object.keys(kids).length, 50);
  for (const [id, k] of Object.entries(kids)) {
    assert.ok(storyIds.has(id), `unknown story ${id}`);
    assert.ok(k.text.length >= 5 && k.text.every((p) => p.length > 20 && p.length < 400), `${id}: text`);
    assert.ok(hasArt(id), `${id}: no picture`);
    assert.equal(k.quiz.length, 3, id);
    for (const q of k.quiz) {
      assert.ok(q.q.endsWith('?') || q.q.endsWith('...') || q.q.endsWith('…') || q.q.endsWith('"'), `${id}: ${q.q}`);
      assert.equal(q.options.length, 3, `${id}: ${q.q}`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 3, `${id}: ${q.q}`);
      assert.equal(new Set(q.options).size, 3, `${id}: duplicate options`);
    }
  }
  // Answers are not always in the same position.
  const positions = new Set(Object.values(kids).flatMap((k) => k.quiz.map((q) => q.answer)));
  assert.equal(positions.size, 3);
});

test('pictures are valid SVG for every kids story', () => {
  assert.deepEqual(new Set(artIds()), new Set(Object.keys(kids)));
  for (const id of artIds()) {
    const s = storyArt(id, 'x');
    assert.match(s, /^<svg [^>]*viewBox="0 0 400 240"/);
    assert.ok(!/undefined|NaN/.test(s), `${id} has undefined/NaN`);
    assert.ok((s.match(/<g/g) || []).length === (s.match(/<\/g>/g) || []).length, `${id}: unbalanced <g>`);
  }
  assert.equal(storyArt('no-such-story'), '');
});

test('quiz scoring and stars', () => {
  const quiz = [{ answer: 0 }, { answer: 2 }, { answer: 1 }];
  assert.equal(quizScore(quiz, [0, 2, 1]), 3);
  assert.equal(quizScore(quiz, [1, 2, 0]), 1);
  assert.equal(starsText(2), '★★☆');
});
