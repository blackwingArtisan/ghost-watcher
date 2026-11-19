# Changelog

## 2026-11-18

- **Real pages.** `replayArchive` and `scripts/real-pages.ts` replay a page's Wayback Machine copies
  through a whole-page watcher, a selector text watcher and Ghost Watcher, and print the fickleness
  score and every dated sentence. `docs/real-pages.md` covers the archive replay and a seven-day live
  check. "Very fickle" now needs at least three changes.
- **Fresh media.** `npm run stills` re-takes the README screenshots from the running demos, and the
  hero GIF is re-recorded with the archive ribbons and the shriek scene.
- **Positioning.** The README and the Bonus Crypt's subtitle now lead with terms drift and one
  persona, bonus hunters, with a sourced community size and the yearly stake. Beyond Kiroween
  names two tiers, a sourced market anchor and a dated reason for now.
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
