// Leader Talk feedback engine. Pure functions, no AI, no network.
// analyze(text, spec) checks a reply for:
//   MOVES  - things confident, respectful speakers do (acknowledge, lead with the fact, ...)
//   ISSUES - habits that weaken a reply (over-apologising, blame, vague openers, usage slips ...)
// plus research-based checks: relevance, double negatives, powerless-speech density,
// politeness of face-threatening acts, observation vs evaluation, and length.

const NEG_WORDS = String.raw`not|never|no|don't|doesn't|didn't|won't|can't|cannot|shouldn't|wouldn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|nobody|nothing`;
const NEG = new RegExp(String.raw`\b(${NEG_WORDS})\b`, "gi");

// ------------------------------------------------------------------ moves
export const MOVES = {
  acknowledge: {
    label: "Acknowledge the other person", principle: "politeness", neg: true,
    tip: "Show you heard them before you respond. Name their concern in a few words.",
    patterns: [
      String.raw`\bi (understand|see|hear you|get (it|that|why|the concern))\b`,
      String.raw`\bthanks?( you)? for (flagging|raising|pointing|letting|bringing|telling|checking|catching|sharing|the|thinking)\b`,
      String.raw`\bthank you\b`, String.raw`\bi appreciate\b`,
      String.raw`\b(that's|this is|it's) (a |an )?(fair|valid|good|important|serious|big|real|reasonable)\b`,
      String.raw`\bunderstood\b`, String.raw`\bgood (catch|point|question)\b`, String.raw`\bfair (point|question|enough)\b`,
      String.raw`\bi can see (why|how|that)\b`, String.raw`\bthat matters\b`, String.raw`\bi take (that|this) seriously\b`,
      String.raw`\bi'd (like|love|be happy) to help\b`, String.raw`\bhappy to\b`,
    ],
  },
  specific_question: {
    label: "Ask a specific question", principle: "psych_safety",
    tip: "Ask about the exact gap (which part / what number / where). \"Can you repeat?\" is too vague.",
    patterns: [
      String.raw`\b(which|what|where|when|how|who|whose)\b[^?.!]*\?`,
      String.raw`\b(could|can|would|will) you\b[^?.!]*\?`,
      String.raw`\b(is|are|does|do|did|should|shall) (it|this|that|the|we|they|you|there|their)\b[^?.!]*\?`,
    ],
  },
  summarize_back: {
    label: "Say back what you understood", principle: "active_listening", neg: true,
    tip: "Repeat the part you DID understand, then ask about the part you didn't. It proves you were listening.",
    patterns: [
      String.raw`\bif i (understand|understood|got|have)( (you|this|it|that))? (correctly|right)\b`,
      String.raw`\bso (you're|you are) saying\b`, String.raw`\bjust to (confirm|check|make sure|clarify)\b`,
      String.raw`\bto make sure i\b`, String.raw`\bdo you mean\b`, String.raw`\bare you saying\b`, String.raw`\bso the idea is\b`,
      String.raw`\bin other words\b`, String.raw`\bmy understanding is\b`, String.raw`\blet me (repeat|confirm|check i)\b`,
      String.raw`\bso (we|it|everything|the)\b[^?]*\?`, String.raw`\bi follow(ed)?\b`, String.raw`\bwhen you say\b`,
      String.raw`\bi (understood|got|get|understand) the\b[^.?!]*\bpart\b`,
    ],
  },
  ownership: {
    label: "Take ownership of a next step", principle: "implementation", neg: true,
    tip: "Say what YOU will do next (\"I'll check...\", \"Let me find out...\").",
    patterns: [
      String.raw`\bi'll\b`, String.raw`\blet me\b`, String.raw`\bi'm going to\b`,
      String.raw`\bi can (check|look|find|send|share|fix|get|verify|confirm|prepare|set up|walk|start)\b`,
      String.raw`\bi'm (checking|looking|on it|fixing|sending)\b`,
    ],
  },
  timeline: {
    label: "Give a time", principle: "implementation",
    tip: "Add WHEN (\"by 3 pm\", \"by tomorrow morning\", \"within an hour\"). A time makes a promise believable.",
    patterns: [
      String.raw`\bby (today|tonight|tomorrow|eod|end of|the end|monday|tuesday|wednesday|thursday|friday|saturday|sunday|noon|lunch|\d)`,
      String.raw`\bwithin\b`, String.raw`\bin the next\b`, String.raw`\b(this|tomorrow) (morning|afternoon|evening)\b`,
      String.raw`\btoday\b`, String.raw`\btomorrow\b`, String.raw`\b\d+\s*(min|mins|minutes|hours?|hrs?|days?)\b`,
      String.raw`\bbefore (the|our|we|launch|end|lunch|you)\b`, String.raw`\b(right after|after) (this|the) (call|meeting)\b`,
      String.raw`\b\d{1,2}(:\d\d)?\s*(am|pm)\b`, String.raw`\b(on )?(monday|tuesday|wednesday|thursday|friday)\b`, String.raw`\bnow\b`,
      String.raw`\bnext week\b`,
    ],
  },
  suggestion: {
    label: "Make a suggestion", principle: "politeness",
    tip: "Don't just hand over the problem. Bring a proposal (\"I'd suggest...\", \"Could we...?\").",
    patterns: [
      String.raw`\bi'd (suggest|recommend|propose)`, String.raw`\bi (suggest|recommend|propose)`,
      String.raw`\bmy (suggestion|recommendation|proposal)`, String.raw`\bhow about\b`, String.raw`\bwhat if we\b`,
      String.raw`\b(could|can|shall|should) we\b`, String.raw`\blet's\b`, String.raw`\bwe should\b`, String.raw`\bwe could\b`,
      String.raw`\bwe need to (fix|move|delay|add|hash|encrypt|test|keep|check)\b`,
    ],
  },
  options: {
    label: "Offer options", principle: "politeness",
    tip: "Give two choices. The other person keeps the decision, so it doesn't feel like a challenge.",
    patterns: [
      String.raw`\beither\b.*\bor\b`, String.raw`\boptions?\b`, String.raw`\balternatively\b`, String.raw`\bor we (could|can)\b`,
      String.raw`\btwo ways\b`, String.raw`\bone way\b`, String.raw`\bor (else )?(if|we|you|i)\b`, String.raw`\bor\b[^.?!]*\?`,
    ],
  },
  view: {
    label: "State your view clearly", principle: "grice_quality",
    tip: "Say what YOU think in one clear sentence (\"I don't think we can call that minor.\").",
    patterns: [
      String.raw`\bi don't think\b`, String.raw`\bin my (view|opinion|experience)\b`, String.raw`\bmy (concern|worry|view|read|take)\b`,
      String.raw`\bi'm (concerned|worried|not (sure|convinced))\b`, String.raw`\bi (think|believe|feel)\b`, String.raw`\bthe risk\b`,
      String.raw`\bi see it (a bit )?differently\b`, String.raw`\bi'd push back\b`, String.raw`\bi disagree\b`,
      String.raw`\bi'm not comfortable\b`, String.raw`\bi'd be careful\b`,
    ],
  },
  reason: {
    label: "Give a reason", principle: "because",
    tip: "Add the WHY (\"because...\", \"which means...\"). Reasons persuade; opinions alone don't.",
    patterns: [
      String.raw`\bbecause\b`, String.raw`\bsince\b`, String.raw`\bwhich means\b`, String.raw`\bthat means\b`, String.raw`\bso that\b`,
      String.raw`\bthe reason\b`, String.raw`\b(that gives|which gives|so that's|that's roughly|that's around|that's about)\b`,
      String.raw`\bif we\b.*\b(will|could|would|might|may)\b`, String.raw`\botherwise\b`, String.raw`\bit's (blocking|needed|required)\b`,
    ],
  },
  admit_gap: {
    label: "Admit the gap plainly", principle: "grice_quality",
    tip: "Say what you don't know, without an apology (\"I don't have the cost numbers with me.\").",
    patterns: [
      String.raw`\bi don't (know|have|remember|recall)\b`, String.raw`\bi'm not (sure|certain|familiar)\b`,
      String.raw`\bi haven't (checked|seen|looked|worked|used|memori[sz]ed)`, String.raw`\bnot (off the top of my head|offhand)\b`,
      String.raw`\bi don't want to guess\b`, String.raw`\bi'd (need|have) to check\b`, String.raw`\bnot (100|a hundred) ?%`,
    ],
  },
  share_known: {
    label: "Share what you DO know", principle: "grice_quality", neg: true,
    tip: "After the gap, give what you're sure of (\"What I do know is...\"). You stay useful.",
    patterns: [
      String.raw`\bwhat i (do )?know\b`, String.raw`(?<!n't )(?<!not )\bi (do )?know\b`, String.raw`\bi can tell you\b`,
      String.raw`\bwhat i can (say|tell|share|confirm)\b`, String.raw`\bfrom what i\b`,
      String.raw`\b(i've|i have) (seen|checked|found|noticed|tested)\b`, String.raw`\bi can confirm\b`,
      String.raw`\bwhat i'm (sure|confident|certain) (of|about)\b`, String.raw`\bi'm (sure|confident|certain) (that|about|of)\b`,
      String.raw`\b(on average|average case|typically|usually|in general)\b`,
    ],
  },
  structure: {
    label: "Give your answer a structure", principle: "minto",
    tip: "Signal the shape (\"Two things come to mind. First... Second...\"). Structure sounds calm.",
    patterns: [
      String.raw`\b(first|firstly|second|secondly|third|two things|three things|a couple of (things|ideas|points)|a few (things|ideas|points))\b`,
      String.raw`\bon one hand\b`, String.raw`\bmy (first|initial) (thought|take|reaction|guess)\b`,
      String.raw`\boff the top of my head\b`, String.raw`\bthinking (out loud|aloud)\b`, String.raw`\blet me think\b`,
      String.raw`\bstart (with|by)\b`, String.raw`\blet me (reason|work|walk|break)\b`, String.raw`\bthen\b.*\bthen\b`, String.raw`\b(step one|to begin)\b`,
      String.raw`\btwo possibilities\b`,
    ],
  },
  accept_point: {
    label: "Accept the point quickly", principle: "gibb", neg: true,
    tip: "If it's really your mistake, own it in one short sentence, then move on.",
    patterns: [
      String.raw`\byou're right\b`, String.raw`\bgood catch\b`, String.raw`\bfair point\b`, String.raw`\bi missed\b`,
      String.raw`\bthat's on me\b`, String.raw`\bmy mistake\b`, String.raw`\bi (got|made) (that|it|this|a) (wrong|mistake|error)\b`,
      String.raw`\bthanks for (catching|pointing)`, String.raw`\bi (sent|shared|used) the wrong\b`, String.raw`\bthat was my (error|mistake)\b`,
      String.raw`\bi take responsibility\b`, String.raw`\bi own (that|this)\b`, String.raw`\bi'm sorry\b`,
    ],
  },
};

// ------------------------------------------------------------------ issues
// [id, kind, pattern|null, message, fix, principle]
export const ISSUES = [
  ["sorry", "weak", String.raw`\bsorry\b`,
    "\"Sorry\" here makes you sound guilty, even though you did nothing wrong.",
    "Keep apologies for real mistakes, and then say it once. Otherwise go straight to the content.", "powerless"],
  ["tried_best", "weak", String.raw`\b(i )?(tried|did|gave) my (best|level best)\b|\bi worked (so |very )?hard\b`,
    "Defending your effort moves attention to YOU and invites judgement.",
    "Talk about the problem instead: \"Which part is off? I'll fix it.\"", "gibb"],
  ["not_my_fault", "weak", String.raw`\bnot my fault\b|\bit wasn't me\b|\bwhy should i\b`,
    "This sounds defensive. People stop listening once blame enters.",
    "Skip who is at fault. Say what happened and what's next.", "gibb"],
  ["self_diminish", "weak",
    String.raw`\bi'm (just|only) (a|an|the)\b|\b(stupid|silly|dumb|small|basic) (question|doubt|point)\b|\bmaybe i'm wrong\b|\bi (may|might|could) be wrong\b|\bi'm no expert\b`,
    "You're putting yourself down before anyone else does.",
    "Just ask or state it. Confident people don't pre-apologise for their questions.", "powerless"],
  ["hedge_stack", "weak", null,
    "Too many hedges (maybe / kind of / I guess / probably...). You sound unsure of yourself.",
    "Keep at most one hedge, where you are really uncertain.", "powerless"],
  ["false_yes", "weak", String.raw`\b(ok|okay|yeah|yes),? (yeah |yes )?sure\b|\bmakes the sense\b|\bsure,? (it )?makes sense\b`,
    "Saying yes / \"makes sense\" when you aren't sure is the habit you want to break.",
    "If anything is unclear, ask about it now. Asking is cheaper than faking.", "psych_safety"],
  ["vague_opener", "clarity",
    String.raw`\bwe need (a|to have a|to do a) (discussion|talk|look|meeting)\b|\bwe need a look\b|\bwe need to talk\b|\bcan we discuss\b`,
    "A vague opener. People tune out before they hear the real point.",
    "Lead with the fact: \"Some users can't log in at all.\"", "minto"],
  ["just", "weak", String.raw`\bjust (wanted|want|thought|checking|wondering|asking)\b`,
    "\"Just\" shrinks your request.", "Remove \"just\": \"I wanted to ask...\" or simply ask.", "powerless"],
  ["bluff", "clarity", String.raw`\b(definitely|100 ?%|surely|guaranteed)\b`,
    "Strong certainty words. Are you really that sure? Over-claiming hurts trust later.",
    "Only use them for facts you've checked.", "grice_quality"],
  ["calm_down", "tone", String.raw`\bcalm down\b|\brelax\b|\bchill\b|\bdon't (worry|panic)\b|\bno worries\b`,
    "To someone who is upset, \"calm down\" / \"relax\" sounds dismissive and makes it worse.",
    "Acknowledge instead: \"I understand, a 2-lakh gap is serious.\"", "gibb"],
  ["blame", "tone",
    String.raw`\byou're wrong\b|\byour fault\b|\byou (made|did) (a |the )?mistake\b|\byou didn't (read|understand|listen)\b|\byour (numbers|data|report) (is|are) wrong\b`,
    "Blaming the other person turns a problem into a fight.",
    "Describe the gap neutrally: \"Our numbers differ. Let's find where.\"", "gibb"],
  ["as_i_said", "tone", String.raw`\bas i (already )?(said|told|mentioned)\b|\bobviously\b|\bclearly you\b|\bwhatever\b`,
    "This sounds impatient or condescending.",
    "Restate the point calmly, without reminding them you said it before.", "gibb"],
  ["judgement", "tone",
    String.raw`\b(that's|this is|it's|this was|that was|your (idea|plan|code|approach|report|work|design) is)\s+(a |an )?(so |very |really |totally |completely )?(bad|stupid|useless|terrible|lazy|careless|nonsense|rubbish|pathetic|silly|dumb|ridiculous|crazy|horrible|awful)\b`,
    "That's a judgement, not an observation. The other person will defend their idea instead of reconsidering it.",
    "Describe what you saw or what could happen: \"If the database leaks, every password is exposed.\"", "nvc"],
  ["casual", "tone", String.raw`\bwell,? let's\b|\blol\b|\bhaha\b|\bbro\b|\bdude\b|\bya\b|\bnope\b`,
    "Too casual for a serious or formal moment.", "Use a neutral, serious tone when the other person is concerned.", "register"],
  ["fillers", "clarity", String.raw`\b(umm*|uhh*|hmm+|you know|basically|like,)(?=\W|$)`,
    "Fillers make you sound unsure and stretch the listener's patience.",
    "Pause silently instead. A short silence sounds more confident than \"umm\".", "powerless"],
  ["tag_question", "weak", String.raw`,\s*(right|isn't it|no|na|correct|okay|ok|yeah)\s*\?`,
    "A tag question (\"..., right?\") turns your statement into a request for permission.",
    "State it, or ask a real question.", "powerless"],
  ["intensifiers", "weak", String.raw`\b(very|really|so|too) (very|really|so|much)\b`,
    "Stacked intensifiers sound emotional, not confident.", "Use one precise word or a number instead.", "powerless"],
  ["throat_clearing", "clarity", null,
    "Your first words are filler (\"So basically... / As you know... / I just wanted to say...\"). The point arrives late.",
    "Start with the point itself.", "minto"],
  ["double_negative", "clarity", null,
    "Two negatives in one clause. The listener has to work out what you mean.",
    "Say it positively: \"I think we should fix it.\"", "grice_manner"],
  ["bald_imperative", "politeness", null,
    "A bare command (\"Fix it.\", \"Send it.\") in a sensitive moment sounds like an order, not a request.",
    "Soften the act, not the content: \"Could we fix it first?\" / \"Could you send it today?\"", "politeness"],
  ["off_topic", "relevance", null,
    "Your reply doesn't mention what this conversation is actually about.",
    "Respond to the real topic. Polite words alone aren't an answer.", "grice_relation"],
  ["needful", "grammar", String.raw`\bdo the needful\b`, "\"Do the needful\" sounds old-fashioned and vague.",
    "Say exactly what you need: \"Could you approve the request?\"", "usage"],
  ["kindly", "grammar", String.raw`\bkindly\b`, "\"Kindly\" sounds stiff and can come across as passive-aggressive.",
    "Use \"Could you...\" or \"Please...\"", "register"],
  ["revert", "grammar", String.raw`\brevert( back)?\b`, "\"Revert\" means \"go back to an earlier state\", not \"reply\".",
    "\"Please reply / get back to me by Friday.\"", "usage"],
  ["prepone", "grammar", String.raw`\bprepone`, "\"Prepone\" isn't used outside India.", "\"Move it earlier / bring it forward.\"", "usage"],
  ["doubt", "grammar", String.raw`\b(i have|i'm having|i am having|small|one|a) doubts?\b|\bmy doubt\b`,
    "In global English, \"doubt\" means suspicion that something is untrue.", "Say \"I have a question\".", "usage"],
  ["discuss_about", "grammar", String.raw`\bdiscuss about\b`, "\"Discuss\" takes no \"about\".", "\"discuss the plan\"", "usage"],
  ["explain_me", "grammar", String.raw`\bexplain me\b`, "Missing \"to\".", "\"explain to me\" / \"could you explain...\"", "usage"],
  ["the_lot", "grammar", String.raw`\bthe lot of\b`, "Wrong article.", "\"a lot of\"", "usage"],
  ["makes_the_sense", "grammar", String.raw`\bmakes the sense\b`, "No article needed.", "\"makes sense\"", "usage"],
  ["could_tell", "grammar", String.raw`\bcould tell me\b`, "Missing \"you\".", "\"could you tell me\"", "usage"],
  ["while_my", "grammar", String.raw`\bwhile my (testing|work|checking)\b`, "Wrong preposition.", "\"during my testing\" / \"while testing\"", "usage"],
  ["today_morning", "grammar", String.raw`\btoday (morning|evening|afternoon)\b`, "Unnatural word order.", "\"this morning\"", "usage"],
  ["yesterday_night", "grammar", String.raw`\byesterday night\b`, "Unnatural.", "\"last night\"", "usage"],
  ["cope_up", "grammar", String.raw`\bcope up\b`, "No \"up\".", "\"cope with\"", "usage"],
  ["return_back", "grammar", String.raw`\b(return|repeat|reply) (back|again)\b`, "Redundant word.", "\"return\" / \"repeat\" / \"reply\"", "usage"],
  ["out_of_station", "grammar", String.raw`\bout of station\b`, "Indian-only phrase.", "\"out of town / travelling\"", "usage"],
  ["myself_name", "grammar", String.raw`^\s*myself [a-z]+`, "\"Myself X\" isn't standard.", "\"I'm X\" / \"This is X\"", "usage"],
  ["pardon_actually", "clarity", String.raw`\bpardon( me)?\b`, "\"Pardon\" alone doesn't tell them WHAT you missed.",
    "Ask about the specific part: \"Which part keeps latency low?\"", "grice_quantity"],
  ["actually_overuse", "clarity", null, "\"Actually\" used more than once. It becomes a filler.",
    "Remove it. Your sentence is stronger without it.", "powerless"],
  ["sir_overuse", "grammar", null, "\"Sir/ma'am\" more than once. It sounds subservient in most global workplaces.",
    "Use their name, or nothing.", "register"],
  ["lowercase_i", "grammar", String.raw`(^|\s)i(\s|'|$)`, "\"i\" should be capital \"I\".", "Always write \"I\".", "usage"],
  ["double_dots", "grammar", String.raw`\.\.(?!\.)`, "\"..\" is not punctuation.", "End sentences with one full stop.", "usage"],
  ["sorry_disturb", "grammar", String.raw`\bsorry (to|for) (disturb|bother)`, "Apologising for existing.",
    "\"Hi Priya, do you have five minutes today?\"", "powerless"],
  ["gentle_reminder", "grammar", String.raw`\bgentle reminder\b`, "Common but a bit odd (and sounds passive-aggressive).",
    "\"Following up on my message from Monday...\"", "register"],
];
const ISSUE = Object.fromEntries(ISSUES.map(i => [i[0], i]));

const HEDGES = [String.raw`\bmaybe\b`, String.raw`\bkind of\b`, String.raw`\bsort of\b`, String.raw`\bi guess\b`, String.raw`\bprobably\b`,
  String.raw`\bperhaps\b`, String.raw`\ba (little )?bit\b`, String.raw`\bsomewhat\b`, String.raw`\bmight be\b`, String.raw`\bpossibly\b`];
const IMPERATIVE_VERBS = String.raw`do|fix|send|stop|give|change|make|check|tell|approve|reply|match|remove|add|move|delay|use|explain|show|listen|wait|cancel|finish|redo`;

export const PENALTY = { weak: 8, tone: 12, clarity: 6, grammar: 2, politeness: 6, relevance: 0 };
export const CAP = { weak: 30, tone: 30, clarity: 15, grammar: 10, politeness: 12, relevance: 0 };
export const PASS_MARK = 70;
const OFF_TOPIC_CAP = 40;

const CONTRACTIONS = [[/\bdo not\b/gi, "don't"], [/\bdoes not\b/gi, "doesn't"], [/\bcannot\b/gi, "can't"], [/\bcan not\b/gi, "can't"],
  [/\bI would\b/gi, "I'd"], [/\bI will\b/gi, "I'll"], [/\bI am\b/gi, "I'm"], [/\bhave not\b/gi, "haven't"], [/\bdid not\b/gi, "didn't"],
  [/\blet us\b/gi, "let's"], [/\bthat is\b/gi, "that's"], [/\byou are\b/gi, "you're"], [/\bit is\b/gi, "it's"], [/\bwe will\b/gi, "we'll"],
  [/\bwas not\b/gi, "wasn't"], [/\bwill not\b/gi, "won't"], [/\bwould not\b/gi, "wouldn't"], [/\bshould not\b/gi, "shouldn't"], [/\bis not\b/gi, "isn't"]];

export function normalize(text) {
  let t = String(text ?? "").replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, m => m[0] + rep.slice(1));
  return t;
}
export function sentences(text) {
  return text.trim().split(/(?<=[.!?])\s+|\n+|\.\.+\s*/).map(s => s.trim()).filter(Boolean);
}
export function words(text) { return text.match(/[A-Za-z0-9']+/g) || []; }

const rx = (p, flags = "is") => new RegExp(p, flags);

function negatedAt(text, index, len) {
  let before = text.slice(Math.max(0, index - 30), index).split(/[.!?,;]/).pop();
  const after = text.slice(index + len, index + len + 12).split(/[.!?,;]/)[0];
  const lastWords = before.trim().split(/\s+/).slice(-3).join(" ");
  return new RegExp(String.raw`\b(${NEG_WORDS})\b`, "i").test(lastWords) || /^\s*(not|never)\b/i.test(after);
}

function findMove(mv, scope) {
  for (const p of mv.patterns) {
    const re = rx(p, "gis");
    let m;
    while ((m = re.exec(scope)) !== null) {
      if (!(mv.neg && negatedAt(scope, m.index, m[0].length))) return m[0];
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return null;
}

export function resolveMove(m) {
  if (typeof m === "string") {
    if (!MOVES[m]) throw new Error("Unknown move: " + m);
    return { id: m, ...MOVES[m] };
  }
  return { tip: "", principle: m.principle || "grice_relation", ...m };
}

function stemHit(tokens, stems) {
  const low = tokens.map(t => t.toLowerCase());
  for (const s of stems) {
    const st = s.toLowerCase();
    if (st.includes(" ")) { if (low.join(" ").includes(st)) return s; continue; }
    if (low.some(w => w.startsWith(st))) return s;
  }
  return null;
}

/**
 * spec: { moves, forbid, allow, topic, skill, written }
 * returns { score, passed, found, missing, issues, bonus, metrics, lengthNote, offTopic }
 */
export function analyze(text, spec = {}) {
  const t = normalize(text).trim();
  const allow = new Set(spec.allow || []);
  const toks = words(t);
  const wc = toks.length;
  const sents = sentences(t);
  const first = sents[0] || "";

  // moves
  const found = [], missing = [];
  for (const m of spec.moves || []) {
    const mv = resolveMove(m);
    let scope = mv.first_sentence ? first : t;
    let hit = findMove(mv, scope);
    if (!hit && mv.first_sentence && sents.length > 1 && /^\s*(sorry|ok|okay|thanks?|hi|hello)\b[^.!?]{0,25}$/i.test(first)) {
      hit = findMove(mv, sents[1]); // allow a very short greeting/acknowledgement before the fact
    }
    if (hit) found.push({ id: mv.id, label: mv.label, hit: hit.trim(), principle: mv.principle });
    else missing.push({ id: mv.id, label: mv.label, tip: mv.tip, principle: mv.principle });
  }

  // issues
  const issues = [];
  const push = (id, hit, over = {}) => {
    const d = ISSUE[id];
    issues.push({ id, kind: d[1], hit, message: d[3], fix: d[4], principle: d[5], ...over });
  };
  for (const [id, , pat] of ISSUES) {
    if (!pat || allow.has(id)) continue;
    const m = new RegExp(pat, id === "lowercase_i" ? "m" : "im").exec(t);
    if (m) push(id, m[0].trim() || "i");
  }
  const hedges = HEDGES.map(h => rx(h, "i").exec(t)).filter(Boolean);
  if (hedges.length >= 2 && !allow.has("hedge_stack")) push("hedge_stack", hedges.map(h => h[0]).join(", "));
  const actuallyN = (t.match(/\bactually\b/gi) || []).length;
  if (actuallyN >= 2) push("actually_overuse", `actually ×${actuallyN}`);
  if ((t.match(/\b(sir|ma'am|madam)\b/gi) || []).length >= 2) push("sir_overuse", "sir/ma'am");
  const tc = /^\s*(so,? )?(basically|actually|first of all|as you (all )?know|i just wanted to say|i want to say that|i would like to say that|i'd like to say that)\b/i.exec(first);
  if (tc) push("throat_clearing", tc[0].trim());

  // double negatives (per clause)
  for (const clause of t.split(/[.!?;,]|\bbut\b|\band\b|\bor\b/i)) {
    const n = clause.match(NEG) || [];
    if (n.length >= 2 && !/\bnot only\b/i.test(clause)) { push("double_negative", clause.trim().slice(0, 60)); break; }
  }

  // politeness: bald imperatives in face-threatening moments
  if (spec.fta) {
    for (const s of sents) {
      const m = new RegExp(String.raw`^(please\s+)?(${IMPERATIVE_VERBS})\b`, "i").exec(s);
      if (m && !m[1] && !/\b(please|could|would|can|let's|we)\b/i.test(s)) { push("bald_imperative", s.slice(0, 40)); break; }
    }
  }

  if (/^\s*sorry\b/i.test(t)) {
    const s = issues.find(i => i.id === "sorry");
    if (s) s.message = "You OPENED with \"sorry\". The first word sets the tone: now you sound guilty before you've said anything.";
  }
  if (allow.has("sorry") && (t.match(/\b(sorry|apologi[sz]e)\b/gi) || []).length >= 2) {
    issues.push({ id: "sorry_repeat", kind: "weak", hit: "sorry ×2+", principle: "powerless",
      message: "An apology is right here, but say it ONCE. Repeating it sounds like begging.", fix: "One clear apology, then move to the fix." });
  }

  for (const f of spec.forbid || []) {
    const m = rx(f.pattern, "im").exec(t);
    if (!m) continue;
    const h = m[0].toLowerCase();
    if (issues.some(i => i.hit.length > 2 && (h.includes(i.hit.toLowerCase()) || i.hit.toLowerCase().includes(h)))) continue;
    issues.push({ id: "forbid", kind: f.kind || "weak", hit: m[0].trim(), message: f.message, fix: f.fix || "", principle: f.principle || "gibb" });
  }

  // relevance (Grice: Relation)
  let offTopic = false;
  if (spec.topic && spec.topic.length && wc > 0 && !stemHit(toks, spec.topic)) {
    offTopic = true;
    push("off_topic", "(no topic words)");
  }

  // good moves present even if not required
  const bonus = [];
  const req = new Set((spec.moves || []).map(m => resolveMove(m).label));
  for (const [id, mv] of Object.entries(MOVES)) {
    if (req.has(mv.label)) continue;
    const hit = findMove(mv, t);
    if (hit) bonus.push({ id, label: mv.label, hit: hit.trim() });
  }

  // score
  let score = (spec.moves && spec.moves.length) ? 30 + 70 * found.length / Math.max(1, found.length + missing.length) : 100;
  const byKind = {};
  for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + (PENALTY[i.kind] ?? 6);
  for (const [k, v] of Object.entries(byKind)) score -= Math.min(v, CAP[k] ?? 15);

  let lengthNote = null;
  const maxWords = spec.written ? 120 : 75;
  if (wc < 6) { score -= 15; lengthNote = "Very short. Did you say everything the moment needs?"; }
  else if (wc > maxWords) { score -= 5; lengthNote = `Long (${wc} words). Leaders are brief: aim for ${spec.written ? "a short paragraph" : "2-4 sentences in speech"}.`; }
  if (offTopic) score = Math.min(score, OFF_TOPIC_CAP);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const powerless = issues.filter(i => i.principle === "powerless").length;
  return {
    score, passed: score >= PASS_MARK, found, missing, bonus: bonus.slice(0, 4), issues, lengthNote, offTopic,
    metrics: { words: wc, sentences: sents.length, powerless, firstSentence: first,
      avgSentence: sents.length ? Math.round(wc / sents.length) : 0 },
  };
}

/** Spec for a scenario/surgery item from content.json */
export function specFor(item, skillOverride) {
  const skill = skillOverride || item.skill;
  return { moves: item.moves, forbid: item.forbid, allow: item.allow, topic: item.topic, skill,
    fta: ["disagree", "hold", "correction", "tone"].includes(skill), written: !!item.written };
}
