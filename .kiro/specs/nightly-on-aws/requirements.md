# Requirements: Nightly on AWS

## 1. Overview

Ghost Watcher runs on a laptop today. This feature adds an opt-in way to run one check pass every
night on AWS: Amazon EventBridge Scheduler invokes an AWS Lambda function, the function runs
`Runner.checkAll`, snapshots go to an S3 bucket, sealed pacts go to an S3 bucket with Object Lock in
compliance mode, and alerts leave through the existing SES or webhook sinks.

It is built against fakes. Nothing in this repository deploys, and no test contacts AWS. The deploy
command in `infra/README.md` is for a person to run later.

### How criteria are written and cited

Each criterion is one EARS sentence stating one testable behaviour (WHEN, WHILE, IF/THEN, WHERE, or
ubiquitous). Tests name the criterion in the title, for example `(AWS 3.2) ...`.

## 2. Requirements

### Requirement 1: Nightly schedule

1.1 WHEN the nightly schedule fires, THE SYSTEM SHALL invoke the check function once.
1.2 THE SYSTEM SHALL declare the schedule as a `cron(...)` expression that fires once a day, in UTC.
1.3 IF an invocation fails, THEN THE SYSTEM SHALL retry it at most once (`MaximumRetryAttempts: 1`).
1.4 THE SYSTEM SHALL declare the schedule with a flexible time window of `OFF`.

### Requirement 2: The handler

2.1 WHEN the function is invoked, THE SYSTEM SHALL build the app with `loadDeps` and call `Runner.checkAll` exactly once.
2.2 WHEN the pass finishes, THE SYSTEM SHALL return a summary with the counts of watches checked, changed, skipped, blocked and failed, and the number of alerts raised.
2.3 IF the app cannot be built (a `ConfigError`), THEN THE SYSTEM SHALL throw, so Lambda records a failed invocation.
2.4 IF one watch fails, THEN THE SYSTEM SHALL still report the other watches and count the failure in the summary.
2.5 THE SYSTEM SHALL select the S3 store and the alert sinks from environment variables only, with no outbox directory on the Lambda disk by default.
2.6 THE SYSTEM SHALL let tests inject the app, clock, fetcher and AWS clients.

### Requirement 3: Object Lock pact adapter

3.1 WHEN a hash-named pact snapshot document is written, THE SYSTEM SHALL send `ObjectLockMode: COMPLIANCE` on the `PutObject` call.
3.2 WHEN a hash-named pact snapshot document is written, THE SYSTEM SHALL send `ObjectLockRetainUntilDate` equal to the injected clock's time plus the retention period in days.
3.3 IF a pact snapshot key already exists with other bytes, THEN THE SYSTEM SHALL refuse the write and send no `PutObject`; the same bytes again are a no-op.
3.4 THE SYSTEM SHALL send `IfNoneMatch: *` on every pact write, so a race cannot overwrite a pact.
3.5 IF a delete is attempted on a pact snapshot key, THEN THE SYSTEM SHALL send no `DeleteObject` and leave the document readable.
3.6 WHEN a key is the `pact.json` record or outside `pacts/`, THE SYSTEM SHALL write it to the ordinary snapshot store with no lock parameters.
3.7 THE SYSTEM SHALL build its S3 client through an injectable factory, and only on first use.
3.8 WHERE `GHOST_PACT_BUCKET` is set with `GHOST_STORE=s3`, THE SYSTEM SHALL route pacts to that bucket through `loadDeps`.
3.9 IF the retention period is not a positive whole number of days, THEN THE SYSTEM SHALL fail with a configuration error.
3.10 WHEN a pact is sealed, marked posted, replaced or broken on the locked bucket, THE SYSTEM SHALL complete the operation and keep every sealed snapshot unaltered.

### Requirement 4: Infrastructure template

4.1 THE SYSTEM SHALL declare the pact bucket with `ObjectLockEnabled: true` and a default retention of `COMPLIANCE` mode.
4.2 THE SYSTEM SHALL enable versioning on the pact bucket.
4.3 THE SYSTEM SHALL block all public access and enable server-side encryption on both buckets.
4.4 THE SYSTEM SHALL grant IAM actions by name only, with no `*` or `service:*` action.
4.5 THE SYSTEM SHALL give the function no `s3:DeleteObject` and no `s3:BypassGovernanceRetention` on the pact bucket.
4.6 THE SYSTEM SHALL use a small, budget-friendly function: arm64, at most 512 MB, at most 300 seconds, reserved concurrency 1, and log retention of at most 30 days.
4.7 THE SYSTEM SHALL contain no secret values; the webhook URL is passed as a `NoEcho` parameter.
4.8 THE SYSTEM SHALL be a YAML SAM template, with no new npm dependency.

### Requirement 5: Not deployed

5.1 THE SYSTEM SHALL mark the deploy command in `infra/README.md` as not run.
5.2 THE SYSTEM SHALL run every test with fake AWS clients and no network beyond `127.0.0.1`.
