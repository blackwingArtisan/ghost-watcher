# Tasks: Seal Any Page

Each task names the criteria it satisfies as `ANY n.m` (see `requirements.md`). A task is ticked only
when its code and tests pass. No new dependency, no network beyond `127.0.0.1`, no headless browser.
Reused behaviour: `PACT 1.x`, `PACT 2.x`, `PACT 5.x` (see `.kiro/specs/seal-the-pact/`).

- [x] 1. Readable extraction: `template/src/readable.ts`, the `:readable` selector in `extract.ts`. (ANY 1.1 to 1.6, 3.3)
- [x] 2. Tests `template/test/readable.test.ts` with a fixture article full of noise. (ANY 1.1 to 1.6, 2.9, 3.1, 5.4)
- [x] 3. `Runner` accepts a prefetched `outcome`, so sealing makes one request. (ANY 4.5)
- [x] 4. `template/src/pages.ts`: `sealAnyPage`, added-page records, `pageWatch`, ids. (ANY 2.2 to 2.9, 3.1, 4.1 to 4.6, 6.1, 6.5)
- [x] 5. `loadDeps` loads stored pages onto a copy of the watch list. (ANY 6.2 to 6.4)
- [x] 6. `POST /api/pages` in `server.ts`. (ANY 2.2 to 2.8, 3.1, 4.1, 4.2, 9.1, 9.2)
- [x] 7. Tests `template/test/seal-any-page.test.ts` (seal, JS-rendered, robots, contact, restart, shriek, noise). (ANY 2.x to 6.x, 9.1, 9.2)
- [x] 8. Dashboard form, bookmarklet and `?seal=` prefill in `ui/render.js`, `ui/app.js`, `ui/style.css`. (ANY 2.1, 2.10, 3.2, 7.1 to 7.4, 9.3, 9.4)
- [x] 9. Tests `template/test/seal-bookmarklet.test.ts`. (ANY 2.1, 7.1 to 7.3)
- [x] 10. Static demo: `replay.js` answers `POST /api/pages` with the local-server message; `replay.test.ts`. (ANY 8.1, 8.2)
- [x] 11. Fixture pages `/guides/loyalty-terms` and `/guides/app-shell` in the bonus fixture site. (ANY 1, 3)
- [x] 12. Playwright `e2e/sealing-any-page.spec.ts` with axe scans and `SEAL_SHOTS` screenshots at 390 and 1360 px. (ANY 2.1, 2.3, 2.4, 2.7, 3.2, 4.1, 5.1 to 5.3, 7.x, 9.3)

## Traceability

| Criterion | Test |
|---|---|
| ANY 1.1 to 1.6 | readable.test.ts |
| ANY 2.1 | seal-bookmarklet.test.ts, e2e (form visible, axe) |
| ANY 2.2 to 2.4, 4.5, 4.6, 6.1, 6.5 | seal-any-page.test.ts (seals with one request) |
| ANY 2.6, 9.2 | seal-any-page.test.ts (bad addresses, oversized body) |
| ANY 2.7 | seal-any-page.test.ts, e2e |
| ANY 2.8 | seal-any-page.test.ts (thirty-first page) |
| ANY 2.9 | readable.test.ts (name from h1) |
| ANY 2.5, 2.10 | not covered by a dedicated test (archiver reuses `PACT 1.4`; busy state is in app.js) |
| ANY 3.1 to 3.3 | seal-any-page.test.ts, e2e (JS-rendered refusal) |
| ANY 4.1 | seal-any-page.test.ts, e2e (robots) |
| ANY 4.2, 4.3 | seal-any-page.test.ts (needs-contact) |
| ANY 4.4 | seal-any-page.test.ts (fetch-failed) |
| ANY 5.1, 5.3 | seal-any-page.test.ts, e2e (shriek quotes changed sentence) |
| ANY 5.2 | seal-any-page.test.ts (noise only) |
| ANY 5.4 | readable.test.ts (money) |
| ANY 5.5 | seal-any-page.test.ts |
| ANY 6.2, 6.4 | seal-any-page.test.ts (restart), e2e (reload) |
| ANY 6.3 | seal-any-page.test.ts (corrupt list) |
| ANY 7.1 to 7.4 | seal-bookmarklet.test.ts, e2e (bookmarklet opens form) |
| ANY 8.1, 8.2 | scripts/static-demo/replay.test.ts |
| ANY 9.1 | seal-any-page.test.ts (foreign Origin) |
| ANY 9.3 | e2e axe scans |
| ANY 9.4 | style.css adds no animation |
