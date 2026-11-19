// Diagnose mode: read someone else's reply and name what they're doing wrong.
// The answer key comes from the same engine, so what you learn to spot is exactly what the app checks.
import { analyze, specFor } from "./engine.js";
import { habitsOf } from "./habits.js";

export function buildPool(content) {
  const items = [];
  const add = (id, context, line, reply, spec) => {
    const result = analyze(reply, spec);
    const key = habitsOf(result);
    if (key.size) items.push({ id, context, line, reply, spec, key, result });
  };
  for (const s of content.scenarios) {
    s.tests.fail.forEach((reply, k) => add(`${s.id}#${k}`, s.context, s.line, reply, specFor(s)));
  }
  for (const x of content.surgery) add(x.id, x.context, null, x.weak, specFor(x));
  for (const q of content.quizzes) {
    q.options.forEach((o, k) => { if (!o.correct) add(`${q.id}#${k}`, q.situation, null, o.text.replace(/^\(.*\)$/, ""), { skill: q.skill }); });
  }
  return items;
}

/** Pick the next item: least-seen first, then a deterministic shuffle by round number. */
export function nextItem(pool, seen, round) {
  const min = Math.min(...pool.map(p => seen[p.id] || 0));
  const fresh = pool.filter(p => (seen[p.id] || 0) === min);
  return fresh[(round * 7919) % fresh.length];
}
