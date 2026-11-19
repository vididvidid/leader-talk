// Progress, levels and review scheduling. Pure functions over a plain state object.
export const DAY = 86400000;
export const INTERVALS = [1, 3, 7, 14, 30, 60]; // spaced-review days
export const LEVEL_NAMES = ["unaware", "heard of it", "can follow along", "can do with help",
  "can do independently", "can teach it / edge cases"];
export const STATE_VERSION = 1;

export function emptyState() {
  return { version: STATE_VERSION, attempts: [], scenarios: {}, quizzes: {}, surgery: {}, reallife: [], days: [] };
}

export function migrate(s) {
  const base = emptyState();
  if (!s || typeof s !== "object") return base;
  return { ...base, ...s, version: STATE_VERSION };
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

/** 2 due reviews + 1 new scenario from the weakest skill + 1 quiz + 1 surgery. */
export function dailyPlan(state, content, now = Date.now()) {
  const plan = [];
  const due = Object.entries(state.scenarios)
    .filter(([id, st]) => st.due && st.due <= now && content.scenarios.some(s => s.id === id))
    .sort((a, b) => a[1].due - b[1].due);
  for (const [id] of due.slice(0, 2)) plan.push({ kind: "scenario", id, why: "Spaced review: you passed this before. Can you still do it without hints?" });
  const order = [...content.skills].sort((a, b) => skillLevel(state, content, a.id) - skillLevel(state, content, b.id) || content.skills.indexOf(a) - content.skills.indexOf(b));
  let picked = false;
  for (const sk of order) {
    const fresh = content.scenarios.filter(s => s.skill === sk.id && !state.scenarios[s.id]).sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2));
    if (fresh.length) { plan.push({ kind: "scenario", id: fresh[0].id, why: `New: your weakest skill is "${sk.name}".` }); picked = true; break; }
  }
  if (!picked) {
    const weak = content.scenarios.filter(s => !state.scenarios[s.id]?.firstTryPass && !plan.some(p => p.id === s.id));
    if (weak.length) plan.push({ kind: "scenario", id: weak[Math.floor((now / DAY) % weak.length)].id, why: "Not yet passed on the first try." });
  }
  const q = content.quizzes.find(q => !state.quizzes[q.id]);
  if (q) plan.push({ kind: "quiz", id: q.id, skill: q.skill, why: "Spot the pattern." });
  const x = content.surgery.find(x => !state.surgery[x.id]?.passed);
  if (x) plan.push({ kind: "surgery", id: x.id, why: "Fix a weak sentence" + (x.mine ? " (one of YOUR own)." : ".") });
  return plan;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function recordScenario(state, scenario, result, tryNo, text, { timed = false, now = Date.now() } = {}) {
  const st = state.scenarios[scenario.id] ||= { best: 0, passes: 0, firstTryPass: false, reviewPasses: 0 };
  const isReview = Boolean(st.due) && tryNo === 1 && st.due <= now;
  const out = { isReview };
  st.best = Math.max(st.best || 0, result.score);
  st.last = now;
  if (result.passed) {
    if (tryNo === 1) st.firstTryPass = true;
    if (isReview) { st.reviewPasses = (st.reviewPasses || 0) + 1; st.reviewFailed = false; }
    if (tryNo === 1 || !st.due) {
      st.passes = (st.passes || 0) + 1;
      const step = Math.min(st.passes - 1, INTERVALS.length - 1);
      st.due = now + INTERVALS[step] * DAY;
      out.nextReviewDays = INTERVALS[step];
    } else st.passes = Math.max(st.passes || 0, 1);
  } else if (isReview) {
    st.reviewFailed = true; st.passes = 0; st.due = now + DAY; out.reviewFailed = true;
  }
  state.attempts.push({ id: uid(), ts: now, kind: "scenario", ref: scenario.id, title: scenario.title, text, score: result.score, try: tryNo, timed,
    issues: result.issues.map(i => i.id) });
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
