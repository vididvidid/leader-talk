#!/usr/bin/env python3
"""Leader Talk - offline practice app for confident, respectful communication.

Run:   python3 app.py          then open http://127.0.0.1:8765
No internet, no AI, no pip install. Your progress is saved in data/progress.json.
"""
import json
import os
import random
import sys
import threading
import time
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import coach
import content

BASE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(BASE, "static")
DATA_DIR = os.path.join(BASE, "data")
PROGRESS = os.path.join(DATA_DIR, "progress.json")
PORT = int(os.environ.get("PORT", "8765"))
DAY = 86400
INTERVALS = [1, 3, 7, 14, 30, 60]  # spaced-review days
LOCK = threading.Lock()

SCEN = {s["id"]: s for s in content.SCENARIOS}
SURG = {s["id"]: s for s in content.SURGERY}
QUIZ = {q["id"]: q for q in content.QUIZZES}


# ----------------------------------------------------------------- storage
def load():
    try:
        with open(PROGRESS, encoding="utf-8") as f:
            p = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        p = {}
    p.setdefault("attempts", [])
    p.setdefault("scenarios", {})
    p.setdefault("quizzes", {})
    p.setdefault("surgery", {})
    p.setdefault("reallife", [])
    p.setdefault("days", [])
    return p


def save(p):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = PROGRESS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=1)
    os.replace(tmp, PROGRESS)


def mark_day(p):
    d = time.strftime("%Y-%m-%d")
    if d not in p["days"]:
        p["days"].append(d)


def streak(p):
    days = set(p["days"])
    n, t = 0, time.time()
    if time.strftime("%Y-%m-%d", time.localtime(t)) not in days:
        t -= DAY  # streak still alive if you practised yesterday
    while time.strftime("%Y-%m-%d", time.localtime(t)) in days:
        n += 1
        t -= DAY
    return n


# ----------------------------------------------------------------- levels
LEVEL_NAMES = ["unaware", "heard of it", "can follow along", "can do with help",
               "can do independently", "can teach it / edge cases"]


def skill_level(p, sid):
    """Levels are earned, like the tutor:
    1 = touched it (quiz or attempt)
    2 = all quizzes right on first pick, or a scenario scored >= 50
    3 = passed a scenario (any try, even after hints)
    4 = passed 2+ different scenarios on the FIRST try (unprompted)
    5 = level 4 + a hard scenario passed on first try + a spaced review passed (>= 1 day later)
    A failed review lowers the level until you pass it again."""
    quizzes = [q for q in content.QUIZZES if q["skill"] == sid]
    scens = [s for s in content.SCENARIOS if s["skill"] == sid]
    qs = [p["quizzes"].get(q["id"]) for q in quizzes]
    ss = [p["scenarios"].get(s["id"]) for s in scens]
    touched = any(qs) or any(ss) or any(v["skill"] == sid for v in p["surgery"].values() if isinstance(v, dict) and "skill" in v)
    if not touched:
        return 0
    lvl = 1
    if (qs and all(q and q.get("first_correct") for q in qs)) or any(s and s.get("best", 0) >= 50 for s in ss):
        lvl = 2
    if any(s and s.get("passes", 0) > 0 for s in ss):
        lvl = 3
    first_passes = [s for s in ss if s and s.get("first_try_pass")]
    if len(first_passes) >= 2:
        lvl = 4
        hard_ok = any(p["scenarios"].get(s["id"], {}).get("first_try_pass") for s in scens if s.get("hard"))
        review_ok = any(s and s.get("review_passes", 0) > 0 for s in ss)
        if hard_ok and review_ok:
            lvl = 5
    if any(s and s.get("review_failed") for s in ss):
        lvl = max(1, lvl - 1)
    return lvl


def progress_summary(p):
    now = time.time()
    skills = []
    for sk in content.SKILLS:
        lv = skill_level(p, sk["id"])
        skills.append({**sk, "level": lv, "level_name": LEVEL_NAMES[lv]})
    due = [sid for sid, st in p["scenarios"].items() if st.get("due") and st["due"] <= now and sid in SCEN]
    overall = round(100 * sum(s["level"] for s in skills) / (5 * len(skills)))
    return {"skills": skills, "overall": overall, "due": due, "streak": streak(p),
            "total_attempts": len(p["attempts"]), "days_practised": len(p["days"])}


# ----------------------------------------------------------------- daily plan
def daily_plan(p):
    """2 due reviews + 1 new scenario from your weakest skill + 1 surgery + 1 quiz."""
    now = time.time()
    plan = []
    due = sorted([(st["due"], sid) for sid, st in p["scenarios"].items() if st.get("due") and st["due"] <= now and sid in SCEN])
    for _, sid in due[:2]:
        plan.append({"kind": "scenario", "id": sid, "why": "Spaced review: you passed this before. Can you still do it without hints?"})
    levels = sorted(content.SKILLS, key=lambda s: (skill_level(p, s["id"]), content.SKILLS.index(s)))
    for sk in levels:
        new = [s for s in content.SCENARIOS if s["skill"] == sk["id"] and s["id"] not in p["scenarios"]]
        new.sort(key=lambda s: s.get("hard", False))
        if new:
            plan.append({"kind": "scenario", "id": new[0]["id"], "why": "New: your weakest skill is \"%s\"." % sk["name"]})
            break
    else:
        weak = [s for s in content.SCENARIOS if not p["scenarios"].get(s["id"], {}).get("first_try_pass")]
        if weak:
            plan.append({"kind": "scenario", "id": random.choice(weak)["id"], "why": "Not yet passed on the first try."})
    todo_q = [q for q in content.QUIZZES if q["id"] not in p["quizzes"]]
    if todo_q:
        plan.append({"kind": "quiz", "id": todo_q[0]["id"], "why": "Spot the pattern."})
    todo_x = [x for x in content.SURGERY if not p["surgery"].get(x["id"], {}).get("passed")]
    if todo_x:
        plan.append({"kind": "surgery", "id": todo_x[0]["id"], "why": "Fix a weak sentence" + (" (one of YOUR own)." if todo_x[0].get("mine") else ".")})
    return plan


# ----------------------------------------------------------------- actions
def public_scenario(s):
    return {k: s[k] for k in ("id", "skill", "title", "context", "line", "situation") if k in s} | {
        "hard": s.get("hard", False),
        "moves": [coach.resolve_move(m)["label"] for m in s.get("moves", [])]}


def do_check_scenario(p, body):
    s = SCEN[body["id"]]
    text = body.get("text", "")
    try_no = int(body.get("try", 1))
    r = coach.analyze(text, s.get("moves"), s.get("forbid"), s.get("allow"))
    if r["missing"] or not r["passed"]:
        r["question"] = s.get("question")
    st = p["scenarios"].setdefault(s["id"], {"best": 0, "passes": 0, "first_try_pass": False, "review_passes": 0})
    is_review = bool(st.get("due")) and try_no == 1 and st["due"] <= time.time()
    st["best"] = max(st.get("best", 0), r["score"])
    st["last"] = time.time()
    if r["passed"]:
        if try_no == 1:
            st["first_try_pass"] = True
        if is_review:
            st["review_passes"] = st.get("review_passes", 0) + 1
            st["review_failed"] = False
        if try_no == 1 or not st.get("due"):
            st["passes"] = st.get("passes", 0) + 1
            step = min(st["passes"] - 1, len(INTERVALS) - 1)
            st["due"] = time.time() + INTERVALS[step] * DAY
            r["next_review_days"] = INTERVALS[step]
        else:
            st["passes"] = max(st.get("passes", 0), 1)
    elif is_review:
        st["review_failed"] = True
        st["passes"] = 0
        st["due"] = time.time() + DAY
        r["review_failed"] = True
    r["is_review"] = is_review
    p["attempts"].append({"id": uuid.uuid4().hex[:8], "ts": time.time(), "kind": "scenario", "ref": s["id"],
                          "title": s["title"], "text": text, "score": r["score"], "try": try_no,
                          "timed": bool(body.get("timed"))})
    mark_day(p)
    return r


def do_reveal(body):
    s = SCEN[body["id"]]
    pat = content.PATTERNS[s["skill"]]
    return {"models": s["models"], "pattern": pat}


def do_quiz(p, body):
    q = QUIZ[body["id"]]
    choice = int(body["choice"])
    correct = q["options"][choice]["correct"]
    st = p["quizzes"].get(q["id"])
    if st is None:
        p["quizzes"][q["id"]] = {"first_correct": correct, "why": body.get("why", ""), "ts": time.time()}
    mark_day(p)
    skill_qs = [x["id"] for x in content.QUIZZES if x["skill"] == q["skill"]]
    unlocked = all(x in p["quizzes"] for x in skill_qs)
    return {"correct": correct, "options": q["options"], "pattern": content.PATTERNS[q["skill"]] if unlocked else None,
            "pattern_locked_left": sum(1 for x in skill_qs if x not in p["quizzes"])}


def do_surgery(p, body):
    x = SURG[body["id"]]
    text = body.get("text", "")
    r = coach.analyze(text, x.get("moves"), x.get("forbid"))
    before = coach.analyze(x["weak"], x.get("moves"), x.get("forbid"))
    r["before_score"] = before["score"]
    r["before_issues"] = before["issues"]
    st = p["surgery"].setdefault(x["id"], {"skill": x["skill"], "best": 0})
    st["best"] = max(st["best"], r["score"])
    st["passed"] = st.get("passed") or r["passed"]
    p["attempts"].append({"id": uuid.uuid4().hex[:8], "ts": time.time(), "kind": "surgery", "ref": x["id"],
                          "title": "Surgery: " + x["weak"][:40], "text": text, "score": r["score"], "try": 1})
    mark_day(p)
    return r


def do_reallife(p, body):
    said = body.get("said", "")
    rewrite = body.get("rewrite", "")
    a = coach.analyze(said)
    b = coach.analyze(rewrite) if rewrite.strip() else None
    entry = {"id": uuid.uuid4().hex[:8], "ts": time.time(), "situation": body.get("situation", ""),
             "said": said, "rewrite": rewrite, "lesson": body.get("lesson", ""),
             "said_score": a["score"], "rewrite_score": b["score"] if b else None}
    if body.get("save"):
        p["reallife"].append(entry)
        mark_day(p)
    return {"said": a, "rewrite": b}


def do_free(body):
    return coach.analyze(body.get("text", ""))


# ----------------------------------------------------------------- server
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/content":
            return self._json({
                "skills": content.SKILLS,
                "scenarios": [public_scenario(s) for s in content.SCENARIOS],
                "quizzes": [{"id": q["id"], "skill": q["skill"], "situation": q["situation"],
                             "options": [o["text"] for o in q["options"]]} for q in content.QUIZZES],
                "surgery": [{k: x[k] for k in ("id", "skill", "context", "weak")} | {"mine": x.get("mine", False)} for x in content.SURGERY],
                "level_names": LEVEL_NAMES,
            })
        if path == "/api/progress":
            with LOCK:
                p = load()
            return self._json(progress_summary(p) | {"plan": daily_plan(p), "quizzes_done": list(p["quizzes"]),
                                                     "surgery": p["surgery"], "scenarios": p["scenarios"]})
        if path == "/api/journal":
            with LOCK:
                p = load()
            return self._json({"attempts": p["attempts"][-200:][::-1], "reallife": p["reallife"][::-1]})
        if path == "/api/pattern":
            return self._json(content.PATTERNS)
        if path in ("/", "/index.html"):
            path = "/index.html"
        f = os.path.normpath(os.path.join(STATIC, path.lstrip("/")))
        if not f.startswith(STATIC) or not os.path.isfile(f):
            self.send_error(404)
            return
        ctype = {".html": "text/html", ".js": "application/javascript", ".css": "text/css"}.get(os.path.splitext(f)[1], "application/octet-stream")
        with open(f, "rb") as fh:
            data = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = urlparse(self.path).path
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return self._json({"error": "bad json"}, 400)
        try:
            with LOCK:
                p = load()
                if path == "/api/check":
                    r = do_check_scenario(p, body)
                elif path == "/api/reveal":
                    r = do_reveal(body)
                elif path == "/api/quiz":
                    r = do_quiz(p, body)
                elif path == "/api/surgery":
                    r = do_surgery(p, body)
                elif path == "/api/reallife":
                    r = do_reallife(p, body)
                elif path == "/api/free":
                    r = do_free(body)
                elif path == "/api/reset":
                    p = {}
                    save(load() | {"attempts": [], "scenarios": {}, "quizzes": {}, "surgery": {}, "reallife": [], "days": []})
                    return self._json({"ok": True})
                else:
                    return self._json({"error": "not found"}, 404)
                if path not in ("/api/reveal", "/api/free"):
                    save(p)
                r["progress"] = progress_summary(p)
            return self._json(r)
        except KeyError as e:
            return self._json({"error": "unknown id %s" % e}, 400)


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = "http://127.0.0.1:%d" % PORT
    print("Leader Talk is running at %s  (Ctrl+C to stop)" % url)
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nBye. Practise again tomorrow - your reviews will be waiting.")


if __name__ == "__main__":
    main()
