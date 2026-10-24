// First-run tour, the "More" actions sheet, and Simple/Full mode.
import { escapeHtml } from './util.js';

/** Actions for selected verses that live under "More". `advanced` ones are hidden in Simple mode. */
export const MORE_ACTIONS = [
  { action: 'xrefs', label: 'Related verses', hint: 'Other passages on the same theme', advanced: true },
  { action: 'commentary', label: 'Commentary', hint: 'Matthew Henry and Jamieson-Fausset-Brown', advanced: true },
  { action: 'memorize', label: 'Memorize', hint: 'Learn it by heart with daily practice' },
  { action: 'pray', label: 'Pray', hint: 'Add to your prayer list' },
  { action: 'image', label: 'Make an image', hint: 'A picture to share' },
  { action: 'copy', label: 'Copy', hint: 'Copy the text with its reference' },
];

export const moreActionsFor = (mode) => MORE_ACTIONS.filter((a) => mode !== 'simple' || !a.advanced);

/** Sheet listing the extra actions; calls onPick(action). */
export function openMoreSheet(dialog, { mode, reference, onPick }) {
  dialog.innerHTML = `
    <div class="dialog-head"><h2>${escapeHtml(reference)}</h2><button class="btn btn-small" data-close>Close</button></div>
    <div class="dialog-body more-sheet">
      ${moreActionsFor(mode).map((a) => `<button class="more-item" data-pick="${a.action}"><strong>${a.label}</strong><span class="muted small">${a.hint}</span></button>`).join('')}
    </div>`;
  dialog.onclick = (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) return dialog.close();
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      dialog.close();
      onPick(pick.dataset.pick);
    }
  };
  dialog.oninput = dialog.onchange = null;
  dialog.showModal();
}

const STEPS = [
  {
    title: 'Welcome',
    body: '<p>Read the Bible every day, understand it more deeply, and keep your notes and prayers in one place. Everything works offline, and your data stays on your device.</p>',
  },
  {
    title: 'Reading',
    body: `<p>Open <strong>Read</strong> and tap the book name to jump anywhere. Swipe left or right to change chapter.</p>
      <p>Tap the translation button (e.g. <strong>KJV</strong>) to switch between five translations, or show two side by side.</p>`,
  },
  {
    title: 'Tap a verse',
    body: `<p>Tap any verse to <strong>highlight</strong> it, add a <strong>note</strong>, <strong>bookmark</strong> or <strong>share</strong> it.</p>
      <p>Under <strong>More</strong> you can memorize it, pray it, make an image, and more.</p>`,
  },
  {
    title: 'Build a habit',
    body: `<p><strong>Today</strong> gives you a verse each day, your reading plan and your streak. Choose a plan under <strong>Plans</strong> and set a daily reminder in Settings.</p>`,
  },
  {
    title: 'How much do you want to see?',
    choose: true,
    body: `<p>You can change this any time in Settings.</p>
      <button class="mode-option" data-mode="simple"><strong>Simple</strong><span class="muted small">Reading, notes, plans and prayer. A calm, uncluttered app.</span></button>
      <button class="mode-option" data-mode="full"><strong>Full study</strong><span class="muted small">Adds the original Hebrew and Greek, commentaries, cross references, topics, maps, timeline and manuscript notes.</span></button>`,
  },
];

/** Step-by-step introduction. Calls onDone(mode) at the end ('simple' | 'full'). */
export function openTour(dialog, { mode = 'full', onDone }) {
  let step = 0;
  let chosen = mode;
  const render = () => {
    const s = STEPS[step];
    dialog.innerHTML = `
      <div class="dialog-head"><h2>${s.title}</h2><button class="btn btn-small" data-skip>Skip</button></div>
      <div class="dialog-body tour">
        ${s.body}
        <div class="tour-dots" aria-label="Step ${step + 1} of ${STEPS.length}">${STEPS.map((_, i) => `<span class="${i === step ? 'on' : ''}"></span>`).join('')}</div>
        <div class="row">${step ? '<button class="btn" data-back>Back</button>' : ''}<span class="spacer"></span><button class="btn btn-primary" data-next>${step === STEPS.length - 1 ? 'Start reading' : 'Next'}</button></div>
      </div>`;
    dialog.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === chosen)));
  };
  const finish = () => {
    dialog.close();
    onDone(chosen);
  };
  dialog.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-skip')) return finish();
    if (t.hasAttribute('data-back')) step--;
    else if (t.hasAttribute('data-next')) {
      if (step === STEPS.length - 1) return finish();
      step++;
    } else if (t.dataset.mode) chosen = t.dataset.mode;
    render();
  };
  dialog.oninput = dialog.onchange = null;
  dialog.oncancel = (e) => {
    e.preventDefault(); // Escape skips the tour but still records that it was seen
    finish();
  };
  render();
  dialog.showModal();
}
