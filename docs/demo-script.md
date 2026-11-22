# Demo script (2:58)

Setup: run `npm run bonus` and `npm run listing`. Each opens its dashboard in the browser
(`http://127.0.0.1:3130` and `http://127.0.0.1:3132`) and prints the one-night address. Demo mode
takes every ghost's first sighting at startup, so both dashboards open calm, with one ghost turned
away by robots.txt and each bonus ghost's history already read from the stand-in Wayback Machine.
Keep a terminal ready for `npm run noise`. The same Bonus Crypt runs with no server at
<https://ghost-watcher.pages.dev>.

## For judges: 60 seconds

1. Open <https://ghost-watcher.pages.dev/?night=1>. One night passes as the page loads: the moon
   turns red and two ghosts wake.
2. Mossgate's letter leads Spirit mail: **Bait and switch**. The headline kept its 60,000 points,
   but the fine print gained a 48-month rule. Press **Raise the dead** on it: Exhibit A (the day you
   applied) against Exhibit B (now), the letter on parchment, and the CFPB complaint text.
3. Open Lanternfield's séance. Its bonus went up after you applied, so the pack is **Ask for the
   match**: a letter asking the bank for the better terms, with both dates and the pact's hash.
4. Tonight's tally, under the stones, adds up the money that turned against you since you applied.

## Beats

| Time | Say | Show |
| --- | --- | --- |
| 0:00-0:08 | **Cold open.** "Your bank promised $300. Then it edited the page." | `/?night=1`: the moon turns red, two ghosts shriek, Lanternfield's stone shows the old values struck through beside the new ones |
| 0:08-0:20 | **Stakes.** "In 2023 the CFPB found a major bank had withheld promised card bonuses from tens of thousands of customers. A typical bonus hunter earns $2,000 to $5,000 a year in bonuses, and one withheld $300 bonus pays for years of the hosted plan." | The CFPB order headline, then the 22,055-complaint count, both linked in `docs/sources.md` |
| 0:20-0:40 | **Seal the pact.** "The day you apply, the ghost seals what the bank promised." Press **I applied today** on a stone that has no pact yet. | The sealed chip with its date and SHA-256, and the archived copy it links |
| 0:40-1:05 | **The nights.** Press <kbd>N</kbd>. Mossgate keeps its headline but slips a 48-month rule into the fine print, and Spirit mail leads with "Bait and switch". Bramblewick only reformatted its page, and its ghost sleeps through it. | The night banner, the Bait and switch letter first in Spirit mail, the "slept through" line on Bramblewick |
| 1:05-1:35 | **Raise the dead.** "Show the bank its own terms." | Exhibit A against Exhibit B with the new clause marked, the stamped letter, the CFPB text; then Lanternfield's **Ask for the match** letter |
| 1:35-1:50 | **Signal, not noise.** "Over the same three nights a whole-page watcher sent 77 alerts, 67 of them false. Ghost Watcher sent 10, none false, none missed." | `npm run noise` |
| 1:50-2:08 | **Skeleton Crew.** "One skeleton, two hauntings." Haunted Listings on its dusk street: a window lights and the house names the unit; the out-of-filter listing stays dark. | `npm run listing` at `/?night=1`, then `apps/bonus-watch/src/app.ts` and `apps/listing-watch/src/app.ts` side by side |
| 2:08-2:45 | **Built with Kiro.** The seal-the-pact spec and its EARS criteria, the scoped steering, the hooks, the `pact-keeper` agent, a context7 call in a transcript, then the numbers block. | `.kiro/` in the editor, `docs/kiro-sessions/`, then the "Kiro, by the numbers" block in `KIRO-LOG.md` |
| 2:45-2:58 | **Close.** "Banks edit the fine print at night. Ghost Watcher keeps the receipts." | The ghost over the red moon; the live URL, the repo and "MIT, free to self-host" |

The banks, buildings and addresses in the demo are invented. Every number said aloud comes from the
demo itself, from `npm run noise` or from a source linked in `docs/sources.md`.
