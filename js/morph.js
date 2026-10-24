// Decode grammar (morphology) codes from the STEPBible tagged texts into plain English.
// Hebrew/Aramaic codes follow the OpenScriptures Hebrew Bible scheme (e.g. "HVqp3ms", "HR/Ncfsa");
// Greek codes follow the Robinson scheme (e.g. "V-AAI-3S", "N-GSM-P").

const HEB_STEMS = {
  q: 'Qal', N: 'Niphal', p: 'Piel', P: 'Pual', h: 'Hiphil', H: 'Hophal', t: 'Hithpael', o: 'Polel', O: 'Polal',
  r: 'Hithpolel', m: 'Poel', M: 'Poal', k: 'Palel', K: 'Pulal', Q: 'Qal passive', l: 'Pilpel', L: 'Polpal',
  f: 'Hithpalpel', D: 'Nithpael', j: 'Pealal', i: 'Pilel', u: 'Hothpaal', c: 'Tiphil', v: 'Hishtaphel',
  w: 'Nithpalel', y: 'Nithpoel', z: 'Hithpoel',
};
const ARAM_STEMS = {
  q: 'Peal', Q: 'Peil', u: 'Hithpeel', p: 'Pael', P: 'Ithpaal', M: 'Hithpaal', a: 'Aphel', h: 'Haphel',
  s: 'Saphel', e: 'Shaphel', H: 'Hophal', i: 'Ithpeel', t: 'Hishtaphel', v: 'Ishtaphel', w: 'Hithaphel',
  o: 'Polel', z: 'Ithpoel', r: 'Hithpolel', f: 'Hithpalpel', b: 'Hephal', c: 'Tiphel', m: 'Poel', l: 'Palpel',
  L: 'Ithpalpel', O: 'Ithpolel', G: 'Ittaphal',
};
const HEB_CONJ = {
  p: 'perfect', q: 'sequential perfect', i: 'imperfect', w: 'sequential imperfect (narrative past)',
  h: 'cohortative', j: 'jussive', v: 'imperative', r: 'participle', s: 'passive participle',
  a: 'infinitive absolute', c: 'infinitive construct',
};
const PERSON = { 1: '1st person', 2: '2nd person', 3: '3rd person' };
const HEB_GENDER = { m: 'masculine', f: 'feminine', b: 'common', c: 'common' };
const HEB_NUMBER = { s: 'singular', p: 'plural', d: 'dual' };
const HEB_STATE = { a: 'absolute', c: 'construct', d: 'determined' };
const HEB_PARTICLE = {
  a: 'affirmation', d: 'definite article', e: 'exhortation', i: 'interrogative', j: 'interjection',
  m: 'demonstrative', n: 'negative', o: 'direct object marker', r: 'relative',
};
const HEB_PRONOUN = { d: 'demonstrative', f: 'indefinite', i: 'interrogative', p: 'personal', r: 'relative' };

const join = (...parts) => parts.filter(Boolean).join(' ');

function hebrewSegment(seg, aramaic) {
  const [pos, ...rest] = seg;
  const r = rest.join('');
  switch (pos) {
    case 'V': {
      const stem = (aramaic ? ARAM_STEMS : HEB_STEMS)[r[0]];
      const conj = HEB_CONJ[r[1]];
      const tail = r.slice(2);
      if (r[1] === 'r' || r[1] === 's') {
        return join('Verb', stem, conj, HEB_GENDER[tail[0]], HEB_NUMBER[tail[1]], HEB_STATE[tail[2]]);
      }
      return join('Verb', stem, conj, PERSON[tail[0]], HEB_GENDER[tail[1]], HEB_NUMBER[tail[2]]);
    }
    case 'N': {
      const type = { c: '', g: 'gentilic', p: 'proper' }[r[0]];
      const name = r[0] === 'p' ? 'Proper noun' : 'Noun';
      return join(name, type && r[0] !== 'p' ? type : '', HEB_GENDER[r[1]], HEB_NUMBER[r[2]], HEB_STATE[r[3]]);
    }
    case 'A': {
      const type = { a: 'Adjective', c: 'Number (cardinal)', g: 'Adjective (gentilic)', o: 'Number (ordinal)' }[r[0]] || 'Adjective';
      return join(type, HEB_GENDER[r[1]], HEB_NUMBER[r[2]], HEB_STATE[r[3]]);
    }
    case 'P':
      return join('Pronoun', HEB_PRONOUN[r[0]], PERSON[r[1]], HEB_GENDER[r[2]], HEB_NUMBER[r[3]]);
    case 'S':
      if (r[0] === 'p') return join('Suffix', PERSON[r[1]], HEB_GENDER[r[2]], HEB_NUMBER[r[3]]);
      return join('Suffix', { d: 'directional', h: 'paragogic he', n: 'paragogic nun' }[r[0]]);
    case 'T':
      return join('Particle', HEB_PARTICLE[r[0]]);
    case 'R':
      return r[0] === 'd' ? 'Preposition with article' : 'Preposition';
    case 'C':
      return 'Conjunction';
    case 'D':
      return 'Adverb';
    default:
      return seg;
  }
}

export function decodeHebrew(code) {
  if (!code) return '';
  const aramaic = code[0] === 'A';
  const body = /^[HA]/.test(code) ? code.slice(1) : code;
  const lang = aramaic ? 'Aramaic' : 'Hebrew';
  return `${lang}: ${body.split('/').map((s) => hebrewSegment(s, aramaic)).join(' + ')}`;
}

const GK_TENSE = { P: 'present', I: 'imperfect', F: 'future', A: 'aorist', R: 'perfect', L: 'pluperfect', X: 'no tense' };
const GK_VOICE = {
  A: 'active', M: 'middle', P: 'passive', E: 'middle or passive', D: 'middle deponent', O: 'passive deponent',
  N: 'middle or passive deponent', Q: 'impersonal active', X: 'no voice',
};
const GK_MOOD = { I: 'indicative', S: 'subjunctive', O: 'optative', M: 'imperative', N: 'infinitive', P: 'participle', R: 'imperative participle' };
const GK_CASE = { N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative', V: 'vocative' };
const GK_NUMBER = { S: 'singular', P: 'plural' };
const GK_GENDER = { M: 'masculine', F: 'feminine', N: 'neuter' };
const GK_POS = {
  N: 'Noun', A: 'Adjective', T: 'Article', V: 'Verb', P: 'Personal pronoun', R: 'Relative pronoun',
  C: 'Reciprocal pronoun', D: 'Demonstrative pronoun', K: 'Correlative pronoun', I: 'Interrogative pronoun',
  X: 'Indefinite pronoun', Q: 'Correlative/interrogative pronoun', F: 'Reflexive pronoun', S: 'Possessive pronoun',
};
const GK_WORDS = {
  ADV: 'Adverb', CONJ: 'Conjunction', COND: 'Conditional particle', PRT: 'Particle', PREP: 'Preposition',
  INJ: 'Interjection', ARAM: 'Aramaic word', HEB: 'Hebrew word', 'N-PRI': 'Proper noun (indeclinable)',
  'A-NUI': 'Number (indeclinable)', 'N-LI': 'Letter', 'N-OI': 'Noun (indeclinable)', 'PRT-N': 'Negative particle',
  'PRT-I': 'Interrogative particle', 'ADV-I': 'Interrogative adverb', 'ADV-N': 'Negative adverb', 'CONJ-N': 'Negative conjunction',
};
const GK_SUFFIX = { P: 'person', L: 'location', T: 'title', G: 'gentilic', C: 'comparative', S: 'superlative', N: 'negative', I: 'interrogative', K: 'contracted' };

function caseNumberGender(s) {
  return join(GK_CASE[s[0]], GK_NUMBER[s[1]], GK_GENDER[s[2]]);
}

export function decodeGreek(code) {
  if (!code) return '';
  if (GK_WORDS[code]) return `Greek: ${GK_WORDS[code]}`;
  const [pos, a = '', b = '', c = ''] = code.split('-');
  if (GK_WORDS[pos] && !GK_POS[pos]) return `Greek: ${join(GK_WORDS[pos], GK_SUFFIX[a])}`;
  let out;
  if (pos === 'V') {
    const m = a.match(/^(2?)([A-Z])([A-Z])([A-Z])$/);
    if (!m) return `Greek: Verb ${a}`;
    const tense = (m[1] ? 'second ' : '') + GK_TENSE[m[2]];
    const mood = GK_MOOD[m[4]];
    let detail = '';
    if (m[4] === 'P' || m[4] === 'R') detail = caseNumberGender(b);
    else if (b) detail = join(PERSON[b[0]], GK_NUMBER[b[1]]);
    out = join('Verb', tense, GK_VOICE[m[3]], mood, detail);
  } else if (pos === 'P' || pos === 'S' || pos === 'F') {
    // Personal/possessive/reflexive pronouns may start with a person digit: P-1GS, S-1SNSF
    const m = a.match(/^([123]?)(.*)$/);
    out = join(GK_POS[pos], PERSON[m[1]], caseNumberGender(m[2]));
  } else {
    out = join(GK_POS[pos] || pos, caseNumberGender(a), GK_SUFFIX[b] && `(${GK_SUFFIX[b]})`);
  }
  return `Greek: ${out}${c && GK_SUFFIX[c] ? ` (${GK_SUFFIX[c]})` : ''}`;
}

export const decodeMorph = (code, lang) => (lang === 'hbo' ? decodeHebrew(code) : decodeGreek(code));
