# Leader Talk

Practise sounding **calm, confident, formal and respectful** at work, and learn to spot
what weakens a reply: your own or someone else's.

- **Runs on your phone, offline.** It's an installable web app. After the first visit it works in airplane mode.
- **No AI.** Feedback comes from transparent rules grounded in published communication research
  (Grice's maxims, Brown & Levinson's politeness theory, the "powerless speech" studies, the Pyramid Principle, Gibb's defensive communication, and more).
  Every piece of feedback has a **"Why?"** link to the research behind it.
- **Private.** Progress is stored only on your device.

## Install on your phone

1. Open **https://vididvidid.github.io/leader-talk/** in Chrome (Android) or Safari (iPhone).
2. Android: menu ⋮ → **Add to Home screen / Install app**. iPhone: Share → **Add to Home Screen**.
3. Open it once while online. From then on it works offline.

## What's inside

| Page | What you do |
|---|---|
| Today | A daily plan: due reviews, a new scenario from your weakest skill, a comparison and a fix-it sentence. |
| Learn | Compare answers, explain *why* one is better, then unlock the pattern. Also the research library. |
| Practice | Real workplace situations. Write what you'd say; get feedback and a guiding question. Optional 60-second pressure mode. |
| Fix | Rewrite weak sentences into confident ones. |
| Log | After a real conversation: what you said → feedback → what you'll say next time. |
| Check | Paste any message before you send it. |
| Journal | All your attempts. |

## Development

No build step and no dependencies. Requires Node 20+ for the tests.

```bash
npm test          # engine, content, progress and offline checks
npm run serve     # http://localhost:8080
```

- `web/js/engine.js`: the feedback engine (moves, issues, research checks)
- `web/js/research.js`: the research principles each check cites
- `web/data/content.json`: skills, patterns, quizzes, scenarios, surgery items
- `tests/`: every scenario's model and "must pass" answers must pass, and its "must fail" answers plus generic tricks
  (polite-but-irrelevant, "Okay sure.", "Sorry sir, I tried my best.") must fail.

### Adding a scenario

Add an object to `scenarios` in `web/data/content.json` with `topic` words, required `moves`,
two `models`, and `tests.pass` / `tests.fail` examples. Then run `npm test`.

Deploys to GitHub Pages automatically when `main` changes (Settings → Pages → Source: GitHub Actions).
