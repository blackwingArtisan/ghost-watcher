# Demo script (about 3 minutes)

Setup: run `npm run bonus` and `npm run listing`, and open both dashboards
(`http://127.0.0.1:3130` and `http://127.0.0.1:3132`). Demo mode takes every ghost's first
sighting at startup, so both dashboards open with their ghosts resting and one turned away by
robots.txt.

## 1. The stakes (20 s)

A bank raises a checking bonus from $300 to $400 for two weeks, then quietly adds a $12 monthly
fee. A 2-bedroom in your neighborhood drops to $2,050 and is gone by Friday. The pages that matter
change without warning, and refreshing them by hand does not scale. Generic page-change alerts
fire on every timestamp and rotating banner, so people mute them.

## 2. The Bonus Crypt (60 s)

- The demo has already taken each ghost's first sighting. No alerts fired, because a baseline is
  not a change.
- Point out the ghost behind bars: robots.txt asks watchers to stay out of the members area, so
  Ghost Watcher never requests it. Every visit sends an honest User-Agent that says it is local-only; a real run names a contact URL.
- Click **Let a night pass**. The invented bank site changes its terms overnight and every ghost
  looks again. Lanternfield and Mossgate glow. Bramblewick sleeps: its page was only reformatted.
- Read the Spirit mail: "Bonus went up from $300 to $400 (+$100)." Open **Read the letter** to
  show the email that would be sent.
- Open the Lanternfield séance to show the word-level diff of the fine print, then **Lay to rest**.

## 3. Haunted Listings (50 s)

- Same skeleton, different app: one `app.ts` with list watches and filters (2+ bedrooms, at most
  $2,100, Old Mill or Larkspur Heights).
- Click **Let a night pass**. Several listings appear or change, but only the two you would
  actually take raise alerts: a new 2 bd in Old Mill at $1,950, and a price cut into budget.
- Permits: a demolition and a 36-unit new build alert once each. The electrical permit stays quiet.

## 4. The skeleton (30 s)

- Show `apps/bonus-watch/src/app.ts` next to `apps/listing-watch/src/app.ts`: each app is just
  definitions, and everything else is shared.
- Adapters: local files and a local outbox by default; S3 and SES are one environment variable
  away.

## 5. Built with Kiro (20 s)

- `.kiro/steering` set the product, stack and layout. Kiro generated the EARS requirements, the
  design and the task list in `.kiro/specs/ghost-watcher-kit`, and every task is checked off.
- Hooks run the type-check and unit tests on save, and the full suite when an agent turn ends.
- Close on the test count: unit, CLI and browser tests, all against local fixture sites.
