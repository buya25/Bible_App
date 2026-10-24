// Study tools: original-language interlinear, word studies (lexicon), translation comparison
// and manuscript (textual) differences.
import { BOOKS, formatReference } from './bible.js';
import { loadTranslationList, loadTranslation, loadOriginal, loadVariants, loadLexiconIndex, loadLexiconEntry, searchLexicon, unpackRef, normalizeStrong } from './data.js';
import { decodeMorph } from './morph.js';
import { escapeHtml, readHref } from './util.js';
import { renderNamesHome, namesForStrong, nameHref, typeLabel } from './names.js';
import { loadCrossRefs, crossRefListHtml, bindMoreButtons } from './crossrefs.js';
import { renderCommentaryPanel } from './commentary.js';
import { renderTopicsHome, renderDictionaryHome } from './topics.js';

const STATUS = {
  1: { cls: 'w-other', label: 'Found in other ancient sources (e.g. Septuagint or Dead Sea Scrolls), not in the standard Hebrew text' },
  2: { cls: 'w-kjv', label: 'Only in the Greek text behind the KJV (Textus Receptus); not in the oldest manuscripts' },
  4: { cls: 'w-modern', label: 'In the oldest manuscripts used by modern translations, but not in the KJV’s Greek text' },
};

/** The view currently showing an interlinear registers how to find a tapped word's data. */
export const wordContext = { lookup: null };

export const studyVerseHref = (book, chapter, verses) => `#/study/verse/${book}/${chapter}/${verses}`;
export const wordHref = (strong) => `#/study/word/${strong}`;

/* ---------- Interlinear ---------- */

/** Word-by-word original text for one verse. Each word is [original, transliteration, gloss, strong, morph, status]. */
export function interlinearHtml(words, lang) {
  const dirAttr = lang === 'hbo' ? 'dir="rtl" lang="he"' : 'lang="grc"';
  return `<div class="interlinear" ${dirAttr}>${words
    .map(([orig, translit, gloss, strong, morph, status], i) => {
      const s = STATUS[status];
      return `<button class="word ${s ? s.cls : ''}" data-word="${i}" data-strong="${escapeHtml(strong)}" ${s ? `title="${escapeHtml(s.label)}"` : ''}>
        <span class="w-orig">${escapeHtml(orig)}</span>
        <span class="w-translit" dir="ltr">${escapeHtml(translit)}</span>
        <span class="w-gloss" dir="ltr">${escapeHtml(gloss)}</span>
        <span class="w-strong" dir="ltr">${escapeHtml(strong.replace(/^([HG])0*/, '$1'))}</span>
      </button>`;
    })
    .join('')}</div>`;
}

export const interlinearLegend = (lang) => `
  <p class="legend small muted">
    ${lang === 'hbo' ? 'Hebrew reads right to left. ' : ''}Tap a word for its meaning and every place it is used.
    ${lang === 'hbo' ? '<span class="chip w-other">Other ancient sources</span>' : '<span class="chip w-kjv">Only in KJV text</span> <span class="chip w-modern">Only in oldest manuscripts</span>'}
  </p>`;

/* ---------- Word study ---------- */

function usageBars(entry) {
  if (!entry.u?.length) return '';
  const max = entry.u[0][1];
  return `<div class="usage">${entry.u
    .map(([gloss, n]) => `<div class="usage-row"><span>${escapeHtml(gloss)}</span><div class="bar"><div style="width:${Math.max(4, (n / max) * 100)}%"></div></div><span class="muted">${n}</span></div>`)
    .join('')}</div>`;
}

function wordHeader(key, entry) {
  const lang = key[0] === 'H' ? 'he' : 'grc';
  return `
    <div class="lemma-row">
      <span class="lemma" lang="${lang}" ${lang === 'he' ? 'dir="rtl"' : ''}>${escapeHtml(entry.l)}</span>
      <span class="lemma-translit">${escapeHtml(entry.t)}</span>
    </div>
    <p class="lemma-gloss"><strong>${escapeHtml(entry.g)}</strong></p>
    <p class="muted small">${key[0] === 'H' ? 'Hebrew/Aramaic' : 'Greek'} · Strong’s ${escapeHtml(key)} · ${escapeHtml(entry.p)}${entry.n ? ` · used ${entry.n.toLocaleString()} times` : ''}</p>`;
}

/** Compact word study shown in a dialog when a word is tapped in the interlinear. */
export async function openWordDialog(dialog, word, lang) {
  const [orig, translit, gloss, strong, morph, status] = word;
  dialog.innerHTML = `<div class="dialog-head"><h2>Word study</h2><button class="btn btn-small" data-close>Close</button></div><div class="dialog-body"><div class="loading">Loading…</div></div>`;
  dialog.onclick = (e) => {
    if (e.target === dialog || e.target.closest('[data-close]') || e.target.closest('a')) dialog.close();
  };
  dialog.oninput = dialog.onchange = null;
  if (!dialog.open) dialog.showModal();
  const found = await loadLexiconEntry(strong).catch(() => null);
  const body = dialog.querySelector('.dialog-body');
  if (!body) return;
  const s = STATUS[status];
  body.innerHTML = `
    <div class="occurrence">
      <span class="lemma" lang="${lang === 'hbo' ? 'he' : 'grc'}" ${lang === 'hbo' ? 'dir="rtl"' : ''}>${escapeHtml(orig)}</span>
      <span class="lemma-translit">${escapeHtml(translit)}</span>
      <p>In this verse: <strong>“${escapeHtml(gloss)}”</strong></p>
      <p class="muted small">${escapeHtml(decodeMorph(morph, lang))}</p>
      ${s ? `<p class="note-box ${s.cls}">${escapeHtml(s.label)}</p>` : ''}
    </div>
    ${found
      ? `<h3>Dictionary form</h3>${wordHeader(found.key, found.entry)}
         <div class="definition clamp">${found.entry.d}</div>
         ${found.entry.u ? `<h3>How it is translated</h3>${usageBars(found.entry)}` : ''}
         <p><a class="btn btn-primary" href="${wordHref(found.key)}">Full word study & all verses →</a></p>`
      : '<p class="muted">No dictionary entry was found for this word.</p>'}`;
  const people = await namesForStrong(strong).catch(() => []);
  if (people.length && dialog.querySelector('.occurrence')) {
    dialog.querySelector('.occurrence').insertAdjacentHTML('beforeend', `<div class="name-box"><span class="muted small">This is a name:</span>
      ${people.slice(0, 3).map((r) => `<a class="chip-link" href="${nameHref(r[0])}"><strong>${escapeHtml(r[1])}</strong> <span class="muted small">${escapeHtml(typeLabel(r))} · ${escapeHtml(r[3])}</span></a>`).join('')}</div>`);
  }
}

/** Full word-study page: definition, translation statistics and every occurrence. */
export async function renderWordPage(main, strong, bible, abbr) {
  const key = normalizeStrong(strong) || strong;
  main.innerHTML = '<div class="loading">Loading word study…</div>';
  const found = await loadLexiconEntry(key).catch(() => null);
  if (!found) {
    main.innerHTML = `<div class="empty">No dictionary entry for ${escapeHtml(strong)}. <a href="#/study">Back to dictionary</a></div>`;
    return;
  }
  const { entry } = found;
  document.title = `${entry.t} (${entry.g}) — Word study`;
  const refs = (entry.r || []).map(unpackRef);
  const PAGE = 40;
  const list = (n) =>
    refs
      .slice(0, n)
      .map(({ book, chapter, verse }) => {
        const text = bible.books[book]?.[chapter - 1]?.[verse - 1] || '';
        return `<a class="result" href="${readHref(book, chapter, verse)}"><strong>${formatReference(book, chapter, [verse])}</strong><span>${escapeHtml(text)}</span></a>`;
      })
      .join('');
  main.innerHTML = `
    <p><a href="#/study">← Dictionary</a></p>
    <section class="card word-page">
      ${wordHeader(found.key, entry)}
      <h3>Definition</h3>
      <div class="definition">${entry.d || '<span class="muted">No definition available.</span>'}</div>
    </section>
    ${entry.u ? `<section class="card"><h3 style="margin-top:0">How it is translated</h3><p class="muted small">How often each English rendering is used for this word in the original text (word-for-word glosses).</p>${usageBars(entry)}</section>` : ''}
    <section>
      <h2>Where it is used${entry.n ? ` (${entry.n.toLocaleString()} times${refs.length < entry.n ? `; ${refs.length} verses listed` : ''})` : ''}</h2>
      <p class="muted small">Verses shown in the ${escapeHtml(abbr)}.</p>
      <div id="occurrences">${list(PAGE) || '<div class="empty">No occurrences recorded.</div>'}</div>
      ${refs.length > PAGE ? `<p><button class="btn" id="more-refs">Show all ${refs.length} verses</button></p>` : ''}
    </section>`;
  const more = document.getElementById('more-refs');
  if (more) {
    more.onclick = () => {
      document.getElementById('occurrences').innerHTML = list(refs.length);
      more.remove();
    };
  }
}

/* ---------- Manuscript differences ---------- */

function differenceSummary(words, lang, notes = []) {
  const group = (status) => words.filter((w) => w[5] === status).map((w) => w[2]).join(' ');
  const items = [];
  if (lang === 'grc') {
    const kjvOnly = group(2);
    const modernOnly = group(4);
    // Whole verse: no word of it is in the oldest-manuscript (Nestle-Aland) text.
    if (kjvOnly && words.every((w) => w[5] === 2 || w[5] === 3)) {
      items.push(`<p class="note-box w-kjv"><strong>This whole verse is not in the oldest Greek manuscripts.</strong> It is in the Textus Receptus used for the KJV. Many modern translations leave it out or put it in brackets or a footnote.</p>`);
    } else if (kjvOnly) {
      items.push(`<p class="note-box w-kjv"><strong>In the KJV’s Greek text but not the oldest manuscripts:</strong> “${escapeHtml(kjvOnly)}”</p>`);
    }
    if (modernOnly) items.push(`<p class="note-box w-modern"><strong>In the oldest manuscripts but not the KJV’s Greek text:</strong> “${escapeHtml(modernOnly)}”</p>`);
  } else {
    const other = group(1);
    if (other) items.push(`<p class="note-box w-other"><strong>Found in other ancient sources</strong> (such as the Greek Septuagint, the Dead Sea Scrolls or the Samaritan Pentateuch) <strong>but not in the standard Hebrew text:</strong> “${escapeHtml(other)}”. Some modern translations include these words.</p>`);
  }
  for (const n of notes) items.push(`<p class="small muted">Note: ${escapeHtml(n)}</p>`);
  return items.length ? items.join('') : '<p class="muted small">No differences that affect translation are recorded for this verse.</p>';
}

/** Verse study page: compare translations, read the original, see manuscript differences. */
export async function renderVersePage(main, book, chapter, verseSpec, currentId, commentary = {}) {
  main.innerHTML = '<div class="loading">Loading…</div>';
  const verses = String(verseSpec)
    .split(',')
    .flatMap((part) => {
      const [a, b] = part.split('-').map(Number);
      return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
    })
    .filter((v) => v > 0)
    .slice(0, 30);
  const [list, original, xrefs] = await Promise.all([loadTranslationList(), loadOriginal(book), loadCrossRefs(book).catch(() => [])]);
  const translations = await Promise.all(list.map((t) => loadTranslation(t.id)));
  const ref = formatReference(book, chapter, verses);
  document.title = `${ref} — Study`;
  const lang = original.lang;
  const currentBible = translations[Math.max(0, list.findIndex((t) => t.id === currentId))];
  const namesIn = async (words) => {
    const seen = new Map();
    for (const w of words) for (const r of await namesForStrong(w[3]).catch(() => [])) seen.set(r[0], r);
    return [...seen.values()];
  };
  const verseNames = await Promise.all(verses.map((v) => namesIn(original.chapters[chapter - 1][v - 1]?.w || [])));
  const sections = verses
    .map((v, idx) => [v, idx])
    .filter(([v]) => v <= translations[0].books[book][chapter - 1].length)
    .map(([v, idx]) => {
      const o = original.chapters[chapter - 1][v - 1];
      const compare = translations
        .map((t, i) => {
          const text = t.books[book][chapter - 1][v - 1];
          return `<div class="compare-row${list[i].id === currentId ? ' current' : ''}"><span class="t-abbr" title="${escapeHtml(list[i].name)}">${list[i].abbr}</span><span class="t-text">${text ? escapeHtml(text) : `<em class="muted">Not included in the ${list[i].abbr}.</em>`}</span></div>`;
        })
        .join('');
      return `
        <section class="card verse-study" data-verse="${v}">
          <div class="row"><h2 style="margin:0">${formatReference(book, chapter, [v])}</h2><span class="spacer"></span><a class="btn btn-small" href="${readHref(book, chapter, v)}">Read in context</a></div>
          <h3>Compare translations</h3>
          <div class="compare">${compare}</div>
          <h3>Related verses</h3>
          ${crossRefListHtml(currentBible, xrefs[chapter - 1]?.[v - 1] || [], 6)}
          <h3>Original ${lang === 'hbo' ? 'Hebrew' : 'Greek'}</h3>
          <p class="original-line" ${lang === 'hbo' ? 'dir="rtl" lang="he"' : 'lang="grc"'}>${o.w.map((w) => `<span class="${STATUS[w[5]]?.cls || ''}">${escapeHtml(w[0])}</span>`).join(' ')}</p>
          ${interlinearHtml(o.w, lang)}
          ${interlinearLegend(lang)}
          ${verseNames[idx].length ? `<h3>People & places</h3><div class="rel-items">${verseNames[idx].map((r) => `<a class="chip-link" href="${nameHref(r[0])}" title="${escapeHtml(r[3])}">${escapeHtml(r[1])} <span class="muted small">${escapeHtml(typeLabel(r))}</span></a>`).join('')}</div>` : ''}
          <h3>Manuscript differences</h3>
          ${differenceSummary(o.w, lang, o.n)}
        </section>`;
    })
    .join('');
  main.innerHTML = `
    <p><a href="${readHref(book, chapter, verses[0])}">← Back to ${escapeHtml(formatReference(book, chapter))}</a></p>
    <h1>${escapeHtml(ref)}</h1>
    ${sections}
    <section class="card commentary"><h2 style="margin-top:0">Commentary</h2><div id="verse-commentary"><div class="loading">Loading…</div></div></section>
    <p class="small muted"><a href="#/study/about">Why do translations and manuscripts differ?</a></p>`;
  renderCommentaryPanel(document.getElementById('verse-commentary'), book, chapter, verses, commentary.preferred, commentary.choose).catch(() => {});
  bindMoreButtons(main, currentBible, (btn) => xrefs[chapter - 1][Number(btn.closest('[data-verse]').dataset.verse) - 1]);
  wordContext.lookup = (btn) => {
    const v = Number(btn.closest('[data-verse]').dataset.verse);
    return { word: original.chapters[chapter - 1][v - 1].w[Number(btn.dataset.word)], lang };
  };
}

/* ---------- Study home: dictionary, differences browser, about ---------- */

export async function renderStudyHome(main, tab, params) {
  document.title = 'Study — Bible';
  const tabs = [['dictionary', 'Hebrew & Greek'], ['people', 'People & places'], ['topics', 'Topics'], ['bible-dictionary', 'Bible dictionary'], ['differences', 'Manuscripts'], ['about', 'About']];
  main.innerHTML = `
    <h1>Study</h1>
    <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<a role="tab" class="tab-link" aria-selected="${id === tab}" href="#/study/${id}">${label}</a>`).join('')}</div>
    <div id="study-panel"><div class="loading">Loading…</div></div>`;
  const panel = document.getElementById('study-panel');
  if (tab === 'about') panel.innerHTML = ABOUT_HTML;
  else if (tab === 'people') await renderNamesHome(panel, params);
  else if (tab === 'topics') await renderTopicsHome(panel, params);
  else if (tab === 'bible-dictionary') await renderDictionaryHome(panel, params);
  else if (tab === 'differences') await renderDifferences(panel, params);
  else await renderDictionary(panel, params);
}

async function renderDictionary(panel, params) {
  const q = params.get('q') || '';
  panel.innerHTML = `
    <form class="search-form" id="dict-form" role="search">
      <input id="dict-q" type="search" name="q" value="${escapeHtml(q)}" placeholder="English word, Hebrew/Greek word, or Strong’s number (e.g. love, agape, G26)" aria-label="Search the dictionary" autocomplete="off">
    </form>
    <div id="dict-results"></div>`;
  const form = document.getElementById('dict-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    location.hash = `#/study/dictionary?q=${encodeURIComponent(form.q.value.trim())}`;
  };
  const results = document.getElementById('dict-results');
  if (!q) {
    document.getElementById('dict-q').focus();
    const examples = [['love', 'love'], ['G26', 'agapē (love)'], ['H2617', 'chesed (steadfast love)'], ['G5485', 'charis (grace)'], ['H7965', 'shalom (peace)'], ['G4102', 'pistis (faith)'], ['H3068', 'YHWH (the LORD)'], ['G3056', 'logos (word)']];
    results.innerHTML = `
      <div class="card">
        <p>The dictionary covers every Hebrew, Aramaic and Greek word in the Bible. Each entry gives its meaning, how translators render it, and every verse where it appears.</p>
        <p class="muted small">Try:</p>
        <div class="row">${examples.map(([k, l]) => `<a class="btn btn-small" href="${/^[HG]\d/.test(k) ? wordHref(k) : `#/study/dictionary?q=${k}`}">${escapeHtml(l)}</a>`).join('')}</div>
        <p class="muted small" style="margin-top:14px">You can also switch the reader to <strong>Original</strong> mode and tap any word.</p>
      </div>`;
    return;
  }
  const index = await loadLexiconIndex();
  const hits = searchLexicon(index, q);
  results.innerHTML = hits.length
    ? hits
        .map(([key, lemma, translit, gloss, n]) => `<a class="result dict-result" href="${wordHref(key)}">
            <strong><span lang="${key[0] === 'H' ? 'he' : 'grc'}" class="dict-lemma">${escapeHtml(lemma)}</span> · ${escapeHtml(translit)} <span class="muted small">${key} ${n ? `· ${n}×` : ''}</span></strong>
            <span>${escapeHtml(gloss)}</span></a>`)
        .join('')
    : '<div class="empty">No dictionary entries found. Try a simpler English word, or a Strong’s number like H430 or G26.</div>';
}

const LONG_PASSAGES = [
  { book: 40, chapter: 16, verses: '9-20', title: 'The longer ending of Mark (Mark 16:9–20)', text: 'Missing from the two oldest complete manuscripts (Codex Sinaiticus and Vaticanus, 4th century), but found in most later manuscripts. Most modern Bibles print it with a note.' },
  { book: 42, chapter: 8, verses: '1-11', title: 'The woman caught in adultery (John 7:53–8:11)', text: 'Not found in the earliest manuscripts of John, and placed in different spots in some later ones. Most modern Bibles print it in brackets with a note.' },
];

async function renderDifferences(panel, params) {
  const variants = await loadVariants();
  const name = (r) => formatReference(r[0], r[1], [r[2]]);
  const link = (r) => studyVerseHref(r[0], r[1], r[2]);
  const inLong = (r) => (r[0] === 40 && r[1] === 16 && r[2] >= 9) || (r[0] === 42 && ((r[1] === 7 && r[2] === 53) || (r[1] === 8 && r[2] <= 11)));
  const whole = variants.filter((x) => x.whole && !inLong(x.r));
  const nt = variants.filter((x) => x.r[0] >= 39 && !x.whole && x.k + x.m > 0);
  const ot = variants.filter((x) => x.r[0] < 39);
  const largest = [...nt].sort((a, b) => b.k + b.m - (a.k + a.m)).slice(0, 15);
  const bookFilter = params.get('book');
  const byBook = bookFilter !== null && bookFilter !== '' ? nt.filter((x) => x.r[0] === Number(bookFilter)) : [];
  const ntBooks = [...new Set(nt.map((x) => x.r[0]))];
  const item = (x, extra = '') => `<a class="result" href="${link(x.r)}"><strong>${name(x.r)}</strong><span class="small">${extra || escapeHtml(x.n?.[0] || describeCounts(x))}</span></a>`;
  panel.innerHTML = `
    <div class="card">
      <p>The Bible was copied by hand for centuries, so manuscripts differ in places. The KJV (1611) was translated from the <strong>Textus Receptus</strong>, a Greek text based on the manuscripts available in the 1500s. Modern translations mostly use older manuscripts discovered later. Most differences are small (spelling, word order, “Jesus” vs “he”). The ones below change the wording of a translation.</p>
      <p class="small"><a href="#/study/about">Learn more about the texts →</a></p>
    </div>
    <h2>Verses not in the oldest manuscripts</h2>
    <p class="muted small">These verses are in the KJV but missing or footnoted in many modern translations (BSB, ASV, WEB).</p>
    ${whole.map((x) => item(x, 'Whole verse found only in later manuscripts')).join('')}
    <h2>Longer passages</h2>
    ${LONG_PASSAGES.map((p) => `<a class="result" href="${studyVerseHref(p.book, p.chapter, p.verses)}"><strong>${p.title}</strong><span class="small">${p.text}</span></a>`).join('')}
    <h2>Largest differences within verses</h2>
    ${largest.map((x) => item(x)).join('')}
    <h2>Browse by book</h2>
    <p class="muted small">${nt.length} New Testament verses have differences that affect translation.</p>
    <select id="variant-book" class="picker-filter" aria-label="Choose a book">
      <option value="">Choose a New Testament book…</option>
      ${ntBooks.map((b) => `<option value="${b}" ${String(b) === bookFilter ? 'selected' : ''}>${BOOKS[b].name} (${nt.filter((x) => x.r[0] === b).length})</option>`).join('')}
    </select>
    ${byBook.map((x) => item(x)).join('')}
    <h2>Old Testament: words from other ancient sources</h2>
    <p class="muted small">Places where ancient versions such as the Septuagint or Dead Sea Scrolls contain words not in the standard Hebrew (Masoretic) text.</p>
    ${ot.map((x) => item(x, `${x.x} extra word${x.x === 1 ? '' : 's'} in other ancient sources`)).join('')}`;
  document.getElementById('variant-book').onchange = (e) => {
    location.hash = `#/study/differences?book=${e.target.value}`;
  };
}

function describeCounts(x) {
  const parts = [];
  if (x.k) parts.push(`${x.k} word${x.k === 1 ? '' : 's'} only in the KJV’s text`);
  if (x.m) parts.push(`${x.m} word${x.m === 1 ? '' : 's'} only in older manuscripts`);
  return parts.join(' · ');
}

const ABOUT_HTML = `
  <div class="card prose">
    <h2 style="margin-top:0">How the Bible was written</h2>
    <p>The <strong>Old Testament</strong> was written mostly in <strong>Hebrew</strong>, with a few chapters in <strong>Aramaic</strong> (parts of Daniel and Ezra). The <strong>New Testament</strong> was written in <strong>Koine Greek</strong>, the everyday Greek of the first century.</p>
    <p>Switch the reader to <strong>Original</strong> to see every verse word by word in Hebrew or Greek, with a transliteration (how it sounds), a literal English meaning and its Strong’s number. Tap any word for its dictionary entry and every verse where it is used.</p>
  </div>
  <div class="card prose">
    <h2 style="margin-top:0">The manuscripts</h2>
    <p><strong>Old Testament.</strong> The standard Hebrew text is the <em>Masoretic Text</em>, carefully preserved by Jewish scribes. The oldest complete copy is the Leningrad Codex (AD 1008). The <em>Dead Sea Scrolls</em> (about 250 BC–AD 70) and the <em>Septuagint</em> (a Greek translation from the 3rd–2nd centuries BC) mostly agree with it, but sometimes have extra or different words.</p>
    <p><strong>New Testament.</strong> More than 5,000 Greek manuscripts survive. The KJV translators (1611) used the <em>Textus Receptus</em> (“received text”), edited from manuscripts available in the 1500s. Since then, much older manuscripts have been found, such as Codex Sinaiticus and Codex Vaticanus (4th century) and early papyri. Most modern translations use a <em>critical text</em> (Nestle-Aland / UBS) built from these.</p>
    <p>Most differences are minor: spelling, word order, or small words. A small number of verses and two longer passages (Mark 16:9–20 and John 7:53–8:11) are absent from the oldest manuscripts. Christians hold different views: some prefer the traditional text, others the older manuscripts. This app shows both, so you can see exactly what differs.</p>
  </div>
  <div class="card prose">
    <h2 style="margin-top:0">The translations in this app</h2>
    <ul>
      <li><strong>KJV</strong>, King James Version (1611): traditional and majestic, from the Textus Receptus.</li>
      <li><strong>WEB</strong>, World English Bible: modern English, public domain.</li>
      <li><strong>BSB</strong>, Berean Standard Bible: modern, accurate and readable.</li>
      <li><strong>YLT</strong>, Young’s Literal Translation (1898): very literal; keeps the original word order and tenses where possible. It is the closest English to “how it was written”.</li>
      <li><strong>ASV</strong>, American Standard Version (1901): formal and literal, based on older manuscripts than the KJV.</li>
    </ul>
    <p>Verse numbers occasionally differ between translations. For example, the ASV divides 1 John 5:6–8 differently from the KJV, so a comparison may show the neighbouring sentence.</p>
    <p>Some translations put words in <em>italics or brackets</em> when they are not in the original but are needed for good English. The interlinear marks such words like this: “&lt;the&gt;” (in the original but not translated) or “[is]” (added for English).</p>
  </div>
  <div class="card prose small">
    <h2 style="margin-top:0">Sources</h2>
    <p>Hebrew and Greek texts, glosses, grammar, manuscript data, lexicons and the people & places dictionary come from <a href="https://github.com/STEPBible/STEPBible-Data" target="_blank" rel="noopener">STEPBible.org</a> (Tyndale House, Cambridge), licensed CC BY 4.0. They are reformatted for this app. English glosses are based on the Berean Study Bible. STEPBible adapted the people & places summaries from AI-generated text.</p>
    <p>Topics come from Nave’s Topical Bible (1896) via <a href="https://github.com/BradyStephenson/bible-data" target="_blank" rel="noopener">BibleData</a> (CC BY 4.0). Bible dictionary articles are Easton’s (1897) and Smith’s (1863), via <a href="https://github.com/neuu-org/bible-dictionary-dataset" target="_blank" rel="noopener">NEUU</a> (CC BY 4.0). Commentaries are Matthew Henry and Jamieson, Fausset & Brown (public domain).</p>
    <p>Cross references come from <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noopener">OpenBible.info</a> (CC BY), ranked by reader votes.</p>
    <p>Map locations come from <a href="https://www.openbible.info/geo/" target="_blank" rel="noopener">OpenBible.info</a> via STEPBible. Many ancient sites are uncertain. Translations are in the public domain.</p>
  </div>`;
