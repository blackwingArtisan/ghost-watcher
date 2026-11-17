# Tasks: Ghost Watcher Kit

Numbered implementation checklist. Each task references the requirement(s) it satisfies. Tasks are
grouped to mirror `design.md` and `structure.md`. Checkboxes use `- [ ]`.

## 1. Project scaffolding

- [x] 1.1 Initialize the npm workspaces repo at the root with a single lockfile; add packages
      `template`, `apps/bonus-watch`, and `apps/listing-watch`. (REQ-NF-02)
- [x] 1.2 Configure strict TypeScript (ES modules, target Node 20+), `tsx` for runtime, and
      `tsc --noEmit` as the type check; add Vitest and Playwright. (REQ-NF-01)
- [x] 1.3 Add cheerio as the HTML parser dependency; confirm no headless browser is introduced.
      (REQ-NF-01)
- [x] 1.4 Add a root `.gitignore` that ignores `<app>/.ghost-data/`. (REQ-NF-05)
- [x] 1.5 Create the `@ghost-watcher/template` package skeleton with `src/index.ts` re-exporting the
      public API. (REQ-WATCH-05, REQ-NF-02)

## 2. Watch definitions (watch.ts)

- [x] 2.1 Define `FieldKind`, `FieldSpec`, `ListFieldSpec`, `ListSpec`, `ItemFilter`, `Rule`, and
      `Watch` types. (REQ-WATCH-01, REQ-WATCH-02, REQ-WATCH-03, REQ-WATCH-04)
- [x] 2.2 Implement `defineWatch` with validation: required fields, unique ids in a registry, and a
      default `intervalMs` of six hours when omitted. (REQ-WATCH-01)
- [x] 2.3 Export `defineWatch` and the types from `index.ts`. (REQ-WATCH-05)

## 3. Normalizers (normalize.ts)

- [x] 3.1 Implement the whitespace normalizer (collapse and trim). (REQ-DIFF-01)
- [x] 3.2 Implement the money normalizer to `{ amountMinor, currency }`. (REQ-DIFF-02)
- [x] 3.3 Implement the number normalizer ignoring grouping separators. (REQ-DIFF-03)
- [x] 3.4 Implement the date normalizer to canonical `YYYY-MM-DD`. (REQ-DIFF-04)
- [x] 3.5 Implement the percent normalizer to a canonical ratio. (REQ-DIFF-05)
- [x] 3.6 Implement the URL normalizer that strips tracking query parameters. (REQ-DIFF-06)
- [x] 3.7 Implement the unparseable-value fallback to `text`. (design.md §7)
- [x] 3.8 Add unit tests for each normalizer covering equality, inequality, and noise cases that must
      not produce spurious inequality. (REQ-TEST-03)

## 4. Extraction (extract.ts)

- [x] 4.1 Implement field extraction via cheerio, supporting text and attribute reads. (REQ-WATCH-02)
- [x] 4.2 Implement list extraction: select item containers, read each item's fields, and compute the
      `identity` key from `identityBy`. (REQ-WATCH-03)
- [x] 4.3 Apply the correct normalizer to each extracted value by kind (or spec override) to produce
      `Normalized` values. (REQ-DIFF-01 through REQ-DIFF-06)
- [x] 4.4 Add unit tests using fixture HTML snippets for fields, attribute reads, and lists.
      (REQ-TEST-04)

## 5. Diff (diff.ts)

- [x] 5.1 Implement field diff producing `added`, `removed`, and `changed` changes with normalized
      before/after values. (REQ-DIFF-07)
- [x] 5.2 Implement list diff producing `itemAdded` and `itemRemoved` by item identity. (REQ-DIFF-07)
- [x] 5.3 Implement the first-run baseline by diffing against an empty previous snapshot.
      (REQ-DIFF-09)
- [x] 5.4 Keep `diff` a pure function with no side effects. (REQ-DIFF-08)
- [x] 5.5 Add unit tests covering all change types, the first-run baseline, and noise cases that assert
      no change. (REQ-TEST-03)

## 6. Rules (rules.ts)

- [x] 6.1 Implement `wentUp` for numeric and money field changes. (REQ-RULES-01)
- [x] 6.2 Implement `wentDown` for numeric and money field changes. (REQ-RULES-02)
- [x] 6.3 Implement `changed` for any field value change. (REQ-RULES-03)
- [x] 6.4 Implement `appeared` for fields that were absent and are now present. (REQ-RULES-04)
- [x] 6.5 Implement `disappeared` for fields that were present and are now absent. (REQ-RULES-05)
- [x] 6.6 Implement `newItem` with `ItemFilter` support (`eq`, `lte`, `gte`, `contains`) over list
      additions. (REQ-RULES-06)
- [x] 6.7 Keep rule builders pure functions of a diff. (REQ-RULES-07)
- [x] 6.8 Add unit tests for each builder covering fire and no-fire cases, plus noise cases that assert
      no alert. (REQ-TEST-03)

## 7. Summary (summary.ts)

- [x] 7.1 Implement the plain-English sentence builder that names what changed, from what to what,
      and which rule fired. (REQ-ALERTS-04)
- [x] 7.2 Add unit tests asserting summaries are single sentences a non-developer can understand.
      (REQ-TEST-04)

## 8. robots.txt (robots.ts)

- [x] 8.1 Implement the robots.txt parser (groups, User-agent tokens, Allow/Disallow, Crawl-delay).
      (REQ-FETCH-01, REQ-FETCH-03)
- [x] 8.2 Implement the matcher for a URL and User-Agent token. (REQ-FETCH-01)
- [x] 8.3 Add unit tests against fixture robots.txt content, including disallow and crawl-delay cases.
      (REQ-TEST-04)

## 9. Fetcher (fetcher.ts)

- [x] 9.1 Define the `Fetcher` port and the `FetchResult` discriminated union (`ok`/`skipped`/`error`).
      (REQ-FETCH-01)
- [x] 9.2 Implement `HttpFetcher`: fetch and cache robots.txt, enforce the User-Agent, apply request
      timeouts, and hold a per-host concurrency lock. (REQ-FETCH-01, REQ-FETCH-02, REQ-FETCH-04)
- [x] 9.3 Honor `Crawl-delay` between requests to the same host. (REQ-FETCH-03)
- [x] 9.4 Return `skipped` with reason `robots` when disallowed, and `error` on network/timeout/non-2xx
      without retrying within the run. (REQ-FETCH-01, REQ-FETCH-05)
- [x] 9.5 Add unit/integration tests using a local fixture robots.txt and pages on `127.0.0.1`.
      (REQ-TEST-04, REQ-TEST-02)

## 10. Snapshot store (store/)

- [x] 10.1 Define the `SnapshotStore` port and the `Snapshot` data model. (REQ-STORE-01, REQ-STORE-04)
- [x] 10.2 Implement `MemorySnapshotStore` for tests. (REQ-STORE-02)
- [x] 10.3 Implement `JsonFileSnapshotStore` writing under `<app>/.ghost-data/snapshots/`. (REQ-STORE-02)
- [x] 10.4 Implement `S3SnapshotStore` using AWS SDK v3, constructed lazily only when selected.
      (REQ-STORE-03)
- [x] 10.5 Add unit tests for the local stores (round-trip a snapshot); do not construct a real S3
      client. (REQ-TEST-04, REQ-TEST-06)

## 11. Alerts (alerts/)

- [x] 11.1 Define the `AlertSink` port and the `Alert` data model. (REQ-ALERTS-01, REQ-ALERTS-05)
- [x] 11.2 Implement `OutboxAlertSink` writing JSON Lines and rendered email files under
       `<app>/.ghost-data/outbox/`. (REQ-ALERTS-02)
- [x] 11.3 Implement `ConsoleAlertSink` for dev use. (REQ-ALERTS-02)
- [x] 11.4 Implement `SesEmailAlertSink` using Amazon SES v2, constructed lazily only when selected.
       (REQ-ALERTS-03)
- [x] 11.5 Add unit tests for the local sinks against a temp outbox; do not construct a real SES
       client or send email. (REQ-TEST-04, REQ-TEST-06)

## 12. Clock and config (config.ts)

- [x] 12.1 Define the `Clock` port and provide `systemClock` and `fixedClock`. (REQ-NF-01, design §4.1)
- [x] 12.2 Implement environment-driven adapter selection: require `GHOST_CONTACT_URL`, and select the
       store and sink from `GHOST_STORE` and `GHOST_ALERTS`, defaulting to local. (REQ-FETCH-02,
       REQ-STORE-03, REQ-ALERTS-03, REQ-NF-04)
- [x] 12.3 Build the `Deps` bundle shared by the runner and server. (design §11)

## 13. Check runner (runner.ts)

- [x] 13.1 Implement `runCheck(watch, deps, opts?)` performing the full check-run sequence, including
       the per-URL interval gate using the stored previous snapshot and the injected clock.
       (REQ-FETCH-03, design §6)
- [x] 13.2 Wire the robots gate through the `HttpFetcher` and return `skipped` with reason `robots`.
       (REQ-FETCH-01)
- [x] 13.3 Return `error` on fetch failure without retrying and without alerting. (REQ-FETCH-05)
- [x] 13.4 Run extract -> normalize -> snapshot -> diff -> rules -> summarize -> alerts -> store, and
       return `CheckResult`. (REQ-DIFF-07, REQ-RULES-01 through REQ-RULES-06, REQ-ALERTS-01 through
       REQ-ALERTS-05)
- [x] 13.5 Implement `runAll(watches, deps)` to check every watch in a registry. (design §6)
- [x] 13.6 Add Vitest integration tests covering `ok`, `skipped` (`interval`, `robots`), and `error`
       paths with a fake fetcher and `MemorySnapshotStore`. (REQ-TEST-04)

## 14. Dashboard server (server.ts) and UI (ui/)

- [x] 14.1 Implement the `node:http` dashboard server with server-rendered HTML and no web framework.
       (REQ-DASH-01)
- [x] 14.2 Render one ghost card per watch showing name, URL, last check time, and last check status.
       (REQ-DASH-02)
- [x] 14.3 Derive ghost state (`dormant`/`glowing`/`error`) from the outbox and a local
       `dashboard-state.json` file, rendering the glow for unacknowledged alerts. (REQ-DASH-03)
- [x] 14.4 Implement `POST /api/ghosts/:id/acknowledge` marking alerts acknowledged and persisting it.
       (REQ-DASH-04)
- [x] 14.5 Implement `POST /api/ghosts/:id/check` triggering "check now" with `force: true`, honoring
       robots and concurrency, with an in-flight card state. (REQ-DASH-05)
- [x] 14.6 Implement the JSON API endpoints for ghosts, alerts, acknowledge, and check now.
       (REQ-DASH-06)
- [x] 14.7 Implement the haunted theme with readable contrast, keyboard operability, and a
       `prefers-reduced-motion` path that disables glow animation. (REQ-DASH-07)
- [x] 14.8 Add tests for server routing and state transitions. (REQ-TEST-04)

## 15. CLI (cli.ts)

- [x] 15.1 Implement the `check` command that runs the runner for all watches. (design §6)
- [x] 15.2 Implement the `serve` command that starts the dashboard on the configured port. (REQ-DASH-08)

## 16. Public API and docs

- [x] 16.1 Finalize `index.ts` to re-export watches, normalizers, extract, diff, rules, robots,
       fetcher, stores, alerts, clock, runner, summary, server, and CLI. (REQ-WATCH-05)
- [x] 16.2 Write `template/README.md` explaining how to build an app on the skeleton using only the
       public API. (REQ-WATCH-05)

## 17. bonus-watch app

- [x] 17.1 Create the app package importing only from `@ghost-watcher/template`. (REQ-BONUS-06)
- [x] 17.2 Implement `src/watches.ts` with invented example banks and bonus fields: bonus amount
       (money), minimum deposit (money), deadline (date), fine print (text). (REQ-BONUS-01,
       REQ-BONUS-02)
- [x] 17.3 Attach rules: `wentUp`/`wentDown` on bonus amount, `changed` on deadline and fine print,
       `appeared`/`disappeared` where meaningful. (REQ-BONUS-03)
- [x] 17.4 Implement `src/theme.ts` with dashboard copy and palette. (REQ-BONUS-01, REQ-DASH-07)
- [x] 17.5 Build the fixture site serving numbered bonus page versions plus robots.txt and the
       `POST /__fixture/advance` and `GET /__fixture/log` endpoints. (REQ-BONUS-04, REQ-TEST-01)
- [x] 17.6 Configure dashboard port 3130 and fixtures port 3131. (REQ-DASH-08)
- [x] 17.7 Add no-financial-advice copy to the dashboard and README. (REQ-BONUS-07)
- [x] 17.8 Add a Playwright end-to-end test that advances the fixture and asserts the ghost glows and
       an alert reaches the outbox. (REQ-BONUS-05, REQ-TEST-05)

## 18. listing-watch app

- [x] 18.1 Create the app package importing only from `@ghost-watcher/template`. (REQ-LISTING-06)
- [x] 18.2 Implement `src/watches.ts` with apartment listings and city building permits as lists with
       item field specs and `identityBy`. (REQ-LISTING-01)
- [x] 18.3 Add `newItem` rules with filters for price, beds, and neighborhood on listings, and permit
       type on permits. (REQ-LISTING-02, REQ-LISTING-03)
- [x] 18.4 Implement `src/theme.ts` with dashboard copy and palette. (REQ-DASH-07)
- [x] 18.5 Build the fixture site serving numbered listing and permit page versions plus robots.txt and
       the advance/log endpoints. (REQ-LISTING-04, REQ-TEST-01)
- [x] 18.6 Configure dashboard port 3132 and fixtures port 3133. (REQ-DASH-08)
- [x] 18.7 Add a Playwright end-to-end test that advances the fixture to a new matching item and asserts
       the ghost glows and an alert reaches the outbox. (REQ-LISTING-05, REQ-TEST-05)

## 19. Final verification

- [x] 19.1 `tsc --noEmit` passes for the whole workspace. (REQ-NF-01)
- [x] 19.2 `vitest` unit and integration tests pass for the template. (REQ-TEST-03, REQ-TEST-04)
- [x] 19.3 `playwright` end-to-end tests pass for both apps. (REQ-TEST-05)
- [x] 19.4 Confirm no test scrapes a live site or constructs a real cloud client; all tests run only
       against `127.0.0.1`. (REQ-TEST-02, REQ-TEST-06)
- [x] 19.5 Confirm the default run uses only local adapters with no environment variables beyond the
       required `GHOST_CONTACT_URL`. (REQ-NF-04, REQ-FETCH-02)

## Implementation notes

Every task above is implemented and covered by `npm test`. Where the build differs from the
wording of a task, the difference is recorded here so the spec and the code stay in step.

- **Names.** `HttpFetcher` is `PoliteFetcher`; `fixedClock` is `manualClock` (it can also advance
  and records how long the fetcher slept). The snapshot store is two layers: a small `BlobStore`
  port (memory, file and S3 adapters) and `GhostStore`, which keeps snapshots, status and alerts
  on top of any blob store.
- **Fetch outcomes.** `FetchOutcome` is `ok`, `blocked` (robots.txt said no) or `error`. The runner
  turns these into a `CheckResult` of `baseline`, `unchanged`, `changed`, `skipped`, `blocked` or
  `error`.
- **First run.** The first check records a baseline and fires no rules (REQ-DIFF-09, revised).
- **Back-off.** After an error the runner waits 15 minutes, doubling per consecutive error, up to
  24 hours, before trying the URL again.
- **Ghost states.** The dashboard uses five states instead of three: `unborn` (never checked),
  `dormant`, `restless` (unacknowledged alerts, the glow), `blocked` (robots.txt) and `lost`
  (errors or a page whose layout changed).
- **App layout.** Each app keeps its watches, copy and palette together in `src/app.ts`; the
  Playwright specs live in the root `e2e/` folder and each app has Vitest tests in `test/`.
- **Contact URL.** Each app ships a default contact URL; `GHOST_CONTACT_URL` overrides it, and the
  config refuses to start without one.
- **Cloud adapters.** Tests exercise `S3BlobStore` and `SesEmailAlertSink` with fake clients. One
  config test lets `loadDeps` construct the real AWS SDK clients to prove the wiring, but nothing
  ever calls `send` on them.
