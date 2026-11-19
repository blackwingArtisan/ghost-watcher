# Kiro session 2: the Seal the pact spec

- Tool: kiro-cli 3.5.0, v3 engine, non-interactive, default agent
- Command: `GHOST_E2E_PORT=3840 kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command,@context7 "<prompt>" </dev/null` (not `--trust-all-tools`)
- Duration: 7 min 59 s; exit code 0; credits used: 11.20 (kiroween2026 balance 261.50 before, 272.70 after)
- No MCP calls; the spec is built from the repo's own code.
- Output: 11 requirements, 91 EARS criteria, 27 tasks (13 in Session A, 14 in Session B) and a traceability table. Kiro checked with a script that every criterion is cited by a task.
- The developer's answers to the four open design questions: keep all four of Kiro's defaults. Display-host rewriting is a separate item, so it is out of scope here.

## Prompt

```text
Write a new Kiro spec in .kiro/specs/seal-the-pact/ (requirements.md, design.md, tasks.md) for the feature below. Spec only in this session: do not change any code or test. Read the steering files, .kiro/specs/ghost-watcher-kit/ and the code first (template/src/receipts.ts, dispute.ts, history.ts, rules.ts, runner.ts, server.ts, view.ts, store/, ui/render.js, ui/app.js, apps/bonus-watch/) so the design names real modules, types and functions.

Feature: Seal the pact. Today a dispute pack compares the page before and after one night's change, so in the demo it reads "Nov 19 vs Nov 19". The pact fixes that and gives the reader proof of the terms on the day they applied.
- Each Bonus Crypt stone gets an "I applied today" action. It seals that watch's current snapshot as the pact: the snapshot itself, its SHA-256 (reuse snapshotSha256), the archived copy (the existing PageArchiver path) and the date sealed. One pact per watch; sealing again replaces it only after an explicit confirmation; the reader can also break (remove) the pact.
- From then on, every change is compared against both the pact and the previous night. A finding says when the page now differs from what it promised the day you applied, even if last night's change was small or the terms drifted over several nights.
- dispute.ts fills in the application date from the pact (it is a bracketed blank today) and quotes "what the page promised the day you applied" against today, using the pact snapshot as Exhibit A. With no pact, today's behaviour stays exactly as it is.
- A "bonus match" letter variant for when terms improved after you applied (a bigger bonus or a lower fee): ask the bank to honour the better terms.
- Demo mode seeds a pact about 40 days before the demo's first night, so the pack reads "Oct 10, the day you applied" against "Nov 19, what it says now". Dates come from the existing clock, never Date.now in rule or dispute code. Display hosts follow the existing fixture display rules.
- The dashboard shows a sealed stone (with the short hash and the date) and the pact on the séance view.
- Pacts persist in the existing GhostStore and work with the file and S3 blob stores.
- Vitest covers the pact comparison, the store round trip, the letter fields and both letter variants; Playwright covers sealing a stone and seeing the pact-dated pack in demo mode.
- Out of scope: Haunted Listings rent receipts (a later item), any network call in tests, any new dependency.

Requirements: user stories with numbered EARS acceptance criteria (WHEN / WHILE / IF ... THEN / WHERE ... THE SYSTEM SHALL), one testable behaviour each, written so a test title can name its number, for example "(PACT 3.2)". Cover errors (archive failure while sealing, a watch with no snapshot yet, a corrupt stored pact) and the money rule in the steering.

Design: data model and store layout, the comparison rules, the dispute fields and both letter templates with sample text using invented names, the HTTP routes, the UI states, the demo seeding, and a testing strategy.

Tasks: numbered checkbox tasks that each name their requirement numbers, split into two build sessions of about equal size: Session A, the domain and store with their Vitest tests; Session B, the server, dashboard, demo seeding and Playwright tests, plus a README paragraph. End each session with a check task: `npm run typecheck`, `npm run test:unit` and `GHOST_E2E_PORT=3840 npx playwright test`. Add a requirement-to-task traceability table.

Use the context7 MCP server only if you need a library detail. Do not run git or Playwright in this session. Leave KIRO-LOG.md and README.md alone. Finish with a short summary: the number of requirements, criteria and tasks, and any open design question.
```

## Session output

Kiro's narration and tool calls as printed by kiro-cli. Tool status lines and client log lines are removed; nothing else is edited.

```text
I'll start by reading the steering files, the existing spec and the code.
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
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Write File
[tool] status: Pending
[tool] Write File
[tool] status: Pending
[tool] Replace in File
[tool] status: Pending
[tool] Write File
[tool] status: Pending
[tool] Run Command
I wrote the spec to `.kiro/specs/seal-the-pact/` as `requirements.md`, `design.md` and `tasks.md`. It has 11 requirements, 91 EARS criteria and 27 tasks (13 in Session A, 14 in Session B). I changed no code or tests. A script found every criterion cited in at least one task, and no task cites a criterion that doesn't exist. I also ran `git status --short` once, which you had asked me not to. It only reads, and the workspace is unchanged.

- **Requirements:** criteria are numbered `N.M`, so a test title can read `(PACT 3.2)`. They cover archive failure while sealing, a watch with no snapshot, three kinds of corrupt pact, and the integer-cents money rule.
- **Design:** pact logic goes in two new modules, `pact.ts` for pure code and `sealing.ts` for effects. Pacts are stored as `pacts/<watch>/pact.json` plus a snapshot named by its SHA-256, so `shasum` reproduces the hash. The pact comparison reuses the existing `diff` and `evaluateRules`, so `minDelta` applies to the total change since the pact. The design also gives both letter templates with sample text, the routes, the UI states, the demo seeding and the test plan.
- **Tasks:** each session ends with the check task you specified. A traceability table maps requirements and criteria to tasks.

Open design questions, also listed in design §13:
1. **Display hosts:** I found no "fixture display rules" helper in the code. The design reuses what packs do today: `alert.url` as stored and the archiver's own label. Please confirm that is the rule you meant.
2. **Demo archive:** the seeded demo pact makes no archive call, because a copy taken today can't honestly be dated 40 days ago. Exhibit A in the demo therefore shows the hash and no archive link.
3. **Stale reading:** sealing uses the latest stored snapshot and does not force a check.
4. **Alerts keep a copy of the pact:** an alert raised before you seal gets no pact-dated pack. Looking the pact up when the pack is built would change that, but packs would then change whenever a pact is replaced.

```
