// Bible stories: ~150 well-known stories in order, each with a short introduction and the passage itself,
// shown as continuous prose so the Bible can be read like a book of stories.
import { findBook } from './bible.js';
import { load } from './data.js';
import { escapeHtml, readHref } from './util.js';

export const loadStorySections = () => load('data/stories.json');

/** All stories in order: [{ id, title, ref, summary, section, index, book, chapter, verse }]. */
export async function loadStories() {
  const sections = await loadStorySections();
  const list = [];
  for (const s of sections) {
    for (const [id, title, ref, summary] of s.stories) {
      const p = parsePassage(ref);
      list.push({ id, title, ref, summary, section: s.section, index: list.length, book: p.book, chapter: p.start.chapter, verse: p.start.verse });
    }
  }
  return list;
}

export const loadStoryQuestions = () => load('data/story-questions.json');

/** "Genesis 1:1-2:3", "1 Samuel 17:1-58" → { book, start: {chapter, verse}, end: {chapter, verse} } or null. */
export function parsePassage(ref) {
  const m = String(ref).match(/^(.+?)\s+(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/);
  if (!m) return null;
  const book = findBook(m[1]);
  if (book < 0) return null;
  const start = { chapter: Number(m[2]), verse: Number(m[3]) };
  const end = m[5] ? { chapter: Number(m[4] || m[2]), verse: Number(m[5]) } : { ...start };
  return { book, start, end };
}

/** Verses of a passage: [{ chapter, verse, text }]. */
export function passageVerses(bible, { book, start, end }) {
  const out = [];
  for (let c = start.chapter; c <= end.chapter; c++) {
    const verses = bible.books[book][c - 1] || [];
    const from = c === start.chapter ? start.verse : 1;
    const to = c === end.chapter ? end.verse : verses.length;
    for (let v = from; v <= Math.min(to, verses.length); v++) out.push({ chapter: c, verse: v, text: verses[v - 1] });
  }
  return out;
}

/** Group verses into readable paragraphs: break after a sentence ends, about every 3–5 verses. */
export function toParagraphs(verses) {
  const paragraphs = [];
  let current = [];
  for (const v of verses) {
    current.push(v);
    const ends = /[.!?]["'”’)]*$/.test(v.text.trim());
    if ((current.length >= 3 && ends) || current.length >= 6) {
      paragraphs.push(current);
      current = [];
    }
  }
  if (current.length) paragraphs.push(current);
  return paragraphs;
}

export const storyHref = (id) => `#/stories/${id}`;
const isRead = (store, id) => Boolean(store.get().storiesRead?.[id]);
export const nextUnread = (stories, store) => stories.find((s) => !isRead(store, s.id)) || null;

/* ---------- Stories home ---------- */

export async function renderStoriesHome(main, store) {
  document.title = 'Stories — Bible';
  const [sections, stories] = await Promise.all([loadStorySections(), loadStories()]);
  const read = stories.filter((s) => isRead(store, s.id)).length;
  const next = nextUnread(stories, store);
  const pct = Math.round((read / stories.length) * 100);
  let n = 0;
  main.innerHTML = `
    <h1>Bible Stories</h1>
    <p class="muted">The Bible is one big story told through many stories. Read them in order like a book, from Creation to the new creation. Each one has a short introduction, then the story itself straight from the Bible.</p>
    <section class="card">
      <div class="card-label">Your progress</div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
      <p class="muted small">${read} of ${stories.length} stories read</p>
      ${next ? `<a class="btn btn-primary" href="${storyHref(next.id)}">${read ? 'Continue' : 'Start'}: ${escapeHtml(next.title)}</a>` : '<p><strong>You have read every story. Well done!</strong></p>'}
    </section>
    <input class="picker-filter" id="story-filter" type="search" placeholder="Find a story (e.g. David, storm, lost son)" aria-label="Find a story" autocomplete="off">
    ${sections
      .map((s) => `<section class="story-section"><h2>${escapeHtml(s.section)}</h2><ol class="story-list" start="${n + 1}">${s.stories
        .map(([id, title, ref, summary]) => {
          n++;
          return `<li data-search="${escapeHtml(`${title} ${ref} ${summary}`.toLowerCase())}"><a href="${storyHref(id)}" class="story-row${isRead(store, id) ? ' read' : ''}"><strong>${escapeHtml(title)}</strong><span class="muted small">${escapeHtml(ref)}</span>${isRead(store, id) ? '<span class="read-mark" aria-label="Read">✓</span>' : ''}</a></li>`;
        })
        .join('')}</ol></section>`)
      .join('')}`;
  const filter = document.getElementById('story-filter');
  filter.oninput = () => {
    const q = filter.value.trim().toLowerCase();
    main.querySelectorAll('.story-list li').forEach((li) => (li.hidden = q && !li.dataset.search.includes(q)));
    main.querySelectorAll('.story-section').forEach((sec) => (sec.hidden = ![...sec.querySelectorAll('li')].some((li) => !li.hidden)));
  };
}

/* ---------- One story ---------- */

/**
 * ctx: { store, translations, currentId, loadTranslation, audio, toast }
 * Stories default to an easy modern translation (BSB) unless the reader picks another.
 */
export async function renderStory(main, id, ctx) {
  const { store, translations } = ctx;
  const stories = await loadStories();
  const story = stories.find((s) => s.id === id);
  if (!story) {
    main.innerHTML = '<div class="empty">Story not found. <a href="#/stories">All stories</a></div>';
    return;
  }
  const passage = parsePassage(story.ref);
  const tid = store.get().settings.storyTranslation || 'bsb';
  const t = translations.find((x) => x.id === tid) || translations[0];
  const bible = await ctx.loadTranslation(t.id);
  const verses = passageVerses(bible, passage);
  const prev = stories[story.index - 1];
  const next = stories[story.index + 1];
  const showNumbers = store.get().settings.storyVerseNumbers;
  document.title = `${story.title} — Bible Stories`;
  const text = toParagraphs(verses.filter((v) => v.text))
    .map((p) => `<p>${p.map((v) => `<span class="sv" data-cv="${v.chapter}:${v.verse}">${showNumbers ? `<sup>${v.verse === 1 ? `${v.chapter}:` : ''}${v.verse}</sup>` : ''}${escapeHtml(v.text)}</span>`).join(' ')}</p>`)
    .join('');
  main.innerHTML = `
    <p><a href="#/stories">← All stories</a></p>
    <article class="story">
      <div class="card-label">${escapeHtml(story.section)} · Story ${story.index + 1} of ${stories.length}</div>
      <h1>${escapeHtml(story.title)}</h1>
      <p class="story-ref"><a href="${readHref(passage.book, passage.start.chapter, passage.start.verse)}">${escapeHtml(story.ref)}</a></p>
      <div class="story-intro">${escapeHtml(story.summary)}</div>
      <div class="story-tools">
        <button class="btn btn-primary" id="story-listen">▶ Listen</button>
        <div class="segmented story-translation" role="group" aria-label="Translation">${translations
          .map((x) => `<button data-story-t="${x.id}" aria-pressed="${x.id === t.id}" title="${escapeHtml(x.name)}">${x.abbr}</button>`)
          .join('')}</div>
      </div>
      <div class="story-text passage">${text}</div>
      <section class="talk" id="story-questions" hidden></section>
      <div class="row story-end">
        <label class="small"><input type="checkbox" id="story-numbers" ${showNumbers ? 'checked' : ''}> Show verse numbers</label>
        <span class="spacer"></span>
        <a class="btn btn-small" href="${readHref(passage.book, passage.start.chapter, passage.start.verse)}">Read in context</a>
      </div>
    </article>
    <nav class="story-nav">
      ${prev ? `<a class="btn" href="${storyHref(prev.id)}">← ${escapeHtml(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="btn btn-primary" href="${storyHref(next.id)}" data-finish>${escapeHtml(next.title)} →</a>` : `<a class="btn btn-primary" href="#/stories" data-finish>Finish</a>`}
    </nav>`;
  window.scrollTo(0, 0);
  loadStoryQuestions()
    .then((all) => {
      const qs = all[id];
      const box = main.querySelector('#story-questions');
      if (!qs?.length || !box) return;
      box.innerHTML = `<h2>Talk about it</h2><p class="muted small">For families, small groups or your own reflection.</p><ol>${qs.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ol>`;
      box.hidden = false;
    })
    .catch(() => {});
  const markRead = () =>
    store.update((s) => {
      s.storiesRead = { ...(s.storiesRead || {}), [id]: Date.now() };
      // On the "one story a day" plan, finishing a story completes its day.
      if (s.plan?.id === 'stories') s.plan.done[`day:${story.index}`] = true;
    });
  main.querySelector('[data-finish]').addEventListener('click', markRead);
  // Reaching the end of the story counts as reading it.
  const end = main.querySelector('.story-end');
  if ('IntersectionObserver' in window && end) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        markRead();
        io.disconnect();
      }
    });
    setTimeout(() => end.isConnected && io.observe(end), 1500);
  }
  main.querySelectorAll('[data-story-t]').forEach((b) => {
    b.onclick = () => {
      store.update((s) => (s.settings.storyTranslation = b.dataset.storyT));
      renderStory(main, id, ctx);
    };
  });
  document.getElementById('story-numbers').onchange = (e) => {
    store.update((s) => (s.settings.storyVerseNumbers = e.target.checked));
    renderStory(main, id, ctx);
  };
  document.getElementById('story-listen').onclick = () => {
    const ok = ctx.audio.play(passage.book, passage.start.chapter, passage.start.verse, { until: passage.end, bible, title: story.title });
    if (!ok) ctx.toast('Listening is not supported in this browser');
  };
}

/** Today screen card: the next story to read. */
export async function storyCardHtml(store) {
  const stories = await loadStories();
  const next = nextUnread(stories, store);
  if (!next) return '';
  const read = stories.filter((s) => isRead(store, s.id)).length;
  return `<section class="card"><div class="card-label">Bible stories · ${read} of ${stories.length}</div>
    <p><strong>${escapeHtml(next.title)}</strong> <span class="muted small">${escapeHtml(next.ref)}</span><br><span class="muted">${escapeHtml(next.summary)}</span></p>
    <a class="btn btn-primary" href="${storyHref(next.id)}">${read ? 'Read the next story' : 'Start with Creation'}</a></section>`;
}
