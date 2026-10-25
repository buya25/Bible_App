// Loading of data files (translations, original-language text, lexicon) with in-memory caching.
// The service worker caches every file fetched, so anything opened once also works offline.

const cache = new Map();

export function load(path) {
  if (!cache.has(path)) {
    const promise = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    });
    promise.catch(() => cache.delete(path)); // allow retry after a failed (e.g. offline) fetch
    cache.set(path, promise);
  }
  return cache.get(path);
}

export const loadTranslationList = () => load('data/translations/index.json');
export const loadTranslation = (id) => load(`data/translations/${id}.json`);
/** One book of a translation (array of chapters), for a fast first page. */
export const loadTranslationBook = (id, book) => load(`data/translations/${id}/${book}.json`);
/** Verse counts per chapter for every book (all translations share KJV numbering). */
export const loadStructure = () => load('data/structure.json');
export const loadOriginal = (book) => load(`data/original/${book}.json`);
export const loadVariants = () => load('data/variants.json');
export const loadLexiconIndex = () => load('data/lexicon/index.json');

/** Chunk file holding a Strong's number: "H0430G" → "H0", "G2316" → "G4". */
export const lexiconChunk = (strong) => `${strong[0]}${Math.floor(parseInt(strong.slice(1), 10) / 500)}`;

/** Normalise user input like "h430", "G26" or "H0430G" to the padded form used in the data. */
export function normalizeStrong(input) {
  const m = String(input).trim().match(/^([HGhg])0*(\d{1,4})([A-Za-z]?)$/);
  if (!m) return null;
  return `${m[1].toUpperCase()}${m[2].padStart(4, '0')}${m[3].toUpperCase()}`;
}

/**
 * Find the best entry in a chunk for a Strong's key. Disambiguated keys (H0430G) fall back to the
 * plain number (H0430) or any sense of the same number, so every tagged word gets a definition.
 */
export function pickEntry(chunk, strong) {
  if (chunk[strong]) return { key: strong, entry: chunk[strong] };
  const base = strong.replace(/[A-Z]$/, '');
  if (chunk[base]) return { key: base, entry: chunk[base] };
  const key = Object.keys(chunk).find((k) => k.replace(/[A-Z]$/, '') === base);
  return key ? { key, entry: chunk[key] } : null;
}

export async function loadLexiconEntry(strong) {
  const key = normalizeStrong(strong) || strong;
  const chunk = await load(`data/lexicon/${lexiconChunk(key)}.json`);
  return pickEntry(chunk, key);
}

/** Decode a packed reference (book * 1e6 + chapter * 1e3 + verse). */
export const unpackRef = (n) => ({ book: Math.floor(n / 1e6), chapter: Math.floor(n / 1e3) % 1000, verse: n % 1000 });

const stripMarks = (s) => s.normalize('NFD').replace(/[̀-֑ͯ-ׇ]/g, '').toLowerCase();

/**
 * Search the lexicon index ([key, lemma, translit, gloss, count]) by Strong's number,
 * original-language word, transliteration or English meaning. Most frequent words first.
 */
export function searchLexicon(index, query, limit = 60) {
  const q = query.trim();
  if (!q) return [];
  const strong = normalizeStrong(q);
  if (strong) {
    const base = strong.replace(/[A-Z]$/, '');
    return index.filter((e) => e[0] === strong || e[0].replace(/[A-Z]$/, '') === base).slice(0, limit);
  }
  const plain = stripMarks(q);
  const wordRe = new RegExp(`(^|[^a-z])${plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const scored = [];
  for (const e of index) {
    let score = 0;
    const gloss = e[3].toLowerCase();
    if (stripMarks(e[1]) === plain || stripMarks(e[2]).replace(/[.']/g, '') === plain.replace(/[.']/g, '')) score = 3;
    else if (gloss === plain || gloss.split(/[:;,]\s*/).includes(plain)) score = 2;
    else if (wordRe.test(gloss) || stripMarks(e[1]).includes(plain) || stripMarks(e[2]).startsWith(plain)) score = 1;
    if (score) scored.push([score, e]);
  }
  scored.sort((a, b) => b[0] - a[0] || b[1][4] - a[1][4]);
  return scored.slice(0, limit).map((s) => s[1]);
}

/** Every data file, for the "download for offline use" option. */
export const allDataFiles = () => load('data/manifest.json');
