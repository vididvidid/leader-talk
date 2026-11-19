"""Copy role-plays and pressure levels from tools/roleplays_src.py into web/data/content.json."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from roleplays_src import ROLEPLAYS, PRESSURE

path = os.path.join(os.path.dirname(__file__), "..", "web", "data", "content.json")
c = json.load(open(path, encoding="utf-8"))
c["roleplays"] = ROLEPLAYS
for s in c["scenarios"]:
    s["pressure"] = PRESSURE.get(s["id"], 2)
    s.pop("difficulty", None)
json.dump(c, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(ROLEPLAYS)} role-plays written")
