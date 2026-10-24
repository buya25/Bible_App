// Book metadata, reference parsing and search. Pure functions only (no DOM),
// so everything here can be unit tested with `node --test`.

export const BOOKS = [
  ['Genesis', 'Gen', ['gn', 'ge']],
  ['Exodus', 'Exod', ['ex', 'exo']],
  ['Leviticus', 'Lev', ['lv', 'le']],
  ['Numbers', 'Num', ['nm', 'nu']],
  ['Deuteronomy', 'Deut', ['dt', 'de']],
  ['Joshua', 'Josh', ['jos', 'jsh']],
  ['Judges', 'Judg', ['jdg', 'jg', 'jdgs']],
  ['Ruth', 'Ruth', ['rth', 'ru']],
  ['1 Samuel', '1 Sam', ['1sa', '1sm', 'isamuel', 'firstsamuel']],
  ['2 Samuel', '2 Sam', ['2sa', '2sm', 'iisamuel', 'secondsamuel']],
  ['1 Kings', '1 Kgs', ['1ki', '1kgs', 'ikings', 'firstkings']],
  ['2 Kings', '2 Kgs', ['2ki', '2kgs', 'iikings', 'secondkings']],
  ['1 Chronicles', '1 Chr', ['1ch', '1chr', 'ichronicles', 'firstchronicles']],
  ['2 Chronicles', '2 Chr', ['2ch', '2chr', 'iichronicles', 'secondchronicles']],
  ['Ezra', 'Ezra', ['ezr']],
  ['Nehemiah', 'Neh', ['ne']],
  ['Esther', 'Esth', ['est', 'es']],
  ['Job', 'Job', ['jb']],
  ['Psalms', 'Ps', ['ps', 'psa', 'psalm', 'pss', 'psm']],
  ['Proverbs', 'Prov', ['pr', 'prv', 'pro']],
  ['Ecclesiastes', 'Eccl', ['ec', 'ecc', 'qoh']],
  ['Song of Solomon', 'Song', ['song', 'sos', 'songofsongs', 'canticles', 'ss']],
  ['Isaiah', 'Isa', ['is']],
  ['Jeremiah', 'Jer', ['je', 'jr']],
  ['Lamentations', 'Lam', ['la']],
  ['Ezekiel', 'Ezek', ['eze', 'ezk']],
  ['Daniel', 'Dan', ['dn', 'da']],
  ['Hosea', 'Hos', ['ho']],
  ['Joel', 'Joel', ['jl']],
  ['Amos', 'Amos', ['am']],
  ['Obadiah', 'Obad', ['ob']],
  ['Jonah', 'Jonah', ['jnh', 'jon']],
  ['Micah', 'Mic', ['mi']],
  ['Nahum', 'Nah', ['na']],
  ['Habakkuk', 'Hab', ['hb']],
  ['Zephaniah', 'Zeph', ['zep', 'zp']],
  ['Haggai', 'Hag', ['hg']],
  ['Zechariah', 'Zech', ['zec', 'zc']],
  ['Malachi', 'Mal', ['ml']],
  ['Matthew', 'Matt', ['mt', 'mat']],
  ['Mark', 'Mark', ['mk', 'mrk', 'mr']],
  ['Luke', 'Luke', ['lk', 'luk']],
  ['John', 'John', ['jn', 'jhn', 'joh']],
  ['Acts', 'Acts', ['ac', 'act']],
  ['Romans', 'Rom', ['ro', 'rm']],
  ['1 Corinthians', '1 Cor', ['1co', 'icorinthians', 'firstcorinthians']],
  ['2 Corinthians', '2 Cor', ['2co', 'iicorinthians', 'secondcorinthians']],
  ['Galatians', 'Gal', ['ga']],
  ['Ephesians', 'Eph', ['ep']],
  ['Philippians', 'Phil', ['php', 'pp']],
  ['Colossians', 'Col', ['co']],
  ['1 Thessalonians', '1 Thess', ['1th', 'ithessalonians', 'firstthessalonians']],
  ['2 Thessalonians', '2 Thess', ['2th', 'iithessalonians', 'secondthessalonians']],
  ['1 Timothy', '1 Tim', ['1ti', 'itimothy', 'firsttimothy']],
  ['2 Timothy', '2 Tim', ['2ti', 'iitimothy', 'secondtimothy']],
  ['Titus', 'Titus', ['ti', 'tit']],
  ['Philemon', 'Phlm', ['phm', 'philem', 'phlm']],
  ['Hebrews', 'Heb', ['he']],
  ['James', 'Jas', ['jm', 'jas']],
  ['1 Peter', '1 Pet', ['1pe', '1pt', 'ipeter', 'firstpeter']],
  ['2 Peter', '2 Pet', ['2pe', '2pt', 'iipeter', 'secondpeter']],
  ['1 John', '1 John', ['1jn', '1jo', 'ijohn', 'firstjohn']],
  ['2 John', '2 John', ['2jn', '2jo', 'iijohn', 'secondjohn']],
  ['3 John', '3 John', ['3jn', '3jo', 'iiijohn', 'thirdjohn']],
  ['Jude', 'Jude', ['jud', 'jd']],
  ['Revelation', 'Rev', ['re', 'rv', 'revelations', 'apocalypse']],
].map(([name, abbr, aliases], index) => ({
  index,
  name,
  abbr,
  aliases,
  testament: index < 39 ? 'OT' : 'NT',
  slug: name.toLowerCase().replace(/\s+/g, '-'),
}));

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIAS_MAP = new Map();
for (const book of BOOKS) {
  for (const key of [book.name, book.abbr, book.slug, ...book.aliases]) {
    const k = normalize(key);
    if (!ALIAS_MAP.has(k)) ALIAS_MAP.set(k, book.index);
  }
}

/** Resolve a free-form book name ("1 jn", "Gen", "song of songs") to a book index, or -1. */
export function findBook(input) {
  const key = normalize(String(input).replace(/^(i{1,3})\s+/i, (m, r) => String(r.length)));
  if (!key) return -1;
  if (ALIAS_MAP.has(key)) return ALIAS_MAP.get(key);
  // Fall back to the first book (in canonical order) whose name starts with the input.
  const match = BOOKS.find((b) => normalize(b.name).startsWith(key));
  return match && key.length >= 2 ? match.index : -1;
}

/**
 * Parse a reference like "John 3:16", "1 Cor 13", "ps 23:1-4" or "Jude 3".
 * Returns { book, chapter, verse, verseEnd } (1-based chapter/verse) or null.
 */
export function parseReference(input, bible) {
  const m = String(input)
    .trim()
    .match(/^((?:[1-3]|i{1,3}|first|second|third)?\s*[a-z][a-z .]*?)\s*(\d+)?(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/i);
  if (!m) return null;
  const book = findBook(m[1]);
  if (book < 0) return null;
  const chapters = bible ? bible.books[book].length : Infinity;
  let chapter = m[2] ? parseInt(m[2], 10) : 1;
  let verse = m[3] ? parseInt(m[3], 10) : null;
  // Single-chapter books: "Jude 3" means verse 3.
  if (chapters === 1 && m[2] && !m[3]) {
    verse = chapter;
    chapter = 1;
  }
  if (chapter < 1 || chapter > chapters) return null;
  if (bible && verse !== null) {
    const count = bible.books[book][chapter - 1].length;
    if (verse < 1 || verse > count) return null;
  }
  const verseEnd = m[4] ? parseInt(m[4], 10) : null;
  return { book, chapter, verse, verseEnd: verseEnd && verse && verseEnd > verse ? verseEnd : null };
}

/** Human readable reference, e.g. formatReference(42, 3, [16, 17, 19]) → "John 3:16-17, 19". */
export function formatReference(book, chapter, verses = []) {
  const base = `${BOOKS[book].name} ${chapter}`;
  if (!verses.length) return base;
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0];
  let prev = start;
  for (const v of sorted.slice(1).concat(Infinity)) {
    if (v === prev + 1) {
      prev = v;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = v;
  }
  return `${base}:${parts.join(', ')}`;
}

export const verseKey = (book, chapter, verse) => `${book}.${chapter}.${verse}`;

export function parseVerseKey(key) {
  const [book, chapter, verse] = key.split('.').map(Number);
  return { book, chapter, verse };
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build matchers for a search query. Quoted text is matched as an exact phrase,
 * every other word must appear somewhere in the verse (word-prefix match).
 */
export function buildQuery(query) {
  const terms = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(query))) {
    const term = (m[1] || m[2]).trim();
    if (term) terms.push(term);
  }
  return terms.map((t) => new RegExp(`\\b${escapeRegExp(t).replace(/\s+/g, '\\s+')}`, 'i'));
}

/**
 * Full text search. scope: 'all' | 'OT' | 'NT' | a book index.
 * Returns { total, results: [{ book, chapter, verse, text }] } capped at `limit`.
 */
export function search(bible, query, { scope = 'all', limit = 500 } = {}) {
  const matchers = buildQuery(query);
  const out = { total: 0, results: [] };
  if (!matchers.length) return out;
  bible.books.forEach((chapters, book) => {
    if (scope === 'OT' && book >= 39) return;
    if (scope === 'NT' && book < 39) return;
    if (typeof scope === 'number' && scope !== book) return;
    chapters.forEach((verses, c) => {
      verses.forEach((text, v) => {
        if (matchers.every((r) => r.test(text))) {
          out.total++;
          if (out.results.length < limit) out.results.push({ book, chapter: c + 1, verse: v + 1, text });
        }
      });
    });
  });
  return out;
}

/** Wrap matched terms in <mark>. Expects already-escaped HTML text. */
export function highlightTerms(html, query) {
  return buildQuery(query).reduce(
    (acc, r) => acc.replace(new RegExp(r.source.replace(/^\\b/, '\\b(') + '[a-z]*)', 'gi'), '<mark>$1</mark>'),
    html,
  );
}

/** Flat list of every chapter in canonical order, with verse counts (used by reading plans). */
export function allChapters(bible, books = BOOKS.map((b) => b.index)) {
  const list = [];
  for (const book of books) {
    bible.books[book].forEach((verses, c) => list.push({ book, chapter: c + 1, weight: verses.length }));
  }
  return list;
}
