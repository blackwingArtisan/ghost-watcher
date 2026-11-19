---
inclusion: always
---

# Structure

```
/template                 the skeleton (package "@ghost-watcher/template")
  src/
    watch.ts              watch definitions and field specs (types + defineWatch helper)
    normalize.ts          whitespace, money (integer cents), number, date, percent, url normalizers
    extract.ts            HTML -> watched values (fields and lists) using cheerio
    diff.ts               semantic diff of two extracted snapshots
    rules.ts              rule builders (wentUp, wentDown, changed, appeared, disappeared, newItem)
    robots.ts             robots.txt parser and matcher
    fetcher.ts            Fetcher port + PoliteFetcher (robots, rate limit, User-Agent)
    store/                BlobStore port (memory, file, S3) + GhostStore for snapshots and alerts
    alerts/               AlertSink port + outbox, console, SES and webhook adapters
    runner.ts             check runner: fetch -> extract -> diff -> rules -> alerts -> store
    summary.ts            plain-English sentences for changes
    history.ts            HistorySource port + Wayback CDX adapter (the Ghost of Terms Past)
    receipts.ts           snapshot hashes + PageArchiver port (Save Page Now) for shrieks
    pact.ts               pact types and the pure comparison of a page with the sealed pact
    sealing.ts            sealPact, breakPact and seedDemoPacts ("I applied today")
    noise.ts              page fingerprints, to count the noise a ghost slept through
    guard.ts              Host and Origin checks for the dashboard
    server.ts             dashboard HTTP server and JSON API
    ui/                   dashboard client script, shared renderer and stylesheet
    testing/              fixture site server, noise ratio and archive replay (export "./testing")
    view.ts               dashboard view model (ghost states, field rows, feed)
    app.ts                defineApp: name, copy, theme and watches for one app
    clock.ts              Clock port: system clock and a manual clock for tests
    cli.ts                `check` and `serve` commands shared by every app
    config.ts             environment-driven adapter selection
    index.ts              public API
  test/                   unit tests for the template
  README.md               how to build an app on the skeleton
/apps/bonus-watch         app 1: sign-up bonus terms watcher
  src/app.ts              watch definitions, copy and palette for invented example banks
  src/main.ts             CLI entry (check, serve, demo, list)
  fixtures/               local fixture site (versioned pages + robots.txt) and its server
  test/                   Vitest tests: per-version alerts and a CLI end-to-end run
/apps/listing-watch       app 2: listings and permits watcher (same layout)
/e2e                      Playwright end-to-end specs that drive both dashboards
/.kiro                    steering, specs and hooks used to build this repo
  hooks/                  test-on-save, full-suite-on-stop and money-guard (JSON, schema v1)
```

## Conventions

- Apps import only from `@ghost-watcher/template`; never from template internals.
- Fixture servers serve numbered versions of each page (`v1`, `v2`, ...) and expose
  `POST /__fixture/advance` and `GET /__fixture/log` for tests.
- Data written at runtime goes to `<app>/.ghost-data/` (git-ignored).
- Ports: bonus-watch dashboard 3130, fixtures 3131; listing-watch dashboard 3132, fixtures 3133;
  e2e runs use 3134 to 3137, and the demo-mode e2e run uses 3138 and 3139.
