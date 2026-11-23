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
| A defined user with money at stake | About 678,000 r/churning members; a typical hunter earns $2,000 to $5,000 a year in bonuses ([README, Who it's for](README.md#who-its-for)) |
| Proof of the offer gets bonuses paid | Linked, dated public data points: issuers match a higher offer when asked (Chase 100k to 120k, July 2024; Citi "will usually match ... within 90 days"), and an issuer that honored a disputed offer only with a screenshot ([docs/sources.md](docs/sources.md#public-data-points-proof-of-the-offer-gets-bonuses-paid)) |
| It turns detection into action | `template/src/dispute.ts`: a letter to the bank and prefilled CFPB complaint text from a receipt; tested in `apps/bonus-watch/test/dispute.test.ts` |
| A path past the hackathon | Free self-hosting (MIT); about $4 a month personal (678,000 × 2% × $48 ≈ $650,000 a year); a Pro plan for comparison and affiliate sites ([README, Beyond Kiroween](README.md#beyond-kiroween), [docs/sources.md](docs/sources.md#consumer-market-estimate)) |

## Technological implementation

| Claim | Evidence |
| --- | --- |
| Tested end to end | `npm test`: type-check, 493 Vitest tests, 52 Playwright tests (including axe-core WCAG 2.1 AA scans, phone width, keyboard use, reduced motion and the cross-origin guard). CI runs the same in `.github/workflows/test.yml` |
| Fewer false alarms, measured | `npm run noise`: 12 alerts, none false, none missed, against 115 (103 false) from a whole-page watcher on the same responses; pinned by `template/test/noise.test.ts` |
| Measured on real pages | Three public bank bonus pages through 35 Wayback copies: 29 alerts from a whole-page watcher, 10 from Ghost Watcher, including a $300 to $200 bonus cut and a terms change under an unchanged headline ([docs/real-pages.md](docs/real-pages.md#result-november-2026), built by Kiro in a vibe-coding session) |
| Money is exact | Integer cents and BigInt-safe arithmetic in `template/src/normalize.ts`, tests in `template/test/money.test.ts` (built by Kiro) |
| Polite by construction | RFC 9309 robots.txt parsing, per-host locks, Crawl-delay, back-off and an honest User-Agent in `template/src/robots.ts` and `template/src/fetcher.ts`; the watcher refuses real sites without a contact URL (`template/src/config.ts`) |
| Proof that holds up | SHA-256 over the exact stored bytes plus an Internet Archive Save Page Now copy (`template/src/receipts.ts`); `shasum -a 256` on the snapshot files reproduces the hashes |
| Ports and adapters | Storage, alerts, history, receipts and fetching sit behind ports, with local defaults and opt-in S3, SES and webhook adapters ([docs/details.md](docs/details.md#adapters-local-vs-real)) |

**Kiro.** Kiro specced and built Seal the pact end to end (`.kiro/specs/seal-the-pact/`, 91 EARS
criteria, 27 tasks; transcripts in `docs/kiro-sessions/`). A date assumption in one Kiro-written
test surfaced three days later; Kiro fixed the cause in call 8. It also wrote
the EARS requirements, design and task list (`.kiro/specs/ghost-watcher-kit/`),
reviewed them against the code, built integer-cents money and the contact-URL policy, and wrote the
`money-guard` agent hook. The Stop hook ran the full suite after a Kiro session and caught a stale
assertion that Kiro fixed. Steering files are in `.kiro/steering/`, hooks in `.kiro/hooks/`, MCP
servers in `.kiro/settings/mcp.json`. The skeleton's first version and the earlier features were
written with another AI coding assistant; [KIRO-LOG.md](KIRO-LOG.md) has every call, the Kiro
features at a glance and the who-wrote-what table.

<!-- kiro-numbers:start -->
| Kiro, by the numbers | |
| --- | --- |
| `kiro-cli` calls | 15 (calls 1 to 15), each with an explicit list of trusted tools, never `--trust-all-tools` |
| Time in Kiro | 175 minutes (calls 3 to 15; calls 1 and 2 were timed only roughly, about 15 minutes together) |
| Credits | 297.88 (calls 3 to 15, read with `/usage` before and after each call; calls 1 and 2 were not recorded) |
| Lines Kiro added | 12,366 (calls 3 to 15; `git show --numstat` on Kiro's commits, transcripts and `KIRO-LOG.md` excluded) |
| Tests Kiro added | 296 Vitest and 36 Playwright (suite counts before and after each call) |
| MCP calls | 28 (context7; calls 8 to 15), each with its arguments in the transcript |
| Hand changes to Kiro's code | 3: a date assumption in a Kiro-written test, loosened after call 7 (5 lines added, 2 removed) before Kiro fixed the cause in call 8; Kiro's agent test, widened after call 10 to accept the format kiro-cli 3.5 rewrites agent files into; and the static site's verify page, fixed after call 14 to load the replay shim and read the snapshot its link names, so it works with no server (12 lines added, 2 removed) |
<!-- kiro-numbers:end -->

## Design

| Claim | Evidence |
| --- | --- |
| A haunted identity with meaning | Ghosts whose faces follow their state, a red-moon shriek scene, struck-through old values coloured by good or bad news (`template/src/ui/render.js`, `style.css`) |
| Two apps that look different | Tombstones under a moon for the Bonus Crypt; a dusk street of houses whose windows name the matching unit for Haunted Listings (`docs/bonus-crypt.png`, `docs/haunted-listings.png`) |
| Past and live kept apart | Archive history wears muted outlined ribbons; only live changes use full colour; Spirit mail leads each night with its loudest letter |
| A ceremony for the key moment | "I applied today" stamps a red wax seal with the ghost crest and shows the full hash; reduced motion shows the final state at once (`e2e/seal-ceremony.spec.ts`, `docs/seal-ceremony.png`) |
| Accessible | axe-core finds no WCAG 2.1 A or AA violations on the graveyard, the séance or the dispute pack (`e2e/dashboard-a11y.spec.ts`, `e2e/demo-and-guard.spec.ts`) |

## Innovation and idea

| Claim | Evidence |
| --- | --- |
| History on day one | The Ghost of Terms Past replays a page's Wayback Machine copies through the same rules at the first sighting (`template/src/history.ts`) |
| Bait and switch | `rules.stealthEdit` flags fine-print edits under an unchanged headline (`template/src/rules.ts`, `template/test/stealth.test.ts`) |
| Receipts to dispute | Hashes and an archived copy become a dated letter and CFPB complaint text (`template/src/dispute.ts`) |
| Slow drift and the bonus clock | Cuts too small to wake the ghost each night still shriek against the pact; a bonus clock counts the days left and flags "Bonus due, not posted" with a letter (`template/src/bonus-clock.ts`, `apps/bonus-watch/test/drift-clock.test.ts`, `e2e/drift-clock.spec.ts`) |
| Proof anyone can check | The dispute pack's "Verify it" link opens `/verify`, which recomputes the pact's SHA-256 in the browser with `crypto.subtle` and shows "Matches the pact sealed <date>" or "Does not match" (`template/src/ui/verify-core.js`, `e2e/verify.spec.ts`) |
| Seal any page, no code | Paste an address or press the bookmarklet: the ghost reads the page once through robots.txt, seals its readable text and watches it; browser-rendered pages are refused plainly (`.kiro/specs/seal-any-page/`, `template/src/readable.ts`, `e2e/sealing-any-page.spec.ts`) |
| One pact, any promise | An app's pact vocabulary sets the button, letters and authority line: Haunted Listings seals a lease with "I signed the lease" and writes the landlord letter (`template/src/pact-vocabulary.ts`, `apps/listing-watch/test/lease-pact.test.ts`, `e2e/lease-pact.spec.ts`) |
| What general watchers do not do | Comparison with changedetection.io, Visualping, Distill and the bonus-hunting community ([README](README.md#why-not-what-you-already-use)) |

## Presentation

| Claim | Evidence |
| --- | --- |
| One line | "Banks edit the fine print at night. Ghost Watcher keeps the receipts." |
| A 60-second path | `npm run bonus`, then `?night=1`; **Rewind to calm** resets it |
| Media from the running app | `npm run hero` and `npm run stills` re-record the GIF and screenshots from the demos |
| A three-minute script | [docs/demo-script.md](docs/demo-script.md) |
