// Branching role-plays: scripted conversations where the other person's next line depends on
// what you actually said. No AI: each turn is scored with the normal engine, and the first
// branch whose condition matches decides where the conversation goes.
import { analyze } from "./engine.js";
import { habitsOf } from "./habits.js";

/** Condition language (all optional; an empty condition always matches):
 *  { passed: true|false } { habit: "guilt" } { issue: "calm_down" } { missing: "acknowledge" }
 *  { scoreBelow: 40 } { pattern: "regex" } { any: [cond, ...] } { all: [cond, ...] } */
export function matches(cond, r, text) {
  if (!cond) return true;
  if (cond.any) return cond.any.some(c => matches(c, r, text));
  if (cond.all) return cond.all.every(c => matches(c, r, text));
  if ("passed" in cond && r.passed !== cond.passed) return false;
  if (cond.habit && !habitsOf(r).has(cond.habit)) return false;
  if (cond.issue && !r.issues.some(i => i.id === cond.issue)) return false;
  if (cond.missing && !r.missing.some(m => m.id === cond.missing)) return false;
  if (cond.scoreBelow !== undefined && !(r.score < cond.scoreBelow)) return false;
  if (cond.pattern && !new RegExp(cond.pattern, "i").test(text)) return false;
  return true;
}

export function specOf(rp, node) {
  const skill = node.skill || rp.skill;
  return { ...node.spec, skill, fta: ["disagree", "hold", "correction", "tone"].includes(skill) };
}

/** Score a reply at a node and pick the branch. */
export function step(rp, nodeId, text) {
  const node = rp.nodes[nodeId];
  const result = analyze(text, specOf(rp, node));
  const branch = node.branches.find(b => matches(b.if, result, text));
  return { result, branch, next: branch.next, nextNode: rp.nodes[branch.next] };
}

/** Walk a full path of answers; used by the tests and handy for debugging content. */
export function walk(rp, answers) {
  let id = rp.start;
  const turns = [];
  for (const a of answers) {
    const node = rp.nodes[id];
    if (node.ending) break;
    const s = step(rp, id, a);
    turns.push({ node: id, score: s.result.score, next: s.next });
    id = s.next;
  }
  return { end: id, ending: rp.nodes[id].ending, turns };
}
