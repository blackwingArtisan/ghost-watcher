# Changelog

## 2026-11-18

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
