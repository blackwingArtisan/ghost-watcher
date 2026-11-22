# Tasks: Lease Pact

Each task cites `LEASE n.m` (see `requirements.md`); shared behavior cites `PACT n.m` from
`.kiro/specs/seal-the-pact/`. A task is ticked only when its code and its test pass.

- [x] 1. Add `template/src/pact-vocabulary.ts` with `PactVocabulary`, `BONUS_PACT_VOCABULARY`, `resolvePactVocabulary`, `pactEnabledFor`, `pactUiCopy`; add `AppCopy.pactCopy`; export from `index.ts`. (LEASE 1.12, 1.13, 2.1, 2.4, 2.5)
- [x] 2. Thread the day phrase and summary prefix through `pactNote`, `comparePact` and the runner. (LEASE 1.5, 1.12)
- [x] 3. Make `disputePack` take the vocabulary: letters, evidence labels, date blank, blanks, authority, no-CFPB pack, `ui` words. (LEASE 1.6 to 1.11, 6.4 to 6.8)
- [x] 4. Use the vocabulary in the dashboard: stone chip and button, séance section and column, pack page, state `app.pactCopy`; tag filter in view, server and demo seeding with the vocabulary's demo age. (LEASE 1.1 to 1.4, 1.8, 1.10, 1.11, 2.2, 2.3, 5.1)
- [x] 5. Add the Larkspur Flats listing page to the fixture site (three versions) and the `larkspur-flats-5b` watch with its rules; turn on `pacts`, `disputes` and the lease `pactCopy` with the landlord letters. (LEASE 3.2, 4.1 to 4.7, 5.6, 5.7, 6.1 to 6.9)
- [x] 6. Vitest: `apps/listing-watch/test/lease-pact.test.ts` (vocabulary, seal, comparison, demo seed, letter); update listing-watch tests for the fifth watch; bonus-watch tests unchanged. (LEASE 1.1 to 1.5, 1.9, 1.12, 2.1, 2.4, 3.1, 3.2, 4.1 to 4.6, 5.1, 5.3, 5.4, 6.1 to 6.9, 7.1)
- [x] 7. Ports: `e2e/ports.ts` gains `listingDemoDashboard` (+6) and `listingDemoFixtures` (+7); `playwright.config.ts` starts the Haunted Listings demo; `ports.test.ts` follows. (LEASE 7.8)
- [x] 8. Playwright: `e2e/lease-pact.spec.ts` for the sealed mark, the séance, "I signed the lease", the lease letter and the axe scan; adjust `listing-watch.spec.ts` for five ghosts. (LEASE 3.3 to 3.6, 5.3, 5.5, 6.1 to 6.8, 7.6)
- [x] 9. Screenshots of the street, séance and letter at 390 and 1360 px under `test-results/lease-pact/`, looked at. (LEASE 7.6)

## Traceability

| Requirement | Criteria | Tasks | Tests |
|---|---|---|---|
| 1 Vocabulary | 1.1 to 1.13 | 1, 2, 3, 4 | lease-pact.test.ts (1.1 to 1.5, 1.9, 1.12); e2e (1.1, 1.8); bonus tests unchanged (1.12). 1.6 to 1.8, 1.10, 1.11, 1.13 via the letter, evidence, authority tests (6.x) and typecheck |
| 2 Eligibility | 2.1 to 2.5 | 1, 4 | lease-pact.test.ts (2.1, 2.4, 2.5); e2e (2.1, 2.5). 2.2, 2.3 by the demo seed test (5.1) |
| 3 Seal the lease | 3.1 to 3.6 | 5, 8 | lease-pact.test.ts (3.1, 3.2); e2e (3.1 to 3.6) |
| 4 Compare | 4.1 to 4.7 | 5 | lease-pact.test.ts (4.1 to 4.6); 4.7 not tested (no fixture lowers the rent) |
| 5 Demo | 5.1 to 5.7 | 4, 5, 7 | lease-pact.test.ts (5.1, 5.3, 5.4); e2e (5.1, 5.3, 5.4, 5.5) |
| 6 Letter | 6.1 to 6.9 | 3, 5, 8 | lease-pact.test.ts (6.1 to 6.9); e2e (6.1 to 6.8) |
| 7 Constraints | 7.1 to 7.8 | 6, 7, 8, 9 | existing bonus tests (7.1); e2e axe (7.6); ports.test.ts (7.8) |
