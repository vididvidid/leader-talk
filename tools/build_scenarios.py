"""Merge tools/scenarios_more.py into web/data/content.json (idempotent) and tag every scenario with a setting."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from scenarios_more import SCENARIOS

ORIGINAL_SETTINGS = {
 "s_idk_plan": "meeting", "s_idk_sso": "client", "s_idk_dict": "interview", "s_cl_mid": "meeting", "s_cl_vague": "1:1",
 "s_cl_numbers": "client", "s_dis_launch": "meeting", "s_dis_pw": "meeting", "s_dis_qa": "meeting", "s_hold_minor": "1:1",
 "s_hold_interrupt": "meeting", "s_hold_discount": "client", "s_th_slow": "meeting", "s_th_signups": "standup", "s_th_pumps": "interview",
 "s_co_req": "meeting", "s_co_report": "client", "s_co_wrongfile": "1:1", "s_to_review": "email", "s_to_followup": "email", "s_to_decline": "1:1",
}
path = os.path.join(os.path.dirname(__file__), "..", "web", "data", "content.json")
c = json.load(open(path, encoding="utf-8"))
new_ids = {s["id"] for s in SCENARIOS}
c["scenarios"] = [s for s in c["scenarios"] if s["id"] not in new_ids] + SCENARIOS
# Topic words decide relevance (the "polite but off-topic" check), so generic ones are dropped:
# they would let an unrelated reply count as on-topic. tests/content.test.mjs enforces the same list.
GENERIC = {"which", "what", "the", "and", "you", "your", "for", "with", "this", "that", "will", "can", "get", "make", "thing", "time"}
for s in c["scenarios"]:
    s.setdefault("setting", ORIGINAL_SETTINGS.get(s["id"], "meeting"))
    s["topic"] = [w for w in s["topic"] if len(w) >= 2 and w not in GENERIC and not w.isdigit() and any(ch.isalnum() for ch in w)]
c["settings"] = {"meeting": "Meetings", "1:1": "Manager 1:1", "client": "Client calls", "interview": "Interviews",
                 "standup": "Stand-ups", "appraisal": "Appraisal & salary", "email": "Emails & chat"}
json.dump(c, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(c['scenarios'])} scenarios")
