# Changelog

## 2026-11-22

- **A lease pact in Haunted Listings, by Kiro (call 11).** The pact became a template feature with
  per-app wording: "I signed the lease" on the Larkspur Flats listing seals the advertised rent, fees
  and move-in special, and Raise the dead turns a later rent rise or new monthly fee into a letter to
  the landlord. The Bonus Crypt's wording is unchanged; the e2e block grows to eight ports.
- **Measured on real pages, by Kiro (call 10).** Three public bonus pages replayed through 35
  Wayback Machine copies: Ghost Watcher sent 10 alerts where a whole-page watcher and a selector
  watcher each sent 29 (`docs/real-pages.md`).
- **Raise the dead reads as evidence.** Exhibit A (the day you applied) and Exhibit B (now) with the
  changed clause marked, the letter on parchment under a Bait and switch stamp, the text boxes behind
  "Edit the text" and the hash commands behind "Check it yourself".
- **A clearer first screen.** One line above the stones says what they are; the tally adds up the
  money that turned against you since you applied, in integer cents; `npm run bonus` and
  `npm run listing` open the browser and print the one-night URL. Stones keep the name, readings
  and one status line, with the rest in a tooltip or the séance.
- **Phones and errors.** A smaller moon clear of the title, a banner after each night that jumps to
  the loudest letter, a Spirit mail pill that steps aside while the letters are on screen, no ghost
  stuck on "visiting...", an error toast with Retry and a lost-ghost page for unknown addresses.
- **A street of different houses.** Haunted Listings houses alternate a gable, a mansard and a double
  gable, each with a chimney and steps or a porch, windows that light one by one, and a street lamp.
- **Pact copy, by Kiro (call 9).** Plainer pact notes and letters, a readable display address in
  letters instead of the fixture host, a turned-away stone that explains robots.txt, a dated
  archived copy for the demo pact, scoped `pact.md` steering and a `pact-keeper` custom agent.
- **Kiro numbers in one place.** A single "Kiro, by the numbers" block, quoted word for word by the
  README, JUDGES.md and KIRO-LOG.md and checked by a test, plus a Kiro features at a glance table.
- **A live demo with no server.** `npm run build:static` drives the real Bonus Crypt demo through
  every night and every ghost laid to rest, records each API answer, and writes `dist/`: the
  dashboard, the outbox letters, the archived copies and a small replay that answers the
  dashboard's API calls in the browser. Sealing or breaking a pact says it needs the local server.
- **A date-proof pact test, by Kiro (call 8).** Every Kiro-written test reading uses the test clock, and the bonus-match letter's "now" date follows the receipt instead of a
  fixed day, so the test passes on any day it runs.

## 2026-11-18

- **Fresh media.** The hero GIF and the Bonus Crypt still are re-recorded with the new tagline,
  muted archive ribbons and Raise the dead; the Haunted Listings still now shows the dusk street
  (`docs/haunted-listings.png`) instead of a séance.
- **Proof of terms leads.** One tagline everywhere ("Banks edit the fine print at night. Ghost
  Watcher keeps the receipts."), in the README, the Bonus Crypt's subtitle and the demo script. The
  README opens with what the receipts are for, the 77-versus-10 noise result and the yearly stake,
  backed by the CFPB's 2023 withheld-bonus order and a count of CFPB complaints about advertised
  terms; `docs/sources.md` lists every outside number and the exact queries.
- **A shorter README.** 372 lines down to 150: the value, a 60-second path, the For judges box, the
  noise table and a comparison that now includes Doctor of Credit and r/churning. The full feature
  list, run and test commands, architecture and adapters moved to `docs/details.md`. An illustrative,
  labelled scenario shows the payback math, and the Pro tier names its buyers with a rough, sourced
  market estimate.
- **JUDGES.md** maps each judging criterion to files, commands and numbers.
- **Haunted Listings looks like its own app.** A dusk sky over the houses, a "Window lit" line on
  the card naming the unit that matched ("2 bd $2,050 Larkspur Heights"), and its own feed name,
  "Knocks at the door". Lists can set a short `brief` template and a `matchLabel` for the card.
  Dispute packs are opt-in per app (`copy.disputes`), so only the Bonus Crypt offers bank letters.
- **Open on the night.** In demo mode, `?night=1` lets the first night pass as the page loads, so a
  shared link opens on the red moon and the struck-through bonus. **Rewind to calm** (and
  `POST /api/demo/rewind`) returns the fixture site and the ghosts to the first sighting.
- **Loudest letter first.** Spirit mail groups letters by round of visits, newest first, and within
  a round puts a bait and switch ahead of shrieks, moans and whispers.
- **Past vs live.** Archive ribbons are muted, outlined tags with a small tone dot, so only live
  changes use full colour; every struck-through old value uses one neutral colour.
- **Tonight's tally.** A strip under the graveyard counts letters sent, page changes slept through
  and doors respected.
- **Phones and accessibility.** Masthead buttons sit side by side, the toast rises from the bottom
  (on every screen, so it never covers the app's name), and the Spirit mail pill hides while the
  first stone's name is on screen. Stone names are `h2` and séance sections `h3`, so the heading
  order is clean under axe's best-practice rules; small text is at least 13px; the unread badge has
  an accessible name.
- **Varied histories.** The invented bank pages now have different archive histories, so the
  stones no longer all read "changed 2 times in 9 months".
- **Raise the dead.** Every shriek and bait and switch that kept a receipt gets a "Raise the dead"
  button in Spirit mail and the haunting log. It opens a dispute pack: a letter to the bank quoting
  what the page said before and after the change, with dates, the archived copy and both SHA-256
  hashes, plus prefilled Consumer Financial Protection Bureau complaint text under the matching
  CFPB product and issue. `disputePack()` is pure and deterministic, and is served at
  `GET /api/ghosts/:id/alerts/:alert/dispute`.
- **Real pages.** `replayArchive` and `scripts/real-pages.ts` replay a page's Wayback Machine copies
  through a whole-page watcher, a selector text watcher and Ghost Watcher, and print the fickleness
  score and every dated sentence. `docs/real-pages.md` covers the archive replay and a seven-day live
  check. "Very fickle" now needs at least three changes.
- **Fresh media.** `npm run stills` re-takes the README screenshots from the running demos, and the
  hero GIF is re-recorded with the archive ribbons and the shriek scene.
- **Positioning.** The README and the Bonus Crypt's subtitle now lead with terms drift and one
  persona, bonus hunters, with a sourced community size and the yearly stake. Beyond Kiroween
  names two tiers, a sourced market anchor and a dated reason for now.
- **For judges.** A short box at the top of the README: the category, the 60-second path, and one
  evidence link each for the spec, steering, hooks, authorship and tests.
- **Kiro log.** `KIRO-LOG.md` now opens with what Kiro built and a who-wrote-what table, and the
  README no longer claims every spec task is checked off (11 open gaps are listed in `tasks.md`).
- **Good news, bad news.** Fields declare which direction is `better`, and rules can set a `tone`.
  Findings, alerts, stones, Spirit mail and the séance carry it: a raised fee or a new eligibility
  window is red, a bigger bonus glows, a vanished value reads "gone", and readings the page never
  showed are left off the stone.
- **The archive on the first screen.** The Ghost of Terms Past now gives each stone a ribbon with
  its biggest past change ("Bonus cut $200 in June") and a fickleness score, and Spirit mail opens
  with dimmed letters from the archive instead of an empty box.
- **A shriek scene.** A night that wakes a shriek turns the moon red, flashes lightning, shakes the
  ghost and cracks its stone, all stilled under reduced motion. `N` lets a night pass; the button
  pulses harder until it is pressed.
- **Polish.** Changed readings take a full row and never wrap mid-value; dates on stones are compact
  ("Jan 15 '27"); a restless stone keeps naming its newest unread change; the toast sits at the top
  and says "newly restless"; the séance says "unchanged" when a value has not moved; long ghost
  names wrap in Spirit mail; phones get a sticky "Spirit mail" pill with the unread count.
- **The ghost keeps receipts.** A shriek or a bait and switch now carries the SHA-256 of the
  snapshots before and after the change, and with `GHOST_RECEIPTS=archive` a permanent copy of the
  page from Internet Archive Save Page Now. Receipts appear in the letter, the webhook text, Spirit
  mail and the séance. The fixture site stands in for Save Page Now in demo mode and in tests.
- **The Ghost of Terms Past.** A `HistorySource` port and a Wayback Machine (CDX) adapter. On a
  ghost's first sighting, archived copies of the page run through the same extract, diff and rules,
  and the séance opens with the page's history. Tests replay real recorded Wayback responses; the
  demo uses the fixture site as a stand-in archive. Opt in with `GHOST_HISTORY=wayback`.
- **Bait and switch.** `rules.stealthEdit(field, headline)` flags fine print that changes under an
  unchanged headline, with a banner in Spirit mail, the séance and the email.
- **Signal, not noise.** `npm run noise` measures a whole-page watcher, a selector text watcher and
  Ghost Watcher on the same fixture nights (77, 11 and 10 alerts; 67, 1 and 0 false). Stones count
  the page changes each ghost slept through, and the night toast says how many were noise.
- **Webhook alerts.** `GHOST_ALERTS=webhook` posts to ntfy, Discord, Slack or any JSON endpoint.
- **Dashboard.** "Let a night pass" leads in demo mode; each change shows on its stone, old value
  struck through; higher contrast, an axe-core WCAG 2.1 AA scan in Playwright, read letters no
  longer fade below AA; four stones in one row; Haunted Listings haunts houses instead of stones.
  A night now ends with the woken ghosts rising out of their stones, the moon flaring and Spirit
  mail dealing its letters in one by one, all still under reduced motion.
- **Docs.** README hero rewrite with a hero GIF (`npm run hero` re-records it), a comparison with
  changedetection.io, Visualping and Distill, a Beyond Kiroween section, a timed demo script, Kiro
  MCP settings, and corrections to `KIRO-LOG.md` and the tech steering file.
- **CI.** A GitHub Actions workflow runs the full suite on pushes to `main` and on pull requests.
