// Cross references between related verses (OpenBible.info, ranked by votes).
import { BOOKS, formatReference } from './bible.js';
import { load, unpackRef } from './data.js';
import { escapeHtml, readHref } from './util.js';

export const loadCrossRefs = (book) => load(`data/crossrefs/${book}.json`);

/** Related passages for a verse, strongest first. Each target is a packed ref or [start, end]. */
export async function crossRefsFor(book, chapter, verse) {
  const data = await loadCrossRefs(book);
  return data[chapter - 1]?.[verse - 1] || [];
}

/** { start, end, label } for a target; end is null for a single verse. */
export function describeTarget(target, { short = false } = {}) {
  const start = unpackRef(Array.isArray(target) ? target[0] : target);
  const end = Array.isArray(target) ? unpackRef(target[1]) : null;
  const name = short ? BOOKS[start.book].abbr : BOOKS[start.book].name;
  let label = `${name} ${start.chapter}:${start.verse}`;
  if (end && end.chapter === start.chapter) label += `-${end.verse}`;
  else if (end) label += `–${end.chapter}:${end.verse}`;
  return { start, end, label };
}

/** Text of a target passage, limited to a few verses. */
export function targetText(bible, target, maxVerses = 3) {
  const { start, end } = describeTarget(target);
  const out = [];
  let { chapter, verse } = start;
  const last = end || start;
  while (out.length < maxVerses && (chapter < last.chapter || (chapter === last.chapter && verse <= last.verse))) {
    const verses = bible.books[start.book][chapter - 1];
    if (verse > verses.length) {
      chapter++;
      verse = 1;
      continue;
    }
    if (verses[verse - 1]) out.push(verses[verse - 1]);
    verse++;
  }
  const truncated = chapter < last.chapter || (chapter === last.chapter && verse <= last.verse);
  return out.join(' ') + (truncated ? ' …' : '');
}

const resultHtml = (bible, target) => {
  const { start, label } = describeTarget(target);
  return `<a class="result" href="${readHref(start.book, start.chapter, start.verse)}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(targetText(bible, target))}</span></a>`;
};

/** List of related verses with their text; shows `limit` and a button for the rest. */
export function crossRefListHtml(bible, targets, limit = 10) {
  if (!targets.length) return '<p class="muted small">No cross references for this verse.</p>';
  return `<div class="xref-list">${targets.slice(0, limit).map((t) => resultHtml(bible, t)).join('')}</div>
    ${targets.length > limit ? `<button class="btn btn-small" data-more-xrefs="${limit}">Show all ${targets.length}</button>` : ''}`;
}

/** Wire up "Show all" buttons rendered by crossRefListHtml inside `root`. */
export function bindMoreButtons(root, bible, targetsFor) {
  root.querySelectorAll('[data-more-xrefs]').forEach((btn) => {
    btn.onclick = () => {
      const list = btn.previousElementSibling;
      const targets = targetsFor(btn);
      list.innerHTML = targets.map((t) => resultHtml(bible, t)).join('');
      btn.remove();
    };
  });
}

/** Compact inline links shown under a verse in the reader (top few). */
export const inlineCrossRefsHtml = (targets, count = 4) =>
  targets.length
    ? `<span class="xrefs">${targets
        .slice(0, count)
        .map((t) => {
          const { start, label } = describeTarget(t, { short: true });
          return `<a href="${readHref(start.book, start.chapter, start.verse)}">${escapeHtml(label)}</a>`;
        })
        .join(' · ')}${targets.length > count ? ` <button class="xref-more" data-xref-more aria-label="Show all ${targets.length} related verses">+${targets.length - count}</button>` : ''}</span>`
    : '';

/** Dialog listing cross references for the selected verses. */
export async function openCrossRefsDialog(dialog, bible, book, chapter, verses, abbr) {
  const ref = formatReference(book, chapter, verses);
  dialog.innerHTML = `<div class="dialog-head"><h2>Related verses · ${escapeHtml(ref)}</h2><button class="btn btn-small" data-close>Close</button></div><div class="dialog-body"><div class="loading">Loading…</div></div>`;
  dialog.onclick = (e) => {
    if (e.target === dialog || e.target.closest('[data-close]') || e.target.closest('a[href]')) dialog.close();
  };
  dialog.oninput = dialog.onchange = null;
  if (!dialog.open) dialog.showModal();
  let lists;
  try {
    lists = await Promise.all(verses.map((v) => crossRefsFor(book, chapter, v)));
  } catch {
    dialog.querySelector('.dialog-body').innerHTML = '<p class="muted">Could not load cross references. Check your connection.</p>';
    return;
  }
  const body = dialog.querySelector('.dialog-body');
  if (!body) return;
  body.innerHTML = `${verses
    .map((v, i) => `<section data-verse="${v}">${verses.length > 1 ? `<h3>${escapeHtml(formatReference(book, chapter, [v]))}</h3>` : ''}${crossRefListHtml(bible, lists[i], 12)}</section>`)
    .join('')}
    <p class="muted small">Ranked by how many people found each link helpful. Verses shown in the ${escapeHtml(abbr)}. Cross references from OpenBible.info (CC BY).</p>`;
  bindMoreButtons(body, bible, (btn) => lists[verses.indexOf(Number(btn.closest('[data-verse]').dataset.verse))]);
}
