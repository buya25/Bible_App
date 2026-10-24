// Small helpers shared by the UI modules.
import { BOOKS } from './bible.js';

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const readHref = (book, chapter, verse) => `#/read/${BOOKS[book].slug}/${chapter}${verse ? `/${verse}` : ''}`;

export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}
