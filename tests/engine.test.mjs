import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, specFor } from "../web/js/engine.js";
import { content, GENERIC_FAILS } from "./helpers.mjs";

const why = r => `score ${r.score}; missing: ${r.missing.map(m => m.label).join(", ")}; issues: ${r.issues.map(i => i.id + "(" + i.hit + ")").join(", ")}`;

for (const s of content.scenarios) {
  test(`scenario ${s.id}: good answers pass`, () => {
    for (const a of [...s.models, ...s.tests.pass]) {
      const r = analyze(a, specFor(s));
      assert.ok(r.passed, `should pass: "${a}"\n  ${why(r)}`);
    }
  });
  test(`scenario ${s.id}: weak answers fail`, () => {
    for (const a of [...s.tests.fail, ...GENERIC_FAILS]) {
      const r = analyze(a, specFor(s));
      assert.ok(!r.passed, `should fail: "${a}"\n  ${why(r)}`);
    }
  });
}

for (const x of content.surgery) {
  test(`surgery ${x.id}: the weak sentence fails`, () => {
    const r = analyze(x.weak, specFor(x));
    assert.ok(!r.passed, `should fail: "${x.weak}"\n  ${why(r)}`);
  });
}

const ids = (text, spec = {}) => analyze(text, spec).issues.map(i => i.id);

test("off-topic polite reply is capped", () => {
  const s = content.scenarios.find(x => x.id === "s_co_report");
  const r = analyze("Thanks for flagging. I'll eat a banana by 4 pm. Which banana?", specFor(s));
  assert.ok(r.offTopic && r.score <= 40);
});
test("negation cancels ownership", () => {
  const r = analyze("I will not check it today.", { moves: ["ownership"] });
  assert.equal(r.found.length, 0);
});
test("long and short forms are treated the same", () => {
  assert.equal(analyze("I would suggest we fix it.", { moves: ["suggestion"] }).found.length, 1);
  assert.equal(analyze("I do not know the number.", { moves: ["admit_gap"] }).found.length, 1);
});
test("double negative is flagged", () => {
  assert.ok(ids("I don't think we should not fix it.").includes("double_negative"));
  assert.ok(!ids("I don't think we should launch.").includes("double_negative"));
});
test("tag questions, fillers and stacked intensifiers are powerless markers", () => {
  assert.ok(ids("We should fix it first, right?").includes("tag_question"));
  assert.ok(ids("Umm, basically the server is slow.").includes("fillers"));
  assert.ok(ids("This is very very important.").includes("intensifiers"));
});
test("judgement vs observation", () => {
  assert.ok(ids("That's a stupid idea.").includes("judgement"));
  assert.ok(!ids("Which part did I get wrong?").includes("judgement"));
});
test("bald imperatives only flagged in face-threatening moments", () => {
  assert.ok(ids("Fix the bug before launch.", { fta: true }).includes("bald_imperative"));
  assert.ok(!ids("Could we fix the bug before launch?", { fta: true }).includes("bald_imperative"));
  assert.ok(!ids("Fix the bug before launch.", {}).includes("bald_imperative"));
});
test("throat-clearing opener", () => {
  assert.ok(ids("So basically, I wanted to talk about the login bug.").includes("throat_clearing"));
});
test("your own sentences from the tutoring session are caught", () => {
  assert.deepEqual(
    ["sorry", "the_lot", "lowercase_i", "double_dots"].filter(i => ids("sorry i don't know about plan a.. it will take the lot of time").includes(i)),
    ["sorry", "the_lot", "lowercase_i", "double_dots"]);
  assert.ok(ids("okay, calm down, lets figure it out").includes("calm_down"));
  assert.ok(ids("we need a look over the major bug").includes("vague_opener"));
});
test("an apology is allowed when the mistake is real, but only once", () => {
  assert.ok(!ids("I'm sorry, I sent the wrong file.", { allow: ["sorry"] }).includes("sorry"));
  assert.ok(ids("I'm sorry, so sorry, I sent the wrong file.", { allow: ["sorry"] }).includes("sorry_repeat"));
});
test("long sentences (over 25 words) are flagged; 25 or fewer are not", () => {
  const w = n => Array.from({ length: n }, (_, i) => "word" + i).join(" ") + ".";
  assert.ok(ids(w(26)).includes("long_sentence"));
  assert.ok(!ids(w(25)).includes("long_sentence"));
});
