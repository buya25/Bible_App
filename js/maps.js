// Maps of Bible places (Leaflet, bundled in vendor/; OpenStreetMap tiles need an internet connection).
import { BOOKS } from './bible.js';
import { load } from './data.js';
import { loadNamesIndex, nameHref } from './names.js';
import { escapeHtml, readHref } from './util.js';

export const loadChapterPlaces = (book) => load(`data/places/${book}.json`);

let leaflet = null;
/** Load Leaflet on first use (script + stylesheet from vendor/leaflet). */
export function ensureLeaflet() {
  leaflet ??= new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    // Wait for both the stylesheet and the script: without Leaflet's CSS the map panes are mispositioned.
    const loaded = (el) =>
      new Promise((ok, fail) => {
        el.onload = ok;
        el.onerror = fail;
        document.head.append(el);
      });
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css' });
    const script = Object.assign(document.createElement('script'), { src: 'vendor/leaflet/leaflet.js' });
    Promise.all([loaded(css), loaded(script)])
      .then(() => resolve(window.L))
      .catch(() => {
        leaflet = null;
        reject(new Error('Leaflet failed to load'));
      });
  });
  return leaflet;
}

/**
 * Draw places on a map inside `el`. places: [{ id, name, lat, lon, label }].
 * Returns the Leaflet map (or null if the map library could not load).
 */
export async function drawMap(el, places, { zoom = 8 } = {}) {
  let L;
  try {
    L = await ensureLeaflet();
  } catch {
    el.innerHTML = '<p class="muted small map-fallback">The map could not be loaded.</p>';
    return null;
  }
  if (!el.isConnected) return null;
  const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · locations: OpenBible.info',
  }).addTo(map);
  let warned = false;
  tiles.on('tileerror', () => {
    if (warned) return;
    warned = true;
    el.insertAdjacentHTML('beforeend', '<div class="map-offline">Map background needs an internet connection. Places are still marked.</div>');
  });
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6b4f2a';
  const markers = places.map((p) =>
    L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: accent, fillOpacity: 0.95 })
      .bindPopup(`<strong><a href="${nameHref(p.id)}">${escapeHtml(p.name)}</a></strong>${p.label ? `<br><span>${escapeHtml(p.label)}</span>` : ''}`)
      .bindTooltip(escapeHtml(p.name), { direction: 'top', offset: [0, -6] })
      .addTo(map),
  );
  const fit = () => {
    map.invalidateSize();
    if (places.length === 1) map.setView([places[0].lat, places[0].lon], zoom);
    else if (places.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2), { maxZoom: 9 });
    else map.setView([31.78, 35.23], 6); // Jerusalem
  };
  fit();
  // Fit again once layout has settled (fonts, scrollbars) so every place is in view.
  requestAnimationFrame(() => setTimeout(fit, 0));
  // Popup links navigate within the app.
  map.on('popupopen', (e) => e.popup.getElement()?.querySelector('a')?.addEventListener('click', () => map.closePopup()));
  return map;
}

/** Index rows → map places. Rows: [id, name, kind, brief, mentions, alt, strongs, type, anon, lat, lon] */
const toPlace = (row, label) => ({ id: row[0], name: row[1], lat: row[9], lon: row[10], label: label ?? row[3] });

/** Places (with locations) mentioned in a chapter, or in a whole book when chapter is 0. */
export async function placesFor(book, chapter) {
  const [byChapter, index] = await Promise.all([loadChapterPlaces(book), loadNamesIndex()]);
  const byId = new Map(index.map((r) => [r[0], r]));
  const counts = new Map();
  for (const [c, list] of Object.entries(byChapter)) {
    if (chapter && Number(c) !== chapter) continue;
    for (const [id, n] of list) counts.set(id, (counts.get(id) || 0) + n);
  }
  return [...counts.entries()]
    .map(([id, n]) => ({ row: byId.get(id), n }))
    .filter((x) => x.row && x.row.length > 10)
    .sort((a, b) => b.n - a.n);
}

/* ---------- Study → Maps ---------- */

export async function renderMapsPage(panel, params, current) {
  const book = params.has('book') ? Number(params.get('book')) : current.book;
  const chapter = Number(params.get('chapter') || 0);
  const chapters = (await loadChapterPlaces(book).catch(() => ({}))) || {};
  const href = (b, c) => `#/study/maps?book=${b}${c ? `&chapter=${c}` : ''}`;
  panel.innerHTML = `
    <div class="map-controls">
      <select id="map-book" class="picker-filter" aria-label="Book">${BOOKS.map((b) => `<option value="${b.index}" ${b.index === book ? 'selected' : ''}>${b.name}</option>`).join('')}</select>
      <select id="map-chapter" class="picker-filter" aria-label="Chapter">
        <option value="0">Whole book</option>
        ${Object.keys(chapters).map((c) => `<option value="${c}" ${Number(c) === chapter ? 'selected' : ''}>Chapter ${c}</option>`).join('')}
      </select>
    </div>
    <div class="map" id="places-map"></div>
    <div id="map-list"><div class="loading">Loading…</div></div>`;
  document.getElementById('map-book').onchange = (e) => (location.hash = href(e.target.value, 0));
  document.getElementById('map-chapter').onchange = (e) => (location.hash = href(book, Number(e.target.value)));
  const places = await placesFor(book, chapter);
  const where = chapter ? `${BOOKS[book].name} ${chapter}` : BOOKS[book].name;
  document.getElementById('map-list').innerHTML = places.length
    ? `<p class="muted small">${places.length} place${places.length === 1 ? '' : 's'} with a known location in ${escapeHtml(where)}${chapter ? ` · <a href="${readHref(book, chapter)}">Read ${escapeHtml(where)}</a>` : ''}. Many ancient sites are uncertain.</p>
       ${places.map(({ row, n }) => `<a class="result name-result" href="${nameHref(row[0])}"><strong>${escapeHtml(row[1])}<span class="muted small"> · ${n} verse${n === 1 ? '' : 's'}</span></strong><span class="small">${escapeHtml(row[3])}</span></a>`).join('')}`
    : `<div class="empty">No places with a known location in ${escapeHtml(where)}.</div>`;
  await drawMap(
    document.getElementById('places-map'),
    places.map(({ row, n }) => toPlace(row, `${row[3]} · ${n} verse${n === 1 ? '' : 's'}`)),
  );
}

/** Small map on a place's entry page. */
export async function drawPlaceMap(el, id) {
  const index = await loadNamesIndex();
  const row = index.find((r) => r[0] === id);
  if (row && row.length > 10) await drawMap(el, [toPlace(row)], { zoom: 9 });
  else el.remove();
}
