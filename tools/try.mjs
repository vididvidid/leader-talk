// Authoring helper: try an answer against a scenario (with word statistics), e.g.
//   npm run try -- s_co_report "Thanks for flagging this. Which figures differ?"
//   npm run try -- free "Kindly do the needful."
import { readFileSync } from "node:fs";
import { analyze, specFor } from "../web/js/engine.js";
import { Stats } from "../web/js/stats.js";

const D = new URL("../web/data/", import.meta.url);
const [id, ...rest] = process.argv.slice(2);
const text = rest.join(" ");
if (!id || !text) { console.log('usage: npm run try -- <scenario-id|free> "your answer"'); process.exit(1); }
const content = JSON.parse(readFileSync(new URL("content.json", D), "utf8"));
const stats = new Stats(readFileSync(new URL("ngrams.bin", D)).buffer.slice(0), readFileSync(new URL("vocab.txt", D), "utf8"), readFileSync(new URL("ngsl.txt", D), "utf8"));
const item = id === "free" ? null : content.scenarios.find(s => s.id === id) || content.surgery.find(s => s.id === id);
if (id !== "free" && !item) { console.log("Unknown id. Scenario ids:\n" + content.scenarios.map(s => "  " + s.id).join("\n")); process.exit(1); }
const r = analyze(text, item ? specFor(item) : { written: true }, { stats });
console.log(`\nscore ${r.score} ${r.passed ? "PASS" : "fail"}  (${r.metrics.words} words, ${r.metrics.everyday}% everyday)`);
for (const f of r.found) console.log(`  ✓ ${f.label}  "${f.hit}"`);
for (const m of r.missing) console.log(`  ✗ ${m.label}  - ${m.tip}`);
for (const i of r.issues) console.log(`  ⚠ [${i.kind}] "${i.hit}" ${i.message}  → ${i.fix}`);
