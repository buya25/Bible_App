# Bible App

A fast, offline-first Bible reading app for phones, tablets and desktops. It needs no account and no build step, and it can be installed to the home screen or desktop as an app (PWA).

## Features

- **Five translations:** KJV, World English Bible (WEB), Berean Standard Bible (BSB), Young's Literal Translation (YLT) and the American Standard Version (ASV), all public domain.
- **Original Hebrew and Greek:** turn on **Original** in the reader to see each verse word by word, with the original word, transliteration, literal English meaning and Strong's number. Hebrew reads right to left.
- **Dictionary (lexicon):** tap any original word for its definition and grammar, how translators render it, how often it occurs, and every verse where it is used. You can also search by English word, Hebrew/Greek word or Strong's number.
- **People & places dictionary:** 3,129 people, 1,006 places and 102 other names (angels and other spiritual beings, months, festivals, titles). Each entry has a short summary, family links (parents, siblings, spouses, children), the name in Hebrew/Greek, a map link for places, and every verse where it appears. Search by any form of a name (Abram/Abraham, Saul/Paul), browse A–Z, or filter people, places and other. Names are also recognised in the Search tab, in verse studies, and when you tap a name in the original text.
- **Cross references:** about 340,000 links between related verses, strongest first. Select verses and tap **Related**, or turn on **Settings → Show related verses under each verse** for study-Bible-style references in the reader. The verse of the day and verse study pages show them too.
- **Commentaries:** Matthew Henry (1706–1721, devotional and practical) and Jamieson, Fausset & Brown (1871, concise verse-by-verse notes), both public domain. Select verses and tap **Commentary**, or see them on the verse study page. Bible references inside the notes are tappable.
- **Verse study:** select verses and tap **Study** to compare all translations side by side, read the original, and see manuscript differences.
- **Manuscript differences:** the reader marks verses where manuscripts differ with †. The Study tab lists verses that are missing from the oldest manuscripts (for example Matthew 17:21 and Acts 8:37), the longer passages (Mark 16:9–20, John 7:53–8:11), the largest wording differences, and Old Testament words found in the Septuagint or Dead Sea Scrolls but not in the standard Hebrew text.
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
- **Works offline:** your current translation is cached on the device after the first visit. **Settings → Download everything** caches all translations, the original texts and the dictionary.
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

The tests cover reference parsing, search, reading-plan schedules, streaks, grammar-code decoding, dictionary lookup and search, and the integrity of the data: 66 books, 31,102 verses, every translation aligned to the same verse structure, and original-language words for every verse.

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
| `js/study.js` | Interlinear, word studies, verse comparison, manuscript differences |
| `js/data.js` | Loading and caching of data files; dictionary search |
| `js/names.js` | People & places dictionary: search, browse and entry pages |
| `js/crossrefs.js` | Cross references: lookup, labels, dialog and inline display |
| `js/commentary.js` | Commentaries: loading (gzip), section lookup, dialog and panel |
| `js/morph.js` | Turns Hebrew/Greek grammar codes into plain English |
| `data/translations/` | One JSON file per translation, aligned to KJV verse numbering |
| `data/original/` | Hebrew/Greek words for each verse (one file per book, loaded on demand) |
| `data/lexicon/` | Hebrew/Greek dictionary with usage statistics, split by Strong's number |
| `data/names/` | People & places (one file per letter, plus a search index) |
| `data/crossrefs/` | Related verses for every verse (one file per book) |
| `data/commentary/` | Commentaries, one gzip-compressed file per book |
| `data/variants.json` | Verses where manuscripts differ |
| `tools/build_data.py` | Regenerates everything in `data/` from the open sources |
| `sw.js`, `manifest.webmanifest` | Offline support and installability |

## Data sources and licences

| Data | Source | Licence |
| --- | --- | --- |
| KJV | [thiagobodruk/bible](https://github.com/thiagobodruk/bible) | Public domain |
| BSB, YLT, ASV | [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | Public domain |
| Cross references | [OpenBible.info](https://www.openbible.info/labs/cross-references/) via scrollmapper/bible_databases | [CC BY](https://creativecommons.org/licenses/by/4.0/) |
| Matthew Henry, Jamieson-Fausset-Brown commentaries | [Free Use Bible API](https://bible.helloao.org) via [joathanmf/bibliaco-dados](https://github.com/joathanmf/bibliaco-dados) (checksums verified) | Public domain |
| WEB | [seven1m/open-bibles](https://github.com/seven1m/open-bibles) | Public domain |
| Hebrew OT (TAHOT), Greek NT (TAGNT), lexicons (TBESH, TBESG), people & places (TIPNR) | [STEPBible.org](https://github.com/STEPBible/STEPBible-Data), Tyndale House, Cambridge | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

STEPBible adapted the people & places summaries from AI-generated text, and the app says so on each entry. Map coordinates come from [OpenBible.info](https://www.openbible.info/geo/) via STEPBible.

The STEPBible data is reformatted, not reworded. `tools/build_data.py` keeps the needed fields, reduces the lexicon HTML to bold, italics, line breaks and verse links, and maps references to KJV verse numbering. To regenerate the data, clone the sources into one folder and run:

```sh
python3 tools/build_data.py /path/to/sources
```
