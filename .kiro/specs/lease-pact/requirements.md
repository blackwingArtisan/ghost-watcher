# Requirements: Lease Pact

## 1. Overview

Haunted Listings (`apps/listing-watch`) watches rentals, but a renter who has signed gets no protection
when the advertised terms drift afterwards: a "community fee" appears in the fine print, the rent
creeps up. The pact machinery from `.kiro/specs/seal-the-pact/` (referred to below as PACT n.m)
already seals a page, compares every later night against it and builds a dispute letter. It speaks
only bank: "I applied today", "Pact sealed", a letter to "customer care", a CFPB complaint.

**Lease pact** makes that machinery generic and uses it for rentals. A renter presses
**"I signed the lease"** on a listing's house. The ghost seals the advertised rent, fees and move-in
terms as the pact. Later, **Raise the dead** compares what was advertised on the signing date with what
the page charges now and writes a letter to the landlord.

Behavior that is shared with the Bonus Crypt is not repeated here. Where a criterion below says
"as PACT n.m", that criterion applies to the lease pact unchanged and is tested once, in the
template.

### How criteria are written and cited

Each criterion is one sentence in strict EARS form with one testable behavior:
**WHEN** trigger **THE SYSTEM SHALL** response; **WHILE** state **THE SYSTEM SHALL** response;
**IF** condition **THEN THE SYSTEM SHALL** response; **WHERE** feature **THE SYSTEM SHALL** response;
or ubiquitous **THE SYSTEM SHALL** response. Requirements are numbered 1 to 7 and criteria `N.M`
(`LEASE 3.1`). A test title names its criterion, for example `(LEASE 3.1) ...`.

## 2. Glossary

- **Pact vocabulary** (`PactVocabulary`): the words an app supplies for its pact: button label, chip and
  section names, the "day" phrase, letter templates, evidence labels and complaint authority text.
- **Lease pact**: a pact sealed on a rental listing watch, with the lease vocabulary.
- **Advertised terms**: the watched values of the listing page on the signing date: rent, application
  fee, monthly fees, deposit and move-in special.
- **Charged terms**: the same values on the page now.
- **House**: the dashboard card of one ghost in Haunted Listings. **Séance**: its detail drawer.
- **Lease watch**: a watch whose tags include the app's pact tag (`lease`).
- Terms defined in `seal-the-pact/requirements.md` (pact, seal, break, promised value, pact reference,
  seeded pact) keep their meaning.

## 3. Requirements

### Requirement 1: The pact vocabulary is supplied by the app

**User Story:** As an app author, I want to give my pact its own words, so that a lease reads like a
lease and a bonus keeps reading like a bonus.

**Acceptance Criteria:**
1. WHERE an app sets `copy.pactCopy.sealLabel`, THE SYSTEM SHALL use it as the label of the seal button on the stone and in the séance, and in the button's accessible name.
2. WHERE an app sets `copy.pactCopy.sealedChip`, THE SYSTEM SHALL use it as the name of the sealed mark on the stone.
3. WHERE an app sets `copy.pactCopy.sectionTitle` and `copy.pactCopy.emptyLine`, THE SYSTEM SHALL use them as the title of the séance pact section and as its line when no pact exists.
4. WHERE an app sets `copy.pactCopy.valueColumn`, THE SYSTEM SHALL use it as the heading of the séance value-table column that holds the pact value.
5. WHERE an app sets `copy.pactCopy.day`, THE SYSTEM SHALL use it in every pact note ("On <date>, <day>, ...") and, through `copy.pactCopy.since`, in the summary prefix "Since <since> on <date>:" that PACT 5.3 puts on a finding raised from the total change.
6. WHERE an app sets `copy.pactCopy.letters.dispute`, THE SYSTEM SHALL build the subject and body of the dispute variant from that template, and the letter template receives the quoted before and after lines, both dates, the page address and the evidence lines.
7. WHERE an app sets `copy.pactCopy.letters.match`, THE SYSTEM SHALL build the subject and body of the match variant from that template.
8. WHERE an app sets `copy.pactCopy.evidence`, THE SYSTEM SHALL use its labels for the pack's evidence rows about the pact snapshot ("Exhibit A" rows) and for the sealed-date column heading.
9. WHERE an app sets `copy.pactCopy.dateBlank`, THE SYSTEM SHALL use it as the bracketed blank that the sealed date fills, and drop it from the pack's blanks when a pact exists (as PACT 6.2).
10. WHERE an app sets `copy.pactCopy.authority`, THE SYSTEM SHALL show its heading and text in place of the CFPB section and put no CFPB product, issue or link in the pack.
11. WHERE an app sets `copy.pactCopy.cfpb` to false, THE SYSTEM SHALL omit the CFPB section from the pack and from the dashboard.
12. WHERE an app sets no `copy.pactCopy`, THE SYSTEM SHALL produce the same notes, summaries, letters, packs, state JSON and dashboard HTML as before this feature, byte for byte.
13. THE SYSTEM SHALL export `PactVocabulary`, `BONUS_PACT_VOCABULARY` and `resolvePactVocabulary` from `template/src/index.ts`.

### Requirement 2: Pacts only where they make sense

**User Story:** As a renter, I want the signing button only on a listing's own page, not on a search
results list or a permit table, so that I never seal something that is not a lease.

**Acceptance Criteria:**
1. WHERE an app sets `copy.pactCopy.watchTags`, THE SYSTEM SHALL offer the pact only on watches that carry one of those tags.
2. IF a pact route is called for a watch that does not carry one of the tags, THEN THE SYSTEM SHALL answer 404 and change nothing (as PACT 9.8).
3. WHEN the demo seeds pacts, THE SYSTEM SHALL seed one only for watches that may carry a pact.
4. WHERE an app sets no `watchTags`, THE SYSTEM SHALL offer the pact on every watch of a pact-enabled app (as PACT 10.1).
5. WHERE an app sets `copy.pactCopy.watchTags`, THE SYSTEM SHALL offer Raise the dead and the dispute route only for watches that carry one of those tags.

### Requirement 3: Seal the lease

**User Story:** As a renter who just signed, I want to press "I signed the lease" on the listing, so
that I can later show what the landlord advertised.

**Acceptance Criteria:**
1. WHEN a renter presses "I signed the lease" on a house that has a stored snapshot and no pact, THE SYSTEM SHALL seal that snapshot as the pact exactly as PACT 1.1 to 1.9 describe.
2. THE SYSTEM SHALL watch on each lease watch the rent, application fee, deposit, move-in special and monthly-fee fine print of the listing page, and keep every amount as integer cents.
3. WHEN a lease pact is sealed, THE SYSTEM SHALL show the house's sealed lease mark with the compact date and short hash.
4. WHILE the séance of a lease watch is open, THE SYSTEM SHALL show the pact section with the lease wording and the sealed date, hash and archive facts (as PACT 10.9).
5. WHILE a lease pact is sealed, THE SYSTEM SHALL add the column "The day you signed" to the séance value table.
6. WHEN a renter replaces or breaks a lease pact, THE SYSTEM SHALL ask for confirmation first (as PACT 10.7).

### Requirement 4: Compare the advertised terms with the charged terms

**User Story:** As a renter, I want each change measured against what was advertised on the day I
signed, so that a quiet fee or a rent increase shows up with the numbers.

**Acceptance Criteria:**
1. WHEN the rent on the page is higher than the pact's rent, THE SYSTEM SHALL raise an alert whose pact note reads "On <date>, the day you signed the lease, the rent was $2,050; it is now $2,125 (+$75)."
2. WHEN a sentence about a monthly fee that the pact did not contain appears in the fine print, THE SYSTEM SHALL raise a shriek with tone bad that quotes the new sentence.
3. WHEN a monthly fee sentence is new and the rent also rose in the same night, THE SYSTEM SHALL report each as its own alert, and each carries the pact reference.
4. WHEN the lease pact comparison handles money, THE SYSTEM SHALL compare and subtract integer `amountMinor` values (as PACT 5.8).
5. WHEN the page differs from the pact only in whitespace, date format, tracking parameters, the sponsored slot or the "updated" footer, THE SYSTEM SHALL raise no alert (as PACT 5.9).
6. WHEN an alert is raised, THE SYSTEM SHALL name in one plain sentence what changed, from what to what, and which rule fired.
7. WHEN the rent falls below the pact's rent, THE SYSTEM SHALL mark the alert tone good and build the match variant of the letter.

### Requirement 5: The Haunted Listings demo

**User Story:** As a viewer of the demo, I want a lease already signed weeks ago, so that the first
night already shows the fee that was added after signing.

**Acceptance Criteria:**
1. WHEN the Haunted Listings demo takes its first sighting, THE SYSTEM SHALL seal a pact for each lease watch, dated 30 days before the injected clock's now, because a lease is usually signed a few weeks before move-in and 30 days gives the landlord time to change the page.
2. WHEN the demo is rewound, THE SYSTEM SHALL seed the lease pacts again (as PACT 8.4).
3. WHEN the first demo night passes, THE SYSTEM SHALL raise a rent alert noting "On <seeded date>, the day you signed the lease, the rent was $2,050; it is now $2,125 (+$75)." and a new $45 monthly amenity fee alert on the lease watch.
4. WHEN a pact is seeded for the lease watch, THE SYSTEM SHALL mark it `seeded: 'demo'` and show the tag "demo pact" (as PACT 8.2).
5. WHILE the demo is at night 0, THE SYSTEM SHALL show the sealed lease mark on the lease house on the street.
6. THE SYSTEM SHALL serve a rental listing detail page in the fixture site with rent, application fee, monthly fees in the fine print, deposit and a move-in special, in three numbered versions.
7. WHEN the fixture advances from version 1 to version 2, THE SYSTEM SHALL change the rent and add one monthly amenity fee sentence to the page, and SHALL change nothing else that is watched.

### Requirement 6: Raise the dead writes to the landlord

**User Story:** As a renter charged more than advertised, I want a ready letter to my landlord that
quotes the advertised terms on my signing date against the charged terms now.

**Acceptance Criteria:**
1. WHEN a renter opens Raise the dead on a lease alert that kept a receipt, THE SYSTEM SHALL build a pack whose letter is addressed to the landlord and the property.
2. WHEN the letter is built, THE SYSTEM SHALL quote "what was advertised on <signing date>, the day I signed the lease" against "what the page charges on <date now>", each line labelled and in dollars and cents.
3. WHEN the letter is built, THE SYSTEM SHALL name both dates (as the pact rules), the page address (the display URL when set) and the SHA-256 of the pact snapshot.
4. THE SYSTEM SHALL NOT mention a bank, a bonus, a customer care desk or the CFPB in a lease letter, in the pack's complaint text or on its page.
5. WHEN the pack is built for a lease alert, THE SYSTEM SHALL show one short neutral line pointing to the local housing authority or the state attorney general's consumer office, and SHALL NOT name any agency, phone number or address.
6. WHEN the pack is built for a lease alert, THE SYSTEM SHALL title it "Lease letter" for the dispute variant and "Rent match" for the match variant.
7. WHEN the pack is built for a lease alert, THE SYSTEM SHALL list the evidence rows "Advertised on <date>", "Advertised copy", "Advertised SHA-256" and "Check the advertised page".
8. WHEN the pack is built for a lease alert, THE SYSTEM SHALL leave the blanks "[Your name]", "[Your address]", "[Unit]" and "[Date you signed the lease]" and drop the date blank because the pact supplies the date.
9. THE SYSTEM SHALL build the same lease pack, word for word, from the same alert (as PACT 6.9).

### Requirement 7: Constraints

**Acceptance Criteria:**
1. THE SYSTEM SHALL leave every existing bonus-watch test and its expected output unchanged.
2. THE SYSTEM SHALL add no dependency to any `package.json`.
3. THE SYSTEM SHALL keep apps importing only from `@ghost-watcher/template` (and its `testing` export).
4. THE SYSTEM SHALL read every date in sealing, comparison and letters from the injected `Clock` or stored ISO strings.
5. THE SYSTEM SHALL escape every vocabulary value before writing it into HTML.
6. WHEN the axe scan runs on the Haunted Listings dashboard, the séance and the lease letter, THE SYSTEM SHALL report no WCAG 2 A or AA violation.
7. THE SYSTEM SHALL make no network call in a test beyond `127.0.0.1`.
8. THE SYSTEM SHALL start the Haunted Listings demo for e2e on `GHOST_E2E_PORT + 6` with its fixtures on `GHOST_E2E_PORT + 7`, taken from `e2e/ports.ts`.
