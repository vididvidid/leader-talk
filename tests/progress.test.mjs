import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "../web/js/progress.js";
import { analyze, specFor } from "../web/js/engine.js";
import { content } from "./helpers.mjs";

const T0 = Date.UTC(2026, 0, 5, 10);
const sc = (skill, hard = false) => content.scenarios.filter(s => s.skill === skill && !!s.hard === hard);
const pass = s => analyze(s.models[0], specFor(s));

test("levels are earned: first-try passes on two scenarios => level 4", () => {
  const S = P.emptyState();
  const [a, b] = sc("idk");
  P.recordScenario(S, a, pass(a), 1, a.models[0], { now: T0 });
  assert.equal(P.skillLevel(S, content, "idk"), 3);
  P.recordScenario(S, b, pass(b), 1, b.models[0], { now: T0 });
  assert.equal(P.skillLevel(S, content, "idk"), 4);
});
test("passing only after hints does not give level 4", () => {
  const S = P.emptyState();
  for (const s of sc("idk")) {
    P.recordScenario(S, s, analyze("Okay sure.", specFor(s)), 1, "x", { now: T0 });
    P.recordScenario(S, s, pass(s), 2, s.models[0], { now: T0 });
  }
  assert.equal(P.skillLevel(S, content, "idk"), 3);
});
test("level 5 needs a hard scenario and a passed spaced review; failed review drops a level", () => {
  const S = P.emptyState();
  const all = content.scenarios.filter(s => s.skill === "clarify");
  for (const s of all) P.recordScenario(S, s, pass(s), 1, s.models[0], { now: T0 });
  assert.equal(P.skillLevel(S, content, "clarify"), 4);
  const later = T0 + 2 * P.DAY, s = all[0];
  const out = P.recordScenario(S, s, pass(s), 1, s.models[0], { now: later });
  assert.ok(out.isReview);
  assert.equal(P.skillLevel(S, content, "clarify"), 5);
  const s2 = all[1];
  const out2 = P.recordScenario(S, s2, analyze("Okay sure.", specFor(s2)), 1, "x", { now: later });
  assert.ok(out2.reviewFailed);
  assert.equal(P.skillLevel(S, content, "clarify"), 4);
});
test("SM-2: intervals grow 1, 6, 16 days for perfect recall", () => {
  const S = P.emptyState(), s = content.scenarios[0];
  let now = T0;
  for (const days of [1, 6, 16]) {
    const out = P.recordScenario(S, s, pass(s), 1, "x", { now });
    assert.equal(out.nextReviewDays, days);
    now += days * P.DAY;
  }
});
test("streak counts consecutive days", () => {
  const S = P.emptyState();
  for (let d = 0; d < 3; d++) P.markDay(S, T0 + d * P.DAY);
  assert.equal(P.streak(S, T0 + 2 * P.DAY), 3);
  assert.equal(P.streak(S, T0 + 3 * P.DAY), 3);
  assert.equal(P.streak(S, T0 + 5 * P.DAY), 0);
});
test("daily plan mixes kinds of practice", () => {
  const plan = P.dailyPlan(P.emptyState(), content, T0);
  assert.deepEqual(plan.map(p => p.kind), ["scenario", "roleplay", "diagnose", "quiz", "surgery"]);
});
test("daily plan interleaves: due reviews come from different skills", () => {
  const S = P.emptyState();
  for (const s of content.scenarios.filter(x => x.skill === "idk")) P.recordScenario(S, s, pass(s), 1, "x", { now: T0 });
  const s2 = content.scenarios.find(x => x.skill === "tone");
  P.recordScenario(S, s2, pass(s2), 1, "x", { now: T0 });
  const plan = P.dailyPlan(S, content, T0 + 3 * P.DAY).filter(p => p.why.startsWith("Spaced"));
  const skills = plan.map(p => content.scenarios.find(s => s.id === p.id).skill);
  assert.equal(new Set(skills).size, skills.length);
  assert.equal(plan.length, 2);
});
test("SM-2: a failed recall resets to 1 day and lowers ease (never below 1.3)", () => {
  let c = { ef: 2.5, n: 3, interval: 20 };
  c = P.sm2(c, 1);
  assert.equal(c.interval, 1); assert.equal(c.n, 0); assert.ok(c.ef < 2.5);
  for (let i = 0; i < 20; i++) c = P.sm2(c, 0);
  assert.equal(c.ef, 1.3);
});
test("version 1 progress is migrated", () => {
  const m = P.migrate({ version: 1, scenarios: { a: { passes: 2, due: 5 } } });
  assert.equal(m.version, 2); assert.equal(m.scenarios.a.n, 2); assert.ok(m.roleplays && m.diagnose);
});
test("old or broken saved state is repaired", () => {
  assert.deepEqual(P.migrate(null), P.emptyState());
  assert.ok(Array.isArray(P.migrate({ attempts: [{}] }).reallife));
});
