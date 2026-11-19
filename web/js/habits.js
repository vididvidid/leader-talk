// Mistake types: the shared vocabulary for "what is this person doing wrong?".
// Used by Diagnose mode (you spot them in someone else's reply) and by the weekly habit report.
export const HABITS = [
  { id: "guilt", name: "Sounds guilty / over-apologises", issues: ["sorry", "sorry_disturb", "sorry_repeat"],
    hint: "Apologising when nothing is their fault." },
  { id: "defensive", name: "Defends themself / blames", issues: ["tried_best", "not_my_fault", "blame"],
    hint: "Focus moves to who is at fault, not the problem." },
  { id: "powerless", name: "Hedges / shrinks themself", issues: ["hedge_stack", "just", "self_diminish", "tag_question", "fillers", "intensifiers", "actually_overuse"],
    hint: "maybe, kind of, just, \"…, right?\", umm, \"I'm just a…\"" },
  { id: "fake_yes", name: "Fakes agreement", issues: ["false_yes"],
    hint: "Says yes or \"makes sense\" without understanding." },
  { id: "dismissive", name: "Dismissive / judgemental", issues: ["calm_down", "as_i_said", "judgement", "casual"],
    hint: "\"Calm down\", \"obviously\", \"that's a stupid idea\", too casual." },
  { id: "buried", name: "Buries or blurs the point", issues: ["vague_opener", "throat_clearing", "pardon_actually", "double_negative", "long_sentence"],
    hint: "Vague opener, filler start, unclear wording." },
  { id: "bluff", name: "Over-claims / bluffs", issues: ["bluff"],
    hint: "\"Definitely\", \"100%\" without evidence." },
  { id: "order", name: "Gives a bare order", issues: ["bald_imperative"],
    hint: "\"Fix it.\" in a sensitive moment." },
  { id: "off_topic", name: "Doesn't address the topic", issues: ["off_topic"],
    hint: "Polite words, but not about what was asked." },
  { id: "no_next", name: "No next step", missing: ["ownership", "timeline"],
    hint: "Nobody knows what happens next or when." },
  { id: "ignores", name: "Ignores the other person", missing: ["acknowledge", "summarize_back"],
    hint: "Doesn't show they heard the concern." },
  { id: "phrasing", name: "Outdated or non-standard phrasing", issues: ["needful", "kindly", "revert", "prepone", "doubt", "discuss_about",
      "the_lot", "makes_the_sense", "could_tell", "while_my", "today_morning", "yesterday_night", "cope_up", "return_back", "out_of_station",
      "myself_name", "sir_overuse", "gentle_reminder", "phrasing_stat", "pw_utilise", "pw_commence", "pw_prior", "pw_in_order",
      "pw_point_in_time", "pw_due_fact", "pw_event", "pw_regards", "pw_find_attached", "pw_updation", "pw_intimate", "pw_the_same", "pw_earliest",
      "pw_passed_out", "pw_urgent_basis", "pw_humbly", "pw_having_q", "pw_good_name", "reply_you", "married_with", "senior_than", "good_in"],
    hint: "\"Kindly do the needful\", \"revert\", \"I have a doubt\"." },
];
const BY_ISSUE = {};
for (const h of HABITS) for (const i of h.issues || []) BY_ISSUE[i] = h.id;

/** Habit ids present in an analysis result (or in a list of issue ids). */
export function habitsOf(result) {
  const out = new Set();
  const issueIds = Array.isArray(result) ? result : result.issues.map(i => i.id);
  for (const id of issueIds) if (BY_ISSUE[id]) out.add(BY_ISSUE[id]);
  if (!Array.isArray(result)) {
    for (const h of HABITS) if (h.missing && result.missing.some(m => h.missing.includes(m.id))) out.add(h.id);
    for (const i of result.issues) if (i.id === "forbid" && i.habit) out.add(i.habit);
  }
  return out;
}

/** Top habits over a time window, with the previous window for comparison. */
export function habitReport(state, now = Date.now(), days = 7) {
  const span = days * 86400000;
  const count = (from, to) => {
    const c = {};
    const add = (issues, missing = []) => {
      for (const h of habitsOf({ issues: issues.map(id => ({ id })), missing: missing.map(id => ({ id })) })) c[h] = (c[h] || 0) + 1;
    };
    for (const a of state.attempts) if (a.ts >= from && a.ts < to && a.issues && a.try === 1) add(a.issues, a.missing);
    for (const r of state.reallife) if (r.ts >= from && r.ts < to && r.saidIssues) add(r.saidIssues);
    for (const t of state.roleplayTurns || []) if (t.ts >= from && t.ts < to) add(t.issues, t.missing);
    return c;
  };
  const cur = count(now - span, now + 1), prev = count(now - 2 * span, now - span);
  return Object.entries(cur).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, n]) => ({ id, name: HABITS.find(h => h.id === id).name, count: n, previous: prev[id] || 0 }));
}
