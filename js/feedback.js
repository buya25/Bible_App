// "Send feedback": problems, ideas and thanks, with optional device details to help fix problems.
import { CONFIG } from './config.js';
import { escapeHtml, toast } from './util.js';

const KINDS = [
  ['problem', 'Something is wrong'],
  ['idea', 'An idea'],
  ['thanks', 'Thank you'],
];

/** Details that help reproduce a problem. No personal data (notes, prayers) is included. */
export function deviceDetails(st, now = new Date()) {
  const s = st.settings || {};
  return [
    `Page: ${location.hash || '#/today'}`,
    `Translation: ${s.translation} · Mode: ${s.mode} · Theme: ${s.theme}`,
    `Screen: ${window.innerWidth}×${window.innerHeight} · Installed: ${matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no'}`,
    `Browser: ${navigator.userAgent}`,
    `Date: ${now.toISOString().slice(0, 10)}`,
  ].join('\n');
}

export function buildFeedback({ kind, message, details }) {
  const label = KINDS.find(([k]) => k === kind)?.[1] || 'Feedback';
  const firstLine = message.trim().split('\n')[0].slice(0, 70);
  const title = `${label}: ${firstLine || 'feedback'}`;
  const body = `${message.trim().slice(0, 3000)}${details ? `\n\n---\n${details}` : ''}`;
  return { title, body };
}

export const githubIssueUrl = ({ title, body }, repo = CONFIG.githubRepo) =>
  `https://github.com/${repo}/issues/new?${new URLSearchParams({ title, body, labels: 'feedback' })}`;

export const mailtoUrl = ({ title, body }, to = CONFIG.feedbackEmail) =>
  `mailto:${to}?${new URLSearchParams({ subject: title, body }).toString().replace(/\+/g, '%20')}`;

export function openFeedback(dialog, store) {
  let kind = 'problem';
  dialog.innerHTML = `
    <div class="dialog-head"><h2>Send feedback</h2><button class="btn btn-small" data-close>Close</button></div>
    <form class="dialog-body" id="feedback-form">
      <p class="muted small">Tell us what isn’t working, what you’d like, or what you enjoy. Every message is read.</p>
      <div class="segmented" role="group" aria-label="Kind of feedback" style="margin-bottom:12px">${KINDS.map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${k === kind}">${l}</button>`).join('')}</div>
      <textarea id="fb-message" required maxlength="3000" placeholder="What happened, or what would help? For a problem, say what you tapped and what you expected." aria-label="Your feedback"></textarea>
      <label class="small check-row"><input type="checkbox" id="fb-details" checked><span>Include device details (page, browser, screen). Your notes and prayers are never included.</span></label>
      <details class="small"><summary>Show the details</summary><pre class="fb-details">${escapeHtml(deviceDetails(store.get()))}</pre></details>
      <div class="row fb-actions">
        <button type="button" class="btn" data-copy>Copy text</button>
        ${CONFIG.feedbackEmail ? '<button type="button" class="btn" data-email>Send by email</button>' : ''}
        <span class="spacer"></span>
        <button type="submit" class="btn btn-primary">Send on GitHub</button>
      </div>
      <p class="muted small">Sending on GitHub opens a public page with your message (free GitHub account needed). Prefer not to? Use <strong>Copy text</strong> and send it to the app’s owner any way you like.</p>
    </form>`;
  const form = dialog.querySelector('#feedback-form');
  const current = () => {
    const message = form.querySelector('#fb-message').value;
    if (!message.trim()) {
      form.querySelector('#fb-message').focus();
      toast('Please write your feedback first');
      return null;
    }
    return buildFeedback({ kind, message, details: form.querySelector('#fb-details').checked ? deviceDetails(store.get()) : '' });
  };
  dialog.onclick = async (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) return dialog.close();
    const k = e.target.closest('[data-kind]');
    if (k) {
      kind = k.dataset.kind;
      form.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b === k)));
    }
    if (e.target.closest('[data-copy]')) {
      const fb = current();
      if (!fb) return;
      try {
        await navigator.clipboard.writeText(`${fb.title}\n\n${fb.body}`);
        toast('Copied. Paste it into a message or email.');
      } catch {
        toast('Could not copy on this device');
      }
    }
    if (e.target.closest('[data-email]')) {
      const fb = current();
      if (fb) location.href = mailtoUrl(fb);
    }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const fb = current();
    if (!fb) return;
    window.open(githubIssueUrl(fb), '_blank', 'noopener');
    dialog.close();
    toast('Thank you! Finish sending on the GitHub page.');
  };
  dialog.oninput = dialog.onchange = null;
  dialog.showModal();
  form.querySelector('#fb-message').focus();
}
