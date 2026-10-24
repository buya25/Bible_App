// Timeline of Bible events and periods (BibleData chronology for the Old Testament,
// common approximate dates for the New Testament).
import { formatReference } from './bible.js';
import { load, unpackRef } from './data.js';
import { escapeHtml, readHref } from './util.js';

export const loadTimeline = () => load('data/timeline.json');

/** -1447 → "1447 BC", 30 → "AD 30". */
export const formatYear = (y) => (y < 0 ? `${-y} BC` : `AD ${y || 1}`);

export function formatSpan(start, end) {
  if (start < 0 && end < 0) return `${-start}–${-end} BC`;
  return `${formatYear(start)}–${formatYear(end)}`;
}

/** Era containing a year: eras are [startYear, name] sorted by start. */
export function eraOf(eras, year) {
  let found = eras[0];
  for (const era of eras) if (year >= era[0]) found = era;
  return found;
}

const FILTERS = [
  ['all', 'Everything'],
  ['events', 'Events'],
  ['reign', 'Kings'],
  ['judge', 'Judges'],
  ['prophet', 'Prophets'],
];

export async function renderTimeline(panel, params) {
  const filter = params.get('show') || 'all';
  const data = await loadTimeline();
  const items = [];
  if (filter === 'all' || filter === 'events') {
    for (const [year, name, ref, estimate, type] of data.events) items.push({ year, name, ref, estimate, type, kind: 'event' });
  }
  for (const [start, end, name, kind, ref, estimate] of data.spans) {
    if (filter === 'all' || filter === kind || (filter === 'events' && kind === 'period')) items.push({ year: start, end, name, ref, estimate, kind });
  }
  items.sort((a, b) => a.year - b.year || (a.kind === 'event' ? -1 : 1));
  const groups = new Map();
  for (const item of items) {
    const era = eraOf(data.eras, item.year);
    if (!groups.has(era[1])) groups.set(era[1], []);
    groups.get(era[1]).push(item);
  }
  const itemHtml = (it) => {
    const when = it.end !== undefined && it.end !== it.year ? formatSpan(it.year, it.end) : formatYear(it.year);
    const target = it.ref ? unpackRef(it.ref) : null;
    const name = target ? `<a href="${readHref(target.book, target.chapter, target.verse)}">${escapeHtml(it.name)}</a>` : escapeHtml(it.name);
    return `<li class="tl-item tl-${it.kind}">
      <span class="tl-year">${it.estimate ? '<abbr title="Estimated date">c.</abbr> ' : ''}${when}</span>
      <span class="tl-name">${name}${it.kind !== 'event' ? ` <span class="type-chip">${it.kind === 'reign' ? 'King' : it.kind === 'judge' ? 'Judge' : it.kind === 'prophet' ? 'Prophet' : 'Period'}</span>` : ''}
      ${target ? `<span class="muted small"> · ${escapeHtml(formatReference(target.book, target.chapter, [target.verse]))}</span>` : ''}</span>
    </li>`;
  };
  panel.innerHTML = `
    <div class="card small">
      <p style="margin-top:0"><strong>About these dates.</strong> Old Testament dates follow the BibleData chronology, which adds up the Bible’s own numbers (ages, reigns, “480 years” in 1 Kings 6:1), so the Exodus falls in 1447 BC. Many scholars date the early events differently, and dates before about 1000 BC are especially uncertain. New Testament dates are common approximate dates. <abbr title="Estimated date">c.</abbr> marks an estimate.</p>
    </div>
    <div class="tabs" role="group" aria-label="Show">${FILTERS.map(([id, label]) => `<a class="tab-link" aria-selected="${id === filter}" href="#/study/timeline${id === 'all' ? '' : `?show=${id}`}">${label}</a>`).join('')}</div>
    <nav class="era-nav" aria-label="Jump to era">${[...groups.keys()].map((name, i) => `<a href="#" data-era="${i}">${escapeHtml(name)}</a>`).join('')}</nav>
    ${[...groups.entries()]
      .map(([name, list], i) => `<section class="era" id="era-${i}"><h2>${escapeHtml(name)}</h2><ol class="timeline">${list.map(itemHtml).join('')}</ol></section>`)
      .join('')}`;
  panel.querySelectorAll('[data-era]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      document.getElementById(`era-${a.dataset.era}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
}
