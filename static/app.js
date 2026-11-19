"use strict";
const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
let C = null;        // content
let P = null;        // progress
const SKILL = id => C.skills.find(s => s.id === id);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path, body) {
  const r = await fetch(path, body ? {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)} : {});
  return r.json();
}
function speak(text) {
  if (!("speechSynthesis" in window)) return alert("Your browser has no offline voice.");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.lang = "en-US";
  speechSynthesis.speak(u);
}

// ------------------------------------------------------------------ skill map
function bar(level) { return "█".repeat(level * 2) + "░".repeat(10 - level * 2); }
function skillMapText(prog) {
  const pct = prog.overall;
  const ob = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
  let s = `Topic: Confident, respectful communication     overall: ${ob} ${pct}%\n`;
  s += "-".repeat(74) + "\n";
  prog.skills.forEach((k, i) => {
    const name = `${i + 1}. ${k.name}`.padEnd(42).slice(0, 42);
    s += `${name} [${bar(k.level)}]  ${k.level}/5  ${k.level >= 4 ? "* " : ""}${k.level_name}\n`;
  });
  s += "-".repeat(74);
  return s;
}

// ------------------------------------------------------------------ highlight
function highlight(text, r) {
  let h = esc(text);
  const mark = (needle, cls) => {
    if (!needle || needle.length < 2) return;
    const n = esc(needle);
    const idx = h.toLowerCase().indexOf(n.toLowerCase());
    if (idx < 0 || /<[^>]*$/.test(h.slice(0, idx))) return;
    h = h.slice(0, idx) + `<mark class="${cls}">` + h.slice(idx, idx + n.length) + "</mark>" + h.slice(idx + n.length);
  };
  (r.issues || []).forEach(i => mark(i.hit, "r"));
  (r.found || []).forEach(f => mark(f.hit, "g"));
  return h;
}

function feedbackHTML(text, r, opts = {}) {
  const pass = r.passed;
  let h = `<div class="row" style="justify-content:space-between">
     <div><span class="score ${pass ? "pass" : "fail"}">${r.score}</span><span class="muted"> / 100 ${pass ? "· passed" : "· pass mark is 70"}</span></div>
     <div class="muted small">${r.word_count} words</div></div>`;
  if (r.is_review) h += `<p class="small">${r.review_failed ? "⚠ Review failed. This skill drops a level until you pass it again." : "✓ Spaced review."}</p>`;
  if (r.next_review_days) h += `<p class="small muted">Next review of this scenario in ${r.next_review_days} day(s).</p>`;
  h += `<div class="quote small" style="font-size:.95rem">${highlight(text, r)}</div>`;
  h += `<ul class="fb">`;
  (r.found || []).forEach(f => h += `<li class="ok">✓ <b>${esc(f.label)}</b> <span class="hit">“${esc(f.hit)}”</span></li>`);
  (r.missing || []).forEach(m => h += `<li class="miss">✗ <b>${esc(m.label)}</b>${opts.hideTips ? "" : `<br><span class="small">${esc(m.tip)}</span>`}</li>`);
  (r.issues || []).forEach(i => h += `<li class="bad">⚠ <span class="hit">“${esc(i.hit)}”</span> · ${esc(i.message)}<br><span class="small"><b>Try:</b> ${esc(i.fix)}</span></li>`);
  h += `</ul>`;
  if (r.bonus && r.bonus.length) h += `<p class="small muted">Also good: ${r.bonus.map(b => esc(b.label)).join(" · ")}</p>`;
  if (r.length_note) h += `<p class="small">📏 ${esc(r.length_note)}</p>`;
  return h;
}

function patternHTML(p) {
  return `<div class="card pattern"><h3>The pattern</h3>
    <ol>${p.skeleton.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    <div class="quote">${esc(p.example)} <button class="btn ghost small" data-speak="${esc(p.example)}">🔊</button></div>
    <p><b>Why it works:</b> ${esc(p.why)}</p>
    <p><b>Traps:</b></p><ul>${p.traps.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
}

document.addEventListener("click", e => {
  const s = e.target.closest("[data-speak]");
  if (s) speak(s.dataset.speak);
});

// ------------------------------------------------------------------ views
async function refresh() { P = await api("/api/progress"); }

const views = {
  async home() {
    await refresh();
    const items = P.plan.map(it => {
      let title = "", go = "";
      if (it.kind === "scenario") { const s = C.scenarios.find(x => x.id === it.id); title = "🎭 " + s.title; go = `scenario:${s.id}`; }
      if (it.kind === "quiz") { const q = C.quizzes.find(x => x.id === it.id); title = "🔍 Compare: " + SKILL(q.skill).name; go = `quiz:${q.skill}`; }
      if (it.kind === "surgery") { title = "✂️ Sentence surgery"; go = `surgery:${it.id}`; }
      return `<div class="item planitem"><div><b>${esc(title)}</b><div class="small muted">${esc(it.why)}</div></div><button class="btn" data-go="${go}">Start</button></div>`;
    }).join("");
    app.innerHTML = `
      <h1>Today's practice</h1>
      <div class="grid2">
        <div class="card"><div class="muted small">Streak</div><div class="stat">${P.streak} day${P.streak === 1 ? "" : "s"}</div></div>
        <div class="card"><div class="muted small">Reviews due</div><div class="stat">${P.due.length}</div></div>
      </div>
      <div class="card list">${items || "<p>Everything done. Try the Real-life log: write down a real conversation from today.</p>"}</div>
      <h2>Skill map</h2>
      <div class="skillmap">${esc(skillMapText(P))}</div>
      <p class="small muted">Levels are earned, not given. 3 = passed a scenario (hints allowed). 4 = passed two different scenarios on the <b>first</b> try. 5 = also passed a hard one first try <b>and</b> a spaced review a day or more later. Failing a review drops the level.</p>
      <div class="card"><h3>How to use this</h3>
        <ol class="small">
          <li><b>Learn</b>: compare answers and find the pattern yourself before you see it.</li>
          <li><b>Practice</b>: answer like you would in real life. Turn on the timer, because real conversations don't wait.</li>
          <li><b>Sentence surgery</b>: rewrite weak sentences, including your own from the tutoring session.</li>
          <li><b>Real-life log</b>: after a real conversation, write what you said and rewrite it. This is how the new habit forms <i>during</i> conversations.</li>
          <li>Say your final version <b>out loud</b> 3 times. Speaking builds the habit; reading doesn't.</li>
        </ol></div>`;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
      const [k, id] = b.dataset.go.split(":");
      if (k === "scenario") runScenario(id);
      if (k === "quiz") runQuizSkill(id);
      if (k === "surgery") runSurgery(id);
    });
  },

  async learn() {
    await refresh();
    app.innerHTML = `<h1>Learn: find the pattern</h1>
      <p class="muted">For each skill, pick the answer that sounds like a leader and explain <b>why</b> in your own words. The pattern card unlocks only after you've found it yourself.</p>
      <div class="card list">${C.skills.map(s => {
        const qs = C.quizzes.filter(q => q.skill === s.id);
        const done = qs.filter(q => P.quizzes_done.includes(q.id)).length;
        return `<div class="item"><div><b>${esc(s.name)}</b><div class="small muted">${done}/${qs.length} compared</div></div>
          <div class="row">${done === qs.length ? `<button class="btn ghost" data-pat="${s.id}">Pattern</button>` : ""}<button class="btn" data-skill="${s.id}">${done ? "Redo" : "Start"}</button></div></div>`;
      }).join("")}</div>`;
    app.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => runQuizSkill(b.dataset.skill));
    app.querySelectorAll("[data-pat]").forEach(b => b.onclick = async () => {
      const pats = await api("/api/pattern");
      app.innerHTML = `<button class="btn ghost" id="back">← Back</button><h1>${esc(SKILL(b.dataset.pat).name)}</h1>` + patternHTML(pats[b.dataset.pat]);
      $("#back").onclick = () => show("learn");
    });
  },

  async practice() {
    await refresh();
    app.innerHTML = `<h1>Practice scenarios</h1>
      <p class="muted">Write exactly what you would <b>say</b>. You get feedback and a guiding question. Model answers unlock after your second try (or once you pass).</p>
      ${C.skills.map(s => `<div class="card list"><h3>${esc(s.name)}</h3>${C.scenarios.filter(x => x.skill === s.id).map(x => {
        const st = P.scenarios[x.id];
        const badge = st ? (st.first_try_pass ? "✓ first try" : st.passes ? "✓ passed" : `best ${st.best}`) : "new";
        return `<div class="item"><div><b>${esc(x.title)}</b> ${x.hard ? '<span class="tag hard">hard</span>' : ""}<div class="small muted">${badge}</div></div><button class="btn ghost" data-s="${x.id}">Open</button></div>`;
      }).join("")}</div>`).join("")}`;
    app.querySelectorAll("[data-s]").forEach(b => b.onclick = () => runScenario(b.dataset.s));
  },

  async surgery() {
    await refresh();
    app.innerHTML = `<h1>Sentence surgery</h1>
      <p class="muted">Rewrite weak sentences into calm, confident ones. Items marked <span class="tag mine">yours</span> are your own sentences from the tutoring session.</p>
      <div class="card list">${C.surgery.map(x => {
        const st = P.surgery[x.id];
        return `<div class="item"><div>${x.mine ? '<span class="tag mine">yours</span>' : ""}<span class="small">“${esc(x.weak)}”</span>
          <div class="small muted">${st ? (st.passed ? "✓ fixed" : "best " + st.best) : ""}</div></div><button class="btn ghost" data-x="${x.id}">Fix</button></div>`;
      }).join("")}</div>`;
    app.querySelectorAll("[data-x]").forEach(b => b.onclick = () => runSurgery(b.dataset.x));
  },

  async real() {
    const j = await api("/api/journal");
    app.innerHTML = `<h1>Real-life log</h1>
      <p class="muted">The most important page. After a real conversation (a meeting, a call, a chat), write down what you <i>actually</i> said. Then rewrite it. Doing this after real moments is what makes you start noticing <b>during</b> them.</p>
      <div class="card">
        <label class="small muted">Situation (who, what happened)</label><input type="text" id="rl-sit" placeholder="e.g. Standup: lead asked why my task was late">
        <label class="small muted" style="display:block;margin-top:10px">What I actually said (be honest)</label><textarea id="rl-said"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn ghost" id="rl-check1">Check what I said</button></div>
        <div id="rl-fb1"></div>
        <label class="small muted" style="display:block;margin-top:10px">What I'd say next time</label><textarea id="rl-re"></textarea>
        <label class="small muted" style="display:block;margin-top:10px">One-line lesson for myself</label><input type="text" id="rl-lesson" placeholder="e.g. Lead with the fact, not 'we need a discussion'">
        <div class="row" style="margin-top:10px"><button class="btn" id="rl-save">Check rewrite & save</button></div>
        <div id="rl-fb2"></div>
      </div>
      <h2>Past entries</h2>
      ${j.reallife.length ? j.reallife.map(e => `<div class="card"><div class="small muted">${new Date(e.ts * 1000).toLocaleString()} · ${esc(e.situation)}</div>
        <p><b>Said</b> (${e.said_score}): ${esc(e.said)}</p>${e.rewrite ? `<p><b>Next time</b> (${e.rewrite_score}): ${esc(e.rewrite)} <button class="btn ghost small" data-speak="${esc(e.rewrite)}">🔊</button></p>` : ""}
        ${e.lesson ? `<p class="small">💡 ${esc(e.lesson)}</p>` : ""}</div>`).join("") : '<p class="muted">No entries yet.</p>'}`;
    $("#rl-check1").onclick = async () => {
      const said = $("#rl-said").value;
      if (!said.trim()) return;
      const r = await api("/api/reallife", {said});
      $("#rl-fb1").innerHTML = feedbackHTML(said, r.said) + `<div class="socratic"><b>Ask yourself:</b> What did the other person need to hear first: the fact, your view, or a next step? Did anything in your reply move attention to <i>you</i> instead of the problem?</div>`;
    };
    $("#rl-save").onclick = async () => {
      const body = {situation: $("#rl-sit").value, said: $("#rl-said").value, rewrite: $("#rl-re").value, lesson: $("#rl-lesson").value, save: true};
      if (!body.said.trim()) return alert("Write what you actually said first.");
      const r = await api("/api/reallife", body);
      $("#rl-fb2").innerHTML = r.rewrite ? `<h3>Your rewrite</h3>` + feedbackHTML(body.rewrite, r.rewrite) + `<p>Saved. Now say the rewrite out loud three times. <button class="btn ghost" data-speak="${esc(body.rewrite)}">🔊 Hear it</button></p>` : "<p>Saved.</p>";
    };
  },

  async free() {
    app.innerHTML = `<h1>Free check</h1>
      <p class="muted">Paste any message before you send it (an email, a chat reply, something you plan to say in a meeting). It checks for weak, defensive or unclear habits and common phrasing issues.</p>
      <div class="card"><textarea id="fr"></textarea><div class="row" style="margin-top:8px"><button class="btn" id="frb">Check</button></div><div id="frf"></div></div>`;
    $("#frb").onclick = async () => {
      const t = $("#fr").value; if (!t.trim()) return;
      const r = await api("/api/free", {text: t});
      $("#frf").innerHTML = feedbackHTML(t, r) + (r.issues.length ? "" : "<p>No weak habits found. Read it once more: is the most important point in the first sentence?</p>");
    };
  },

  async journal() {
    const j = await api("/api/journal");
    app.innerHTML = `<h1>Journal</h1><p class="muted">Every attempt you made, newest first. Compare your first tries with later ones to see your progress.</p>
      ${j.attempts.length ? `<div class="card list">${j.attempts.map(a => `<div class="item"><div><div class="small muted">${new Date(a.ts * 1000).toLocaleString()} · ${esc(a.title)} · try ${a.try}${a.timed ? " · ⏱" : ""}</div>${esc(a.text)}</div><b>${a.score}</b></div>`).join("")}</div>` : '<p class="muted">Nothing yet.</p>'}
      <div class="card"><h3>Start over</h3><p class="small muted">Deletes all progress and journal entries.</p><button class="btn ghost" id="reset">Reset progress</button></div>`;
    $("#reset").onclick = async () => { if (confirm("Delete ALL progress? This cannot be undone.")) { await api("/api/reset", {}); show("home"); } };
  },
};

// ------------------------------------------------------------------ runners
function runScenario(id) {
  const s = C.scenarios.find(x => x.id === id);
  let tryNo = 1, timer = null, left = 0, revealed = false;
  app.innerHTML = `<button class="btn ghost" id="back">← Scenarios</button>
    <div class="card">
      <div class="row" style="justify-content:space-between"><span class="tag">${esc(SKILL(s.skill).name)}</span>${s.hard ? '<span class="tag hard">hard · edge case</span>' : ""}</div>
      <h1>${esc(s.title)}</h1>
      <p>${esc(s.context)}</p>
      <div class="quote">“${esc(s.line)}” <button class="btn ghost small" data-speak="${esc(s.line)}">🔊</button></div>
      <p class="muted">${esc(s.situation)}</p>
      <div class="row" style="justify-content:space-between;margin:8px 0"><label class="small"><input type="checkbox" id="timed"> Pressure mode: 60 seconds, like a real conversation</label><span class="timer" id="timer"></span></div>
      <textarea id="ans" placeholder="Write exactly what you'd say, word for word..."></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" id="check">Check</button><button class="btn ghost" id="reveal" disabled>Show model answers</button></div>
      <p class="small muted" id="trynote">Try 1. No hints yet: answer from instinct.</p>
    </div>
    <div id="fb"></div><div id="rv"></div>`;
  $("#back").onclick = () => show("practice");
  $("#timed").onchange = e => {
    clearInterval(timer); $("#timer").textContent = "";
    if (!e.target.checked) return;
    left = 60; $("#timer").textContent = "60s"; $("#ans").focus();
    timer = setInterval(() => {
      left--; const t = $("#timer"); if (!t) return clearInterval(timer);
      t.textContent = left + "s"; t.classList.toggle("low", left <= 10);
      if (left <= 0) { clearInterval(timer); $("#check").click(); }
    }, 1000);
  };
  $("#check").onclick = async () => {
    const text = $("#ans").value;
    if (!text.trim()) { if ($("#timed").checked && left <= 0) $("#fb").innerHTML = `<div class="card bad">Time ran out with nothing written. In a real meeting, silence is also an answer. Try a first sentence that buys you time: "Let me think out loud for a second..."</div>`; return; }
    clearInterval(timer);
    const r = await api("/api/check", {id, text, try: tryNo, timed: $("#timed").checked});
    let h = `<div class="card">` + feedbackHTML(text, r, {hideTips: tryNo === 1});
    if (r.question) h += `<div class="socratic"><b>Think about this:</b> ${esc(r.question)}</div>`;
    if (tryNo === 1 && r.missing.length) h += `<p class="small muted">Tips for the missing moves appear after your next try. First, see whether the question above gets you there.</p>`;
    if (r.passed) h += `<p>${tryNo === 1 ? "Passed on the first try. That counts towards level 4." : "Passed. To prove it's a habit, try a different scenario of this skill on the first try."} Now <b>say it out loud</b> three times.</p>`;
    h += `</div>`;
    $("#fb").innerHTML = h;
    tryNo++;
    $("#trynote").textContent = `Try ${tryNo}: rewrite it using the feedback.`;
    if (tryNo > 2 || r.passed) $("#reveal").disabled = false;
    if ($("#timed").checked) $("#timed").checked = false;
  };
  $("#reveal").onclick = async () => {
    if (revealed) return; revealed = true;
    const r = await api("/api/reveal", {id});
    $("#rv").innerHTML = `<div class="card"><h3>Model answers</h3>${r.models.map(m => `<div class="quote">${esc(m)} <button class="btn ghost small" data-speak="${esc(m)}">🔊</button></div>`).join("")}
      <p class="small muted">Don't memorise these. Find the moves in them (fact? view? next step?) and compare them with yours. Then come back to this scenario in a few days and answer without looking.</p></div>` + patternHTML(r.pattern);
  };
}

function runQuizSkill(skill) {
  const qs = C.quizzes.filter(q => q.skill === skill);
  let i = 0;
  const next = () => {
    const q = qs[i];
    let choice = null;
    app.innerHTML = `<button class="btn ghost" id="back">← Learn</button>
      <div class="card"><span class="tag">${esc(SKILL(skill).name)} · ${i + 1}/${qs.length}</span>
      <p><b>${esc(q.situation)}</b></p><p class="muted small">Which answer sounds like a confident, respectful leader?</p>
      <div id="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}</div>
      <div id="whybox" style="display:none;margin-top:10px">
        <label class="small"><b>Before you see the answer:</b> in one line, WHY is it better? Which exact words make the difference?</label>
        <input type="text" id="why"><div class="row" style="margin-top:8px"><button class="btn" id="sub">Reveal</button></div></div>
      <div id="res"></div></div>`;
    $("#back").onclick = () => show("learn");
    app.querySelectorAll(".opt").forEach(b => b.onclick = () => {
      if ($("#res").innerHTML) return;
      app.querySelectorAll(".opt").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); choice = +b.dataset.k; $("#whybox").style.display = "block"; $("#why").focus();
    });
    $("#sub").onclick = async () => {
      if ($("#why").value.trim().length < 5) return alert("Write your reason first, even a rough one. Explaining it is what makes it stick.");
      const r = await api("/api/quiz", {id: q.id, choice, why: $("#why").value});
      app.querySelectorAll(".opt").forEach((b, k) => {
        b.classList.add(r.options[k].correct ? "right" : (k === choice ? "wrong" : ""));
        b.innerHTML += `<div class="small" style="margin-top:6px">${r.options[k].correct ? "✓ " : "✗ "}${esc(r.options[k].why)}</div>`;
      });
      $("#whybox").style.display = "none";
      let h = `<p><b>${r.correct ? "Right." : "Not quite."}</b> Your reason: <i>“${esc($("#why").value)}”</i>. Compare it with the explanation. Did you name the same thing?</p>`;
      h += i + 1 < qs.length ? `<button class="btn" id="nx">Next</button>` : (r.pattern ? patternHTML(r.pattern) + `<div class="row"><button class="btn" id="prac">Practise this skill</button></div>` : "");
      $("#res").innerHTML = h;
      if ($("#nx")) $("#nx").onclick = () => { i++; next(); };
      if ($("#prac")) $("#prac").onclick = () => runScenario(C.scenarios.find(s => s.skill === skill).id);
    };
  };
  next();
}

function runSurgery(id) {
  const x = C.surgery.find(s => s.id === id);
  app.innerHTML = `<button class="btn ghost" id="back">← Surgery</button>
    <div class="card">${x.mine ? '<span class="tag mine">your own sentence</span>' : ""}<span class="tag">${esc(SKILL(x.skill).name)}</span>
      <p class="muted">${esc(x.context)}</p>
      <div class="quote">“${esc(x.weak)}”</div>
      <div class="socratic"><b>First, diagnose:</b> which words make this sound weak, defensive or unclear? Find them yourself, then rewrite.</div>
      <textarea id="ans" placeholder="Your rewrite..."></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" id="check">Check</button></div></div><div id="fb"></div>`;
  $("#back").onclick = () => show("surgery");
  $("#check").onclick = async () => {
    const t = $("#ans").value; if (!t.trim()) return;
    const r = await api("/api/surgery", {id, text: t});
    $("#fb").innerHTML = `<div class="card"><p class="small muted">Original scored <b>${r.before_score}</b>. Problems in it: ${r.before_issues.map(i => "“" + esc(i.hit) + "”").join(", ") || "missing moves"}</p>` + feedbackHTML(t, r) +
      (r.passed ? `<p>Fixed. Say it out loud. <button class="btn ghost" data-speak="${esc(t)}">🔊 Hear it</button></p>` : `<p class="small">Keep going: rewrite and check again.</p>`) + `</div>`;
  };
}

// ------------------------------------------------------------------ nav
function show(v) {
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  window.scrollTo(0, 0);
  views[v]();
}
document.querySelectorAll("#nav button").forEach(b => b.onclick = () => show(b.dataset.view));

(async () => { C = await api("/api/content"); show("home"); })();
