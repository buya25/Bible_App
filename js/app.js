import { BOOKS, parseReference, formatReference, verseKey, parseVerseKey, search, highlightTerms, findBook } from './bible.js';
import { PLANS, buildSchedule, describeDay, toDateString, currentPlanDay, computeStreak } from './plans.js';
import { verseOfTheDay } from './votd.js';
import { store } from './store.js';
import { escapeHtml, readHref, toast } from './util.js';
import { loadTranslationList, loadTranslation, loadVariants, loadOriginal, allDataFiles } from './data.js';
import { openCommentaryDialog } from './commentary.js';
import { loadChapterPlaces } from './maps.js';
import { newItem, memoryKey, renderMemoryList, renderPractice, dueItems } from './memory.js';
import { openPrayerDialog, renderPrayers } from './prayers.js';
import { openImageDialog } from './verse-image.js';
import { enableReminders, checkReminder, downloadIcs } from './reminders.js';
import { renderTopicPage, renderDictionaryPage, loadTopicsIndex, loadDictionaryIndex, topicRowHtml, entryRowHtml } from './topics.js';
import { openCrossRefsDialog, loadCrossRefs, inlineCrossRefsHtml } from './crossrefs.js';
import { renderNamePage, searchNames, loadNamesIndex, nameRowHtml } from './names.js';
import { interlinearHtml, interlinearLegend, openWordDialog, renderWordPage, renderVersePage, renderStudyHome, studyVerseHref, wordContext } from './study.js';

const main = document.getElementById('main');
const dialog = document.getElementById('dialog');
const actionBar = document.getElementById('action-bar');

let bible = null;
let selection = new Set(); // selected verse numbers in the current chapter
let current = { book: 42, chapter: 1 };
let speaking = null; // { verse } while read-aloud is active
let translations = []; // [{ id, abbr, name, year, description }]
let variantMap = new Map(); // verseKey -> manuscript-difference summary

const parallelId = () => {
  const id = store.get().settings.parallel;
  return id && id !== translation().id && translations.some((t) => t.id === id) ? id : '';
};
const translation = () => translations.find((t) => t.id === store.get().settings.translation) || translations[0] || { id: 'kjv', abbr: 'KJV', name: 'King James Version' };
const verseText = (book, chapter, verse) => bible.books[book][chapter - 1][verse - 1];
const ICONS = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
};

/* ---------- Settings ---------- */

function applySettings() {
  const s = store.get().settings;
  const root = document.documentElement;
  const dark = s.theme === 'dark' || (s.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = s.theme === 'sepia' ? 'sepia' : dark ? 'dark' : 'light';
  root.dataset.font = s.font;
  root.dataset.verseNumbers = s.verseNumbers ? 'on' : 'off';
  root.style.setProperty('--reading-size', `${s.fontSize}px`);
  root.style.setProperty('--reading-line', s.lineHeight);
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue('--bg').trim();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings);

function openSettings() {
  const render = () => {
    const s = store.get().settings;
    const seg = (key, options) =>
      `<div class="segmented">${options.map(([v, label]) => `<button data-set="${key}" data-value="${v}" aria-pressed="${String(s[key]) === String(v)}">${label}</button>`).join('')}</div>`;
    dialog.innerHTML = `
      <div class="dialog-head"><h2>Settings</h2><button class="btn btn-small" data-close>Done</button></div>
      <div class="dialog-body">
        <div class="field"><label for="tr">Bible translation</label><select id="tr" class="picker-filter" data-select="translation">${translations.map((t) => `<option value="${t.id}" ${t.id === translation().id ? 'selected' : ''}>${t.abbr} — ${escapeHtml(t.name)}</option>`).join('')}</select></div>
        <div class="field"><span class="label">Theme</span>${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark']])}</div>
        <div class="field"><span class="label">Font</span>${seg('font', [['serif', 'Serif'], ['sans', 'Sans']])}</div>
        <div class="field"><label for="fs">Text size: ${s.fontSize}px</label><input id="fs" type="range" min="14" max="32" step="1" value="${s.fontSize}" data-range="fontSize"></div>
        <div class="field"><label for="lh">Line spacing: ${s.lineHeight}</label><input id="lh" type="range" min="1.3" max="2.2" step="0.1" value="${s.lineHeight}" data-range="lineHeight"></div>
        <div class="field"><label for="sr">Read-aloud speed: ${s.speechRate}×</label><input id="sr" type="range" min="0.5" max="2" step="0.1" value="${s.speechRate}" data-range="speechRate"></div>
        <div class="field switch"><label for="vn">Show verse numbers</label><input id="vn" type="checkbox" data-check="verseNumbers" ${s.verseNumbers ? 'checked' : ''}></div>
        <div class="field switch"><label for="pm">Paragraph layout (verses flow together)</label><input id="pm" type="checkbox" data-check="paragraphMode" ${s.paragraphMode ? 'checked' : ''}></div>
        <div class="field switch"><label for="xr">Show related verses under each verse</label><input id="xr" type="checkbox" data-check="crossRefs" ${s.crossRefs ? 'checked' : ''}></div>
        <div class="field"><span class="label">Daily reminder</span>
          <div class="switch"><label for="rm">Remind me to read each day at</label><input id="rm" type="checkbox" data-reminder ${s.reminder ? 'checked' : ''}></div>
          <div class="row" style="margin-top:8px"><input type="time" class="picker-filter" style="width:auto;margin:0" value="${s.reminderTime}" data-time aria-label="Reminder time"><button class="btn btn-small" data-ics>Add to calendar</button></div>
          <p class="muted small">Notifications appear when you open the app after this time (and in the background on some installed apps). A calendar reminder works on every device.</p>
        </div>
        <div class="field"><span class="label">Your data</span>
          <p class="muted small">Highlights, notes, bookmarks and plan progress are stored only on this device. Export a backup to move them to another device.</p>
          <div class="row"><button class="btn btn-small" data-export>Export backup</button><label class="btn btn-small">Import backup<input type="file" accept="application/json" data-import hidden></label></div>
        </div>
        <div class="field"><span class="label">Offline use</span>
          <p class="muted small">Your current translation works offline once opened. Download every translation, the Hebrew and Greek texts and the dictionary to use them all without internet.</p>
          <div class="row"><button class="btn btn-small" data-download>Download everything</button><span id="dl-progress" class="small muted"></span></div>
        </div>
        <p class="muted small">Translations: public domain. Hebrew/Greek texts and dictionary: STEPBible.org (CC BY 4.0). <a href="#/study/about" data-close>Sources</a></p>
      </div>`;
  };
  render();
  dialog.onclick = (e) => {
    const t = e.target.closest('button');
    if (e.target === dialog || t?.hasAttribute('data-close')) return dialog.close();
    if (t?.dataset.set) {
      store.update((st) => (st.settings[t.dataset.set] = t.dataset.value));
      applySettings();
      render();
    }
    if (t?.hasAttribute('data-export')) exportBackup();
    if (t?.hasAttribute('data-download')) downloadEverything(t);
    if (t?.hasAttribute('data-ics')) downloadIcs(store.get().settings.reminderTime);
    if (e.target.closest('a[data-close]')) dialog.close();
  };
  dialog.oninput = (e) => {
    if (e.target.dataset.select === 'translation') return switchTranslation(e.target.value);
    if (e.target.hasAttribute('data-time')) return store.update((st) => (st.settings.reminderTime = e.target.value || '07:00'));
    if (e.target.hasAttribute('data-reminder')) {
      if (!e.target.checked) return store.update((st) => (st.settings.reminder = false));
      return enableReminders(store).then((ok) => (e.target.checked = ok));
    }
    const { range, check } = e.target.dataset;
    if (range) store.update((st) => (st.settings[range] = Number(e.target.value)));
    if (check) store.update((st) => (st.settings[check] = e.target.checked));
    applySettings();
    if (range) e.target.previousElementSibling.textContent = e.target.previousElementSibling.textContent.replace(/:.*/, `: ${e.target.value}${range === 'fontSize' ? 'px' : range === 'speechRate' ? '×' : ''}`);
    if ((check === 'paragraphMode' || check === 'crossRefs') && route().view === 'read') renderReader();
  };
  dialog.onchange = async (e) => {
    if (!e.target.hasAttribute('data-import')) return;
    const file = e.target.files[0];
    if (!file) return;
    try {
      store.importData(await file.text());
      applySettings();
      render();
      toast('Backup imported');
      router();
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  };
  dialog.showModal();
}

async function switchTranslation(id) {
  try {
    bible = await loadTranslation(id);
  } catch {
    toast('Could not load that translation. Check your connection.');
    return;
  }
  store.update((st) => (st.settings.translation = id));
  toast(`Now reading the ${translation().abbr}`);
  router();
}

function openTranslationPicker() {
  dialog.innerHTML = `
    <div class="dialog-head"><h2>Translation</h2><button class="btn btn-small" data-close>Close</button></div>
    <div class="dialog-body">
      ${translations.map((t) => `<button class="translation-option${t.id === translation().id ? ' current' : ''}" data-translation="${t.id}">
        <strong>${t.abbr}</strong> · ${escapeHtml(t.name)} <span class="muted small">(${t.year})</span><br><span class="muted small">${escapeHtml(t.description)}</span></button>`).join('')}
      <h3>Side by side</h3>
      <p class="small muted">Show a second translation next to the one you are reading.</p>
      <div class="segmented parallel-choice">
        <button data-parallel="" aria-pressed="${!parallelId()}">Off</button>
        ${translations.filter((t) => t.id !== translation().id).map((t) => `<button data-parallel="${t.id}" aria-pressed="${parallelId() === t.id}">${t.abbr}</button>`).join('')}
      </div>
      <p class="small muted">Want to see how a verse was written? Turn on <strong>Original</strong> in the reader, or select a verse and tap <strong>Study</strong> to compare all translations.</p>
    </div>`;
  dialog.onclick = (e) => {
    const t = e.target.closest('button');
    if (e.target === dialog || t?.hasAttribute('data-close')) return dialog.close();
    if (t?.dataset.translation) {
      dialog.close();
      switchTranslation(t.dataset.translation);
    }
    if (t && t.dataset.parallel !== undefined) {
      store.update((s) => (s.settings.parallel = t.dataset.parallel));
      dialog.close();
      if (route().view === 'read') renderReader();
    }
  };
  dialog.oninput = dialog.onchange = null;
  dialog.showModal();
}

async function downloadEverything(button) {
  const progress = document.getElementById('dl-progress');
  button.disabled = true;
  try {
    const files = await allDataFiles();
    let done = 0;
    for (const file of files) {
      await fetch(file).then((r) => r.ok && r.blob());
      done++;
      if (progress) progress.textContent = `${Math.round((done / files.length) * 100)}%`;
    }
    if (progress) progress.textContent = 'All set: everything is available offline.';
  } catch {
    if (progress) progress.textContent = 'Download interrupted. Check your connection and try again.';
    button.disabled = false;
  }
}

function exportBackup() {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bible-backup-${toDateString(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Routing ---------- */

function route() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { view: parts[0] || 'today', parts: parts.slice(1), params: new URLSearchParams(qs || '') };
}

function setActiveTab(view) {
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function router() {
  stopSpeaking();
  clearSelection();
  wordContext.lookup = null;
  const { view, parts, params } = route();
  setActiveTab(view);
  if (!bible) {
    main.innerHTML = '<div class="loading">Loading the Bible…</div>';
    return;
  }
  const views = { today: renderToday, read: () => openChapterFromRoute(parts), search: () => renderSearch(params), study: () => renderStudy(parts, params), memorize: () => renderPractice(main, store), plans: renderPlans, library: () => renderLibrary(parts[0]) };
  (views[view] || renderToday)();
}

/* ---------- Study ---------- */

function renderStudy(parts, params) {
  window.scrollTo(0, 0);
  if (parts[0] === 'word' && parts[1]) return renderWordPage(main, parts[1], bible, translation().abbr);
  if (parts[0] === 'topic' && parts[1]) return renderTopicPage(main, parts[1], bible, translation().abbr).catch(() => (main.innerHTML = '<div class="empty">Could not load this topic. Check your connection.</div>'));
  if (parts[0] === 'entry' && parts[1]) return renderDictionaryPage(main, parts[1]).catch(() => (main.innerHTML = '<div class="empty">Could not load this entry. Check your connection.</div>'));
  if (parts[0] === 'name' && parts[1]) {
    return renderNamePage(main, parts.slice(1).join('/'), bible, translation().abbr).catch(() => {
      main.innerHTML = '<div class="empty">Could not load this entry. Check your connection.</div>';
    });
  }
  if (parts[0] === 'verse' && parts[3]) {
    const book = Number(parts[1]);
    const chapter = Number(parts[2]);
    if (BOOKS[book] && chapter >= 1 && chapter <= bible.books[book].length) {
      const commentary = { preferred: store.get().settings.commentary, choose: (id) => store.update((s) => (s.settings.commentary = id)) };
      return renderVersePage(main, book, chapter, parts[3], translation().id, commentary).catch(() => {
        main.innerHTML = '<div class="empty">Could not load study data. Check your connection.</div>';
      });
    }
  }
  return renderStudyHome(main, ['dictionary', 'people', 'topics', 'bible-dictionary', 'maps', 'timeline', 'differences', 'about'].includes(parts[0]) ? parts[0] : 'dictionary', params, { book: current.book }).catch(() => {
    main.innerHTML = '<div class="empty">Could not load study data. Check your connection.</div>';
  });
}

/* ---------- Today ---------- */

function renderToday() {
  document.title = 'Bible';
  const st = store.get();
  const ref = parseReference(verseOfTheDay(), bible);
  const verses = [];
  for (let v = ref.verse; v <= (ref.verseEnd || ref.verse); v++) verses.push(v);
  const votdText = verses.map((v) => verseText(ref.book, ref.chapter, v)).join(' ');
  const last = st.history[0];
  const streak = computeStreak(st.readDates);

  let planHtml = `<p class="muted">Build a daily habit with a reading plan.</p><a class="btn" href="#/plans">Choose a plan</a>`;
  if (st.plan) {
    const plan = PLANS.find((p) => p.id === st.plan.id);
    const schedule = buildSchedule(bible, plan);
    const day = currentPlanDay(st.plan.startDate, new Date(), schedule.length);
    const done = Boolean(st.plan.done[`day:${day}`]);
    planHtml = `<strong>${plan.name}</strong> · Day ${day + 1} of ${schedule.length}
      <p class="votd-text" style="font-size:18px;margin-top:8px">${describeDay(schedule[day])}</p>
      <div class="row"><a class="btn btn-primary" href="${readHref(schedule[day][0].book, schedule[day][0].chapter)}">${done ? 'Read again' : 'Start reading'}</a><a class="btn" href="#/plans">${done ? '✓ Completed' : 'Plan details'}</a></div>`;
  }

  main.innerHTML = `
    <h1>${greeting()}</h1>
    <div class="dashboard">
    <section class="card card-wide">
      <div class="card-label">Verse of the day · ${translation().abbr}</div>
      <p class="votd-text">${escapeHtml(votdText)}</p>
      <div class="row"><a href="${readHref(ref.book, ref.chapter, ref.verse)}"><strong>${formatReference(ref.book, ref.chapter, verses)}</strong></a><span class="spacer"></span>
        <button class="btn btn-small" id="votd-image">Image</button><button class="btn btn-small" id="votd-related">Related verses</button><button class="btn btn-small" id="votd-share">Share</button></div>
    </section>
    ${last ? `<section class="card"><div class="card-label">Continue reading</div>
      <div class="row"><strong style="font-size:18px">${formatReference(last.book, last.chapter)}</strong><span class="spacer"></span><a class="btn btn-primary" href="${readHref(last.book, last.chapter)}">Continue</a></div></section>`
      : `<section class="card"><div class="card-label">Start reading</div><p class="muted">New here? The Gospel of John is a wonderful place to begin.</p><div class="row"><a class="btn btn-primary" href="${readHref(42, 1)}">Read John 1</a><a class="btn" href="${readHref(0, 1)}">Genesis 1</a></div></section>`}
    <section class="card"><div class="card-label">Today's plan</div>${planHtml}</section>
    ${todayPersonalHtml(st)}
    <section class="card row stats">
      <div><div class="stat">${streak}</div><div class="muted small">day streak</div></div><span class="spacer"></span>
      <div><div class="stat">${Object.keys(st.highlights).length}</div><div class="muted small">highlights</div></div><span class="spacer"></span>
      <div><div class="stat">${Object.keys(st.notes).length}</div><div class="muted small">notes</div></div>
    </section>
    </div>`;
  document.getElementById('votd-image').onclick = () => openImageDialog(dialog, { text: votdText, reference: `${formatReference(ref.book, ref.chapter, verses)} (${translation().abbr})` });
  document.getElementById('votd-related').onclick = () => openCrossRefsDialog(dialog, bible, ref.book, ref.chapter, [ref.verse], translation().abbr);
  document.getElementById('votd-share').onclick = () => shareText(`“${votdText}”\n— ${formatReference(ref.book, ref.chapter, verses)} (${translation().abbr})`);
}

function todayPersonalHtml(st) {
  const memory = Object.values(st.memory || {});
  const due = dueItems(memory, toDateString(new Date())).length;
  const praying = (st.prayers || []).filter((p) => !p.answered).length;
  return `<section class="card"><div class="card-label">Memory verses</div>
      ${memory.length ? `<p>${due ? `<strong>${due}</strong> verse${due === 1 ? '' : 's'} to review today.` : 'All caught up. Well done!'} <span class="muted small">${memory.length} in total.</span></p><a class="btn ${due ? 'btn-primary' : ''}" href="#/memorize">Practice</a>` : '<p class="muted">Hide God’s word in your heart: select a verse and tap <strong>Memorize</strong>.</p>'}
    </section>
    <section class="card"><div class="card-label">Prayer</div>
      <p>${praying ? `You are praying for <strong>${praying}</strong> thing${praying === 1 ? '' : 's'}.` : '<span class="muted">Keep a prayer list and record answers.</span>'}</p><a class="btn" href="#/library/prayers">Prayer list</a>
    </section>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/* ---------- Reader ---------- */

function openChapterFromRoute(parts) {
  if (!parts.length) {
    const last = store.get().history[0];
    location.replace(last ? readHref(last.book, last.chapter) : readHref(42, 1));
    return;
  }
  const book = findBook(parts[0]);
  const chapter = Math.max(1, parseInt(parts[1], 10) || 1);
  if (book < 0 || chapter > bible.books[book].length) {
    main.innerHTML = `<div class="empty">That passage couldn't be found. <a href="#/read">Go to reader</a></div>`;
    return;
  }
  const verse = parseInt(parts[2], 10);
  current = {
    book,
    chapter,
    scrollToVerse: verse
      ? () => {
          const el = main.querySelector(`.verse[data-v="${verse}"]`);
          if (el) {
            el.scrollIntoView({ block: 'center' });
            el.classList.add('flash');
          }
        }
      : null,
  };
  renderReader();
  if (verse) current.scrollToVerse();
  else window.scrollTo(0, 0);
  recordReading(book, chapter);
}

function recordReading(book, chapter) {
  store.update((st) => {
    st.history = [{ book, chapter, ts: Date.now() }, ...st.history.filter((h) => !(h.book === book && h.chapter === chapter))].slice(0, 50);
    const today = toDateString(new Date());
    if (!st.readDates.includes(today)) st.readDates = [...st.readDates, today].slice(-400);
  });
}

function renderReader() {
  const { book, chapter } = current;
  const st = store.get();
  const verses = bible.books[book][chapter - 1];
  const prev = adjacentChapter(-1);
  const next = adjacentChapter(1);
  const original = st.settings.readerMode === 'original';
  const abbr = translation().abbr;
  document.title = `${formatReference(book, chapter)} (${abbr}) — Bible`;

  const verseHtml = (text, v) => {
    const key = verseKey(book, chapter, v);
    const hl = st.highlights[key];
    const variant = variantMap.get(key);
    const icons = `${st.bookmarks[key] ? '<span class="verse-icon" title="Bookmarked">🔖</span>' : ''}${st.notes[key] ? `<a class="verse-icon" href="#" data-note="${v}" title="View note" aria-label="View note">📝</a>` : ''}`;
    const mark = variant ? `<a class="variant-mark" href="${studyVerseHref(book, chapter, v)}" title="Manuscripts differ in this verse" aria-label="Manuscript differences">†</a>` : '';
    const body = text ? escapeHtml(text) : `<span class="omitted">Not included in the ${abbr}: this verse is found only in later manuscripts.</span>`;
    return `<span class="verse${selection.has(v) ? ' selected' : ''}" data-v="${v}" ${hl ? `data-hl="${hl}"` : ''} tabindex="0"><sup>${v}</sup>${body}${mark}${icons}</span>`;
  };

  const parallel = original ? '' : parallelId();
  const parallelAbbr = parallel && translations.find((t) => t.id === parallel).abbr;
  const body = original
    ? '<div class="loading">Loading the original text…</div>'
    : parallel
      ? `<div class="pr-row pr-head"><div>${abbr}</div><div>${parallelAbbr}</div></div>${verses
          .map((text, i) => `<div class="pr-row"><div class="pr-a">${verseHtml(text, i + 1)}</div><div class="pr-b" data-pv="${i + 1}" lang="en"></div></div>`)
          .join('')}`
      : verses.map((text, i) => verseHtml(text, i + 1)).join(' ');

  main.innerHTML = `
    <div class="reader-nav">
      <a class="icon-btn" ${prev ? `href="${readHref(prev.book, prev.chapter)}"` : 'aria-disabled="true"'} aria-label="Previous chapter">${ICONS.prev}</a>
      <button class="chapter-title-btn" id="picker-btn" aria-haspopup="dialog"><span>${formatReference(book, chapter)}</span> ${ICONS.down}</button>
      <button class="btn btn-small reader-tool" id="translation-btn" aria-label="Translation: ${translation().name}${parallel ? ` with ${parallelAbbr}` : ''}" title="Change translation">${abbr}${parallel ? `<span class="tool-sub"> | ${parallelAbbr}</span>` : ''}</button>
      <button class="btn btn-small reader-tool" id="original-btn" aria-pressed="${original}" title="Show the original ${book < 39 ? 'Hebrew' : 'Greek'} word by word">${book < 39 ? 'עב' : 'Ελ'}<span class="tool-label"> Original</span></button>
      <button class="icon-btn" id="speak-btn" aria-label="Read aloud" title="Read aloud">${speaking ? ICONS.stop : ICONS.play}</button>
      <a class="icon-btn" ${next ? `href="${readHref(next.book, next.chapter)}"` : 'aria-disabled="true"'} aria-label="Next chapter">${ICONS.next}</a>
    </div>
    <article class="passage${st.settings.paragraphMode && !original && !parallel ? ' paragraphs' : ''}${original ? ' original-mode' : ''}${parallel ? ' parallel-mode' : ''}" lang="en">
      <h2>${BOOKS[book].name} · Chapter ${chapter}</h2>
      ${body}
    </article>
    <div class="chapter-footer">
      ${prev ? `<a class="btn" href="${readHref(prev.book, prev.chapter)}">← ${formatReference(prev.book, prev.chapter)}</a>` : '<span></span>'}
      ${next ? `<a class="btn btn-primary" href="${readHref(next.book, next.chapter)}">${formatReference(next.book, next.chapter)} →</a>` : ''}
    </div>`;

  document.getElementById('picker-btn').onclick = () => openPicker();
  document.getElementById('speak-btn').onclick = toggleSpeaking;
  document.getElementById('translation-btn').onclick = openTranslationPicker;
  document.getElementById('original-btn').onclick = () => {
    store.update((s) => (s.settings.readerMode = original ? 'text' : 'original'));
    renderReader();
  };

  // Link to a map when the chapter mentions places with known locations.
  loadChapterPlaces(book)
    .then((places) => {
      const list = places[chapter];
      if (!list?.length || current.book !== book || current.chapter !== chapter) return;
      main.querySelector('.chapter-footer')?.insertAdjacentHTML('afterend', `<p class="chapter-map-link"><a class="btn btn-small" href="#/study/maps?book=${book}&chapter=${chapter}">Map: ${list.length} place${list.length === 1 ? '' : 's'} in this chapter</a></p>`);
    })
    .catch(() => {});

  if (parallel) {
    loadTranslation(parallel)
      .then((second) => {
        if (current.book !== book || current.chapter !== chapter || route().view !== 'read') return;
        main.querySelectorAll('.pr-b[data-pv]').forEach((el) => {
          const v = Number(el.dataset.pv);
          const text = second.books[book][chapter - 1][v - 1];
          el.innerHTML = `<sup>${v}</sup>${text ? escapeHtml(text) : `<span class="omitted">Not included in the ${parallelAbbr}.</span>`}`;
        });
      })
      .catch(() => toast('Could not load the second translation.'));
  }

  if (!original && st.settings.crossRefs) {
    loadCrossRefs(book)
      .then((data) => {
        if (current.book !== book || current.chapter !== chapter || route().view !== 'read') return;
        main.querySelectorAll('.passage .verse[data-v]').forEach((el) => {
          el.insertAdjacentHTML('beforeend', inlineCrossRefsHtml(data[chapter - 1]?.[Number(el.dataset.v) - 1] || []));
        });
      })
      .catch(() => {});
  }

  if (original) {
    return loadOriginal(book)
      .then((data) => {
        if (current.book !== book || current.chapter !== chapter || route().view !== 'read') return;
        const passage = main.querySelector('.passage');
        const words = data.chapters[chapter - 1];
        passage.innerHTML = `<h2>${BOOKS[book].name} · Chapter ${chapter}</h2>${interlinearLegend(data.lang)}${verses
          .map((text, i) => `<div class="verse-block" data-v="${i + 1}">${verseHtml(text, i + 1)}${interlinearHtml(words[i]?.w || [], data.lang)}</div>`)
          .join('')}`;
        wordContext.lookup = (btn) => {
          const v = Number(btn.closest('.verse-block').dataset.v);
          return { word: words[v - 1].w[Number(btn.dataset.word)], lang: data.lang };
        };
        current.scrollToVerse?.();
      })
      .catch(() => {
        main.querySelector('.passage').innerHTML = '<div class="empty">The original text could not be loaded. Check your connection.</div>';
      });
  }
  return Promise.resolve();
}

function adjacentChapter(dir) {
  let { book, chapter } = current;
  chapter += dir;
  if (chapter < 1) {
    if (--book < 0) return null;
    chapter = bible.books[book].length;
  } else if (chapter > bible.books[book].length) {
    if (++book >= BOOKS.length) return null;
    chapter = 1;
  }
  return { book, chapter };
}

main.addEventListener('click', (e) => {
  if (route().view !== 'read') return;
  const noteLink = e.target.closest('[data-note]');
  if (noteLink) {
    e.preventDefault();
    return openNote([Number(noteLink.dataset.note)]);
  }
  if (e.target.closest('a, button')) return;
  const verse = e.target.closest('.verse');
  if (verse) toggleVerse(Number(verse.dataset.v));
});
main.addEventListener('keydown', (e) => {
  const verse = e.target.closest?.('.verse');
  if (verse && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    toggleVerse(Number(verse.dataset.v));
  }
});

// "+N" after the inline related verses opens the full list for that verse.
main.addEventListener('click', (e) => {
  const more = e.target.closest('[data-xref-more]');
  if (more) openCrossRefsDialog(dialog, bible, current.book, current.chapter, [Number(more.closest('.verse').dataset.v)], translation().abbr);
});

// Tapping a Hebrew/Greek word (reader in Original mode, or a study page) opens its word study.
main.addEventListener('click', (e) => {
  const btn = e.target.closest('.word');
  const found = btn && wordContext.lookup?.(btn);
  if (found?.word) openWordDialog(dialog, found.word, found.lang);
});

// Verse links inside dictionary definitions.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-ref]');
  if (!link) return;
  e.preventDefault();
  const [book, chapter, verse] = link.dataset.ref.split('.').map((x) => parseInt(x, 10));
  if (dialog.open) dialog.close();
  if (BOOKS[book]) location.hash = readHref(book, chapter || 1, verse || undefined);
});

function toggleVerse(v) {
  if (selection.has(v)) selection.delete(v);
  else selection.add(v);
  main.querySelector(`.verse[data-v="${v}"]`)?.classList.toggle('selected', selection.has(v));
  updateActionBar();
}

function clearSelection() {
  selection.clear();
  main.querySelectorAll('.verse.selected').forEach((el) => el.classList.remove('selected'));
  updateActionBar();
}

function updateActionBar() {
  actionBar.hidden = selection.size === 0;
  if (!selection.size) return;
  const verses = [...selection].sort((a, b) => a - b);
  document.getElementById('action-ref').textContent = formatReference(current.book, current.chapter, verses);
  const allBookmarked = verses.every((v) => store.get().bookmarks[verseKey(current.book, current.chapter, v)]);
  actionBar.querySelector('[data-action="bookmark"]').textContent = allBookmarked ? 'Unbookmark' : 'Bookmark';
}

function selectedPassageText() {
  const verses = [...selection].sort((a, b) => a - b);
  const text = verses
    .filter((v) => verseText(current.book, current.chapter, v))
    .map((v) => (verses.length > 1 ? `${v} ` : '') + verseText(current.book, current.chapter, v))
    .join(' ');
  return `“${text}”\n— ${formatReference(current.book, current.chapter, verses)} (${translation().abbr})`;
}

actionBar.addEventListener('click', async (e) => {
  const swatch = e.target.closest('.swatch');
  const btn = e.target.closest('[data-action]');
  const verses = [...selection].sort((a, b) => a - b);
  const keys = verses.map((v) => verseKey(current.book, current.chapter, v));
  if (swatch) {
    const color = swatch.dataset.color;
    store.update((st) => keys.forEach((k) => (color ? (st.highlights[k] = color) : delete st.highlights[k])));
    clearSelection();
    renderReader();
    return;
  }
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'bookmark': {
      const remove = keys.every((k) => store.get().bookmarks[k]);
      store.update((st) => keys.forEach((k) => (remove ? delete st.bookmarks[k] : (st.bookmarks[k] = Date.now()))));
      toast(remove ? 'Bookmark removed' : 'Bookmarked');
      clearSelection();
      renderReader();
      break;
    }
    case 'note':
      openNote(verses);
      break;
    case 'commentary':
      openCommentaryDialog(dialog, current.book, current.chapter, verses, store.get().settings.commentary, (id) => store.update((s) => (s.settings.commentary = id)));
      clearSelection();
      break;
    case 'memorize': {
      const key = memoryKey(current.book, current.chapter, verses);
      store.update((s) => (s.memory[key] ??= newItem(current.book, current.chapter, verses, translation().id)));
      toast(`Added ${formatReference(current.book, current.chapter, verses)} to memory verses`);
      clearSelection();
      break;
    }
    case 'pray':
      openPrayerDialog(dialog, store, bible, { seed: { book: current.book, chapter: current.chapter, verses } });
      clearSelection();
      break;
    case 'image': {
      const text = verses.map((v) => verseText(current.book, current.chapter, v)).filter(Boolean).join(' ');
      openImageDialog(dialog, { text, reference: `${formatReference(current.book, current.chapter, verses)} (${translation().abbr})` });
      clearSelection();
      break;
    }
    case 'xrefs':
      openCrossRefsDialog(dialog, bible, current.book, current.chapter, verses, translation().abbr);
      clearSelection();
      break;
    case 'study':
      location.hash = studyVerseHref(current.book, current.chapter, formatReference(current.book, current.chapter, verses).split(':')[1].replace(/\s/g, ''));
      break;
    case 'copy':
      try {
        await navigator.clipboard.writeText(selectedPassageText());
        toast('Copied to clipboard');
      } catch {
        toast('Copy not available');
      }
      clearSelection();
      break;
    case 'share':
      await shareText(selectedPassageText());
      clearSelection();
      break;
    case 'clear':
      clearSelection();
      break;
  }
});

async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
    } catch {
      // User cancelled the share sheet.
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Sharing not available');
  }
}

/* Notes are attached to the first selected verse; the dialog shows the full passage for context. */
function openNote(verses, { book = current.book, chapter = current.chapter, onSave } = {}) {
  const key = verseKey(book, chapter, verses[0]);
  const existing = store.get().notes[key];
  dialog.innerHTML = `
    <div class="dialog-head"><h2>Note · ${formatReference(book, chapter, verses)}</h2><button class="btn btn-small" data-close>Cancel</button></div>
    <form class="dialog-body" method="dialog">
      <p class="votd-text" style="font-size:17px">${escapeHtml(verses.map((v) => verseText(book, chapter, v)).join(' '))}</p>
      <textarea id="note-text" placeholder="What is God saying to you through this passage?" aria-label="Note">${escapeHtml(existing?.text || '')}</textarea>
      <div class="row" style="margin-top:12px">
        ${existing ? '<button type="button" class="btn" data-delete>Delete note</button>' : ''}
        <span class="spacer"></span><button class="btn btn-primary" data-save>Save note</button>
      </div>
    </form>`;
  dialog.onclick = (e) => {
    const t = e.target.closest('button');
    if (e.target === dialog || t?.hasAttribute('data-close')) return dialog.close();
    if (t?.hasAttribute('data-delete')) {
      store.update((st) => delete st.notes[key]);
      dialog.close();
      toast('Note deleted');
      (onSave || renderReader)();
    }
    if (t?.hasAttribute('data-save')) {
      e.preventDefault();
      const text = document.getElementById('note-text').value.trim();
      store.update((st) => (text ? (st.notes[key] = { text, updated: Date.now() }) : delete st.notes[key]));
      dialog.close();
      toast(text ? 'Note saved' : 'Note removed');
      clearSelection();
      (onSave || renderReader)();
    }
  };
  dialog.oninput = dialog.onchange = null;
  dialog.showModal();
  document.getElementById('note-text').focus();
}

function openPicker() {
  let pickedBook = null;
  const render = (filter = '') => {
    if (pickedBook !== null) {
      const count = bible.books[pickedBook].length;
      dialog.innerHTML = `
        <div class="dialog-head"><button class="btn btn-small" data-back>← Books</button><h2>${BOOKS[pickedBook].name}</h2><button class="btn btn-small" data-close>Close</button></div>
        <div class="dialog-body"><div class="chapter-grid">${Array.from({ length: count }, (_, i) => `<button data-chapter="${i + 1}" class="${pickedBook === current.book && i + 1 === current.chapter ? 'current' : ''}">${i + 1}</button>`).join('')}</div></div>`;
      return;
    }
    const f = filter.toLowerCase();
    const list = (t) =>
      BOOKS.filter((b) => b.testament === t && (!f || b.name.toLowerCase().includes(f) || b.abbr.toLowerCase().startsWith(f)))
        .map((b) => `<button data-book="${b.index}" class="${b.index === current.book ? 'current' : ''}">${b.name}</button>`)
        .join('');
    dialog.innerHTML = `
      <div class="dialog-head"><h2>Choose a book</h2><button class="btn btn-small" data-close>Close</button></div>
      <div class="dialog-body">
        <input class="picker-filter" id="picker-filter" placeholder="Filter books or type a reference (e.g. Rom 8:28)" value="${escapeHtml(filter)}" autocomplete="off">
        <h2>Old Testament</h2><div class="book-grid">${list('OT') || '<span class="muted">No matches</span>'}</div>
        <h2>New Testament</h2><div class="book-grid">${list('NT') || '<span class="muted">No matches</span>'}</div>
      </div>`;
    const input = document.getElementById('picker-filter');
    input.oninput = () => {
      const pos = input.selectionStart;
      render(input.value);
      const again = document.getElementById('picker-filter');
      again.focus();
      again.setSelectionRange(pos, pos);
    };
    input.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      const ref = parseReference(input.value, bible);
      if (ref) {
        dialog.close();
        location.hash = readHref(ref.book, ref.chapter, ref.verse);
      }
    };
  };
  render();
  dialog.onclick = (e) => {
    const t = e.target.closest('button');
    if (e.target === dialog || t?.hasAttribute('data-close')) return dialog.close();
    if (!t) return;
    if (t.hasAttribute('data-back')) {
      pickedBook = null;
      render();
    } else if (t.dataset.book) {
      pickedBook = Number(t.dataset.book);
      if (bible.books[pickedBook].length === 1) {
        dialog.close();
        location.hash = readHref(pickedBook, 1);
      } else render();
    } else if (t.dataset.chapter) {
      dialog.close();
      location.hash = readHref(pickedBook, Number(t.dataset.chapter));
    }
  };
  dialog.oninput = dialog.onchange = null;
  dialog.showModal();
}

/* Swipe left/right to change chapter. */
let touchStart = null;
main.addEventListener('touchstart', (e) => {
  if (route().view === 'read' && e.touches.length === 1) touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
main.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  const quick = Date.now() - touchStart.t < 600;
  touchStart = null;
  if (quick && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) {
    const target = adjacentChapter(dx < 0 ? 1 : -1);
    if (target) location.hash = readHref(target.book, target.chapter);
  }
});

document.addEventListener('keydown', (e) => {
  if (route().view !== 'read' || dialog.open || e.target.matches('input, textarea, select')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const target = adjacentChapter(e.key === 'ArrowRight' ? 1 : -1);
    if (target) location.hash = readHref(target.book, target.chapter);
  } else if (e.key === 'Escape') {
    clearSelection();
  }
});

/* ---------- Read aloud ---------- */

function toggleSpeaking() {
  if (speaking) return stopSpeaking();
  if (!('speechSynthesis' in window)) return toast('Read aloud is not supported in this browser');
  speaking = { verse: selection.size ? Math.min(...selection) : 1 };
  clearSelection();
  speakVerse();
  document.getElementById('speak-btn').innerHTML = ICONS.stop;
}

function speakVerse() {
  if (!speaking) return;
  const verses = bible.books[current.book][current.chapter - 1];
  main.querySelectorAll('.verse.speaking').forEach((el) => el.classList.remove('speaking'));
  if (speaking.verse > verses.length) return stopSpeaking();
  const el = main.querySelector(`.verse[data-v="${speaking.verse}"]`);
  el?.classList.add('speaking');
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (!verses[speaking.verse - 1]) {
    speaking.verse++;
    return speakVerse();
  }
  const u = new SpeechSynthesisUtterance(verses[speaking.verse - 1]);
  u.rate = store.get().settings.speechRate;
  u.lang = 'en-US';
  u.onend = () => {
    if (!speaking) return;
    speaking.verse++;
    speakVerse();
  };
  speechSynthesis.speak(u);
}

function stopSpeaking() {
  if (!speaking) return;
  speaking = null;
  speechSynthesis.cancel();
  main.querySelectorAll('.verse.speaking').forEach((el) => el.classList.remove('speaking'));
  const btn = document.getElementById('speak-btn');
  if (btn) btn.innerHTML = ICONS.play;
}

/* ---------- Search ---------- */

function renderSearch(params) {
  document.title = 'Search — Bible';
  const q = params.get('q') || '';
  const scope = params.get('scope') || 'all';
  const options = [['all', 'Whole Bible'], ['OT', 'Old Testament'], ['NT', 'New Testament'], ...BOOKS.map((b) => [String(b.index), b.name])];
  main.innerHTML = `
    <h1>Search</h1>
    <form class="search-form" id="search-form" role="search">
      <input id="q" type="search" name="q" value="${escapeHtml(q)}" placeholder='Words, "a phrase", or John 3:16' aria-label="Search the Bible" autocomplete="off">
      <select name="scope" aria-label="Search in">${options.map(([v, l]) => `<option value="${v}" ${v === scope ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </form>
    <div id="results"></div>`;
  const form = document.getElementById('search-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(form);
    location.hash = `#/search?q=${encodeURIComponent(data.get('q').trim())}&scope=${data.get('scope')}`;
  };
  form.scope.onchange = () => form.requestSubmit();
  if (!q) {
    document.getElementById('q').focus();
    document.getElementById('results').innerHTML = `<div class="empty">Search for words like <a href="#/search?q=grace">grace</a>, a phrase like <a href="#/search?q=%22be%20still%22">"be still"</a>, or jump to a reference like <a href="#/search?q=Psalm%2023">Psalm 23</a>.</div>`;
    return;
  }
  const results = document.getElementById('results');
  const ref = parseReference(q, bible);
  const refHtml = ref ? `<a class="result" href="${readHref(ref.book, ref.chapter, ref.verse)}"><strong>Go to ${formatReference(ref.book, ref.chapter, ref.verse ? [ref.verse] : [])} →</strong><span>${ref.verse ? escapeHtml(verseText(ref.book, ref.chapter, ref.verse)) : ''}</span></a>` : '';
  const { total, results: hits } = search(bible, q, { scope: /^\d+$/.test(scope) ? Number(scope) : scope, limit: 300 });
  results.innerHTML = `${refHtml}
    <p class="muted small">${total ? `${total.toLocaleString()} verse${total === 1 ? '' : 's'} found in the ${translation().abbr}${total > hits.length ? ` · showing first ${hits.length}` : ''}` : ref ? '' : 'No verses found. Try fewer words or a different spelling.'}</p>
    ${hits.map((h) => `<a class="result" href="${readHref(h.book, h.chapter, h.verse)}"><strong>${formatReference(h.book, h.chapter, [h.verse])}</strong><span>${highlightTerms(escapeHtml(h.text), q)}</span></a>`).join('')}`;

  // A subject search ("forgiveness", "tabernacle") also shows matching topics and dictionary articles.
  if (!q.includes('"') && q.split(/\s+/).length <= 3) {
    const lower = q.toLowerCase();
    Promise.all([loadTopicsIndex(), loadDictionaryIndex()])
      .then(([topics, dict]) => {
        const t = topics.filter((r) => r[1].toLowerCase() === lower || r[1].toLowerCase().startsWith(`${lower},`)).slice(0, 3);
        const d = dict.filter((r) => r[1].toLowerCase() === lower).slice(0, 2);
        if ((!t.length && !d.length) || !results.isConnected) return;
        results.insertAdjacentHTML('afterbegin', `<section class="card names-card"><div class="card-label">Topics & Bible dictionary</div>${t.map(topicRowHtml).join('')}${d.map(entryRowHtml).join('')}</section>`);
      })
      .catch(() => {});
  }

  // A name search ("Ruth", "Bethlehem") also shows matching people & places.
  if (!q.includes('"') && q.split(/\s+/).length <= 3) {
    const lower = q.toLowerCase();
    loadNamesIndex()
      .then((index) => {
        const matches = searchNames(index, q).filter((r) => r[1].toLowerCase() === lower || r[5].toLowerCase().split('|').includes(lower));
        if (!matches.length || !results.isConnected) return;
        results.insertAdjacentHTML('afterbegin', `<section class="card names-card"><div class="card-label">People & places</div>
          ${matches.slice(0, 4).map(nameRowHtml).join('')}
          ${matches.length > 4 ? `<p class="small"><a href="#/study/people?q=${encodeURIComponent(q)}">All ${matches.length} named “${escapeHtml(q)}” →</a></p>` : ''}</section>`);
      })
      .catch(() => {});
  }
}

/* ---------- Plans ---------- */

function renderPlans() {
  document.title = 'Reading plans — Bible';
  const st = store.get();
  let activeHtml = '';
  if (st.plan) {
    const plan = PLANS.find((p) => p.id === st.plan.id);
    const schedule = buildSchedule(bible, plan);
    const today = currentPlanDay(st.plan.startDate, new Date(), schedule.length);
    const shown = renderPlans.day ?? today;
    const doneCount = Object.keys(st.plan.done).length;
    const pct = Math.round((doneCount / schedule.length) * 100);
    activeHtml = `
      <section class="card">
        <div class="card-label">Your plan</div>
        <strong style="font-size:18px">${plan.name}</strong>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
        <p class="muted small">${doneCount} of ${schedule.length} days complete (${pct}%) · started ${new Date(st.plan.startDate + 'T00:00').toLocaleDateString()}</p>
        <div class="day-nav">
          <button class="icon-btn" data-day="${shown - 1}" ${shown <= 0 ? 'disabled' : ''} aria-label="Previous day">${ICONS.prev}</button>
          <strong>Day ${shown + 1}${shown === today ? ' · Today' : ''}</strong>
          <button class="icon-btn" data-day="${shown + 1}" ${shown >= schedule.length - 1 ? 'disabled' : ''} aria-label="Next day">${ICONS.next}</button>
          <span class="spacer"></span>
          ${shown !== today ? `<button class="btn btn-small" data-day="${today}">Today</button>` : ''}
        </div>
        <ul class="reading-list">
          ${schedule[shown].map((r) => `<li><a href="${readHref(r.book, r.chapter)}">${formatReference(r.book, r.chapter)}</a></li>`).join('')}
          <li><label class="row"><input type="checkbox" data-done="${shown}" ${st.plan.done[`day:${shown}`] ? 'checked' : ''}> Mark day ${shown + 1} complete</label></li>
        </ul>
        <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn btn-small" data-quit>Stop plan</button></div>
      </section>`;
  }
  main.innerHTML = `
    <h1>Reading plans</h1>
    ${activeHtml}
    <h2>${st.plan ? 'Other plans' : 'Choose a plan'}</h2>
    ${PLANS.filter((p) => p.id !== st.plan?.id)
      .map((p) => `<section class="card"><strong>${p.name}</strong><p class="muted small">${p.description} · ${p.days} days</p><button class="btn btn-small btn-primary" data-start="${p.id}">Start this plan</button></section>`)
      .join('')}`;
}

main.addEventListener('click', (e) => {
  if (route().view !== 'plans') return;
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.day !== undefined) {
    renderPlans.day = Number(t.dataset.day);
    renderPlans();
  } else if (t.dataset.start) {
    if (store.get().plan && !confirm('Start a new plan? Progress on your current plan will be lost.')) return;
    store.update((st) => (st.plan = { id: t.dataset.start, startDate: toDateString(new Date()), done: {} }));
    renderPlans.day = undefined;
    renderPlans();
    window.scrollTo(0, 0);
    toast('Plan started — happy reading!');
  } else if (t.hasAttribute('data-quit')) {
    if (!confirm('Stop this plan? Your progress will be cleared.')) return;
    store.update((st) => (st.plan = null));
    renderPlans.day = undefined;
    renderPlans();
  }
});
main.addEventListener('change', (e) => {
  const day = e.target.dataset?.done;
  if (day === undefined) return;
  store.update((st) => (e.target.checked ? (st.plan.done[`day:${day}`] = true) : delete st.plan.done[`day:${day}`]));
  renderPlans();
});

/* ---------- Library ---------- */

function renderLibrary(tab = 'highlights') {
  document.title = 'Library — Bible';
  const st = store.get();
  const sortKeys = (keys) =>
    keys.map(parseVerseKey).sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);
  const item = ({ book, chapter, verse }, extra = '') =>
    `<a class="result" href="${readHref(book, chapter, verse)}"><strong>${extra}${formatReference(book, chapter, [verse])}</strong><span>${escapeHtml(verseText(book, chapter, verse))}</span></a>`;

  let content = '';
  if (tab === 'highlights') {
    const keys = sortKeys(Object.keys(st.highlights));
    content = keys.length ? keys.map((k) => item(k, `<span class="dot" style="background:var(--hl-${st.highlights[verseKey(k.book, k.chapter, k.verse)]})"></span>`)).join('') : '<div class="empty">Tap any verse while reading to highlight it.</div>';
  } else if (tab === 'bookmarks') {
    const keys = Object.entries(st.bookmarks).sort((a, b) => b[1] - a[1]).map(([k]) => parseVerseKey(k));
    content = keys.length ? keys.map((k) => item(k)).join('') : '<div class="empty">Bookmarked verses will appear here.</div>';
  } else if (tab === 'notes') {
    const entries = Object.entries(st.notes).sort((a, b) => b[1].updated - a[1].updated);
    content = entries.length
      ? entries.map(([k, n]) => {
          const r = parseVerseKey(k);
          return `<div class="card"><div class="row"><a href="${readHref(r.book, r.chapter, r.verse)}"><strong>${formatReference(r.book, r.chapter, [r.verse])}</strong></a><span class="spacer"></span><span class="muted small">${new Date(n.updated).toLocaleDateString()}</span><button class="btn btn-small" data-edit-note="${k}">Edit</button></div>
            <p class="muted small" style="font-family:var(--font-reading)">${escapeHtml(verseText(r.book, r.chapter, r.verse))}</p><div class="note-text">${escapeHtml(n.text)}</div></div>`;
        }).join('')
      : '<div class="empty">Select a verse while reading and tap “Note” to write your thoughts.</div>';
  } else if (tab === 'memory' || tab === 'prayers') {
    content = '<div id="library-panel"><div class="loading">Loading…</div></div>';
  } else if (tab === 'history') {
    content = st.history.length
      ? st.history.map((h) => `<a class="result" href="${readHref(h.book, h.chapter)}"><strong>${formatReference(h.book, h.chapter)}</strong><span class="muted small">${new Date(h.ts).toLocaleString()}</span></a>`).join('')
      : '<div class="empty">Chapters you read will appear here.</div>';
  }
  const tabs = [['highlights', 'Highlights'], ['bookmarks', 'Bookmarks'], ['notes', 'Notes'], ['memory', 'Memory verses'], ['prayers', 'Prayers'], ['history', 'History']];
  main.innerHTML = `
    <h1>Library</h1>
    <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" aria-selected="${id === tab}" data-tab-link="${id}">${label}</button>`).join('')}</div>
    <div role="tabpanel">${content}</div>`;
  const panel = document.getElementById('library-panel');
  if (tab === 'memory') renderMemoryList(panel, store);
  if (tab === 'prayers') renderPrayers(panel, store, dialog, bible);
}

main.addEventListener('click', (e) => {
  if (route().view !== 'library') return;
  const tab = e.target.closest('[data-tab-link]');
  if (tab) location.hash = `#/library/${tab.dataset.tabLink}`;
  const edit = e.target.closest('[data-edit-note]');
  if (edit) {
    const { book, chapter, verse } = parseVerseKey(edit.dataset.editNote);
    openNote([verse], { book, chapter, onSave: () => renderLibrary('notes') });
  }
});

/* ---------- Boot ---------- */

document.getElementById('settings-btn').onclick = openSettings;
dialog.addEventListener('close', () => (dialog.innerHTML = ''));
window.addEventListener('hashchange', router);
applySettings();
router();

Promise.all([loadTranslationList(), loadVariants().catch(() => [])])
  .then(async ([list, variants]) => {
    translations = list;
    variantMap = new Map(variants.filter((x) => x.k || x.m || x.x).map((x) => [verseKey(...x.r), x]));
    bible = await loadTranslation(translation().id).catch(() => loadTranslation('kjv'));
    router();
    checkReminder(store, { title: 'Time for your Bible reading', body: 'You haven’t read today yet. Open today’s verse and reading plan.' });
  })
  .catch(() => {
    main.innerHTML = '<div class="empty">The Bible text could not be loaded. Check your connection and refresh.</div>';
  });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
