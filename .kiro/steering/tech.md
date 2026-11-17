---
inclusion: always
---

# Tech rules

## Stack

- TypeScript (strict), ES modules, Node.js 20 or newer. npm workspaces; one lockfile at the root.
- Runtime TypeScript via `tsx`; `tsc --noEmit` is the type check.
- HTML parsing with `cheerio`. No headless browser in the watcher itself.
- Server: `node:http` only, no web framework. The dashboard is server-rendered HTML plus one small
  vanilla JavaScript module. No front-end build step.
- Tests: Vitest for unit and integration tests, Playwright for end-to-end tests of each app.

## Adapters (ports and adapters)

Every external effect goes through a small interface with a free local default:

| Port | Local default (used by tests and dev) | Real adapter (written, opt-in) |
|---|---|---|
| `Fetcher` | `HttpFetcher` against local fixture servers | same `HttpFetcher` against live sites |
| `SnapshotStore` | `JsonFileSnapshotStore`, `MemorySnapshotStore` | `S3SnapshotStore` (AWS SDK v3) |
| `AlertSink` | `OutboxAlertSink` (JSON lines + rendered email files) | `SesEmailAlertSink` (Amazon SES v2) |
| `Clock` | `systemClock`, `fixedClock` in tests | n/a |

Adapters are chosen by environment variables (`GHOST_STORE`, `GHOST_ALERTS`). The default is always
the local adapter. Tests never construct a real cloud client and never touch the network beyond
`127.0.0.1`.

## Politeness rules (non-negotiable)

- Fetch and honor `robots.txt` for the watcher's User-Agent token before any page fetch; cache it.
- Minimum interval between checks of the same URL defaults to 6 hours; honor `Crawl-delay`.
- User-Agent: `GhostWatcher/<version> (+<contact url>)`.
- Timeouts on every request; at most one request per host at a time.
- The contact URL must be a page a site operator can visit; placeholder domains are only for the
  local fixture sites.

## Dashboard safety

- The dashboard answers only to loopback Host headers plus `GHOST_ALLOWED_HOSTS`.
- State-changing requests must come from the dashboard's own origin.

## Code style

- Pure functions for normalize, extract, diff and rules; side effects live in adapters and the runner.
- No `any`. Prefer discriminated unions for results (`ok` / `skipped` / `error`).
- Small modules with one responsibility. Public API is re-exported from `template/src/index.ts`.
- Professional wording in code and docs. Sample data uses invented names, `example.com` emails and
  555-01xx phone numbers.

## Testing rules

- Every rule and normalizer has unit tests, including noise cases that must not alert.
- Each app has an end-to-end test that drives the real dashboard against a local fixture server,
  changes the fixture, and asserts that the ghost glows and an alert reaches the outbox.
- Never scrape live sites in tests.
