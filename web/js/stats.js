// Word statistics: counting and arithmetic only (no machine learning).
//  - Confusion sets: compares how often each choice (a/the, in/on/at, "discuss about the" vs "discuss the", ...)
//    appears in the same context in 100M words of English (Bergsma, Lin & Goebel, 2009).
//  - Spelling: Norvig's (2007) edit-distance corrector against a frequency-ranked dictionary.
//  - Readability: Flesch Reading Ease (1948).
//  - Everyday vocabulary: coverage by the New General Service List (Browne, Culligan & Phillips, 2013).
// Data files are built by tools/build_wordstats.py. Tokenisation MUST match it.

export const ART = ["a", "an", "the"];
export const PREP = ["in", "on", "at", "to", "for", "of", "with", "about", "from", "by", "into", "over", "under", "since"];
export const PARTICLES = ["back", "up", "again", "down", "out"];
export const PRON = ["me", "him", "her", "us", "them", "you", "it"];
const DELETABLE = new Set(["about", "back", "up", "to", "of", "with", "for", "on"]); // not "again"/"out"/"down": usually meaningful
const INSERTABLE = ["to", "for", "with", "about"];
const GROUPS = [ART, PREP];

// Decision thresholds (tuned against tests/stats.test.mjs: no false alarms on correct sentences).
export const T = { minTri: 10, minLeft: 300, ratio: 20, ratioLeft: 40, minDel: 200 };
// Words that govern the preposition after them. The statistics decide WHICH preposition; this list only
// says where to look (a noun like "costs" doesn't govern one: "costs with finance" is fine).
const GOVERNORS = new Set(("interested depends depend depending dependent based married consist consists consisted capable aware afraid " +
  "responsible similar different proud fond arrive arrived focus focused focuses insist insisted rely relies relied belong belongs " +
  "comply participate participated succeed succeeded involved satisfied famous according compared angry ashamed tired keen jealous " +
  "worried scared disappointed excited addicted familiar suitable essential related result resulted prevent prevented protect " +
  "protected benefit apply applied agree agreed qualified accused congratulate believe believed dream dreamed concentrate").split(" "));
// insertion is only checked before these: Wikipedia has too little "you" to judge "send you" vs "send to you"
const OBJ_PRON = ["me", "him", "her", "us", "them"];
// verbs that need a preposition before a person ("listen to me"); others ("message her", "tell him") don't
const INSERT_AFTER = new Set("listen listened listening explain explained explaining reply replied replying talk talked talking speak spoke speaking apologise apologize apologised apologized describe described suggest suggested say said complain complained belong belongs happen happened".split(" "));

export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function tokenize(text) {
  return String(text).toLowerCase().replace(/[’']/g, "'").split(/[.,;:!?()"\[\]=0-9]+|\n/)
    .map(p => p.match(/[a-z]+/g)).filter(Boolean).map(t => ["<s>", ...t, "</s>"]);
}

export class Stats {
  /** @param {ArrayBuffer} ngramBuf  @param {string} vocabTxt  @param {string} ngslTxt */
  constructor(ngramBuf, vocabTxt, ngslTxt) {
    const dv = new DataView(ngramBuf);
    const magic = String.fromCharCode(...new Uint8Array(ngramBuf, 0, 4));
    if (magic !== "LTNG") throw new Error("bad ngrams.bin");
    const n = dv.getUint32(8, true);
    this.floor = dv.getUint32(12, true);
    this.keys = new Uint32Array(ngramBuf.slice(16, 16 + 4 * n));
    this.vals = new Uint8Array(ngramBuf, 16 + 4 * n, n);
    const words = vocabTxt.split("\n").filter(Boolean);
    this.rank = new Map(words.map((w, i) => [w, i]));
    this.ngsl = new Set(ngslTxt.split(/[\n,]/).map(s => s.trim()).filter(Boolean));
  }

  /** Approximate corpus count of an n-gram ("discuss the"); 0 if below the prune floor. */
  count(gram) {
    const h = fnv1a(gram);
    let lo = 0, hi = this.keys.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1, k = this.keys[mid];
      if (k === h) return Math.round(2 ** (this.vals[mid] / 8));
      if (k < h) lo = mid + 1; else hi = mid - 1;
    }
    return 0;
  }

  /** Confusion-set check. Returns [{ hit, suggestion, ratio, kind }].
   * Conservative by design: the phrase as written must be essentially unseen in the corpus (below the
   * prune floor, i.e. at most a handful of times in 83M words) while the alternative is clearly attested. */
  phrasing(text) {
    const out = [], c = g => this.count(g), seen = new Set();
    const add = (hit, suggestion, evidence, kind) => {
      if (seen.has(hit)) return; seen.add(hit);
      out.push({ hit, suggestion, ratio: Math.max(1, Math.round(evidence / (this.floor / 2))), evidence, kind });
    };
    const show = arr => arr.filter(w => w !== "<s>" && w !== "</s>").join(" ");
    for (const t of tokenize(text)) {
      for (let i = 1; i < t.length - 1; i++) {
        const a = t[i - 1], x = t[i], b = t[i + 1];
        if (c(`${a} ${x} ${b}`) > 0) continue;               // the phrase is attested: never flag
        let best = null;
        if (ART.includes(x) && b !== "</s>") {
          // articles are decided by the NEXT word: "an important", "a lot"
          for (const y of ART) {
            if (y === x) continue;
            const tri = c(`${a} ${y} ${b}`), right = c(`${y} ${b}`), rightOrig = c(`${x} ${b}`);
            if (tri >= T.minTri && right >= T.ratio * Math.max(rightOrig, this.floor) && (!best || tri > best.ev)) best = { y, ev: tri };
          }
        } else if (PREP.includes(x) && b !== "</s>" && GOVERNORS.has(a)) {
          // prepositions are decided by the PREVIOUS word: "interested in", "depends on"
          for (const y of PREP) {
            if (y === x) continue;
            const tri = c(`${a} ${y} ${b}`), left = c(`${a} ${y}`), leftOrig = c(`${a} ${x}`);
            if ((tri >= T.minTri || left >= T.minLeft) && left >= T.ratio * Math.max(leftOrig, this.floor) && (!best || left > best.ev)) best = { y, ev: left };
          }
        }
        if (best) { add(show([a, x, b]), show([a, best.y, b]), best.ev, "swap"); continue; }
        if (DELETABLE.has(x) && b !== "</s>" && !NO_DELETE_AFTER.has(a) && !PRON.includes(a)) {
          const bi = c(`${a} ${b}`), leftOrig = c(`${a} ${x}`);
          if (bi >= T.minDel && bi >= T.ratioLeft * Math.max(leftOrig, this.floor)) add(show([a, x, b]), show([a, b]), bi, "remove");
        }
      }
      for (let i = 1; i < t.length - 1; i++) {
        const a = t[i], b = t[i + 1];
        if (!OBJ_PRON.includes(b) || !INSERT_AFTER.has(a)) continue;
        if (c(`${a} ${b}`) > 0) continue;
        let best = null;
        for (const y of INSERTABLE) {
          const tri = c(`${a} ${y} ${b}`);
          if (tri >= T.minTri && (!best || tri > best.ev)) best = { y, ev: tri };
        }
        if (best) add(show([a, b]), show([a, best.y, b]), best.ev, "insert");
      }
    }
    return out;
  }

  /** Known word, allowing regular endings of known words (retries, integrations, onboarded). */
  known(w) {
    if (this.rank.has(w)) return true;
    const stems = [];
    if (w.endsWith("ies")) stems.push(w.slice(0, -3) + "y");
    if (w.endsWith("es")) stems.push(w.slice(0, -2));
    if (w.endsWith("s")) stems.push(w.slice(0, -1));
    if (w.endsWith("ied")) stems.push(w.slice(0, -3) + "y");
    if (w.endsWith("ed")) stems.push(w.slice(0, -2), w.slice(0, -1));
    if (w.endsWith("ing")) stems.push(w.slice(0, -3), w.slice(0, -3) + "e");
    if (w.endsWith("ly")) stems.push(w.slice(0, -2));
    return stems.some(s => s.length > 2 && this.rank.has(s));
  }

  /** Norvig-style correction: best-ranked known word within edit distance 1, else 2. */
  correct(word) {
    if (this.known(word)) return null;
    const e1 = edits1(word);
    const pick = cands => { let best = null; for (const w of cands) { const r = this.rank.get(w); if (r !== undefined && (best === null || r < best[1])) best = [w, r]; } return best && best[0]; };
    const b1 = pick(e1);
    if (b1) return b1;
    if (word.length < 5) return null;
    const e2 = new Set();
    for (const w of e1) for (const v of edits1(w)) e2.add(v);
    return pick(e2);
  }

  /** Possible misspellings: lowercase words only (capitalised words may be names). */
  spelling(text) {
    const out = [];
    for (const m of String(text).matchAll(/[A-Za-z]+/g)) {
      const w = m[0];
      if (w.length < 3 || /[A-Z]/.test(w)) continue;
      const fix = this.correct(w);
      if (fix && fix !== w) out.push({ hit: w, suggestion: fix });
    }
    return out;
  }

  /** Share of words that are NGSL (everyday) word forms. */
  everyday(text) {
    const ws = String(text).toLowerCase().match(/[a-z]+/g) || [];
    if (!ws.length) return null;
    return Math.round(100 * ws.filter(w => this.ngsl.has(w)).length / ws.length);
  }
}

// words after which dropping a particle changes meaning (e.g. "look up", "give up", "talk about")
const NO_DELETE_AFTER = new Set(["that", "this", "these", "those", "everything", "something", "things","look", "looking", "give", "gave", "pick", "set", "set", "make", "made", "take", "took", "come", "came", "go", "went", "get", "got",
  "talk", "talking", "think", "thinking", "worry", "care", "ask", "asked", "hear", "heard", "know", "learn", "read", "write", "point", "find", "work", "back", "turn", "call", "show", "end"]);

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
export function edits1(w) {
  const out = new Set();
  for (let i = 0; i <= w.length; i++) {
    const L = w.slice(0, i), R = w.slice(i);
    if (R) out.add(L + R.slice(1));                                   // delete
    if (R.length > 1) out.add(L + R[1] + R[0] + R.slice(2));          // transpose
    for (const ch of LETTERS) {
      if (R) out.add(L + ch + R.slice(1));                            // replace
      out.add(L + ch + R);                                            // insert
    }
  }
  return out;
}

// ------------------------------------------------------------------ readability (no data needed)
export function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Flesch Reading Ease: 206.835 - 1.015 (words/sentence) - 84.6 (syllables/word). Higher = easier. */
export function flesch(text) {
  const sents = String(text).split(/[.!?]+(?:\s|$)|\n+/).map(s => s.trim()).filter(Boolean);
  const words = String(text).match(/[A-Za-z']+/g) || [];
  if (!words.length || !sents.length) return null;
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sents.length) - 84.6 * (syl / words.length);
  const longest = Math.max(...sents.map(s => (s.match(/[A-Za-z']+/g) || []).length));
  const label = score >= 70 ? "easy to read" : score >= 50 ? "fairly easy" : score >= 30 ? "difficult" : "very difficult";
  return { score: Math.round(Math.max(0, Math.min(100, score))), label, longest, words: words.length, sentences: sents.length };
}

// ------------------------------------------------------------------ loading
export async function loadStats(base = "data/") {
  const [bin, vocab, ngsl] = await Promise.all([
    fetch(base + "ngrams.bin").then(r => { if (!r.ok) throw new Error("ngrams"); return r.arrayBuffer(); }),
    fetch(base + "vocab.txt").then(r => r.text()),
    fetch(base + "ngsl.txt").then(r => r.text()),
  ]);
  return new Stats(bin, vocab, ngsl);
}
