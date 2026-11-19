# Design: Seal the Pact

Requirement numbers (`PACT n.m`) refer to `requirements.md`. Module and type names are the ones in the
repository today, or new ones marked **new**.

## 1. Scope and decisions

Seal the pact adds one stored document set per watch, one extra comparison in the runner, a pact
reference on alerts, and a variant of the dispute pack. Everything else (fetching, extraction, diff,
rules, receipts, sinks) is reused unchanged.

| Decision | Choice | Why |
|---|---|---|
| Where pact logic lives | `template/src/pact.ts` (pure) and `template/src/sealing.ts` (effects), both **new** | Steering: pure functions for diff and rules, effects in adapters and the runner. `rules.ts` and `diff.ts` stay untouched, so the money-guard hook has nothing new to complain about. |
| How a night is compared with the pact | Run the existing `diff(pact.snapshot, current)` and `evaluateRules(watch, ...)` | One definition of "worth knowing", including `minDelta`, tone and `stealthEdit`. No second rule engine. |
| What an alert remembers | A copy of the pact facts (`Alert.pact`) | The alert stays self-describing after the pact is replaced or broken (PACT 2.7). `disputePack(alert, watch)` keeps its signature and needs no store. |
| Archive failure while sealing | Seal anyway, with a note | Matches `takeReceipt`: an unreachable archive never loses the proof that does exist (PACT 1.6). |
| Replace and break | Replace needs `confirmReplace: true` on the wire and an in-page confirmation; break is `DELETE` with an in-page confirmation | The pact is proof; one stray click must not destroy it (PACT 2.2, 10.7). |
| Pact scope | Fields only. List items are not compared with the pact | Bonus Crypt watches have no lists. Rent receipts for Haunted Listings are a later item. |
| App switch | `AppCopy.pacts?: boolean`, like `disputes` | Keeps listing-watch unchanged (PACT 11.5). |
| Dates | Injected `Clock`, or ISO strings already stored | No `Date.now()` and no zero-argument `new Date()` in `pact.ts`, `sealing.ts`, `dispute.ts` (PACT 8.6, enforced by a test). |

## 2. Module map

```
template/src/
  pact.ts        NEW  types, comparePact, pactNote, pactVariant, verify helpers (pure)
  sealing.ts     NEW  sealPact, breakPact, seedDemoPacts (Clock, GhostStore, PageArchiver)
  store/ghost-store.ts   + pact(), pactRecord(), savePact(), deletePact()
  alerts/types.ts        + Alert.pact?: AlertPact
  rules.ts               + Finding.pact?: AlertPact   (type only; no logic change)
  runner.ts              + load pact, call comparePact, copy finding.pact onto alerts
  dispute.ts             + pact-aware fields, two letter templates
  app.ts                 + AppCopy.pacts?: boolean
  server.ts              + GET/POST/DELETE /api/ghosts/:id/pact, small JSON body reader
  view.ts                + GhostView.pact, GhostView.canSeal, FieldRow.pact, DashboardState.app.pacts
  cli.ts                 + seedDemoPacts after the demo baseline and after rewind
  ui/render.js, app.js, style.css   stone chip, séance section, confirm step, pack variants
  index.ts               + exports for the new public API
apps/bonus-watch/src/app.ts   + copy.pacts: true
```

New public API from `index.ts`: `sealPact`, `breakPact`, `seedDemoPacts`, `comparePact`, `pactNote`,
`pactVariant`, `DEMO_PACT_AGE_DAYS`, and the types `Pact`, `PactRecord`, `PactArchive`, `PactReading`,
`AlertPact`, `SealResult`, `PactView`.

## 3. Data model and store layout

### 3.1 Types (`pact.ts`)

```ts
export const PACT_VERSION = 1;
export const DEMO_PACT_AGE_DAYS = 40;

export interface PactArchive {
  archiveUrl: string | null;
  archivedAt: string | null;
  archivedBy: string | null;   // PageArchiver.label, e.g. "the Internet Archive"
  note?: string;               // why there is no archived copy
}

/** pacts/<watchId>/pact.json */
export interface PactRecord {
  version: typeof PACT_VERSION;
  watchId: string;
  watchName: string;
  url: string;                 // the watched page, as snapshot.url holds it
  sealedAt: string;            // Clock.now() ISO, "the day you applied"
  snapshotTakenAt: string;     // Snapshot.takenAt of the sealed reading
  sha256: string;              // snapshotSha256(snapshot) == sha256 of <sha256>.json
  archive: PactArchive;
  seeded?: 'demo';
}

export interface Pact extends PactRecord { snapshot: Snapshot }

export type PactReading =
  | { status: 'none' }
  | { status: 'sealed'; pact: Pact }
  | { status: 'corrupt'; reason: string };

/** What an alert keeps of the pact (Alert.pact). */
export interface AlertPact {
  sealedAt: string;
  sha256: string;
  archive: PactArchive;
  seeded?: 'demo';
  relation: 'differs' | 'restored';
  promised: MaybeValue;        // the field in the pact snapshot; null = the pact did not show it
  tone?: 'good' | 'bad';       // direction of now against promised, from FieldSpec.better
  note: string;                // one plain sentence, see 5.4
}
```

`promised` is a `MaybeValue`, so money stays `{ kind: 'money', amountMinor, currency }` in integer
cents (PACT 5.8). Nothing in these types holds a decimal money amount.

### 3.2 Store layout

```
pacts/<watchId>/pact.json         PactRecord, written with serializeJson
pacts/<watchId>/<sha256>.json     the pact Snapshot, written with serializeJson
```

- The snapshot document is named by its hash. `shasum -a 256 .ghost-data/store/pacts/<watchId>/<sha>.json`
  prints that same `<sha>` (PACT 3.2), so Exhibit A can be checked without the app.
- It is a separate document from the history snapshots, so `historyLimit` pruning (it lists
  `snapshots/<watchId>/history/`) cannot reach it (PACT 3.5).
- Keys match `assertKey` (letters, digits, `.`, `_`, `-`, `/`), so the file, memory and S3 stores take
  them with no change. `S3BlobStore` adds its own prefix as it does for every other key.
- `GhostStore.clear()` lists every key, so rewind removes pacts too (PACT 3.6); the demo then re-seeds.

### 3.3 `GhostStore` additions

```ts
pactRecord(watchId): Promise<{ status:'none' } | { status:'sealed'; record: PactRecord } | { status:'corrupt'; reason: string }>
pact(watchId): Promise<PactReading>                  // record + snapshot + hash check
savePact(record: PactRecord, snapshot: Snapshot): Promise<void>
deletePact(watchId): Promise<boolean>                // removes every key under pacts/<watchId>/
```

- `pactRecord` reads only `pact.json` and checks its shape (`version`, string fields, `archive`
  object). Dashboard refreshes use it, so a 15 second poll costs one read per watch, not two.
- `pact` also reads `<sha256>.json` as text, computes `sha256Hex(text)` and compares it with
  `record.sha256`. A missing file, a JSON error, a bad shape or a mismatch returns
  `{ status: 'corrupt', reason }` (PACT 4.1 to 4.3). It never throws on bad content. A thrown blob
  error (network, permissions) still propagates, as it does for every other store read.
- After the hash check, `pact` parses the text and passes it through the existing `upgradeSnapshot`
  (PACT 3.7).
- `savePact` order (PACT 2.4): (1) assert `record.sha256 === snapshotSha256(snapshot)`; (2) put
  `<sha256>.json`; (3) put `pact.json`; (4) delete other `pacts/<watchId>/*.json` snapshot documents.
  If step 3 fails, the old `pact.json` still points at its own, untouched snapshot document. If step 4
  fails, an orphan document remains and is removed on the next seal or break.
- `deletePact` lists the prefix `pacts/<watchId>/` and deletes each key (PACT 2.5, 4.6).

## 4. Sealing (`sealing.ts`)

```ts
export interface SealDeps { store: GhostStore; clock: Clock; archive?: PageArchiver }

export type SealResult =
  | { status: 'sealed'; pact: Pact; replaced: boolean }
  | { status: 'exists'; pact: PactRecord }
  | { status: 'no-snapshot' };

sealPact(deps, watch, options?: { confirmReplace?: boolean }): Promise<SealResult>
breakPact(deps, watchId): Promise<{ removed: boolean }>
seedDemoPacts(deps, watches, options?: { ageDays?: number }): Promise<SealResult[]>
```

`sealPact`:

1. `existing = await store.pactRecord(watch.id)`. If `sealed` and `confirmReplace !== true`, return
   `{ status: 'exists', pact: record }` (PACT 2.2). A `corrupt` record never blocks (PACT 4.5).
2. `snapshot = await store.latestSnapshot(watch.id)`. If null, return `{ status: 'no-snapshot' }`
   (PACT 1.7). No fetch happens anywhere in this function (PACT 1.9).
3. `sha256 = snapshotSha256(snapshot)`; `sealedAt = deps.clock.now().toISOString()` (PACT 1.2, 1.3).
4. Archive: no archiver gives `{ archiveUrl: null, ..., note: 'Archiving is off; the snapshot hash is the pact.' }`.
   Otherwise `archive.save(snapshot.url)` once; success fills the three archive fields from the
   result and `archiver.label`; a rejection becomes `note: 'Could not reach <label>: <reason>'`
   (PACT 1.4 to 1.6, same wording style as `takeReceipt`).
5. `store.savePact(record, snapshot)`; return `{ status: 'sealed', pact, replaced }`.

`snapshotTakenAt` records the reading's age (PACT 1.8). The archived copy is taken now, while the
snapshot is the last check's reading. If the page moved in between, the hash still proves what the
ghost saw and the archive proves what the page said at sealing; the séance shows both ages.

`seedDemoPacts` is described in section 10.

## 5. Comparison rules (`pact.ts`)

### 5.1 Signature

```ts
comparePact(
  watch: Watch,
  pact: Pact,
  current: Extraction,          // what this check just extracted
  nightly: Diff,                // diff(previous, current), already computed by the runner
  findings: Finding[],          // evaluateRules(watch, nightly)
): Finding[]
```

Pure. It uses `diff` and `evaluateRules` as they are and calls no clock.

### 5.2 Algorithm

```
if nightly.firstRun or nightly.fields is empty:  return findings            // PACT 5.6
since    = diff(pact.snapshot, current)
sinceF   = evaluateRules(watch, since).filter(f => f.field && !f.list)
tonight  = set of field names in nightly.fields
for each field name in tonight:
   own     = findings on that field (nightly)
   sinceCh = since.fields entry for that field
   if no sinceCh:                                   // equals the promised value again
        attach {relation:'restored'} to each of own   // PACT 5.5, no extra finding
   else:
        top = sinceF finding for that field (may be absent)
        stance = AlertPact{ relation:'differs', promised: sinceCh.before, tone, note }
        if own is empty and top exists:
             add top with summary "Since you applied on <date>: <top.summary>"  // PACT 5.3
        else if top exists and (top outranks every own finding, or top.stealth and none of own has it):
             replace own with top (summary prefixed as above)                   // louder pact finding wins
        else:
             attach stance to each of own                                        // PACT 5.2
return the merged findings, list findings untouched
```

- `outranks` uses the existing `LOUDNESS` order (whisper < moan < shriek). Because the nightly finding
  and the pact finding come from the same rules, the replaced finding's rule label is still the
  author's own rule.
- The pact finding must be about a field that **changed tonight**. A field that differs from the pact
  but did not move tonight raises nothing, so one drift does not alert every night (PACT 5.6).
- `since` is a diff with the pact as the "previous" snapshot, so `firstRun` is false and
  `evaluateRules` runs normally. `minDelta` therefore applies to the cumulative change since the
  pact, which is what makes five steps of $10 against `minDelta: 50` fire on the fifth night
  (PACT 5.3, 5.4).
- A `stealthEdit` rule evaluated on `since` fires when the fine print changed since the pact while
  the headline fields did not, even if tonight's step also touched the headline field back and forth
  (PACT 5.7).
- Noise: both sides are canonical `MaybeValue`s from `extract`, so whitespace, date formats and
  tracking parameters were already removed before the comparison (PACT 5.9).

### 5.3 Money and tone

- Money deltas come out of `compareValues` as integer cents. `minDelta` stays in dollars and is
  converted by `meetsMinDelta` through `compareMinorToMajor`. No code in `pact.ts` divides by 100 or
  rounds a product (PACT 5.8). Display text uses `displayValue`, which calls `formatMinor`.
- Tone is `rule.tone ?? toneOf(sinceCh.delta, field.better)`, with `removed` meaning `bad`, exactly as
  `evaluateRules` derives it. A bonus above the promised one with `better: 'higher'` is `good`. An
  annual fee below the promised one with `better: 'lower'` is `good` (PACT 5.10, 7.6).

### 5.4 The note

`pactNote(label, promised, now, sealedAt, relation)` returns one sentence, dates through `letterDate`:

- differs, same kind of value: `On Oct 10, 2026, the day you applied, Bonus was $400; it is now $300 (-$100).`
- the pact did not show the field: `On Oct 10, 2026, the day you applied, the page did not show Bonus; it now says $300.`
- the field is gone now: `On Oct 10, 2026, the day you applied, Bonus was $400; the page no longer shows it.`
- restored: `The page is back to what it said on Oct 10, 2026, the day you applied (Bonus: $400).`

Long text uses the same `textChange` sentences the dispute pack already quotes, never the whole block.

### 5.5 Variant

```ts
pactVariant(alert: Pick<Alert, 'pact' | 'stealth'>): 'dispute' | 'match'
// 'match' only when pact.relation === 'differs' && pact.tone === 'good' && !alert.stealth
```

## 6. Runner and alerts

In `Runner.run`, after `const findings = evaluateRules(watch, changes)`:

```ts
const reading = await store.pact(watch.id);
const judged = reading.status === 'sealed' ? comparePact(watch, reading.pact, extraction, changes, findings) : findings;
```

- `judged` replaces `findings` for the rest of the run (empty check, receipt, alert building).
- `corrupt` and `none` take the old path with no extra branch in the alert code (PACT 4.4, 5.12).
- Alert building adds one line: `...(finding.pact ? { pact: finding.pact } : {})`.
- `needsReceipt(judged)` and `takeReceipt(previous, snapshot, archive)` are unchanged (PACT 5.11). The
  receipt still describes the night; the pact reference describes the promise.
- The pact is read once per changed check, only after the diff is known to be non-empty and
  the rules ran; checks that find nothing never read it.
- Alerts created before a pact exists have no `pact`, so their packs stay as they were. A pact applies
  from its sealing onward.

## 7. Dispute pack and letters (`dispute.ts`)

### 7.1 Fields

`DisputePack` gains one optional member, present only when `alert.pact` exists. A pack for an alert
without `alert.pact` has exactly the members and values it has today (PACT 6.8).

```ts
pact?: {
  variant: 'dispute' | 'match';
  relation: 'differs' | 'restored';
  appliedDate: string;           // letterDate(pact.sealedAt), "Oct 10, 2026"
  sha256: string;
  archiveUrl: string | null;
  archivedBy: string | null;
  note: string | null;           // why there is no archived copy
  seeded: boolean;
  checkCommand: string;          // shasum -a 256 .ghost-data/store/pacts/<watch>/<sha>.json
}
```

With `relation: 'differs'`:

| Existing field | Value with a pact |
|---|---|
| `before` | `quoteLines(label, alert.pact.promised, alert.after).before` |
| `beforeDate` | `letterDate(pact.sealedAt)` |
| `afterDate` | `letterDate(receipt.after.takenAt)` (unchanged) |
| `letter.subject` | dispute: unchanged; match: `Request to match the improved terms of <offer>` |
| `letter.body` | one of the two templates below |
| `evidence` | `Page`, `Exhibit A: the page on <appliedDate>`, `Exhibit A archived copy`, `Exhibit A SHA-256`, `Check Exhibit A`, then `Now (<afterDate>)`, `Archived copy now`, `SHA-256 now`, `Check the hashes` |
| `complaint.whatHappened` | uses the applied date and the promised/now quotes |
| `blanks` | `['[Your name]', '[Your address]', '[Last 4 digits of the account]']` |

With `relation: 'restored'` the pack is built as without a pact, except `[Date you applied]` is
replaced by the sealed date in the letter and the complaint, and removed from `blanks` (PACT 6.7).

`Exhibit A archived copy` reads `none: <note>` when `archiveUrl` is null (PACT 6.6). The pack never
claims an archived copy for a seeded pact: its note says so.

Hosts and labels follow today's pack: `alert.url` is quoted as stored (the fixture origin in the demo),
and `archivedBy` is the archiver's own label ("the stand-in Wayback Machine" in the demo) (PACT 8.7).

### 7.2 Dispute letter with a pact (variant `dispute`)

Sample, invented names: bonus cut from $400 to $300 after the reader applied on Oct 10, 2026.

```
[Your name]
[Your address]

To: Lanternfield Everyday Checking customer care
Re: Lanternfield Everyday Checking, account ending [Last 4 digits of the account]

I applied for Lanternfield Everyday Checking on Oct 10, 2026, relying on the terms published at https://www.lanternfield.example/everyday-checking.
Those terms have since changed. I sealed a record of the page on the day I applied and recorded it again after the change.

What the page promised on Oct 10, 2026, the day I applied:
  Bonus: $400

What the page says on Nov 19, 2026:
  Bonus: $300

Records of both versions:
  - Exhibit A, the page on Oct 10, 2026: archived copy held by the Internet Archive: https://web.archive.org/web/20261010141502/https://www.lanternfield.example/everyday-checking (captured Oct 10, 2026)
  - Exhibit A SHA-256: <64 hex digits>
  - An archived copy of the page after the change, held by the Internet Archive: https://web.archive.org/web/20261119093044/https://www.lanternfield.example/everyday-checking (captured Nov 19, 2026)
  - SHA-256 of my record of the page on Nov 19, 2026: <64 hex digits>

Please honor the terms that were published on the day I applied, including any sign-up bonus they promised, and confirm in writing within 30 days. If we cannot resolve this, I will file a complaint with the Consumer Financial Protection Bureau and include these records.

Sincerely,
[Your name]
```

Differences from today's letter: the application date is real, the first block says "promised ... the
day I applied", Exhibit A comes first, and the rest of the text is today's text.

### 7.3 Bonus match letter (variant `match`)

Subject: `Request to match the improved terms of Lanternfield Everyday Checking`. Sample: bonus raised from
$300 to $400 after the reader applied on Oct 10, 2026.

```
[Your name]
[Your address]

To: Lanternfield Everyday Checking customer care
Re: Lanternfield Everyday Checking, account ending [Last 4 digits of the account]

I applied for Lanternfield Everyday Checking on Oct 10, 2026, relying on the terms published at https://www.lanternfield.example/everyday-checking.
Since then the page has improved its terms. I sealed a record of the page on the day I applied and recorded it again after the improvement.

What the page promised on Oct 10, 2026, the day I applied:
  Bonus: $300

What the page says on Nov 19, 2026:
  Bonus: $400

Records of both versions:
  - Exhibit A, the page on Oct 10, 2026: archived copy held by the Internet Archive: https://web.archive.org/web/20261010141502/https://www.lanternfield.example/everyday-checking (captured Oct 10, 2026)
  - Exhibit A SHA-256: <64 hex digits>
  - An archived copy of the page after the change, held by the Internet Archive: https://web.archive.org/web/20261119093044/https://www.lanternfield.example/everyday-checking (captured Nov 19, 2026)
  - SHA-256 of my record of the page on Nov 19, 2026: <64 hex digits>

Since I applied as a customer, I would like my account to receive the improved terms now on offer. Please let me know in writing within 30 days whether you will match them.

Thank you,
[Your name]
```

An improved fee reads the same way with `Annual fee: $95` against `Annual fee: $0`. The match letter has
no CFPB paragraph (PACT 7.5). Its `complaint` member is still filled, because `DisputePack.complaint`
is required, and reads: "I applied for <offer> on <date> under the terms on the bank's page. The bank
later improved those terms but has not applied them to my application. ..." The dashboard hides the
complaint section for the match variant, since there is nothing to complain about until the bank refuses.

### 7.4 Determinism

`disputePack` stays pure. All dates come from stored ISO strings through `letterDate`. A test greps
`pact.ts`, `sealing.ts` and `dispute.ts` for `Date.now(` and `new Date()` (PACT 8.6).

## 8. HTTP routes (`server.ts`)

The existing guard already refuses a foreign Origin or Host for every method other than GET, HEAD and
OPTIONS, so `DELETE` is covered without a change (PACT 9.7).

| Route | Success | Errors |
|---|---|---|
| `GET /api/ghosts/:id/pact` | 200 `{ state, pact, reason? }`. `pact` is a `PactView` (no snapshot body). | 404 unknown ghost or `copy.pacts` off |
| `POST /api/ghosts/:id/pact` body `{}` or `{ "confirmReplace": true }` | 201 `{ state: 'sealed', replaced, pact, archive: { saved, note } }` | 409 `{ code: 'pact-exists', pact }`; 409 `{ code: 'no-snapshot' }`; 400 body not a JSON object; 413 body over 1 KiB; 404 as above; 403 guard |
| `DELETE /api/ghosts/:id/pact` | 200 `{ state: 'none', removed }` | 404 as above; 403 guard |
| `GET /api/ghosts/:id/alerts/:alert/dispute` | unchanged route; the pack carries `pact` when the alert has a pact reference | unchanged |

- An empty body on `POST` counts as `{}`.
- The ghost route regex `^/api/ghosts/([a-z0-9-]+)(?:/(check|acknowledge))?$` gains `pact` as a third
  action, and `DELETE` is added to the methods the ghost route understands. Other method and action
  pairs still answer 405.
- A small `readJsonBody(req, maxBytes = 1024)` helper in `server.ts` reads the stream, stops at the
  limit and answers 413.
- `GhostDeps` already carries `archive`, `clock` and `store`; the handler builds
  `{ store: deps.store, clock: deps.clock, ...(deps.archive ? { archive: deps.archive } : {}) }`.

`PactView`:

```ts
interface PactView {
  state: 'sealed' | 'corrupt';
  sealedAt?: string; sealedDate?: string;       // "Oct 10, 2026"
  snapshotTakenAt?: string;
  sha256?: string; shortHash?: string;          // shortHash() from receipts.ts
  archive?: PactArchive;
  seeded?: boolean;
  reason?: string;                              // corrupt only
}
```

## 9. View models and UI states

### 9.1 View model (`view.ts`)

- `DashboardState.app.pacts: boolean` from `app.copy.pacts ?? false`, like `disputes`.
- `GhostView.pact: PactView | null` and `GhostView.canSeal: boolean`. `ghostView` calls
  `store.pactRecord` (cheap) and already has `snapshot`, so `canSeal = pacts && snapshot !== null`.
- `FieldRow.pact: string | null`, the displayed promised value, filled in `ghostDetail` from
  `store.pact` when sealed (`displayValue` of the pact snapshot field).
- `GhostDetail.pact` is the same `PactView`, with a full `store.pact` verification when opened, so a
  corrupt pact is caught in the séance too.
- `FeedEntry.alert.pact` flows through the existing `alert` object; no new feed type.

### 9.2 Stone states

| Pact state | Stone shows | Control |
|---|---|---|
| App has no `copy.pacts` | nothing new | none |
| No snapshot yet (`unborn`, or blocked with no reading) | "I applied today" disabled; description "Not seen yet. Summon the ghost first." | disabled `button` |
| None, has snapshot | button "I applied today" | `data-action="pact-seal"` |
| Sealed | line "Pact sealed Oct 10 '26 · 9b1f4c07…e4a2" (`compactDate`, `shortHash`) with the full date and hash in `title` | none (open the séance to manage) |
| Sealed, seeded | the same plus the tag "demo" | none |
| Corrupt | "Pact unreadable" (warning colour plus the words) | link-style button "Open séance" is the whole-stone `ghost__hit`; no extra control |

The stone's `ghost__hit` overlay already covers the card. The "I applied today" button sits above it
(`position: relative; z-index: 2`), is a real `button`, follows the stone's reading order, and has
`aria-label="I applied today: seal the pact for Lanternfield Everyday Checking"`.

### 9.3 Séance section "The pact"

Placed after the value table. Shown only when the app is pact-enabled.

| State | Content | Actions |
|---|---|---|
| None | "No pact yet. Seal one on the day you apply." | "I applied today" |
| Sealed | sealed date; "page as the ghost saw it on <snapshotTakenAt>"; full SHA-256 in `<code>`; archived-copy link or "hashes only" with the note; "demo pact" tag when seeded; a `shasum` hint | "Seal again" (confirm), "Break the pact" (confirm) |
| Corrupt | "The pact cannot be read: <reason>." | "Seal again" (no confirm needed), "Break the pact" (confirm) |
| Confirm step | inline `role="group"` panel: "Replace the pact sealed Oct 10, 2026? The old one is deleted." or "Break the pact? ..." | "Yes, replace" / "Yes, break" and "Keep it"; focus starts on "Keep it"; Escape or "Keep it" returns focus to the opener |

While a pact is sealed the value table gains a column "The day you applied" (`FieldRow.pact`); a row
whose current value differs from it carries `data-pact-differs="true"`.

### 9.4 Feed, log and pack

- Feed items and log items with `alert.pact` add `<p class="pact-note">…note…</p>` under the summary.
- The "Raise the dead" button label becomes "Ask for the match" for variant `match`
  (`aria-label` keeps the watch name).
- `renderDispute(pack)`: title "Dispute pack: <offer>" or "Bonus match: <offer>"; with `pack.pact`
  the columns read `Oct 10, 2026, the day you applied: what the page promised` and
  `Nov 19, 2026: what it says now`. Exhibit A rows come from `pack.evidence`. The CFPB block is not
  rendered for the match variant. A pack without `pack.pact` renders exactly as today.
- Every dynamic value goes through `esc` (PACT 11.3).

### 9.5 Client behaviour (`ui/app.js`)

New `data-action` values: `pact-seal` (stone or séance), `pact-ask-replace`, `pact-ask-break`,
`pact-confirm-replace`, `pact-confirm-break`, `pact-cancel`. All use the existing `withBusy` and `api`
helpers and refresh state afterwards.

Toasts (the `#toast` region is already `aria-live`):

- sealed: `Pact sealed for Lanternfield Everyday Checking. Hash 9b1f4c07…e4a2.`
- sealed, archive down: `Pact sealed for Lanternfield Everyday Checking with its hash only. The archive could not be reached.`
- no snapshot: `Nothing to seal yet. Summon the ghost for a first look.`
- exists (race with another tab): `A pact already exists. Open the séance to replace it.`
- broken: `Pact broken for Lanternfield Everyday Checking.`

Keyboard and motion: all controls are buttons in tab order; the confirm panel moves focus in and
restores it on close; the sealed chip has no animation, so reduced-motion needs no extra rule. Colours
use the existing CSS variables, with text on `--moon`/dark surfaces at the contrast the a11y spec
already enforces (PACT 10.12).

## 10. Demo seeding

`seedDemoPacts(deps, watches, { ageDays = DEMO_PACT_AGE_DAYS })`:

1. For each watch with a latest snapshot, `sealedAt = new Date(clock.now().getTime() - ageDays * 86_400_000)`
   (ISO). The clock is the injected one, so tests use `manualClock`.
2. The seeded snapshot is `{ ...latest, takenAt: sealedAt }`; `sha256 = snapshotSha256(seeded)`. The
   hash is over the back-dated document the store holds, so `shasum` on the pact file still matches.
3. The record has `seeded: 'demo'`, `snapshotTakenAt: sealedAt` and
   `archive: { archiveUrl: null, archivedAt: null, archivedBy: null, note: 'Demo pact: back-dated for the demo, so no archived copy was made.' }`.
   The archiver is never called: no archive can honestly be dated 40 days ago.
4. Watches with no snapshot (the blocked Cinderhollow ghost) are skipped and returned as
   `no-snapshot`.

`cli.ts` calls it for pact-enabled apps in two places: right after the demo's baseline `checkAll`,
and inside the demo's `rewind` after `store.clear()` and the new baseline. Because the first night
runs after seeding, night 1 already compares against a pact dated 40 days earlier. The sealed date and
the alert date then differ in the pack, e.g. `Oct 10, 2026` against `Nov 19, 2026`.

What the demo shows, with the existing fixture nights:

- Night 1, Lanternfield: bonus $300 to $400 is a `wentUp` shriek with tone `good`. The pact reference
  has relation `differs`, so the pack is the **bonus match** letter against Oct 10.
- Night 1, Mossgate: the 48-month clause slips into the fine print while the points stay at 60,000.
  That is a bait and switch, so the pack is the **dispute** letter, with Exhibit A as Oct 10's page.
- Night 2, Lanternfield: the monthly fee clause is added to the fine print. Against the pact it is a
  `bad` appearance, so a second dispute pack is available for the same stone.

## 11. Errors and edge cases

| Situation | Behaviour | Criteria |
|---|---|---|
| Archive rejects or times out while sealing | Sealed, note `Could not reach <label>: <reason>`, toast says hash only | 1.6, 10.6 |
| No archiver configured | Sealed with note, no toast warning needed | 1.5 |
| No snapshot | 409 `no-snapshot`, nothing stored, toast | 1.7, 9.4 |
| Pact exists, no confirmation | 409 `pact-exists`, nothing changed | 2.2, 9.3 |
| Store write fails while replacing | 500, old pact still readable | 2.4 |
| `pact.json` invalid, snapshot missing or hash differs | `corrupt`, checks run without the pact, stone says unreadable | 4.1 to 4.4, 10.4 |
| Seal over a corrupt pact | Allowed without confirmation | 4.5 |
| Break with no pact | 200 `removed: false` | 2.6 |
| Field removed from the page | Pact finding `bad`, summary says it disappeared | 5.2, 5.10 |
| Page returns to the promised terms | Finding marked `restored`, note says so, no extra alert | 5.5 |
| Pact sealed after an alert exists | Old alert has no pact reference; its pack is unchanged | 5.12, 6.8 |
| Browser tab shows a stale stone | Server answers 409; the toast points to the séance | 9.3 |
| Listing-watch (no `copy.pacts`) | All three routes 404; no stone control | 9.8, 11.5 |

## 12. Testing strategy

Titles carry the criterion: `it('(PACT 5.4) drift in $10 steps fires when the total passes minDelta', ...)`.
All tests use `manualClock`, `MemoryBlobStore` or a temp-dir `FileBlobStore`, a fake `PageArchiver`
(one that resolves, one that rejects), an `S3BlobStore` with a fake client (the pattern in
`template/test/adapters.test.ts`), and `startFixtureServer` on `127.0.0.1` only. No test touches
another host or builds an AWS client.

| File | Level | Covers |
|---|---|---|
| `template/test/pact-store.test.ts` **new** | unit | store round trip on memory, file (fresh `GhostStore` over the same dir) and fake S3; hash equals `shasum`-style hash of the file; pruning; `clear`; legacy money upgrade; corrupt cases (3.x, 4.1 to 4.3) |
| `template/test/pact-seal.test.ts` **new** | unit | `sealPact` and `breakPact`: archive success, failure, none; no snapshot; exists, confirm, replace atomicity (a blob store that fails the `pact.json` write); break; clock-only dates (1.x, 2.x, 4.5, 4.6) |
| `template/test/pact-compare.test.ts` **new** | unit | `comparePact`: attach, restored, small step, multi-night drift, no change tonight, stealth, noise, tone, list findings untouched, no pact is identity; runner integration with a manual clock and a stubbed fetcher (4.4, 5.x) |
| `template/test/money.test.ts` | unit | add: a pact of $0.10 and a page of $0.30 give a cumulative delta of exactly 20 cents; $4.35 parses to 435 cents in a pact reference; `minDelta` in dollars against a cumulative cents delta (5.8) |
| `template/test/pact-dispute.test.ts` **new** | unit | pack fields with a pact; blanks; Exhibit A with and without archive; restored; golden no-pact pack deep-equal to a stored copy of today's output; both letter bodies word for word with the invented names above; determinism; variant by tone, stealth and fee; no `Date.now(` or `new Date()` in the three source files (6.x, 7.x, 8.6) |
| `template/test/pact-server.test.ts` **new** | integration | the three routes on a real `createDashboardServer` over `127.0.0.1`: statuses and bodies, body limits, foreign Origin, unknown ghost, app without `copy.pacts`, `/api/state` badge, view model and `render.js` strings with escaping (9.x, 10.x string level, 11.3) |
| `apps/bonus-watch/test/pact.test.ts` **new** | integration | with the bonus fixture site: seed, night 1 and night 2 packs, `bonus` match letter and Mossgate dispute letter, 40 day gap from a manual clock, `shasum` hash of the pact file (8.x, 6.x, 7.x) |
| `e2e/seal-the-pact.spec.ts` **new** | Playwright | see below |

Playwright (`e2e/seal-the-pact.spec.ts`, ports only from `e2e/ports.ts`; the file name sorts after the
existing specs so it runs last in the serial run):

1. *Seal a stone* (bonus dashboard): `POST /api/ghosts/lanternfield-checking/check` through the
   page's own fetch to have a snapshot; the stone shows "I applied today"; click it; the toast names
   the watch and the short hash; the stone shows "Pact sealed" with the compact date and short hash,
   matching `GET /api/ghosts/lanternfield-checking/pact`; open the séance and see the pact section and
   the extra table column; "Seal again" shows the confirmation, "Keep it" changes nothing, "Yes,
   replace" changes the sealed time; "Break the pact" with confirmation brings the button back
   (10.1, 10.3, 10.5, 10.7 to 10.10, 1.x, 2.x).
2. *Sealing is keyboard operable and accessible*: Tab to the button, press Enter; axe finds no
   violation on the stone and the séance (10.12).
3. *Demo pack carries the pact date* (demo dashboard): rewind through the UI, check that the stone
   already says "Pact sealed" and "demo", press `N`, open Lanternfield, "Ask for the match"; the pack
   title is "Bonus match", the left column reads `<seeded date>, the day you applied: what the page
   promised` and the right `<today>: what it says now`; the two dates differ by 40 days; the letter
   has no `[Date you applied]` and starts with the sealed date; then Mossgate's "Raise the dead"
   opens the dispute variant with Exhibit A. Expected dates are computed in the test from
   `GET /api/ghosts/:id/pact` (`sealedAt`) and `/api/state` (`generatedAt`), so the test never
   depends on the calendar day (8.1 to 8.5, 6.x, 7.x, 10.11, 10.13).
4. *Demo rewind re-seeds*: after rewind the pact exists again and no alert remains (8.4).

Final checks for each build session: `npm run typecheck`, `npm run test:unit`,
`GHOST_E2E_PORT=3840 npx playwright test`.

## 13. Open design questions

1. **Hosts in the demo pack.** The brief says display hosts follow the existing fixture display rules.
   The code has no separate display-host helper. The pack today quotes `alert.url` as stored
   (`http://127.0.0.1:<port>/...` in the demo) and the archiver's own label ("the stand-in Wayback
   Machine"). This design reuses both and adds no rewriting. Confirm that this is the rule meant.
2. **Seeded pact and archive.** The seeded pact has no archived copy, so Exhibit A in the demo shows
   "none: Demo pact ..." plus the hash. Using the stand-in archive would look better but would label a
   copy taken today as a copy from 40 days ago.
3. **Stale reading.** Sealing uses the latest stored snapshot and does not force a check. If the page
   moved since the last visit, the séance shows the reading's age but the seal still says "today".
   An option is to run a forced check first; it adds a fetch to a button that should be instant.
4. **Embedded pact reference.** Alerts keep a copy of the pact facts, so an alert raised before the
   reader sealed gets no pact-dated pack. Looking the pact up at pack time would change that, at the
   cost of packs that change when a pact is replaced.
