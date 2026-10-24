// Memory verses with spaced repetition (Leitner-style boxes).
import { formatReference } from './bible.js';
import { loadTranslation } from './data.js';
import { toDateString } from './plans.js';
import { escapeHtml, readHref } from './util.js';

/** Days until the next review for each level. Remembering moves up a level; forgetting goes back to 0. */
export const INTERVALS = [1, 2, 4, 7, 14, 30, 60, 120];

const addDays = (dateString, days) => {
  const [y, m, d] = dateString.split('-').map(Number);
  return toDateString(new Date(y, m - 1, d + days));
};

export const memoryKey = (book, chapter, verses) => `${book}.${chapter}.${verses.join(',')}`;

export function newItem(book, chapter, verses, translation, today = toDateString(new Date())) {
  return { book, chapter, verses: [...verses].sort((a, b) => a - b), t: translation, level: 0, due: today, added: today, reviews: 0 };
}

/** Result of one review: `remembered` true moves the verse up a level, false starts it again tomorrow. */
export function review(item, remembered, today = toDateString(new Date())) {
  const level = remembered ? Math.min(item.level + 1, INTERVALS.length - 1) : 0;
  const days = remembered ? INTERVALS[level] : 1;
  return { ...item, level, due: addDays(today, days), last: today, reviews: (item.reviews || 0) + 1 };
}

export const isDue = (item, today = toDateString(new Date())) => item.due <= today;
export const dueItems = (items, today) => items.filter((i) => isDue(i, today)).sort((a, b) => a.due.localeCompare(b.due));
/** Level 5 = remembered over about a month of gaps. */
export const isLearned = (item) => item.level >= 5;

/** "For God so loved the world," → "F G s l t w," (first letter of each word, punctuation kept). */
export const firstLetters = (text) => text.replace(/([A-Za-zÀ-ɏ])[A-Za-zÀ-ɏ'’]*/g, '$1');

const words = (s) => s.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9À-ɏ]+/g) || [];

/** Compare a typed attempt with the verse, word by word (in order). Returns { score, marked }. */
export function compareTyped(target, typed) {
  const want = words(target);
  const got = words(typed);
  // Longest common subsequence keeps word order, so skipped or extra words only cost themselves.
  const dp = Array.from({ length: want.length + 1 }, () => new Array(got.length + 1).fill(0));
  for (let i = want.length - 1; i >= 0; i--) {
    for (let j = got.length - 1; j >= 0; j--) {
      dp[i][j] = want[i] === got[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const marked = [];
  let i = 0;
  let j = 0;
  while (i < want.length) {
    if (j < got.length && want[i] === got[j]) {
      marked.push([want[i], true]);
      i++;
      j++;
    } else if (j < got.length && dp[i][j + 1] >= dp[i + 1][j]) {
      j++;
    } else {
      marked.push([want[i], false]);
      i++;
    }
  }
  return { score: want.length ? dp[0][0] / Math.max(want.length, got.length) : 0, marked };
}

/* ---------- UI ---------- */

const itemText = async (item) => {
  const bible = await loadTranslation(item.t).catch(() => loadTranslation('kjv'));
  return item.verses.map((v) => bible.books[item.book][item.chapter - 1][v - 1]).filter(Boolean).join(' ');
};
const itemRef = (item) => formatReference(item.book, item.chapter, item.verses);

/** Library tab listing memory verses. */
export async function renderMemoryList(container, store) {
  const items = Object.entries(store.get().memory || {});
  if (!items.length) {
    container.innerHTML = '<div class="empty">Select verses while reading and tap <strong>Memorize</strong> to start learning them by heart.</div>';
    return;
  }
  const today = toDateString(new Date());
  const due = items.filter(([, i]) => isDue(i, today)).length;
  const texts = await Promise.all(items.map(([, i]) => itemText(i)));
  container.innerHTML = `
    <div class="card row"><div><div class="stat">${due}</div><div class="muted small">due today</div></div><span class="spacer"></span>
      <div><div class="stat">${items.filter(([, i]) => isLearned(i)).length}</div><div class="muted small">learned</div></div><span class="spacer"></span>
      <a class="btn btn-primary" href="#/memorize">${due ? 'Practice now' : 'Practice anyway'}</a></div>
    ${items
      .map(([key, i], n) => `<div class="result memory-item">
        <strong><a href="${readHref(i.book, i.chapter, i.verses[0])}">${escapeHtml(itemRef(i))}</a> <span class="muted small">· ${i.t.toUpperCase()} · ${isLearned(i) ? 'learned' : `level ${i.level + 1} of ${INTERVALS.length}`} · ${isDue(i, today) ? 'due now' : `next ${new Date(`${i.due}T00:00`).toLocaleDateString()}`}</span></strong>
        <span>${escapeHtml(texts[n])}</span>
        <button class="link-btn small" data-forget="${escapeHtml(key)}">Remove</button></div>`)
      .join('')}`;
  container.querySelectorAll('[data-forget]').forEach((btn) => {
    btn.onclick = () => {
      store.update((s) => delete s.memory[btn.dataset.forget]);
      renderMemoryList(container, store);
    };
  });
}

/** Practice session: due verses first (or all, if none are due). */
export async function renderPractice(main, store) {
  document.title = 'Memorize — Bible';
  const all = Object.entries(store.get().memory || {});
  const today = toDateString(new Date());
  let queue = all.filter(([, i]) => isDue(i, today));
  const extra = !queue.length;
  if (extra) queue = all;
  if (!all.length) {
    main.innerHTML = '<h1>Memorize</h1><div class="empty">No memory verses yet. Select verses while reading and tap <strong>Memorize</strong>.</div>';
    return;
  }
  let pos = 0;
  let done = 0;
  const show = async () => {
    if (pos >= queue.length) {
      main.innerHTML = `<h1>Memorize</h1><div class="card"><p class="votd-text">Well done!</p><p>You practised ${done} verse${done === 1 ? '' : 's'}. ${extra ? '' : 'Come back tomorrow for the next review.'}</p><div class="row"><a class="btn btn-primary" href="#/library/memory">Memory verses</a><a class="btn" href="#/today">Today</a></div></div>`;
      return;
    }
    const [key, item] = queue[pos];
    const text = await itemText(item);
    main.innerHTML = `
      <h1>Memorize</h1>
      <p class="muted small">${pos + 1} of ${queue.length}${extra ? ' · nothing is due, so this is extra practice' : ''}</p>
      <section class="card practice">
        <div class="card-label">${escapeHtml(item.t.toUpperCase())}</div>
        <h2 class="practice-ref">${escapeHtml(itemRef(item))}</h2>
        <div class="tabs" role="group" aria-label="Practice mode">
          <button data-mode="recall" aria-selected="true">Recall</button>
          <button data-mode="letters" aria-selected="false">First letters</button>
          <button data-mode="type" aria-selected="false">Type it</button>
        </div>
        <div id="practice-body"></div>
      </section>`;
    const body = document.getElementById('practice-body');
    const grade = (remembered) => {
      if (!extra) store.update((s) => (s.memory[key] = review(item, remembered)));
      done++;
      pos++;
      show();
    };
    const gradeButtons = `<div class="row grade"><button class="btn" data-grade="0">Not yet</button><button class="btn btn-primary" data-grade="1">I knew it</button></div>`;
    const modes = {
      recall: () => {
        body.innerHTML = `<p class="muted">Say the verse from memory, then check.</p><p class="votd-text practice-text hidden-text">${escapeHtml(text)}</p><button class="btn" id="reveal">Show verse</button>`;
        document.getElementById('reveal').onclick = (e) => {
          body.querySelector('.practice-text').classList.remove('hidden-text');
          e.target.outerHTML = gradeButtons;
          bindGrades();
        };
      },
      letters: () => {
        body.innerHTML = `<p class="muted">Use the first letter of each word as a hint.</p><p class="votd-text letters">${escapeHtml(firstLetters(text))}</p><details><summary>Show verse</summary><p class="votd-text">${escapeHtml(text)}</p></details>${gradeButtons}`;
        bindGrades();
      },
      type: () => {
        body.innerHTML = `<p class="muted">Type the verse from memory.</p><textarea id="typed" aria-label="Type the verse" placeholder="Type here…"></textarea><div class="row" style="margin-top:10px"><button class="btn btn-primary" id="check">Check</button></div><div id="typed-result"></div>`;
        document.getElementById('check').onclick = () => {
          const { score, marked } = compareTyped(text, document.getElementById('typed').value);
          const pct = Math.round(score * 100);
          document.getElementById('typed-result').innerHTML = `<p><strong>${pct}% correct.</strong> ${pct >= 90 ? 'Excellent!' : 'Missed words are underlined.'}</p><p class="votd-text">${marked.map(([w, ok]) => (ok ? escapeHtml(w) : `<mark class="missed">${escapeHtml(w)}</mark>`)).join(' ')}</p>${gradeButtons}`;
          bindGrades();
        };
      },
    };
    const bindGrades = () => body.querySelectorAll('[data-grade]').forEach((b) => (b.onclick = () => grade(b.dataset.grade === '1')));
    main.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => {
        main.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        modes[b.dataset.mode]();
      };
    });
    modes.recall();
  };
  show();
}
