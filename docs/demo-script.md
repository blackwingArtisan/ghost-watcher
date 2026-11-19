# Demo script (3 minutes)

Setup: run `npm run bonus` and `npm run listing`, and open both dashboards
(`http://127.0.0.1:3130` and `http://127.0.0.1:3132`). Demo mode takes every ghost's first
sighting at startup, so both dashboards open with their ghosts resting, one turned away by
robots.txt, and each bonus ghost's history already read from the stand-in Wayback Machine.
Keep a terminal ready for `npm run noise`.

| Time | Say | Show |
| --- | --- | --- |
| 0:00-0:12 | **The stakes.** "This bonus page changed its mind twice before you ever saw it. Would you have noticed?" | The Lanternfield séance: the Ghost of Terms Past timeline, $500 in March, cut to $300 in June |
| 0:12-0:27 | **Why people miss it.** "Page watchers fire on every timestamp, so people mute them. Over the same three nights, a whole-page watcher sent 77 alerts, 67 of them false. Ghost Watcher sent 10, none false, none missed." | `npm run noise` in a terminal, then the title card: "Ghost Watcher: catch the page that changed its mind" |
| 0:27-0:40 | **History on day one.** "The first time a ghost looks, it reads the page's archived copies and runs them through the same rules, so you start with the story, not a blank." | Scroll the timeline; click an "archived copy" link |
| 0:40-1:10 | **One night passes.** "One click lets a night pass on the invented bank site." Lanternfield's stone flips $300 to $400 and shrieks. Mossgate keeps its 60,000 points but slips a 48-month rule into the fine print: Spirit mail leads with "Bait and switch". Bramblewick only reformatted its page, and its ghost slept through it. | Click **Let a night pass**; the toast "3 pages changed: 2 worth waking for, 1 ignored as noise"; the struck-through values; the Bait and switch letter; Bramblewick's "Slept through 1 page change" chip |
| 1:10-1:20 | **It knocks before it enters.** "robots.txt asked watchers to stay out of the members area, so this ghost never goes in." | Close-up of the ghost behind bars |
| 1:20-1:30 | **Your phone buzzes.** "Alerts can go to email, or to ntfy, Discord or Slack with one environment variable." | A phone receiving the ntfy notification (record with `GHOST_ALERTS=outbox,webhook GHOST_WEBHOOK_URL=https://ntfy.sh/<your-topic>`) |
| 1:30-2:00 | **Same skeleton, a different haunting.** Haunted Listings watches rentals and permits. Only the 2 bd under budget in Old Mill and the price cut into budget raise alerts; the out-of-filter listing stays quiet. A demolition permit and a 36-unit build alert once each. | The listings dashboard: **Let a night pass**, then a séance with the new listings marked |
| 2:00-2:20 | **Skeleton proof.** "Each app is one `app.ts` file of watches and rules. Fetching, diffing, history, alerts, storage and this dashboard are the shared template." | `apps/bonus-watch/src/app.ts` and `apps/listing-watch/src/app.ts` side by side |
| 2:20-2:50 | **Built with Kiro.** The steering files, the EARS requirements and the task list Kiro generated; the hooks that type-check and test on save and run the full suite when an agent turn ends. | `.kiro/` in the editor, then `KIRO-LOG.md` |
| 2:50-3:00 | **Close.** "It never cries wolf. It shrieks." The test count, MIT license and repo link. | The glowing ghost over the moon |

The banks, buildings and addresses in the demo are invented. Every number said aloud above comes
from the demo itself or from `npm run noise`.
