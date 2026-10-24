// Nave's Topical Bible and Easton's/Smith's Bible dictionaries.
import { load } from './data.js';
import { describeTarget, targetText } from './crossrefs.js';
import { commentaryHtml } from './commentary.js';
import { escapeHtml, readHref } from './util.js';
import { loadNamesIndex, nameHref, typeLabel } from './names.js';

// Topic index rows: [slug, name, verseCount]; dictionary index rows: [slug, name, firstSentence]
export const loadTopicsIndex = () => load('data/topics/index.json');
export const loadDictionaryIndex = () => load('data/dictionary/index.json');
const chunk = (slug) => (/^[a-z]/.test(slug) ? slug[0] : '_');
export const loadTopic = async (slug) => (await load(`data/topics/${chunk(slug)}.json`))[slug] || null;
export const loadDictionaryEntry = async (slug) => (await load(`data/dictionary/${chunk(slug)}.json`))[slug] || null;
export const topicHref = (slug) => `#/study/topic/${slug}`;
export const entryHref = (slug) => `#/study/entry/${slug}`;

const SOURCES = { EAS: "Easton's Bible Dictionary (1897)", SMI: "Smith's Bible Dictionary (1863)" };

/** Rank index rows by name: exact, then starts-with, then a word inside the name. */
export function searchByName(index, query, limit = 60) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const row of index) {
    const name = row[1].toLowerCase();
    let score = 0;
    if (name === q) score = 3;
    else if (name.startsWith(q)) score = 2;
    else if (name.split(/[\s,()-]+/).some((w) => w.startsWith(q))) score = 1;
    if (score) scored.push([score, row]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1][1].length - b[1][1].length);
  return scored.slice(0, limit).map((s) => s[1]);
}

function searchPanel(panel, { tab, placeholder, q, letter }) {
  const href = (over) => {
    const p = new URLSearchParams({ q, letter, ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `#/study/${tab}?${p}`;
  };
  panel.innerHTML = `
    <form class="search-form" id="ref-form" role="search">
      <input type="search" name="q" value="${escapeHtml(q)}" placeholder="${escapeHtml(placeholder)}" aria-label="Search" autocomplete="off">
    </form>
    <div class="alphabet" aria-label="Browse by letter">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `<a href="${href({ letter: l === letter ? '' : l, q: '' })}" ${l === letter ? 'aria-current="true"' : ''}>${l}</a>`).join('')}</div>
    <div id="ref-results"><div class="loading">Loading…</div></div>`;
  const form = document.getElementById('ref-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    location.hash = href({ q: form.q.value.trim(), letter: '' });
  };
  return document.getElementById('ref-results');
}

/* ---------- Topics ---------- */

export const topicRowHtml = (r) => `<a class="result" href="${topicHref(r[0])}"><strong>${escapeHtml(r[1])}</strong><span class="small muted ui">${r[2]} verse${r[2] === 1 ? '' : 's'}</span></a>`;

const POPULAR_TOPICS = ['faith', 'love', 'prayer', 'forgiveness', 'grace', 'hope', 'peace', 'joy', 'fear', 'anxiety', 'repentance', 'salvation', 'holy-spirit', 'humility', 'patience', 'wisdom', 'marriage', 'money', 'suffering', 'temptation'];

export async function renderTopicsHome(panel, params) {
  const q = params.get('q') || '';
  const letter = params.get('letter') || '';
  const results = searchPanel(panel, { tab: 'topics', placeholder: 'Search topics (e.g. forgiveness, prayer, marriage)', q, letter });
  const index = await loadTopicsIndex();
  if (q || letter) {
    const rows = q ? searchByName(index, q) : index.filter((r) => r[1].toUpperCase().startsWith(letter));
    results.innerHTML = rows.length ? rows.map(topicRowHtml).join('') : '<div class="empty">No topics found. Try a simpler word.</div>';
    return;
  }
  const bySlug = new Map(index.map((r) => [r[0], r]));
  results.innerHTML = `
    <p class="muted small">Nave’s Topical Bible (1896): ${index.length.toLocaleString()} subjects, each with the verses that speak about it, grouped by theme.</p>
    <h2>Popular topics</h2>
    <div class="rel-items">${POPULAR_TOPICS.filter((s) => bySlug.has(s)).map((s) => `<a class="chip-link" href="${topicHref(s)}">${escapeHtml(bySlug.get(s)[1])}</a>`).join('')}</div>`;
}

export async function renderTopicPage(main, slug, bible, abbr) {
  main.innerHTML = '<div class="loading">Loading…</div>';
  const topic = await loadTopic(slug);
  if (!topic) {
    main.innerHTML = '<div class="empty">Topic not found. <a href="#/study/topics">Back to topics</a></div>';
    return;
  }
  document.title = `${topic.n} — Topics`;
  const all = topic.l.flatMap((l) => l.r || []);
  const lines = topic.l
    .map((l, i) => {
      const pad = `style="margin-left:${Math.min(l.d, 4) * 18}px"`;
      if (l.see) return `<div class="topic-line see" ${pad}>See ${l.see.map(([name, s]) => `<a href="${topicHref(s)}">${escapeHtml(name)}</a>`).join('; ')}</div>`;
      const chips = (l.r || [])
        .map((t) => {
          const { start, label } = describeTarget(t, { short: true });
          return `<a class="ref-chip" href="${readHref(start.book, start.chapter, start.verse)}">${escapeHtml(label)}</a>`;
        })
        .join('');
      return `<div class="topic-line" ${pad}>
        ${l.t ? `<span class="topic-label${l.r ? '' : ' heading'}">${escapeHtml(l.t)}</span>` : ''}
        ${chips ? `<div class="ref-chips">${chips}</div><button class="link-btn small" data-show-line="${i}">Read these verses</button><div class="topic-verses" data-line="${i}"></div>` : ''}
      </div>`;
    })
    .join('');
  main.innerHTML = `
    <p><a href="#/study/topics">← Topics</a></p>
    <section class="card">
      <div class="row"><h1 style="margin:0">${escapeHtml(topic.n)}</h1><span class="type-chip">Topic</span></div>
      <p class="muted small">${all.length} passage${all.length === 1 ? '' : 's'} · Nave’s Topical Bible. Verses shown in the ${escapeHtml(abbr)}.</p>
      <div id="topic-dict"></div>
      <div class="topic-lines">${lines}</div>
    </section>`;
  main.querySelectorAll('[data-show-line]').forEach((btn) => {
    btn.onclick = () => {
      const i = Number(btn.dataset.showLine);
      const box = main.querySelector(`.topic-verses[data-line="${i}"]`);
      if (box.innerHTML) {
        box.innerHTML = '';
        btn.textContent = 'Read these verses';
        return;
      }
      box.innerHTML = topic.l[i].r
        .map((t) => {
          const { start, label } = describeTarget(t);
          return `<a class="result" href="${readHref(start.book, start.chapter, start.verse)}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(targetText(bible, t))}</span></a>`;
        })
        .join('');
      btn.textContent = 'Hide verses';
    };
  });
  // Point to a Bible dictionary article on the same subject, when there is one.
  loadDictionaryIndex()
    .then((index) => {
      const match = index.find((r) => r[0] === slug || r[1].toLowerCase() === topic.n.toLowerCase());
      if (match) document.getElementById('topic-dict')?.insertAdjacentHTML('beforeend', `<p class="small">Bible dictionary: <a href="${entryHref(match[0])}">${escapeHtml(match[1])}</a></p>`);
    })
    .catch(() => {});
}

/* ---------- Bible dictionary ---------- */

export const entryRowHtml = (r) => `<a class="result" href="${entryHref(r[0])}"><strong>${escapeHtml(r[1])}</strong><span class="small ui">${escapeHtml(r[2])}</span></a>`;

export async function renderDictionaryHome(panel, params) {
  const q = params.get('q') || '';
  const letter = params.get('letter') || '';
  const results = searchPanel(panel, { tab: 'bible-dictionary', placeholder: 'Search the Bible dictionary (e.g. tabernacle, Pharisees, covenant)', q, letter });
  const index = await loadDictionaryIndex();
  if (q || letter) {
    const rows = q ? searchByName(index, q) : index.filter((r) => r[1].toUpperCase().startsWith(letter));
    results.innerHTML = rows.length ? rows.map(entryRowHtml).join('') : '<div class="empty">No entries found. Try another spelling.</div>';
    return;
  }
  const examples = ['tabernacle', 'covenant', 'pharisees', 'passover', 'sabbath', 'baptism', 'sanhedrin', 'synagogue', 'cubit', 'denarius', 'leprosy', 'samaritans'];
  const bySlug = new Map(index.map((r) => [r[0], r]));
  results.innerHTML = `
    <p class="muted small">${index.length.toLocaleString()} articles from Easton’s (1897) and Smith’s (1863) Bible dictionaries: customs, objects, places, people, measures and ideas of the Bible world.</p>
    <h2>Try</h2>
    <div class="rel-items">${examples.filter((s) => bySlug.has(s)).map((s) => `<a class="chip-link" href="${entryHref(s)}">${escapeHtml(bySlug.get(s)[1])}</a>`).join('')}</div>`;
}

export async function renderDictionaryPage(main, slug) {
  main.innerHTML = '<div class="loading">Loading…</div>';
  const entry = await loadDictionaryEntry(slug);
  if (!entry) {
    main.innerHTML = '<div class="empty">Entry not found. <a href="#/study/bible-dictionary">Back to the Bible dictionary</a></div>';
    return;
  }
  document.title = `${entry.n} — Bible dictionary`;
  main.innerHTML = `
    <p><a href="#/study/bible-dictionary">← Bible dictionary</a></p>
    <section class="card">
      <h1 style="margin-top:0">${escapeHtml(entry.n)}</h1>
      <div id="entry-links" class="rel-items"></div>
      ${entry.d.map(([src, text]) => `<div class="dict-def"><h3>${escapeHtml(SOURCES[src] || src)}</h3><div class="prose reading">${commentaryHtml(text)}</div></div>`).join('')}
      <p class="muted small">Public-domain 19th-century scholarship. Some historical and geographical details have been updated by later research.</p>
    </section>`;
  const name = entry.n.toLowerCase();
  Promise.all([loadTopicsIndex(), loadNamesIndex()])
    .then(([topics, names]) => {
      const links = document.getElementById('entry-links');
      const t = topics.find((r) => r[0] === slug || r[1].toLowerCase() === name);
      if (t) links?.insertAdjacentHTML('beforeend', `<a class="chip-link" href="${topicHref(t[0])}">Topic: ${escapeHtml(t[1])} (${t[2]} verses)</a>`);
      for (const r of names.filter((r) => !r[8] && r[1].toLowerCase() === name).slice(0, 4)) {
        links?.insertAdjacentHTML('beforeend', `<a class="chip-link" href="${nameHref(r[0])}" title="${escapeHtml(r[3])}">${escapeHtml(typeLabel(r))}: ${escapeHtml(r[3])}</a>`);
      }
    })
    .catch(() => {});
}
