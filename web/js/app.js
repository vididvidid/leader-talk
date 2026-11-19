import { analyze, specFor } from "./engine.js";
import { PRINCIPLES } from "./research.js";
import * as P from "./progress.js";
import { loadState, saveState, requestPersistence } from "./store.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $("#app");
let C, S; // content, state
const SKILL = id => C.skills.find(s => s.id === id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const save = () => saveState(S);

function speak(text) {
  if (!("speechSynthesis" in window)) return alert("This browser has no built-in voice.");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.lang = "en-US";
  speechSynthesis.speak(u);
}
document.addEventListener("click", e => { const s = e.target.closest("[data-speak]"); if (s) speak(s.dataset.speak); });
const speakBtn = t => `<button class="icon-btn" data-speak="${esc(t)}" aria-label="Read aloud">🔊</button>`;

// ------------------------------------------------------------------ rendering helpers
const bar = l => "█".repeat(l * 2) + "░".repeat(10 - l * 2);
function skillMap(sum) {
  const ob = Math.round(sum.overall / 10);
  return `<div class="skillmap" role="table" aria-label="Skill map">
    <div class="sm-head">Overall <span class="mono">${"█".repeat(ob)}${"░".repeat(10 - ob)}</span> ${sum.overall}%</div>
    ${sum.skills.map((k, i) => `<div class="sm-row" role="row"><span class="sm-name">${i + 1}. ${esc(k.name)}</span>
      <span class="mono" aria-hidden="true">${bar(k.level)}</span><span class="sm-lv">${k.level}/5 · ${esc(k.levelName)}</span></div>`).join("")}
  </div>`;
}

function principleDetails(id) {
  const p = PRINCIPLES[id];
  if (!p) return "";
  return `<details class="why"><summary>Why? ${esc(p.name)}</summary><p>${esc(p.idea)}</p><p class="src">${esc(p.source)}</p></details>`;
}

function highlight(text, r) {
  let h = esc(text);
  const mark = (needle, cls) => {
    if (!needle || needle.length < 2 || needle.startsWith("(")) return;
    const n = esc(needle), idx = h.toLowerCase().indexOf(n.toLowerCase());
    if (idx < 0 || /<[^>]*$/.test(h.slice(0, idx))) return;
    h = h.slice(0, idx) + `<mark class="${cls}">` + h.slice(idx, idx + n.length) + "</mark>" + h.slice(idx + n.length);
  };
  r.issues.forEach(i => mark(i.hit, "r"));
  r.found.forEach(f => mark(f.hit, "g"));
  return h;
}

function feedbackHTML(text, r, { hideTips = false, extra = {} } = {}) {
  let h = `<div class="score-row"><div><span class="score ${r.passed ? "pass" : "fail"}">${r.score}</span><span class="muted"> / 100 ${r.passed ? "· passed" : "· pass mark is 70"}</span></div>
    <div class="muted small">${r.metrics.words} words · ${r.metrics.powerless} powerless marker${r.metrics.powerless === 1 ? "" : "s"}</div></div>`;
  if (extra.isReview) h += `<p class="small">${extra.reviewFailed ? "⚠ Review failed. This skill drops a level until you pass it again." : "✓ Spaced review."}</p>`;
  if (extra.nextReviewDays) h += `<p class="small muted">Next review of this scenario in ${extra.nextReviewDays} day(s).</p>`;
  h += `<div class="quote">${highlight(text, r)}</div><ul class="fb">`;
  r.found.forEach(f => h += `<li class="ok">✓ <b>${esc(f.label)}</b> <span class="hit">“${esc(f.hit)}”</span></li>`);
  r.missing.forEach(m => h += `<li class="miss">✗ <b>${esc(m.label)}</b>${hideTips ? "" : `<br><span class="small">${esc(m.tip)}</span>${principleDetails(m.principle)}`}</li>`);
  r.issues.forEach(i => h += `<li class="bad">⚠ ${i.hit.startsWith("(") ? "" : `<span class="hit">“${esc(i.hit)}”</span> · `}${esc(i.message)}<br><span class="small"><b>Try:</b> ${esc(i.fix)}</span>${principleDetails(i.principle)}</li>`);
  h += `</ul>`;
  if (r.bonus.length) h += `<p class="small muted">Also good: ${r.bonus.map(b => esc(b.label)).join(" · ")}</p>`;
  if (r.lengthNote) h += `<p class="small">📏 ${esc(r.lengthNote)}</p>`;
  return h;
}

function patternHTML(p) {
  return `<div class="card pattern"><h3>The pattern</h3>
    <ol>${p.skeleton.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    <div class="quote">${esc(p.example)} ${speakBtn(p.example)}</div>
    <p><b>Why it works:</b> ${esc(p.why)}</p>
    <p><b>Traps:</b></p><ul>${p.traps.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
}

// ------------------------------------------------------------------ views
const views = {
  home() {
    const sum = P.summary(S, C), plan = P.dailyPlan(S, C);
    const items = plan.map(it => {
      let title = "", go = "";
      if (it.kind === "scenario") { const s = C.scenarios.find(x => x.id === it.id); title = "🎭 " + s.title; go = `scenario:${s.id}`; }
      if (it.kind === "quiz") { title = "🔍 Compare: " + SKILL(it.skill).name; go = `quiz:${it.skill}`; }
      if (it.kind === "surgery") { title = "✂️ Sentence surgery"; go = `surgery:${it.id}`; }
      return `<div class="item"><div><b>${esc(title)}</b><div class="small muted">${esc(it.why)}</div></div><button class="btn" data-go="${go}">Start</button></div>`;
    }).join("");
    app.innerHTML = `<h1>Today</h1>
      <div class="grid2">
        <div class="card stat-card"><div class="muted small">Streak</div><div class="stat">${sum.streak} day${sum.streak === 1 ? "" : "s"}</div></div>
        <div class="card stat-card"><div class="muted small">Reviews due</div><div class="stat">${sum.due.length}</div></div>
      </div>
      <div class="card list">${items || "<p>All done. Use the Real-life log: write down a real conversation from today.</p>"}</div>
      <h2>Skill map</h2>${skillMap(sum)}
      <p class="small muted">Levels are earned. 3 = passed a scenario (hints allowed). 4 = passed two different scenarios on the <b>first</b> try. 5 = also passed a hard one first try <b>and</b> a spaced review a day or more later. Failing a review drops the level.</p>
      <div class="card"><h3>How to use this</h3><ol class="small">
        <li><b>Learn</b>: compare answers and find the pattern yourself before you see it.</li>
        <li><b>Practice</b>: answer like you would in real life. Turn on the timer, because real conversations don't wait.</li>
        <li><b>Fix</b>: rewrite weak sentences, including your own.</li>
        <li><b>Log</b>: after a real conversation, write what you said and rewrite it. This is how the habit forms <i>during</i> conversations.</li>
        <li>Say your final version <b>out loud</b> 3 times.</li></ol></div>`;
    $$("[data-go]").forEach(b => b.onclick = () => {
      const [k, id] = b.dataset.go.split(":");
      ({ scenario: runScenario, quiz: runQuizSkill, surgery: runSurgery })[k](id);
    });
  },

  learn() {
    app.innerHTML = `<h1>Learn</h1>
      <p class="muted">Pick the answer that sounds like a leader and explain <b>why</b> in your own words. The pattern card unlocks only after you've found it yourself.</p>
      <div class="card list">${C.skills.map(s => {
        const qs = C.quizzes.filter(q => q.skill === s.id), done = qs.filter(q => S.quizzes[q.id]).length;
        return `<div class="item"><div><b>${esc(s.name)}</b><div class="small muted">${done}/${qs.length} compared</div></div>
          <div class="row">${done === qs.length ? `<button class="btn ghost" data-pat="${s.id}">Pattern</button>` : ""}<button class="btn" data-skill="${s.id}">${done ? "Redo" : "Start"}</button></div></div>`;
      }).join("")}</div>
      <div class="card"><h3>The research behind the feedback</h3><p class="small muted">Every check in this app comes from one of these.</p><button class="btn ghost" id="research">Open</button></div>`;
    $$("[data-skill]").forEach(b => b.onclick = () => runQuizSkill(b.dataset.skill));
    $$("[data-pat]").forEach(b => b.onclick = () => {
      app.innerHTML = `<button class="btn ghost" id="back">← Back</button><h1>${esc(SKILL(b.dataset.pat).name)}</h1>` + patternHTML(C.patterns[b.dataset.pat]);
      $("#back").onclick = () => show("learn");
    });
    $("#research").onclick = () => {
      app.innerHTML = `<button class="btn ghost" id="back">← Back</button><h1>The research</h1>` +
        Object.values(PRINCIPLES).map(p => `<div class="card"><h3>${esc(p.name)}</h3><p>${esc(p.idea)}</p><p class="src">${esc(p.source)}</p></div>`).join("");
      $("#back").onclick = () => show("learn");
    };
  },

  practice() {
    app.innerHTML = `<h1>Practice</h1>
      <p class="muted">Write exactly what you would <b>say</b>. You get feedback and a guiding question. Model answers unlock after your second try (or once you pass).</p>
      ${C.skills.map(s => `<div class="card list"><h3>${esc(s.name)}</h3>${C.scenarios.filter(x => x.skill === s.id).map(x => {
        const st = S.scenarios[x.id];
        const badge = st ? (st.firstTryPass ? "✓ first try" : st.passes ? "✓ passed" : `best ${st.best}`) : "new";
        return `<div class="item"><div><b>${esc(x.title)}</b> ${x.hard ? '<span class="tag hard">hard</span>' : ""}<div class="small muted">${badge}</div></div><button class="btn ghost" data-s="${x.id}">Open</button></div>`;
      }).join("")}</div>`).join("")}`;
    $$("[data-s]").forEach(b => b.onclick = () => runScenario(b.dataset.s));
  },

  surgery() {
    app.innerHTML = `<h1>Sentence surgery</h1>
      <p class="muted">Rewrite weak sentences into calm, confident ones. <span class="tag mine">yours</span> marks your own sentences from the tutoring session.</p>
      <div class="card list">${C.surgery.map(x => {
        const st = S.surgery[x.id];
        return `<div class="item"><div>${x.mine ? '<span class="tag mine">yours</span>' : ""}<span class="small">“${esc(x.weak)}”</span>
          <div class="small muted">${st ? (st.passed ? "✓ fixed" : "best " + st.best) : ""}</div></div><button class="btn ghost" data-x="${x.id}">Fix</button></div>`;
      }).join("")}</div>`;
    $$("[data-x]").forEach(b => b.onclick = () => runSurgery(b.dataset.x));
  },

  real() {
    app.innerHTML = `<h1>Real-life log</h1>
      <p class="muted">The most important page. After a real conversation, write what you <i>actually</i> said, then rewrite it. Doing this after real moments is what makes you notice <b>during</b> them.</p>
      <div class="card">
        <label for="rl-sit">Situation (who, what happened)</label><input type="text" id="rl-sit" placeholder="e.g. Standup: lead asked why my task was late">
        <label for="rl-said">What I actually said (be honest)</label><textarea id="rl-said"></textarea>
        <button class="btn ghost" id="rl-check1">Check what I said</button><div id="rl-fb1" aria-live="polite"></div>
        <label for="rl-re">What I'd say next time</label><textarea id="rl-re"></textarea>
        <label for="rl-lesson">One-line lesson for myself</label><input type="text" id="rl-lesson" placeholder="e.g. Lead with the fact">
        <button class="btn" id="rl-save">Check rewrite & save</button><div id="rl-fb2" aria-live="polite"></div>
      </div>
      <h2>Past entries</h2>
      ${S.reallife.length ? [...S.reallife].reverse().map(e => `<div class="card"><div class="small muted">${new Date(e.ts).toLocaleString()} · ${esc(e.situation)}</div>
        <p><b>Said</b> (${e.saidScore}): ${esc(e.said)}</p>${e.rewrite ? `<p><b>Next time</b> (${e.rewriteScore}): ${esc(e.rewrite)} ${speakBtn(e.rewrite)}</p>` : ""}
        ${e.lesson ? `<p class="small">💡 ${esc(e.lesson)}</p>` : ""}</div>`).join("") : '<p class="muted">No entries yet.</p>'}`;
    $("#rl-check1").onclick = () => {
      const said = $("#rl-said").value; if (!said.trim()) return;
      $("#rl-fb1").innerHTML = feedbackHTML(said, analyze(said)) + `<div class="socratic"><b>Ask yourself:</b> What did the other person need to hear first: the fact, your view, or a next step? Did anything in your reply move attention to <i>you</i> instead of the problem?</div>`;
    };
    $("#rl-save").onclick = async () => {
      const said = $("#rl-said").value, rewrite = $("#rl-re").value;
      if (!said.trim()) return alert("Write what you actually said first.");
      const a = analyze(said), b = rewrite.trim() ? analyze(rewrite) : null;
      P.recordReal(S, { situation: $("#rl-sit").value, said, rewrite, lesson: $("#rl-lesson").value, saidScore: a.score, rewriteScore: b ? b.score : null,
        saidIssues: a.issues.map(i => i.id) });
      await save();
      $("#rl-fb2").innerHTML = b ? `<h3>Your rewrite</h3>` + feedbackHTML(rewrite, b) + `<p>Saved. Now say it out loud three times. ${speakBtn(rewrite)}</p>` : "<p>Saved.</p>";
    };
  },

  free() {
    app.innerHTML = `<h1>Check a message</h1>
      <p class="muted">Paste any message before you send it (an email, a chat reply, something you plan to say). It checks for weak, defensive or unclear habits.</p>
      <div class="card"><label for="fr">Your message</label><textarea id="fr"></textarea><button class="btn" id="frb">Check</button><div id="frf" aria-live="polite"></div></div>`;
    $("#frb").onclick = () => {
      const t = $("#fr").value; if (!t.trim()) return;
      const r = analyze(t, { written: true });
      $("#frf").innerHTML = feedbackHTML(t, r) + (r.issues.length ? "" : "<p>No weak habits found. Read it once more: is the most important point in the first sentence?</p>");
    };
  },

  journal() {
    const at = [...S.attempts].reverse().slice(0, 300);
    app.innerHTML = `<h1>Journal</h1><p class="muted">Every attempt, newest first.</p>
      ${at.length ? `<div class="card list">${at.map(a => `<div class="item"><div><div class="small muted">${new Date(a.ts).toLocaleString()} · ${esc(a.title)} · try ${a.try}${a.timed ? " · ⏱" : ""}</div>${esc(a.text)}</div><b>${a.score}</b></div>`).join("")}</div>` : '<p class="muted">Nothing yet.</p>'}
      <div class="card"><h3>Start over</h3><p class="small muted">Deletes all progress on this device.</p><button class="btn ghost danger" id="reset">Reset progress</button></div>`;
    $("#reset").onclick = async () => { if (confirm("Delete ALL progress on this device? This cannot be undone.")) { S = P.emptyState(); await save(); show("home"); } };
  },
};

// ------------------------------------------------------------------ runners
function runScenario(id) {
  const s = C.scenarios.find(x => x.id === id);
  let tryNo = 1, timer = null, left = 0, revealed = false;
  app.innerHTML = `<button class="btn ghost" id="back">← Practice</button>
    <div class="card">
      <div class="row between"><span class="tag">${esc(SKILL(s.skill).name)}</span>${s.hard ? '<span class="tag hard">hard · edge case</span>' : ""}</div>
      <h1>${esc(s.title)}</h1><p>${esc(s.context)}</p>
      <div class="quote">“${esc(s.line)}” ${speakBtn(s.line)}</div>
      <p class="muted">${esc(s.situation)}</p>
      <div class="row between"><label class="check"><input type="checkbox" id="timed"> Pressure mode: 60 seconds</label><span class="timer" id="timer" aria-live="off"></span></div>
      <label for="ans" class="sr-only">Your answer</label>
      <textarea id="ans" placeholder="Write exactly what you'd say, word for word..."></textarea>
      <div class="row"><button class="btn" id="check">Check</button><button class="btn ghost" id="reveal" disabled>Show model answers</button></div>
      <p class="small muted" id="trynote">Try 1. No hints yet: answer from instinct.</p>
    </div><div id="fb" aria-live="polite"></div><div id="rv"></div>`;
  $("#back").onclick = () => show("practice");
  $("#timed").onchange = e => {
    clearInterval(timer); $("#timer").textContent = "";
    if (!e.target.checked) return;
    left = 60; $("#timer").textContent = "60s"; $("#ans").focus();
    timer = setInterval(() => {
      const t = $("#timer"); if (!t) return clearInterval(timer);
      left--; t.textContent = left + "s"; t.classList.toggle("low", left <= 10);
      if (left <= 0) { clearInterval(timer); $("#check").click(); }
    }, 1000);
  };
  $("#check").onclick = async () => {
    const text = $("#ans").value;
    if (!text.trim()) {
      if ($("#timed").checked && left <= 0) $("#fb").innerHTML = `<div class="card">Time ran out with nothing written. In a meeting, silence is also an answer. A first sentence that buys time: "Let me think out loud for a second..."</div>`;
      return;
    }
    clearInterval(timer);
    const r = analyze(text, specFor(s));
    const extra = P.recordScenario(S, s, r, tryNo, text, { timed: $("#timed").checked });
    await save();
    let h = `<div class="card">` + feedbackHTML(text, r, { hideTips: tryNo === 1, extra });
    if (!r.passed || r.missing.length) h += `<div class="socratic"><b>Think about this:</b> ${esc(s.question)}</div>`;
    if (tryNo === 1 && r.missing.length) h += `<p class="small muted">Tips and the research behind each missing move appear after your next try. First, see whether the question gets you there.</p>`;
    if (r.passed) h += `<p>${tryNo === 1 ? "Passed on the first try. That counts towards level 4." : "Passed. To prove it's a habit, pass a different scenario of this skill on the first try."} Now <b>say it out loud</b> three times.</p>`;
    $("#fb").innerHTML = h + `</div>`;
    tryNo++;
    $("#trynote").textContent = `Try ${tryNo}: rewrite it using the feedback.`;
    if (tryNo > 2 || r.passed) $("#reveal").disabled = false;
    $("#timed").checked = false;
  };
  $("#reveal").onclick = () => {
    if (revealed) return; revealed = true;
    $("#rv").innerHTML = `<div class="card"><h3>Model answers</h3>${s.models.map(m => `<div class="quote">${esc(m)} ${speakBtn(m)}</div>`).join("")}
      <p class="small muted">Don't memorise these. Find the moves in them and compare with yours. Then come back in a few days and answer without looking.</p></div>` + patternHTML(C.patterns[s.skill]);
  };
}

function runQuizSkill(skill) {
  const qs = C.quizzes.filter(q => q.skill === skill);
  let i = 0;
  const next = () => {
    const q = qs[i]; let choice = null, done = false;
    app.innerHTML = `<button class="btn ghost" id="back">← Learn</button>
      <div class="card"><span class="tag">${esc(SKILL(skill).name)} · ${i + 1}/${qs.length}</span>
      <p><b>${esc(q.situation)}</b></p><p class="muted small">Which answer sounds like a confident, respectful leader?</p>
      <div id="opts" role="radiogroup">${q.options.map((o, k) => `<button class="opt" role="radio" aria-checked="false" data-k="${k}">${esc(o.text)}</button>`).join("")}</div>
      <div id="whybox" hidden><label for="why"><b>Before you see the answer:</b> in one line, WHY is it better? Which exact words make the difference?</label>
        <input type="text" id="why"><button class="btn" id="sub">Reveal</button></div>
      <div id="res" aria-live="polite"></div></div>`;
    $("#back").onclick = () => show("learn");
    $$(".opt").forEach(b => b.onclick = () => {
      if (done) return;
      $$(".opt").forEach(x => { x.classList.remove("sel"); x.setAttribute("aria-checked", "false"); });
      b.classList.add("sel"); b.setAttribute("aria-checked", "true"); choice = +b.dataset.k; $("#whybox").hidden = false; $("#why").focus();
    });
    $("#sub").onclick = async () => {
      const why = $("#why").value.trim();
      if (why.length < 5) return alert("Write your reason first, even a rough one. Explaining it is what makes it stick.");
      done = true;
      const correct = P.recordQuiz(S, q, choice, why); await save();
      $$(".opt").forEach((b, k) => {
        const o = q.options[k];
        if (o.correct) b.classList.add("right"); else if (k === choice) b.classList.add("wrong");
        b.insertAdjacentHTML("beforeend", `<div class="small opt-why">${o.correct ? "✓ " : "✗ "}${esc(o.why)}</div>`);
      });
      $("#whybox").hidden = true;
      const unlocked = qs.every(x => S.quizzes[x.id]);
      let h = `<p><b>${correct ? "Right." : "Not quite."}</b> Your reason: <i>“${esc(why)}”</i>. Compare it with the explanation. Did you name the same thing?</p>`;
      h += i + 1 < qs.length ? `<button class="btn" id="nx">Next</button>` : (unlocked ? patternHTML(C.patterns[skill]) + `<button class="btn" id="prac">Practise this skill</button>` : "");
      $("#res").innerHTML = h;
      if ($("#nx")) $("#nx").onclick = () => { i++; next(); };
      if ($("#prac")) $("#prac").onclick = () => runScenario(C.scenarios.find(s => s.skill === skill).id);
    };
  };
  next();
}

function runSurgery(id) {
  const x = C.surgery.find(s => s.id === id);
  app.innerHTML = `<button class="btn ghost" id="back">← Fix</button>
    <div class="card">${x.mine ? '<span class="tag mine">your own sentence</span>' : ""}<span class="tag">${esc(SKILL(x.skill).name)}</span>
      <p class="muted">${esc(x.context)}</p><div class="quote">“${esc(x.weak)}”</div>
      <div class="socratic"><b>First, diagnose:</b> which words make this sound weak, defensive or unclear? Find them yourself, then rewrite.</div>
      <label for="ans" class="sr-only">Your rewrite</label><textarea id="ans" placeholder="Your rewrite..."></textarea>
      <button class="btn" id="check">Check</button></div><div id="fb" aria-live="polite"></div>`;
  $("#back").onclick = () => show("surgery");
  $("#check").onclick = async () => {
    const t = $("#ans").value; if (!t.trim()) return;
    const spec = specFor(x), r = analyze(t, spec), before = analyze(x.weak, spec);
    P.recordSurgery(S, x, r, t); await save();
    $("#fb").innerHTML = `<div class="card"><p class="small muted">Original scored <b>${before.score}</b>. Problems in it: ${before.issues.map(i => "“" + esc(i.hit) + "”").join(", ") || "missing moves"}</p>` + feedbackHTML(t, r) +
      (r.passed ? `<p>Fixed. Say it out loud. ${speakBtn(t)}</p>` : `<p class="small">Keep going: rewrite and check again.</p>`) + `</div>`;
  };
}

// ------------------------------------------------------------------ nav + boot
function show(v) {
  $$("#nav button").forEach(b => { const on = b.dataset.view === v; b.classList.toggle("active", on); b.setAttribute("aria-current", on ? "page" : "false"); });
  window.scrollTo(0, 0);
  views[v]();
  app.focus({ preventScroll: true });
}
$$("#nav button").forEach(b => b.onclick = () => show(b.dataset.view));

(async () => {
  try {
    const [content, state] = await Promise.all([fetch("data/content.json").then(r => r.json()), loadState()]);
    C = content; S = state;
    requestPersistence();
    show("home");
  } catch (e) {
    app.innerHTML = `<div class="card"><h2>Couldn't start</h2><p>${esc(e.message)}</p><p class="small muted">If this is the first visit, you need a connection once so the app can be saved for offline use.</p></div>`;
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
