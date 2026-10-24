import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreVoice, rankVoices, pickVoice, voiceTuning, isLikelyMale } from '../js/audio.js';

const v = (name, lang = 'en-US', voiceURI = name) => ({ name, lang, voiceURI });
const deviceVoices = [
  v('Samantha'), v('Fred'), v('Microsoft Aria Online (Natural) - English (United States)'),
  v('Microsoft Guy Online (Natural) - English (United States)'), v('Google UK English Male', 'en-GB'),
  v('Google UK English Female', 'en-GB'), v('Daniel', 'en-GB'), v('Thomas', 'fr-FR'), v('Bad News'), v('Karen', 'en-AU'),
];

test('deep, natural English male voices rank first; novelty and non-English voices are excluded', () => {
  const ranked = rankVoices(deviceVoices).map((x) => x.name);
  assert.equal(ranked[0], 'Microsoft Guy Online (Natural) - English (United States)');
  assert.ok(ranked.indexOf('Daniel') < ranked.indexOf('Samantha'));
  assert.ok(ranked.indexOf('Google UK English Male') < ranked.indexOf('Google UK English Female'));
  assert.ok(!ranked.includes('Thomas')); // French
  assert.ok(ranked.indexOf('Bad News') > ranked.indexOf('Karen'));
  assert.ok(scoreVoice(v('Fred')) < 0);
  assert.ok(isLikelyMale(v('Daniel', 'en-GB')) && !isLikelyMale(v('Samantha')));
});

test('a chosen voice wins; otherwise the best-ranked voice is used', () => {
  const ranked = rankVoices(deviceVoices);
  assert.equal(pickVoice({ voiceURI: '' }, ranked).name, ranked[0].name);
  assert.equal(pickVoice({ voiceURI: 'Daniel' }, ranked).name, 'Daniel');
  assert.equal(pickVoice({ voiceURI: 'missing' }, ranked).name, ranked[0].name);
  assert.equal(pickVoice({}, []), null);
});

test('"Deep & calm" lowers pitch and slows slightly', () => {
  assert.deepEqual(voiceTuning({ voiceStyle: 'deep', speechRate: 1 }), { pitch: 0.8, rate: 0.9 });
  assert.deepEqual(voiceTuning({ voiceStyle: 'natural', speechRate: 1.2 }), { pitch: 1, rate: 1.2 });
  assert.equal(voiceTuning({ speechRate: 0.4 }).rate, 0.5);
});

test('"British narrator" prefers a British male voice and a slower, lower delivery', () => {
  const ranked = rankVoices(deviceVoices);
  assert.equal(pickVoice({ voiceURI: '', voiceStyle: 'narrator' }, ranked).lang, 'en-GB');
  assert.ok(isLikelyMale(pickVoice({ voiceURI: '', voiceStyle: 'narrator' }, ranked)));
  assert.deepEqual(voiceTuning({ voiceStyle: 'narrator', speechRate: 1 }), { pitch: 0.85, rate: 0.85 });
  // An explicitly chosen voice still wins.
  assert.equal(pickVoice({ voiceURI: 'Samantha', voiceStyle: 'narrator' }, ranked).name, 'Samantha');
});
