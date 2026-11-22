---
inclusion: fileMatch
fileMatchPattern: "**/{test,e2e}/**"
---

# Testing rules

Loaded when a file under a `test/` folder or under `e2e/` is open.

## Time

- Build every `PoliteFetcher`, `Runner`, `SavePageNowArchiver` and `loadDeps` call in a test with
  `clock: manualClock('<fixed instant>')`. One clock per test, shared by all of them.
- Never use `systemClock`, `Date.now()` or `new Date()` in a test's runner, fetcher, archiver or
  assertions. The fetcher stamps every reading with `fetchedAt`, so one real clock in the chain
  puts the day the test ran into a letter or an alert.
- No wall-clock dates in assertions. Write the fixed date the test clock gives
  (`'Nov 19, 2026'`), never a date computed from the current day.
- `template/test/clock-hygiene.test.ts` fails, naming file and line, when a test builds a fetcher or
  runner without a clock.

### Why a manual clock and not Vitest fake timers

The code takes a `Clock` port, so a test passes the clock in. `vi.useFakeTimers()` and
`vi.setSystemTime()` also work, but they patch the global `Date` for the whole process: Vitest's own
guide says "mocked values do not automatically reset between tests" and that `vi.setSystemTime`
"will affect date related API like `hrtime`, `performance.now` or `new Date()`". A global patch can
leak into the next test and into the fixture server and real socket timeouts these tests rely on.
An injected clock is local to one object, needs no reset, and fails loudly (the hygiene test) when
it is forgotten.

## Names, ports and network

- Name the EARS criterion numbers in the test title, for example `(PACT 8.6) ...`.
- E2e ports come from `e2e/ports.ts` (`GHOST_E2E_PORT`). Run Playwright with an explicit
  `GHOST_E2E_PORT`, never the defaults. No spec or config hardcodes a port.
- Tests never call the network outside `127.0.0.1`. Use the fixture servers and stand-in archives.
