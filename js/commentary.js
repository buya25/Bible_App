// Classic public-domain commentaries (Matthew Henry; Jamieson, Fausset & Brown).
// Files are gzip-compressed JSON, decompressed in the browser.
import { BOOKS, formatReference, parseReference } from './bible.js';
import { load } from './data.js';
import { escapeHtml, readHref } from './util.js';

export const loadCommentaryList = () => load('data/commentary/index.json');

const books = new Map();

async function gunzipJson(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Some servers already decode .gz files (Content-Encoding); only decompress real gzip data.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export function loadCommentaryBook(id, book) {
  const path = `data/commentary/${id}/${book}.json.gz`;
  if (!books.has(path)) {
    const p = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return gunzipJson(r);
    });
    p.catch(() => books.delete(path));
    books.set(path, p);
  }
  return books.get(path);
}

/** Sections of a chapter that cover any of `verses` (plus the chapter introduction, verse 0). */
export function sectionsFor(data, chapter, verses) {
  const sections = data?.chapters?.[chapter] || [];
  const intro = sections.find((s) => s[0] === 0) || null;
  const covering = sections.filter((s) => s[0] > 0 && verses.some((v) => v >= s[0] && v <= s[1]));
  return { intro, covering };
}

/** Plain text → paragraphs, with Bible references like "Joh 3:16" or "Rom. 8:28" turned into links. */
export function commentaryHtml(text) {
  return text
    .split(/\n\s*\n/)
    .map((para) => {
      const escaped = escapeHtml(para.trim()).replace(/\n/g, '<br>');
      const linked = escaped.replace(/\b((?:[1-3] ?)?[A-Z][a-z]{1,13}\.?) (\d{1,3}):(\d{1,3})\b/g, (m, book, c, v) => {
        const ref = parseReference(`${book.replace(/\.$/, '')} ${c}:${v}`);
        return ref ? `<a href="${readHref(ref.book, ref.chapter, ref.verse)}">${m}</a>` : m;
      });
      return linked ? `<p>${linked}</p>` : '';
    })
    .join('');
}

const sectionLabel = (book, chapter, [start, end]) => formatReference(book, chapter, Array.from({ length: end - start + 1 }, (_, i) => start + i));

/** HTML for one commentary's notes on the given verses. */
export async function commentaryNotesHtml(work, book, chapter, verses) {
  if (!work.books.includes(book)) {
    return `<p class="muted">${escapeHtml(work.author)} is not available for ${escapeHtml(BOOKS[book].name)} in this edition. Try another commentary.</p>`;
  }
  const data = await loadCommentaryBook(work.id, book);
  const { intro, covering } = sectionsFor(data, chapter, verses);
  if (!intro && !covering.length) return `<p class="muted">No notes on these verses in ${escapeHtml(work.author)}.</p>`;
  return `
    ${covering.map((s) => `<section class="comm-section"><h4>${escapeHtml(sectionLabel(book, chapter, s))}</h4>${commentaryHtml(s[2])}</section>`).join('')}
    ${intro ? `<details class="comm-intro"${covering.length ? '' : ' open'}><summary>Introduction to ${escapeHtml(formatReference(book, chapter))}</summary>${commentaryHtml(intro[2])}</details>` : ''}`;
}

/** Commentary panel with a switch between works. `container` gets the content; returns nothing. */
export async function renderCommentaryPanel(container, book, chapter, verses, preferred, onChoose) {
  const works = await loadCommentaryList();
  const current = works.find((w) => w.id === preferred) || works[0];
  container.innerHTML = `
    <div class="tabs comm-tabs" role="tablist">${works
      .map((w) => `<button role="tab" aria-selected="${w.id === current.id}" data-commentary="${w.id}" title="${escapeHtml(w.author)}: ${escapeHtml(w.description)}">${escapeHtml(w.short)}</button>`)
      .join('')}</div>
    <p class="muted small"><strong>${escapeHtml(current.author)}</strong>, ${escapeHtml(current.title)} (${escapeHtml(current.years)}). ${escapeHtml(current.description)} Public domain.</p>
    <div class="comm-body"><div class="loading">Loading…</div></div>`;
  container.querySelectorAll('[data-commentary]').forEach((btn) => {
    btn.onclick = () => {
      onChoose?.(btn.dataset.commentary);
      renderCommentaryPanel(container, book, chapter, verses, btn.dataset.commentary, onChoose);
    };
  });
  const body = container.querySelector('.comm-body');
  try {
    body.innerHTML = await commentaryNotesHtml(current, book, chapter, verses);
  } catch {
    body.innerHTML = '<p class="muted">Could not load the commentary. Check your connection.</p>';
  }
}

/** Dialog with commentary on the selected verses. */
export function openCommentaryDialog(dialog, book, chapter, verses, preferred, onChoose) {
  dialog.innerHTML = `<div class="dialog-head"><h2>Commentary · ${escapeHtml(formatReference(book, chapter, verses))}</h2><button class="btn btn-small" data-close>Close</button></div><div class="dialog-body commentary"></div>`;
  dialog.onclick = (e) => {
    if (e.target === dialog || e.target.closest('[data-close]') || e.target.closest('a[href]')) dialog.close();
  };
  dialog.oninput = dialog.onchange = null;
  if (!dialog.open) dialog.showModal();
  return renderCommentaryPanel(dialog.querySelector('.dialog-body'), book, chapter, verses, preferred, onChoose);
}
