// Collections: themed sets of passages under the Stories tab (parables, miracles, the Ten Commandments,
// the Law of Moses, prayers). Each item is a passage with a short explanation, read like a story.
import { load } from './data.js';
import { escapeHtml, readHref } from './util.js';
import { parsePassage, passageVerses, toParagraphs, storyTabs, loadStories, loadKidsStories, storyHref } from './stories.js';

/** [{ id, title, icon, description, pray?, items: [{ n, title, ref, explanation, related: [ref] }] }] */
export async function loadCollections() {
  const raw = await load('data/collections.json');
  return raw.map((c) => ({
    ...c,
    items: c.items.map(([title, ref, explanation, related = []], i) => ({ n: i + 1, title, ref, explanation, related })),
  }));
}

export const collectionsHref = () => '#/stories/collections';
export const collectionHref = (cid) => `#/stories/collections/${cid}`;
export const itemHref = (cid, n) => `#/stories/collections/${cid}/${n}`;


const doneKey = (cid, n) => `${cid}:${n}`;
const isDone = (store, cid, n) => Boolean(store.get().collectionsRead?.[doneKey(cid, n)]);

/** The story with a Kids version that starts where this passage starts, if any. */
export function kidsStoryFor(passage, stories, kids) {
  return stories.find((st) => kids[st.id] && st.book === passage.book && st.chapter === passage.start.chapter && st.verse === passage.start.verse) || null;
}

/** Router entry. parts: ['collections', cid?, n?]. ctx as for renderStory. */
export async function renderCollections(main, parts, ctx) {
  const all = await loadCollections();
  const [, cid, n] = parts;
  if (!cid) return renderHome(main, all, ctx.store);
  const c = all.find((x) => x.id === cid);
  if (!c) {
    main.innerHTML = `<div class="empty">Collection not found. <a href="${collectionsHref()}">All collections</a></div>`;
    return;
  }
  if (!n) return renderCollection(main, c, ctx.store);
  const item = c.items[Number(n) - 1];
  if (!item) {
    main.innerHTML = `<div class="empty">Not found. <a href="${collectionHref(c.id)}">${escapeHtml(c.title)}</a></div>`;
    return;
  }
  return renderItem(main, c, item, ctx);
}

function renderHome(main, all, store) {
  document.title = 'Collections — Bible';
  main.innerHTML = `
    ${storyTabs('collections')}
    <h1>Collections</h1>
    <p class="muted">The parables and miracles, the Ten Commandments and the Law of Moses, great prayers, psalms for every need, great teachings and God's promises, gathered in one place. Each passage has a short explanation.</p>
    <div class="collection-grid">${all
      .map((c) => {
        const done = c.items.filter((it) => isDone(store, c.id, it.n)).length;
        return `<a class="collection-card" href="${collectionHref(c.id)}"><span class="collection-icon" aria-hidden="true">${c.icon}</span><strong>${escapeHtml(c.title)}</strong><span class="muted small">${c.items.length} passages${done ? ` · ${done} read` : ''}</span></a>`;
      })
      .join('')}</div>
    <p class="muted small">The short explanations are written to help you get started. They are not a substitute for reading the passage itself, or for a pastor or teacher.</p>`;
}

function renderCollection(main, c, store) {
  document.title = `${c.title} — Bible`;
  main.innerHTML = `
    <p><a href="${collectionsHref()}">← All collections</a></p>
    <h1><span aria-hidden="true">${c.icon}</span> ${escapeHtml(c.title)}</h1>
    <p class="muted">${escapeHtml(c.description)}</p>
    <input class="picker-filter" id="collection-filter" type="search" placeholder="Find in ${escapeHtml(c.title)}" aria-label="Find in this collection" autocomplete="off">
    <ol class="story-list">${c.items
      .map((it) => `<li data-search="${escapeHtml(`${it.title} ${it.ref} ${it.explanation}`.toLowerCase())}"><a href="${itemHref(c.id, it.n)}" class="story-row${isDone(store, c.id, it.n) ? ' read' : ''}"><strong>${escapeHtml(it.title)}</strong><span class="muted small">${escapeHtml(it.ref)}</span>${isDone(store, c.id, it.n) ? '<span class="read-mark" aria-label="Read">✓</span>' : ''}</a></li>`)
      .join('')}</ol>`;
  const filter = document.getElementById('collection-filter');
  filter.oninput = () => {
    const q = filter.value.trim().toLowerCase();
    main.querySelectorAll('.story-list li').forEach((li) => (li.hidden = q && !li.dataset.search.includes(q)));
  };
}

async function renderItem(main, c, item, ctx) {
  const { store, translations } = ctx;
  const passage = parsePassage(item.ref);
  const tid = store.get().settings.storyTranslation || 'bsb';
  const t = translations.find((x) => x.id === tid) || translations[0];
  const bible = await ctx.loadTranslation(t.id);
  const verses = passageVerses(bible, passage).filter((v) => v.text);
  const [stories, kids] = await Promise.all([loadStories(), loadKidsStories()]).catch(() => [[], {}]);
  const kidsStory = kidsStoryFor(passage, stories, kids);
  const showNumbers = store.get().settings.storyVerseNumbers;
  const prev = c.items[item.n - 2];
  const next = c.items[item.n];
  document.title = `${item.title} — ${c.title}`;
  const text = toParagraphs(verses)
    .map((p) => `<p>${p.map((v) => `<span class="sv">${showNumbers ? `<sup>${v.verse}</sup>` : ''}${escapeHtml(v.text)}</span>`).join(' ')}</p>`)
    .join('');
  const related = item.related
    .map((ref) => ({ ref, p: parsePassage(ref) }))
    .filter((r) => r.p);
  main.innerHTML = `
    <p><a href="${collectionHref(c.id)}">← ${escapeHtml(c.title)}</a></p>
    <article class="story">
      <div class="card-label">${escapeHtml(c.title)} · ${item.n} of ${c.items.length}</div>
      <h1>${escapeHtml(item.title)}</h1>
      <p class="story-ref"><a href="${readHref(passage.book, passage.start.chapter, passage.start.verse)}">${escapeHtml(item.ref)}</a></p>
      <div class="story-intro">${escapeHtml(item.explanation)}</div>
      <div class="story-tools">
        <button class="btn btn-primary" id="item-listen">▶ Listen</button>
        ${c.pray ? '<button class="btn" id="item-pray">🙏 Pray this</button>' : ''}
        ${kidsStory ? `<a class="btn" id="item-kids" href="${storyHref(kidsStory.id)}">🧒 Kids version + quiz</a>` : ''}
        <div class="segmented story-translation" role="group" aria-label="Translation">${translations
          .map((x) => `<button data-story-t="${x.id}" aria-pressed="${x.id === t.id}" title="${escapeHtml(x.name)}">${x.abbr}</button>`)
          .join('')}</div>
      </div>
      <div class="story-text passage">${text}</div>
      ${related.length ? `<section class="related"><h2>${c.id === 'ten-commandments' ? 'How Jesus and the apostles taught it' : 'Read alongside'}</h2>${related
        .map((r) => `<div class="related-passage"><a href="${readHref(r.p.book, r.p.start.chapter, r.p.start.verse)}"><strong>${escapeHtml(r.ref)}</strong></a><p>${escapeHtml(passageVerses(bible, r.p).map((v) => v.text).filter(Boolean).join(' '))}</p></div>`)
        .join('')}</section>` : ''}
      <div class="row story-end">
        <label class="small"><input type="checkbox" id="item-numbers" ${showNumbers ? 'checked' : ''}> Show verse numbers</label>
        <span class="spacer"></span>
        <a class="btn btn-small" href="${readHref(passage.book, passage.start.chapter, passage.start.verse)}">Read in context</a>
      </div>
    </article>
    <nav class="story-nav">
      ${prev ? `<a class="btn" href="${itemHref(c.id, prev.n)}">← ${escapeHtml(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="btn btn-primary" href="${itemHref(c.id, next.n)}" data-finish>${escapeHtml(next.title)} →</a>` : `<a class="btn btn-primary" href="${collectionHref(c.id)}" data-finish>Finish</a>`}
    </nav>`;
  window.scrollTo(0, 0);
  const markRead = () => store.update((s) => (s.collectionsRead = { ...(s.collectionsRead || {}), [doneKey(c.id, item.n)]: Date.now() }));
  main.querySelector('[data-finish]').addEventListener('click', markRead);
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
  const rerender = () => renderItem(main, c, item, ctx);
  main.querySelectorAll('[data-story-t]').forEach((b) => {
    b.onclick = () => {
      store.update((s) => (s.settings.storyTranslation = b.dataset.storyT));
      rerender();
    };
  });
  document.getElementById('item-numbers').onchange = (e) => {
    store.update((s) => (s.settings.storyVerseNumbers = e.target.checked));
    rerender();
  };
  document.getElementById('item-listen').onclick = () => {
    const ok = ctx.audio.play(passage.book, passage.start.chapter, passage.start.verse, { until: passage.end, bible, title: item.title });
    if (!ok) ctx.toast('Listening is not supported in this browser');
  };
  const kidsLink = document.getElementById('item-kids');
  if (kidsLink) kidsLink.onclick = () => store.update((s) => (s.settings.storyMode = 'kids'));
  const pray = document.getElementById('item-pray');
  if (pray) pray.onclick = () => ctx.pray?.(item, passage);
}
