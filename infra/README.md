# Nightly on AWS

An EventBridge Scheduler schedule invokes one Lambda function a night. The function runs
`Runner.checkAll`, writes snapshots to a data bucket, writes sealed pacts to an S3 Object Lock bucket
in compliance mode, and sends alerts through SES or a webhook. See
`.kiro/specs/nightly-on-aws/` for the requirements and design.

## Status: not deployed, not run

Nothing in this repository has been deployed. No command below has been run, and no test contacts
AWS (the tests use fake clients). You run these yourself, later, with your own credentials.

## Before you deploy

- Pick the app (`AppName`). The fixture apps watch `127.0.0.1`, which a Lambda cannot reach. Point
  the app at real pages and set `ContactUrl` to a page a site operator can visit.
- Verify the SES identity (`SesIdentity`, `SesFrom`) and move the account out of the SES sandbox, or
  use `AlertSinks=webhook` with `WebhookUrl`.
- Know that Object Lock in compliance mode cannot be undone. A sealed pact cannot be altered or deleted
  by anyone, including the root user, until its retention date. `PactRetentionDays` defaults to 365.
  Try a value of 1 first.
- The pact bucket and data bucket have `DeletionPolicy: Retain`, so deleting the stack leaves them.

## Deploy command (NOT RUN)

```sh
sam build --template-file infra/template.yaml \
  && sam deploy --template-file .aws-sam/build/template.yaml \
       --stack-name ghost-watcher-nightly --capabilities CAPABILITY_IAM --resolve-s3 \
       --parameter-overrides AppName=bonus-watch ContactUrl=https://your-site.example/contact PactRetentionDays=1
```

`sam build` bundles `infra/handler.ts` with esbuild; the repository adds no dependency for this.
