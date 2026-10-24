// Keeping the reader's data safe: persistent storage, installing the app, and backup reminders.
// Browsers (especially Safari) may clear website data that isn't installed or marked persistent.
import { toDateString } from './plans.js';
import { escapeHtml } from './util.js';

const DAY = 86400000;

/** Ask the browser not to clear our storage automatically. Returns 'granted' | 'denied' | 'unsupported'. */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** How much personal data would be lost if storage were cleared. */
export const userDataCount = (st) =>
  Object.keys(st.notes || {}).length + Object.keys(st.highlights || {}).length + Object.keys(st.bookmarks || {}).length +
  Object.keys(st.memory || {}).length + (st.prayers || []).length;

/** Suggest a backup once there is something worth keeping and the last one is 30+ days old (or never made). */
export function backupDue(st, now = new Date()) {
  if (userDataCount(st) < 5) return false;
  if (st.dismissed?.backup && now - new Date(st.dismissed.backup) < 14 * DAY) return false;
  return !st.lastBackup || now - new Date(st.lastBackup) >= 30 * DAY;
}

let deferredPrompt = null;
globalThis.addEventListener?.('beforeinstallprompt', (e) => {
  e.preventDefault(); // show our own, friendlier prompt on the Today screen instead
  deferredPrompt = e;
});

export function installInfo() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return { standalone, ios, canPrompt: Boolean(deferredPrompt) };
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

/** Suggest installing after the second day of use, unless dismissed in the last 30 days. */
export function installSuggested(st, info, now = new Date()) {
  if (info.standalone || (st.visitDays || 0) < 2) return false;
  if (st.dismissed?.install && now - new Date(st.dismissed.install) < 30 * DAY) return false;
  return info.canPrompt || info.ios;
}

/** Count distinct days the app was opened (used to time the install suggestion). */
export function recordVisit(store) {
  const today = toDateString(new Date());
  if (store.get().lastVisit === today) return;
  store.update((s) => {
    s.lastVisit = today;
    s.visitDays = (s.visitDays || 0) + 1;
  });
}

/** Cards for the Today screen. Buttons: data-install, data-backup-now, data-dismiss="install|backup". */
export function safetyCardsHtml(st) {
  const info = installInfo();
  const cards = [];
  if (installSuggested(st, info)) {
    cards.push(`<section class="card card-wide care-card">
      <div class="card-label">Install the app</div>
      <p>Add Bible to your home screen to open it like an app, read offline, and keep your notes safe.${info.ios && !info.canPrompt ? ' On iPhone or iPad: tap <strong>Share</strong> <span aria-hidden="true">⎙</span>, then <strong>Add to Home Screen</strong>.' : ''}</p>
      <div class="row">${info.canPrompt ? '<button class="btn btn-primary" data-install>Install</button>' : ''}<button class="btn" data-dismiss="install">Not now</button></div>
    </section>`);
  }
  if (backupDue(st)) {
    cards.push(`<section class="card card-wide care-card">
      <div class="card-label">Back up your notes</div>
      <p>You have ${userDataCount(st)} notes, highlights, prayers and memory verses saved on this device${st.lastBackup ? ` (last backup ${escapeHtml(new Date(st.lastBackup).toLocaleDateString())})` : ''}. Download a backup file so you never lose them, for example if the browser clears its data or you change phones.</p>
      <div class="row"><button class="btn btn-primary" data-backup-now>Download backup</button><button class="btn" data-dismiss="backup">Later</button></div>
    </section>`);
  }
  return cards.join('');
}

/** One line for Settings describing how safe the data is. */
export async function storageStatusText() {
  try {
    const persisted = await navigator.storage?.persisted?.();
    const { standalone } = installInfo();
    if (persisted) return 'Protected: this browser will not clear your data automatically.';
    if (standalone) return 'Installed app. Your data is kept while the app is installed.';
    return 'Not protected: the browser may clear website data that isn’t used for a while. Install the app or keep a backup.';
  } catch {
    return '';
  }
}
