// Bible stories: ~150 well-known stories in order, each with a short introduction and the passage itself,
// shown as continuous prose so the Bible can be read like a book of stories.
import { findBook } from './bible.js';
import { load } from './data.js';
import { escapeHtml, readHref } from './util.js';
import { storyArt, hasArt } from './story-art.js';

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
/** Kids versions: { id: { text: [paragraphs], quiz: [{ q, options, answer }] } } */
export const loadKidsStories = () => load('data/kids-stories.json');

/** Number of correct answers. answers: chosen option index per question. */
export const quizScore = (quiz, answers) => quiz.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
export const starsText = (n, max = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
const isKidsMode = (store) => store.get().settings.storyMode === 'kids';
const modeSwitch = (store) => `<div class="segmented story-mode" role="group" aria-label="Story style">
    <button data-story-mode="everyone" aria-pressed="${!isKidsMode(store)}">Everyone</button>
    <button data-story-mode="kids" aria-pressed="${isKidsMode(store)}">Kids</button></div>`;
function bindModeSwitch(main, store, rerender) {
  main.querySelectorAll('[data-story-mode]').forEach((b) => {
    b.onclick = () => {
      store.update((s) => (s.settings.storyMode = b.dataset.storyMode));
      rerender();
    };
  });
}

/* ---------- Kids home: picture grid with stars ---------- */

async function renderKidsHome(main, store) {
  const [stories, kids] = await Promise.all([loadStories(), loadKidsStories()]);
  const list = stories.filter((s) => kids[s.id]);
  const stars = store.get().storyStars || {};
  const earned = list.reduce((n, s) => n + (stars[s.id] || 0), 0);
  main.innerHTML = `
    ${modeSwitch(store)}
    <h1>Kids Bible Stories</h1>
    <p class="muted">Short stories with pictures. Read or listen, then answer three questions to earn stars!</p>
    <section class="card star-total"><span class="big-star" aria-hidden="true">★</span><div><strong>${earned} of ${list.length * 3} stars</strong><br><span class="muted small">${(() => { const full = list.filter((s) => stars[s.id] === 3).length; return `${full} ${full === 1 ? 'story' : 'stories'} with all three stars`; })()}</span></div></section>
    <div class="kids-grid">${list
      .map((s) => `<a class="kids-card" href="${storyHref(s.id)}"><div class="kids-art">${storyArt(s.id, s.title)}</div><strong>${escapeHtml(s.title)}</strong><span class="stars" aria-label="${stars[s.id] || 0} of 3 stars">${starsText(stars[s.id] || 0)}</span></a>`)
      .join('')}</div>`;
  bindModeSwitch(main, store, () => renderStoriesHome(main, store));
}

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
  if (isKidsMode(store)) return renderKidsHome(main, store);
  const [sections, stories] = await Promise.all([loadStorySections(), loadStories()]);
  const read = stories.filter((s) => isRead(store, s.id)).length;
  const next = nextUnread(stories, store);
  const pct = Math.round((read / stories.length) * 100);
  let n = 0;
  main.innerHTML = `
    ${modeSwitch(store)}
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
  bindModeSwitch(main, store, () => renderStoriesHome(main, store));
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
  const kids = (await loadKidsStories().catch(() => ({})))[id];
  const kidsView = Boolean(kids) && isKidsMode(store);
  const tid = store.get().settings.storyTranslation || 'bsb';
  const t = translations.find((x) => x.id === tid) || translations[0];
  const bible = await ctx.loadTranslation(t.id);
  const verses = passageVerses(bible, passage);
  const prev = stories[story.index - 1];
  const next = stories[story.index + 1];
  const showNumbers = store.get().settings.storyVerseNumbers;
  document.title = `${story.title} — Bible Stories`;
  const bibleText = toParagraphs(verses.filter((v) => v.text))
    .map((p) => `<p>${p.map((v) => `<span class="sv" data-cv="${v.chapter}:${v.verse}">${showNumbers ? `<sup>${v.verse === 1 ? `${v.chapter}:` : ''}${v.verse}</sup>` : ''}${escapeHtml(v.text)}</span>`).join(' ')}</p>`)
    .join('');
  const text = kidsView ? kids.text.map((p, i) => `<p><span class="sv" data-cv="1:${i + 1}">${escapeHtml(p)}</span></p>`).join('') : bibleText;
  main.innerHTML = `
    <p><a href="#/stories">← All stories</a></p>
    <article class="story">
      <div class="card-label">${escapeHtml(story.section)} · Story ${story.index + 1} of ${stories.length}</div>
      <h1>${escapeHtml(story.title)}</h1>
      <p class="story-ref"><a href="${readHref(passage.book, passage.start.chapter, passage.start.verse)}">${escapeHtml(story.ref)}</a></p>
      ${hasArt(id) ? `<figure class="story-art">${storyArt(id, story.title)}</figure>` : ''}
      ${kids ? `<div class="segmented story-view" role="group" aria-label="Version"><button data-story-mode="kids" aria-pressed="${kidsView}">Kids version</button><button data-story-mode="everyone" aria-pressed="${!kidsView}">Bible text</button></div>` : ''}
      ${kidsView ? '<p class="muted small">A simple retelling for children. Tap “Bible text” to read the story straight from the Bible.</p>' : `<div class="story-intro">${escapeHtml(story.summary)}</div>`}
      <div class="story-tools">
        <button class="btn btn-primary" id="story-listen">▶ Listen</button>
        ${kidsView ? '' : `<div class="segmented story-translation" role="group" aria-label="Translation">${translations
          .map((x) => `<button data-story-t="${x.id}" aria-pressed="${x.id === t.id}" title="${escapeHtml(x.name)}">${x.abbr}</button>`)
          .join('')}</div>`}
      </div>
      <div class="story-text passage${kidsView ? ' kids-text' : ''}">${text}</div>
      ${kids ? `<section class="quiz" id="story-quiz">${quizHtml(kids.quiz, store.get().storyStars?.[id] || 0)}</section>` : ''}
      <section class="talk" id="story-questions" hidden></section>
      <div class="row story-end">
        ${kidsView ? '<span></span>' : `<label class="small"><input type="checkbox" id="story-numbers" ${showNumbers ? 'checked' : ''}> Show verse numbers</label>`}
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
  bindModeSwitch(main, store, () => renderStory(main, id, ctx));
  if (kids) bindQuiz(main.querySelector('#story-quiz'), kids.quiz, (score) => {
    store.update((s) => (s.storyStars = { ...(s.storyStars || {}), [id]: Math.max(score, s.storyStars?.[id] || 0) }));
    markRead();
  });
  const numbers = document.getElementById('story-numbers');
  if (numbers) numbers.onchange = (e) => {
    store.update((s) => (s.settings.storyVerseNumbers = e.target.checked));
    renderStory(main, id, ctx);
  };
  document.getElementById('story-listen').onclick = () => {
    const ok = kidsView
      ? ctx.audio.play(passage.book, 1, 1, { texts: kids.text, title: story.title })
      : ctx.audio.play(passage.book, passage.start.chapter, passage.start.verse, { until: passage.end, bible, title: story.title });
    if (!ok) ctx.toast('Listening is not supported in this browser');
  };
}

/* ---------- Quiz ---------- */

function quizHtml(quiz, best) {
  return `<h2>Quiz time! <span class="stars small" aria-label="Best: ${best} of 3 stars">${starsText(best)}</span></h2>
    <p class="muted small">Answer all three to earn stars.</p>
    ${quiz.map((q, i) => `<fieldset class="quiz-q" data-q="${i}"><legend>${i + 1}. ${escapeHtml(q.q)}</legend>
      ${q.options.map((o, j) => `<button type="button" class="quiz-option" data-option="${j}">${escapeHtml(o)}</button>`).join('')}
    </fieldset>`).join('')}
    <div class="quiz-result" aria-live="polite"></div>`;
}

/** Tap an answer: it is marked right or wrong, the right one is shown, and the score is reported at the end. */
function bindQuiz(box, quiz, onDone) {
  const answers = [];
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.quiz-option');
    if (btn) {
      const fs = btn.closest('.quiz-q');
      const qi = Number(fs.dataset.q);
      if (answers[qi] !== undefined) return;
      answers[qi] = Number(btn.dataset.option);
      fs.querySelectorAll('.quiz-option').forEach((b) => {
        b.disabled = true;
        if (Number(b.dataset.option) === quiz[qi].answer) b.classList.add('right');
      });
      if (answers[qi] !== quiz[qi].answer) btn.classList.add('wrong');
      if (answers.filter((a) => a !== undefined).length === quiz.length) {
        const score = quizScore(quiz, answers);
        const msg = ['Good try! Read the story again and have another go.', 'Nice start!', 'Great job!', 'Amazing! You got them all!'][score];
        box.querySelector('.quiz-result').innerHTML = `<p class="result-stars" aria-label="${score} of 3 stars">${starsText(score)}</p><p><strong>${msg}</strong> You got ${score} of ${quiz.length}.</p><button type="button" class="btn btn-small" data-retry>Try again</button>`;
        onDone(score);
      }
    }
    if (e.target.closest('[data-retry]')) {
      answers.length = 0;
      box.querySelectorAll('.quiz-option').forEach((b) => {
        b.disabled = false;
        b.classList.remove('right', 'wrong');
      });
      box.querySelector('.quiz-result').innerHTML = '';
    }
  });
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
