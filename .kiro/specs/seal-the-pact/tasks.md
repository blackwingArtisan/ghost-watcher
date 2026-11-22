# Tasks: Seal the Pact

Numbered checklist for two build sessions of about equal size. Each task names the requirement
criteria it satisfies as `PACT n.m` (see `requirements.md`); `PACT 1.1–1.9` is a range. A task is
checked only when its code and its test exist and pass. Test titles carry the criterion, for example
`(PACT 3.2)`.

Ground rules for both sessions: no new dependency, no network beyond `127.0.0.1`, dates only from the
injected `Clock` or stored ISO strings, money in integer cents, apps import only from
`@ghost-watcher/template`. Leave `KIRO-LOG.md` alone.

## Session A: the domain and the store (with Vitest)

- [x] 1. Add the types. In new `template/src/pact.ts`: `PACT_VERSION`, `DEMO_PACT_AGE_DAYS = 40`,
      `PactArchive`, `PactRecord`, `Pact`, `PactReading`, `AlertPact`. Add `pact?: AlertPact` to
      `Alert` (`alerts/types.ts`) and `Finding` (`rules.ts`, type only), and `pacts?: boolean` to
      `AppCopy` (`app.ts`). (PACT 3.1, 5.2, 11.5)
- [x] 2. Add the store methods to `GhostStore`: `pactRecord`, `pact`, `savePact`, `deletePact`, with the
      write order and the hash-named snapshot document from design §3. `pact` verifies the hash on the
      stored bytes, then applies `upgradeSnapshot`. (PACT 2.4, 2.5, 3.1, 3.2, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.6)
- [x] 3. Write `template/test/pact-store.test.ts`: round trip on `MemoryBlobStore`, on `FileBlobStore`
      with a fresh `GhostStore` over the same temp dir, and on `S3BlobStore` with a fake client; the
      file's SHA-256 equals the record's hash; `historyLimit` pruning keeps the pact; `clear` removes
      it; a legacy money snapshot is upgraded; corrupt cases (bad JSON, missing field, missing
      snapshot, flipped byte). (PACT 3.1–3.7, 4.1–4.3)
- [x] 4. Add `template/src/sealing.ts` with `sealPact`, `breakPact` and the `SealResult` type: latest
      snapshot, `snapshotSha256`, clock time, one archiver call, failure and no-archiver notes,
      `exists` without confirmation, replace, break, no fetch. (PACT 1.1–1.9, 2.1–2.7, 4.5, 4.6)
- [x] 5. Write `template/test/pact-seal.test.ts` with `manualClock`, a resolving and a rejecting fake
      `PageArchiver`, and a blob store that fails the `pact.json` write: every criterion of
      requirements 1 and 2, a corrupt pact replaced without confirmation, a corrupt pact broken, and
      the archiver called exactly once. (PACT 1.1–1.9, 2.1–2.7, 4.5, 4.6)
- [x] 6. Implement the pure comparison in `pact.ts`: `comparePact` (design §5.2), `pactNote` (§5.4)
      and `pactVariant` (§5.5). Reuse `diff`, `evaluateRules`, `toneOf` and `displayValue`; no clock,
      no float money. (PACT 5.1–5.10, 7.1, 7.2, 7.6)
- [x] 7. Write `template/test/pact-compare.test.ts` and extend `template/test/money.test.ts`: attach
      versus restored versus no change tonight; a $10 step under `minDelta: 50` firing on the fifth
      night; a stealth edit against the pact; whitespace, date-format and tracking-parameter noise
      raising nothing; tone from `better` for a bonus and for a fee; list findings untouched; no pact
      returns the findings unchanged; the $0.10 to $0.30 and $4.35 cases in integer cents. (PACT 5.1–5.10, 5.12, 7.6)
- [x] 8. Wire the runner: after `evaluateRules`, read `store.pact`, call `comparePact` for a `sealed`
      reading, copy `finding.pact` onto the alert, keep `needsReceipt` and `takeReceipt` as they are,
      and treat `none` and `corrupt` as no pact. (PACT 4.4, 5.1, 5.11, 5.12)
- [x] 9. Extend `pact-compare.test.ts` with runner integration (manual clock, stubbed `Fetcher`, memory
      store): three nights of small drift, the alert's pact reference, a receipt on a pact shriek, a
      corrupt pact leaving the check green, and an alert stream identical to a run with no pact. (PACT 4.4, 5.3, 5.4, 5.11, 5.12)
- [x] 10. Extend `template/src/dispute.ts` for `alert.pact`: the optional `DisputePack.pact` member,
      the filled application date, the three remaining blanks, Exhibit A evidence rows, both letter
      templates (design §7.2 and §7.3), the match subject, the match complaint text, and the
      `restored` case. A pack without `alert.pact` is untouched. (PACT 6.1–6.9, 7.1–7.6)
- [x] 11. Write `template/test/pact-dispute.test.ts`: pack fields and blanks with a pact; Exhibit A with
      and without an archived copy; `restored`; a golden no-pact pack deep-equal to today's output;
      both letter bodies word for word with the invented names; a lower annual fee giving the match
      letter; stealth and `bad` tone giving the dispute letter; determinism. (PACT 6.1–6.9, 7.1–7.6)
- [x] 12. Export the new API from `template/src/index.ts` (`sealPact`, `breakPact`, `seedDemoPacts`
      once it exists, `comparePact`, `pactNote`, `pactVariant`, `DEMO_PACT_AGE_DAYS`, the types), and
      add a source-hygiene test that `pact.ts`, `sealing.ts` and `dispute.ts` contain neither
      `Date.now(` nor `new Date()`. (PACT 8.6, 11.4)
- [x] 13. Check task for Session A. Run `npm run typecheck`, `npm run test:unit` and
      `GHOST_E2E_PORT=3840 npx playwright test`; all three must pass with the existing e2e specs
      unchanged. Also confirm no `package.json` changed. (PACT 11.1, 11.2)

## Session B: server, dashboard, demo and Playwright

- [x] 14. Turn the feature on for the right app: `copy.pacts: true` in `apps/bonus-watch/src/app.ts`;
      listing-watch stays unchanged. (PACT 9.8, 11.5)
- [x] 15. Add the routes in `template/src/server.ts`: `GET`, `POST` and `DELETE`
      `/api/ghosts/:id/pact`, the 1 KiB `readJsonBody` helper, the status codes of design §8, and 404
      for apps without `copy.pacts`. The existing guard covers the foreign-origin case. (PACT 9.1–9.8)
- [x] 16. Extend `template/src/view.ts`: `DashboardState.app.pacts`, `GhostView.pact` (from
      `store.pactRecord`), `GhostView.canSeal`, `FieldRow.pact`, the verified `GhostDetail.pact`, and
      `PactView`. (PACT 9.1, 9.9, 10.1–10.4, 10.9, 10.10)
- [x] 17. Write `template/test/pact-server.test.ts` on a real `createDashboardServer` over
      `127.0.0.1`: seal, 201 body, 409 `pact-exists`, 409 `no-snapshot`, 400, 413, `GET` states,
      `DELETE`, a foreign Origin, an unknown ghost, an app without `copy.pacts`, `/api/state` badges
      and `canSeal`, the dispute route carrying `pack.pact`. (PACT 9.1–9.9, 11.5)
- [x] 18. Render the pact in `template/src/ui/render.js`: the stone chip and the "I applied today"
      button, the séance pact section and confirm panel, the extra table column, the pact note in Spirit
      mail and the haunting log, "Ask for the match", and the two pack titles and column headings. All
      values through `esc`; a pack without `pack.pact` renders as before. Add string-level tests to
      `pact-server.test.ts`, including a hostile watch name and archive note. (PACT 10.1–10.4, 10.9–10.11, 10.13, 11.3)
- [x] 19. Wire `template/src/ui/app.js`: the `pact-*` actions, the confirm and cancel flow with focus
      return, the toasts of design §9.5, and a refresh after each action. (PACT 10.5–10.8)
- [x] 20. Style the new parts in `template/src/ui/style.css`: the sealed chip, the warning state with
      words as well as colour, the button above the `ghost__hit` overlay, the confirm panel, the table
      column, at the dashboard's existing contrast and with no new animation. (PACT 10.12)
- [x] 21. Seed the demo: add `seedDemoPacts` to `sealing.ts` (design §10), call it from `cli.ts` after
      the demo baseline and after rewind for pact-enabled apps, and make sure non-demo commands never
      seal on their own. (PACT 8.1–8.4, 8.7, 8.8)
- [x] 22. Write `apps/bonus-watch/test/pact.test.ts` on the bonus fixture site and a manual clock:
      seeded pacts are 40 days before now with `seeded: 'demo'`, no archiver call and the demo note;
      night 1 gives Lanternfield the match letter and Mossgate the dispute letter, both dated from the
      seed; night 2 adds a Lanternfield dispute pack; the pact file's `shasum` equals its record; the
      blocked ghost is skipped. (PACT 6.1, 6.3–6.5, 7.1–7.4, 8.1–8.5, 8.7)
- [x] 23. Write `e2e/seal-the-pact.spec.ts`, part 1 (bonus dashboard): seal a stone, see the chip and
      the séance section and column, seal again with "Keep it" and with "Yes, replace", break the pact
      with confirmation, and the no-snapshot state. Ports only from `e2e/ports.ts`. (PACT 1.1, 1.3, 2.2, 2.3, 2.5, 10.1–10.3, 10.5, 10.7–10.10)
- [x] 24. Write part 2 (demo dashboard): rewind, see the seeded stone, press `N`, open the Lanternfield
      pack ("Bonus match", columns dated from `sealedAt` and `generatedAt`, 40 days apart, no
      `[Date you applied]`), open the Mossgate dispute pack with Exhibit A, rewind again and see the
      pact re-seeded. (PACT 6.1–6.5, 7.1, 7.3, 8.1–8.5, 10.11, 10.13)
- [x] 25. Write part 3: keyboard sealing (Tab and Enter), an axe scan of the stone and the séance with
      the pact section open, and the confirmation focus return. (PACT 10.8, 10.12)
- [x] 26. Documentation: add one paragraph on sealing the pact to `README.md` (what "I applied today"
      does, that the bonus match letter exists, that the demo pact is back-dated 40 days) and list
      `pact.ts` and `sealing.ts` in `.kiro/steering/structure.md`. Leave `KIRO-LOG.md` alone.
      (PACT 8.3, 11.4)
- [x] 27. Check task for Session B. Run `npm run typecheck`, `npm run test:unit` and
      `GHOST_E2E_PORT=3840 npx playwright test`; all three must pass, including the existing specs
      and the a11y spec. Confirm no `package.json` changed. (PACT 11.1, 11.2)
- [x] 28. Date every test reading with the test clock. Three bonus-watch tests gave the `Runner` a
      manual clock but left `PoliteFetcher` on the real one, so a letter's "what it says now" date
      came from the day the test ran. (PACT 8.6 for dates from the injected clock, 11.2 for tests
      that stay deterministic and on `127.0.0.1`)
  - [x] 28.1 Inject the manual clock into every `PoliteFetcher`, `Runner` and `SavePageNowArchiver`
        in `apps/bonus-watch/test/pact.test.ts`, `receipts.test.ts` and `dispute.test.ts`, with a
        fixed instant. Restore the fixed `'Nov 19, 2026'` assertions in `pact.test.ts`. Then search
        every other test file and fix the same pattern.
  - [x] 28.2 Add `template/test/clock-hygiene.test.ts`: it fails, naming file and line, when a
        `new PoliteFetcher({...})` or `new Runner({...})` in a test has no `clock` or uses
        `systemClock`. Show that it fails once with a clock removed.
  - [x] 28.3 Add `.kiro/steering/testing.md` (included only for test files) and list it in
        `.kiro/steering/structure.md`.
  - [x] 28.4 Run `npm run typecheck`, `npx vitest run` and `GHOST_E2E_PORT=4230 npx playwright test`,
        then run the three files once with a later manual-clock year and confirm only the
        date-bearing assertions change. All must pass before this task is ticked.

## Session C: pact copy and state (requirement 12)

- [x] 29. Spec first: requirement 12 (12.1 to 12.33), design section 14, tasks 29 to 39. Amend 8.3 and
      10.2 and the two superseded decisions in design section 13. (PACT 12.1–12.33)
- [x] 30. Pact note wording. `pairEdits` in `summary.ts`; rewrite the text branch of `pactNote`;
      lower-case subject; one closing period. (PACT 12.1, 12.2, 12.3, 12.4)
- [x] 31. Back-dated reading in `renderPactSection`. (PACT 12.5, 12.6)
- [x] 32. Letters quote the old and the new sentence in `quoteLines`. (PACT 12.7, 12.8, 12.9)
- [x] 33. No repeated line: `pactNoteRepeats`, applied to dashboard alerts; pin that the letter and
      the email do not carry the note. (PACT 12.10, 12.11, 12.12)
- [x] 34. Display URL.
  - [x] 34.1 `Watch.displayUrl`, validation, `shownUrl`; runner, email, view and séance use it;
        `Alert.fetchUrl` and the `Fetched from` row. (PACT 12.13–12.18)
  - [x] 34.2 Set display URLs in `apps/bonus-watch/src/app.ts` and `apps/listing-watch/src/app.ts`.
        (PACT 12.19)
- [x] 35. Turned-away stone: no seal button or hint, quiet "Check now", one plain line. (PACT 12.20–12.24)
- [x] 36. Demo pact with a dated stand-in copy: `saveAt`, the fixture's dated save route,
      `seedDemoPacts`, the README sentence. (PACT 12.25–12.28)
- [x] 37. `.kiro/steering/pact.md` and `.kiro/agents/pact-keeper.json`, with a test of both and a run
      of `kiro-cli agent validate`. (PACT 12.29–12.33)
- [x] 38. Update the existing tests that A to G change, then run `npm run typecheck`,
      `npx vitest run` and `GHOST_E2E_PORT=4230 npx playwright test`. (PACT 11.1, 11.2)
- [x] 39. Screenshots of the demo dashboard at 1360 px and 390 px (turned-away stone, sealed stone,
      Mossgate pack) under `test-results/pact-copy/`; fix what looks broken. (PACT 12.5, 12.14, 12.20–12.28)

## Session C: the sealing ceremony (requirement 13)

- [x] 40. Unsealed stone: `copy.demoUnsealed`, `seedDemoPacts` skip option, `cli.ts`, bonus-watch lists
      Bramblewick; update the tests that expected every bonus ghost sealed. (PACT 8.1, 13.12, 13.13)
- [x] 41. `POST /api/demo/fresh-pact`, `app.freshPact` in the demo state, and the `?fresh-pact` flag in
      `app.js`. (PACT 13.14–13.17)
- [x] 42. The ceremony: `renderSealCeremony`, wax badge, `playCeremony`, CSS stamp, reduced motion.
      (PACT 13.1–13.9)
- [x] 43. Vitest for the renderer and the server route. (PACT 13.2, 13.5, 13.7, 13.12–13.17)
- [x] 44. Playwright: seal appears, badge stays after reload, reduced motion, axe, 360 px.
      Use context7 once to check `page.emulateMedia`. (PACT 13.1, 13.6–13.11)
- [x] 45. Static demo: record the seal answer in `build.ts`, answer it in `replay.js`, extend
      `replay.test.ts`. Build with `STATIC_PORT=4238` and `STATIC_OUT` under `test-results/`.
      (PACT 13.18–13.21)
- [x] 46. Hero scenes and the two new stills; `STILLS_OUT`; run each script once. (PACT 13.22, 13.23)
- [x] 47. Port defaults 3150 and 3152 and the docs that name the old ones. (PACT 13.24)
- [x] 48. Run `npm run typecheck`, `npx vitest run`, `GHOST_E2E_PORT=4230 npx playwright test`; ceremony
      screenshots at 360, 390 and 1360 px under `test-results/ceremony/`. (PACT 13.9–13.11)

## Traceability: requirement to task

| Requirement | Criteria | Tasks (build) | Tasks (tests) |
|---|---|---|---|
| 1 Seal the pact | 1.1–1.9 | 4 | 5, 23 (1.1, 1.3) |
| 2 One pact per watch | 2.1–2.7 | 2, 4 | 5, 23 (2.2, 2.3, 2.5) |
| 3 Storage | 3.1–3.7 | 1, 2 | 3 |
| 4 Corrupt pact | 4.1–4.6 | 2, 4, 8 | 3, 5, 9 |
| 5 Comparison | 5.1–5.12 | 1, 6, 8 | 7, 9 |
| 6 Dispute pack | 6.1–6.9 | 10 | 11, 22, 24 |
| 7 Bonus match letter | 7.1–7.6 | 6, 10 | 7, 11, 22, 24 |
| 8 Demo seeding | 8.1–8.8 | 12, 21, 26 | 12, 22, 24 |
| 9 HTTP routes | 9.1–9.9 | 14, 15, 16 | 17 |
| 10 Dashboard | 10.1–10.13 | 16, 18, 19, 20 | 17, 18, 23, 24, 25 |
| 11 Constraints | 11.1–11.5 | 1, 12, 14, 18, 26 | 13, 17, 18, 27 |
| 12 Pact copy and state | 12.1–12.33 | 29 to 37 | 30 to 38 |
| 13 The sealing ceremony | 13.1–13.24 | 40 to 47 | 43, 44, 45, 48 |

Per criterion:

| Criterion | Tasks | | Criterion | Tasks |
|---|---|---|---|---|
| 1.1–1.9 | 4, 5 | | 6.1 | 10, 11, 22, 24 |
| 2.1–2.7 | 4, 5 | | 6.2, 6.6, 6.7, 6.8, 6.9 | 10, 11 |
| 2.4, 2.5 | 2, 3 | | 6.3–6.5 | 10, 11, 22, 24 |
| 3.1–3.7 | 2, 3 | | 7.1–7.4 | 6, 10, 11, 22, 24 |
| 4.1–4.3 | 2, 3 | | 7.5, 7.6 | 6, 10, 11 |
| 4.4 | 8, 9 | | 8.1–8.5 | 21, 22, 24 |
| 4.5, 4.6 | 4, 5 | | 8.6 | 12, 28 |
| 5.1–5.10 | 6, 7 | | 8.7 | 21, 22 |
| 5.3, 5.4 | 8, 9 | | 8.8 | 21 |
| 5.11, 5.12 | 8, 9 | | 9.1–9.8 | 15, 17 |
| 10.1–10.4 | 16, 18, 23 | | 9.9 | 16, 17 |
| 10.5–10.8 | 19, 23, 25 | | 10.9, 10.10 | 16, 18, 23 |
| 10.11, 10.13 | 18, 24 | | 10.12 | 20, 25 |
| 11.1, 11.2 | 13, 27, 28 | | 11.3 | 18 |
| 11.4 | 12, 26 | | 11.5 | 14, 17 |
