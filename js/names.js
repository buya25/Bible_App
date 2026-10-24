// People & places dictionary (from STEPBible's TIPNR: every named person, place and thing in the Bible).
import { formatReference } from './bible.js';
import { load, unpackRef } from './data.js';
import { escapeHtml, readHref } from './util.js';

// Index rows: [id, name, kind, brief, mentions, altNames ("a|b"), strongs ("H0085|G0011"), type, anonymous (0/1)]

export const loadNamesIndex = () => load('data/names/index.json');
export const nameChunk = (id) => (/^[a-z]/i.test(id) ? id[0].toUpperCase() : '_');
export const loadNameEntry = async (id) => (await load(`data/names/${nameChunk(id)}.json`))[id] || null;
export const nameHref = (id) => `#/study/name/${encodeURIComponent(id)}`;

const KIND_LABEL = { person: 'Person', place: 'Place', other: 'Other' };
const TYPE_LABEL = { Male: 'Man', Female: 'Woman', Group: 'People group', Place: 'Place', Supernatural: 'Spiritual being', Time: 'Time / festival', Musical: 'Musical term', Title: 'Title', Star: 'Star', Other: 'Other', Language: 'Language' };
export const typeLabel = (row) => TYPE_LABEL[row[7]] || KIND_LABEL[row[2]] || '';

/**
 * Search people & places by name or alternative name. kind: 'all' | 'person' | 'place' | 'other'.
 * Exact name matches first, then other names, then prefixes, then descriptions; most mentioned first.
 */
export function searchNames(index, query, { kind = 'all', limit = 80 } = {}) {
  const q = query.trim().toLowerCase();
  const rows = kind === 'all' ? index : index.filter((r) => r[2] === kind);
  if (!q) return [];
  const scored = [];
  for (const r of rows) {
    const name = r[1].toLowerCase();
    const alts = r[5] ? r[5].toLowerCase().split('|') : [];
    let score = 0;
    if (name === q) score = 5;
    else if (alts.includes(q)) score = 4;
    else if (name.startsWith(q)) score = 3;
    else if (alts.some((a) => a.startsWith(q))) score = 2;
    else if (q.length > 3 && !r[8] && r[3].toLowerCase().includes(q)) score = 1;
    if (score) scored.push([score, r]);
  }
  scored.sort((a, b) => b[0] - a[0] || b[1][4] - a[1][4]);
  return scored.slice(0, limit).map((s) => s[1]);
}

let strongMap = null;
/** People/places whose name in the original text has this Strong's number. */
export async function namesForStrong(strong) {
  strongMap ??= namesByStrong(await loadNamesIndex());
  return strongMap.get(strong) || [];
}

/** Map of Strong's number → index rows, used to recognise names in the original text. */
export function namesByStrong(index) {
  const map = new Map();
  for (const r of index) {
    for (const s of r[6] ? r[6].split('|') : []) {
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(r);
    }
  }
  return map;
}

export const nameRowHtml = (r) => `
  <a class="result name-result" href="${nameHref(r[0])}">
    <strong>${escapeHtml(r[1])} <span class="type-chip type-${r[2]}">${escapeHtml(typeLabel(r))}</span>${r[4] ? `<span class="muted small"> · ${r[4]} verse${r[4] === 1 ? '' : 's'}</span>` : ''}</strong>
    <span class="small">${escapeHtml(r[3])}${r[5] ? `<span class="muted"> · also ${escapeHtml(r[5].split('|').slice(0, 4).join(', '))}</span>` : ''}</span>
  </a>`;

/* ---------- Browse / search ---------- */

export async function renderNamesHome(panel, params) {
  const q = params.get('q') || '';
  const kind = params.get('kind') || 'all';
  const letter = params.get('letter') || '';
  const href = (over) => {
    const p = new URLSearchParams({ q, kind, letter, ...over });
    for (const [k, v] of [...p]) if (!v || (k === 'kind' && v === 'all')) p.delete(k);
    return `#/study/people?${p}`;
  };
  panel.innerHTML = `
    <form class="search-form" id="names-form" role="search">
      <input type="search" name="q" value="${escapeHtml(q)}" placeholder="Search people, places and more (e.g. Ruth, Bethlehem)" aria-label="Search people and places" autocomplete="off">
    </form>
    <div class="tabs" role="group" aria-label="Filter">
      ${[['all', 'All'], ['person', 'People'], ['place', 'Places'], ['other', 'Other']].map(([k, l]) => `<a class="tab-link" aria-selected="${k === kind}" href="${href({ kind: k })}">${l}</a>`).join('')}
    </div>
    <div class="alphabet" aria-label="Browse by letter">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `<a href="${href({ letter: l === letter ? '' : l, q: '' })}" ${l === letter ? 'aria-current="true"' : ''}>${l}</a>`).join('')}</div>
    <div id="names-results"><div class="loading">Loading…</div></div>`;
  const form = document.getElementById('names-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    location.hash = href({ q: form.q.value.trim(), letter: '' });
  };
  const index = await loadNamesIndex();
  const results = document.getElementById('names-results');
  const ofKind = (r) => !r[8] && (kind === 'all' || r[2] === kind);
  let rows;
  let heading = '';
  if (q) {
    rows = searchNames(index, q, { kind });
    heading = `${rows.length} result${rows.length === 1 ? '' : 's'} for “${escapeHtml(q)}”`;
  } else if (letter) {
    rows = index.filter((r) => ofKind(r) && r[1].toUpperCase().startsWith(letter));
    heading = `${rows.length} entries starting with ${letter}`;
  } else {
    rows = index.filter(ofKind).sort((a, b) => b[4] - a[4]).slice(0, 40);
    heading = 'Most mentioned';
  }
  const counts = { person: 0, place: 0, other: 0 };
  index.forEach((r) => counts[r[2]]++);
  results.innerHTML = `
    ${!q && !letter ? `<p class="muted small">${counts.person.toLocaleString()} people, ${counts.place.toLocaleString()} places and ${counts.other} other names (spiritual beings, months, festivals, titles), each with a description, family links and every verse where they appear.</p>` : ''}
    <h2>${heading}</h2>
    ${rows.length ? rows.map(nameRowHtml).join('') : '<div class="empty">Nothing found. Try another spelling. Many names have several forms (e.g. Abram/Abraham, Saul/Paul).</div>'}`;
}

/* ---------- Entry page ---------- */

const RELATIONS = {
  parents: 'Parents',
  siblings: 'Brothers & sisters',
  partners: 'Married to',
  children: 'Children',
  founders: 'Founded by',
  residents: 'People who lived here',
};
const NOTE = { descendant: 'ancestor of a people', ancestor: 'ancestor', founder: 'founder', uncertain: 'uncertain' };

export async function renderNamePage(main, id, bible, abbr) {
  main.innerHTML = '<div class="loading">Loading…</div>';
  const [entry, index] = await Promise.all([loadNameEntry(id), loadNamesIndex()]);
  if (!entry) {
    main.innerHTML = `<div class="empty">Entry not found. <a href="#/study/people">Back to people & places</a></div>`;
    return;
  }
  document.title = `${entry.n} — People & places`;
  const byId = new Map(index.map((r) => [r[0], r]));
  const row = byId.get(id);
  const relLink = ([rid, note]) => {
    const r = byId.get(rid);
    const name = r ? r[1] : rid.split('@')[0];
    return `<a class="chip-link" href="${nameHref(rid)}" title="${escapeHtml(r?.[3] || '')}">${escapeHtml(name)}${note ? ` <span class="muted small">(${NOTE[note] || note})</span>` : ''}</a>`;
  };
  const relations = Object.entries(entry.rel || {})
    .map(([key, ids]) => `<div class="rel-row"><span class="rel-label">${RELATIONS[key] || key}</span><div class="rel-items">${ids.map(relLink).join('')}</div></div>`)
    .join('');
  const names = entry.names
    .map(([name, orig, strong]) => {
      const lang = strong[0] === 'G' ? 'grc' : 'he';
      const label = `${escapeHtml(name)} <span lang="${lang}" ${lang === 'he' ? 'dir="rtl"' : ''}>${escapeHtml(orig)}</span>`;
      return strong ? `<a class="chip-link" href="#/study/word/${escapeHtml(strong)}" title="Word study ${escapeHtml(strong)}">${label}</a>` : `<span class="chip-link">${label}</span>`;
    })
    .join('');
  const [lat, lon] = entry.geo || [];
  const geo = entry.geo
    ? `<div class="rel-row"><span class="rel-label">Location</span><div class="rel-items"><a class="chip-link" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=10/${lat}/${lon}" target="_blank" rel="noopener">View on map ↗</a><span class="muted small">${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}${entry.area ? ` · ${escapeHtml(entry.area)}` : ''}</span></div></div>`
    : entry.area
      ? `<div class="rel-row"><span class="rel-label">Region</span><div class="rel-items">${escapeHtml(entry.area)}</div></div>`
      : '';
  const refs = entry.r.map(unpackRef);
  const PAGE = 30;
  const list = (n) =>
    refs
      .slice(0, n)
      .map(({ book, chapter, verse }) => `<a class="result" href="${readHref(book, chapter, verse)}"><strong>${formatReference(book, chapter, [verse])}</strong><span>${escapeHtml(bible.books[book]?.[chapter - 1]?.[verse - 1] || '')}</span></a>`)
      .join('');

  main.innerHTML = `
    <p><a href="#/study/people">← People & places</a></p>
    <section class="card">
      <div class="row"><h1 style="margin:0">${escapeHtml(entry.n)}</h1><span class="type-chip type-${entry.k}">${escapeHtml(row ? typeLabel(row) : entry.t)}</span></div>
      ${entry.b ? `<p class="lemma-gloss"><strong>${escapeHtml(entry.b)}</strong></p>` : ''}
      ${entry.d && entry.d !== entry.n ? `<p class="muted small">${escapeHtml(entry.d)}${entry.tribe ? ` · ${escapeHtml(entry.tribe)}` : ''}</p>` : entry.tribe ? `<p class="muted small">${escapeHtml(entry.tribe)}</p>` : ''}
      ${geo || relations || names ? `<div class="relations">
        ${names ? `<div class="rel-row"><span class="rel-label">Name in the original</span><div class="rel-items">${names}</div></div>` : ''}
        ${geo}${relations}</div>` : ''}
      ${entry.geo ? '<div class="map map-small" id="place-map"></div>' : ''}
    </section>
    ${entry.a || entry.s ? `<section class="card prose article">
      <h3 style="margin-top:0">About ${escapeHtml(entry.n)}</h3>
      ${entry.a || entry.s}
      <p class="muted small ai-note">Summary by STEPBible.org, adapted from AI-generated text. Check it against the verses below.</p>
    </section>` : ''}
    <section>
      <h2>Mentioned in ${refs.length} verse${refs.length === 1 ? '' : 's'}</h2>
      <p class="muted small">Verses shown in the ${escapeHtml(abbr)}. The name may be spelled differently in some translations.</p>
      <div id="name-refs">${list(PAGE) || '<div class="empty">No verse references recorded.</div>'}</div>
      ${refs.length > PAGE ? `<p><button class="btn" id="more-name-refs">Show all ${refs.length} verses</button></p>` : ''}
    </section>`;
  const mapEl = document.getElementById('place-map');
  if (mapEl) import('./maps.js').then((m) => m.drawPlaceMap(mapEl, id)).catch(() => mapEl.remove());
  const more = document.getElementById('more-name-refs');
  if (more) {
    more.onclick = () => {
      document.getElementById('name-refs').innerHTML = list(refs.length);
      more.remove();
    };
  }
}
