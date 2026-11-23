# Requirements: Seal Any Page

## 1. Overview

Seal the pact (`.kiro/specs/seal-the-pact/`, cited as `PACT n.m`) works on the pages an app already
watches. **Seal any page** lets a reader of the Bonus Crypt paste a public URL, press "I applied
today", and get a new ghost that watches the whole readable text of that page, with a sealed pact.
No code and no selectors: the watcher reads the page the way a person would (headings, paragraphs and
list items of the main content) and compares sentences.

Shared behaviour is reused by reference, not restated: sealing, the hash, the archived copy and the
one-pact rule are `PACT 1.x` and `PACT 2.x`; the comparison, the shriek and "Raise the dead"
quoting only changed sentences are `PACT 5.x` and the dispute pack. Polite fetching, the contact URL
rules and the noise rules come from `.kiro/steering/product.md` and `tech.md`. The steering non-goal
stays: no headless browser. A page that only renders in a browser is refused (ANY 3).

Criteria are strict EARS sentences. Test titles name them as `(ANY 3.2)`.

## 2. Glossary

- **Added page**: a page sealed through the form. It is stored as a small record and becomes a ghost.
- **Readable text**: the text of the page's main content: headings, paragraphs and list items, in
  order, after boilerplate and noise are dropped. Money is normalised by the existing text normaliser.
- **Readable field**: the one watched field of an added page, named `text`, selector `:readable`.
- **Threshold**: `MIN_READABLE_CHARS` (200). Shorter readable text means the page renders in the browser.
- **Seal form**: the "Seal a page" form on the dashboard. **Bookmarklet**: the "Seal this page" link.

## 3. Requirements

### Requirement 1: Readable text extraction

**User Story:** As a reader, I want the watcher to read only what a person reads, so that menus,
banners and stamps never wake the ghost.

**Acceptance Criteria:**
1. THE SYSTEM SHALL read the readable text from the first `main`, `[role=main]` or `article` element, and from `body` when there is none.
2. THE SYSTEM SHALL include only heading, paragraph, list-item and blockquote text, in document order, each once, with whitespace collapsed.
3. THE SYSTEM SHALL drop scripts, styles, navigation, headers and footers, asides, forms, `noscript`, hidden elements and cookie or consent banners before reading.
4. THE SYSTEM SHALL drop `time` elements, elements with a `datetime` attribute, elements whose class or id names a timestamp, request id, session, trace or advert, and lines that only state "Page generated", "Last updated", "Request id" or a bare date or id.
5. THE SYSTEM SHALL produce the same readable text for the same page when only whitespace, tracking parameters, ad slots and such stamps differ.
6. THE SYSTEM SHALL read the text with cheerio only and run no script (steering: no headless browser).

### Requirement 2: Seal a page from the form

**User Story:** As someone who just applied, I want to paste the offer's address and press one button.

**Acceptance Criteria:**
1. THE SYSTEM SHALL show a "Seal a page" form with an address field and an "I applied today" button on the dashboard of an app that sets `copy.pacts`.
2. WHEN a reader submits a public http or https address, THE SYSTEM SHALL fetch it exactly once through the `Fetcher` (`PoliteFetcher`: robots.txt, rate limit, honest User-Agent).
3. WHEN the page is readable, THE SYSTEM SHALL store the added page, make it a ghost with the readable field and rules that raise a shriek when the text changes, store its first reading and seal it with `sealPact` (`PACT 1.1` to `PACT 1.6`).
4. WHEN the page is sealed, THE SYSTEM SHALL answer with the new ghost's id, name, pact hash and archive note, and the dashboard SHALL show the new stone and open its séance.
5. WHERE archiving is on (`GHOST_RECEIPTS=archive`), THE SYSTEM SHALL ask the archiver once for a copy and record it as `PACT 1.4` says.
6. IF the address is not a valid http or https URL, or has a username or password, THEN THE SYSTEM SHALL refuse with `bad-url` and fetch nothing.
7. IF the address is already an added or watched page, THEN THE SYSTEM SHALL fetch nothing, change nothing and answer `page-exists` with that ghost's id.
8. IF thirty pages were already added, THEN THE SYSTEM SHALL refuse with `too-many` and fetch nothing.
9. WHEN the form is submitted, THE SYSTEM SHALL name the new ghost from the page's `h1`, then `title`, then host and path, shortened to 60 characters.
10. WHILE the request runs, THE form SHALL disable its button and say it is looking at the page.

### Requirement 3: Pages that render in the browser

**Acceptance Criteria:**
1. IF the readable text is shorter than the threshold, THEN THE SYSTEM SHALL refuse with `js-rendered`, store nothing and seal nothing.
2. WHEN a page is refused as `js-rendered`, THE form SHALL say: "This page renders in your browser, so there is no text for the ghost to read. It cannot be sealed this way."
3. THE SYSTEM SHALL NOT run a headless browser or any script to read a refused page.

### Requirement 4: Politeness and the contact URL

**Acceptance Criteria:**
1. IF robots.txt asks watchers not to visit the page, THEN THE SYSTEM SHALL refuse with `blocked`, store nothing and say so plainly.
2. IF the page is on a real third-party host and the app has no real contact URL (`GHOST_CONTACT_URL`), THEN THE SYSTEM SHALL refuse with `needs-contact` before any request and name `GHOST_CONTACT_URL`.
3. THE SYSTEM SHALL leave the contact URL rules in `template/src/config.ts` unchanged.
4. IF the fetch fails (network error, HTTP error), THEN THE SYSTEM SHALL refuse with `fetch-failed`, give the reason and store nothing.
5. THE SYSTEM SHALL use the new ghost's first reading as the baseline and SHALL NOT fetch the page a second time while sealing.
6. THE SYSTEM SHALL give the new ghost the default 6 hour interval.

### Requirement 5: The new ghost

**Acceptance Criteria:**
1. WHEN a later check finds the readable text changed, THE SYSTEM SHALL raise a shriek that is judged against the pact as `PACT 5.x` says.
2. WHEN a later check finds only noise changed (ANY 1.4 and 1.5), THE SYSTEM SHALL raise nothing.
3. WHEN a dispute pack is raised for the alert, THE SYSTEM SHALL quote only the changed sentences, using the existing text summary.
4. THE SYSTEM SHALL treat money in the readable text as the existing text normaliser does, so "$200" and "$ 200.00" read the same sentence.
5. THE SYSTEM SHALL let the reader seal again, break the pact and lay the ghost to rest like any other ghost.

### Requirement 6: Persistence

**Acceptance Criteria:**
1. WHEN a page is added, THE SYSTEM SHALL write its record (id, url, name, added time) through the `BlobStore` before it answers.
2. WHEN the dashboard starts, THE SYSTEM SHALL load every stored added page as a ghost, after the app's own watches, and keep its snapshots, alerts and pact.
3. IF the stored list is missing or unreadable, THEN THE SYSTEM SHALL start with no added pages and SHALL NOT fail the start.
4. THE SYSTEM SHALL NOT mutate the app definition passed to `loadDeps`.
5. THE SYSTEM SHALL keep a ghost id for an added page stable: `page-` and the first 10 hex characters of the SHA-256 of the normalised URL.

### Requirement 7: The bookmarklet

**Acceptance Criteria:**
1. THE dashboard SHALL show a "Seal this page" link whose address is a `javascript:` bookmarklet.
2. WHEN the bookmarklet runs in a tab, THE SYSTEM SHALL open the dashboard's own origin with the tab's address in the `seal` query parameter and send nothing else.
3. WHEN the dashboard opens with a `seal` parameter holding an http or https address, THE form SHALL show it in the address field, focus the button and NOT submit.
4. THE dashboard SHALL stay on `127.0.0.1`; the bookmarklet SHALL contain the dashboard's origin as the page loaded it.

### Requirement 8: The static recorded demo

**Acceptance Criteria:**
1. WHEN a visitor submits the form on the static demo, THE replay SHALL answer 409 `read-only` with: "Sealing a new page needs the local server. This live demo replays a recording. Run it locally: npm install && npm run bonus."
2. THE form SHALL show that answer as it shows any refusal.

### Requirement 9: Safety and accessibility

**Acceptance Criteria:**
1. THE route SHALL accept state-changing requests only from the dashboard's own origin and a loopback Host (`guard.ts`, unchanged).
2. THE route SHALL accept a body of at most 4096 bytes.
3. THE form and its messages SHALL pass the axe WCAG 2 A and AA scan, work by keyboard and announce results in a live region.
4. THE form SHALL NOT animate when the reader prefers reduced motion.
