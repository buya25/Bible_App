#!/usr/bin/env python3
"""Build the app's data files from open-licensed sources.

Usage: python3 tools/build_data.py <sources-dir>

<sources-dir> must contain:
  bible_databases/sources/extras/cross_references.txt   OpenBible.info cross references (CC BY), via scrollmapper
  commentaries/<id>.en.jsonl.gz                        github.com/joathanmf/bibliaco-dados release classicos-en-2026-10-19
                                                        (from bible.helloao.org; public domain)
  bible-data/BibleData-Event.csv, BibleData-Epoch.csv  github.com/BradyStephenson/bible-data (CC BY 4.0)
  bible-data/NavesTopicalDictionary.csv                 github.com/BradyStephenson/bible-data (CC BY 4.0)
  bible-dictionary-dataset/data/01_parsed/*.json        github.com/neuu-org/bible-dictionary-dataset (CC BY 4.0;
                                                        Easton 1897 + Smith 1863, public domain)
  thiagobodruk/en_kjv.json                              github.com/thiagobodruk/bible (keeps "LORD" small caps)
  bible_databases/formats/json/{BSB,YLT,ASV}.json       github.com/scrollmapper/bible_databases
  open-bibles/eng-web.usfx.xml                          github.com/seven1m/open-bibles
  STEPBible-Data/...                                    github.com/STEPBible/STEPBible-Data (CC BY 4.0)

Outputs (all under data/):
  translations/<id>.json   verse text aligned to KJV versification ("" = verse absent)
  original/<book>.json     Hebrew/Greek words per verse + manuscript notes
  lexicon/<H|G><n>.json    lexicon entries with usage statistics, chunked by Strong's number
  lexicon/index.json       compact search index for the dictionary
  variants.json            verses where the Greek/Hebrew manuscript traditions differ
  names/<letter>.json      people, places and other named things (STEPBible TIPNR)
  names/index.json         compact search index for people & places
  crossrefs/<book>.json    related verses for each verse, strongest first (OpenBible.info)
  commentary/<id>/<book>.json.gz  commentary sections per chapter, gzip-compressed (decompressed in the browser)
  commentary/index.json    available commentaries
  topics/<letter>.json     Nave's Topical Bible, with verse references parsed
  places/<book>.json       places (with map locations) mentioned in each chapter
  timeline.json            dated events and periods
  topics/index.json        topic search index
  dictionary/<letter>.json Easton's and Smith's Bible dictionaries
  dictionary/index.json    dictionary search index

STEPBible data is reformatted (not reworded): fields are selected, HTML is reduced to
<b>/<i>/<br> and verse links, and references are mapped to KJV versification.
"""
import csv
import glob
import gzip
import html
import json
import os
import re
import sys
from collections import Counter, defaultdict

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')

STEP_CODES = ('Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer '
              'Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal '
              'Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev').split()
STEP_BOOK = {c: i for i, c in enumerate(STEP_CODES)}
BOOK_NAMES = [l.split("'")[1] for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../js/bible.js')) if l.startswith("  ['")]
USFX_CODES = ('GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER '
              'LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL '
              'EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV').split()


def write_json(path, data):
    path = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))


def clean_text(s):
    s = re.sub(r'\s+', ' ', s).strip()
    return s.replace(' ,', ',').replace(' .', '.').replace(' ;', ';').replace(' :', ':')


# ---------------------------------------------------------------- translations

TRANSLATIONS = [
    ('kjv', 'KJV', 'King James Version', 1611, 'Traditional English translation from the Textus Receptus.'),
    ('web', 'WEB', 'World English Bible', 2020, 'Modern English, updated ASV. Public domain.'),
    ('bsb', 'BSB', 'Berean Standard Bible', 2023, 'Modern, accurate and readable. Public domain.'),
    ('ylt', 'YLT', "Young's Literal Translation", 1898, 'Very literal: follows Hebrew and Greek word order and tenses.'),
    ('asv', 'ASV', 'American Standard Version', 1901, 'Formal, literal revision of the KJV.'),
]


def load_scrollmapper(code):
    with open(os.path.join(SRC, 'bible_databases/formats/json', f'{code}.json'), encoding='utf-8') as f:
        data = json.load(f)
    books = []
    for book in data['books'][:66]:
        chapters = {}
        for ch in book['chapters']:
            chapters[ch['chapter']] = {v['verse']: clean_text(v['text']) for v in ch['verses']}
        books.append(chapters)
    return books


def load_usfx(path):
    with open(path, encoding='utf-8') as f:
        s = f.read()
    books = [dict() for _ in range(66)]
    for m in re.finditer(r'<book id="(\w+)"[^>]*>(.*?)</book>', s, re.S):
        if m.group(1) not in USFX_CODES:
            continue  # skip front matter and deuterocanonical books
        b = USFX_CODES.index(m.group(1))
        body = re.sub(r'<f\b.*?</f>|<x\b.*?</x>', '', m.group(2), flags=re.S)  # footnotes, cross refs
        body = re.sub(r'<(h|toc|id|ide|rem|d|s|mt|ms|r)\b[^>]*>.*?</\1>', '', body, flags=re.S)  # headings/titles
        chapter = 0
        for part in re.split(r'(<c id="\d+"\s*/>|<v id="[\d\-]+"[^>]*/>|<ve\s*/>)', body):
            cm = re.match(r'<c id="(\d+)"', part)
            vm = re.match(r'<v id="(\d+)', part)
            if cm:
                chapter = int(cm.group(1))
                books[b].setdefault(chapter, {})
                verse = None
            elif vm:
                verse = int(vm.group(1))
            elif part.startswith('<ve'):
                verse = None
            elif chapter and verse:
                text = html.unescape(re.sub(r'<[^>]+>', '', part))
                prev = books[b][chapter].get(verse, '')
                books[b][chapter][verse] = clean_text(prev + ' ' + text)
    return books


def align(books, kjv):
    """Fit a translation onto KJV chapter/verse structure. Extra verses are appended to the last verse."""
    out = []
    for b, chapters in enumerate(kjv):
        out_book = []
        for c, verses in enumerate(chapters, start=1):
            src = books[b].get(c, {})
            row = [src.get(v, '') for v in range(1, len(verses) + 1)]
            extra = [src[v] for v in sorted(src) if v > len(verses)]
            if extra and row:
                row[-1] = clean_text(' '.join([row[-1]] + extra))
            out_book.append(row)
        out.append(out_book)
    return out


def build_translations():
    with open(os.path.join(SRC, 'thiagobodruk/en_kjv.json'), encoding='utf-8-sig') as f:
        kjv = [[[clean_text(v) for v in ch] for ch in book['chapters']] for book in json.load(f)]
    web = load_usfx(os.path.join(SRC, 'open-bibles/eng-web.usfx.xml'))
    # WEB places the closing doxology at Romans 14:24-26; the KJV and most Bibles have it at 16:25-27.
    for i in range(3):
        web[44][16][25 + i] = web[44][14].pop(24 + i)
    sources = {'kjv': None, 'web': web,
               'bsb': load_scrollmapper('BSB'), 'ylt': load_scrollmapper('YLT'), 'asv': load_scrollmapper('ASV')}
    meta = []
    for tid, abbr, name, year, desc in TRANSLATIONS:
        books = kjv if tid == 'kjv' else align(sources[tid], kjv)
        missing = sum(1 for b in books for c in b for v in c if not v)
        print(f'  {abbr}: {sum(len(c) for b in books for c in b)} verses, {missing} empty')
        write_json(f'translations/{tid}.json', {'id': tid, 'abbr': abbr, 'name': name, 'books': books})
        meta.append({'id': tid, 'abbr': abbr, 'name': name, 'year': year, 'description': desc})
    return kjv, meta


# ---------------------------------------------------------------- original language

REF_RE = re.compile(r'^(\w+)\.(\d+)\.(\d+)(?:[\[({](?:(\d+)\.)?(\d+)[\])}])?(?:[\[({][^#]*)?#(\d+)=(\S+)$')


def kjv_ref(field, kjv, greek):
    """Map a STEPBible reference to (book, chapter, verse) in KJV versification."""
    m = re.match(r'^(\w+)\.(\d+)\.(\d+)(.*?)#', field)
    book = STEP_BOOK[m.group(1)]
    chapter, verse = int(m.group(2)), int(m.group(3))
    if greek:
        # NRSV reference first, KJV in [square brackets] when different.
        km = re.search(r'\[(?:(\d+)\.)?(\d+)\]', m.group(4))
        if km:
            chapter = int(km.group(1) or chapter)
            verse = int(km.group(2))
    chapter = min(chapter, len(kjv[book]))
    verse = min(verse, len(kjv[book][chapter - 1]))
    return book, chapter, verse


def strip_tags(s):
    return clean_text(html.unescape(re.sub(r'<[^>]+>', '', s)))


def build_original(kjv):
    base = os.path.join(SRC, 'STEPBible-Data/Translators Amalgamated OT+NT')
    books = [[[[] for _ in ch] for ch in kjv[b]] for b in range(66)]
    notes = [[[[] for _ in ch] for ch in kjv[b]] for b in range(66)]
    usage = defaultdict(lambda: {'n': 0, 'g': Counter(), 'r': []})

    def add_usage(strong, gloss, ref):
        u = usage[strong]
        u['n'] += 1
        g = re.sub(r'[\[\]<>.,;:!?“”"‘’]', '', gloss).strip().lower()
        if g:
            u['g'][g] += 1
        if len(u['r']) < 400 and (not u['r'] or u['r'][-1] != ref):
            u['r'].append(ref)

    for path in sorted(glob.glob(os.path.join(base, 'TAHOT*.txt'))):
        with open(path, encoding='utf-8-sig') as f:
            for line in f:
                cols = line.rstrip('\n').split('\t')
                if not re.match(r'^\w+\.\d+\.\d+.*#\d+=', cols[0]) or len(cols) < 6:
                    continue
                b, c, v = kjv_ref(cols[0], kjv, False)
                wtype = cols[0].split('=', 1)[1]
                main = re.search(r'\{(H\d+[A-Za-z]?)\}', cols[4])
                strong = main.group(1) if main else cols[4].split('/')[0].strip('{}')
                hebrew = cols[1].replace('/', '').replace('\\', '')
                gloss = cols[3].replace('/ ', ' ').replace('/', ' ').strip()
                variant = 0 if wtype[0] in 'LQ' else 1  # X/R/V = words from other ancient sources (LXX, DSS…)
                books[b][c - 1][v - 1].append([hebrew, cols[2].replace('/', ''), gloss, strong, cols[5], variant])
                if not variant:
                    # Count only the gloss of the main morpheme (not prefixes like "and"/"the" or suffixes like "his").
                    strongs = [x.split('\\')[0] for x in cols[4].split('/')]
                    glosses = cols[3].split('/')
                    main_i = next((i for i, x in enumerate(strongs) if x.startswith('{')), 0)
                    main_gloss = glosses[main_i] if len(glosses) == len(strongs) else gloss
                    add_usage(strong, main_gloss, b * 1000000 + c * 1000 + v)

    for path in sorted(glob.glob(os.path.join(base, 'TAGNT*.txt'))):
        with open(path, encoding='utf-8-sig') as f:
            for line in f:
                cols = line.rstrip('\n').split('\t')
                if not re.match(r'^\w+\.\d+\.\d+.*#\d+=', cols[0]) or len(cols) < 6:
                    continue
                b, c, v = kjv_ref(cols[0], kjv, True)
                wtype = cols[0].split('=', 1)[1]
                gm = re.match(r'^(.*?)\s*\((.*)\)\s*$', cols[1])
                greek, translit = (gm.group(1), gm.group(2)) if gm else (cols[1], '')
                strong, _, morph = cols[3].partition('=')
                # Source flags: N = Nestle-Aland (modern), K = KJV's Textus Receptus, O = other editions.
                # Upper case = difference that affects translation; lower case = minor.
                inN, inK = 'N' in wtype.upper(), 'K' in wtype.upper()
                if not inN and not inK:
                    continue  # words used by neither the KJV nor modern Bibles
                status = 0
                if inK and not inN:
                    status = 2 if 'K' in wtype else 3  # 2 = only in KJV's text (significant), 3 = minor
                elif inN and not inK:
                    status = 4 if 'N' in wtype else 5  # 4 = only in modern text (significant), 5 = minor
                strong = re.sub(r'^.*\|', '', strong.split('«')[-1])
                greek = greek.replace('¶', '').strip()
                books[b][c - 1][v - 1].append([greek, translit, cols[2], strong, morph, status])
                add_usage(strong, cols[2], b * 1000000 + c * 1000 + v)
                note = cols[13].strip() if len(cols) > 13 else ''
                if note and note[0] in '^v':
                    text = strip_tags(note[1:])
                    if text and text not in notes[b][c - 1][v - 1]:
                        notes[b][c - 1][v - 1].append(text)

    variants = []
    for b in range(66):
        chapters = []
        for c, verses in enumerate(books[b]):
            chapter = []
            for v, words in enumerate(verses):
                chapter.append({'w': words, 'n': notes[b][c][v]} if notes[b][c][v] else {'w': words})
                kjv_only = sum(1 for w in words if w[5] == 2)
                modern_only = sum(1 for w in words if w[5] == 4)
                other = sum(1 for w in words if w[5] == 1) if b < 39 else 0
                total = len(words)
                if kjv_only or modern_only or other:
                    variants.append({
                        'r': [b, c + 1, v + 1],
                        'k': kjv_only, 'm': modern_only, 'x': other,
                        'whole': bool(total and b >= 39 and kjv_only == total),
                        'n': notes[b][c][v][:1],
                    })
            chapters.append(chapter)
        lang = 'hbo' if b < 39 else 'grc'
        write_json(f'original/{b}.json', {'lang': lang, 'chapters': chapters})
    print(f'  original: {len(variants)} verses with manuscript differences')
    write_json('variants.json', variants)
    return usage


# ---------------------------------------------------------------- lexicon

STEP_REF = re.compile(r"<ref='([^']+)'>(.*?)</ref>", re.S)


def convert_ref(m):
    target, label = m.group(1).rstrip('.'), strip_tags(m.group(2))
    rm = re.match(r'^(\w+)\.(\d+)(?:\.(\d+))?', target)
    if rm and rm.group(1) in STEP_BOOK:
        b = STEP_BOOK[rm.group(1)]
        c, v = (rm.group(2), rm.group(3)) if rm.group(3) else ('1', rm.group(2)) if rm.group(1) in ('Oba', 'Phm', '2Jn', '3Jn', 'Jud') else (rm.group(2), '')
        return f'<a data-ref="{b}.{c}.{v}">{html.escape(label)}</a>'
    return html.escape(label)


def sanitize_definition(s):
    s = STEP_REF.sub(lambda m: '\x00' + convert_ref(m) + '\x01', s)
    parts = re.split(r'(\x00.*?\x01)', s)
    out = []
    for p in parts:
        if p.startswith('\x00'):
            out.append(p[1:-1])
            continue
        p = re.sub(r'<(/?)(b|i)\s*>', lambda m: f'\x02{m.group(1)}{m.group(2).lower()}\x03', p, flags=re.I)
        p = re.sub(r'<br\s*/?>', '\x02br\x03', p, flags=re.I)
        p = re.sub(r'<[^>]+>', '', p)
        p = html.escape(html.unescape(p), quote=False)
        out.append(p.replace('\x02', '<').replace('\x03', '>'))
    s = ''.join(out)
    s = re.sub(r'(<br>\s*)+', '<br>', s).strip()
    s = re.sub(r'^(<br>)+|(<br>)+$', '', s)
    return s.replace('__', '')


def build_lexicon(usage):
    base = os.path.join(SRC, 'STEPBible-Data/Lexicons')
    entries = {}
    for path in sorted(glob.glob(os.path.join(base, 'TBES*.txt'))):
        with open(path, encoding='utf-8-sig') as f:
            for line in f:
                cols = line.rstrip('\n').split('\t')
                if len(cols) < 8 or not re.match(r'^[HG]\d+', cols[0]):
                    continue
                dstrong = cols[1].split('=')[0].strip()
                if not re.match(r'^[HG]\d+[A-Za-z]?$', dstrong) or dstrong in entries:
                    continue
                entries[dstrong] = {
                    'l': cols[3], 't': cols[4], 'p': cols[5].split(':', 1)[-1], 'g': cols[6].strip(),
                    'd': sanitize_definition(cols[7]),
                }
    chunks = defaultdict(dict)
    index = []
    for key, e in entries.items():
        u = usage.get(key)
        if u:
            e['n'] = u['n']
            e['u'] = [[g, n] for g, n in u['g'].most_common(12)]
            e['r'] = u['r']
        num = int(re.match(r'[HG](\d+)', key).group(1))
        chunks[f'{key[0]}{num // 500}'][key] = e
        index.append([key, e['l'], e['t'], e['g'], e.get('n', 0)])
    for name, data in chunks.items():
        write_json(f'lexicon/{name}.json', data)
    index.sort(key=lambda x: (x[0][0], int(re.match(r'[HG](\d+)', x[0]).group(1)), x[0]))
    write_json('lexicon/index.json', index)
    missing = [k for k in usage if k not in entries]
    print(f'  lexicon: {len(entries)} entries in {len(chunks)} chunks; {len(missing)} used strongs without entry e.g. {missing[:5]}')


# ---------------------------------------------------------------- people & places

def parse_step_refs(text, kjv):
    """'Gen.17.5; Gen.17.23a; LXX Gen.4.8' -> packed refs (book*1e6 + chapter*1e3 + verse) valid in KJV numbering."""
    out = []
    for part in text.split(';'):
        m = re.match(r'^\s*(\w+)\.(\d+)\.(\d+)[a-z]?\s*$', part)
        if not m or m.group(1) not in STEP_BOOK:
            continue  # skips LXX-only references and malformed entries
        b, c, v = STEP_BOOK[m.group(1)], int(m.group(2)), int(m.group(3))
        if c <= len(kjv[b]) and 1 <= v <= len(kjv[b][c - 1]):
            out.append(b * 1000000 + c * 1000 + v)
    return out


def article_html(s):
    """Reduce an @Article/@Short text to paragraphs with verse links."""
    def ref(m):
        target = m.group(1).split(';')[0].strip()
        rm = re.match(r'^(\w+)\.(\d+)(?:\.(\d+))?', target)
        label = html.escape(strip_tags(m.group(2)))
        if rm and rm.group(1) in STEP_BOOK:
            return f'<a data-ref="{STEP_BOOK[rm.group(1)]}.{rm.group(2)}.{rm.group(3) or ""}">{label}</a>'
        return label
    parts = re.split(r'(<ref="[^"]*">.*?</ref>)', s)
    out = []
    for part in parts:
        m = re.match(r'<ref="([^"]*)">(.*?)</ref>', part)
        if m:
            out.append(ref(m))
        else:
            out.append(html.escape(html.unescape(re.sub(r'<(?!BR\b|br\b)[^>]+>', '', part)), quote=False))
    text = ''.join(out)
    text = re.sub(r'&lt;br\s*/?&gt;|<br\s*/?>', '\n', text, flags=re.I)
    return ''.join(f'<p>{p.strip()}</p>' for p in text.split('\n') if p.strip())


def split_ids(field):
    """'Terah@Gen.11.24-Luk + ' or 'A@x, B@y(d)' -> [[id, note]]"""
    out = []
    for item in re.split(r',|\+', field):
        item = item.strip()
        if '@' not in item:
            continue
        m = re.match(r'^(.*?)(?:\((\w|\?)\))?$', item)
        note = {'d': 'descendant', 'a': 'ancestor', 'f': 'founder', '?': 'uncertain'}.get(m.group(2) or '', '')
        out.append([m.group(1).strip(), note] if note else [m.group(1).strip()])
    return out


def build_names(kjv):
    path = glob.glob(os.path.join(SRC, 'STEPBible-Data/Proper Nouns/TIPNR*.txt'))[0]
    with open(path, encoding='utf-8-sig') as f:
        lines = f.read().split('\n')
    entries = {}
    i = 0
    while i < len(lines):
        line = lines[i]
        i += 1
        if not line.startswith('$=========='):
            continue
        section = line.strip('$= \t')
        if section.startswith('EXCLUDED') or i >= len(lines):
            continue
        cols = lines[i].rstrip('\t').split('\t')
        if '@' not in cols[0] or '=' not in cols[0]:
            continue
        uid, ustrong = cols[0].split('=', 1)
        kind = 'place' if section.startswith('PLACE') else 'person' if section.startswith('PERSON') else 'other'
        raw_name = uid.split('@')[0].replace('_', ' ')
        # Anonymous people kept for genealogy links ("Unnamed#3", "father of Lazarus").
        anonymous = raw_name.startswith('Unnamed') or raw_name[:1].islower()
        e = {'n': 'Unnamed' if raw_name.startswith('Unnamed') else raw_name, 'k': kind, 't': cols[8].strip() if len(cols) > 8 else '', 'u': ustrong.strip()}
        if kind == 'person':
            e['d'] = cols[1].strip()
            rel = {}
            for key, col in (('parents', 2), ('siblings', 3), ('partners', 4), ('children', 5)):
                ids = split_ids(cols[col]) if len(cols) > col else []
                if ids:
                    rel[key] = ids
            if rel:
                e['rel'] = rel
            if len(cols) > 6 and cols[6].strip():
                e['tribe'] = cols[6].strip()
        elif kind == 'place':
            rel = {}
            for key, col in (('founders', 2), ('residents', 3)):
                ids = split_ids(cols[col]) if len(cols) > col else []
                if ids:
                    rel[key] = ids
            if rel:
                e['rel'] = rel
            gm = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', cols[4] if len(cols) > 4 else '')
            if gm:
                e['geo'] = [float(gm.group(1)), float(gm.group(2))]
            if len(cols) > 6 and cols[6].strip() not in ('', '>'):
                e['area'] = cols[6].strip()
        else:
            e['d'] = cols[1].strip()
        names, refs, own_strongs = [], set(), set()
        # Sub-records until the next "$" line.
        while i < len(lines) and not lines[i].startswith('$'):
            sub = lines[i].rstrip('\t')
            i += 1
            if sub.startswith('– ') and not sub.startswith('– Total'):
                sc = sub.split('\t')  # significance, unique name, dStrong«eStrong=original, translated name, refs
                if len(sc) < 5:
                    continue
                # Combined names ("Ish-tob" = H0376G«…+H2897«…) join ordinary words with the name;
                # only the part that is this entry's own name identifies it.
                parts = [x.partition('«')[0].strip() for x in sc[2].split('+')]
                combined = len(parts) > 1
                dstrong = ustrong.strip() if ustrong.strip() in parts else parts[-1]
                if not re.fullmatch(r'[HG]\d{4}[A-Za-z]?', dstrong) or dstrong[1:5] == '0000':
                    dstrong = ''  # placeholder for names not tagged in the original text
                orig = ' '.join(x.split('=', 1)[1] for x in sc[2].split('+') if '=' in x)
                translated = re.sub(r'\s*=.*$', '', sc[3].split(';')[0]).strip()
                item = [translated, orig.strip(), dstrong]
                if dstrong and not combined:
                    own_strongs.add(dstrong)
                if translated and not re.fullmatch(r'[\[\]\s]*', translated) and item not in names:
                    names.append(item)
                refs.update(parse_step_refs(sc[4], kjv))
            else:
                for key, field in (('@Briefest=', 'bb'), ('@Brief=', 'b'), ('@Short=', 's'), ('@Article=', 'a')):
                    if sub.startswith(key):
                        value = sub[len(key):].strip()
                        if value:
                            e[field] = article_html(value) if field in ('a', 's') else strip_tags(value)
        e['names'] = names
        e['strongs'] = sorted(own_strongs)
        e['r'] = sorted(refs)
        if anonymous:
            e['anon'] = 1
        entries[uid] = e

    # Keep only relations that point at known entries.
    for e in entries.values():
        for key, ids in list(e.get('rel', {}).items()):
            e['rel'][key] = [x for x in ids if x[0] in entries]
            if not e['rel'][key]:
                del e['rel'][key]
        if 'rel' in e and not e['rel']:
            del e['rel']

    chunks = defaultdict(dict)
    index = []
    for uid, e in entries.items():
        first = uid[0].upper()
        chunks[first if first.isalpha() else '_'][uid] = e
        alt = {}
        for n in e['names']:
            for a in n[0].split(','):
                a = re.sub(r'\s+', ' ', re.sub(r'[()/]', ' ', a)).strip()
                if a and a.lower() != e['n'].lower() and a.lower() not in alt:
                    alt[a.lower()] = a
        alt = sorted(alt.values())
        strongs = e.pop('strongs')
        geo = [round(x, 4) for x in e['geo']] if e.get('geo') and any(e['geo']) else []
        index.append([uid, e['n'], e['k'], e.get('b') or e.get('d') or e.get('t', ''), len(e['r']), '|'.join(alt), '|'.join(strongs), e['t'], e.get('anon', 0)] + geo)
    for name, data in chunks.items():
        write_json(f'names/{name}.json', data)
    index.sort(key=lambda x: (x[1].lower(), -x[4]))
    write_json('names/index.json', index)
    # Places with a known location, per chapter: places/<book>.json = {chapter: [[id, verses]]}
    by_chapter = defaultdict(lambda: defaultdict(Counter))
    for uid, e in entries.items():
        if e['k'] == 'place' and e.get('geo') and any(e['geo']):
            for ref in e['r']:
                by_chapter[ref // 1000000][ref // 1000 % 1000][uid] += 1
    for b in range(66):
        write_json(f'places/{b}.json', {str(c): sorted(ids.items(), key=lambda x: -x[1]) for c, ids in sorted(by_chapter[b].items())})
    kinds = Counter(e['k'] for e in entries.values())
    print(f'  names: {len(entries)} entries {dict(kinds)}, {sum(1 for e in entries.values() if "geo" in e)} with map location')


# ---------------------------------------------------------------- cross references

OSIS_CODES = ('Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song '
              'Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom '
              '1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev').split()
OSIS_BOOK = {c: i for i, c in enumerate(OSIS_CODES)}


def osis_ref(ref, kjv):
    m = re.match(r'^(\w+)\.(\d+)\.(\d+)$', ref)
    if not m or m.group(1) not in OSIS_BOOK:
        return None
    b, c, v = OSIS_BOOK[m.group(1)], int(m.group(2)), int(m.group(3))
    if c > len(kjv[b]) or not 1 <= v <= len(kjv[b][c - 1]):
        return None
    return b * 1000000 + c * 1000 + v


def build_crossrefs(kjv):
    """Each verse gets a list of targets: a packed ref, or [start, end] for a passage. Sorted by votes."""
    path = os.path.join(SRC, 'bible_databases/sources/extras/cross_references.txt')
    refs = [[[[] for _ in ch] for ch in book] for book in kjv]
    kept = dropped = 0
    with open(path, encoding='utf-8') as f:
        next(f)  # header
        for line in f:
            cols = line.rstrip('\n').split('\t')
            if len(cols) < 3:
                continue
            votes = int(cols[2] or 0)
            src = osis_ref(cols[0], kjv)
            start, _, end = cols[1].partition('-')
            target, target_end = osis_ref(start, kjv), osis_ref(end, kjv) if end else None
            if votes <= 0 or src is None or target is None or (end and (target_end is None or target_end <= target)):
                dropped += 1
                continue
            b, c, v = src // 1000000, src // 1000 % 1000, src % 1000
            refs[b][c - 1][v - 1].append((votes, [target, target_end] if target_end else target))
            kept += 1
    for b, book in enumerate(refs):
        chapters = [[[t for _, t in sorted(verse, key=lambda x: -x[0])] for verse in ch] for ch in book]
        write_json(f'crossrefs/{b}.json', chapters)
    print(f'  cross references: {kept} kept, {dropped} dropped (no votes or outside KJV numbering)')


# ---------------------------------------------------------------- commentaries

COMMENTARIES = [
    ('matthew-henry', 'Matthew Henry', 'Matthew Henry', 'Commentary on the Whole Bible', '1706–1721',
     'Devotional and practical: what each passage teaches and how to live it out.'),
    ('jamieson-fausset-brown', 'JFB', 'Jamieson, Fausset & Brown', 'Commentary Critical and Explanatory', '1871',
     'Concise verse-by-verse notes on meaning, language and background.'),
]


def write_gz_json(path, data):
    path = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with open(path, 'wb') as f:
        f.write(gzip.compress(raw, compresslevel=9, mtime=0))


def build_commentaries(kjv):
    meta = []
    for cid, short, author, title, years, desc in COMMENTARIES:
        books = defaultdict(lambda: {'intro': '', 'chapters': {}})
        with gzip.open(os.path.join(SRC, f'commentaries/{cid}.en.jsonl.gz'), 'rt', encoding='utf-8') as f:
            for line in f:
                row = json.loads(line)
                if row['book'] not in USFX_CODES:
                    continue
                b = USFX_CODES.index(row['book'])
                c, start = row['chapter'], row['start_verse']
                if c == 0:
                    books[b]['intro'] = row['text']
                    continue
                if c > len(kjv[b]):
                    continue
                end = row.get('end_verse') or start
                end = min(max(end, start), len(kjv[b][c - 1]))
                books[b]['chapters'].setdefault(str(c), []).append([start, end, row['text'].strip()])
        for b, data in books.items():
            for sections in data['chapters'].values():
                sections.sort(key=lambda x: x[0])
            write_gz_json(f'commentary/{cid}/{b}.json.gz', data)
        missing = [BOOK_NAMES[b] for b in range(66) if b not in books]
        print(f'  {cid}: {len(books)} books{f"; missing {missing}" if missing else ""}')
        meta.append({'id': cid, 'short': short, 'author': author, 'title': title, 'years': years, 'description': desc,
                     'books': sorted(books)})
    write_json('commentary/index.json', meta)


# ---------------------------------------------------------------- topics (Nave's) & Bible dictionary

NAVE_CODES = dict(OSIS_BOOK)  # Nave's uses 3-letter USFM-style codes
NAVE_CODES.update({c: i for i, c in enumerate(USFX_CODES)})
NAVE_CODES['1JHN'] = 61
NAVE_REF = re.compile(r'\b(1JHN|[1-3]?[A-Z]{2,3}) (\d+):')


def title_case(s):
    small = {'of', 'and', 'the', 'in', 'to', 'a', 'an', 'for', 'on', 'by', 'with', 'at', 'from'}
    words = s.lower().split()
    return ' '.join(w if i and w in small else w[:1].upper() + w[1:] for i, w in enumerate(words))


def parse_nave_refs(text, kjv):
    """'EXO 23:4,5; PRO 19:11; 24:17,29' -> packed refs / [start, end] ranges (book and chapter carry over)."""
    out, book, chapter = [], None, None
    for seg in re.split(r';', text):
        for m in re.finditer(r'(?:\b(1JHN|[1-3]?[A-Z]{2,3}) )?(\d+):([\d,\-–]+)|,\s*(\d+)(?:-(\d+))?', seg):
            if m.group(3):
                if m.group(1):
                    book = NAVE_CODES.get(m.group(1))
                chapter = int(m.group(2))
                items = m.group(3)
            elif chapter:
                items = m.group(4) + (f'-{m.group(5)}' if m.group(5) else '')
            else:
                continue
            if book is None or chapter > len(kjv[book]):
                continue
            count = len(kjv[book][chapter - 1])
            for item in items.split(','):
                a, _, b = item.replace('–', '-').partition('-')
                if not a.isdigit() or not 1 <= int(a) <= count:
                    continue
                start = book * 1000000 + chapter * 1000 + int(a)
                if b.isdigit() and int(a) < int(b) <= count:
                    out.append([start, start - int(a) + int(b)])
                else:
                    out.append(start)
    return out


def build_topics(kjv):
    rows = list(csv.DictReader(open(os.path.join(SRC, 'bible-data/NavesTopicalDictionary.csv'), encoding='utf-8-sig')))
    subjects = {r['subject'].strip() for r in rows}
    slug = lambda name: re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    chunks = defaultdict(dict)
    index = []
    for r in rows:
        name = r['subject'].strip()
        lines = []
        for raw in r['entry'].split('\n'):
            if not raw.strip():
                continue
            depth = (len(raw) - len(raw.lstrip(' '))) // 5
            text = raw.strip().lstrip('-').strip()
            see = []
            sm = re.match(r'^See (also )?(.+)$', text, re.I)
            if sm:
                for target in re.split(r';\s*', sm.group(2)):
                    target = target.strip().rstrip('.')
                    base = target if target in subjects else target.split(',')[0].strip()
                    if base in subjects:
                        see.append([title_case(target), slug(base)])
                lines.append({'d': depth, 'see': see} if see else {'d': depth, 't': text})
                continue
            m = NAVE_REF.search(text)
            label = (text[:m.start()] if m else text).strip().rstrip(',;:')
            refs = parse_nave_refs(text[m.start():], kjv) if m else []
            if re.fullmatch(r'[A-Z0-9 ,\'\-]+', label or 'x'):
                label = title_case(label)
            line = {'d': depth}
            if label:
                line['t'] = label
            if refs:
                line['r'] = refs
            if label or refs:
                lines.append(line)
        key = slug(name)
        count = sum(len(l.get('r', [])) for l in lines)
        chunks[key[0] if key[:1].isalpha() else '_'][key] = {'n': title_case(name), 'l': lines}
        index.append([key, title_case(name), count])
    for letter, data in chunks.items():
        write_json(f'topics/{letter}.json', data)
    write_json('topics/index.json', sorted(index, key=lambda x: x[0]))
    print(f'  topics: {len(index)} topics, {sum(x[2] for x in index)} verse references')


def build_dictionary():
    base = os.path.join(SRC, 'bible-dictionary-dataset/data/01_parsed')
    chunks = defaultdict(dict)
    index = []
    for path in sorted(glob.glob(os.path.join(base, '[a-z].json'))):
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        for key, e in data.items():
            defs = [[d['source'], d['text'].strip()] for d in e.get('definitions', []) if d.get('text', '').strip()]
            if not defs:
                continue
            slug = re.sub(r'[^a-z0-9]+', '-', e.get('slug', key).lower()).strip('-') or key
            chunks[slug[0] if slug[:1].isalpha() else '_'][slug] = {'n': e['name'], 'd': defs}
            first = re.split(r'(?<=[.;])\s', defs[0][1], maxsplit=1)[0][:140]
            index.append([slug, e['name'], first])
    for letter, data in chunks.items():
        write_json(f'dictionary/{letter}.json', data)
    write_json('dictionary/index.json', sorted(index, key=lambda x: x[1].lower()))
    print(f'  bible dictionary: {len(index)} entries')


# ---------------------------------------------------------------- timeline

AH_TO_BC = 3962  # BibleData: year 1 after Creation (AH) = 3961 BC

ERAS = [  # [start year, name]; negative = BC. Boundaries follow BibleData's chronology for the Old Testament.
    [-4000, 'Beginnings'], [-1882, 'The Patriarchs'], [-1662, 'Israel in Egypt'], [-1447, 'Exodus and Wilderness'],
    [-1407, 'Conquest and Judges'], [-1023, 'The United Kingdom'], [-931, 'The Divided Kingdom'], [-586, 'Exile in Babylon'],
    [-538, 'Return and Restoration'], [-400, 'Between the Testaments'], [-6, 'The Life of Jesus'], [30, 'The Early Church'],
]

# New Testament dates are not in BibleData; these are common approximate scholarly dates.
NT_EVENTS = [
    (-5, 'Birth of Jesus (about 6–4 BC)', 'Matt.2.1'), (-4, 'Death of Herod the Great', 'Matt.2.19'),
    (8, 'Jesus at the temple aged twelve', 'Luke.2.42'), (27, 'John the Baptist begins preaching; Jesus is baptized', 'Luke.3.1'),
    (28, 'Sermon on the Mount', 'Matt.5.1'), (29, 'Feeding of the five thousand', 'John.6.10'),
    (30, 'Crucifixion and resurrection of Jesus (AD 30 or 33)', 'Luke.24.6'), (30, 'Pentecost: the church begins', 'Acts.2.1'),
    (34, 'Martyrdom of Stephen', 'Acts.7.59'), (35, 'Conversion of Saul (Paul)', 'Acts.9.3'),
    (44, 'James son of Zebedee killed by Herod Agrippa', 'Acts.12.2'), (47, "Paul's first missionary journey (about AD 46–48)", 'Acts.13.4'),
    (49, 'Council of Jerusalem', 'Acts.15.6'), (50, "Paul's second missionary journey (about AD 49–52)", 'Acts.15.40'),
    (54, "Paul's third missionary journey (about AD 53–57)", 'Acts.18.23'), (57, 'Paul arrested in Jerusalem', 'Acts.21.33'),
    (60, 'Paul sails to Rome', 'Acts.27.1'), (62, 'Paul under house arrest in Rome', 'Acts.28.30'),
    (70, 'Romans destroy Jerusalem and the temple', 'Luke.21.6'), (95, 'John receives the Revelation on Patmos (about AD 95)', 'Rev.1.9'),
]
SPAN_TYPES = {'Reign': 'reign', 'Judge': 'judge', 'Prophet': 'prophet', 'Bondage': 'period', 'Exile': 'period', 'Captivity': 'period'}
EVENT_TYPES = {'Unique', 'Travel', 'Covenant', 'Battle', 'Prophesy', 'Marriage', 'Message', 'Construction', 'Meeting',
               'Destruction', 'Vision', 'Birth', 'Death'}


def nave_ref(ref, kjv):
    m = re.match(r'^(1JHN|[1-3]?[A-Z]{2,3}) (\d+):(\d+)', ref or '')
    if not m or m.group(1) not in NAVE_CODES:
        return None
    b, c, v = NAVE_CODES[m.group(1)], int(m.group(2)), int(m.group(3))
    return b * 1000000 + c * 1000 + v if c <= len(kjv[b]) and v <= len(kjv[b][c - 1]) else None


def build_timeline(kjv):
    base = os.path.join(SRC, 'bible-data')
    events = []
    for r in csv.DictReader(open(os.path.join(base, 'BibleData-Event.csv'), encoding='utf-8-sig')):
        if r['event_type'] not in EVENT_TYPES or not r['event_year_ah']:
            continue
        name = r['event_name'].replace('G-d', 'God').strip()
        estimate = name.endswith('*')
        events.append([int(r['event_year_ah']) - AH_TO_BC, name.rstrip('*').strip(), nave_ref(r['event_reference_id'], kjv),
                       1 if estimate else 0, r['event_type'].lower()])
    for year, name, ref in NT_EVENTS:
        events.append([year, name, osis_ref(ref, kjv), 1, 'nt'])
    spans = []
    for r in csv.DictReader(open(os.path.join(base, 'BibleData-Epoch.csv'), encoding='utf-8-sig')):
        kind = SPAN_TYPES.get(r['epoch_type'])
        if not kind or not r['start_year_ah'] or not r['end_year_ah']:
            continue
        estimate = 'HYPOTHESIS' in r['epoch_notes']
        spans.append([int(r['start_year_ah']) - AH_TO_BC, int(r['end_year_ah']) - AH_TO_BC, r['epoch_name'].replace('G-d', 'God').strip(),
                      kind, nave_ref(r['start_year_reference_id'], kjv), 1 if estimate else 0])
    events.sort(key=lambda e: e[0])
    spans.sort(key=lambda s: (s[0], s[1]))
    write_json('timeline.json', {'eras': ERAS, 'events': events, 'spans': spans})
    print(f'  timeline: {len(events)} events, {len(spans)} reigns/judges/prophets/periods')


if __name__ == '__main__':
    print('translations')
    kjv, meta = build_translations()
    write_json('translations/index.json', meta)
    print('original')
    usage = build_original(kjv)
    print('lexicon')
    build_lexicon(usage)
    print('people & places')
    build_names(kjv)
    print('cross references')
    build_crossrefs(kjv)
    print('commentaries')
    build_commentaries(kjv)
    print('topics & dictionary')
    build_topics(kjv)
    build_dictionary()
    print('timeline')
    build_timeline(kjv)
    files = sorted(os.path.relpath(p, os.path.join(OUT, '..')) for p in glob.glob(os.path.join(OUT, '**/*.json*'), recursive=True)
                   if not p.endswith('manifest.json'))
    write_json('manifest.json', files)
