import { test } from "node:test";
import assert from "node:assert/strict";
import { MOVES, resolveMove } from "../web/js/engine.js";
import { PRINCIPLES } from "../web/js/research.js";
import { content } from "./helpers.mjs";

const skillIds = new Set(content.skills.map(s => s.id));
const compiles = p => { new RegExp(p, "i"); return true; };

test("ids are unique", () => {
  for (const key of ["scenarios", "quizzes", "surgery"]) {
    const ids = content[key].map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate id in ${key}`);
  }
});
test("every skill has a pattern card, quizzes and scenarios (one hard)", () => {
  for (const s of content.skills) {
    assert.ok(content.patterns[s.id], `pattern for ${s.id}`);
    assert.ok(content.quizzes.some(q => q.skill === s.id), `quiz for ${s.id}`);
    const sc = content.scenarios.filter(x => x.skill === s.id);
    assert.ok(sc.length >= 3, `>=3 scenarios for ${s.id}`);
    assert.ok(sc.some(x => x.hard), `a hard scenario for ${s.id}`);
  }
});
test("scenarios are complete and valid", () => {
  for (const s of content.scenarios) {
    for (const f of ["id", "skill", "title", "context", "line", "situation", "moves", "question", "models", "topic", "tests"])
      assert.ok(s[f] !== undefined, `${s.id} missing ${f}`);
    assert.ok(skillIds.has(s.skill), `${s.id} unknown skill`);
    assert.ok(s.models.length >= 2, `${s.id} needs 2 models`);
    assert.ok(s.models.length + s.tests.pass.length >= 3, `${s.id} needs 3+ passing examples`);
    assert.ok(s.tests.fail.length >= 1, `${s.id} needs a failing example`);
    for (const m of s.moves) {
      const mv = resolveMove(m);
      assert.ok(mv.label && mv.patterns.every(compiles), `${s.id} bad move`);
      if (mv.principle) assert.ok(PRINCIPLES[mv.principle], `${s.id} unknown principle ${mv.principle}`);
    }
    for (const f of s.forbid || []) assert.ok(compiles(f.pattern) && f.message, `${s.id} bad forbid`);
  }
});
test("quizzes have exactly one correct option with explanations", () => {
  for (const q of content.quizzes) {
    assert.ok(skillIds.has(q.skill));
    assert.equal(q.options.filter(o => o.correct).length, 1, q.id);
    assert.ok(q.options.every(o => o.text && o.why), q.id);
  }
});
test("every built-in move cites a known principle", () => {
  for (const [id, mv] of Object.entries(MOVES)) assert.ok(PRINCIPLES[mv.principle], id);
});
test("every scenario-specific rule names a mistake type (so Diagnose can explain it)", async () => {
  const { HABITS } = await import("../web/js/habits.js");
  const ids = new Set(HABITS.map(h => h.id));
  const all = [...content.scenarios, ...content.surgery].flatMap(s => s.forbid || [])
    .concat((content.roleplays || []).flatMap(r => Object.values(r.nodes).flatMap(n => n.spec?.forbid || [])));
  for (const f of all) assert.ok(ids.has(f.habit), `forbid "${f.message}" needs a valid habit`);
});
test("topic words are specific (no tiny or generic stems the banana trick could match)", () => {
  const generic = new Set(["which", "what", "the", "and", "you", "your", "for", "with", "this", "that", "will", "can", "get", "make", "thing", "time"]);
  for (const s of content.scenarios) for (const w of s.topic) {
    assert.ok(w.length >= 2 && !generic.has(w) && !/^\d$/.test(w), `${s.id}: topic word "${w}" is too generic`);
  }
});
