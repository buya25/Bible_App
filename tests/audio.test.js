import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreVoice, rankVoices, pickVoice, voiceTuning, isLikelyMale, isHighQuality } from '../js/audio.js';

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

test('voice styles keep the pitch natural and only slow the pace', () => {
  assert.deepEqual(voiceTuning({ speechRate: 1 }), { pitch: 1, rate: 1 }); // default: natural
  assert.deepEqual(voiceTuning({ voiceStyle: 'calm', speechRate: 1 }), { pitch: 0.97, rate: 0.88 });
  assert.deepEqual(voiceTuning({ voiceStyle: 'deep', speechRate: 1.2 }), { pitch: 1, rate: 1.2 }); // old setting falls back
  assert.equal(voiceTuning({ speechRate: 0.4 }).rate, 0.5);
});

test('robotic voices rank below natural ones', () => {
  const ranked = rankVoices([v('Microsoft David Desktop - English (United States)'), v('eSpeak English'), v('Aaron (Enhanced)'), v('Google US English')]).map((x) => x.name);
  assert.equal(ranked[0], 'Aaron (Enhanced)');
  assert.ok(ranked.indexOf('Microsoft David Desktop - English (United States)') > ranked.indexOf('Google US English'));
  assert.ok(isHighQuality(v('Aaron (Enhanced)')) && !isHighQuality(v('Microsoft David Desktop - English (United States)')));
});

test('"British narrator" prefers a British male voice and a slower, lower delivery', () => {
  const ranked = rankVoices(deviceVoices);
  assert.equal(pickVoice({ voiceURI: '', voiceStyle: 'narrator' }, ranked).lang, 'en-GB');
  assert.ok(isLikelyMale(pickVoice({ voiceURI: '', voiceStyle: 'narrator' }, ranked)));
  assert.deepEqual(voiceTuning({ voiceStyle: 'narrator', speechRate: 1 }), { pitch: 1, rate: 0.9 });
  // An explicitly chosen voice still wins.
  assert.equal(pickVoice({ voiceURI: 'Samantha', voiceStyle: 'narrator' }, ranked).name, 'Samantha');
});
