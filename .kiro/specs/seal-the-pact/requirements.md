# Requirements: Seal the Pact

## 1. Overview

A dispute pack today compares the page before and after one night's change. In the demo that reads
"Nov 19 vs Nov 19", which proves nothing about what the bank promised on the day the reader applied.

**Seal the pact** fixes that. Each Bonus Crypt stone gets an "I applied today" action. It seals the
watch's current snapshot as the **pact**: the snapshot, its SHA-256, an archived copy of the page and
the date sealed. From then on, every change is compared with the pact as well as with the previous
night, and the dispute pack quotes "what the page promised the day you applied" against what it says
now. When the terms improved after the reader applied, a **bonus match** letter asks the bank to
honour the better terms.

This feature builds on the ghost-watcher-kit spec (`.kiro/specs/ghost-watcher-kit/`) and on the receipt
code in `template/src/receipts.ts` and `template/src/dispute.ts`.

### How criteria are written and cited

Every criterion is one sentence in strict EARS form and states one testable behaviour:

- **WHEN** *trigger* **THE SYSTEM SHALL** *response*.
- **WHILE** *state* **THE SYSTEM SHALL** *response*.
- **IF** *unwanted condition* **THEN THE SYSTEM SHALL** *response*.
- **WHERE** *optional feature is present* **THE SYSTEM SHALL** *response*.
- Ubiquitous: **THE SYSTEM SHALL** *response*.

Requirements are numbered 1 to 11 and criteria `N.M`. A test title names its criterion in the form
`(PACT 3.2)`, for example `it('(PACT 3.2) a pact survives a new GhostStore on the same files', ...)`.
`tasks.md` cites the same numbers.

## 2. Glossary

- **Pact**: the one sealed snapshot of a watch, with its hash, archived copy and the date it was sealed.
- **Seal**: create or replace a pact from the watch's latest stored snapshot.
- **Break**: remove a pact.
- **Previous night**: the snapshot stored before the one a check just took (what the runner diffs today).
- **Pact comparison**: the diff of the pact snapshot against the page as it is now, run through the
  watch's own rules.
- **Pact reference**: the copy of the relevant pact facts stored on an alert (`Alert.pact`).
- **Promised value**: a watched value as the pact snapshot holds it.
- **Exhibit A**: the pact snapshot, quoted in a dispute pack with its hash and archived copy.
- **Dispute letter / bonus match letter**: the two letter variants. The first asks the bank to honour
  the terms of the day the reader applied. The second asks it to honour better terms.
- **Seeded pact**: a pact the demo creates at startup and on rewind, back-dated 40 days.
- **Stone**: the dashboard card of one ghost. **Séance**: the detail drawer of one ghost.
- **Pact-enabled app**: an app that sets `copy.pacts` (bonus-watch does; listing-watch does not).

## 3. Requirements

### Requirement 1: Seal the pact

**User Story:** As someone who just applied for a bonus, I want to seal the page as it is today, so
that I can later prove what it promised the day I applied.

**Acceptance Criteria:**
1. WHEN a reader seals a watch that has a stored snapshot and no pact, THE SYSTEM SHALL store that watch's latest snapshot, unchanged, as the pact snapshot.
2. WHEN a pact is sealed, THE SYSTEM SHALL record the SHA-256 of the pact snapshot, computed with `snapshotSha256`.
3. WHEN a pact is sealed, THE SYSTEM SHALL record the date sealed as the ISO time of the injected `Clock`.
4. WHEN a pact is sealed and a `PageArchiver` is configured, THE SYSTEM SHALL ask it once to save the watch URL and record the archive URL, the capture time and the archive's label.
5. WHERE no `PageArchiver` is configured, THE SYSTEM SHALL seal the pact with the hash only and the note "Archiving is off; the snapshot hash is the pact."
6. IF the archiver fails while a pact is sealed, THEN THE SYSTEM SHALL still seal the pact with its hash and record the note "Could not reach <archive label>: <reason>".
7. IF a watch has no stored snapshot, THEN THE SYSTEM SHALL refuse to seal, store nothing and report `no-snapshot`.
8. WHEN a pact is sealed, THE SYSTEM SHALL record the taken-at time of the snapshot it sealed, so the reader can see how old that reading was.
9. WHEN a pact is sealed, THE SYSTEM SHALL NOT fetch the watched page.

### Requirement 2: One pact per watch

**User Story:** As a reader, I want exactly one pact per watch that I can replace or break on purpose,
so that a stray click never throws away my proof.

**Acceptance Criteria:**
1. THE SYSTEM SHALL hold at most one pact per watch.
2. IF a seal is requested while a readable pact exists and the request does not confirm replacement, THEN THE SYSTEM SHALL leave the pact unchanged and report `exists` with the current pact's date and hash.
3. WHEN a seal is requested with confirmed replacement, THE SYSTEM SHALL replace the pact and delete the old pact snapshot.
4. IF writing a replacement pact fails, THEN THE SYSTEM SHALL keep the old pact readable.
5. WHEN a reader breaks the pact, THE SYSTEM SHALL delete the pact record and its snapshot.
6. WHEN a reader breaks a watch that has no pact, THE SYSTEM SHALL succeed and report that nothing was removed.
7. WHEN a pact is replaced or broken, THE SYSTEM SHALL leave the pact references already stored on alerts unchanged.

### Requirement 3: Storage

**User Story:** As a reader, I want my pact to survive restarts and to live wherever my other data
lives, so that the proof is still there months later.

**Acceptance Criteria:**
1. THE SYSTEM SHALL keep a watch's pact in the existing `GhostStore` under `pacts/<watchId>/`, as one `pact.json` record and one snapshot document named `<sha256>.json`.
2. THE SYSTEM SHALL write the snapshot document with `serializeJson`, so `shasum -a 256` on the file reproduces the recorded hash.
3. WHEN a new `GhostStore` opens the same file store, THE SYSTEM SHALL read back an identical pact.
4. WHEN a pact is written through `S3BlobStore` (with a fake client), THE SYSTEM SHALL read back an identical pact.
5. WHEN snapshot history is pruned, THE SYSTEM SHALL NOT delete the pact snapshot.
6. WHEN `GhostStore.clear` runs, THE SYSTEM SHALL delete every pact.
7. WHEN a pact snapshot is read, THE SYSTEM SHALL upgrade legacy money values the way `latestSnapshot` does, after checking the hash on the stored bytes.

### Requirement 4: A corrupt or unreadable pact

**User Story:** As a reader, I want a damaged pact to be reported plainly and never to break my
checks, so that I can break it or seal it again.

**Acceptance Criteria:**
1. IF `pact.json` is not valid JSON or lacks a required field, THEN THE SYSTEM SHALL report the pact as `corrupt` with a reason and not throw.
2. IF the pact snapshot document is missing, THEN THE SYSTEM SHALL report the pact as `corrupt`.
3. IF the SHA-256 of the stored snapshot bytes differs from the recorded hash, THEN THE SYSTEM SHALL report the pact as `corrupt`.
4. WHILE a pact is corrupt, THE SYSTEM SHALL run checks as if there were no pact and never fail a check because of it.
5. WHILE a pact is corrupt, THE SYSTEM SHALL accept a seal request without confirmation.
6. WHILE a pact is corrupt, THE SYSTEM SHALL accept a break request and remove every document under that watch's pact path.

### Requirement 5: Compare against the pact and the previous night

**User Story:** As a reader, I want every change judged against what I was promised as well as against
last night, so that a small step or a slow drift still raises a flag.

**Acceptance Criteria:**
1. WHEN a check finds a change and a readable pact exists, THE SYSTEM SHALL compare the page with the pact snapshot using the same normalized diff and the watch's own rules.
2. WHEN a finding is about a field that now differs from the promised value, THE SYSTEM SHALL attach a pact reference with the sealed date, the hash, the promised value, the tone and a one-sentence note.
3. WHEN last night's step is too small for a rule but the total change since the pact meets it, THE SYSTEM SHALL raise a finding whose summary starts "Since you applied on <date>:".
4. WHEN a field drifts over several nights in steps that each fall under a rule's `minDelta`, THE SYSTEM SHALL raise a finding on the night the total crosses it.
5. WHEN a field changed tonight and now equals its promised value, THE SYSTEM SHALL mark its finding `restored` and raise no extra finding.
6. WHEN no watched field changed tonight, THE SYSTEM SHALL raise no pact finding.
7. WHEN a field changed since the pact while the watch's headline fields did not, THE SYSTEM SHALL mark the finding as a bait and switch.
8. WHEN the pact comparison handles money, THE SYSTEM SHALL compare and subtract integer `amountMinor` values and convert cents to text only for display.
9. WHEN a page differs from the pact only in whitespace, date format, tracking parameters or other noise, THE SYSTEM SHALL raise no pact finding.
10. WHEN a finding carries a pact reference, THE SYSTEM SHALL set its tone from the field's `better` direction measured against the promised value.
11. WHEN a pact finding is a shriek or a bait and switch, THE SYSTEM SHALL keep a receipt for it exactly as `needsReceipt` does today.
12. WHEN no pact exists, THE SYSTEM SHALL produce findings and alerts identical to the build without this feature.

### Requirement 6: The dispute pack uses the pact

**User Story:** As a reader, I want the dispute letter to say "the day I applied" and quote the page
as it was then, so that the bank cannot say I am comparing two nights.

**Acceptance Criteria:**
1. WHEN an alert carries a pact reference with relation `differs`, THE SYSTEM SHALL fill the application date in the letter and the complaint text from the pact's sealed date.
2. WHEN the application date is filled, THE SYSTEM SHALL drop `[Date you applied]` from the pack's blanks and keep the other three.
3. WHEN an alert carries a pact reference with relation `differs`, THE SYSTEM SHALL quote the promised value as "what the page promised the day you applied" against the value now.
4. WHEN an alert carries a pact reference with relation `differs`, THE SYSTEM SHALL set `beforeDate` to the sealed date and `afterDate` to the alert's date.
5. WHEN an alert carries a pact reference, THE SYSTEM SHALL list Exhibit A as evidence: the pact's archive link, its SHA-256 and a `shasum` command for the pact snapshot.
6. IF the pact has no archived copy, THEN THE SYSTEM SHALL say so in Exhibit A and give the recorded note.
7. WHEN an alert carries a pact reference with relation `restored`, THE SYSTEM SHALL fill only the application date and keep the rest of the pack as it is without a pact.
8. WHEN an alert has no pact reference, THE SYSTEM SHALL build exactly the same pack as the build without this feature.
9. THE SYSTEM SHALL build the same pack, word for word, from the same alert.

### Requirement 7: The bonus match letter

**User Story:** As a reader whose bank improved the offer after I applied, I want a letter that asks
for the better terms, so that I get the bigger bonus or the lower fee.

**Acceptance Criteria:**
1. WHEN an alert's pact reference has relation `differs`, tone `good` and no bait-and-switch mark, THE SYSTEM SHALL build the bonus match variant.
2. WHEN an alert's pact reference has tone `bad`, no tone or a bait-and-switch mark, THE SYSTEM SHALL build the dispute variant.
3. WHEN the bonus match variant is built, THE SYSTEM SHALL use the subject "Request to match the improved terms of <offer>" and ask the bank to honour the better terms in writing within 30 days.
4. WHEN the bonus match variant is built, THE SYSTEM SHALL quote the promised value and the better value with their dates and list Exhibit A with its hash.
5. WHEN the bonus match variant is built, THE SYSTEM SHALL NOT mention a CFPB complaint in the letter.
6. WHEN a lower annual fee or a lower minimum deposit follows a pact, THE SYSTEM SHALL treat it as better terms and build the bonus match variant.

### Requirement 8: Demo seeding

**User Story:** As a viewer of the demo, I want the pack to read "Oct 10, the day you applied" against
"Nov 19, what it says now", so that the idea is clear without waiting 40 days.

**Acceptance Criteria:**
1. WHEN the demo takes its first sighting, THE SYSTEM SHALL seal a pact for every pact-enabled watch that has a snapshot, dated 40 days before the injected clock's now.
2. WHEN a pact is seeded, THE SYSTEM SHALL set the seeded snapshot's `takenAt` to the seeded date and mark the pact `seeded: 'demo'`.
3. WHEN a pact is seeded, THE SYSTEM SHALL NOT call the archiver and SHALL record the note "Demo pact: back-dated for the demo, so no archived copy was made."
4. WHEN the demo is rewound, THE SYSTEM SHALL seed the pacts again after the new baseline.
5. WHEN a night passes in the demo, THE SYSTEM SHALL produce a Lanternfield pack that reads the seeded date as the day applied and today as the date now.
6. THE SYSTEM SHALL read every date in seeding, comparison and dispute code from the injected `Clock` or from stored ISO strings.
7. WHERE a pact page URL or archive label is shown, THE SYSTEM SHALL show it the way alerts and receipts show it today.
8. WHILE the app is not in demo mode, THE SYSTEM SHALL create a pact only when a reader asks for one.

### Requirement 9: HTTP routes

**User Story:** As the dashboard client, I want small, guarded routes for the pact, so that sealing,
reading and breaking are explicit actions.

**Acceptance Criteria:**
1. WHEN `GET /api/ghosts/:id/pact` is called, THE SYSTEM SHALL answer `{ state: 'none' | 'sealed' | 'corrupt', pact }` with the pact's date, hashes and archive facts and without the snapshot body.
2. WHEN `POST /api/ghosts/:id/pact` seals a pact, THE SYSTEM SHALL answer 201 with the pact and the archive outcome.
3. IF `POST /api/ghosts/:id/pact` finds a readable pact and no `confirmReplace: true` in the body, THEN THE SYSTEM SHALL answer 409 with code `pact-exists` and change nothing.
4. IF `POST /api/ghosts/:id/pact` finds no snapshot, THEN THE SYSTEM SHALL answer 409 with code `no-snapshot`.
5. IF the request body is larger than 1 KiB or is not a JSON object, THEN THE SYSTEM SHALL answer 413 or 400 and change nothing.
6. WHEN `DELETE /api/ghosts/:id/pact` is called, THE SYSTEM SHALL break the pact and answer `{ state: 'none', removed }`.
7. IF a `POST` or `DELETE` pact request comes from a foreign Origin or Host, THEN THE SYSTEM SHALL answer 403 through the existing guard and change nothing.
8. IF the ghost id is unknown, or the app does not set `copy.pacts`, THEN THE SYSTEM SHALL answer 404 on all three pact methods.
9. WHEN `GET /api/state` is called on a pact-enabled app, THE SYSTEM SHALL include for each ghost a pact badge and a `canSeal` flag.

### Requirement 10: The dashboard

**User Story:** As a reader, I want to seal, see and break the pact from the Bonus Crypt, so that I
never leave the dashboard.

**Acceptance Criteria:**
1. WHERE the app is pact-enabled and a ghost has a snapshot and no pact, THE SYSTEM SHALL show an "I applied today" button on its stone.
2. WHILE a ghost has no snapshot, THE SYSTEM SHALL show the button disabled with a reason in its accessible description.
3. WHILE a pact is sealed, THE SYSTEM SHALL show on the stone "Pact sealed" with the compact date and the short hash.
4. WHILE a pact is corrupt, THE SYSTEM SHALL show "Pact unreadable" on the stone.
5. WHEN a reader seals from a stone, THE SYSTEM SHALL update that stone and show a toast naming the watch and the short hash.
6. IF the archive was unreachable when sealing, THEN THE SYSTEM SHALL say in the toast that the pact has its hash only.
7. WHEN a reader asks to seal again or to break the pact, THE SYSTEM SHALL show an in-page confirmation and change nothing until the reader confirms.
8. WHEN a reader cancels the confirmation, THE SYSTEM SHALL leave the pact as it was and return focus to the button that opened it.
9. WHILE the séance is open for a ghost with a pact, THE SYSTEM SHALL show the pact section: sealed date, full hash, archived-copy link or "hashes only", the age of the sealed reading and a "demo pact" tag when seeded.
10. WHILE a pact is sealed, THE SYSTEM SHALL add a column "The day you applied" to the séance value table.
11. WHEN an alert has a pact reference, THE SYSTEM SHALL show its note in Spirit mail and in the haunting log, and label the button "Ask for the match" for the bonus match variant.
12. THE SYSTEM SHALL make every pact control reachable and operable by keyboard, give it an accessible name that includes the watch name, and meet the text contrast of the existing dashboard.
13. THE SYSTEM SHALL title the pack "Dispute pack" or "Bonus match" by variant, and head its columns "<date>, the day you applied: what the page promised" and "<date>: what it says now".

### Requirement 11: Constraints

**User Story:** As the maintainer, I want the feature to keep the repository's rules, so that nothing
else breaks.

**Acceptance Criteria:**
1. THE SYSTEM SHALL add no dependency to any `package.json`.
2. THE SYSTEM SHALL make no network call in a test beyond `127.0.0.1` and fake clients.
3. THE SYSTEM SHALL escape every pact value before writing it into HTML.
4. THE SYSTEM SHALL let apps use pacts only through exports of `template/src/index.ts`.
5. WHERE an app does not set `copy.pacts`, THE SYSTEM SHALL behave exactly as before, including the listing-watch dashboard and API.
