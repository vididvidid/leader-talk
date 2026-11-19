"""Rule-based communication coach. No AI, no internet.

It reads what you wrote and checks two things:
  1. MOVES   - the things a confident, respectful speaker does (acknowledge,
               lead with the fact, suggest, give options, take ownership...)
  2. ISSUES  - habits that make you sound weak, defensive, rude or unclear
               (over-apologising, "I tried my best", "calm down", vague openers,
               common Indian-English phrasing...)
"""
import re

# --------------------------------------------------------------------------
# Strong moves (reusable). Each scenario says which ones it needs.
# --------------------------------------------------------------------------
MOVES = {
    "acknowledge": {
        "label": "Acknowledge the other person",
        "tip": "Show you heard them before you respond. Name their concern in a few words.",
        "patterns": [
            r"\bi (understand|see|hear you|get (it|that|why|the concern))\b",
            r"\bthanks?( you)? for (flagging|raising|pointing|letting|bringing|telling|checking|catching|sharing|the)\b",
            r"\bthank you\b", r"\bi appreciate\b",
            r"\b(that'?s|this is|it'?s) (a |an )?(fair|valid|good|important|serious|big|real|reasonable)\b",
            r"\bunderstood\b", r"\bgood (catch|point|question)\b", r"\bfair (point|question|enough)\b",
            r"\bi can see (why|how|that)\b", r"\bthat matters\b", r"\bi take (that|this) seriously\b",
        ],
    },
    "specific_question": {
        "label": "Ask a specific question",
        "tip": "Ask about the exact gap (which part / what number / where). \"Can you repeat?\" is too vague.",
        "patterns": [
            r"\b(which|what|where|when|how|who|whose)\b[^?.!]*\?",
            r"\b(could|can|would|will) you\b[^?.!]*\?",
            r"\b(is|are|does|do|did|should|shall) (it|this|that|the|we|they|you|there)\b[^?.!]*\?",
        ],
    },
    "summarize_back": {
        "label": "Say back what you understood",
        "tip": "Repeat the part you DID understand, then ask about the part you didn't. It proves you were listening.",
        "patterns": [
            r"\bif i (understand|understood|got|have)( (you|this|it|that))? (correctly|right)\b",
            r"\bso (you'?re|you are) saying\b", r"\bjust to (confirm|check|make sure|clarify)\b",
            r"\bto make sure i\b", r"\bdo you mean\b", r"\bare you saying\b", r"\bso the idea is\b",
            r"\bin other words\b", r"\bmy understanding is\b", r"\blet me (repeat|confirm|check i)\b",
            r"\bso (we|it|everything|the)\b[^?]*\?", r"\bi follow(ed)?\b", r"\bwhen you say\b",
            r"\bi (understood|got|get|understand) the\b[^.?!]*\bpart\b",
        ],
    },
    "ownership": {
        "label": "Take ownership of a next step",
        "tip": "Say what YOU will do next (\"I'll check...\", \"Let me find out...\").",
        "patterns": [
            r"\bi'?ll\b", r"\bi will\b", r"\blet me\b", r"\bi'?m going to\b",
            r"\bi can (check|look|find|send|share|fix|get|verify|confirm|prepare|set up|walk)\b",
            r"\bi'?m (checking|looking|on it|fixing)\b",
        ],
    },
    "timeline": {
        "label": "Give a time",
        "tip": "Add WHEN (\"by 3 pm\", \"by tomorrow morning\", \"within an hour\"). A time makes a promise believable.",
        "patterns": [
            r"\bby (today|tonight|tomorrow|eod|end of|the end|monday|tuesday|wednesday|thursday|friday|saturday|sunday|noon|lunch|\d)",
            r"\bwithin\b", r"\bin the next\b", r"\b(this|tomorrow) (morning|afternoon|evening)\b",
            r"\btoday\b", r"\btomorrow\b", r"\b\d+\s*(min|mins|minutes|hours?|hrs?|days?)\b",
            r"\bbefore (the|our|we|launch|end|lunch|you)\b", r"\b(right after|after) (this|the) (call|meeting)\b",
            r"\b\d{1,2}(:\d\d)?\s*(am|pm)\b",
        ],
    },
    "suggestion": {
        "label": "Make a suggestion",
        "tip": "Don't just hand over the problem. Bring a proposal (\"I'd suggest...\", \"Could we...?\").",
        "patterns": [
            r"\bi'?d (suggest|recommend|propose)", r"\bi (suggest|recommend|propose)",
            r"\bmy (suggestion|recommendation|proposal)", r"\bhow about\b", r"\bwhat if we\b",
            r"\b(could|can|shall|should) we\b", r"\blet'?s\b", r"\bwe should\b", r"\bwe could\b",
            r"\bwe need to (fix|move|delay|add|hash|encrypt|test|keep|check)\b",
        ],
    },
    "options": {
        "label": "Offer options",
        "tip": "Give two choices. The other person keeps the decision, so it doesn't feel like a challenge.",
        "patterns": [
            r"\beither\b.*\bor\b", r"\boptions?\b", r"\balternatively\b", r"\bor we (could|can)\b",
            r"\btwo ways\b", r"\bone way\b", r"\bor (else )?(if|we|you|i)\b", r"\bor\b[^.?!]*\?",
        ],
    },
    "view": {
        "label": "State your view clearly",
        "tip": "Say what YOU think in one clear sentence (\"I don't think we can call that minor.\").",
        "patterns": [
            r"\bi don'?t think\b", r"\bin my (view|opinion|experience)\b", r"\bmy (concern|worry|view|read|take)\b",
            r"\bi'?m (concerned|worried|not (sure|convinced))\b", r"\bi (think|believe|feel)\b", r"\bthe risk\b",
            r"\bi see it (a bit )?differently\b", r"\bi'?d push back\b", r"\bi disagree\b",
            r"\bi'?m not comfortable\b", r"\bi'?d be careful\b",
        ],
    },
    "reason": {
        "label": "Give a reason",
        "tip": "Add the WHY (\"because...\", \"which means...\"). Reasons persuade; opinions alone don't.",
        "patterns": [
            r"\bbecause\b", r"\bsince\b", r"\bwhich means\b", r"\bthat means\b", r"\bso that\b",
            r"\bthe reason\b", r"\b(that gives|which gives|so that'?s|that'?s roughly|that'?s around|that'?s about)\b", r"\bif we\b.*\b(will|could|would|might|may)\b", r"\botherwise\b",
        ],
    },
    "admit_gap": {
        "label": "Admit the gap plainly",
        "tip": "Say what you don't know, without an apology (\"I don't have the cost numbers with me.\").",
        "patterns": [
            r"\bi don'?t (know|have|remember|recall)\b", r"\bi'?m not (sure|certain|familiar)\b",
            r"\bi haven'?t (checked|seen|looked|worked|used)", r"\bnot (off the top of my head|offhand)\b",
            r"\bi do(n'?t| not) want to guess\b", r"\bi'?d (need|have) to check\b", r"\bnot (100|a hundred) ?%",
        ],
    },
    "share_known": {
        "label": "Share what you DO know",
        "tip": "After the gap, give what you're sure of (\"What I do know is...\"). You stay useful.",
        "patterns": [
            r"\bwhat i (do )?know\b", r"(?<!n't )(?<!not )\bi (do )?know\b", r"\bi can tell you\b",
            r"\bwhat i can (say|tell|share|confirm)\b", r"\bfrom what i\b",
            r"\b(i'?ve|i have) (seen|checked|found|noticed|tested)\b", r"\bi can confirm\b",
            r"\bwhat i'?m (sure|confident|certain) (of|about)\b", r"\bi'?m (sure|confident|certain) (that|about|of)\b",
            r"\b(on average|average case|typically|usually|in general)\b",
        ],
    },
    "structure": {
        "label": "Give your answer a structure",
        "tip": "Signal the shape (\"Two things come to mind. First... Second...\"). Structure sounds calm.",
        "patterns": [
            r"\b(first|firstly|second|secondly|third|two things|three things|a couple of (things|ideas|points)|a few (things|ideas|points))\b",
            r"\bon one hand\b", r"\bmy (first|initial) (thought|take|reaction|guess)\b",
            r"\boff the top of my head\b", r"\bthinking (out loud|aloud)\b", r"\blet me think\b",
            r"\bstart (with|by)\b", r"\blet me (reason|work|walk|break)\b", r"\bthen\b.*\bthen\b", r"\b(step one|to begin)\b",
        ],
    },
    "accept_point": {
        "label": "Accept the point quickly",
        "tip": "If it's really your mistake, own it in one short sentence, then move on.",
        "patterns": [
            r"\byou'?re right\b", r"\bgood catch\b", r"\bfair point\b", r"\bi missed\b",
            r"\bthat'?s on me\b", r"\bmy mistake\b", r"\bi (got|made) (that|it|this|a) (wrong|mistake|error)\b",
            r"\bthanks for (catching|pointing)", r"\bi (sent|shared|used) the wrong\b", r"\bthat was my (error|mistake)\b",
            r"\bi take responsibility\b", r"\bi own (that|this)\b",
        ],
    },
}

# --------------------------------------------------------------------------
# Issues (weak / rude / unclear / grammar). Applied to every answer.
# kind: weak | tone | grammar | clarity
# --------------------------------------------------------------------------
ISSUES = [
    # --- weak / defensive ---------------------------------------------------
    ("sorry", "weak", r"\bsorry\b",
     "\"Sorry\" here makes you sound guilty, even though you did nothing wrong.",
     "Keep apologies for real mistakes, and then say it once. Otherwise go straight to the content."),
    ("tried_best", "weak", r"\b(i )?(tried|did|gave) my (best|level best)\b|\bi worked (so |very )?hard\b",
     "Defending your effort moves attention to YOU and invites judgement.",
     "Talk about the problem instead: \"Which part is off? I'll fix it.\""),
    ("not_my_fault", "weak", r"\bnot my fault\b|\bit wasn'?t me\b|\bwhy should i\b",
     "This sounds defensive. People stop listening once blame enters.",
     "Skip who is at fault. Say what happened and what's next."),
    ("self_diminish", "weak",
     r"\bi'?m (just|only) (a|an|the)\b|\b(stupid|silly|dumb|small|basic) (question|doubt|point)\b|\bmaybe i'?m wrong\b|\bi (may|might|could) be wrong\b|\bi'?m no expert\b",
     "You're putting yourself down before anyone else does.",
     "Just ask or state it. Confident people don't pre-apologise for their questions."),
    ("hedge_stack", "weak", None,  # handled in code (counts hedges)
     "Too many hedges (maybe / kind of / I guess / probably...). You sound unsure of yourself.",
     "Keep at most one hedge, where you are really uncertain."),
    ("false_yes", "weak", r"\b(ok(ay)?|yeah|yes),? (yeah |yes )?sure\b|\bmakes the sense\b|\bsure,? (it )?makes sense\b",
     "Saying yes / \"makes sense\" when you aren't sure is the habit you want to break.",
     "If anything is unclear, ask about it now. Asking is cheaper than faking."),
    ("vague_opener", "clarity",
     r"\bwe need (a|to have a|to do a) (discussion|talk|look|meeting)\b|\bwe need a look\b|\bwe need to talk\b|\bcan we discuss\b",
     "A vague opener. People tune out before they hear the real point.",
     "Lead with the fact: \"Some users can't log in at all.\""),
    ("just", "weak", r"\bjust (wanted|want|thought|checking|wondering|asking)\b",
     "\"Just\" shrinks your request.",
     "Remove \"just\": \"I wanted to ask...\" or simply ask."),
    ("bluff", "clarity", r"\b(definitely|100 ?%|surely|guaranteed)\b",
     "Strong certainty words. Are you really that sure? Over-claiming hurts trust later.",
     "Only use them for facts you've checked."),

    # --- tone (rude / dismissive / blaming) -----------------------------------
    ("calm_down", "tone", r"\bcalm down\b|\brelax\b|\bchill\b|\bdon'?t (worry|panic)\b|\bno worries\b",
     "To someone who is upset, \"calm down\" / \"relax\" sounds dismissive and makes it worse.",
     "Acknowledge instead: \"I understand, a 2-lakh gap is serious.\""),
    ("blame", "tone",
     r"\byou'?re wrong\b|\byou are wrong\b|\byour fault\b|\byou (made|did) (a |the )?mistake\b|\byou didn'?t (read|understand|listen)\b|\byour (numbers|data|report) (is|are) wrong\b",
     "Blaming the other person turns a problem into a fight.",
     "Describe the gap neutrally: \"Our numbers differ. Let's find where.\""),
    ("as_i_said", "tone", r"\bas i (already )?(said|told|mentioned)\b|\bobviously\b|\bclearly you\b|\bwhatever\b",
     "This sounds impatient or condescending.",
     "Restate the point calmly, without reminding them you said it before."),
    ("casual", "tone", r"\bwell,? let'?s\b|\blol\b|\bhaha\b|\bbro\b|\bdude\b|\bya\b|\bnope\b",
     "Too casual for a serious or formal moment.",
     "Use a neutral, serious tone when the other person is concerned."),

    # --- formal tone / Indian-English phrasing -------------------------------
    ("needful", "grammar", r"\bdo the needful\b", "\"Do the needful\" sounds old-fashioned and vague.",
     "Say exactly what you need: \"Could you approve the request?\""),
    ("kindly", "grammar", r"\bkindly\b", "\"Kindly\" sounds stiff and can come across as passive-aggressive.",
     "Use \"Could you...\" or \"Please...\""),
    ("revert", "grammar", r"\brevert( back)?\b", "\"Revert\" means \"go back to an earlier state\", not \"reply\".",
     "\"Please reply / get back to me by Friday.\""),
    ("prepone", "grammar", r"\bprepone", "\"Prepone\" isn't used outside India.", "\"Move it earlier / bring it forward.\""),
    ("doubt", "grammar", r"\b(i have|i'?m having|i am having|small|one|a) doubts?\b|\bmy doubt\b",
     "In global English, \"doubt\" means suspicion that something is untrue.",
     "Say \"I have a question\"."),
    ("discuss_about", "grammar", r"\bdiscuss about\b", "\"Discuss\" takes no \"about\".", "\"discuss the plan\""),
    ("explain_me", "grammar", r"\bexplain me\b", "Missing \"to\".", "\"explain to me\" / \"could you explain...\""),
    ("the_lot", "grammar", r"\bthe lot of\b", "Wrong article.", "\"a lot of\""),
    ("makes_the_sense", "grammar", r"\bmakes the sense\b", "No article needed.", "\"makes sense\""),
    ("could_tell", "grammar", r"\bcould tell me\b", "Missing \"you\".", "\"could you tell me\""),
    ("while_my", "grammar", r"\bwhile my (testing|work|checking)\b", "Wrong preposition.", "\"during my testing\" / \"while testing\""),
    ("today_morning", "grammar", r"\btoday (morning|evening|afternoon)\b", "Unnatural word order.", "\"this morning\""),
    ("yesterday_night", "grammar", r"\byesterday night\b", "Unnatural.", "\"last night\""),
    ("cope_up", "grammar", r"\bcope up\b", "No \"up\".", "\"cope with\""),
    ("return_back", "grammar", r"\b(return|repeat|reply) (back|again)\b", "Redundant word.", "\"return\" / \"repeat\" / \"reply\""),
    ("out_of_station", "grammar", r"\bout of station\b", "Indian-only phrase.", "\"out of town / travelling\""),
    ("myself_name", "grammar", r"^\s*myself [a-z]+", "\"Myself X\" isn't standard.", "\"I'm X\" / \"This is X\""),
    ("pardon_actually", "clarity", r"\bpardon( me)?\b", "\"Pardon\" alone doesn't tell them WHAT you missed.",
     "Ask about the specific part: \"Which part keeps latency low?\""),
    ("actually_overuse", "clarity", None,  # handled in code
     "\"Actually\" used more than once. It becomes a filler.", "Remove it. Your sentence is stronger without it."),
    ("sir_overuse", "grammar", None,  # handled in code
     "\"Sir/ma'am\" more than once. It sounds subservient in most global workplaces.",
     "Use their name, or nothing."),
    ("lowercase_i", "grammar", r"(^|\s)i(\s|'|$)", "\"i\" should be capital \"I\".", "Always write \"I\"."),
    ("double_dots", "grammar", r"\.\.(?!\.)", "\"..\" is not punctuation.", "End sentences with one full stop."),
    ("sorry_disturb", "grammar", r"\bsorry (to|for) (disturb|bother)", "Apologising for existing.",
     "\"Hi Priya, do you have five minutes today?\""),
    ("gentle_reminder", "grammar", r"\bgentle reminder\b", "Common but a bit odd (and sounds passive-aggressive).",
     "\"Following up on my message from Monday...\""),
]

HEDGES = [r"\bmaybe\b", r"\bkind of\b", r"\bsort of\b", r"\bi guess\b", r"\bprobably\b", r"\bperhaps\b",
          r"\ba (little )?bit\b", r"\bsomewhat\b", r"\bi think maybe\b", r"\bmight be\b"]

PENALTY = {"weak": 8, "tone": 12, "clarity": 6, "grammar": 2}
CAP = {"weak": 30, "tone": 30, "clarity": 15, "grammar": 10}


CONTRACTIONS = [(r"\bdo not\b", "don't"), (r"\bdoes not\b", "doesn't"), (r"\bcannot\b", "can't"), (r"\bcan not\b", "can't"),
                (r"\bI would\b", "I'd"), (r"\bI will\b", "I'll"), (r"\bI am\b", "I'm"), (r"\bhave not\b", "haven't"),
                (r"\bdid not\b", "didn't"), (r"\blet us\b", "let's"), (r"\bthat is\b", "that's"), (r"\byou are\b", "you're"),
                (r"\bit is\b", "it's"), (r"\bwe will\b", "we'll"), (r"\bwas not\b", "wasn't")]


def normalize(text):
    t = (text or "").replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    for pat, rep in CONTRACTIONS:  # treat long and short forms the same ("I would suggest" = "I'd suggest")
        t = re.sub(pat, lambda m, rep=rep: m.group(0)[0] + rep[1:], t, flags=re.I)
    return t


def sentences(text):
    parts = re.split(r"(?<=[.!?])\s+|\n+|\.\.+\s*", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _search(patterns, text):
    for p in patterns:
        m = re.search(p, text, re.I | re.S)
        if m:
            return m.group(0)
    return None


def resolve_move(m):
    """A move may be a string id (from MOVES) or a dict defined in the scenario."""
    if isinstance(m, str):
        d = dict(MOVES[m]); d["id"] = m
        return d
    d = dict(m)
    d.setdefault("tip", "")
    return d


def analyze(text, moves=None, forbid=None, allow=None):
    """Return a feedback dict. moves: required moves. forbid: [{pattern, message, fix}].
    allow: list of issue ids not to flag in this scenario (e.g. 'sorry' when a real apology is due)."""
    raw = normalize(text)
    t = raw.strip()
    allow = set(allow or [])
    words = re.findall(r"[A-Za-z']+", t)
    wc = len(words)
    sents = sentences(t)
    first = sents[0] if sents else ""

    found, missing = [], []
    for m in (moves or []):
        mv = resolve_move(m)
        scope = first if mv.get("first_sentence") else t
        hit = _search(mv["patterns"], scope)
        if hit and not (mv.get("first_sentence") and _search([r"\bsorry\b", r"\bwe need (a|to)\b"], first) and len(sents) > 1):
            found.append({"label": mv["label"], "hit": hit.strip()})
        else:
            missing.append({"label": mv["label"], "tip": mv.get("tip", "")})

    issues = []
    for iid, kind, pat, msg, fix in ISSUES:
        if iid in allow or pat is None:
            continue
        flags = 0 if iid == "lowercase_i" else re.I
        m = re.search(pat, t, flags | re.M)
        if m:
            issues.append({"id": iid, "kind": kind, "hit": m.group(0).strip(), "message": msg, "fix": fix})

    # counted issues
    hedges = [h for h in HEDGES if re.search(h, t, re.I)]
    if len(hedges) >= 2 and "hedge_stack" not in allow:
        d = next(x for x in ISSUES if x[0] == "hedge_stack")
        issues.append({"id": "hedge_stack", "kind": "weak", "hit": ", ".join(re.search(h, t, re.I).group(0) for h in hedges),
                       "message": d[3], "fix": d[4]})
    if len(re.findall(r"\bactually\b", t, re.I)) >= 2:
        d = next(x for x in ISSUES if x[0] == "actually_overuse")
        issues.append({"id": "actually_overuse", "kind": "clarity", "hit": "actually ×%d" % len(re.findall(r"\bactually\b", t, re.I)),
                       "message": d[3], "fix": d[4]})
    if len(re.findall(r"\b(sir|ma'?am|madam)\b", t, re.I)) >= 2:
        d = next(x for x in ISSUES if x[0] == "sir_overuse")
        issues.append({"id": "sir_overuse", "kind": "grammar", "hit": "sir/ma'am", "message": d[3], "fix": d[4]})
    if "sorry" not in allow and re.match(r"\s*sorry\b", t, re.I):
        for i in issues:
            if i["id"] == "sorry":
                i["message"] = "You OPENED with \"sorry\". The first word sets the tone: now you sound guilty before you've said anything."
    if "sorry" in allow and len(re.findall(r"\b(sorry|apologi[sz]e)\b", t, re.I)) >= 2:
        issues.append({"id": "sorry_repeat", "kind": "weak", "hit": "sorry ×2+",
                       "message": "An apology is right here, but say it ONCE. Repeating it sounds like begging.",
                       "fix": "One clear apology, then move to the fix."})

    for f in (forbid or []):
        m = re.search(f["pattern"], t, re.I)
        if m and not any(m.group(0).lower() in i["hit"].lower() or i["hit"].lower() in m.group(0).lower()
                         for i in issues if len(i["hit"]) > 2):
            issues.append({"id": "forbid", "kind": f.get("kind", "weak"), "hit": m.group(0).strip(),
                           "message": f["message"], "fix": f.get("fix", "")})

    # strong moves present even if not required (encouragement)
    bonus = []
    req_labels = {resolve_move(m)["label"] for m in (moves or [])}
    for mid, mv in MOVES.items():
        if mv["label"] in req_labels:
            continue
        hit = _search(mv["patterns"], t)
        if hit:
            bonus.append({"label": mv["label"], "hit": hit.strip()})

    # ---- score ----
    if moves:
        score = 30 + 70 * len(found) / max(1, len(found) + len(missing))
    else:
        score = 100
    by_kind = {}
    for i in issues:
        by_kind[i["kind"]] = by_kind.get(i["kind"], 0) + PENALTY[i["kind"]]
    for k, v in by_kind.items():
        score -= min(v, CAP[k])

    length_note = None
    if wc < 6:
        score -= 15
        length_note = "Very short. Did you say everything the moment needs?"
    elif wc > 90:
        score -= 5
        length_note = "Long (%d words). Leaders are brief: aim for 2-4 sentences in speech." % wc

    score = int(max(0, min(100, round(score))))
    return {
        "score": score,
        "passed": score >= 70,
        "word_count": wc,
        "first_sentence": first,
        "found": found,
        "missing": missing,
        "bonus": bonus[:4],
        "issues": issues,
        "length_note": length_note,
    }
