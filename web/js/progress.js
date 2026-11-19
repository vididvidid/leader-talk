// Progress, levels and review scheduling. Pure functions over a plain state object.
export const DAY = 86400000;
// Spaced repetition: SM-2 (P. Wozniak, 1990), the formula behind SuperMemo and Anki.
export const LEVEL_NAMES = ["unaware", "heard of it", "can follow along", "can do with help",
  "can do independently", "can teach it / edge cases"];
export const STATE_VERSION = 2;

export function emptyState() {
  return { version: STATE_VERSION, attempts: [], scenarios: {}, quizzes: {}, surgery: {}, reallife: [], days: [],
    roleplays: {}, roleplayTurns: [], diagnoseSeen: {}, diagnose: { rounds: 0, spotted: 0, missed: 0, extra: 0, byHabit: {} } };
}

export function migrate(s) {
  const base = emptyState();
  if (!s || typeof s !== "object") return base;
  const out = { ...base, ...s, version: STATE_VERSION };
  if ((s.version || 1) < 2) {
    for (const st of Object.values(out.scenarios)) {
      st.ef ??= 2.5; st.n ??= st.passes || 0; st.interval ??= st.passes ? 1 : 0;
    }
  }
  return out;
}

/** Map a 0-100 score to SM-2 recall quality 0-5. */
export const quality = score => score >= 90 ? 5 : score >= 80 ? 4 : score >= 70 ? 3 : score >= 50 ? 2 : score >= 30 ? 1 : 0;

/** SM-2 update. q >= 3 counts as recalled. Returns the new { ef, n, interval (days) }. */
export function sm2({ ef = 2.5, n = 0, interval = 0 } = {}, q) {
  if (q >= 3) { interval = n === 0 ? 1 : n === 1 ? 6 : Math.round(interval * ef); n += 1; }
  else { n = 0; interval = 1; }
  ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { ef: Math.round(ef * 100) / 100, n, interval };
}

const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function markDay(state, now = Date.now()) {
  const k = dayKey(now);
  if (!state.days.includes(k)) state.days.push(k);
}
export function streak(state, now = Date.now()) {
  const days = new Set(state.days);
  let n = 0, t = now;
  if (!days.has(dayKey(t))) t -= DAY; // still alive if you practised yesterday
  while (days.has(dayKey(t))) { n++; t -= DAY; }
  return n;
}

/** Levels are earned:
 * 1 touched it · 2 all quizzes right first time, or a scenario >= 50 · 3 passed a scenario (hints allowed)
 * 4 passed 2+ different scenarios on the FIRST try · 5 level 4 + a hard one first try + a spaced review passed.
 * A failed review drops the level by one until it is passed again. */
export function skillLevel(state, content, sid) {
  const quizzes = content.quizzes.filter(q => q.skill === sid);
  const scens = content.scenarios.filter(s => s.skill === sid);
  const qs = quizzes.map(q => state.quizzes[q.id]);
  const ss = scens.map(s => state.scenarios[s.id]);
  const touched = qs.some(Boolean) || ss.some(Boolean) || Object.values(state.surgery).some(v => v && v.skill === sid);
  if (!touched) return 0;
  let lvl = 1;
  if ((qs.length && qs.every(q => q && q.firstCorrect)) || ss.some(s => s && s.best >= 50)) lvl = 2;
  if (ss.some(s => s && s.passes > 0)) lvl = 3;
  if (ss.filter(s => s && s.firstTryPass).length >= 2) {
    lvl = 4;
    const hardOk = scens.some(s => s.hard && state.scenarios[s.id]?.firstTryPass);
    const reviewOk = ss.some(s => s && s.reviewPasses > 0);
    if (hardOk && reviewOk) lvl = 5;
  }
  if (ss.some(s => s && s.reviewFailed)) lvl = Math.max(1, lvl - 1);
  return lvl;
}

export function summary(state, content, now = Date.now()) {
  const skills = content.skills.map(sk => {
    const level = skillLevel(state, content, sk.id);
    return { ...sk, level, levelName: LEVEL_NAMES[level] };
  });
  const due = Object.entries(state.scenarios).filter(([id, st]) => st.due && st.due <= now && content.scenarios.some(s => s.id === id)).map(([id]) => id);
  const overall = Math.round(100 * skills.reduce((a, s) => a + s.level, 0) / (5 * skills.length));
  return { skills, overall, due, streak: streak(state, now), totalAttempts: state.attempts.length, daysPractised: state.days.length };
}

/** Interleaved daily plan (mixing skills beats drilling one at a time):
 * up to 2 due reviews from different skills, 1 new scenario from the weakest skill (lowest pressure first),
 * 1 role-play, 1 diagnose round, then a quiz and a surgery item if any are left. */
export function dailyPlan(state, content, now = Date.now()) {
  const plan = [], usedSkills = new Set();
  const skillOf = id => content.scenarios.find(s => s.id === id)?.skill;
  const due = Object.entries(state.scenarios)
    .filter(([id, st]) => st.due && st.due <= now && skillOf(id))
    .sort((a, b) => a[1].due - b[1].due);
  for (const [id] of due) {
    if (plan.length >= 2) break;
    if (usedSkills.has(skillOf(id))) continue;
    usedSkills.add(skillOf(id));
    plan.push({ kind: "scenario", id, why: "Spaced review: can you still do it without hints?" });
  }
  const order = [...content.skills].sort((a, b) => skillLevel(state, content, a.id) - skillLevel(state, content, b.id) || content.skills.indexOf(a) - content.skills.indexOf(b));
  let picked = false;
  for (const sk of order) {
    if (usedSkills.has(sk.id)) continue;
    const fresh = content.scenarios.filter(s => s.skill === sk.id && !state.scenarios[s.id])
      .sort((a, b) => (a.pressure || 2) - (b.pressure || 2) || (a.hard ? 1 : 0) - (b.hard ? 1 : 0));
    if (fresh.length) { plan.push({ kind: "scenario", id: fresh[0].id, why: `New: your weakest skill is "${sk.name}".` }); picked = true; break; }
  }
  if (!picked) {
    const weak = content.scenarios.filter(s => !state.scenarios[s.id]?.firstTryPass && !plan.some(p => p.id === s.id));
    if (weak.length) plan.push({ kind: "scenario", id: weak[Math.floor((now / DAY) % weak.length)].id, why: "Not yet passed on the first try." });
  }
  const rps = content.roleplays || [];
  const rp = rps.find(r => !state.roleplays?.[r.id]) || rps.find(r => state.roleplays[r.id].best !== "good");
  if (rp) plan.push({ kind: "roleplay", id: rp.id, why: "A full conversation: the other person reacts to what you say." });
  plan.push({ kind: "diagnose", id: "daily", why: "Spot what someone else is doing wrong. Training your eye trains your mouth." });
  const q = content.quizzes.find(q => !state.quizzes[q.id]);
  if (q) plan.push({ kind: "quiz", id: q.id, skill: q.skill, why: "Spot the pattern." });
  const x = content.surgery.find(x => !state.surgery[x.id]?.passed);
  if (x) plan.push({ kind: "surgery", id: x.id, why: "Fix a weak sentence" + (x.mine ? " (one of YOUR own)." : ".") });
  return plan.slice(0, 6);
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function recordScenario(state, scenario, result, tryNo, text, { timed = false, now = Date.now() } = {}) {
  const st = state.scenarios[scenario.id] ||= { best: 0, passes: 0, firstTryPass: false, reviewPasses: 0, ef: 2.5, n: 0, interval: 0 };
  const isReview = Boolean(st.due) && tryNo === 1 && st.due <= now;
  const out = { isReview };
  st.best = Math.max(st.best || 0, result.score);
  st.last = now;
  if (tryNo === 1) {
    // Only first tries are real recall (no hints yet), so only they move the schedule.
    Object.assign(st, sm2(st, quality(result.score)));
    st.due = now + st.interval * DAY;
    out.nextReviewDays = st.interval;
  }
  if (result.passed) {
    st.passes = (st.passes || 0) + 1;
    if (tryNo === 1) st.firstTryPass = true;
    if (isReview) { st.reviewPasses = (st.reviewPasses || 0) + 1; st.reviewFailed = false; }
  } else if (isReview && st.passes > 0) {
    st.reviewFailed = true; out.reviewFailed = true;
  }
  state.attempts.push({ id: uid(), ts: now, kind: "scenario", ref: scenario.id, title: scenario.title, text, score: result.score, try: tryNo, timed,
    issues: result.issues.map(i => i.id), missing: result.missing.map(m => m.id).filter(Boolean) });
  markDay(state, now);
  return out;
}

export function recordQuiz(state, quiz, choice, why, now = Date.now()) {
  const correct = Boolean(quiz.options[choice]?.correct);
  if (!state.quizzes[quiz.id]) state.quizzes[quiz.id] = { firstCorrect: correct, why, ts: now };
  markDay(state, now);
  return correct;
}

export function recordSurgery(state, item, result, text, now = Date.now()) {
  const st = state.surgery[item.id] ||= { skill: item.skill, best: 0 };
  st.best = Math.max(st.best, result.score);
  st.passed = Boolean(st.passed || result.passed);
  state.attempts.push({ id: uid(), ts: now, kind: "surgery", ref: item.id, title: "Surgery: " + item.weak.slice(0, 40), text, score: result.score, try: 1,
    issues: result.issues.map(i => i.id) });
  markDay(state, now);
}

export function recordReal(state, entry, now = Date.now()) {
  state.reallife.push({ id: uid(), ts: now, ...entry });
  markDay(state, now);
}

const RANK = { bad: 0, mixed: 1, good: 2 };
export function recordRoleplay(state, rp, outcome, turns, now = Date.now()) {
  const st = state.roleplays[rp.id] ||= { runs: 0, best: null };
  st.runs++; st.last = now; st.lastOutcome = outcome;
  if (st.best === null || RANK[outcome] > RANK[st.best]) st.best = outcome;
  for (const t of turns) state.roleplayTurns.push({ ts: now, rp: rp.id, node: t.node, score: t.score, issues: t.issues, missing: t.missing });
  if (state.roleplayTurns.length > 2000) state.roleplayTurns.splice(0, state.roleplayTurns.length - 2000);
  markDay(state, now);
}

export function recordDiagnose(state, key, picked, now = Date.now()) {
  const d = state.diagnose;
  const spotted = [...key].filter(h => picked.has(h)), missed = [...key].filter(h => !picked.has(h)), extra = [...picked].filter(h => !key.has(h));
  d.rounds++; d.spotted += spotted.length; d.missed += missed.length; d.extra += extra.length;
  for (const h of key) { const b = d.byHabit[h] ||= { seen: 0, spotted: 0 }; b.seen++; if (picked.has(h)) b.spotted++; }
  markDay(state, now);
  return { spotted, missed, extra };
}
