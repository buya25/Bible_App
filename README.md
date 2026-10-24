# Bible App

A fast, offline-first Bible reading app for phones, tablets and desktops. It needs no account and no build step, and it can be installed to the home screen or desktop as an app (PWA).

## Features

- **Reader:** chapter picker, previous/next buttons, swipe gestures on touch screens, arrow keys on desktop, and paragraph or verse-by-verse layout.
- **Highlights:** five colours, applied to one verse or several at once.
- **Notes and bookmarks:** attach your own reflections to any verse.
- **Copy and share:** passages are copied or shared with their reference, e.g. "John 3:16-17 (KJV)".
- **Search:** find words or `"exact phrases"`, limit the search to the Old Testament, New Testament or one book, or type a reference like `Rom 8:28` to jump straight there.
- **Read aloud:** text-to-speech highlights each verse as it is read, with adjustable speed.
- **Reading plans:** whole Bible in a year, New Testament in 90 days, Gospels in 30 days, Psalms & Proverbs, Old Testament in a year. Daily readings are balanced by verse count.
- **Today screen:** verse of the day, continue where you left off, today's plan reading and your reading streak.
- **Library:** all your highlights, bookmarks, notes and reading history in one place.
- **Comfort settings:** light, sepia and dark themes (or follow the system), serif or sans font, text size and line spacing.
- **Private by design:** your data stays in your browser. Export and import a backup file to move it between devices.
- **Works offline:** after the first visit, the full Bible text is cached on the device.
- **Responsive layout:** bottom tabs on phones, wider card layouts on tablets, and top navigation with a comfortable reading width on desktop.

## Running locally

Any static file server works. For example:

```sh
npm start            # python3 -m http.server 8080
# open http://localhost:8080
```

To deploy, upload the folder to any static host, such as GitHub Pages, Netlify or Cloudflare Pages.

## Tests

```sh
npm test             # node --test, no dependencies
```

The tests cover reference parsing, search, reading-plan schedules, streaks and the integrity of the Bible data (66 books, 1,189 chapters, 31,102 verses).

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | App shell |
| `css/styles.css` | Themes and responsive layout |
| `js/app.js` | UI: routing, reader, search, plans, library, settings |
| `js/bible.js` | Book metadata, reference parsing, search (pure functions) |
| `js/plans.js` | Reading plan schedules and streaks (pure functions) |
| `js/store.js` | Local storage of user data |
| `js/votd.js` | Verse of the day |
| `data/kjv.json` | King James Version text (public domain) |
| `sw.js`, `manifest.webmanifest` | Offline support and installability |
