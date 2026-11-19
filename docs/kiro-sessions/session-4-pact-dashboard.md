# Kiro session 4: Seal the pact, server, dashboard and demo (tasks 14 to 27)

- Tool: kiro-cli 3.5.0, v3 engine, non-interactive, default agent
- Command: `GHOST_E2E_PORT=3840 kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command,@context7 "<prompt>" </dev/null` (not `--trust-all-tools`)
- Duration: 11 min 42 s; exit code 0; credits used: 24.26 (kiroween2026 balance 290.19 before, 314.45 after)
- No MCP calls.
- Kiro took and reviewed screenshots and fixed one wrapping problem on the sealed stone. Its final screenshots were not kept, because Playwright clears `test-results/` on each run. The developer re-took the demo at 1360 px and 390 px (a sealed stone, night 1 and the pact-dated dispute pack): no horizontal scroll and nothing broken.
- The developer watched ports 3134 to 3139 for the whole session; nothing listened on them.

## Prompt

```text
Implement tasks 14 to 27 of .kiro/specs/seal-the-pact/tasks.md ("Session B": the server, dashboard, demo seeding and Playwright tests, plus the README paragraph), following requirements.md and design.md in the same folder and the steering files. Tasks 1 to 13 are done.

Rules:
- No test or command may call the network outside 127.0.0.1; use the local fixture sites and the stand-in archive, as the existing e2e tests do.
- Keep the steering rules: the money rule (integer cents), no Date.now or Math.random in rule, pact or dispute code, and the dashboard's accessibility checks (the axe test must stay green).
- Name the criterion numbers in each new test's title, for example "(PACT 8.2)".
- Keep the existing Playwright tests passing; if a test's expectation must change because of the pact, say which and why.
- When done, run `npm run typecheck`, `npm run test:unit` and `GHOST_E2E_PORT=3840 npx playwright test` with the shell tool (always set GHOST_E2E_PORT=3840 for Playwright, including inside `npm test`; never use the default ports), and fix anything that fails.
- Then take two screenshots with Playwright of the demo dashboard on GHOST_E2E_PORT=3840's demo server (a sealed stone, and the pact-dated dispute pack), save them under test-results/pact/ and look at them; fix anything that looks broken at 1360 px and at 390 px wide.
- Tick each task in tasks.md once its checks pass.
- Do not run git commands, not even git status; the developer commits. Leave KIRO-LOG.md alone; README.md changes are limited to the README task.

Finish with a short summary: the files you wrote or changed, the test counts before and after, and anything in the spec you had to change.
```

## Session output

Kiro's narration and tool calls as printed by kiro-cli. Tool status lines and client log lines are removed; nothing else is edited.

```text
I'll start by reading the spec and tasks.
[tool] Run Command
[tool] Read File
[tool] Read File
[tool] Read File
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Read File
[tool] Read File
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] status: Failed: Run Command
[tool] Replace in File
[tool] status: Pending
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
Fix it: put the complaint block into the const and drop it from the template tail.
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Write File
[tool] status: Pending
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Write File
[tool] status: Pending
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Write File
[tool] status: Pending
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Read File
[tool] Read File
[tool] Run Command
[tool] Read File
[tool] Read File
[tool] Run Command
[tool] status: Failed: Run Command
[tool] Run Command
Tasks 14 to 27 are done and ticked in `tasks.md`. `npm run typecheck`, `npm run test:unit` and `GHOST_E2E_PORT=3840 npx playwright test` all pass.

**Test counts**

| | Before | After |
|---|---|---|
| Unit | 314 | 348 |
| Playwright | 17 | 27 |

The 10 new Playwright tests are all in `e2e/seal-the-pact.spec.ts`. The existing specs needed no expectation changes. The axe test is still green, and the new spec adds its own axe scans of the stone, the séance (pact section and confirm panel open) and the demo pack.

**Screenshots**
- They are in `test-results/pact/`: `sealed-stone-wide.png`, `sealed-stone-phone.png`, `pact-pack-wide.png` and `pact-pack-phone.png`.
- I took them from a demo server on port 3844, which is `GHOST_E2E_PORT=3840` plus 4. The server and its temp files are removed.
- I looked at the first set and fixed one problem. The short hash on a sealed stone broke across lines at 1360 px, and the "demo" tag dropped onto its own line.
- The 390 px stone and the 390 px dispute pack both look fine and have no sideways scroll.
- Playwright wipes `test-results/` at the start of every run, so I retook the screenshots after the final run. I only opened the first set. I did not open the second set.

**Files written or changed**
- **Template source:** `server.ts`, `view.ts`, `sealing.ts` (added `seedDemoPacts`), `cli.ts`, `index.ts`, `ui/render.js`, `ui/app.js`, `ui/style.css`.
- **App:** `apps/bonus-watch/src/app.ts` now sets `pacts: true`.
- **New tests:** `template/test/pact-server.test.ts`, `apps/bonus-watch/test/pact.test.ts`, `e2e/seal-the-pact.spec.ts`.
- **Docs:** `README.md` (one paragraph), `.kiro/steering/structure.md` and `tasks.md`.

**Spec deviations and decisions**
- **Spec text:** I changed nothing in `requirements.md` or `design.md`.
- **Apps without `copy.pacts`:** `pact` and `canSeal` are left out of their JSON entirely, rather than sent as `null` and `false`. That keeps listing-watch's API byte-identical (PACT 11.5).
- **Archive links:** the pact section only links an archive URL that starts with `http(s)://`. Anything else shows as "hashes only". This is a small hardening beyond the spec.
- **Escape key:** Escape answers an open confirmation ("Keep it") before it closes the séance.
- **Confirm panel on refresh:** the 15-second refresh leaves an open confirm panel alone, so a poll doesn't remove the question.
- **Test coverage:** the pact-server tests cover the 413 and 400 body limits and the foreign-origin 403 (sent over `node:http`, since `fetch` may not set `Origin`).

I ran no git commands, left `KIRO-LOG.md` alone, and changed no `package.json`.

```
