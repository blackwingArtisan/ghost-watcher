# Kiro session 3: Seal the pact, domain and store (tasks 1 to 13)

- Tool: kiro-cli 3.5.0, v3 engine, non-interactive, default agent
- Command: `GHOST_E2E_PORT=3840 kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command,@context7 "<prompt>" </dev/null` (not `--trust-all-tools`)
- Duration: 8 min 33 s; exit code 0; credits used: 17.49 (kiroween2026 balance 272.70 before, 290.19 after)
- No MCP calls.
- The developer watched ports 3134 to 3139 for the whole session; nothing listened on them.

## Prompt

```text
Implement tasks 1 to 13 of .kiro/specs/seal-the-pact/tasks.md ("Session A": the domain and store with their Vitest tests), following requirements.md and design.md in the same folder and the steering files. Tasks 14 onward are for the next session; do not start them.

First, record the developer's answers to the open questions in design.md section 13: keep all four of the design's defaults as written (display-host rewriting is a separate item and out of scope here). Mark the section as decided.

Rules:
- No test or command may call the network; use fakes for the archiver, fetcher and stores, as the existing tests do.
- Keep the steering rules: the money rule (integer cents), no Date.now or Math.random in rule, pact or dispute code (use the clock).
- Name the criterion numbers in each new test's describe or it title, for example "(PACT 3.2)".
- Tests write only to temporary directories and remove what they write.
- When done, run `npm run typecheck`, `npm run test:unit` and `GHOST_E2E_PORT=3840 npx playwright test` with the shell tool (always set GHOST_E2E_PORT=3840 for Playwright, including inside `npm test`; never use the default ports), and fix anything that fails.
- Tick each task in tasks.md once its checks pass.
- Do not run git commands, not even git status; the developer commits. Leave README.md and KIRO-LOG.md alone.

Finish with a short summary: the files you wrote or changed, the test counts before and after, and anything in the spec you had to change.
```

## Session output

Kiro's narration and tool calls as printed by kiro-cli. Tool status lines and client log lines are removed; nothing else is edited.

```text
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Read File
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
[tool] Run Command
[tool] Write File
[tool] status: Pending
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Run Command
[tool] Write File
[tool] status: Pending
[tool] Write File
[tool] Run Command
[tool] status: Pending
[tool] Write File
[tool] Run Command
[tool] status: Pending
[tool] Run Command
[tool] Run Command
[tool] Run Command
Now the compare test file.
[tool] Write File
[tool] Run Command
[tool] status: Pending
[tool] Run Command
[tool] Run Command
Append a money section.
[tool] Run Command
[tool] Write File
[tool] Run Command
[tool] status: Pending
[tool] Write File
[tool] status: Pending
[tool] Run Command
[tool] Run Command
Now tick tasks, check package.json untouched and cleanup.
[tool] Run Command
[tool] status: Failed: Run Command
[tool] Run Command
[tool] status: Failed: Run Command
Tasks 1 to 13 are done and ticked in `tasks.md`. `npm run typecheck`, `npm run test:unit` and `GHOST_E2E_PORT=3840 npx playwright test` all pass.

**Test counts**
- Unit tests went from 228 in 23 files to 314 in 28 files.
- Playwright still has 17 passing, with the existing specs unchanged.
- No `package.json` or lockfile changed. I checked file modification times, since I can't run git.

**Design §13**
- Section 13 is retitled "(decided)". Each of the four questions has a "Decision: keep the default" line.
- The section also records that display-host rewriting is a separate item, out of scope here.

**Source files**
- New: `template/src/pact.ts` and `template/src/sealing.ts`.
- Changed:
  - `template/src/store/ghost-store.ts`
  - `template/src/runner.ts`
  - `template/src/dispute.ts`
  - `template/src/summary.ts`
  - `template/src/rules.ts`
  - `template/src/alerts/types.ts`
  - `template/src/app.ts`
  - `template/src/index.ts`

**Test files**
- New: `template/test/pact-store.test.ts`, `pact-seal.test.ts`, `pact-compare.test.ts`, `pact-dispute.test.ts`, `pact-hygiene.test.ts` and the shared fakes in `pact-support.ts`.
- Extended: `template/test/money.test.ts`.
- Spec files: `.kiro/specs/seal-the-pact/design.md` (§13) and `tasks.md` (ticks).

**Spec changes and judgement calls**
- **Readable pact check:** The design's `sealPact` step 1 reads `pactRecord`, but a pact whose snapshot file is missing still has a valid `pact.json`. It would then answer `exists` and block sealing, which breaks PACT 4.5. `sealPact` now uses the full `pact()` read. A test caught this.
- **Moved `letterDate`:** `letterDate` now lives in `summary.ts` and `dispute.ts` re-exports it, so `pact.ts` and `dispute.ts` don't import each other. The public export is unchanged. `formatDelta` is now exported from `summary.ts` so `pactNote` can reuse it.
- **Restored pack:** PACT 6.5 (Exhibit A for any pact reference) and 6.7 (restored pack unchanged except the date) pull in different directions. A restored pack keeps today's text, with the date filled, and gets the four Exhibit A rows appended to its evidence.
- **Deferred:** `seedDemoPacts` isn't exported yet. It is task 21, in the next session.

```
