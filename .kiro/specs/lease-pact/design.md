# Design: Lease Pact

Builds on `.kiro/specs/seal-the-pact/design.md` (sections cited as "SEAL §n"). Nothing in the pact
store layout, sealing, comparison algorithm, HTTP routes or hashing changes. Only the words change, and
those words move out of the template into the app.

## 1. Decisions

1. **One optional object carries the vocabulary.** `AppCopy.pactCopy?: Partial<PactVocabulary>`. An app
   that omits it gets `BONUS_PACT_VOCABULARY`, which holds today's literal strings. Every consumer calls
   `resolvePactVocabulary(app)`, so the bonus output is identical by construction (LEASE 1.12).
2. **Letters are functions, not string templates.** `letters.dispute` and `letters.match` take a
   `LetterContext` (offer, url, dates, quoted lines, evidence lines, hash lines, stealth line) and return
   `{ subject, body }`. A function keeps the grammar of each letter with its author. The bonus letters
   stay in `dispute.ts` as the default, unchanged.
3. **Pact eligibility by tag.** `pactCopy.watchTags` limits the pact to listing detail watches. A search
   results list or a permit table has nothing a renter signed (LEASE 2).
4. **Demo age is per vocabulary.** `demoAgeDays` (default 40, `DEMO_PACT_AGE_DAYS`). The lease demo uses
   30 days: leases are signed a few weeks before move-in, and a month is long enough for a landlord to have
   quietly changed the page (LEASE 5.1).
5. **The complaint becomes an "authority" block.** `DisputePack.complaint` stays a required field so bank
   code and tests keep compiling. When the vocabulary sets `authority` or `cfpb: false`, the pack carries
   `authority: { heading, text }` and `complaint` holds neutral text with empty CFPB fields (§4).
6. **No invented agencies.** The lease authority text is one sentence: "If the landlord does not
   answer, you can ask your local housing authority or your state attorney general's consumer office for
   help." (LEASE 6.5).

## 2. Template modules

| Module | Change |
|---|---|
| `pact-vocabulary.ts` (new) | `PactVocabulary`, `LetterContext`, `BONUS_PACT_VOCABULARY`, `resolvePactVocabulary`, `pactEnabledFor(app, watch)` |
| `app.ts` | `AppCopy.pactCopy?` |
| `pact.ts` | `pactNote` and `comparePact` take an optional vocabulary (the "day" phrase and the summary prefix) |
| `runner.ts` | passes the resolved vocabulary to `comparePact` |
| `dispute.ts` | `disputePack(alert, watch, vocabulary?)`: letters, evidence labels, date blank, authority/CFPB switch |
| `sealing.ts` | `seedDemoPacts` takes `ageDays` and the watches already filtered by `pactEnabledFor` |
| `view.ts` | state exposes `app.pactCopy` (the UI strings only, never the letter functions); stones and details use `pactEnabledFor` |
| `server.ts` | pact routes and dispute route use `pactEnabledFor` and pass the vocabulary |
| `cli.ts` | demo seeding uses the vocabulary's age and the eligible watches |
| `ui/render.js`, `ui/app.js` | read strings from `state.app.pactCopy`; defaults are the current literals |
| `index.ts` | exports the new names |

What stays app-specific: the listing-watch lease vocabulary (strings and the two letter functions), the
lease watch definition and its rules, the fixture page.

The pack also carries `ui` (title, intro, stamp, heading and exhibit tags) only for apps that set `pactCopy`.

## 3. The vocabulary

```ts
interface PactVocabulary {
  sealLabel: string;        // 'I applied today' | 'I signed the lease'
  sealedChip: string;       // 'Pact sealed' | 'Lease sealed'
  sectionTitle: string;     // 'The pact' | 'The lease pact'
  emptyLine: string;
  valueColumn: string;      // 'The day you applied' | 'The day you signed'
  day: string;              // 'the day you applied' | 'the day you signed the lease'
  since: string;            // 'you applied' | 'you signed the lease'
  dateBlank: string;        // '[Date you applied]' | '[Date you signed the lease]'
  evidence: { exhibitA: string; ... };  // row label stem, e.g. 'Exhibit A' | 'Advertised'
  letters?: { dispute(c): Letter; match(c): Letter };
  cfpb: boolean;
  authority?: { heading: string; text: string };
  watchTags?: string[];
  demoAgeDays: number;
}
```

## 4. Pack shape

`DisputePack` gains `authority?: { heading: string; text: string }` and `title: string` (the page heading:
"Dispute pack", "Bonus match", "Lease letter", "Rent match"). `complaint` is kept for bank apps. For a
vocabulary with `cfpb: false` the pack still has a `complaint` object of the same type holding only the
neutral `whatHappened` and `desiredResolution` in lease wording and empty category strings, and the
renderer shows `authority` instead of it, so no CFPB string reaches the page or the JSON (LEASE 6.4).

## 5. Haunted Listings

- New watch `larkspur-flats-5b` ("Larkspur Flats, Unit 5B"), tags `['rentals', 'lease']`, URL
  `/rentals/listing/LR-2033`, fields `rent` (money, lower is better), `applicationFee`, `deposit`,
  `moveIn` (text), `monthlyFees` (text, the fine print).
- Rules: `wentUp('rent', shriek)`, `wentDown('rent', shriek)`, `appeared('monthlyFees', /monthly .* fee/,
  shriek, tone bad)`, `wentUp('applicationFee')`, `wentUp('deposit')`, `changed('moveIn', whisper)`,
  `changed('monthlyFees', whisper)`, no `stealthEdit`, because the rent moves too.
- Fixture versions: v1 rent $2,050, application fee $50, deposit $1,000, one month free, fine print "Pets
  welcome. Water and trash are included." v2: rent $2,125, fine print adds "A $45 monthly amenity fee
  applies to every unit." v3: same as v2 (the fixture has three versions; nights 2 and 3 are quiet for this
  page). Footer, sponsored slot and tracking links vary per request as noise.
- Seeded pact: 30 days back (SEAL §10, with the vocabulary's age).

## 6. Letters

Dispute letter (landlord): salutation to `[Landlord or property manager]` for `<offer>`, "I signed the
lease for <offer> on <date>, relying on the terms advertised at <url>", the quoted advertised and charged
lines under their dates, the evidence (copy link or note, SHA-256), a request to charge only the advertised
terms and confirm in writing in 30 days. Match letter: asks the landlord to apply the lower rent. Neither
names a bank, a bonus or CFPB.

## 7. Testing strategy

| Test file | Covers |
|---|---|
| `apps/listing-watch/test/lease-pact.test.ts` | LEASE 1.1 to 1.5, 1.9, 1.12, 2.1, 2.4, 3.1, 3.2, 4.1 to 4.6, 5.1, 5.3, 5.4, 6.1 to 6.9 on the real fixture site |
| existing `template/test/pact-*.test.ts` | the default vocabulary path (LEASE 1.12) |
| `apps/bonus-watch/test/*` (unchanged) | LEASE 1.12, 7.1 |
| `e2e/lease-pact.spec.ts` | LEASE 3.3 to 3.6, 5.3, 5.5, 6.1 to 6.8, 7.6 |
