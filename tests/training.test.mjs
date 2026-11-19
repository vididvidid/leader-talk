import { test } from "node:test";
import assert from "node:assert/strict";
import { walk, step, specOf } from "../web/js/roleplay.js";
import { buildPool, nextItem } from "../web/js/diagnose.js";
import { habitsOf, habitReport, HABITS } from "../web/js/habits.js";
import { analyze, ISSUES } from "../web/js/engine.js";
import * as P from "../web/js/progress.js";
import { content } from "./helpers.mjs";

for (const rp of content.roleplays) {
  test(`role-play ${rp.id}: graph is valid`, () => {
    assert.ok(rp.nodes[rp.start], "start node exists");
    const reach = new Set([rp.start]), stack = [rp.start];
    while (stack.length) {
      const n = rp.nodes[stack.pop()];
      if (n.ending) { assert.ok(["good", "mixed", "bad"].includes(n.ending.outcome)); continue; }
      assert.ok(n.says && n.spec && n.branches?.length && n.tests, "decision node complete");
      assert.equal(n.branches.at(-1).if, undefined, "last branch is the default");
      for (const b of n.branches) {
        assert.ok(rp.nodes[b.next], `next ${b.next} exists`);
        if (!reach.has(b.next)) { reach.add(b.next); stack.push(b.next); }
      }
    }
    assert.deepEqual([...reach].sort(), Object.keys(rp.nodes).sort(), "every node reachable");
    assert.ok(Object.values(rp.nodes).some(n => n.ending?.outcome === "good"), "has a good ending");
    assert.ok(Object.values(rp.nodes).some(n => n.ending?.outcome === "bad"), "has a bad ending");
  });
  test(`role-play ${rp.id}: strong replies lead to good, weak to bad`, () => {
    for (const path of rp.paths) {
      let id = rp.start;
      const answers = [];
      for (const kind of path.answers) { answers.push(rp.nodes[id].tests[kind]); id = step(rp, id, answers.at(-1)).next; if (rp.nodes[id].ending) break; }
      const w = walk(rp, answers);
      assert.equal(w.ending?.outcome, path.outcome, `${path.answers.join(",")} -> ${w.end} ${JSON.stringify(w.turns)}`);
    }
  });
  test(`role-play ${rp.id}: every node's good reply passes its own check`, () => {
    for (const [id, n] of Object.entries(rp.nodes)) {
      if (n.ending) continue;
      const r = analyze(n.tests.good, specOf(rp, n));
      assert.ok(r.passed, `${id}: ${r.score} ${r.missing.map(m => m.label)} ${r.issues.map(i => i.id)}`);
    }
  });
}

test("habits cover every non-grammar issue", () => {
  const covered = new Set(HABITS.flatMap(h => h.issues || []));
  const skip = new Set(["lowercase_i", "double_dots", "forbid", "spelling"]);
  for (const [id] of ISSUES) if (!skip.has(id)) assert.ok(covered.has(id), `issue ${id} has no habit`);
});
test("diagnose pool: plenty of items, each with an answer key", () => {
  const pool = buildPool(content);
  assert.ok(pool.length >= 40, `pool size ${pool.length}`);
  assert.ok(pool.every(p => p.key.size >= 1));
  const seen = {};
  for (let r = 0; r < pool.length; r++) { const it = nextItem(pool, seen, r); seen[it.id] = (seen[it.id] || 0) + 1; }
  assert.equal(Object.keys(seen).length, pool.length, "every item shown once before repeats");
});
test("diagnose scoring", () => {
  const S = P.emptyState();
  const r = P.recordDiagnose(S, new Set(["guilt", "defensive"]), new Set(["guilt", "fake_yes"]));
  assert.deepEqual(r, { spotted: ["guilt"], missed: ["defensive"], extra: ["fake_yes"] });
  assert.equal(S.diagnose.byHabit.defensive.spotted, 0);
});
test("weekly habit report counts first tries and compares with last week", () => {
  const S = P.emptyState(), now = Date.UTC(2026, 0, 20);
  const s = content.scenarios[0];
  const weak = analyze("Sorry, I tried my best.", { moves: ["ownership"] });
  P.recordScenario(S, s, weak, 1, "x", { now: now - 1000 });
  P.recordScenario(S, s, weak, 2, "x", { now: now - 500 });            // second tries don't count
  P.recordScenario(S, s, weak, 1, "x", { now: now - 8 * P.DAY });     // last week
  const rep = habitReport(S, now);
  const g = rep.find(h => h.id === "guilt");
  assert.equal(g.count, 1); assert.equal(g.previous, 1);
  assert.ok(rep.some(h => h.id === "no_next"));
});
test("habitsOf maps issues and missing moves", () => {
  const h = habitsOf(analyze("Okay yeah sure, makes the sense.", { moves: ["ownership"] }));
  assert.ok(h.has("fake_yes") && h.has("no_next") && h.has("phrasing"));
});
