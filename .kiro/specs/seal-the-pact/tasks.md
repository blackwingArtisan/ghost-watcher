# Tasks: Seal the Pact

Numbered checklist for two build sessions of about equal size. Each task names the requirement
criteria it satisfies as `PACT n.m` (see `requirements.md`); `PACT 1.1–1.9` is a range. A task is
checked only when its code and its test exist and pass. Test titles carry the criterion, for example
`(PACT 3.2)`.

Ground rules for both sessions: no new dependency, no network beyond `127.0.0.1`, dates only from the
injected `Clock` or stored ISO strings, money in integer cents, apps import only from
`@ghost-watcher/template`. Leave `KIRO-LOG.md` alone.

## Session A: the domain and the store (with Vitest)

- [ ] 1. Add the types. In new `template/src/pact.ts`: `PACT_VERSION`, `DEMO_PACT_AGE_DAYS = 40`,
      `PactArchive`, `PactRecord`, `Pact`, `PactReading`, `AlertPact`. Add `pact?: AlertPact` to
      `Alert` (`alerts/types.ts`) and `Finding` (`rules.ts`, type only), and `pacts?: boolean` to
      `AppCopy` (`app.ts`). (PACT 3.1, 5.2, 11.5)
- [ ] 2. Add the store methods to `GhostStore`: `pactRecord`, `pact`, `savePact`, `deletePact`, with the
      write order and the hash-named snapshot document from design §3. `pact` verifies the hash on the
      stored bytes, then applies `upgradeSnapshot`. (PACT 2.4, 2.5, 3.1, 3.2, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.6)
- [ ] 3. Write `template/test/pact-store.test.ts`: round trip on `MemoryBlobStore`, on `FileBlobStore`
      with a fresh `GhostStore` over the same temp dir, and on `S3BlobStore` with a fake client; the
      file's SHA-256 equals the record's hash; `historyLimit` pruning keeps the pact; `clear` removes
      it; a legacy money snapshot is upgraded; corrupt cases (bad JSON, missing field, missing
      snapshot, flipped byte). (PACT 3.1–3.7, 4.1–4.3)
- [ ] 4. Add `template/src/sealing.ts` with `sealPact`, `breakPact` and the `SealResult` type: latest
      snapshot, `snapshotSha256`, clock time, one archiver call, failure and no-archiver notes,
      `exists` without confirmation, replace, break, no fetch. (PACT 1.1–1.9, 2.1–2.7, 4.5, 4.6)
- [ ] 5. Write `template/test/pact-seal.test.ts` with `manualClock`, a resolving and a rejecting fake
      `PageArchiver`, and a blob store that fails the `pact.json` write: every criterion of
      requirements 1 and 2, a corrupt pact replaced without confirmation, a corrupt pact broken, and
      the archiver called exactly once. (PACT 1.1–1.9, 2.1–2.7, 4.5, 4.6)
- [ ] 6. Implement the pure comparison in `pact.ts`: `comparePact` (design §5.2), `pactNote` (§5.4)
      and `pactVariant` (§5.5). Reuse `diff`, `evaluateRules`, `toneOf` and `displayValue`; no clock,
      no float money. (PACT 5.1–5.10, 7.1, 7.2, 7.6)
- [ ] 7. Write `template/test/pact-compare.test.ts` and extend `template/test/money.test.ts`: attach
      versus restored versus no change tonight; a $10 step under `minDelta: 50` firing on the fifth
      night; a stealth edit against the pact; whitespace, date-format and tracking-parameter noise
      raising nothing; tone from `better` for a bonus and for a fee; list findings untouched; no pact
      returns the findings unchanged; the $0.10 to $0.30 and $4.35 cases in integer cents. (PACT 5.1–5.10, 5.12, 7.6)
- [ ] 8. Wire the runner: after `evaluateRules`, read `store.pact`, call `comparePact` for a `sealed`
      reading, copy `finding.pact` onto the alert, keep `needsReceipt` and `takeReceipt` as they are,
      and treat `none` and `corrupt` as no pact. (PACT 4.4, 5.1, 5.11, 5.12)
- [ ] 9. Extend `pact-compare.test.ts` with runner integration (manual clock, stubbed `Fetcher`, memory
      store): three nights of small drift, the alert's pact reference, a receipt on a pact shriek, a
      corrupt pact leaving the check green, and an alert stream identical to a run with no pact. (PACT 4.4, 5.3, 5.4, 5.11, 5.12)
- [ ] 10. Extend `template/src/dispute.ts` for `alert.pact`: the optional `DisputePack.pact` member,
      the filled application date, the three remaining blanks, Exhibit A evidence rows, both letter
      templates (design §7.2 and §7.3), the match subject, the match complaint text, and the
      `restored` case. A pack without `alert.pact` is untouched. (PACT 6.1–6.9, 7.1–7.6)
- [ ] 11. Write `template/test/pact-dispute.test.ts`: pack fields and blanks with a pact; Exhibit A with
      and without an archived copy; `restored`; a golden no-pact pack deep-equal to today's output;
      both letter bodies word for word with the invented names; a lower annual fee giving the match
      letter; stealth and `bad` tone giving the dispute letter; determinism. (PACT 6.1–6.9, 7.1–7.6)
- [ ] 12. Export the new API from `template/src/index.ts` (`sealPact`, `breakPact`, `seedDemoPacts`
      once it exists, `comparePact`, `pactNote`, `pactVariant`, `DEMO_PACT_AGE_DAYS`, the types), and
      add a source-hygiene test that `pact.ts`, `sealing.ts` and `dispute.ts` contain neither
      `Date.now(` nor `new Date()`. (PACT 8.6, 11.4)
- [ ] 13. Check task for Session A. Run `npm run typecheck`, `npm run test:unit` and
      `GHOST_E2E_PORT=3840 npx playwright test`; all three must pass with the existing e2e specs
      unchanged. Also confirm no `package.json` changed. (PACT 11.1, 11.2)

## Session B: server, dashboard, demo and Playwright

- [ ] 14. Turn the feature on for the right app: `copy.pacts: true` in `apps/bonus-watch/src/app.ts`;
      listing-watch stays unchanged. (PACT 9.8, 11.5)
- [ ] 15. Add the routes in `template/src/server.ts`: `GET`, `POST` and `DELETE`
      `/api/ghosts/:id/pact`, the 1 KiB `readJsonBody` helper, the status codes of design §8, and 404
      for apps without `copy.pacts`. The existing guard covers the foreign-origin case. (PACT 9.1–9.8)
- [ ] 16. Extend `template/src/view.ts`: `DashboardState.app.pacts`, `GhostView.pact` (from
      `store.pactRecord`), `GhostView.canSeal`, `FieldRow.pact`, the verified `GhostDetail.pact`, and
      `PactView`. (PACT 9.1, 9.9, 10.1–10.4, 10.9, 10.10)
- [ ] 17. Write `template/test/pact-server.test.ts` on a real `createDashboardServer` over
      `127.0.0.1`: seal, 201 body, 409 `pact-exists`, 409 `no-snapshot`, 400, 413, `GET` states,
      `DELETE`, a foreign Origin, an unknown ghost, an app without `copy.pacts`, `/api/state` badges
      and `canSeal`, the dispute route carrying `pack.pact`. (PACT 9.1–9.9, 11.5)
- [ ] 18. Render the pact in `template/src/ui/render.js`: the stone chip and the "I applied today"
      button, the séance pact section and confirm panel, the extra table column, the pact note in Spirit
      mail and the haunting log, "Ask for the match", and the two pack titles and column headings. All
      values through `esc`; a pack without `pack.pact` renders as before. Add string-level tests to
      `pact-server.test.ts`, including a hostile watch name and archive note. (PACT 10.1–10.4, 10.9–10.11, 10.13, 11.3)
- [ ] 19. Wire `template/src/ui/app.js`: the `pact-*` actions, the confirm and cancel flow with focus
      return, the toasts of design §9.5, and a refresh after each action. (PACT 10.5–10.8)
- [ ] 20. Style the new parts in `template/src/ui/style.css`: the sealed chip, the warning state with
      words as well as colour, the button above the `ghost__hit` overlay, the confirm panel, the table
      column, at the dashboard's existing contrast and with no new animation. (PACT 10.12)
- [ ] 21. Seed the demo: add `seedDemoPacts` to `sealing.ts` (design §10), call it from `cli.ts` after
      the demo baseline and after rewind for pact-enabled apps, and make sure non-demo commands never
      seal on their own. (PACT 8.1–8.4, 8.7, 8.8)
- [ ] 22. Write `apps/bonus-watch/test/pact.test.ts` on the bonus fixture site and a manual clock:
      seeded pacts are 40 days before now with `seeded: 'demo'`, no archiver call and the demo note;
      night 1 gives Lanternfield the match letter and Mossgate the dispute letter, both dated from the
      seed; night 2 adds a Lanternfield dispute pack; the pact file's `shasum` equals its record; the
      blocked ghost is skipped. (PACT 6.1, 6.3–6.5, 7.1–7.4, 8.1–8.5, 8.7)
- [ ] 23. Write `e2e/seal-the-pact.spec.ts`, part 1 (bonus dashboard): seal a stone, see the chip and
      the séance section and column, seal again with "Keep it" and with "Yes, replace", break the pact
      with confirmation, and the no-snapshot state. Ports only from `e2e/ports.ts`. (PACT 1.1, 1.3, 2.2, 2.3, 2.5, 10.1–10.3, 10.5, 10.7–10.10)
- [ ] 24. Write part 2 (demo dashboard): rewind, see the seeded stone, press `N`, open the Lanternfield
      pack ("Bonus match", columns dated from `sealedAt` and `generatedAt`, 40 days apart, no
      `[Date you applied]`), open the Mossgate dispute pack with Exhibit A, rewind again and see the
      pact re-seeded. (PACT 6.1–6.5, 7.1, 7.3, 8.1–8.5, 10.11, 10.13)
- [ ] 25. Write part 3: keyboard sealing (Tab and Enter), an axe scan of the stone and the séance with
      the pact section open, and the confirmation focus return. (PACT 10.8, 10.12)
- [ ] 26. Documentation: add one paragraph on sealing the pact to `README.md` (what "I applied today"
      does, that the bonus match letter exists, that the demo pact is back-dated 40 days) and list
      `pact.ts` and `sealing.ts` in `.kiro/steering/structure.md`. Leave `KIRO-LOG.md` alone.
      (PACT 8.3, 11.4)
- [ ] 27. Check task for Session B. Run `npm run typecheck`, `npm run test:unit` and
      `GHOST_E2E_PORT=3840 npx playwright test`; all three must pass, including the existing specs
      and the a11y spec. Confirm no `package.json` changed. (PACT 11.1, 11.2)

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

Per criterion:

| Criterion | Tasks | | Criterion | Tasks |
|---|---|---|---|---|
| 1.1–1.9 | 4, 5 | | 6.1 | 10, 11, 22, 24 |
| 2.1–2.7 | 4, 5 | | 6.2, 6.6, 6.7, 6.8, 6.9 | 10, 11 |
| 2.4, 2.5 | 2, 3 | | 6.3–6.5 | 10, 11, 22, 24 |
| 3.1–3.7 | 2, 3 | | 7.1–7.4 | 6, 10, 11, 22, 24 |
| 4.1–4.3 | 2, 3 | | 7.5, 7.6 | 6, 10, 11 |
| 4.4 | 8, 9 | | 8.1–8.5 | 21, 22, 24 |
| 4.5, 4.6 | 4, 5 | | 8.6 | 12 |
| 5.1–5.10 | 6, 7 | | 8.7 | 21, 22 |
| 5.3, 5.4 | 8, 9 | | 8.8 | 21 |
| 5.11, 5.12 | 8, 9 | | 9.1–9.8 | 15, 17 |
| 10.1–10.4 | 16, 18, 23 | | 9.9 | 16, 17 |
| 10.5–10.8 | 19, 23, 25 | | 10.9, 10.10 | 16, 18, 23 |
| 10.11, 10.13 | 18, 24 | | 10.12 | 20, 25 |
| 11.1, 11.2 | 13, 27 | | 11.3 | 18 |
| 11.4 | 12, 26 | | 11.5 | 14, 17 |
