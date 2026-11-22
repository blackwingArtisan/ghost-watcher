# Kiro log

<!-- kiro-numbers:start -->
| Kiro, by the numbers | |
| --- | --- |
| `kiro-cli` calls | 9 (calls 1 to 9), each with an explicit list of trusted tools, never `--trust-all-tools` |
| Time in Kiro | 73 minutes (calls 3 to 9; calls 1 and 2 were timed only roughly, about 15 minutes together) |
| Credits | 133.18 (calls 3 to 9, read with `/usage` before and after each call; calls 1 and 2 were not recorded) |
| Lines Kiro added | 7,231 (calls 3 to 9; `git show --numstat` on Kiro's commits, transcripts and `KIRO-LOG.md` excluded) |
| Tests Kiro added | 201 Vitest and 10 Playwright (suite counts before and after each call) |
| MCP calls | 14 (context7; calls 8 and 9), each with its arguments in the transcript |
| Hand fixes to Kiro's code | 1: a date assumption in a Kiro-written test (5 lines added, 2 removed after call 7); Kiro fixed the cause in call 8 |
<!-- kiro-numbers:end -->

## Kiro features at a glance

| Feature | Where | Evidence |
| --- | --- | --- |
| Specs | `.kiro/specs/ghost-watcher-kit/` (the skeleton) and `.kiro/specs/seal-the-pact/` (the headline feature) | Kiro wrote both: [call 2](#call-2-spec-generation-three-files-written), [session 2](docs/kiro-sessions/session-2-seal-the-pact-spec.md); requirement 12 added in [session 6](docs/kiro-sessions/session-6-pact-copy.md) |
| Steering | `.kiro/steering/`: `product.md`, `structure.md`, `tech.md` (always), `testing.md` and `pact.md` (scoped with `fileMatch`) | The scoped files were written by Kiro in [session 5](docs/kiro-sessions/session-5-test-clock.md) and [session 6](docs/kiro-sessions/session-6-pact-copy.md) after it checked the front matter with context7 |
| Hooks | `.kiro/hooks/test-on-save.json`, `full-suite-on-stop.json` | The Stop hook ran the full suite after call 3 and caught a stale assertion that Kiro fixed ([call 3 follow-up](#follow-up-after-the-stop-hooks-full-suite-run)) |
| Agent hook | `.kiro/hooks/money-guard.json` restates the integer-cents rule when money code is saved | Written by Kiro in [call 3](#call-3-spec-review-money-and-contact-url-kiro-cli-v3) |
| Custom agent | `.kiro/agents/pact-keeper.json`, scoped to the pact code with its steering as resources | Written by Kiro and checked with `kiro-cli agent validate` in [session 6](docs/kiro-sessions/session-6-pact-copy.md) |
| MCP | `.kiro/settings/mcp.json` (context7) | Every call from session 5 on makes real context7 calls; each transcript shows the arguments |

## What Kiro built

- **Seal the pact, the headline feature, specced and built by Kiro.** Kiro wrote
  `.kiro/specs/seal-the-pact/` (11 requirements, 91 EARS criteria, 27 tasks), then built all 27 tasks
  in two sessions: "I applied today" on each Bonus Crypt stone seals the page's snapshot, SHA-256,
  archived copy and date as your pact. Every later change is judged against the pact as well as last
  night. The dispute pack quotes what the page promised the day you applied against today, and a
  bonus-match letter asks for terms that improved. The demo pact is back-dated 40 days. Kiro wrote
  all 4,526 lines of calls 5 to 7 below; one assertion was later loosened by hand, and Kiro fixed
  the cause in call 8.
- **Overridable e2e ports.** Kiro moved every Playwright port into `e2e/ports.ts` behind
  `GHOST_E2E_PORT`, with tests (call 4).
- **The spec.** Kiro wrote the EARS requirements, the design and the task list in
  `.kiro/specs/ghost-watcher-kit/` (call 2), then audited them against the code, tightened every
  acceptance criterion and recorded 11 gaps as new tasks (call 3).
- **Integer-cents money.** Kiro replaced floating-point money with exact integer cents across the
  normalizer, diff, rules and summaries, with tests for float traps and amounts above 2^31 cents.
- **An honest contact URL.** Kiro removed the placeholder contact from both apps and made the
  watcher refuse to start against a real site without a real contact URL, with a test per branch.
- **The Stop hook catch.** When Kiro finished call 3, the workspace's `full-suite-on-stop.json` hook
  ran the whole suite on its own, caught a stale end-to-end assertion, and Kiro fixed it in the same
  session.
- **A third hook.** Kiro added the `money-guard` agent hook, which restates the integer-cents rule
  whenever `normalize.ts`, `diff.ts` or `rules.ts` is saved.

## Who wrote what

| Part | Written by |
| --- | --- |
| Steering files (`.kiro/steering/`) | Outside Kiro, before the first Kiro call, so Kiro planned against the same product, stack and layout |
| Requirements, design and task list | Kiro (call 2); reviewed and tightened by Kiro (call 3); one criterion revised by hand (REQ-DIFF-09) |
| Template and app code, first version | Outside Kiro, against Kiro's spec, with an AI coding assistant (Claude Code); commits carry a `Co-Authored-By` line |
| Integer-cents money, contact URL policy, their tests | Kiro (call 3) |
| `test-on-save` and `full-suite-on-stop` hooks | Outside Kiro; Kiro narrowed the matcher and validated both (call 3) |
| `money-guard` agent hook | Kiro (call 3) |
| Seal the pact: spec, pact store, comparison, dispute and bonus-match letters, routes, dashboard, demo seeding, 120 Vitest and 10 Playwright tests | Kiro (calls 5 to 7); the developer ran the shell and the checks. One assertion was loosened by hand three days later (5 lines added, 2 removed) and Kiro fixed the cause in call 8 |
| Overridable e2e ports (`e2e/ports.ts`) and its tests | Kiro (call 4) |
| Later features (Ghost of Terms Past, bait and switch, receipts, noise table, webhook, dashboard polish) | Outside Kiro, with Claude Code; see [CHANGELOG.md](CHANGELOG.md) |

Every `kiro-cli` call is counted in the numbers block at the top. None used `--trust-all-tools`;
each was given an explicit list of trusted tools. Call 1 drafted the spec but could not save it; the lesson (name the tools the v3
engine uses) made call 2 work.

## Before the calls

The three steering files in `.kiro/steering/` (`product.md`, `tech.md`, `structure.md`) were written
first, with `inclusion: always` front matter, so that Kiro would plan against the same product,
stack and folder layout the code later followed.

## Call 1: spec generation (draft only)

**Command**

```sh
kiro-cli chat --no-interactive --trust-tools=fs_read,fs_write "<prompt below>" </dev/null
```

**Prompt**

> Read the steering files in .kiro/steering (product.md, tech.md, structure.md). Then write a Kiro
> spec for the Ghost Watcher skeleton and its two apps into .kiro/specs/ghost-watcher-kit/:
> (1) requirements.md with user stories and acceptance criteria in EARS notation (WHEN/IF/WHILE ...
> THE SYSTEM SHALL ...), numbered, covering watch definitions, polite fetching (robots.txt, per-URL
> minimum interval, honest User-Agent), snapshot storage, semantic diff with normalization
> (whitespace, money, dates), rules (value went up/down, changed, text appeared/disappeared, new list
> item matching a filter), alerts (local outbox default, Amazon SES adapter opt-in), the ghost
> dashboard (each watch is a ghost that glows on change, acknowledge, check now), the bonus-watch app
> and the listing-watch app, and fixture-based testing. (2) design.md with architecture, a mermaid
> diagram, the adapter interfaces in TypeScript, data models, the check-run sequence, error handling
> and testing strategy. (3) tasks.md as a numbered checklist of implementation tasks (- [ ] format)
> that each reference requirement numbers. Follow the steering files exactly. Only write those three
> files; do not create any other files.

**Result:** Kiro read the steering files and drafted all three documents, but every write was refused:

```
tool permission approval is not supported in non-interactive mode. Use --trust-all-tools to auto-approve.
```

The session defaulted to the older engine, whose write tool is not named `fs_write`, so the trust
list did not cover it. Run time was about 5 minutes.

## Call 2: spec generation (three files written)

**Command**

```sh
kiro-cli chat --v3 --no-interactive --trust-workspace \
  --trust-tools=read_file,list_directory,file_search,grep_search,fs_write,fs_append,str_replace \
  "<prompt below>" </dev/null
```

**Prompt:** the same as call 1, with two extra sentences at the end:
"Use the fs_write tool to create each file. Only write those three files; do not create any other
files and do not run shell commands."

**Result:** Kiro read the steering files and wrote the three spec files in parallel:

| File | Size | Contents |
| --- | --- | --- |
| `.kiro/specs/ghost-watcher-kit/requirements.md` | 741 lines | Requirement groups `REQ-WATCH`, `REQ-FETCH`, `REQ-STORE`, `REQ-DIFF`, `REQ-RULES`, `REQ-ALERTS`, `REQ-DASH`, `REQ-BONUS`, `REQ-LISTING`, `REQ-TEST`, `REQ-NF`, each with a user story and EARS acceptance criteria |
| `.kiro/specs/ghost-watcher-kit/design.md` | 508 lines | Architecture, two mermaid diagrams (check-run pipeline, components and ports), TypeScript adapter interfaces, data models, the check-run sequence, error handling, adapter selection and testing strategy |
| `.kiro/specs/ghost-watcher-kit/tasks.md` | 19 sections | A `- [ ]` checklist where every task cites the requirements it satisfies |

Kiro also raised two design decisions on its own, and the code follows both:

1. The per-URL minimum interval belongs in the runner, using the stored snapshot so it survives
   restarts. Host-level politeness (robots.txt cache, User-Agent, timeouts, the per-host lock and
   Crawl-delay) belongs in the fetcher.
2. "Check now" may bypass the per-URL interval as an explicit user action, but it still honors
   robots.txt and the per-host lock.

The run took about 9.5 minutes, including automatic retries when the service rate-limited the
session.

## Hand edits after Kiro

- **REQ-DIFF-09, criterion 2.** Kiro's draft let some rules (`appeared`, `newItem`) fire on the first
  check. During implementation this was changed so the first run records a baseline and fires no
  rules. Otherwise, adding a listings page would alert on every listing already on it. The
  requirement text was edited to match, and `template/test/rules.test.ts` covers it.
- **tasks.md.** Tasks were checked off once code and tests for them passed `npm test`. An
  "Implementation notes" section at the end records where names or shapes differ from the task wording (for example,
  `PoliteFetcher` for `HttpFetcher`, and five ghost states instead of three).
- **structure.md steering.** The app folders were updated to match what was built: watches and
  theme live in `src/app.ts`, there is a `test/` folder in each app, and the Playwright specs are
  in the root `e2e/`.

## Hooks

`.kiro/hooks/` holds three hook files: two command hooks written before call 3, and one agent hook
added by Kiro in call 3.

- `test-on-save.json` (command): on `PostFileSave` of a source or test file, runs
  `npm run typecheck && npm run test:unit`. Call 3 narrowed its matcher (see below).
- `full-suite-on-stop.json` (command): on `Stop`, runs `npm test` (type-check, unit and end-to-end).
- `money-guard.json` (agent): on `PostFileSave` of `normalize.ts`, `diff.ts` or `rules.ts`, restates
  the integer-cents money rule and asks for a unit test.

All three files follow the hook schema in the Kiro documentation (https://kiro.dev/docs/hooks/, checked
2026-11-16): one JSON file per hook group in `.kiro/hooks/`, with `"version": "v1"`, a `hooks`
array, PascalCase `trigger` names (`PostFileSave`, `Stop`), an optional `matcher` regular
expression against the file path, and an `action` of type `command` or `agent`. This is the format that Kiro
IDE 1.0 and Kiro CLI V3 load automatically. The older IDE 0.x `*.kiro.hook` files with `when` and
`then` keys are superseded by it. Before call 3, the hook commands were run by hand during the build
(they are the same `npm` scripts the test suite uses). In call 3 the Stop hook ran on its own.

## Changes after review

A review of a clean clone raised three points, handled by hand without further Kiro calls:

- **Cross-origin writes.** The dashboard now refuses requests whose Host header is not loopback or
  listed in `GHOST_ALLOWED_HOSTS`, and refuses POSTs with a cross-site `Origin` or
  `Sec-Fetch-Site`. Added as REQ-DASH-SEC-01 and task 20.1 in the spec.
- **Placeholder contact URL.** The watcher refuses to start when a watch points at a real
  third-party site while the contact URL is still on a documentation-only domain. Added as
  REQ-FETCH-SEC-01 and task 20.2.
- **First impression.** `demo` mode now takes the baseline at startup and adds a **Let a night
  pass** button, so the first click already shows a change. Added as REQ-DEMO-01 and task 20.3.

## Call 3: spec review, money and contact URL (kiro-cli v3)

- **When:** 2026-11-19, 01:43 to 01:59 UTC (16 min 12 s wall time; exit code 0).
- **Command** (repo root, stdin closed):
  `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=fs_read,fs_write,run_command "<prompt>" </dev/null`
- **Credits used:** 29.75 (`/usage` read 29.38 before the call and 59.13 after).
- **What Kiro did:** audited the spec against the code, rewrote the requirements and design where the build had
  drifted, wrote the integer-cents money change and the contact URL change with their tests, edited the hooks and
  steering files, and ran `npm run typecheck` and `npm run test:unit` itself. When Kiro stopped, the workspace's
  own `full-suite-on-stop.json` hook ran `npm test` (including Playwright), which caught one stale e2e assertion;
  Kiro fixed it in the same session (see "Follow-up" below).
- **After the call (by hand):** full suite re-run: Vitest 156 of 156 (118 before the pass), Playwright 12 of 12.
  Nothing needed fixing.

### Prompt

The prompt as sent, except that two housekeeping sentences about filling in the credit figure and
running Playwright afterwards are shortened to `[...]`.

> You are working in the Ghost Watcher repository (npm workspaces: template, apps/bonus-watch, apps/listing-watch; TypeScript, Vitest, Playwright). Read .kiro/steering/product.md, tech.md and structure.md first and follow them. Work only inside this repository. Do not add, remove or upgrade any npm dependency, do not run npm install, do not use git, and do not deploy or call any network service. Keep wording professional and use invented sample data only (example banks, example.com, 555-01xx numbers).
>
> Do these four jobs in order.
>
> 1. Spec review. Read .kiro/specs/ghost-watcher-kit/requirements.md, design.md and tasks.md and compare them with the code in template/src, apps/*/src and the tests in template/test, apps/*/test and e2e/. Tighten every acceptance criterion into strict EARS form (WHEN / WHILE / IF ... THEN / WHERE ... THE SYSTEM SHALL ...), one testable behavior per criterion, keeping existing requirement IDs so task references stay valid. Where the "Implementation notes" in tasks.md record that the build differs from a requirement, update the requirement or design so they describe what the code really does. Mark a task [x] only if code and a test really implement it. Add a new unchecked task for every gap you find, with its requirement IDs.
>
> 2. Implement two real tasks (add each to tasks.md first, then build it, then check it off):
>    a. Money as integer cents. REQ-DIFF-02 and task 3.2 say money normalizes to { amountMinor, currency }, but template/src/normalize.ts parses money into a floating-point `value` (Number(...) / 100 and Math.round(value * 100) / 100), and template/src/diff.ts computes `delta` with floating-point rounding. Change the money normalizer to produce integer minor units (cents) with no floating-point arithmetic on the parsed digits (parse the whole and fractional digit strings into integers), store and compare money as integer cents, compute money deltas as integer cents, and format cents back to a currency string only at the edge (summary sentences, alert emails, dashboard). Update every consumer (diff, rules wentUp/wentDown and newItem filters such as price lte, summary, alert rendering, the apps' rules and filters) so behavior and the user-visible sentences stay the same. Add Vitest tests proving: "$1,234.56" becomes 123456 cents; "$0.10" plus "$0.20" style comparisons have no float error (for example a change from $0.10 to $0.30 gives a delta of exactly 20 cents); amounts above 2^31 cents still parse exactly; and existing summaries still read the same.
>    b. Placeholder contact URL. apps/bonus-watch/src/app.ts and apps/listing-watch/src/app.ts ship contactUrl values on example.com, a documentation-only domain, so the honest User-Agent names a contact page nobody can visit. template/src/config.ts already refuses to start when a third-party site is watched with a placeholder contact. Make this clean: the apps must not present an example.com URL as if it were a real contact. Choose the smallest clear design, for example: make the app-level contactUrl optional; WHEN every watched URL is on a loopback or reserved host (the fixture and demo setups) the User-Agent uses an explicit local-only contact token that clearly says so; IF any watch targets a real host and GHOST_CONTACT_URL is unset or a placeholder THEN config refuses to start with the existing clear message. Update the apps, config, README text that mentions the contact URL, the requirement (REQ-FETCH-02 / REQ-FETCH-SEC-01) and the implementation notes, and add Vitest tests for each branch.
>    Keep `npm run typecheck` green; template code must stay importable from the apps only through @ghost-watcher/template.
>
> 3. Hooks. Kiro's current hook format is .kiro/hooks/<name>.json with "version": "v1" and a "hooks" array (fields: name, description, trigger in PascalCase such as PostFileSave or Stop, matcher regex against the file path, action with type "command" + command or type "agent" + prompt, timeout in seconds, enabled). Check the two files in .kiro/hooks/ against that format and fix anything invalid. The test-on-save matcher "\\.(ts|js)$" also fires for files outside the source tree; narrow it to template/, apps/ and e2e/ source and test files. Add one agent hook, money-guard.json, that fires on edits to template/src/normalize.ts, diff.ts or rules.ts and re-states the integer-cents rule and asks for a unit test. Keep the steering files accurate: update tech.md / structure.md / product.md where anything you changed makes them wrong (for example the money representation).
>
> 4. Append a new section [...] to KIRO-LOG.md listing: each spec change (criteria tightened, tasks checked, tasks added), each source and test file you changed and why, the hook changes, and anything you could not do. [...]
>
> If run_command is available, run `npm run typecheck` and `npm run test:unit` when you finish and fix any failures you caused. [...]

### Spec changes

- **Requirements (`requirements.md`).** Every acceptance criterion is now one sentence in strict EARS
  form (WHEN, WHILE, IF ... THEN, WHERE or ubiquitous, each with THE SYSTEM SHALL) and states one
  testable behavior. Requirement IDs are unchanged. The first draft's "Tests SHALL ..." and mixed
  criteria were rewritten or split. Requirements that the build had changed now describe the code:
  - REQ-FETCH-01 (robots refusal is a `blocked` outcome, not `skipped`; no allow-on-failure opt-in),
    REQ-FETCH-03 (the interval runs from the last attempt; Crawl-delay is a gap between requests),
    REQ-FETCH-05 (back-off, 429/503, layout-changed errors), REQ-STORE-01 to 03 (`BlobStore` and
    `GhostStore`, not `SnapshotStore`), REQ-DIFF-05 (percent is percentage points, not a ratio),
    REQ-DASH-03 to 06 (five ghost states, `acknowledgedAt`, real endpoints), REQ-DASH-08 (ports 3138
    and 3139), REQ-ALERTS-01 (`deliver`, not `send`), REQ-WATCH-02 and 04 (`url` kind, `pattern`,
    `itemRemoved`, `itemChanged`).
  - New requirements: REQ-STORE-05 (legacy money snapshots), REQ-RULES-08 (`itemRemoved`,
    `itemChanged`), REQ-RULES-09 (severity), REQ-ALERTS-06 (one message per check, delivery
    failures).
  - Money and contact URL: REQ-DIFF-02 (integer cents, exact deltas, no rounding past the safe
    range), REQ-RULES-01, 02 and 06 (`minDelta` and filter targets compared exactly), REQ-FETCH-02
    (optional contact URL, local-only User-Agent) and REQ-FETCH-SEC-01 (refusal rules).
- **Design (`design.md`).** Rewritten to match the code: module layout, `FetchOutcome`, `BlobStore` and
  `GhostStore`, the `Value` and `Diff` types, the runner sequence with back-off, the dashboard routes
  and ghost states, the contact URL policy (section 4.2), the money rules (section 7) and the test
  plan. It no longer claims a `dashboard-state.json` file or a `SnapshotStore` port.
- **Tasks (`tasks.md`).**
  - Checked: 3.2 and the two new tasks 21.1 (money) and 21.2 (contact URL), after code and tests
    landed. New task 6.9 (`itemRemoved`, `itemChanged`, severities) is checked because code and tests
    exist.
  - Unchecked on review: 19.3 (later checked: the full-suite run passed after one fix) and 19.4 (one config
    test builds the real AWS SDK clients, which breaks REQ-TEST-06.1).
  - Reworded to match the code: 2.1, 3.5, 5.2, 6.6, 9.2, 9.4, 10.1 to 10.4, 11.5, 12.2, 14.3, 14.4,
    17.2, 17.4, 18.2, 18.4, 19.5, 20.2, and the intro of the implementation notes.
  - Added, unchecked: 21.3 (duplicate watch ids test), 21.4 (apps import only the public API test),
    21.5 (no raw HTML in snapshots test), 21.6 (injectable cloud client factory, fake clients in the
    config test), 21.7 (restart tests for interval and acknowledgment), 21.8 (in-flight card state
    test), 21.9 (palette contrast test), 21.10 (JSDoc `any` in `template/src/ui/*.js`), 21.11
    (User-Agent shown in startup output and the dashboard footer).
  - Implementation notes now record the money, contact URL, percent, `wentUp` and dates, robots
    outcomes, acknowledgment, demo ports and test-gap differences.

### Source and test files changed

- `template/src/normalize.ts`: money is `{ amountMinor, currency, display }`. Digit strings are parsed
  into integers with `BigInt` (`minorFromDigits`, `parseMoney`, `minorFromDecimal`); amounts beyond
  `Number.MAX_SAFE_INTEGER` cents fall back to text. `formatMinor` replaces `formatMoney` and formats
  with integer division. `compareMinorToMajor` and `compareToTarget` compare cents with a target in
  dollars exactly. `upgradeStoredValue` converts legacy decimal money. `canonical` uses cents.
  Why: REQ-DIFF-02 and task 3.2 required integer cents; the code used floats.
- `template/src/diff.ts`: money deltas are exact integer cents (no rounding).
- `template/src/rules.ts`: filters use `compareToTarget`; `minDelta` for money is converted exactly
  (`meetsMinDelta`). App-facing units (dollars) are unchanged.
- `template/src/summary.ts`: the money delta in sentences uses `formatMinor`; sentences read the same.
- `template/src/store/ghost-store.ts`: snapshots read from the store are upgraded from decimal money,
  so existing `.ghost-data` folders raise no false change after the upgrade. (Not in the request;
  added to protect "signal, not noise".)
- `template/src/fetcher.ts`, `template/src/app.ts`, `template/src/config.ts`, `template/src/index.ts`:
  `contactUrl` is optional; `buildUserAgent` takes `localOnly` and `LOCAL_ONLY_CONTACT` is exported;
  `loadDeps` never sends a placeholder contact, uses the local-only token when every watch is on a
  loopback or reserved host, and refuses to start for a real host without a real contact URL.
- `apps/bonus-watch/src/app.ts`, `apps/listing-watch/src/app.ts`: removed the `example.com`
  `contactUrl`.
- Tests: new `template/test/money.test.ts` (123456 cents, float traps, exact 20 cent delta, amounts
  above 2^31 cents and at the safe limit, exact filters and `minDelta`, legacy upgrade, unchanged
  summaries); rewrote the contact URL tests in `template/test/guard.test.ts` (every branch); added a
  `buildUserAgent` local-only test in `politeness.test.ts`; adjusted `adapters.test.ts`,
  `extract-diff.test.ts`, `normalize.test.ts`, `runner-server.test.ts` for cents and the new User-Agent;
  added contact URL tests to both app test files and updated their money assertions.
- Docs: `README.md` (contact URL and hooks text), `template/README.md` (example without a contact URL,
  money and `wentUp` notes), `docs/demo-script.md` (User-Agent line).
- Steering: `tech.md` (money representation, User-Agent and contact rules), `structure.md`
  (`normalize.ts`, `guard.ts`, demo ports, hooks), `product.md` (User-Agent wording).

### Hook changes

- `test-on-save.json`: the matcher was `\.(ts|js)$`, which also fired for config files, `node_modules`
  and `.ghost-e2e` output. It is now `(^|/)(template/(src|test)|apps/[^/]+/(src|test|fixtures)|e2e)/.*\.(ts|js)$`
  (checked against sample paths). Added `"enabled": true`.
- `full-suite-on-stop.json`: already valid for schema `v1` (PascalCase `Stop`, `command` action,
  timeout in seconds). Added `"enabled": true` only.
- `money-guard.json` (new): an `agent` hook on `PostFileSave` for `template/src/normalize.ts`,
  `diff.ts` and `rules.ts`. Its prompt restates the integer-cents rule and asks for a unit test.
- Kiro checked the hooks against the field list in the prompt. Checked afterwards against the Kiro
  documentation (https://kiro.dev/docs/hooks/, 2026-11-18): all three files use documented fields and
  the documented `command` and `agent` action types.

### Not done

- Section 21 tasks 21.3 to 21.11 are recorded but not built; they are gaps found in review, outside
  the two requested implementation tasks. Task 19.4 stays open until 21.6 is done.
- The README screenshots in `docs/` were not regenerated.
- Verified at the end of this pass: `npm run typecheck` and `npm run test:unit` pass.

### Follow-up after the Stop hook's full-suite run

- `e2e/bonus-watch.spec.ts` still expected the old `example.com` User-Agent; it now expects the
  local-only token. The bonus-watch spec passes, the other 11 e2e tests passed in the full run, and
  task 19.3 is checked.

## Calls 4 to 7: Seal the pact, built by Kiro (kiro-cli 3.5, 2026-11-19)

Seal the pact was built by Kiro from a spec Kiro wrote. The developer ran each session, ran every
check from a fresh clone, read the diffs, re-took the screenshots and committed between sessions.
Each transcript holds the exact prompt and Kiro's full output. One date assumption in a Kiro-written
test surfaced three days later (see call 8): the developer loosened one assertion by hand (5 lines
added, 2 removed), and Kiro then fixed the cause.

| Call | What Kiro did | Time | Credits | Lines Kiro added | Transcript |
|---|---|---|---|---|---|
| 4: e2e ports | Put every Playwright port in `e2e/ports.ts` behind `GHOST_E2E_PORT` (default 3134), with tests; no spec hardcodes a port | 2 min 17 s | 1.59 | 114 | [session 1](docs/kiro-sessions/session-1-e2e-ports.md) |
| 5: spec | Wrote `.kiro/specs/seal-the-pact/`: 11 requirements, 91 EARS criteria, a design naming the real modules, and 27 tasks in two sessions with a traceability table | 7 min 59 s | 11.20 | 967 | [session 2](docs/kiro-sessions/session-2-seal-the-pact-spec.md) |
| 6: tasks 1-13 | `pact.ts`, `sealing.ts`, pact storage in `GhostStore`, the runner's pact comparison, pact-dated dispute packs and the bonus-match letter; 86 new Vitest tests | 8 min 33 s | 17.49 | 2,003 | [session 3](docs/kiro-sessions/session-3-pact-domain.md) |
| 7: tasks 14-27 | Routes, the "I applied today" button, sealed chip, pact section, confirm panels, demo seeding 40 days back, README paragraph; 34 Vitest and 10 Playwright tests, including axe scans | 11 min 42 s | 24.26 | 1,556 | [session 4](docs/kiro-sessions/session-4-pact-dashboard.md) |

- **Command** (repo root, stdin closed): `GHOST_E2E_PORT=3840 kiro-cli chat --v3 --no-interactive
  --trust-workspace --trust-tools=fs_read,fs_write,run_command[,@context7] "<prompt>" </dev/null`.
- **Credits:** 54.54 for calls 4 to 7 (52.95 for the three Seal the pact calls 5 to 7, plus 1.59 for
  the ports call), read with `/usage` before and after each call.
- **Who wrote what:** Kiro wrote all 4,640 added lines across the four calls (git, excluding the
  transcripts). On build day the developer changed none of them; the one later hand change is in
  call 8. The developer's own additions were the session transcripts in `docs/kiro-sessions/`
  and this log.
- **Kiro's judgement calls**, all in the transcripts: a pact whose snapshot file is missing must not
  block a new seal (a test caught it, and Kiro changed the read); a restored pack keeps today's text
  with the date filled; listing-watch's API stays byte-identical because it does not turn pacts on.
- **Decisions the developer made** on the spec's four open questions: keep Kiro's defaults. Packs use
  the stored URL (display-host rewriting is a separate item), the demo pact has no archived copy,
  sealing uses the latest stored reading, and alerts keep a copy of the pact.
- **Tests:** Vitest 224 to 348, Playwright 17 to 27, all from a fresh clone with
  `GHOST_E2E_PORT=3840`.
- **Screenshots:** Kiro screenshotted its own UI and fixed a hash that wrapped on the sealed stone.
  The developer re-took the demo at 1360 px and 390 px: the pack reads "Oct 10, 2026, the day you
  applied" against "Nov 19, 2026: what it says now", with no horizontal scroll.
- **Open:** packs in the demo still show the fixture host `127.0.0.1:<port>` rather than a display
  name, which is a separate item. Haunted Listings does not use pacts yet.

## Calls 8 and later (kiro-cli 3.5, 2026-11-22)

Each call ran headless with `--output-format stream-json`, so every transcript keeps each tool
call's arguments and exit code, and each call made real context7 MCP calls. The developer reran
the full suite before every commit and from a fresh clone before every push.

<!-- kiro-calls:start -->
| Call | What Kiro did | Time | Credits | Lines Kiro added | MCP calls | Transcript |
|---|---|---|---|---|---|---|
| 8: test clock | Gave every Kiro-written test reading the manual clock, added a clock-hygiene test and the scoped `testing.md` steering | 6.5 min | 11.33 | 196 | 6 | [session 5](docs/kiro-sessions/session-5-test-clock.md) |
| 9: pact copy | Requirement 12 of seal-the-pact: plainer pact notes and letters, a display address in letters, the turned-away stone, a dated demo archive copy, `pact.md` steering and the `pact-keeper` agent | 19.7 min | 37.56 | 1,068 | 8 | [session 6](docs/kiro-sessions/session-6-pact-copy.md) |
<!-- kiro-calls:end -->
