// Offline support: cache the app shell and Bible text, serve cache-first, refresh in the background.
// VERSION is stamped by the publish workflow, so every release changes this file and the browser
// notices the update. A new version waits until the reader taps "Update" (see js/app.js).
const VERSION = 'dev';
const CACHE = `bible-app-${VERSION}-v15`;
const ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/bible.js',
  'js/plans.js',
  'js/store.js',
  'js/votd.js',
  'js/util.js',
  'js/data.js',
  'js/morph.js',
  'js/study.js',
  'js/names.js',
  'js/crossrefs.js',
  'js/commentary.js',
  'js/topics.js',
  'js/maps.js',
  'js/timeline.js',
  'js/memory.js',
  'js/prayers.js',
  'js/verse-image.js',
  'js/reminders.js',
  'js/safety.js',
  'js/onboarding.js',
  'js/audio.js',
  'js/stories.js',
  'js/story-art.js',
  'data/kids-stories.json',
  'js/feedback.js',
  'js/version.js',
  'js/config.js',
  'data/stories.json',
  'data/story-questions.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'data/translations/index.json',
  'data/translations/kjv.json',
  'data/structure.json',
  'data/variants.json',
  'icons/icon.svg',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  // First install: start right away. Later versions wait for the reader to choose "Update".
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => (self.registration.active ? undefined : self.skipWaiting())));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// Daily reminder in the background (installed app on browsers with Periodic Background Sync).
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'daily-reminder') return;
  event.waitUntil(
    self.registration.showNotification('Time for your Bible reading', {
      body: 'Open today’s verse and reading plan.',
      icon: 'icons/icon-192.png',
      tag: 'daily-reminder',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => 'focus' in c);
      return client ? client.focus() : self.clients.openWindow('./#/today');
    }),
  );
});
