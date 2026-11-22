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

Requirements are numbered 1 to 12 and criteria `N.M`. A test title names its criterion in the form
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
1. WHEN the demo takes its first sighting, THE SYSTEM SHALL seal a pact for every pact-enabled watch that has a snapshot and is not listed in the app's `copy.demoUnsealed`, dated 40 days before the injected clock's now. (Requirement 13 leaves one bonus ghost unsealed, 13.12 and 13.13.)
2. WHEN a pact is seeded, THE SYSTEM SHALL set the seeded snapshot's `takenAt` to the seeded date and mark the pact `seeded: 'demo'`.
3. WHEN a pact is seeded and no dated stand-in archive is available, THE SYSTEM SHALL record the note "Demo pact: back-dated for the demo, so no archived copy was made." (Requirement 12 adds the dated stand-in copy, 12.25 to 12.28.)
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
2. WHILE a ghost that robots.txt has not turned away has no snapshot, THE SYSTEM SHALL show the button disabled with a reason in its accessible description. (A turned-away ghost shows no button: 12.20 to 12.24.)
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

### Requirement 12: Pact copy and state

**User Story:** As a reader, I want the pact's wording, dates, hosts and demo state to read plainly and
truthfully, so that a letter or a stone never repeats itself, shows a fixture address or promises
something the ghost cannot do.

**Acceptance Criteria:**

*Pact note wording (`pact.ts`)*

1. WHEN a pact note names a field after "the day you applied,", THE SYSTEM SHALL write the label as "the" plus the label in lower case, and keep a label whose second letter is also a capital (such as "APY") as it is.
2. THE SYSTEM SHALL end every pact note with exactly one full stop, placed after any closing quotation mark and never inside it.
3. WHEN a fine-print sentence was edited rather than added, THE SYSTEM SHALL quote in the pact note only the changed words of the old and the new sentence, with at most two words of context on each side.
4. WHEN a fine-print sentence is wholly new, THE SYSTEM SHALL quote that sentence whole in the pact note as something the page now says.

*Back-dated pacts (`ui/render.js`)*

5. WHEN the sealed reading and the seal share the same moment, THE SYSTEM SHALL describe the reading as "the reading taken when it was sealed" and SHALL NOT say "just now".
6. WHEN the sealed reading is older than the seal, THE SYSTEM SHALL say how old the reading was when it was sealed.

*Dispute letters quote the old clause (`dispute.ts`)*

7. WHEN a fine-print sentence was edited, THE SYSTEM SHALL quote the old sentence in full, as it read, on the "before" side of the letter and the pack.
8. WHEN a fine-print sentence was edited, THE SYSTEM SHALL quote the new sentence in full on the "after" side of the letter and the pack.
9. WHEN a fine-print sentence is wholly new, THE SYSTEM SHALL say on the "before" side that the page "did not say" it.

*No repeated line*

10. WHEN an alert is a Bait and switch and its pact's promised value equals the value the alert records as before, THE SYSTEM SHALL show no pact note on that alert's dashboard row.
11. WHEN an alert is a Bait and switch and its pact's promised value equals the value the alert records as before, THE SYSTEM SHALL leave the pact note out of the dispute letter and the alert email.
12. WHEN an alert is a Bait and switch and its pact's promised value differs from the value the alert records as before, THE SYSTEM SHALL keep the pact note on its dashboard row.

*Display host*

13. WHERE a watch sets an optional `displayUrl`, THE SYSTEM SHALL accept only an http or https URL, and refuse the watch definition otherwise.
14. WHERE a watch sets `displayUrl`, THE SYSTEM SHALL show it instead of the fetch URL in the dispute letter, the complaint text and the pack's "Page" row.
15. WHERE a watch sets `displayUrl`, THE SYSTEM SHALL show it instead of the fetch URL in the alert email (text and link).
16. WHERE a watch sets `displayUrl`, THE SYSTEM SHALL show it instead of the fetch URL on the dashboard stone and in the séance.
17. WHERE a watch sets `displayUrl`, THE SYSTEM SHALL still fetch the page, read robots.txt, hash the snapshot and ask the archiver using the fetch URL.
18. WHERE a watch sets `displayUrl` and it differs from the fetch URL, THE SYSTEM SHALL add a "Fetched from" evidence row to the pack that names the fetch URL.
19. THE SYSTEM SHALL give each of the four bonus-watch watches and each of the four Haunted Listings watches a `displayUrl` on a reserved `.example` domain.

*Turned-away stone*

20. WHILE a ghost is turned away by robots.txt, THE SYSTEM SHALL NOT show "I applied today" on its stone.
21. WHILE a ghost is turned away by robots.txt, THE SYSTEM SHALL NOT show the hint "Not seen yet. Summon the ghost first." on its stone.
22. WHILE a ghost is turned away by robots.txt, THE SYSTEM SHALL NOT show "I applied today" or that hint in its séance.
23. WHILE a ghost is turned away by robots.txt, THE SYSTEM SHALL show "Check now" in its séance as a quiet secondary button (the stone has no such button).
24. WHILE a ghost is turned away by robots.txt, THE SYSTEM SHALL show on its stone and in its séance the line "The site's robots.txt asks watchers to stay away, so the ghost does not visit and cannot seal a pact."

*Demo pact with a stand-in archived copy*

25. WHEN the demo seeds a pact and a stand-in archive that can date a copy is available, THE SYSTEM SHALL save one copy of the page through it, dated on the pact's sealed date, and record the copy's link, capture time and archive label in the pact.
26. WHEN the fixture's stand-in archive is asked for a dated copy, THE SYSTEM SHALL answer with a copy whose capture time is the requested date.
27. IF the stand-in archive cannot save the dated copy, THEN THE SYSTEM SHALL still seed the pact and record the note "Could not reach <archive label>: <reason>".
28. WHEN an alert carries a seeded pact with a dated copy, THE SYSTEM SHALL list that copy's link in Exhibit A instead of "none".

*Scoped pact steering and a custom agent*

29. THE SYSTEM SHALL keep `.kiro/steering/pact.md` with front matter `inclusion: fileMatch` and a `fileMatchPattern` that matches `pact*.ts`, `sealing.ts` and `dispute.ts` in `template/src` and their tests.
30. THE SYSTEM SHALL keep five to eight bullets in `.kiro/steering/pact.md`.
31. THE SYSTEM SHALL keep `.kiro/agents/pact-keeper.json` with `pact.md`, `testing.md`, `tech.md` and `structure.md` as `file://` resources.
32. THE SYSTEM SHALL let the `pact-keeper` agent use `fs_read`, `fs_write` and the shell tool (`execute_bash`, the kiro-cli name for "run command"), and give it a one-paragraph prompt.
33. WHEN `kiro-cli agent validate --path .kiro/agents/pact-keeper.json` runs, THE SYSTEM SHALL exit with code 0.

### Requirement 13: The sealing ceremony

**User Story:** As a judge or a viewer of a video, I want to press "I applied today" on a stone that has
no pact and watch the seal stamp down, so that sealing a pact is a moment I can see and not a toast.

**Acceptance Criteria:**

*The ceremony (`ui/render.js`, `ui/app.js`, `ui/style.css`)*

1. WHEN the server answers that a pact was sealed for a request made from the dashboard, THE dashboard SHALL play the ceremony on that ghost's stone.
2. WHEN the ceremony plays, THE dashboard SHALL draw a red wax seal bearing the ghost crest as inline SVG on the stone, with no image file.
3. WHEN the ceremony starts, THE seal SHALL stamp down from scale 1.4 to scale 1 with a brief glow in about 600 ms.
4. WHEN the seal has stamped, THE dashboard SHALL type the pact's full SHA-256 under it character by character over about 1 s.
5. WHILE the hash types, THE dashboard SHALL give screen readers the full SHA-256 at once through visually hidden text in an `aria-live` region.
6. WHEN the ceremony ends, THE stone's "Pact sealed" chip SHALL become a small wax badge that stays.
7. WHEN a stone with a sealed pact is drawn on page load or on a refresh, THE dashboard SHALL show the wax badge and SHALL NOT play the ceremony.
8. WHILE the reader prefers reduced motion, THE dashboard SHALL show the seal in its final state at once, with no scale, glow or typing.
9. THE seal SHALL NOT cover the stone's values or buttons.
10. THE ceremony SHALL NOT cause horizontal scroll at a viewport width of 360 px.
11. WHILE the ceremony plays and after it ends, THE dashboard SHALL pass the axe scan with zero violations.

*An unsealed stone to press live (`sealing.ts`, `cli.ts`, `server.ts`, `ui/app.js`)*

12. WHEN the demo seeds pacts, THE SYSTEM SHALL skip each watch the app lists in `copy.demoUnsealed`.
13. THE bonus-watch app SHALL list Bramblewick High-Yield Savings in `copy.demoUnsealed` and no other watch.
14. WHERE the dashboard URL carries `?fresh-pact=<ghost id>` in demo mode, THE dashboard SHALL ask the server to clear that ghost's pact on load.
15. WHERE the dashboard URL carries `?fresh-pact=1` in demo mode, THE dashboard SHALL clear the pact of the first ghost in `copy.demoUnsealed`.
16. WHILE the app is not in demo mode, THE server SHALL answer the clear-pact route with 404 and THE dashboard SHALL NOT send it.
17. IF `?fresh-pact` names no pact-enabled ghost, THEN THE server SHALL answer 404 and clear nothing.

*The static recorded demo (`scripts/static-demo`)*

18. WHEN the static demo is built, THE build SHALL record, at every stop, the seal answer of each `copy.demoUnsealed` ghost and the state, ghost detail and pact routes as they read after that seal.
19. WHEN a visitor presses "I applied today" on an unsealed ghost with a recorded seal on the static site, THE replay SHALL answer with the recorded seal and THE dashboard SHALL play the ceremony.
20. WHILE a ghost has been sealed on the static site, THE replay SHALL answer the state, detail and pact routes of that ghost from the recording made after its seal.
21. WHEN any pact action other than that recorded seal is made on the static site, THE replay SHALL answer 409 `read-only` with the explanation.

*Media and ports (`scripts/record-hero.ts`, `scripts/capture-stills.ts`)*

22. THE hero recording SHALL show the unsealed stone, "I applied today" and the ceremony, then one night, then "Raise the dead" on the Bait and switch letter.
23. THE stills script SHALL write `docs/dispute-pack.png` (the Mossgate dispute pack) and `docs/seal-ceremony.png` (the stone just after sealing).
24. THE hero script SHALL default `HERO_PORT` to 3150 and THE stills script SHALL default `STILLS_PORT` to 3152, both overridable by the environment variable.

### Requirement 14: Slow drift

**User Story:** As a bonus hunter, I want to hear when a bonus is cut in small nightly steps since the day I applied, so that a cut no single night would show is still reported.

**Acceptance Criteria:**

*Detection (`pact.ts`, `runner.ts`)*

1. WHEN a watched field changes on a night and no nightly finding for that field is raised, and the field's total change since the pact meets a rule, THE SYSTEM SHALL raise one finding for that field against the pact.
2. WHEN that finding is raised, THE SYSTEM SHALL word its summary "Drifted since you applied: <pact value> → <now value> over <N> nights". This replaces the "Since you applied on <date>:" wording of criterion 5.3 for checks that run with stored readings.
3. THE SYSTEM SHALL count N as the number of stored readings, newest first, up to but not including the newest reading whose value for the field equals the pact's value.
4. WHEN N is 1, THE SYSTEM SHALL write "1 night".
5. WHILE the total change since the pact is below every rule's threshold, THE SYSTEM SHALL raise no alert for that field.
6. WHEN the finding is a shriek, THE SYSTEM SHALL attach a receipt to its alert.
7. WHEN the drift alert is shown, THE SYSTEM SHALL offer "Raise the dead" with the dispute letter quoting the pact day and the day of the page now.

*The Fernwick Drift fixture (`apps/bonus-watch`)*

8. THE bonus-watch fixture site SHALL serve four versions, and its Fernwick page SHALL show a bonus of $5,000, $4,500, $4,000 and $3,500 in versions 1 to 4.
9. THE Fernwick watch SHALL set `minDelta` on its bonus rule so that no single night, and no total of two nights, meets it, and the total of three nights does.
10. WHEN the demo reaches night 3, THE dashboard SHALL show the Fernwick alert "Drifted since you applied: $5,000 → $3,500 over 3 nights" and no Fernwick alert on nights 1 and 2.
11. WHEN the demo seeds pacts, THE SYSTEM SHALL seal Fernwick's pact like the others.

*Counting (`noise-ratio.ts`)*

12. WHERE the noise measurement is asked to seal pacts, THE SYSTEM SHALL seal each watch's pact after its first reading.
13. THE bonus-watch noise measurement SHALL list the Fernwick drift on night 4 as a change worth knowing and SHALL seal pacts.
14. WHEN the Fernwick drift alert is raised, THE SYSTEM SHALL count it in Tonight's tally as one letter sent.

### Requirement 15: The bonus clock

**User Story:** As a bonus hunter, I want each stone to count down my requirement window and the day the bonus should post, so that I notice a bonus that is late.

**Acceptance Criteria:**

*The window (`watch.ts`, `bonus-clock.ts`, `app.ts` of bonus-watch)*

1. WHERE a watch sets `bonusClock`, THE SYSTEM SHALL hold its requirement text, requirement days, requirement label, posting days and posting label.
2. WHEN a pact is sealed on a watch with a bonus clock, THE SYSTEM SHALL count the requirement day as the pact date plus the requirement days, and the posting day as the requirement day plus the posting days.
3. THE SYSTEM SHALL read "today" for the count from the injected `Clock` and never from `Date.now`.
4. WHILE the requirement day has not passed, THE stone SHALL show "<n> days left to <requirement text>".
5. WHILE the requirement day has passed and the posting day has not, THE stone SHALL show "Bonus due in <n> days".
6. WHEN the posting day has passed and the bonus is not marked posted, THE stone SHALL show "Bonus due, not posted".
7. WHEN the stone shows "Bonus due, not posted", THE stone SHALL offer a "Raise the dead" button for that clock.
8. WHEN "Raise the dead" is pressed on a due clock, THE SYSTEM SHALL open a letter that cites the requirement, the pact date and the posting window.
9. THE séance SHALL show the requirement day and the posting day as dates.

*Bonus posted (`sealing.ts`, `server.ts`, `ui/app.js`)*

10. WHEN "Bonus posted" is pressed, THE SYSTEM SHALL store the posted time in the pact record without asking for confirmation.
11. WHILE the bonus is marked posted, THE stone SHALL show "Bonus posted" and no countdown.
12. WHEN the pact is replaced or broken, THE SYSTEM SHALL drop the posted mark with it.
13. IF the watch has no bonus clock or no sealed pact, THEN THE server SHALL answer the posted route with 409.

*The weekly digest (`digest.ts`, `cli.ts`)*

14. THE SYSTEM SHALL build the digest text with a pure function of the app name, the injected time, each watch's clock reading and each watch's alerts.
15. THE digest SHALL list every clock with its state and every alert raised in the seven days before the injected time.
16. WHEN a week holds no alert, THE digest SHALL say "No changes this week."
17. WHEN `digest` runs, THE SYSTEM SHALL deliver the text through the alert sink as one message.
18. THE Mossgate and Fernwick watches SHALL set a bonus clock, and Fernwick's SHALL be past its posting day on the day the demo starts.

### Requirement 16: The ghost testifies

**User Story:** As a bonus hunter, I want to check in my own browser that a saved copy of the page is the one my pact sealed, so that I can show the bank evidence I did not have to take on trust.

**Acceptance Criteria:**

*The hashing helper (`ui/verify-core.js`)*

1. WHEN the helper is given bytes, THE helper SHALL return their SHA-256 as 64 lowercase hexadecimal characters, computed with `crypto.subtle`.
2. WHEN the helper is given the stored bytes of a snapshot, THE helper SHALL return the same digest as `snapshotSha256`.
3. WHEN the helper compares two hashes, THE helper SHALL ignore letter case and surrounding whitespace.
4. IF the expected hash is not 64 hexadecimal characters, THEN THE helper SHALL report it as invalid and SHALL NOT compare it.
5. WHEN the helper reads a query string, THE helper SHALL return the `copy`, `sha256` and `sealed` values, and `null` for each one that is absent.
6. WHEN the helper is given the sealed ISO time, THE helper SHALL return the date as `Mon D, YYYY` in UTC.
7. IF the copy address is not an `http:` or `https:` address, THEN THE helper SHALL refuse to fetch it.
8. IF fetching the copy throws, THEN THE helper SHALL report the copy as unreachable and SHALL NOT report a match or a mismatch.

*The page (`/verify`)*

9. WHEN `GET /verify` is requested with an accepted Host, THE dashboard SHALL answer the verify page as HTML.
10. WHEN `scripts/static-demo/build.ts` runs, THE script SHALL write the verify page to `verify.html` in the static site.
11. WHEN the query holds a copy address and an expected hash, THE page SHALL fetch the copy and show the result without a button press.
12. WHEN the computed hash equals the expected hash, THE page SHALL show "Matches the pact sealed <date>".
13. WHEN the computed hash differs from the expected hash, THE page SHALL show "Does not match".
14. WHEN the page shows a result, THE page SHALL show the expected hash and the computed hash in full.
15. WHEN a file is chosen, THE page SHALL hash the file's bytes in the browser and show the result.
16. IF the copy cannot be fetched from the browser, THEN THE page SHALL say the browser could not fetch it and SHALL point at the file upload.
17. WHEN the page shows a result, THE page SHALL put the result in a `role="status"` region.
18. WHILE the viewport is 390 px wide, THE page SHALL not scroll sideways.

*The dispute pack*

19. WHEN a dispute pack quotes a sealed pact, THE pack SHALL carry a `verifyUrl` that names `/verify` and holds the copy address, the pact's SHA-256 and the sealed time.
20. WHEN the dispute pack is shown with a `verifyUrl`, THE pack SHALL show a "Verify it" link to it.

*The stored copy (`GET /api/ghosts/:id/pact/snapshot`)*

21. WHEN a readable pact exists, THE server SHALL answer `GET /api/ghosts/:id/pact/snapshot` with the stored snapshot bytes, so that their SHA-256 is the pact's SHA-256.
22. IF the pact is missing or corrupt, THEN THE server SHALL answer that route with 404.

*The static site*

23. WHEN the static build runs, THE script SHALL save the stored snapshot bytes of each sealed demo pact as a file, and the static site SHALL answer the snapshot route from that file.
