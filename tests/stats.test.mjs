import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { Stats, flesch, syllables, tokenize, fnv1a } from "../web/js/stats.js";
import { analyze, specFor } from "../web/js/engine.js";
import { content } from "./helpers.mjs";

const D = new URL("../web/data/", import.meta.url);
const ready = existsSync(new URL("ngrams.bin", D));
const stats = ready ? new Stats(readFileSync(new URL("ngrams.bin", D)).buffer.slice(0), readFileSync(new URL("vocab.txt", D), "utf8"), readFileSync(new URL("ngsl.txt", D), "utf8")) : null;
const t = ready ? test : test.skip;

// Learner slips the STATISTICS must catch (each with the expected suggestion).
export const MUST_FLAG = [
  ["Can we discuss about the plan tomorrow?", "discuss the"],
  ["The result depends of the data.", "depends on the"],
  ["I am interested for this role.", "interested in this"],
  ["Please listen me first.", "listen to me"],
  ["This is a important update.", "an important"],
  ["We need to cope up with the change.", "cope with"],
];
// Slips the corpus can't judge (too rare in Wikipedia) are covered by hand-written rules instead.
const RULE_COVERED = [["It will take the lot of time.", "the_lot"], ["Please explain me the process.", "reply_you"], ["I will reply you by evening.", "reply_you"],
  ["She is married with a doctor.", "married_with"], ["He is senior than me.", "senior_than"], ["I am good in Python.", "good_in"]];

// Correct sentences: must produce NO phrasing or spelling flags.
const GOOD = [
  "I'd suggest we fix it before launch.", "Could you send me your version?", "Let me check with the team and get back to you today.",
  "We talked about the plan in the meeting.", "I'll look into it after lunch.", "Can we go over the numbers again?",
  "Please give me a few minutes.", "Thanks for pointing that out.", "I'm working on the payment feature this week.",
  "What do you mean by impactful?", "I agree with you on the timeline.", "Let's start with the most urgent bug.",
  "Which part of the report is different?", "I'll send it to you by 4 pm.", "The team is ready to start as soon as we have it.",
  "I grew up in Delhi and moved to Pune for work.", "He gave up the idea after the review.", "Could we look at the data together?",
  "I tested it on three devices.", "We need to back up the database first.", "It depends on the client.",
  "I'm interested in the role because of the team.", "She explained the process to me yesterday.",
];
const allGood = () => [...GOOD, ...content.scenarios.flatMap(s => [...s.models, ...s.tests.pass]),
  ...Object.values(content.patterns).map(p => p.example)];

t("data files are within the phone size budget", () => {
  const kb = f => statSync(new URL(f, D)).size / 1024;
  assert.ok(kb("ngrams.bin") < 4200, `ngrams.bin ${kb("ngrams.bin")} KB`);
  assert.ok(kb("vocab.txt") < 800, `vocab.txt ${kb("vocab.txt")} KB`);
});
t("learner slips are flagged with the right suggestion", () => {
  const misses = [];
  for (const [s, want] of MUST_FLAG) {
    const got = stats.phrasing(s).map(p => p.suggestion);
    if (!got.some(g => g.includes(want))) misses.push(`${s} -> ${JSON.stringify(got)} (want ${want})`);
  }
  assert.deepEqual(misses, []);
});
test("slips the corpus can't judge are caught by rules", () => {
  for (const [s, id] of RULE_COVERED) assert.ok(analyze(s).issues.some(i => i.id === id), s);
});
t("false-alarm rate on correct sentences (incl. every model answer) stays under 3%", () => {
  const all = allGood(), bad = [];
  for (const s of all) {
    const p = stats.phrasing(s), sp = stats.spelling(s);
    if (p.length || sp.length) bad.push(`${s} -> ${JSON.stringify(p.map(x => x.hit + "→" + x.suggestion))} ${JSON.stringify(sp)}`);
  }
  const rate = bad.length / all.length;
  console.log(`# phrasing/spelling false alarms: ${bad.length}/${all.length} (${(100 * rate).toFixed(1)}%)\n# ` + bad.join("\n# "));
  assert.ok(rate < 0.03, bad.join("\n"));
});
t("spelling: common typos corrected, real words left alone", () => {
  for (const [typo, fix] of [["definitly", "definitely"], ["recieve", "receive"], ["tommorow", "tomorrow"], ["mesage", "message"], ["thier", "their"]]) {
    const r = stats.spelling(typo);
    assert.ok(r.length && r[0].suggestion === fix, `${typo} -> ${JSON.stringify(r)}`);
  }
  assert.deepEqual(stats.spelling("Priya lakh crore bcrypt okta"), []);
});
t("everyday vocabulary coverage", () => {
  assert.ok(stats.everyday("I will send it to you today") >= 85);
});
t("engine uses stats when given, and model answers still pass", () => {
  const r = analyze("The result depends of the data.", {}, { stats });
  assert.ok(r.issues.some(i => i.id === "phrasing_stat"));
  for (const s of content.scenarios) for (const m of s.models) assert.ok(analyze(m, specFor(s), { stats }).passed, m);
});

test("Flesch reading ease and syllables", () => {
  assert.equal(syllables("cat"), 1); assert.equal(syllables("table"), 2); assert.equal(syllables("communication"), 5);
  const easy = flesch("I'll send it today. Thanks.");
  const hard = flesch("Notwithstanding the aforementioned considerations, organisational communication necessitates comprehensive documentation.");
  assert.ok(easy.score > 70 && hard.score < 30, `${easy.score} ${hard.score}`);
});
test("tokeniser and hash match the Python builder", () => {
  assert.deepEqual(tokenize("Hi Priya, can we discuss it?"), [["<s>", "hi", "priya", "</s>"], ["<s>", "can", "we", "discuss", "it", "</s>"]]);
  assert.deepEqual(tokenize("caught about 40 bugs"), [["<s>", "caught", "about", "</s>"], ["<s>", "bugs", "</s>"]]);
  assert.equal(fnv1a("discuss the"), 2478849862); // same value as fnv1a() in tools/build_wordstats.py
});
