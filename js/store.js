// Persistent user data (settings, highlights, notes, bookmarks, plans) in localStorage.

const KEY = 'bible-app:v1';

export const DEFAULTS = {
  settings: { theme: 'auto', fontSize: 19, font: 'serif', lineHeight: 1.7, verseNumbers: true, paragraphMode: false, speechRate: 1, translation: 'kjv', readerMode: 'text', crossRefs: false, commentary: 'matthew-henry' },
  highlights: {}, // verseKey -> color name
  bookmarks: {}, // verseKey -> timestamp
  notes: {}, // verseKey -> { text, updated }
  history: [], // [{ book, chapter, ts }] most recent first
  readDates: [], // ['YYYY-MM-DD']
  plan: null, // { id, startDate, done: { 'day:index': true } }
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...structuredClone(DEFAULTS), ...saved, settings: { ...DEFAULTS.settings, ...(saved.settings || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or unavailable (private mode); the app keeps working in memory.
  }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get: () => state,
  update(fn) {
    fn(state);
    save();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  exportData: () => JSON.stringify({ app: 'bible-app', version: 1, exported: new Date().toISOString(), data: state }, null, 2),
  importData(json) {
    const parsed = JSON.parse(json);
    const data = parsed.data || parsed;
    if (typeof data !== 'object' || !data) throw new Error('Not a valid backup file');
    state = { ...structuredClone(DEFAULTS), ...data, settings: { ...DEFAULTS.settings, ...(data.settings || {}) } };
    save();
  },
};
