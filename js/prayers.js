// Prayer journal: requests and thanksgivings, optionally linked to verses, marked answered with a note.
import { formatReference, parseReference } from './bible.js';
import { toDateString } from './plans.js';
import { escapeHtml, readHref, toast } from './util.js';

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const refLabel = (r) => formatReference(r.book, r.chapter, r.verses);
const formatDate = (d) => new Date(`${d}T00:00`).toLocaleDateString();

/** Parse "John 3:16; Phil 4:6-7" into [{ book, chapter, verses }]; unknown parts are ignored. */
export function parseVerseList(text, bible) {
  return text
    .split(/[;\n]/)
    .map((part) => parseReference(part.trim(), bible))
    .filter(Boolean)
    .map((r) => ({ book: r.book, chapter: r.chapter, verses: r.verse ? Array.from({ length: (r.verseEnd || r.verse) - r.verse + 1 }, (_, i) => r.verse + i) : [] }));
}

/** Add or edit a prayer. `seed` can pre-fill verses (from the reader selection). */
export function openPrayerDialog(dialog, store, bible, { id, seed, onSave } = {}) {
  const existing = id ? store.get().prayers.find((p) => p.id === id) : null;
  const verses = existing?.verses || (seed ? [seed] : []);
  dialog.innerHTML = `
    <div class="dialog-head"><h2>${existing ? 'Edit prayer' : 'New prayer'}</h2><button class="btn btn-small" data-close>Cancel</button></div>
    <form class="dialog-body" id="prayer-form">
      <div class="field"><label for="p-title">Prayer</label><input id="p-title" class="picker-filter" required maxlength="200" value="${escapeHtml(existing?.title || '')}" placeholder="e.g. Healing for Mum, wisdom at work"></div>
      <div class="field"><label for="p-details">Details (optional)</label><textarea id="p-details" placeholder="Write your prayer…">${escapeHtml(existing?.details || '')}</textarea></div>
      <div class="field"><label for="p-verses">Verses to pray (optional)</label><input id="p-verses" class="picker-filter" value="${escapeHtml(verses.map(refLabel).join('; '))}" placeholder="e.g. Philippians 4:6-7; Psalm 23"></div>
      <div class="row"><span class="spacer"></span><button class="btn btn-primary" type="submit">Save</button></div>
    </form>`;
  dialog.onclick = (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  };
  dialog.oninput = dialog.onchange = null;
  document.getElementById('prayer-form').onsubmit = (e) => {
    e.preventDefault();
    const title = document.getElementById('p-title').value.trim();
    if (!title) return;
    const prayer = {
      ...(existing || { id: newId(), created: toDateString(new Date()), answered: null }),
      title,
      details: document.getElementById('p-details').value.trim(),
      verses: parseVerseList(document.getElementById('p-verses').value, bible),
    };
    store.update((s) => {
      s.prayers = existing ? s.prayers.map((p) => (p.id === prayer.id ? prayer : p)) : [prayer, ...s.prayers];
    });
    dialog.close();
    toast('Prayer saved');
    onSave?.();
  };
  if (!dialog.open) dialog.showModal();
  document.getElementById('p-title').focus();
}

/** Library tab: active and answered prayers. */
export function renderPrayers(container, store, dialog, bible) {
  const prayers = store.get().prayers || [];
  const active = prayers.filter((p) => !p.answered);
  const answered = prayers.filter((p) => p.answered);
  const card = (p) => `
    <div class="card prayer" data-id="${p.id}">
      <div class="row"><strong class="prayer-title">${escapeHtml(p.title)}</strong><span class="spacer"></span><span class="muted small">${formatDate(p.created)}</span></div>
      ${p.details ? `<div class="note-text">${escapeHtml(p.details)}</div>` : ''}
      ${p.verses?.length ? `<div class="ref-chips" style="margin-top:8px">${p.verses.map((r) => `<a class="ref-chip" href="${readHref(r.book, r.chapter, r.verses[0])}">${escapeHtml(refLabel(r))}</a>`).join('')}</div>` : ''}
      ${p.answered ? `<p class="answered">✓ Answered ${formatDate(p.answered)}${p.answerNote ? `: ${escapeHtml(p.answerNote)}` : ''}</p>` : ''}
      <div class="row prayer-actions">
        ${p.answered ? '<button class="link-btn small" data-reopen>Move back to praying</button>' : '<button class="btn btn-small" data-answer>Mark answered</button>'}
        <button class="link-btn small" data-edit>Edit</button>
        <button class="link-btn small" data-delete>Delete</button>
      </div>
    </div>`;
  container.innerHTML = `
    <div class="row" style="margin-bottom:12px"><p class="muted small" style="margin:0">Keep a list of what you are praying for and record how God answers.</p><span class="spacer"></span><button class="btn btn-primary btn-small" id="new-prayer">New prayer</button></div>
    ${active.length ? active.map(card).join('') : '<div class="empty">No prayers yet. Tap <strong>New prayer</strong>, or select verses while reading and tap <strong>Pray</strong>.</div>'}
    ${answered.length ? `<h2>Answered (${answered.length})</h2>${answered.map(card).join('')}` : ''}`;
  const rerender = () => renderPrayers(container, store, dialog, bible);
  document.getElementById('new-prayer').onclick = () => openPrayerDialog(dialog, store, bible, { onSave: rerender });
  container.querySelectorAll('.prayer').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('[data-edit]').onclick = () => openPrayerDialog(dialog, store, bible, { id, onSave: rerender });
    el.querySelector('[data-delete]').onclick = () => {
      if (!confirm('Delete this prayer?')) return;
      store.update((s) => (s.prayers = s.prayers.filter((p) => p.id !== id)));
      rerender();
    };
    const answer = el.querySelector('[data-answer]');
    if (answer) {
      answer.onclick = () => {
        const note = prompt('How was this prayer answered? (optional)') ?? null;
        if (note === null) return;
        store.update((s) => (s.prayers = s.prayers.map((p) => (p.id === id ? { ...p, answered: toDateString(new Date()), answerNote: note.trim() } : p))));
        toast('Praise God!');
        rerender();
      };
    }
    const reopen = el.querySelector('[data-reopen]');
    if (reopen) {
      reopen.onclick = () => {
        store.update((s) => (s.prayers = s.prayers.map((p) => (p.id === id ? { ...p, answered: null, answerNote: '' } : p))));
        rerender();
      };
    }
  });
}
