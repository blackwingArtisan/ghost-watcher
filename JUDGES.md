# For judges: each criterion and where to find the evidence

Ghost Watcher is a **Skeleton Crew** entry: one template (`template/`) and two apps built from it
(`apps/bonus-watch`, the Bonus Crypt, and `apps/listing-watch`, Haunted Listings). Every number below
can be reproduced from this repository with the command next to it.

The fastest look: `npm install && npm run bonus`, open http://127.0.0.1:3130/?night=1, then press
**Raise the dead** on the Bait and switch letter.

## Potential impact

| Claim | Evidence |
| --- | --- |
| Banks really do withhold promised bonuses | CFPB order against Bank of America, July 2023: promised card bonuses withheld from tens of thousands of consumers, $90 million in CFPB penalties ([docs/sources.md](docs/sources.md#the-bank-of-america-withheld-bonus-order)) |
| Many people report not getting advertised terms | 22,055 CFPB complaints under the two "didn't receive advertised terms" sub-issues, with the exact API queries ([docs/sources.md](docs/sources.md#cfpb-complaints-about-advertised-terms)) |
| A defined user with money at stake | About 678,000 r/churning members; up to 10 accounts a year at $200-$500 each is $2,000-$5,000 a year ([README, Who it's for](README.md#who-its-for)) |
| It turns detection into action | `template/src/dispute.ts`: a letter to the bank and prefilled CFPB complaint text from a receipt; tested in `apps/bonus-watch/test/dispute.test.ts` |
| A path past the hackathon | Free self-hosting (MIT), about $4 a month personal, about $49 a month Pro with a sourced market estimate ([README, Beyond Kiroween](README.md#beyond-kiroween)) |

## Technological implementation

| Claim | Evidence |
| --- | --- |
| Tested end to end | `npm test`: type-check, 224 Vitest tests, 17 Playwright tests (including axe-core WCAG 2.1 AA scans, phone width, keyboard use, reduced motion and the cross-origin guard). CI runs the same in `.github/workflows/test.yml` |
| Fewer false alarms, measured | `npm run noise`: 10 alerts, none false, none missed, against 77 (67 false) from a whole-page watcher on the same responses; pinned by `template/test/noise.test.ts` |
| Money is exact | Integer cents and BigInt-safe arithmetic in `template/src/normalize.ts`, tests in `template/test/money.test.ts` (built by Kiro) |
| Polite by construction | RFC 9309 robots.txt parsing, per-host locks, Crawl-delay, back-off and an honest User-Agent in `template/src/robots.ts` and `template/src/fetcher.ts`; the watcher refuses real sites without a contact URL (`template/src/config.ts`) |
| Proof that holds up | SHA-256 over the exact stored bytes plus an Internet Archive Save Page Now copy (`template/src/receipts.ts`); `shasum -a 256` on the snapshot files reproduces the hashes |
| Ports and adapters | Storage, alerts, history, receipts and fetching sit behind ports, with local defaults and opt-in S3, SES and webhook adapters ([docs/details.md](docs/details.md#adapters-local-vs-real)) |

**Kiro.** Kiro wrote the EARS requirements, design and task list (`.kiro/specs/ghost-watcher-kit/`),
reviewed them against the code, built integer-cents money and the contact-URL policy, and wrote the
`money-guard` agent hook. The Stop hook ran the full suite after a Kiro session and caught a stale
assertion that Kiro fixed. Steering files are in `.kiro/steering/`, hooks in `.kiro/hooks/`, MCP
servers in `.kiro/settings/mcp.json`. Most feature code was written outside Kiro with another AI
coding assistant; [KIRO-LOG.md](KIRO-LOG.md) has every call and the who-wrote-what table.

## Design

| Claim | Evidence |
| --- | --- |
| A haunted identity with meaning | Ghosts whose faces follow their state, a red-moon shriek scene, struck-through old values coloured by good or bad news (`template/src/ui/render.js`, `style.css`) |
| Two apps that look different | Tombstones under a moon for the Bonus Crypt; a dusk street of houses whose windows name the matching unit for Haunted Listings (`docs/bonus-crypt.png`, `docs/haunted-listings.png`) |
| Past and live kept apart | Archive history wears muted outlined ribbons; only live changes use full colour; Spirit mail leads each night with its loudest letter |
| Accessible | axe-core finds no WCAG 2.1 A or AA violations on the graveyard, the séance or the dispute pack (`e2e/dashboard-a11y.spec.ts`, `e2e/demo-and-guard.spec.ts`) |

## Innovation and idea

| Claim | Evidence |
| --- | --- |
| History on day one | The Ghost of Terms Past replays a page's Wayback Machine copies through the same rules at the first sighting (`template/src/history.ts`) |
| Bait and switch | `rules.stealthEdit` flags fine-print edits under an unchanged headline (`template/src/rules.ts`, `template/test/stealth.test.ts`) |
| Receipts to dispute | Hashes and an archived copy become a dated letter and CFPB complaint text (`template/src/dispute.ts`) |
| What general watchers do not do | Comparison with changedetection.io, Visualping, Distill and the bonus-hunting community ([README](README.md#why-not-what-you-already-use)) |

## Presentation

| Claim | Evidence |
| --- | --- |
| One line | "Banks edit the fine print at night. Ghost Watcher keeps the receipts." |
| A 60-second path | `npm run bonus`, then `?night=1`; **Rewind to calm** resets it |
| Media from the running app | `npm run hero` and `npm run stills` re-record the GIF and screenshots from the demos |
| A three-minute script | [docs/demo-script.md](docs/demo-script.md) |
