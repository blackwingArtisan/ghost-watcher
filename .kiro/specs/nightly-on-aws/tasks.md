# Tasks: Nightly on AWS

- [x] 1. Spec: requirements, design, tasks. (AWS 1.1–5.2)
- [x] 2. `template/src/store/s3-lock.ts`: `S3ObjectLockBlobStore`, `PactRoutingBlobStore`; export from `index.ts`. (AWS 3.1–3.7, 3.9)
- [x] 3. `config.ts`: `GHOST_PACT_BUCKET`, `GHOST_PACT_RETENTION_DAYS`, `clients.s3Lock`. (AWS 3.8, 3.9)
- [x] 4. `infra/handler.ts`. (AWS 2.1–2.6)
- [x] 5. `infra/template.yaml`. (AWS 1.1–1.4, 4.1–4.8)
- [x] 6. `infra/README.md` with the deploy command, marked not run. (AWS 5.1)
- [x] 7. Tests: `template/test/s3-lock.test.ts`, `infra/test/handler.test.ts`, `infra/test/template.test.ts`. (AWS 5.2)

## Traceability

| Criterion | Test file | Task |
|---|---|---|
| AWS 1.1–1.4 | `infra/test/template.test.ts` | 5, 7 |
| AWS 2.1, 2.2, 2.4, 2.6 | `infra/test/handler.test.ts` | 4, 7 |
| AWS 2.3, 2.5 | `infra/test/handler.test.ts` | 4, 7 |
| AWS 3.1–3.7, 3.9 | `template/test/s3-lock.test.ts` | 2, 7 |
| AWS 3.8 | `template/test/s3-lock.test.ts` | 3, 7 |
| AWS 4.1–4.8 | `infra/test/template.test.ts` | 5, 7 |
| AWS 5.1 | `infra/test/template.test.ts` (README check) | 6, 7 |
| AWS 5.2 | all tests (`test-setup/loopback-only.ts`) | 7 |
