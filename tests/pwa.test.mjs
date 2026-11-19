import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = new URL("../web/", import.meta.url).pathname;
const walk = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);

test("every app file is cached for offline use", () => {
  const sw = readFileSync(join(WEB, "sw.js"), "utf8");
  for (const f of walk(WEB).map(f => relative(WEB, f)).filter(f => f !== "sw.js")) {
    assert.ok(sw.includes(`"${f}"`), `sw.js FILES is missing ${f}`);
  }
});
test("manifest is installable", () => {
  const m = JSON.parse(readFileSync(join(WEB, "manifest.webmanifest"), "utf8"));
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some(i => i.sizes === "192x192") && m.icons.some(i => i.sizes === "512x512"));
  for (const i of m.icons) assert.ok(statSync(join(WEB, i.src)).size > 0, i.src);
});
test("app uses only relative paths (works under /leader-talk/ on GitHub Pages)", () => {
  const html = readFileSync(join(WEB, "index.html"), "utf8");
  assert.ok(!/(href|src)="\//.test(html), "absolute path in index.html");
});
