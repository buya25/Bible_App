// Audio Bible: reads chapters aloud with the device's speech voices, choosing a deep, calm male voice
// when one is available. Keeps playing across chapters and pages, with a sleep timer, lock-screen
// controls (where supported) and an optional soft background sound.
import { BOOKS } from './bible.js';

/* ---------- Voices ---------- */

const MALE = /\b(male|man|guy|davis|andrew|christopher|eric|roger|steffan|brian|ryan|thomas|daniel|aaron|arthur|alex|oliver|george|james|reed|gordon|evan|nathan|tom|liam|william|jacob|tony|mark|david|richard|paul|jason|noah|rishi|lee|connor|mitchell|william|prabhat|luke|duncan)\b/i;
const FEMALE = /\b(female|woman|samantha|karen|moira|tessa|zira|susan|aria|jenny|emma|ava|allison|catherine|fiona|kate|serena|victoria|nicky|joanna|salli|kimberly|ivy|libby|sonia|natasha|clara|michelle|ana|sara|hazel|heera|linda|elizabeth|amy|olivia|nova|veena|kendra|ruth|joanne|molly|emily|isla|maisie|abbi|bella|hollie|jane|nancy|sonia|yan|rosie)\b/i;
// Novelty and robotic voices on macOS/iOS that should never be picked automatically.
const NOVELTY = /\b(bad news|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|organ|superstar|jester|wobble|albert|bahh|hysterical|junior|ralph|kathy|princess|fred|good news|deranged|pipe)\b/i;
const NATURAL = /natural|neural|online|premium|enhanced|siri|wavenet|studio/i;
// Old-style synthetic voices that sound robotic (eSpeak, legacy Windows desktop voices).
const ROBOTIC = /espeak|\bdesktop\b|^microsoft (david|mark|zira|hazel|george|susan|james|catherine)\b(?!.*(online|natural))/i;
const DEEP = /\b(guy|davis|andrew|christopher|arthur|daniel|aaron|roger|brian|eric|ryan|thomas)\b/i;

/** Higher is better: English, male, natural-sounding voices first. */
export function scoreVoice({ name = '', lang = '' }) {
  let score = 0;
  if (/^en\b|^en[-_]/i.test(lang)) score += 30;
  if (/^en[-_](US|GB)/i.test(lang)) score += 5;
  if (NOVELTY.test(name)) return score - 200;
  if (MALE.test(name)) score += 40;
  if (FEMALE.test(name)) score -= 50;
  // Sound quality matters most: a natural-sounding voice is far easier to listen to than a robotic one.
  if (NATURAL.test(name)) score += 45;
  if (ROBOTIC.test(name)) score -= 60;
  if (DEEP.test(name)) score += 10;
  return score;
}

/** Voices whose names mark them as high quality (neural, enhanced, premium…). */
export const isHighQuality = (voice) => Boolean(voice) && NATURAL.test(voice.name) && !ROBOTIC.test(voice.name);

export const isLikelyMale = (voice) => scoreVoice(voice) >= 70 || (MALE.test(voice.name) && !FEMALE.test(voice.name));

export function rankVoices(voices) {
  return [...voices].filter((v) => /^en/i.test(v.lang)).sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name));
}

let voiceList = [];
const loadVoices = () => (voiceList = rankVoices(globalThis.speechSynthesis?.getVoices() || []));
globalThis.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);
loadVoices();

export const voices = () => (voiceList.length ? voiceList : loadVoices());

/**
 * The chosen voice, or the best-ranked one when set to automatic.
 * The "British narrator" style prefers a British English male voice (e.g. Daniel, Ryan, Thomas, Google UK English Male).
 */
export function pickVoice(settings, list = voices()) {
  const chosen = list.find((v) => v.voiceURI === settings.voiceURI);
  if (chosen) return chosen;
  if (settings.voiceStyle === 'narrator') {
    const british = list.find((v) => /^en[-_]GB/i.test(v.lang) && isLikelyMale(v) && scoreVoice(v) > 0);
    if (british) return british;
  }
  return list[0] || null;
}

/** Voice styles: pitch and speed adjustments applied to whichever voice is used. */
// Pitch is left (almost) untouched: lowering it on device voices makes them sound robotic.
export const VOICE_STYLES = [
  ['natural', 'Natural', { pitch: 1, rate: 1 }],
  ['calm', 'Calm & slower', { pitch: 0.97, rate: 0.88 }],
  ['narrator', 'British narrator', { pitch: 1, rate: 0.9 }],
];

export function voiceTuning(settings) {
  const style = VOICE_STYLES.find(([id]) => id === (settings.voiceStyle || 'natural')) || VOICE_STYLES[0];
  return { pitch: style[2].pitch, rate: Math.max(0.5, Math.round((settings.speechRate || 1) * style[2].rate * 100) / 100) };
}

/* ---------- Player ---------- */

const synth = globalThis.speechSynthesis;
let deps = null; // { store, getBible, getAbbr }
let state = { status: 'stopped', book: 0, chapter: 1, verse: 1, sleep: 0, sleepEnds: 0 };
let utterance = null; // kept referenced so browsers don't drop the end event
let sleepTimer = null;
let failures = 0; // consecutive speech errors; a broken speech engine must not race through the Bible
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn({ ...state }));
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const playerState = () => ({ ...state });
export const supported = () => Boolean(synth && globalThis.SpeechSynthesisUtterance);

export function initAudio(dependencies) {
  deps = dependencies;
}

function speak(text, onEnd) {
  const settings = deps.store.get().settings;
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(settings);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = 'en-US';
  }
  Object.assign(u, voiceTuning(settings));
  u.onend = () => {
    if (utterance !== u) return;
    failures = 0;
    onEnd();
  };
  u.onerror = (e) => {
    if (utterance !== u || e.error === 'interrupted' || e.error === 'canceled') return;
    if (++failures >= 3) {
      stop();
      state.error = 'Speech is not working on this device right now. Check that a voice is installed, or try another browser.';
      emit();
      state.error = null;
      return;
    }
    onEnd();
  };
  utterance = u;
  synth.speak(u);
}

const pastEnd = ({ chapter, verse, until }) => until && (chapter > until.chapter || (chapter === until.chapter && verse > until.verse));

function speakCurrent() {
  if (state.status !== 'playing') return;
  if (pastEnd(state)) return stop(); // a story or passage with a set end has finished
  const bible = state.bible || deps.getBible();
  const verses = bible.books[state.book][state.chapter - 1];
  if (state.verse > verses.length) return chapterFinished();
  const text = verses[state.verse - 1];
  emit();
  updateMediaSession();
  if (!text) {
    state.verse++;
    return speakCurrent();
  }
  const announce = state.verse === 1 && state.announce !== false ? `${BOOKS[state.book].name}, chapter ${state.chapter}. ` : '';
  state.announce = true;
  speak(announce + text, () => {
    state.verse++;
    speakCurrent();
  });
}

function chapterFinished() {
  const settings = deps.store.get().settings;
  if (state.until || state.sleep === 'chapter' || settings.audioContinue === false) return stop();
  const next = adjacent(state.book, state.chapter, 1);
  if (!next) return stop();
  state.book = next.book;
  state.chapter = next.chapter;
  state.verse = 1;
  speakCurrent();
}

function adjacent(book, chapter, dir) {
  const bible = deps.getBible();
  chapter += dir;
  if (chapter < 1) {
    if (--book < 0) return null;
    chapter = bible.books[book].length;
  } else if (chapter > bible.books[book].length) {
    if (++book >= BOOKS.length) return null;
    chapter = 1;
  }
  return { book, chapter };
}

/**
 * Start reading at a chapter and verse.
 * options.until = { chapter, verse } stops at the end of a passage (e.g. a story);
 * options.bible reads from a specific translation; options.title names it in the player.
 */
export function play(book, chapter, verse = 1, { until = null, bible = null, title = null } = {}) {
  if (!supported()) return false;
  synth.cancel();
  Object.assign(state, { status: 'playing', book, chapter, verse, announce: verse === 1 && !title, until, bible, title });
  startAmbient();
  speakCurrent();
  return true;
}

/** Pause by cancelling the current verse; resuming restarts that verse (reliable on every browser). */
export function pause() {
  if (state.status !== 'playing') return;
  state.status = 'paused';
  utterance = null;
  synth.cancel();
  stopAmbient();
  emit();
  updateMediaSession();
}

export function resume() {
  if (state.status !== 'paused') return;
  state.status = 'playing';
  state.announce = false;
  startAmbient();
  speakCurrent();
}

export const toggle = () => (state.status === 'playing' ? pause() : resume());

export function stop() {
  utterance = null;
  synth?.cancel();
  clearTimeout(sleepTimer);
  state = { ...state, status: 'stopped', sleep: 0, sleepEnds: 0 };
  stopAmbient();
  emit();
  updateMediaSession();
}

export function skipChapter(dir) {
  const target = adjacent(state.book, state.chapter, dir);
  if (target) play(target.book, target.chapter, 1);
}

export function skipVerse(dir) {
  const count = (state.bible || deps.getBible()).books[state.book][state.chapter - 1].length;
  const verse = Math.min(Math.max(1, state.verse + dir), count);
  utterance = null;
  synth.cancel();
  Object.assign(state, { status: 'playing', verse, announce: false });
  startAmbient();
  speakCurrent();
}

/** Sleep timer: minutes (15, 30, 60), 'chapter' (stop at the end of this chapter) or 0 (off). */
export const SLEEP_OPTIONS = [0, 15, 30, 60, 'chapter'];
export function setSleep(value) {
  clearTimeout(sleepTimer);
  state.sleep = value;
  state.sleepEnds = typeof value === 'number' && value > 0 ? Date.now() + value * 60000 : 0;
  if (state.sleepEnds) sleepTimer = setTimeout(() => fadeOutAndStop(), value * 60000);
  emit();
}
export function cycleSleep() {
  const i = SLEEP_OPTIONS.indexOf(state.sleep);
  setSleep(SLEEP_OPTIONS[(i + 1) % SLEEP_OPTIONS.length]);
  return state.sleep;
}

function fadeOutAndStop() {
  fadeAmbient(0, 4);
  setTimeout(stop, 4000);
}

/** Speak a short sample with the given settings (for the voice picker). */
export function preview(settings, text = 'The Lord is my shepherd; I shall not want. He maketh me to lie down in green pastures.') {
  if (!supported()) return;
  if (state.status === 'playing') pause();
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(settings);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  Object.assign(u, voiceTuning(settings));
  synth.speak(u);
}

/* ---------- Lock-screen / headset controls ---------- */

function updateMediaSession() {
  const ms = globalThis.navigator?.mediaSession;
  if (!ms || !deps) return;
  try {
    ms.playbackState = state.status === 'playing' ? 'playing' : state.status === 'paused' ? 'paused' : 'none';
    if (state.status === 'stopped') return;
    ms.metadata = new MediaMetadata({
      title: state.title || `${BOOKS[state.book].name} ${state.chapter}`,
      artist: `Audio Bible · ${deps.getAbbr()}`,
      album: 'Bible',
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    ms.setActionHandler('play', resume);
    ms.setActionHandler('pause', pause);
    ms.setActionHandler('stop', stop);
    ms.setActionHandler('nexttrack', () => skipChapter(1));
    ms.setActionHandler('previoustrack', () => skipChapter(-1));
  } catch {
    // Media Session is optional.
  }
}

/* ---------- Soft background sound (generated, no audio files) ---------- */

let ctx = null;
let ambient = null; // { gain, nodes }

export const AMBIENT_OPTIONS = [
  ['off', 'Off'],
  ['pad', 'Soft pad'],
  ['rain', 'Gentle rain'],
];

function startAmbient() {
  const kind = deps?.store.get().settings.ambient || 'off';
  if (kind === 'off') return stopAmbient();
  if (ambient?.kind === kind) return fadeAmbient(ambient.level, 1.5);
  stopAmbient(true);
  try {
    ctx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    ctx.resume?.();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const nodes = [];
    let level;
    if (kind === 'pad') {
      // A warm, slowly breathing chord (C2, G2, C3, E3) through a soft low-pass filter.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      filter.connect(gain);
      for (const [freq, type] of [[65.41, 'sine'], [98, 'sine'], [130.81, 'triangle'], [164.81, 'sine']]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 8;
        const g = ctx.createGain();
        g.gain.value = 0.25;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.05 + Math.random() * 0.07;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.12;
        lfo.connect(lfoGain).connect(g.gain);
        osc.connect(g).connect(filter);
        osc.start();
        lfo.start();
        nodes.push(osc, lfo);
      }
      level = 0.06;
    } else {
      // Rain: looping noise shaped by band-pass and low-pass filters.
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown-ish noise
        data[i] = last * 3.5 + (Math.random() * 2 - 1) * 0.15;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 900;
      band.Q.value = 0.4;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 3000;
      src.connect(band).connect(low).connect(gain);
      src.start();
      nodes.push(src);
      level = 0.18;
    }
    ambient = { kind, gain, nodes, level };
    fadeAmbient(level, 2.5);
  } catch {
    ambient = null;
  }
}

function fadeAmbient(to, seconds) {
  if (!ambient || !ctx) return;
  const g = ambient.gain.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(to, ctx.currentTime + seconds);
}

function stopAmbient(immediate = false) {
  if (!ambient) return;
  const { nodes } = ambient;
  fadeAmbient(0, immediate ? 0.05 : 1.5);
  setTimeout(() => nodes.forEach((n) => {
    try {
      n.stop();
    } catch {
      // already stopped
    }
  }), immediate ? 60 : 1600);
  ambient = null;
}

/** Re-apply the background sound after the setting changes while playing. */
export function refreshAmbient() {
  if (state.status === 'playing') startAmbient();
  else stopAmbient(true);
}
