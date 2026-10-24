#!/usr/bin/env python3
"""Build the app's data files from open-licensed sources.

Usage: python3 tools/build_data.py <sources-dir>

<sources-dir> must contain:
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

STEPBible data is reformatted (not reworded): fields are selected, HTML is reduced to
<b>/<i>/<br> and verse links, and references are mapped to KJV versification.
"""
import glob
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


if __name__ == '__main__':
    print('translations')
    kjv, meta = build_translations()
    write_json('translations/index.json', meta)
    print('original')
    usage = build_original(kjv)
    print('lexicon')
    build_lexicon(usage)
    files = sorted(os.path.relpath(p, os.path.join(OUT, '..')) for p in glob.glob(os.path.join(OUT, '**/*.json'), recursive=True)
                   if not p.endswith('manifest.json'))
    write_json('manifest.json', files)
