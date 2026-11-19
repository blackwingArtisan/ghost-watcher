# Demo script (3 minutes)

Setup: run `npm run bonus` and `npm run listing`, and open both dashboards
(`http://127.0.0.1:3130` and `http://127.0.0.1:3132`). Demo mode takes every ghost's first
sighting at startup, so both dashboards open with their ghosts resting, one turned away by
robots.txt, and each bonus ghost's history already read from the stand-in Wayback Machine.
Keep a terminal ready for `npm run noise`.

| Time | Say | Show |
| --- | --- | --- |
| 0:00-0:08 | **Cold open.** "Banks edit the fine print at night." | `http://127.0.0.1:3130/?night=1`: the night passes as the page loads, the moon flushes red, Lanternfield's stone shows $300 struck through beside $400 |
| 0:08-0:20 | **The stakes.** "Bonus hunters have $2,000 to $5,000 a year riding on pages like this. In 2023 the CFPB found a major bank had withheld promised card bonuses from tens of thousands of customers. When a bonus isn't paid, the page you applied to is already gone." | The CFPB press release headline, then the 22,055-complaint figure from `docs/sources.md` |
| 0:20-0:32 | **Why people miss it.** "Page watchers fire on every timestamp, so people mute them. Over the same three nights, a whole-page watcher sent 77 alerts, 67 of them false. Ghost Watcher sent 10, none false, none missed. It never cries wolf." | `npm run noise` in a terminal |
| 0:32-0:55 | **One night.** Press **Rewind to calm**, then <kbd>N</kbd>. Lanternfield shrieks; Mossgate keeps its 60,000 points but slips a 48-month rule into the fine print, and Spirit mail leads with "Bait and switch". Bramblewick only reformatted its page, and its ghost slept through it. | The toast "3 pages changed: 2 worth waking for, 1 ignored as noise"; the struck-through values; the Bait and switch letter first in Spirit mail; Tonight's tally |
| 0:55-1:05 | **It knocks before it enters.** "robots.txt asked watchers to stay out of the members area, so this ghost never goes in." | Close-up of the ghost behind bars |
| 1:05-1:30 | **It keeps the receipts.** "Every shriek keeps proof: the hash of the page before and after, and a permanent archived copy." Then **Raise the dead**: "Show the bank its own terms from the day you applied." | The receipt line, then the dispute pack: before and after with dates, the letter, the CFPB complaint text |
| 1:30-1:40 | **History on day one.** "The first time a ghost looks, it reads the page's archived copies, so you start with the story: $500 in March, cut to $300 in June." | The Lanternfield séance, Ghost of Terms Past timeline |
| 1:40-2:00 | **Same skeleton, a different haunting.** Haunted Listings on a dusk street: a window lights and the house names the unit, "2 bd $2,050 Larkspur Heights"; the out-of-filter listing stays dark; "Knocks at the door" fills. | `http://127.0.0.1:3132/?night=1` |
| 2:00-2:15 | **Skeleton proof.** "Each app is one `app.ts` file of watches and rules. Fetching, diffing, history, receipts, alerts, storage and this dashboard are the shared template." | `apps/bonus-watch/src/app.ts` and `apps/listing-watch/src/app.ts` side by side |
| 2:15-2:45 | **Built with Kiro.** The steering files, the EARS requirements and the task list Kiro generated; the hooks that test on save and run the full suite when an agent turn ends; the who-wrote-what table. | `.kiro/` in the editor, then `KIRO-LOG.md` |
| 2:45-2:58 | **Close.** "Banks edit the fine print at night. Ghost Watcher keeps the receipts." | The glowing ghost over the red moon, MIT license and repo link |

The banks, buildings and addresses in the demo are invented. Every number said aloud above comes
from the demo itself or from `npm run noise`.
