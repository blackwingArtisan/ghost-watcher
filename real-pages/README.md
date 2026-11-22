# Real pages

Three real, public, server-rendered bank and card sign-up bonus pages, chosen on 2026-11-22 to measure
Ghost Watcher on real history (steps 1 and 2 of [`docs/real-pages.md`](../docs/real-pages.md)).

**Only archived copies are read.** `scripts/real-pages.ts` asks the Internet Archive (the Wayback
Machine) for copies, one request a second, with the User-Agent
`GhostWatcher/0.1.0 (+<contact url>; page-change watcher)`. These pages themselves are never fetched,
and no test touches the network.

| Watch | Page | Archive copies 2024 to 2026 (monthly) |
|---|---|---|
| `td-checking-savings-bonus` | `https://www.td.com/us/en/personal-banking/checking-and-saving-bonus` | 13 |
| `td-student-offer` | `https://www.td.com/us/en/personal-banking/checking-accounts/studentoffer` | 14 |
| `chase-freedom-unlimited` | `https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited` | 22 or more |

Each site's robots.txt allows these paths for `User-agent: *` (checked once per site on 2026-11-22).

## Selectors

`pattern` is a regular expression applied to the selected text; the first group is the value.

| Watch | Field | Selector | Pattern |
|---|---|---|---|
| TD checking and savings | bonus | `h1` | `up to ($…)` before the footnote digit |
| | deposit | `body` | `TD Beyond Checking account and make ($…)` |
| | deadline | `body` | `Offer valid through <date>` |
| | finePrint | `.cmp-text:has(.legal-text:contains("Offer valid through"))` | everything after the date |
| TD student | bonus | `.offer-center-banner__offer-header` | first `$…` |
| | purchases | `body` | `make N debit card purchases` |
| | window | `body` | `debit card purchases within N days` |
| | finePrint | `.small-body-text:contains("qualifying website")` | whole block, footnote digit dropped |
| Chase Freedom Unlimited | bonus | `body` | `Earn a $… bonus` |
| | spend | `body` | `after you spend $… on purchases` |
| | months | `body` | `in the first N months from account opening` |
| | finePrint | `body` | the "You will receive N bonus points with this bonus offer" sentences |

Chase changed its markup between January 2024 and October 2025, so its fields read the page's own
sentences from `body`. Because of that, the "selector text watcher" column in the run reads whole-body
text for Chase and for the TD student requirement fields, and behaves like the whole-page watcher there.

## Run it

```sh
GHOST_CONTACT_URL=https://github.com/blackwingArtisan/ghost-watcher \
  npx tsx scripts/real-pages.ts real-pages/app.ts --limit 12
```

The contact URL comes from `GHOST_CONTACT_URL`; the app has none of its own. The saved output of the
November 2026 run is in [`docs/real-pages-run-2026-11.txt`](../docs/real-pages-run-2026-11.txt).
`npx vitest run real-pages` checks the watch definitions offline.
