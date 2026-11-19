# Requirements: Ghost Watcher Kit

## 1. Overview

Ghost Watcher is a reusable skeleton (package `@ghost-watcher/template`) for one job: watch a web
page and tell the user when the part they care about changes. Each watch is a **ghost** that lurks on
a page. When watched values change in a way a rule cares about, the ghost **glows** and an alert lands
in the outbox. Two apps are built on the skeleton: `bonus-watch` (bank and card sign-up bonuses) and
`listing-watch` (apartment listings and city building permits).

This document states the requirements as user stories with acceptance criteria in strict EARS
notation. Every criterion is one sentence in one of these forms and states one testable behavior:

- **WHEN** *trigger* **THE SYSTEM SHALL** *response*.
- **WHILE** *state* **THE SYSTEM SHALL** *response*.
- **IF** *unwanted condition* **THEN THE SYSTEM SHALL** *response*.
- **WHERE** *optional feature is present* **THE SYSTEM SHALL** *response*.
- Ubiquitous: **THE SYSTEM SHALL** *response*.

"THE SYSTEM" is the template or the app named in the criterion's requirement. Requirements have stable
IDs (for example `REQ-FETCH-01`) that `tasks.md` references. Criteria are numbered within a
requirement and may be cited as `REQ-FETCH-01.3`.

Where the build differs from the first draft of this document, the requirement states what the code
does and `tasks.md` (Implementation notes) records the difference. Gaps between a criterion and the
code or tests are tracked as unchecked tasks in section 21 of `tasks.md`.

## 2. Glossary

- **Watch** — a definition of one page to watch: URL, fields, optional lists, rules, and a check interval.
- **Ghost** — the dashboard representation of a watch. A ghost **glows** (state `restless`) when it has unacknowledged alerts.
- **Field** — a single watched value on a page, located by a CSS selector and normalized by a kind.
- **List** — a repeating set of items on a page (for example listings or permits), each item having fields.
- **Snapshot** — the normalized values extracted from a page at one check, stored for later diffing.
- **Diff** — the semantic difference between two snapshots (field changes and list item changes).
- **Rule** — a condition over a diff that, when met, produces an alert.
- **Finding** — one rule match on one change, before it is stored and delivered as an alert.
- **Alert** — a record that a watched value changed in a way a rule cares about, with a plain-English summary.
- **Outbox** — the local default alert sink: JSON Lines plus rendered email files.
- **Fixture** — a local server that serves numbered versions of a page plus robots.txt for tests.
- **Minor units** — the smallest unit of a currency (cents for USD, EUR, GBP and CAD), held as an integer.
- **Loopback or reserved host** — `localhost`, a `127.x.x.x` address, `[::1]`, `example.com`, `example.net`, `example.org`, or a name ending in `.example`, `.test`, `.invalid` or `.localhost`.
- **Real host** — any host that is not a loopback or reserved host.
- **Placeholder contact URL** — a contact URL on a reserved host, or one that is not a valid URL.

## 3. User Stories and Acceptance Criteria

### 3.1 Watch Definitions

#### REQ-WATCH-01: Watch shape and defaults

**User Story:** As a developer building an app on the skeleton, I want to define a watch with a URL,
fields, optional lists, rules, and a check interval, so that the skeleton knows what to watch and how
often.

**Acceptance Criteria:**
1. WHEN `defineWatch` receives a valid definition, THE SYSTEM SHALL return a `Watch` whose `fields`, `lists` and `tags` default to empty arrays.
2. WHEN `defineWatch` receives a definition without an interval, THE SYSTEM SHALL set the interval to six hours.
3. IF a definition is invalid (an id that is not lowercase letters, digits and dashes, an empty name, a URL that is not http or https, no field and no list, a duplicate field name, a list without identity fields, a rule that names an unknown field or list, or an invalid regular expression), THEN THE SYSTEM SHALL throw a `WatchDefinitionError` that names every problem.
4. IF `defineApp` receives two watches that share an id, THEN THE SYSTEM SHALL throw a `WatchDefinitionError` naming the duplicate id before any check runs.
5. THE SYSTEM SHALL require a name, a selector and a kind on every field spec through the TypeScript types.

#### REQ-WATCH-02: Single-value field specs

**User Story:** As a developer, I want to point a field at a CSS selector and give it a kind, so that
the skeleton reads and normalizes that value each check.

**Acceptance Criteria:**
1. THE SYSTEM SHALL support the field kinds `text`, `money`, `number`, `date`, `percent` and `url`.
2. WHEN a field spec names an attribute, THE SYSTEM SHALL read that attribute of the first matching element instead of its text.
3. WHEN a field spec has a `pattern`, THE SYSTEM SHALL read the first capture group of the pattern (or the whole match when it has no group) from the element text.
4. WHEN a field spec reads element text, THE SYSTEM SHALL ignore the contents of `script`, `style`, `noscript` and `template` descendants.
5. WHEN the skeleton extracts a field, THE SYSTEM SHALL normalize the value by the field's kind.
6. IF a field's selector matches no element, THEN THE SYSTEM SHALL record the field as absent (`null`).

#### REQ-WATCH-03: List specs

**User Story:** As a developer, I want to watch repeating items (listings, permits) as a list, so that
new matching items can trigger alerts.

**Acceptance Criteria:**
1. THE SYSTEM SHALL let a watch define a list with a name, an item selector, per-item field specs, and an `identity` set naming the fields that identify an item.
2. WHEN the skeleton extracts a list, THE SYSTEM SHALL extract every element matching the item selector and normalize each item's fields by their kinds.
3. WHEN two items on one page resolve to the same identity key, THE SYSTEM SHALL keep the first and ignore the later one.
4. IF an item's identity key is empty, THEN THE SYSTEM SHALL skip that item.
5. WHEN two snapshots contain items with the same identity key, THE SYSTEM SHALL treat them as the same item for diffing.

#### REQ-WATCH-04: Rules attached to watches

**User Story:** As a developer, I want to attach one or more rules to a watch, so that only the changes
I care about produce alerts.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide the rule builders `wentUp`, `wentDown`, `changed`, `appeared`, `disappeared`, `newItem`, `itemRemoved` and `itemChanged`.
2. WHEN a check produces a diff that is not the first run, THE SYSTEM SHALL evaluate every rule of the watch against that diff.
3. THE SYSTEM SHALL evaluate each rule independently of the other rules on the watch.
4. WHEN a `changed` rule and a more specific field rule (`wentUp`, `wentDown`, `appeared`, `disappeared`) match the same field change, THE SYSTEM SHALL keep only the more specific finding.
5. WHEN two list rules of the same kind match the same item, THE SYSTEM SHALL keep only the finding with the loudest severity.

#### REQ-WATCH-05: Public API and app isolation

**User Story:** As an app author, I want a single public API package so that my app depends only on
stable, documented surface and never on template internals.

**Acceptance Criteria:**
1. THE SYSTEM SHALL re-export the public API from `template/src/index.ts`.
2. THE SYSTEM SHALL expose the fixture-site helpers through the separate `@ghost-watcher/template/testing` export.
3. IF an app needs a capability that the public API lacks, THEN THE SYSTEM SHALL gain that capability in the template in a generic form instead of the app reaching into template internals.
4. THE SYSTEM SHALL keep every app import of template code on `@ghost-watcher/template` or `@ghost-watcher/template/testing`.

### 3.2 Polite Fetching

#### REQ-FETCH-01: Fetch and honor robots.txt first

**User Story:** As a site operator's good neighbor, I want the skeleton to fetch and obey robots.txt
before any page fetch, so that it never accesses disallowed paths.

**Acceptance Criteria:**
1. WHEN the fetcher is asked for a page whose origin has no unexpired cached robots.txt policy, THE SYSTEM SHALL request that origin's `/robots.txt` before requesting the page.
2. WHILE a cached robots.txt policy is younger than the cache lifetime (default one hour), THE SYSTEM SHALL serve it from the cache without requesting `/robots.txt` again.
3. IF robots.txt disallows the watcher's User-Agent token for the page path, THEN THE SYSTEM SHALL NOT request the page and SHALL return a `blocked` outcome naming the robots.txt URL.
4. WHEN the runner receives a `blocked` outcome, THE SYSTEM SHALL record the watch as `blocked` and SHALL NOT produce an alert.
5. IF `/robots.txt` answers with a 4xx status, THEN THE SYSTEM SHALL treat the origin as allowing every path.
6. IF `/robots.txt` cannot be reached, times out or answers with a 5xx status, THEN THE SYSTEM SHALL treat the origin as disallowing every path and SHALL re-request `/robots.txt` after at most ten minutes.

#### REQ-FETCH-02: Honest User-Agent

**User Story:** As a site operator, I want the watcher to identify itself honestly with a contact URL
I can visit, so that I can reach the operator if needed.

**Acceptance Criteria:**
1. THE SYSTEM SHALL send the same `User-Agent` header on every HTTP request it makes, including requests for `/robots.txt`.
2. WHERE a contact URL that is not a placeholder is configured through `GHOST_CONTACT_URL` or the app's optional `contactUrl`, THE SYSTEM SHALL send `GhostWatcher/<version> (+<contact url>; page-change watcher)`.
3. WHERE `GHOST_CONTACT_URL` is set, THE SYSTEM SHALL prefer it over the app's `contactUrl`.
4. WHEN every watch URL is on a loopback or reserved host and no contact URL that is not a placeholder is configured, THE SYSTEM SHALL send `GhostWatcher/<version> (local-only, no public contact; page-change watcher)`.
5. THE SYSTEM SHALL NOT send a placeholder contact URL in a User-Agent.
6. THE SYSTEM SHALL show the User-Agent in use on the dashboard and in the `serve` startup output.

#### REQ-FETCH-03: Per-URL minimum interval and Crawl-delay

**User Story:** As a good neighbor, I want the skeleton to never check a page more than once per
configured interval and to honor Crawl-delay, so that it does not burden sites.

**Acceptance Criteria:**
1. WHEN a check that is not forced targets a watch whose last attempt was less than the watch's interval ago, THE SYSTEM SHALL skip the fetch and return `skipped` with reason `interval` and the next eligible time.
2. WHEN a check is forced, THE SYSTEM SHALL bypass the interval and the error back-off and SHALL still honor robots.txt and the per-host request gap.
3. WHEN robots.txt declares a `Crawl-delay` for the watcher's token, THE SYSTEM SHALL wait at least that delay (capped at 30 seconds) between requests to that host.
4. THE SYSTEM SHALL wait at least the configured host gap (default one second) between any two requests to one host.
5. THE SYSTEM SHALL read the time of the last attempt from the persistent store, so that the interval holds across process restarts.
6. WHERE `GHOST_INTERVAL_MINUTES` is set, THE SYSTEM SHALL use it as the interval of every watch.

#### REQ-FETCH-04: Timeouts and per-host concurrency

**User Story:** As a good neighbor, I want every request to time out and only one request per host at a
time, so that the watcher cannot overwhelm a site.

**Acceptance Criteria:**
1. THE SYSTEM SHALL abort every HTTP request that does not finish within the timeout (default 15 seconds).
2. WHEN a request times out, THE SYSTEM SHALL return an `error` outcome that says how many seconds it waited.
3. WHILE a request to a host is in flight, THE SYSTEM SHALL NOT start another request to the same host.
4. IF a page body is larger than 2,000,000 characters, THEN THE SYSTEM SHALL return an `error` outcome and SHALL NOT extract from it.

#### REQ-FETCH-05: Back off on errors

**User Story:** As an operator, I want the watcher to fail quietly and back off when a fetch errors, so
that a transient site problem does not flood me with alerts or requests.

**Acceptance Criteria:**
1. IF a fetch fails with a network error, a timeout or a non-2xx status, THEN THE SYSTEM SHALL return an `error` result and SHALL NOT produce a value-change alert.
2. IF a site answers 429 or 503, THEN THE SYSTEM SHALL return an `error` result that says the site asked the watcher to slow down.
3. IF a page loads but none of the watched regions are found, THEN THE SYSTEM SHALL return an `error` result, SHALL keep the previous snapshot and SHALL NOT produce an alert.
4. WHEN consecutive errors have occurred, THE SYSTEM SHALL delay the next unforced check by 15 minutes doubled for each further consecutive error, up to 24 hours, and SHALL return `skipped` with reason `backoff` during that delay.
5. WHEN a check succeeds, THE SYSTEM SHALL reset the consecutive error count to zero.
6. THE SYSTEM SHALL NOT retry a failed fetch within the same check.
7. WHEN the latest check errored, THE SYSTEM SHALL show the ghost as `lost` with the error message on its dashboard card.

### 3.3 Snapshot Storage

#### REQ-STORE-01: Storage ports

**User Story:** As an operator, I want snapshots stored so that the next check can diff against the
last one, without the store being welded to a single backend.

**Acceptance Criteria:**
1. THE SYSTEM SHALL define a `BlobStore` port with get, put, list and delete operations on string keys.
2. THE SYSTEM SHALL provide `GhostStore`, built on any `BlobStore`, to keep snapshots, per-watch status and alerts.
3. THE SYSTEM SHALL let the runner and the dashboard depend on `GhostStore` and never on a specific backend.
4. IF a key would escape the store's root, THEN THE SYSTEM SHALL reject it.

#### REQ-STORE-02: Local default adapters

**User Story:** As a developer running locally or in tests, I want a file-backed and an in-memory
store, so that I can run with no accounts and test without touching disks or networks.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide `FileBlobStore`, which persists data under the app's data directory (default `.ghost-data/store/`).
2. THE SYSTEM SHALL provide `MemoryBlobStore` for tests.
3. THE SYSTEM SHALL select `FileBlobStore` when `GHOST_STORE` is unset.
4. THE SYSTEM SHALL keep the 20 newest snapshots per watch.

#### REQ-STORE-03: S3 adapter, opt-in

**User Story:** As an operator who wants durable cloud storage, I want an S3 adapter that is opt-in by
environment variable, so that local runs stay free and cloud is a conscious choice.

**Acceptance Criteria:**
1. WHEN `GHOST_STORE` is `s3` and `GHOST_S3_BUCKET` is set, THE SYSTEM SHALL use `S3BlobStore` built on the AWS SDK v3.
2. IF `GHOST_STORE` is `s3` and `GHOST_S3_BUCKET` is unset, THEN THE SYSTEM SHALL refuse to start with an error naming `GHOST_S3_BUCKET`.
3. THE SYSTEM SHALL NOT load the AWS SDK or construct a cloud client unless the S3 store is selected.
4. THE SYSTEM SHALL run every unit and integration test without constructing a real AWS S3 client.

#### REQ-STORE-04: Snapshot content

**User Story:** As a developer, I want a snapshot to capture exactly the normalized values the diff
needs, so that diffs are reproducible from stored data.

**Acceptance Criteria:**
1. THE SYSTEM SHALL store in each snapshot the watch id, the URL, the time of the fetch, the normalized field values and the normalized list items.
2. THE SYSTEM SHALL NOT store raw HTML in a snapshot.

#### REQ-STORE-05: Legacy money snapshots

**User Story:** As an operator who ran an earlier version, I want my stored snapshots to keep working,
so that upgrading does not raise false alerts.

**Acceptance Criteria:**
1. WHEN the store reads a snapshot whose money value carries a decimal `value` and no `amountMinor`, THE SYSTEM SHALL convert it to integer minor units without floating-point arithmetic.
2. WHEN a converted legacy money value equals the page's current money value, THE SYSTEM SHALL report no change.

### 3.4 Normalization and Semantic Diff

#### REQ-DIFF-01: Whitespace is not signal

**User Story:** As an operator, I want whitespace variations to never cause an alert, so that
formatting changes do not spam me.

**Acceptance Criteria:**
1. WHEN two values differ only by whitespace (multiple spaces, tabs, line breaks, non-breaking spaces, leading or trailing space), THE SYSTEM SHALL treat them as equal.
2. WHEN two values differ only by smart quotes, smart dashes or an ellipsis character, THE SYSTEM SHALL treat them as equal.

#### REQ-DIFF-02: Money normalization

**User Story:** As a bonus-watch operator, I want money compared by amount, so that `$1,200.00` and
`$1200` are the same value and arithmetic on amounts is exact.

**Acceptance Criteria:**
1. WHEN a money value is normalized, THE SYSTEM SHALL produce an ISO currency code and an integer `amountMinor` in minor units.
2. WHEN a money value is normalized, THE SYSTEM SHALL build `amountMinor` from the whole and fractional digit strings as integers, without floating-point arithmetic.
3. WHEN a money value carries a `k` suffix, THE SYSTEM SHALL multiply the amount by 1,000 as an integer.
4. WHEN two money values have the same currency and the same `amountMinor`, THE SYSTEM SHALL treat them as equal regardless of grouping, trailing zeros or symbol.
5. WHEN two money values differ in currency, THE SYSTEM SHALL treat them as different.
6. IF a money amount in minor units exceeds `Number.MAX_SAFE_INTEGER`, THEN THE SYSTEM SHALL fall back to a `text` value and SHALL NOT round the amount.
7. WHEN a money field changes, THE SYSTEM SHALL compute the delta as an integer number of minor units.
8. WHEN the system produces text for a person (a summary sentence, an alert email or the dashboard), THE SYSTEM SHALL format `amountMinor` as a currency string, omitting the decimals when the amount is a whole number of major units.

#### REQ-DIFF-03: Number normalization

**User Story:** As an operator, I want numeric fields compared numerically, so that `1,234` and `1234`
are equal.

**Acceptance Criteria:**
1. WHEN a number is normalized, THE SYSTEM SHALL ignore grouping separators.
2. WHEN two numbers are numerically equal, THE SYSTEM SHALL treat them as equal regardless of grouping or formatting.

#### REQ-DIFF-04: Date normalization

**User Story:** As an operator, I want dates compared by the actual date, so that a format change like
`Jan 1, 2026` to `2026-01-01` does not alert, but a real date change does.

**Acceptance Criteria:**
1. WHEN a date is normalized, THE SYSTEM SHALL produce an ISO calendar date (`YYYY-MM-DD`) from ISO, `M/D/YYYY`, `Month D, YYYY` and `D Month YYYY` forms, with or without ordinal suffixes.
2. WHEN two date values refer to the same calendar date, THE SYSTEM SHALL treat them as equal regardless of input format.
3. WHEN two date values refer to different calendar dates, THE SYSTEM SHALL treat them as different.
4. IF a date does not exist on the calendar, THEN THE SYSTEM SHALL fall back to a `text` value.

#### REQ-DIFF-05: Percent normalization

**User Story:** As an operator, I want percents compared by number, so that `5%`, `5.0%` and
`5 percent` compare as equal.

**Acceptance Criteria:**
1. WHEN a percent is normalized, THE SYSTEM SHALL read the number written before `%` or `percent` (percentage points, for example 4.5 for `4.5%`).
2. WHEN two percent values are numerically equal, THE SYSTEM SHALL treat them as equal.
3. WHEN a percent field changes, THE SYSTEM SHALL compute the delta in percentage points.

#### REQ-DIFF-06: URL and generated-stamp noise is not signal

**User Story:** As an operator, I want tracking parameters, ad slots, and "page generated at" stamps to
never cause an alert, so that only the values I watch matter.

**Acceptance Criteria:**
1. WHEN a URL value is normalized, THE SYSTEM SHALL strip `utm_*` and other known tracking query parameters, strip the fragment, lowercase the host and sort the remaining parameters.
2. WHEN a URL value is relative, THE SYSTEM SHALL resolve it against the watched page URL.
3. THE SYSTEM SHALL extract only the watched fields and list items, so that unwatched markup, ad slots and page-generated stamps never reach the diff.

#### REQ-DIFF-07: Diff produces field and list changes

**User Story:** As a developer, I want a structured diff I can run rules against, so that rules are
simple and testable.

**Acceptance Criteria:**
1. THE SYSTEM SHALL produce field changes of type `added`, `removed` and `changed`, each carrying the field name and the normalized before and after values.
2. THE SYSTEM SHALL produce list changes of type `itemAdded`, `itemRemoved` and `itemChanged`, each carrying the list name and the normalized items.
3. WHEN two values are equal after normalization, THE SYSTEM SHALL NOT emit a change for them.
4. WHEN a `changed` field change compares two values of the same numeric kind (money, number, percent or date), THE SYSTEM SHALL attach the numeric delta (days for dates).
5. WHEN a list is reordered and no item changes, THE SYSTEM SHALL NOT emit a list change.

#### REQ-DIFF-08: Diff is pure

**User Story:** As a developer, I want diff to be a pure function, so that it is easy to unit test and
reason about.

**Acceptance Criteria:**
1. THE SYSTEM SHALL compute a diff as a function of the two extractions alone, with no clock, store or network access.

#### REQ-DIFF-09: First run establishes a baseline

**User Story:** As an operator, I want the first check to establish a baseline so that the watcher does
not alert on everything simply because it has never seen the page before.

**Acceptance Criteria:**
1. WHEN no previous snapshot exists, THE SYSTEM SHALL diff against an empty extraction and flag the diff as `firstRun`.
2. WHEN the diff is flagged `firstRun`, THE SYSTEM SHALL evaluate no rules and SHALL produce no alert.
3. WHEN the first check of a watch succeeds, THE SYSTEM SHALL store the snapshot and return a `baseline` result.

### 3.5 Rules

#### REQ-RULES-01: wentUp

**User Story:** As a bonus-watch operator, I want to know when a bonus amount goes up, so that I can act
on a better offer.

**Acceptance Criteria:**
1. WHEN a money, number or percent field changes to a larger value, THE SYSTEM SHALL fire `wentUp`.
2. WHEN a money, number or percent field changes to a smaller value, THE SYSTEM SHALL NOT fire `wentUp`.
3. WHEN a field is unchanged after normalization, THE SYSTEM SHALL NOT fire `wentUp`.
4. WHEN a date field changes, THE SYSTEM SHALL NOT fire `wentUp`.
5. WHEN a field changes between non-numeric values, THE SYSTEM SHALL NOT fire `wentUp`.
6. WHERE `wentUp` has a `minDelta`, THE SYSTEM SHALL fire only when the increase is at least `minDelta`, read in major currency units for money (for example 50 means $50) and exactly in minor units.

#### REQ-RULES-02: wentDown

**User Story:** As an operator, I want to know when an amount drops, so that I can react.

**Acceptance Criteria:**
1. WHEN a money, number or percent field changes to a smaller value, THE SYSTEM SHALL fire `wentDown`.
2. WHEN a money, number or percent field changes to a larger value, THE SYSTEM SHALL NOT fire `wentDown`.
3. WHEN a field is unchanged after normalization, THE SYSTEM SHALL NOT fire `wentDown`.
4. WHEN a date field changes, THE SYSTEM SHALL NOT fire `wentDown`.
5. WHERE `wentDown` has a `minDelta`, THE SYSTEM SHALL fire only when the decrease is at least `minDelta`, read in major currency units for money and exactly in minor units.

#### REQ-RULES-03: changed

**User Story:** As an operator, I want to know when a watched field changes at all (for example fine
print), so that any edit to the text I care about reaches me.

**Acceptance Criteria:**
1. WHEN a field present in both snapshots has a different normalized value, THE SYSTEM SHALL fire `changed`.
2. WHEN a field's normalized value is equal in both snapshots, THE SYSTEM SHALL NOT fire `changed`.
3. WHEN a field appears or disappears, THE SYSTEM SHALL NOT fire `changed`.
4. WHEN a date field changes, THE SYSTEM SHALL describe the move in days.

#### REQ-RULES-04: appeared

**User Story:** As an operator, I want to know when a value that was absent appears on the page.

**Acceptance Criteria:**
1. WHEN a field was absent in the previous snapshot and is present now, THE SYSTEM SHALL fire `appeared`.
2. WHEN a field was present in the previous snapshot, THE SYSTEM SHALL NOT fire `appeared` for it.
3. WHERE `appeared` has a `matching` pattern, THE SYSTEM SHALL fire when the field text matches the pattern now and did not match it before.
4. WHERE `appeared` has a `matching` pattern, THE SYSTEM SHALL quote the sentence that matches in the summary.

#### REQ-RULES-05: disappeared

**User Story:** As an operator, I want to know when a value I was tracking vanishes from the page.

**Acceptance Criteria:**
1. WHEN a field was present in the previous snapshot and is absent now, THE SYSTEM SHALL fire `disappeared`.
2. WHEN a field is still present, THE SYSTEM SHALL NOT fire `disappeared` for it.
3. WHERE `disappeared` has a `matching` pattern, THE SYSTEM SHALL fire when the field text matched the pattern before and does not match it now.

#### REQ-RULES-06: newItem with a filter

**User Story:** As a listing-watch operator, I want to be alerted only on new list items that match my
filters (price, beds, neighborhood, permit type), so that I am not alerted about listings I do not
care about.

**Acceptance Criteria:**
1. WHEN a list item whose identity was not in the previous snapshot appears and satisfies every condition of the rule's filter, THE SYSTEM SHALL fire `newItem`.
2. WHEN a new list item fails any condition of the filter, THE SYSTEM SHALL NOT fire `newItem`.
3. WHEN an item that was already present reappears unchanged, THE SYSTEM SHALL NOT fire `newItem`.
4. WHERE a `newItem` rule has no filter, THE SYSTEM SHALL fire for every new item.
5. THE SYSTEM SHALL support the filter operators `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `contains` and `in`.
6. WHEN a filter compares text, THE SYSTEM SHALL ignore case.
7. WHEN a filter compares a money field with a numeric target, THE SYSTEM SHALL read the target in major currency units and compare it with `amountMinor` exactly, without floating-point arithmetic.
8. IF a numeric operator is applied to a value that is absent or not numeric, THEN THE SYSTEM SHALL treat the condition as not satisfied.

#### REQ-RULES-07: Rules operate on normalized values

**User Story:** As a developer, I want rules to compare normalized values, so that noise is filtered
before rules ever run.

**Acceptance Criteria:**
1. THE SYSTEM SHALL evaluate rules against the normalized diff and never against raw markup.
2. THE SYSTEM SHALL implement rule evaluation as a pure function of a watch and a diff.

#### REQ-RULES-08: itemRemoved and itemChanged

**User Story:** As a listing-watch operator, I want to know when a listing goes away or its price
moves, so that I can react to rentals leaving the market or being cut.

**Acceptance Criteria:**
1. WHEN an item present in the previous snapshot is absent now and satisfies the rule's filter, THE SYSTEM SHALL fire `itemRemoved`.
2. WHEN a named field of an item present in both snapshots changes and the item satisfies the rule's filter, THE SYSTEM SHALL fire `itemChanged`.
3. WHERE `itemChanged` has direction `down`, THE SYSTEM SHALL fire only when the field's delta is negative.
4. WHERE `itemChanged` has direction `up`, THE SYSTEM SHALL fire only when the field's delta is positive.
5. WHERE `itemChanged` has a direction and the field's change has no numeric delta, THE SYSTEM SHALL NOT fire.

#### REQ-RULES-09: Severity

**User Story:** As an operator, I want each rule to have a loudness, so that big news stands out.

**Acceptance Criteria:**
1. THE SYSTEM SHALL support the severities `whisper`, `moan` and `shriek` on every rule.
2. WHERE a rule has no severity, THE SYSTEM SHALL use `shriek` for `newItem`, `whisper` for `itemRemoved` and `moan` for every other rule kind.

### 3.6 Alerts

#### REQ-ALERTS-01: AlertSink port

**User Story:** As a developer, I want alerts to go through a sink port, so that the local outbox and
email are interchangeable.

**Acceptance Criteria:**
1. THE SYSTEM SHALL define an `AlertSink` port whose `deliver` operation takes one rendered message and returns a delivery receipt.
2. THE SYSTEM SHALL let the runner depend on the port and never on a specific sink.
3. WHERE several sinks are selected, THE SYSTEM SHALL deliver to each and SHALL succeed when at least one delivers.

#### REQ-ALERTS-02: Local outbox default

**User Story:** As an operator running locally with no accounts, I want alerts written to an outbox on
disk, so that I can see them without any email service.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide `OutboxAlertSink`, which writes each message as a JSON Lines index entry, an `.eml` file and an HTML preview under the data directory's `outbox/` folder.
2. THE SYSTEM SHALL provide `ConsoleAlertSink` for development.
3. THE SYSTEM SHALL select `OutboxAlertSink` when `GHOST_ALERTS` is unset.
4. WHEN a subject contains non-ASCII characters, THE SYSTEM SHALL encode it in the `.eml` file.

#### REQ-ALERTS-03: Amazon SES adapter, opt-in

**User Story:** As an operator who wants real email, I want an SES adapter that is opt-in by
environment variable, so that local runs stay free and email is a conscious choice.

**Acceptance Criteria:**
1. WHEN `GHOST_ALERTS` includes `ses` and `GHOST_SES_FROM` is set, THE SYSTEM SHALL use `SesEmailAlertSink` built on Amazon SES v2.
2. IF `GHOST_ALERTS` includes `ses` and `GHOST_SES_FROM` is unset, THEN THE SYSTEM SHALL refuse to start with an error naming `GHOST_SES_FROM`.
3. THE SYSTEM SHALL NOT load the AWS SDK or construct a cloud client unless the SES sink is selected.
4. THE SYSTEM SHALL run every unit and integration test without constructing a real AWS SES client and without sending email.

#### REQ-ALERTS-04: Explain every alert

**User Story:** As a non-developer, I want each alert to say in one plain sentence what changed, from
what to what, and which rule fired, so that I understand it without reading code.

**Acceptance Criteria:**
1. THE SYSTEM SHALL write one plain-English summary sentence per alert that names the watched value, the previous value and the new value.
2. THE SYSTEM SHALL record the label of the rule that fired with every alert and print it under the summary in alert emails.
3. WHEN a money field moves, THE SYSTEM SHALL state the move as `went up` or `went down`, both amounts, and the difference (for example `Bonus went up from $300 to $400 (+$100).`).
4. WHEN a text field changes, THE SYSTEM SHALL quote the changed words instead of the whole text.
5. THE SYSTEM SHALL use the field and list labels in sentences and NOT selector names or internal ids.

#### REQ-ALERTS-05: Alert content

**User Story:** As a developer, I want a structured alert record, so that the outbox and dashboard can
render it.

**Acceptance Criteria:**
1. THE SYSTEM SHALL include in each alert the id, watch id, watch name, URL, severity, rule kind, rule label, summary sentence and creation time.
2. WHERE an alert concerns a field, THE SYSTEM SHALL include the field name and the normalized before and after values.
3. WHERE an alert concerns a list item, THE SYSTEM SHALL include the list name and the item.

#### REQ-ALERTS-06: One message per check, and delivery failures

**User Story:** As an operator, I want one email per changed page and no lost alerts when email fails.

**Acceptance Criteria:**
1. WHEN a check of one watch produces several alerts, THE SYSTEM SHALL deliver them as one message.
2. WHEN a check produces alerts, THE SYSTEM SHALL store the alerts before delivering the message.
3. IF delivery fails, THEN THE SYSTEM SHALL keep the stored alerts and return a `changed` result carrying the delivery error.
4. THE SYSTEM SHALL escape HTML in every value placed in the HTML body of a message.

### 3.7 Ghost Dashboard

#### REQ-DASH-01: Server-rendered dashboard

**User Story:** As an operator, I want a dashboard I open in a browser to see all my ghosts at once,
so that I do not need to read JSON.

**Acceptance Criteria:**
1. THE SYSTEM SHALL serve the dashboard from `node:http` as server-rendered HTML plus client JavaScript modules and one stylesheet.
2. THE SYSTEM SHALL serve the dashboard without a web framework or a front-end build step.
3. THE SYSTEM SHALL answer every dashboard page with a Content-Security-Policy that allows scripts only from the dashboard's own origin.

#### REQ-DASH-02: One ghost per watch

**User Story:** As an operator, I want each watch shown as a ghost card, so that I can see the status
of every watcher at a glance.

**Acceptance Criteria:**
1. THE SYSTEM SHALL render one ghost card per watch.
2. THE SYSTEM SHALL show on each card the watch name, the watched URL, the time of the last check and the message of the last check.
3. THE SYSTEM SHALL show on each card the current values of up to four watched fields and the count of items in each list.

#### REQ-DASH-03: Ghost states

**User Story:** As an operator, I want a ghost to glow when something I care about changed, so that
new alerts are impossible to miss.

**Acceptance Criteria:**
1. WHEN a watch has never been checked, THE SYSTEM SHALL render its ghost as `unborn`.
2. WHEN a watch has one or more unacknowledged alerts and its latest check was not refused by robots.txt, THE SYSTEM SHALL render its ghost as `restless` (glowing).
3. WHEN a watch has been checked, has no unacknowledged alerts and its latest check did not error, THE SYSTEM SHALL render its ghost as `dormant`.
4. WHEN the latest check of a watch was refused by robots.txt, THE SYSTEM SHALL render its ghost as `blocked`.
5. WHEN the latest check of a watch errored and the watch has no unacknowledged alerts, THE SYSTEM SHALL render its ghost as `lost`.

#### REQ-DASH-04: Acknowledge

**User Story:** As an operator, I want to acknowledge a ghost's alerts, so that it stops glowing once I
have seen them.

**Acceptance Criteria:**
1. WHEN the user acknowledges a ghost, THE SYSTEM SHALL record the acknowledgment time and SHALL render the ghost without the glow.
2. THE SYSTEM SHALL keep the acknowledgment time in the persistent store, so that the ghost stays at rest after a restart.
3. WHEN a later check produces new alerts, THE SYSTEM SHALL render the ghost as `restless` again.
4. THE SYSTEM SHALL let the user acknowledge a ghost with the keyboard alone.

#### REQ-DASH-05: Check now

**User Story:** As an operator, I want to trigger a check on demand for one watch, so that I do not
have to wait for the next scheduled interval.

**Acceptance Criteria:**
1. WHEN the user triggers "check now" for a watch, THE SYSTEM SHALL run a forced check of that watch.
2. WHEN the user triggers "check now", THE SYSTEM SHALL bypass the per-URL interval and SHALL still honor robots.txt and the per-host request gap (recorded assumption: the action is explicit and user-initiated).
3. WHEN a check of a watch is requested while another check of the same watch is running, THE SYSTEM SHALL share the running check instead of starting a second one.
4. WHILE a check of a watch is in flight, THE SYSTEM SHALL mark that ghost's card as checking.

#### REQ-DASH-06: JSON API

**User Story:** As a developer or test, I want a JSON API behind the dashboard, so that I can drive it
programmatically and write end-to-end tests.

**Acceptance Criteria:**
1. THE SYSTEM SHALL answer `GET /api/state` with every ghost and the alert feed as JSON.
2. THE SYSTEM SHALL answer `GET /api/ghosts/:id` with one ghost's current values, previous values, lists, rules and alerts as JSON.
3. THE SYSTEM SHALL answer `POST /api/ghosts/:id/check` and `POST /api/ghosts/:id/acknowledge` for one ghost, and `POST /api/check-all` for every ghost.
4. IF a request names a ghost id that does not exist, THEN THE SYSTEM SHALL answer 404.
5. THE SYSTEM SHALL answer `GET /healthz` with the app id.
6. THE SYSTEM SHALL serve the JSON API from the same `node:http` server as the dashboard.

#### REQ-DASH-07: Spooky but legible

**User Story:** As an operator, I want a haunted theme that is still readable and accessible, so that
the delight does not get in the way of the data.

**Acceptance Criteria:**
1. THE SYSTEM SHALL apply a haunted theme to the dashboard with body text at a contrast ratio of at least 4.5:1.
2. THE SYSTEM SHALL make every dashboard control operable with the keyboard.
3. WHILE the user's system requests reduced motion, THE SYSTEM SHALL disable glow animation and every other animation.
4. THE SYSTEM SHALL lay the dashboard out without horizontal scrolling on a phone-width screen.

#### REQ-DASH-08: Dashboard ports

**User Story:** As an operator running both apps, I want distinct ports so the two dashboards do not
collide.

**Acceptance Criteria:**
1. THE SYSTEM SHALL serve the bonus-watch dashboard on port 3130 and its fixtures on 3131 by default.
2. THE SYSTEM SHALL serve the listing-watch dashboard on port 3132 and its fixtures on 3133 by default.
3. THE SYSTEM SHALL run end-to-end tests on ports 3134 to 3137, and the demo-mode end-to-end test on ports 3138 and 3139.

### 3.8 bonus-watch App

#### REQ-BONUS-01: Invented example banks

**User Story:** As a demo user, I want bonus-watch to watch invented example banks, so that I can see
how it works without impersonating a real bank.

**Acceptance Criteria:**
1. THE SYSTEM SHALL define the bonus-watch watches for invented banks, with invented names, `example.com` email addresses and `555-01xx` phone numbers.
2. THE SYSTEM SHALL NOT state or imply any endorsement of or relationship to a real bank.
3. THE SYSTEM SHALL point the default bonus-watch watches at the local fixture site.

#### REQ-BONUS-02: Watched bonus fields

**User Story:** As a bonus hunter, I want to track bonus amount, minimum deposit, deadline, and fine
print, so that I catch changes to the terms I care about.

**Acceptance Criteria:**
1. THE SYSTEM SHALL watch each bonus amount as a `money` field.
2. THE SYSTEM SHALL watch each minimum deposit or balance as a `money` field.
3. THE SYSTEM SHALL watch each deadline as a `date` field.
4. THE SYSTEM SHALL watch each block of fine print as a `text` field.

#### REQ-BONUS-03: Bonus rules

**User Story:** As a bonus hunter, I want alerts when the bonus rises or falls, when the deadline or
fine print changes, and when terms appear or disappear.

**Acceptance Criteria:**
1. THE SYSTEM SHALL alert on `wentUp` and `wentDown` of each bonus amount.
2. THE SYSTEM SHALL alert on `changed` of each deadline and each block of fine print.
3. WHEN a bonus amount disappears from its page, THE SYSTEM SHALL alert with the rule `disappeared`.
4. WHEN fine print newly mentions a monthly fee or an eligibility window, THE SYSTEM SHALL alert with the rule `appeared` and the severity `shriek`.

#### REQ-BONUS-04: Local fixture site

**User Story:** As a tester, I want a local fixture site with versioned bonus pages and robots.txt, so
that end-to-end tests can change the page deterministically without scraping a live bank.

**Acceptance Criteria:**
1. THE SYSTEM SHALL serve numbered versions (`v1`, `v2`, ...) of each bonus page from the fixture site.
2. THE SYSTEM SHALL serve a `robots.txt` from the fixture site.
3. WHEN a client sends `POST /__fixture/advance`, THE SYSTEM SHALL switch the fixture site to its next version.
4. WHEN a client sends `GET /__fixture/log`, THE SYSTEM SHALL return the requests the fixture site has received.

#### REQ-BONUS-05: End-to-end test

**User Story:** As a maintainer, I want a Playwright test that drives the real dashboard against the
fixture, so that I know the whole app works end to end.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide a Playwright test that starts the bonus-watch dashboard and its fixture site.
2. WHEN that test advances the fixture to a changed version and triggers a check, THE SYSTEM SHALL show the ghost as glowing and write an alert to the outbox.

#### REQ-BONUS-06: Built only from the public API

**User Story:** As a maintainer, I want the app built only from the template's public API, so that it
stays portable as the template evolves.

**Acceptance Criteria:**
1. THE SYSTEM SHALL keep every import of template code in bonus-watch on `@ghost-watcher/template` or `@ghost-watcher/template/testing`.

#### REQ-BONUS-07: No financial advice

**User Story:** As a user, I want the app to report what a page says and nothing more, so that I am not
given financial advice.

**Acceptance Criteria:**
1. THE SYSTEM SHALL show on the dashboard and in alert emails a line saying that bonus-watch reports what each page says and is not financial advice.
2. THE SYSTEM SHALL NOT recommend, rank or advise on any financial product.

### 3.9 listing-watch App

#### REQ-LISTING-01: Listings and permits

**User Story:** As a renter and a civic watcher, I want listing-watch to watch apartment listings and
city building-permit pages, so that I am alerted to new entries I care about.

**Acceptance Criteria:**
1. THE SYSTEM SHALL define a watch for apartment listings as a list.
2. THE SYSTEM SHALL define a watch for city building permits as a list.

#### REQ-LISTING-02: Filters on new items

**User Story:** As a renter, I want to be alerted only on new listings matching my filters for price,
beds, and neighborhood, so that I am not flooded with irrelevant listings.

**Acceptance Criteria:**
1. THE SYSTEM SHALL filter new listings by minimum beds, maximum rent and neighborhood.
2. WHEN a new listing fails any of those conditions, THE SYSTEM SHALL NOT alert.
3. WHEN the rent of an existing listing falls to or below the maximum rent, THE SYSTEM SHALL alert with the rule `itemChanged`.

#### REQ-LISTING-03: Permit type filter

**User Story:** As a civic watcher, I want to filter permits by permit type, so that I am alerted only
about the permit types I track.

**Acceptance Criteria:**
1. THE SYSTEM SHALL filter new permits by permit type.
2. WHEN a new permit's valuation is at least the big-project threshold, THE SYSTEM SHALL alert with the severity `shriek`.

#### REQ-LISTING-04: Local fixture site

**User Story:** As a tester, I want a local fixture site with versioned listing and permit pages plus
robots.txt, so that end-to-end tests can change the page deterministically.

**Acceptance Criteria:**
1. THE SYSTEM SHALL serve numbered versions of each listing and permit page from the fixture site.
2. THE SYSTEM SHALL serve a `robots.txt` from the fixture site.
3. WHEN a client sends `POST /__fixture/advance`, THE SYSTEM SHALL switch the fixture site to its next version.
4. WHEN a client sends `GET /__fixture/log`, THE SYSTEM SHALL return the requests the fixture site has received.

#### REQ-LISTING-05: End-to-end test

**User Story:** As a maintainer, I want a Playwright test that drives the listing-watch dashboard
against its fixture, so that I know the whole app works end to end.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide a Playwright test that starts the listing-watch dashboard and its fixture site.
2. WHEN that test advances the fixture to a version with a new matching item and triggers a check, THE SYSTEM SHALL show the ghost as glowing and write an alert to the outbox.

#### REQ-LISTING-06: Built only from the public API

**User Story:** As a maintainer, I want the app built only from the template's public API.

**Acceptance Criteria:**
1. THE SYSTEM SHALL keep every import of template code in listing-watch on `@ghost-watcher/template` or `@ghost-watcher/template/testing`.

### 3.10 Fixture-Based Testing

#### REQ-TEST-01: Fixture servers with advance and log

**User Story:** As a tester, I want fixture servers that serve numbered page versions and expose
advance/log endpoints, so that tests can drive page changes deterministically.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide a fixture server that serves the current numbered version of each page.
2. WHEN a client sends `POST /__fixture/advance`, THE SYSTEM SHALL switch to the next version.
3. WHEN a client sends `GET /__fixture/log`, THE SYSTEM SHALL return the recorded request log.

#### REQ-TEST-02: Tests never scrape live sites

**User Story:** As a maintainer, I want tests to never touch the real internet, so that the suite is
hermetic and safe.

**Acceptance Criteria:**
1. THE SYSTEM SHALL direct every network request made by a test to `127.0.0.1`.

#### REQ-TEST-03: Rules and normalizers have unit tests including noise cases

**User Story:** As a maintainer, I want every rule and normalizer unit-tested, including cases that must
not alert, so that noise stays out of alerts.

**Acceptance Criteria:**
1. THE SYSTEM SHALL have a unit test for equality and inequality of every normalizer.
2. THE SYSTEM SHALL have a unit test for firing and not firing of every rule builder.
3. THE SYSTEM SHALL have unit tests showing that whitespace, date format, tracking parameters, rotating promo text and page-generated stamps produce no alert.

#### REQ-TEST-04: Template unit and integration tests

**User Story:** As a maintainer, I want Vitest unit and integration tests for the template, so that the
skeleton is verified independently of the apps.

**Acceptance Criteria:**
1. THE SYSTEM SHALL have Vitest tests for normalize, extract, diff, rules, robots, summary, the fetcher and the local adapters.
2. THE SYSTEM SHALL have Vitest integration tests for the runner, using a fake fetcher and a memory store, that cover the `baseline`, `unchanged`, `changed`, `skipped`, `blocked` and `error` results.

#### REQ-TEST-05: App end-to-end tests with Playwright

**User Story:** As a maintainer, I want each app to have a Playwright end-to-end test, so that the full
dashboard-to-outbox path is verified.

**Acceptance Criteria:**
1. THE SYSTEM SHALL have one Playwright test file for bonus-watch and one for listing-watch.
2. WHEN a Playwright test changes the fixture and triggers a check, THE SYSTEM SHALL show the glowing ghost in the real dashboard and the alert in the outbox.

#### REQ-TEST-06: Tests never construct real cloud clients

**User Story:** As a maintainer, I want tests to never build real cloud clients, so that the suite
cannot accidentally incur cost or touch a cloud.

**Acceptance Criteria:**
1. THE SYSTEM SHALL run every test without constructing an AWS S3 or SES client.
2. THE SYSTEM SHALL run every test without a network connection beyond `127.0.0.1`.

## 4. Non-Functional Requirements

#### REQ-NF-01: Stack and tooling

1. THE SYSTEM SHALL be written in strict TypeScript as ES modules for Node.js 20 or newer.
2. THE SYSTEM SHALL run TypeScript through `tsx` and pass `tsc` with no emit as its type check.
3. THE SYSTEM SHALL parse HTML with `cheerio` and SHALL NOT use a headless browser.
4. THE SYSTEM SHALL use Vitest for unit and integration tests and Playwright for end-to-end tests.

#### REQ-NF-02: Workspaces and lockfile

1. THE SYSTEM SHALL use npm workspaces with one lockfile at the repository root.
2. THE SYSTEM SHALL publish the template as the package `@ghost-watcher/template`.

#### REQ-NF-03: Code style and result types

1. THE SYSTEM SHALL NOT use the `any` type.
2. THE SYSTEM SHALL return results as discriminated unions (`ok`, `blocked`, `error` for fetches; `baseline`, `unchanged`, `changed`, `skipped`, `blocked`, `error` for checks).
3. THE SYSTEM SHALL implement normalize, extract, diff and rules as pure functions and SHALL confine side effects to adapters and the runner.

#### REQ-NF-04: Free by default, cloud opt-in

1. THE SYSTEM SHALL run locally with no accounts and no environment variables.
2. THE SYSTEM SHALL select a paid service (email, cloud storage) only when `GHOST_ALERTS` or `GHOST_STORE` names it.
3. THE SYSTEM SHALL select the local adapter when those variables are unset.

#### REQ-NF-05: Runtime data is git-ignored

1. THE SYSTEM SHALL write runtime data to `<app>/.ghost-data/` (or `GHOST_DATA_DIR`).
2. THE SYSTEM SHALL list `.ghost-data/` in `.gitignore`.

## 5. Requirements Added After Review

These were added by hand after a review of a clean clone. See `KIRO-LOG.md`.

#### REQ-DASH-SEC-01: The dashboard only takes orders from itself

**User Story:** As someone running a watcher on my laptop, I want other web pages to be unable to
drive my dashboard, so that a malicious page cannot make the watcher fetch on its behalf.

**Acceptance Criteria:**
1. IF a request names a Host that is not `localhost`, a loopback address or a host listed in `GHOST_ALLOWED_HOSTS`, THEN THE SYSTEM SHALL answer 403 and SHALL NOT run any check.
2. IF a POST request carries an `Origin` that differs from the dashboard's own origin, THEN THE SYSTEM SHALL answer 403 and SHALL NOT run any check.
3. IF a POST request carries `Sec-Fetch-Site` other than `same-origin` or `none`, THEN THE SYSTEM SHALL answer 403.
4. WHEN a POST request carries no `Origin` and names an allowed Host, THE SYSTEM SHALL accept it.

#### REQ-FETCH-SEC-01: The contact URL must be reachable before visiting real sites

**User Story:** As a site operator, I want the watcher's User-Agent to name a page I can actually
visit, so that I can reach whoever runs it.

**Acceptance Criteria:**
1. IF any watch targets a real host and `GHOST_CONTACT_URL` and the app's `contactUrl` are both unset, THEN THE SYSTEM SHALL refuse to start with an error that names `GHOST_CONTACT_URL`.
2. IF any watch targets a real host and the only configured contact URL is a placeholder, THEN THE SYSTEM SHALL refuse to start with an error that names `GHOST_CONTACT_URL`, the watched host and the placeholder.
3. WHEN every watch targets a loopback or reserved host, THE SYSTEM SHALL start without a contact URL and send the local-only User-Agent of REQ-FETCH-02.4.
4. THE SYSTEM SHALL ship bonus-watch and listing-watch without a `contactUrl`.

#### REQ-DEMO-01: The demo shows a change in one click

**User Story:** As a first-time visitor, I want to see a ghost wake up within seconds, so that I
understand the product without reading instructions.

**Acceptance Criteria:**
1. WHEN an app starts in `demo` mode, THE SYSTEM SHALL record a baseline for every watch before it serves the dashboard.
2. WHILE the app runs in `demo` mode, THE SYSTEM SHALL show a **Let a night pass** control.
3. WHEN the user activates **Let a night pass**, THE SYSTEM SHALL advance the local fixture site to its next version and then check every watch.
4. WHILE the app does not run in `demo` mode, THE SYSTEM SHALL NOT show that control.
5. IF a request reaches `POST /api/demo/next-night` while the app does not run in `demo` mode, THEN THE SYSTEM SHALL answer 404.
