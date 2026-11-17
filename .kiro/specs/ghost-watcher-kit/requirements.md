# Requirements: Ghost Watcher Kit

## 1. Overview

Ghost Watcher is a reusable skeleton (package `@ghost-watcher/template`) for one job: watch a web
page and tell the user when the part they care about changes. Each watch is a **ghost** that lurks on
a page. When watched values change in a way a rule cares about, the ghost **glows** and an alert lands
in the outbox. Two apps are built on the skeleton: `bonus-watch` (bank and card sign-up bonuses) and
`listing-watch` (apartment listings and city building permits).

This document states the requirements as user stories with acceptance criteria in EARS notation. EARS
clauses use the forms:

- **WHEN** *trigger* **THE SYSTEM SHALL** *response*.
- **IF** *condition* **THEN THE SYSTEM SHALL** *response*.
- **WHILE** *state* **THE SYSTEM SHALL** *response*.
- Ubiquitous: **THE SYSTEM SHALL** *response*.

Requirements are grouped and given stable IDs (e.g. `REQ-FETCH-01`) so implementation tasks in
`tasks.md` can reference them.

## 2. Glossary

- **Watch** — a definition of one page to watch: URL, fields, optional lists, rules, and a check interval.
- **Ghost** — the dashboard representation of a watch. A ghost **glows** when it has unacknowledged alerts.
- **Field** — a single watched value on a page, located by a CSS selector and normalized by a kind.
- **List** — a repeating set of items on a page (e.g. listings, permits), each item having fields.
- **Snapshot** — the normalized values extracted from a page at one check, stored for later diffing.
- **Diff** — the semantic difference between two snapshots (field changes and list item changes).
- **Rule** — a condition over a diff that, when met, produces an alert.
- **Alert** — a record that a watched value changed in a way a rule cares about, with a plain-English summary.
- **Outbox** — the local default alert sink: JSON Lines plus rendered email files.
- **Fixture** — a local server that serves numbered versions of a page plus robots.txt for tests.

## 3. User Stories and Acceptance Criteria

### 3.1 Watch Definitions

#### REQ-WATCH-01: Watch shape and defaults

**User Story:** As a developer building an app on the skeleton, I want to define a watch with a URL,
fields, optional lists, rules, and a check interval, so that the skeleton knows what to watch and how
often.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide a `defineWatch` helper that accepts an id, name, target URL, field specs,
   optional list specs, rules, and an optional check interval, and returns a validated `Watch`.
2. WHEN a watch is defined without a check interval, THE SYSTEM SHALL default the interval to six
   hours.
3. WHEN two watches in the same registry share an id, THEN THE SYSTEM SHALL fail validation with a
   clear error before any check runs.
4. WHEN a watch is defined with a field spec, THE SYSTEM SHALL require a name, a CSS selector, and a
   kind.

#### REQ-WATCH-02: Single-value field specs

**User Story:** As a developer, I want to point a field at a CSS selector and give it a kind, so that
the skeleton reads and normalizes that value each check.

**Acceptance Criteria:**
1. THE SYSTEM SHALL support field kinds: `text`, `money`, `number`, `date`, and `percent`.
2. WHEN a field spec supplies an attribute name, THE SYSTEM SHALL read that attribute (e.g. `href`)
   instead of the element text.
3. WHEN the skeleton extracts a field, THE SYSTEM SHALL read the matched value and normalize it by the
   field's kind.

#### REQ-WATCH-03: List specs

**User Story:** As a developer, I want to watch repeating items (listings, permits) as a list, so that
new matching items can trigger alerts.

**Acceptance Criteria:**
1. THE SYSTEM SHALL let a watch define a list with a name, an item selector, per-item field specs, and
   an `identityBy` set naming the fields that identify an item for diffing.
2. WHEN the skeleton extracts a list, THE SYSTEM SHALL extract every element matching the item
   selector and normalize each item's fields by their kinds.
3. WHEN two items in a list resolve to the same `identityBy` key, THE SYSTEM SHALL treat them as the
   same item for diffing.

#### REQ-WATCH-04: Rules attached to watches

**User Story:** As a developer, I want to attach one or more rules to a watch, so that only the changes
I care about produce alerts.

**Acceptance Criteria:**
1. WHEN a watch is defined with rules, THE SYSTEM SHALL evaluate every rule against each diff and
   collect the alerts.
2. THE SYSTEM SHALL provide the rule builders `wentUp`, `wentDown`, `changed`, `appeared`,
   `disappeared`, and `newItem`.
3. THE SYSTEM SHALL allow more than one rule on a watch and SHALL evaluate them independently.

#### REQ-WATCH-05: Public API and app isolation

**User Story:** As an app author, I want a single public API package so that my app depends only on
stable, documented surface and never on template internals.

**Acceptance Criteria:**
1. THE SYSTEM SHALL re-export the full public API from `template/src/index.ts`.
2. THE SYSTEM SHALL provide every capability an app needs (watches, normalizers, rules, runner, server,
   CLI, adapters) through the public API; IF an app needs something the template lacks, THEN the
   template SHALL be extended in a generic form rather than the app reaching into internals.
3. Apps SHALL import only from `@ghost-watcher/template`; apps SHALL NOT import from template internals.

### 3.2 Polite Fetching

#### REQ-FETCH-01: Fetch and honor robots.txt first

**User Story:** As a site operator's good neighbor, I want the skeleton to fetch and obey robots.txt
before any page fetch, so that it never accesses disallowed paths.

**Acceptance Criteria:**
1. WHEN a check run targets a URL on a host the fetcher has not yet resolved, THE SYSTEM SHALL fetch
   that host's `/robots.txt` before fetching the page.
2. THE SYSTEM SHALL cache a host's robots.txt for a bounded cache duration and SHALL NOT re-fetch it on
   every page request within that duration.
3. IF robots.txt disallows the watcher's User-Agent token for the target URL, THEN THE SYSTEM SHALL
   skip the page fetch and record a `skipped` result with reason `robots`.
4. IF robots.txt is unreachable, THEN THE SYSTEM SHALL treat the URL as disallowed and record a
   `skipped` result, unless the app explicitly opts into an allow-on-failure policy.

#### REQ-FETCH-02: Honest User-Agent

**User Story:** As a site operator, I want the watcher to identify itself honestly with a contact URL,
   so that I can reach the operator if needed.

**Acceptance Criteria:**
1. THE SYSTEM SHALL send a `User-Agent` header of the form `GhostWatcher/<version> (+<contact url>)`
   on every HTTP request it makes.
2. WHEN no contact URL is configured, THEN THE SYSTEM SHALL refuse to start a check and SHALL report a
   configuration error naming the required setting.

#### REQ-FETCH-03: Per-URL minimum interval and Crawl-delay

**User Story:** As a good neighbor, I want the skeleton to never check a page more than once per
   configured interval and to honor Crawl-delay, so that it does not burden sites.

**Acceptance Criteria:**
1. WHEN a check run targets a URL whose previous snapshot was fetched less than the configured minimum
   interval ago, THE SYSTEM SHALL skip the fetch and record a `skipped` result with reason `interval`
   and the next-eligible time.
2. WHILE robots.txt declares a `Crawl-delay` for the watcher's token that exceeds the configured
   interval, THE SYSTEM SHALL use the larger of the Crawl-delay and the configured interval.
3. THE SYSTEM SHALL source the previous-check time from the persistent snapshot store so that the
   interval is honored across process restarts.

#### REQ-FETCH-04: Timeouts and per-host concurrency

**User Story:** As a good neighbor, I want every request to time out and only one request per host at a
   time, so that the watcher cannot overwhelm a site.

**Acceptance Criteria:**
1. THE SYSTEM SHALL apply a timeout to every HTTP request.
2. WHILE a request to a host is in flight, THE SYSTEM SHALL not start another request to the same host.

#### REQ-FETCH-05: Back off on errors

**User Story:** As an operator, I want the watcher to fail quietly and back off when a fetch errors, so
   that a transient site problem does not flood me with alerts or requests.

**Acceptance Criteria:**
1. IF a fetch returns a network error, times out, or returns a non-2xx status, THEN THE SYSTEM SHALL
   record an `error` result and SHALL NOT produce a value-change alert.
2. THE SYSTEM SHALL NOT retry a failed fetch within the same check run.
3. WHEN a fetch errors, THE SYSTEM SHALL surface the error state on the ghost's dashboard card so the
   operator can see the watcher is not healthy.

### 3.3 Snapshot Storage

#### REQ-STORE-01: SnapshotStore port

**User Story:** As an operator, I want snapshots stored so that the next check can diff against the
   last one, without the store being welded to a single backend.

**Acceptance Criteria:**
1. THE SYSTEM SHALL define a `SnapshotStore` port that reads the previous snapshot for a watch id and
   writes the current snapshot.
2. THE SYSTEM SHALL let the runner depend on the port, not on any specific backend.

#### REQ-STORE-02: Local default adapters

**User Story:** As a developer running locally or in tests, I want a file-backed and an in-memory
   store, so that I can run with no accounts and test without touching disks or networks.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide `JsonFileSnapshotStore` that persists snapshots under the app's
   `.ghost-data/` directory.
2. THE SYSTEM SHALL provide `MemorySnapshotStore` for use in tests.
3. THE SYSTEM SHALL use a local adapter by default; no environment variable SHALL be required to run
   locally.

#### REQ-STORE-03: S3 adapter, opt-in

**User Story:** As an operator who wants durable cloud storage, I want an S3 adapter that is opt-in by
   environment variable, so that local runs stay free and cloud is a conscious choice.

**Acceptance Criteria:**
1. WHEN the environment selects the S3 store, THE SYSTEM SHALL use `S3SnapshotStore` built on the AWS
   SDK v3.
2. THE SYSTEM SHALL NOT construct any cloud client unless the cloud adapter is explicitly selected.
3. Tests SHALL NOT construct a real cloud client.

#### REQ-STORE-04: Snapshot content

**User Story:** As a developer, I want a snapshot to capture exactly the normalized values the diff
   needs, so that diffs are reproducible from stored data.

**Acceptance Criteria:**
1. THE SYSTEM SHALL store in each snapshot the watch id, URL, fetch timestamp, the normalized field
   values, and the normalized list items.
2. THE SYSTEM SHALL NOT store raw HTML in the snapshot; only the normalized extracted values.

### 3.4 Normalization and Semantic Diff

#### REQ-DIFF-01: Whitespace is not signal

**User Story:** As an operator, I want whitespace variations to never cause an alert, so that
   formatting changes do not spam me.

**Acceptance Criteria:**
1. WHEN two values differ only by whitespace (multiple spaces, tabs, line breaks, leading or trailing
   space), THE SYSTEM SHALL treat them as equal and SHALL NOT emit a change.

#### REQ-DIFF-02: Money normalization

**User Story:** As a bonus-watch operator, I want money compared by amount, so that `$1,200.00` and
   `$1200` are the same value.

**Acceptance Criteria:**
1. THE SYSTEM SHALL normalize money to a canonical currency code and an integer of minor units (cents).
2. WHEN two money values have the same currency and minor-unit amount, THE SYSTEM SHALL treat them as
   equal regardless of grouping, decimal places, or symbol.
3. WHEN two money values differ in currency, THE SYSTEM SHALL treat them as different.

#### REQ-DIFF-03: Number normalization

**User Story:** As an operator, I want numeric fields compared numerically, so that `1,234` and `1234`
   are equal.

**Acceptance Criteria:**
1. THE SYSTEM SHALL normalize numbers to a canonical numeric value, ignoring grouping separators.
2. WHEN two numbers are numerically equal, THE SYSTEM SHALL treat them as equal regardless of grouping
   or formatting.

#### REQ-DIFF-04: Date normalization

**User Story:** As an operator, I want dates compared by the actual date, so that a format change like
   `Jan 1, 2026` to `2026-01-01` does not alert, but a real date change does.

**Acceptance Criteria:**
1. THE SYSTEM SHALL normalize dates to a canonical ISO date string.
2. WHEN two date values refer to the same calendar date, THE SYSTEM SHALL treat them as equal
   regardless of input format.
3. WHEN two date values refer to different calendar dates, THE SYSTEM SHALL treat them as different.

#### REQ-DIFF-05: Percent normalization

**User Story:** As an operator, I want percents compared by ratio, so that `50%` and `0.5`-style values
   compare consistently.

**Acceptance Criteria:**
1. THE SYSTEM SHALL normalize percents to a canonical ratio.
2. WHEN two percent values represent the same ratio, THE SYSTEM SHALL treat them as equal.

#### REQ-DIFF-06: URL and generated-stamp noise is not signal

**User Story:** As an operator, I want tracking parameters, ad slots, and "page generated at" stamps to
   never cause an alert, so that only the values I watch matter.

**Acceptance Criteria:**
1. WHEN a watched value is a URL, THE SYSTEM SHALL strip tracking query parameters before comparing, so
   that a link whose only difference is a tracking parameter does not alert.
2. THE SYSTEM SHALL diff only the watched fields and list items; unwatched markup, ad slots, and
   page-generated stamps SHALL NOT contribute to the diff.

#### REQ-DIFF-07: Diff produces field and list changes

**User Story:** As a developer, I want a structured diff I can run rules against, so that rules are
   simple and testable.

**Acceptance Criteria:**
1. THE SYSTEM SHALL produce field changes of kind `added`, `removed`, and `changed`, each carrying the
   field name and the normalized before/after values.
2. THE SYSTEM SHALL produce list changes of kind `itemAdded` and `itemRemoved`, each carrying the list
   name and the normalized item.
3. THE SYSTEM SHALL NOT emit a change for values that are equal after normalization.

#### REQ-DIFF-08: Diff is pure

**User Story:** As a developer, I want diff to be a pure function, so that it is easy to unit test and
   reason about.

**Acceptance Criteria:**
1. THE SYSTEM SHALL implement diff as a pure function of two snapshots, with no side effects and no
   reliance on clocks or stores.

#### REQ-DIFF-09: First run establishes a baseline

**User Story:** As an operator, I want the first check to establish a baseline so that the watcher does
   not alert on everything simply because it has never seen the page before.

**Acceptance Criteria:**
1. WHEN no previous snapshot exists, THE SYSTEM SHALL diff against an empty previous snapshot, yielding
   `added` field changes and `itemAdded` list changes.
2. WHEN the previous snapshot is empty, THE SYSTEM SHALL record the result as a baseline and SHALL NOT
   fire any rule, so a newly added watch never alerts on everything it sees for the first time.
   (Revised by hand during implementation; see KIRO-LOG.md.)

### 3.5 Rules

#### REQ-RULES-01: wentUp

**User Story:** As a bonus-watch operator, I want to know when a bonus amount goes up, so that I can act
   on a better offer.

**Acceptance Criteria:**
1. WHEN a numeric or money field's normalized value increases between snapshots, THE SYSTEM SHALL fire
   `wentUp` and produce an alert.
2. WHEN the value decreases or stays the same, THE SYSTEM SHALL NOT fire `wentUp`.

#### REQ-RULES-02: wentDown

**User Story:** As an operator, I want to know when a deadline or amount drops, so that I can react.

**Acceptance Criteria:**
1. WHEN a numeric or money field's normalized value decreases between snapshots, THE SYSTEM SHALL fire
   `wentDown` and produce an alert.
2. WHEN the value increases or stays the same, THE SYSTEM SHALL NOT fire `wentDown`.

#### REQ-RULES-03: changed

**User Story:** As an operator, I want to know when a watched field changes at all (e.g. fine print),
   so that any edit to the text I care about reaches me.

**Acceptance Criteria:**
1. WHEN a field's normalized value differs between snapshots, THE SYSTEM SHALL fire `changed` and
   produce an alert.
2. WHEN the value is equal after normalization, THE SYSTEM SHALL NOT fire `changed`.

#### REQ-RULES-04: appeared

**User Story:** As an operator, I want to know when a value that was absent appears on the page.

**Acceptance Criteria:**
1. WHEN a field was absent in the previous snapshot and is present now, THE SYSTEM SHALL fire
   `appeared` and produce an alert.
2. WHEN the field was already present, THE SYSTEM SHALL NOT fire `appeared`.

#### REQ-RULES-05: disappeared

**User Story:** As an operator, I want to know when a value I was tracking vanishes from the page.

**Acceptance Criteria:**
1. WHEN a field was present in the previous snapshot and is absent now, THE SYSTEM SHALL fire
   `disappeared` and produce an alert.
2. WHEN the field is still present, THE SYSTEM SHALL NOT fire `disappeared`.

#### REQ-RULES-06: newItem with a filter

**User Story:** As a listing-watch operator, I want to be alerted only on new list items that match my
   filters (price, beds, neighborhood, permit type), so that I am not alerted about listings I do not
   care about.

**Acceptance Criteria:**
1. WHEN a list item that was not in the previous snapshot appears and matches the rule's filter, THE
   SYSTEM SHALL fire `newItem` and produce an alert.
2. WHEN a new list item does not match the filter, THE SYSTEM SHALL NOT fire `newItem`.
3. WHEN an item that was already present reappears unchanged, THE SYSTEM SHALL NOT fire `newItem`.
4. THE SYSTEM SHALL support filter predicates comparing an item field with operators including equals,
   less-than-or-equal, greater-than-or-equal, and contains.

#### REQ-RULES-07: Rules operate on normalized values

**User Story:** As a developer, I want rules to compare normalized values, so that noise is filtered
   before rules ever run.

**Acceptance Criteria:**
1. THE SYSTEM SHALL evaluate rules against the normalized diff, never against raw markup.
2. THE SYSTEM SHALL implement rule builders as pure functions of a diff.

### 3.6 Alerts

#### REQ-ALERTS-01: AlertSink port

**User Story:** As a developer, I want alerts to go through a sink port, so that the local outbox and
   email are interchangeable.

**Acceptance Criteria:**
1. THE SYSTEM SHALL define an `AlertSink` port with a send operation for one alert.
2. THE SYSTEM SHALL let the runner depend on the port, not on any specific sink.

#### REQ-ALERTS-02: Local outbox default

**User Story:** As an operator running locally with no accounts, I want alerts written to an outbox on
   disk, so that I can see them without any email service.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide `OutboxAlertSink` that writes alerts as JSON Lines and as rendered email
   files under the app's `.ghost-data/` directory.
2. THE SYSTEM SHALL provide `ConsoleAlertSink` for dev use.
3. THE SYSTEM SHALL use a local sink by default; no environment variable SHALL be required to run
   locally.

#### REQ-ALERTS-03: Amazon SES adapter, opt-in

**User Story:** As an operator who wants real email, I want an SES adapter that is opt-in by
   environment variable, so that local runs stay free and email is a conscious choice.

**Acceptance Criteria:**
1. WHEN the environment selects SES, THE SYSTEM SHALL use `SesEmailAlertSink` built on Amazon SES v2.
2. THE SYSTEM SHALL NOT construct any cloud client unless the cloud sink is explicitly selected.
3. Tests SHALL NOT construct a real cloud client or send real email.

#### REQ-ALERTS-04: Explain every alert

**User Story:** As a non-developer, I want each alert to say in one plain sentence what changed, from
   what to what, and which rule fired, so that I understand it without reading code.

**Acceptance Criteria:**
1. THE SYSTEM SHALL generate one plain-English summary sentence per alert naming the watched value, the
   from and to values, and the rule that fired.
2. THE SYSTEM SHALL phrase summaries in terms a non-developer understands, avoiding selector names and
   internal ids where possible.

#### REQ-ALERTS-05: Alert content

**User Story:** As a developer, I want a structured alert record, so that the outbox and dashboard can
   render it.

**Acceptance Criteria:**
1. THE SYSTEM SHALL include in each alert the watch id, URL, rule kind, the affected field or list,
   normalized before and after values, the summary sentence, and a timestamp.

### 3.7 Ghost Dashboard

#### REQ-DASH-01: Server-rendered dashboard

**User Story:** As an operator, I want a dashboard I open in a browser to see all my ghosts at once,
   so that I do not need to read JSON.

**Acceptance Criteria:**
1. THE SYSTEM SHALL serve a dashboard from `node:http` as server-rendered HTML plus one small vanilla
   JavaScript module and one stylesheet, with no front-end build step.
2. THE SYSTEM SHALL serve the dashboard without any web framework.

#### REQ-DASH-02: One ghost per watch

**User Story:** As an operator, I want each watch shown as a ghost card, so that I can see the status
   of every watcher at a glance.

**Acceptance Criteria:**
1. THE SYSTEM SHALL render one ghost card per watch.
2. THE SYSTEM SHALL show, per ghost, the watch name, the watched URL, the last check time, and the last
   check status.

#### REQ-DASH-03: A ghost glows on change

**User Story:** As an operator, I want a ghost to glow when something I care about changed, so that
   new alerts are impossible to miss.

**Acceptance Criteria:**
1. WHEN a watch has one or more unacknowledged alerts, THE SYSTEM SHALL render that ghost in a glowing
   state.
2. WHEN a watch has no unacknowledged alerts, THE SYSTEM SHALL render that ghost dormant.

#### REQ-DASH-04: Acknowledge

**User Story:** As an operator, I want to acknowledge a ghost's alerts, so that it stops glowing once I
   have seen them.

**Acceptance Criteria:**
1. WHEN the user acknowledges a ghost's alerts, THE SYSTEM SHALL mark those alerts acknowledged and
   SHALL render the ghost dormant.
2. THE SYSTEM SHALL persist acknowledgment across dashboard restarts.
3. THE SYSTEM SHALL support acknowledging a ghost without a mouse (keyboard operable).

#### REQ-DASH-05: Check now

**User Story:** As an operator, I want to trigger a check on demand for one watch, so that I do not
   have to wait for the next scheduled interval.

**Acceptance Criteria:**
1. WHEN the user triggers "check now" for a watch, THE SYSTEM SHALL run a check for that watch
   immediately.
2. "check now" SHALL still honor robots.txt and per-host concurrency; it is permitted to bypass the
   per-URL minimum interval because it is an explicit, user-initiated action (recorded assumption).
3. WHILE a manual check is in flight for a watch, THE SYSTEM SHALL indicate that state on the ghost
   card.

#### REQ-DASH-06: JSON API

**User Story:** As a developer or test, I want a JSON API behind the dashboard, so that I can drive it
   programmatically and write end-to-end tests.

**Acceptance Criteria:**
1. THE SYSTEM SHALL expose endpoints returning ghosts and their alerts as JSON.
2. THE SYSTEM SHALL expose endpoints to acknowledge a ghost and to trigger "check now".
3. THE SYSTEM SHALL keep the JSON API on the same `node:http` server as the dashboard.

#### REQ-DASH-07: Spooky but legible

**User Story:** As an operator, I want a haunted theme that is still readable and accessible, so that
   the delight does not get in the way of the data.

**Acceptance Criteria:**
1. THE SYSTEM SHALL apply a haunted theme to the dashboard while keeping readable color contrast.
2. THE SYSTEM SHALL be operable by keyboard.
3. WHILE the user has reduced-motion enabled, THE SYSTEM SHALL disable glow animation and other motion.

#### REQ-DASH-08: Dashboard ports

**User Story:** As an operator running both apps, I want distinct ports so the two dashboards do not
   collide.

**Acceptance Criteria:**
1. THE SYSTEM SHALL run the bonus-watch dashboard on port 3130 and its fixtures on 3131.
2. THE SYSTEM SHALL run the listing-watch dashboard on port 3132 and its fixtures on 3133.
3. E2E test runs SHALL use ports 3134 through 3137.

### 3.8 bonus-watch App

#### REQ-BONUS-01: Invented example banks

**User Story:** As a demo user, I want bonus-watch to watch invented example banks, so that I can see
   how it works without impersonating a real bank.

**Acceptance Criteria:**
1. THE SYSTEM SHALL define watches for invented example banks using invented names, `example.com`
   emails, and `555-01xx` phone numbers.
2. THE SYSTEM SHALL NOT imply any endorsement of or relationship to a real bank.

#### REQ-BONUS-02: Watched bonus fields

**User Story:** As a bonus hunter, I want to track bonus amount, minimum deposit, deadline, and fine
   print, so that I catch changes to the terms I care about.

**Acceptance Criteria:**
1. THE SYSTEM SHALL watch the bonus amount as a `money` field.
2. THE SYSTEM SHALL watch the minimum deposit as a `money` field.
3. THE SYSTEM SHALL watch the deadline as a `date` field.
4. THE SYSTEM SHALL watch the fine print as a `text` field.

#### REQ-BONUS-03: Bonus rules

**User Story:** As a bonus hunter, I want alerts when the bonus rises or falls, when the deadline or
   fine print changes, and when terms appear or disappear.

**Acceptance Criteria:**
1. THE SYSTEM SHALL alert on `wentUp` and `wentDown` for the bonus amount.
2. THE SYSTEM SHALL alert on `changed` for the deadline and the fine print.
3. THE SYSTEM SHALL alert on `appeared` and `disappeared` for the bonus fields where meaningful.

#### REQ-BONUS-04: Local fixture site

**User Story:** As a tester, I want a local fixture site with versioned bonus pages and robots.txt, so
   that end-to-end tests can change the page deterministically without scraping a live bank.

**Acceptance Criteria:**
1. THE SYSTEM SHALL ship a fixture site serving numbered versions (`v1`, `v2`, ...) of each bonus page.
2. THE SYSTEM SHALL serve a fixture `robots.txt`.
3. THE SYSTEM SHALL expose `POST /__fixture/advance` to switch the current version and
   `GET /__fixture/log` to inspect requests.

#### REQ-BONUS-05: End-to-end test

**User Story:** As a maintainer, I want a Playwright test that drives the real dashboard against the
   fixture, so that I know the whole app works end to end.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide a Playwright end-to-end test that starts the bonus-watch dashboard and its
   fixture server.
2. THE SYSTEM SHALL, in that test, advance the fixture to a changed version and assert that the ghost
   glows and an alert reaches the outbox.

#### REQ-BONUS-06: Built only from the public API

**User Story:** As a maintainer, I want the app built only from the template's public API, so that it
   stays portable as the template evolves.

**Acceptance Criteria:**
1. THE bonus-watch app SHALL import only from `@ghost-watcher/template`.
2. THE bonus-watch app SHALL NOT import from template internals.

#### REQ-BONUS-07: No financial advice

**User Story:** As a user, I want the app to report what a page says and nothing more, so that I am not
   given financial advice.

**Acceptance Criteria:**
1. THE SYSTEM SHALL present bonus-watch output as a report of what the page says.
2. THE SYSTEM SHALL NOT recommend, rank, or advise on any financial product.

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
1. THE SYSTEM SHALL let a `newItem` rule filter list items by price, beds, and neighborhood.
2. WHEN a new listing does not match the filter, THE SYSTEM SHALL NOT alert.

#### REQ-LISTING-03: Permit type filter

**User Story:** As a civic watcher, I want to filter permits by permit type, so that I am alerted only
   about the permit types I track.

**Acceptance Criteria:**
1. THE SYSTEM SHALL let a `newItem` rule filter permit items by permit type.

#### REQ-LISTING-04: Local fixture site

**User Story:** As a tester, I want a local fixture site with versioned listing and permit pages plus
   robots.txt, so that end-to-end tests can change the page deterministically.

**Acceptance Criteria:**
1. THE SYSTEM SHALL ship a fixture site serving numbered versions of each listing and permit page.
2. THE SYSTEM SHALL serve a fixture `robots.txt`.
3. THE SYSTEM SHALL expose `POST /__fixture/advance` and `GET /__fixture/log`.

#### REQ-LISTING-05: End-to-end test

**User Story:** As a maintainer, I want a Playwright test that drives the listing-watch dashboard
   against its fixture, so that I know the whole app works end to end.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide a Playwright end-to-end test that starts the listing-watch dashboard and its
   fixture server.
2. THE SYSTEM SHALL, in that test, advance the fixture to a version with a new matching item and assert
   that the ghost glows and an alert reaches the outbox.

#### REQ-LISTING-06: Built only from the public API

**User Story:** As a maintainer, I want the app built only from the template's public API.

**Acceptance Criteria:**
1. THE listing-watch app SHALL import only from `@ghost-watcher/template`.
2. THE listing-watch app SHALL NOT import from template internals.

### 3.10 Fixture-Based Testing

#### REQ-TEST-01: Fixture servers with advance and log

**User Story:** As a tester, I want fixture servers that serve numbered page versions and expose
   advance/log endpoints, so that tests can drive page changes deterministically.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide fixture servers that serve the current numbered version of each page.
2. THE SYSTEM SHALL expose `POST /__fixture/advance` to advance to the next version and
   `GET /__fixture/log` to return the recorded request log.

#### REQ-TEST-02: Tests never scrape live sites

**User Story:** As a maintainer, I want tests to never touch the real internet, so that the suite is
   hermetic and safe.

**Acceptance Criteria:**
1. THE SYSTEM SHALL run all tests against fixture servers on `127.0.0.1`.
2. THE SYSTEM SHALL NOT scrape any live site in any test.

#### REQ-TEST-03: Rules and normalizers have unit tests including noise cases

**User Story:** As a maintainer, I want every rule and normalizer unit-tested, including cases that must
   not alert, so that noise stays out of alerts.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide unit tests for every normalizer covering both equality and inequality.
2. THE SYSTEM SHALL provide unit tests for every rule builder covering fire and no-fire cases.
3. THE SYSTEM SHALL include noise cases (whitespace, date format, tracking parameters, missing ad slot,
   page-generated stamp) that assert no alert is produced.

#### REQ-TEST-04: Template unit and integration tests

**User Story:** As a maintainer, I want Vitest unit and integration tests for the template, so that the
   skeleton is verified independently of the apps.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide Vitest unit tests for normalize, extract, diff, rules, robots, summary, and
   the adapters' local defaults.
2. THE SYSTEM SHALL provide Vitest integration tests for the runner using a fake fetcher and
   `MemorySnapshotStore`, covering `ok`, `skipped`, and `error` paths.

#### REQ-TEST-05: App end-to-end tests with Playwright

**User Story:** As a maintainer, I want each app to have a Playwright end-to-end test, so that the full
   dashboard-to-outbox path is verified.

**Acceptance Criteria:**
1. THE SYSTEM SHALL provide a Playwright end-to-end test for bonus-watch and one for listing-watch.
2. THE SYSTEM SHALL have each end-to-end test drive the real dashboard, change the fixture, and assert
   the ghost glows and an alert reaches the outbox.

#### REQ-TEST-06: Tests never construct real cloud clients

**User Story:** As a maintainer, I want tests to never build real cloud clients, so that the suite
   cannot accidentally incur cost or touch a cloud.

**Acceptance Criteria:**
1. Tests SHALL NOT construct real AWS S3 or SES clients.
2. Tests SHALL NOT touch any network beyond `127.0.0.1`.

## 4. Non-Functional Requirements

#### REQ-NF-01: Stack and tooling

1. THE SYSTEM SHALL be written in strict TypeScript as ES modules targeting Node.js 20 or newer.
2. THE SYSTEM SHALL run TypeScript via `tsx` at runtime and SHALL pass `tsc --noEmit` as the type check.
3. THE SYSTEM SHALL use `cheerio` for HTML parsing and SHALL NOT use a headless browser in the watcher.
4. THE SYSTEM SHALL use Vitest for unit and integration tests and Playwright for end-to-end tests.

#### REQ-NF-02: Workspaces and lockfile

1. THE SYSTEM SHALL use npm workspaces with a single lockfile at the repository root.
2. THE SYSTEM SHALL publish the template as package `@ghost-watcher/template`.

#### REQ-NF-03: Code style and result types

1. THE SYSTEM SHALL NOT use the `any` type.
2. THE SYSTEM SHALL prefer discriminated unions with `ok` / `skipped` / `error` statuses for results.
3. THE SYSTEM SHALL implement normalize, extract, diff, and rules as pure functions; side effects SHALL
   live only in adapters and the runner.

#### REQ-NF-04: Free by default, cloud opt-in

1. THE SYSTEM SHALL run locally with no accounts.
2. Paid services (email, cloud storage) SHALL sit behind adapters and SHALL be opt-in by environment
   variable (`GHOST_STORE`, `GHOST_ALERTS`).
3. The default adapter SHALL always be the local adapter.

#### REQ-NF-05: Runtime data is git-ignored

1. THE SYSTEM SHALL write runtime data to `<app>/.ghost-data/` and SHALL git-ignore that directory.

## 5. Requirements Added After Review

These were added by hand after a review of a clean clone. See `KIRO-LOG.md`.

#### REQ-DASH-SEC-01: The dashboard only takes orders from itself

**User Story:** As someone running a watcher on my laptop, I want other web pages to be unable to
   drive my dashboard, so that a malicious page cannot make the watcher fetch on its behalf.

**Acceptance Criteria:**
1. WHEN a request names a Host that is not `localhost`, a loopback address or a host listed in
   `GHOST_ALLOWED_HOSTS`, THE SYSTEM SHALL answer 403 and SHALL NOT run any check.
2. WHEN a POST request carries an `Origin` that differs from the dashboard's own origin, THE SYSTEM
   SHALL answer 403 and SHALL NOT run any check.
3. WHEN a POST request carries `Sec-Fetch-Site` other than `same-origin` or `none`, THE SYSTEM SHALL
   answer 403.
4. WHEN a POST request carries no `Origin` (a command-line client on the same machine), THE SYSTEM
   SHALL accept it if the Host is allowed.

#### REQ-FETCH-SEC-01: The contact URL must be reachable before visiting real sites

**User Story:** As a site operator, I want the watcher's User-Agent to name a page I can actually
   visit, so that I can reach whoever runs it.

**Acceptance Criteria:**
1. IF any watch points at a host that is neither loopback nor a documentation-only domain AND the
   contact URL is on a documentation-only domain (RFC 2606), THEN THE SYSTEM SHALL refuse to start
   and SHALL name `GHOST_CONTACT_URL` in the error.

#### REQ-DEMO-01: The demo shows a change in one click

**User Story:** As a first-time visitor, I want to see a ghost wake up within seconds, so that I
   understand the product without reading instructions.

**Acceptance Criteria:**
1. WHEN an app starts in `demo` mode, THE SYSTEM SHALL record a baseline for every watch before
   serving the dashboard.
2. WHILE in `demo` mode, THE SYSTEM SHALL show a **Let a night pass** control that advances the
   local fixture site to its next version and then checks every watch.
3. WHILE not in `demo` mode, THE SYSTEM SHALL NOT show that control and SHALL answer 404 to its endpoint.

