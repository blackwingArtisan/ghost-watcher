# Real pages

Everything in this repository runs against invented fixture sites. This page is the procedure for
measuring Ghost Watcher on real pages, in two steps: replay the pages' history from the Internet
Archive, then watch them live for a week.

Both steps need a contact URL a person can visit, such as this repository's public page, because the
watcher names it in its User-Agent so site operators (and the archive) know who is asking. The watcher
refuses to contact a real site or the real Wayback Machine without one.

## 1. Write the watches

Copy the shape of [`apps/bonus-watch/src/app.ts`](../apps/bonus-watch/src/app.ts) into a new module
(for example `real-pages/app.ts`, kept out of the repository if the pages are personal) and point each
watch at a real page:

- Pick selectors from the page's HTML: the bonus amount, the deposit, the deadline, the fine print.
- Mark which way is good news with `better: 'higher'` or `better: 'lower'`.
- Check the site's robots.txt allows the path. The watcher checks it again on every visit and turns
  the ghost away if it does not.
- Keep intervals generous (the apps use 6 to 24 hours). A real watch never needs to check more than a
  few times a day.

## 2. Replay the archive

```sh
GHOST_CONTACT_URL=https://<where this watcher is described> \
  npx tsx scripts/real-pages.ts real-pages/app.ts --limit 12
```

For each page the script reads up to 12 archived copies (at most one a month) from the Wayback
Machine, one request a second, and never fetches the page itself. It prints:

- a table of alerts each watcher would have sent over the steps between consecutive copies: a
  whole-page watcher, a selector text watcher with the same selectors, and Ghost Watcher;
- each page's fickleness score and ribbon, as the dashboard would show them;
- every sentence Ghost Watcher would have sent, dated, so a person can judge whether each was worth
  waking for.

Real pages have no answer key, so this table counts alerts rather than false alarms. Read the dated
sentences to decide which alerts mattered.

To try the script without contacting anyone, point it at the Bonus Crypt's fixture site, which also
serves a stand-in Wayback Machine:

```sh
FIXTURE_PORT=3131 npx tsx apps/bonus-watch/fixtures/serve.ts &
BONUS_SITE_ORIGIN=http://127.0.0.1:3131 \
  npx tsx scripts/real-pages.ts apps/bonus-watch/src/app.ts --archive http://127.0.0.1:3131/__wayback
```

## 3. Watch for seven days

Give the module a `main.ts` like [`apps/bonus-watch/src/main.ts`](../apps/bonus-watch/src/main.ts)
(`runCli` with `buildApp`), then leave the polite scheduler running for a week:

```sh
GHOST_CONTACT_URL=https://<where this watcher is described> \
GHOST_DATA_DIR=.ghost-real \
  npx tsx real-pages/main.ts serve
```

Each stone counts the page changes its ghost slept through, and the outbox holds every alert it sent.
After seven days, the week's numbers are the stone counts (noise ignored) next to the outbox
(alerts sent). Add `GHOST_RECEIPTS=archive` to keep an archived copy of each page that shrieks.

## Publishing the numbers

Add one row per run to the README's [Signal, not noise](../README.md#signal-not-noise) section with
the date, the number of pages, the span of copies or days, and the three alert counts. Name real sites
only in the aggregate; the fixture sites stay the place for named examples.

## Result, November 2026

Run on 2026-11-22 with `--limit 12` against three public, server-rendered sign-up bonus pages whose
robots.txt allows them (TD Bank's checking and savings bonus, TD Bank's student checking offer and
Chase Freedom Unlimited; selectors in [`real-pages/`](../real-pages/README.md)). Full output:
[`real-pages-run-2026-11.txt`](real-pages-run-2026-11.txt).

| Pages | Archived copies | Span | Changes Ghost Watcher reported | Whole-page watcher | Selector text watcher | Ghost Watcher | Average bonus change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | 35 (32 steps between copies) | Jun 2024 to Nov 2026 | 10 | 29 alerts | 29 alerts | 10 alerts | $100 across 4 bonus changes |

- **Chase Freedom Unlimited, Jan 28, 2026:** the bonus went down from $300 to $200, then up to $250
  on Apr 22 and back down to $200 on May 31. Someone who applied in April and was paid on the May
  terms would be $50 short, and a sealed pact would show it.
- **TD Bank checking and savings, Apr 20, 2026:** the headline bonus went up from $300 to $500, the
  kind of change a bonus-match letter asks about. Its offer deadline moved five times in the year.
- **TD Bank checking and savings, Jul 18, 2026:** with the headline bonus unchanged at $500, the
  payout and clawback sentences ("we'll deposit the bonus … on or before 180 days", "TD Bank reserves
  the right to deduct the bonus amount at closing") dropped out of the terms block Ghost Watcher
  reads; they were back on Aug 13. A whole-page watcher alerted on almost every copy, so a change
  like this would have been buried.
- **TD Bank student checking:** nothing watched changed in 28 months of copies, and Ghost Watcher
  stayed silent while the other two watchers sent 9 alerts each.

Real pages have no answer key, so these counts are alerts sent, not false alarms; the fixture run
above is the one with known answers.

