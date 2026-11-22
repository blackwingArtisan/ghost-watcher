import { describe, expect, it } from 'vitest';
import {
  BONUS_PACT_VOCABULARY,
  GhostStore,
  PoliteFetcher,
  Runner,
  buildUserAgent,
  disputePack,
  disputesEnabledFor,
  manualClock,
  pactEnabledFor,
  pactUiCopy,
  resolvePactVocabulary,
  seedDemoPacts,
  sealPact,
  type Alert,
  type AlertMessage,
  type AlertSink,
} from '@ghost-watcher/template';
import { MemoryBlobStore, startFixtureServer } from '@ghost-watcher/template/testing';
import { listingSite } from '../fixtures/site';
import { LEASE_TAG, buildApp } from '../src/app';

const NOW = '2026-11-19T10:00:00.000Z';
const LEASE = 'larkspur-flats-5b';

class Inbox implements AlertSink {
  readonly channel = 'inbox';
  messages: AlertMessage[] = [];
  async deliver(message: AlertMessage) {
    this.messages.push(message);
    return { channel: this.channel, reference: String(this.messages.length) };
  }
}

/** Signs the lease on night 0 (version 1), then lets two nights pass. */
async function signedLease(seed: 'button' | 'demo') {
  const fixture = await startFixtureServer(listingSite, { port: 0 });
  try {
    const built = buildApp({ LISTING_SITE_ORIGIN: fixture.origin });
    const app = { ...built, watches: built.watches.map((w) => ({ ...w, intervalMs: 0 })) };
    const userAgent = buildUserAgent({ version: app.version, localOnly: true });
    const clock = manualClock(NOW);
    const sink = new Inbox();
    const store = new GhostStore(new MemoryBlobStore());
    const runner = new Runner({
      app,
      fetcher: new PoliteFetcher({ userAgent, clock, minHostGapMs: 0, maxCrawlDelayMs: 0 }),
      store,
      sink,
      clock,
    });
    await runner.checkAll({ force: true });
    const watch = app.watches.find((w) => w.id === LEASE);
    if (!watch) throw new Error('lease watch missing');
    const sealed =
      seed === 'button'
        ? await sealPact({ store, clock }, watch)
        : (await seedDemoPacts({ store, clock }, app.watches.filter((w) => pactEnabledFor(app, w)), { ageDays: resolvePactVocabulary(app).demoAgeDays }))[0];
    fixture.advance();
    await runner.checkAll({ force: true });
    const night1 = sink.messages.flatMap((m) => m.alerts).filter((a) => a.watchId === LEASE);
    sink.messages = [];
    await runner.checkAll({ force: true });
    const repeat = sink.messages.flatMap((m) => m.alerts).filter((a) => a.watchId === LEASE);
    return { app, watch, sealed, night1, repeat, store };
  } finally {
    await fixture.close();
  }
}

const rentAlert = (alerts: Alert[]) => alerts.find((a) => a.field === 'rent');
const feeAlert = (alerts: Alert[]) => alerts.find((a) => a.field === 'monthlyFees');

describe('lease pact vocabulary', () => {
  it('(LEASE 1.12) an app with no pactCopy resolves to the bank wording and sends no pactCopy to the dashboard', () => {
    const app = { copy: { watchNoun: 'x', quiet: 'y', pacts: true, pactCopy: undefined } };
    expect(resolvePactVocabulary(app)).toBe(BONUS_PACT_VOCABULARY);
    expect(pactUiCopy(app)).toBeUndefined();
    expect(BONUS_PACT_VOCABULARY.sealLabel).toBe('I applied today');
    expect(BONUS_PACT_VOCABULARY.cfpb).toBe(true);
  });

  it('(LEASE 1.1, 1.2, 1.3, 1.4, 1.5, 1.9) the lease wording replaces the bank wording', () => {
    const v = resolvePactVocabulary(buildApp({ LISTING_SITE_ORIGIN: 'http://127.0.0.1:1' }));
    expect(v).toMatchObject({
      sealLabel: 'I signed the lease',
      sealedChip: 'Lease sealed',
      sectionTitle: 'The lease pact',
      valueColumn: 'The day you signed',
      day: 'the day you signed the lease',
      dateBlank: '[Date you signed the lease]',
      cfpb: false,
      demoAgeDays: 30,
    });
    expect(pactUiCopy(buildApp({ LISTING_SITE_ORIGIN: 'http://127.0.0.1:1' }))?.sealLabel).toBe('I signed the lease');
  });

  it('(LEASE 2.1, 2.4) only the lease watch carries a pact in Haunted Listings; with no watchTags every watch does', () => {
    const app = buildApp({ LISTING_SITE_ORIGIN: 'http://127.0.0.1:1' });
    expect(app.watches.filter((w) => pactEnabledFor(app, w)).map((w) => w.id)).toEqual([LEASE]);
    expect(app.watches.find((w) => w.id === LEASE)?.tags).toContain(LEASE_TAG);
    const open = { copy: { ...app.copy, pactCopy: { ...app.copy.pactCopy, watchTags: undefined } } };
    expect(app.watches.every((w) => pactEnabledFor(open, w))).toBe(true);
  });
});

describe('lease pact eligibility of letters', () => {
  it('(LEASE 2.5) Raise the dead is offered only on the lease watch', () => {
    const app = buildApp({ LISTING_SITE_ORIGIN: 'http://127.0.0.1:1' });
    expect(app.watches.filter((w) => disputesEnabledFor(app, w)).map((w) => w.id)).toEqual([LEASE]);
  });
});

describe('lease pact seal and comparison', () => {
  it('(LEASE 3.1, 3.2) "I signed the lease" seals the listing with every amount in integer cents', async () => {
    const { sealed } = await signedLease('button');
    expect(sealed?.status).toBe('sealed');
    if (sealed?.status !== 'sealed') return;
    const f = sealed.pact.snapshot.fields;
    expect(f.rent).toMatchObject({ kind: 'money', amountMinor: 205000 });
    expect(f.applicationFee).toMatchObject({ amountMinor: 5000 });
    expect(f.deposit).toMatchObject({ amountMinor: 100000 });
    expect(f.moveIn).toMatchObject({ kind: 'text' });
    expect(f.monthlyFees).toMatchObject({ kind: 'text' });
    expect(sealed.pact.sealedAt).toBe(NOW);
  });

  it('(LEASE 4.1, 4.4) night 1 raises a rent alert whose pact note names the signing date, $2,050 and $2,125 in integer cents', async () => {
    const { night1 } = await signedLease('button');
    const rent = rentAlert(night1);
    expect(rent?.summary).toContain('$2,050');
    expect(rent?.summary).toContain('$2,125');
    expect(rent?.pact).toMatchObject({ relation: 'differs', tone: 'bad', promised: { kind: 'money', amountMinor: 205000 } });
    expect(rent?.after).toMatchObject({ amountMinor: 212500 });
    expect(rent?.pact?.note).toBe('On Nov 19, 2026, the day you signed the lease, the rent was $2,050; it is now $2,125 (+$75).');
  });

  it('(LEASE 4.2, 4.3, 4.6) the new $45 monthly amenity fee is its own shriek with tone bad and a pact reference', async () => {
    const { night1 } = await signedLease('button');
    const fee = feeAlert(night1);
    expect(fee?.severity).toBe('shriek');
    expect(fee?.pact?.tone).toBe('bad');
    expect(fee?.summary).toContain('$45 monthly amenity fee');
    expect(fee?.pact?.note).toContain('$45 monthly amenity fee');
    expect(rentAlert(night1)?.id).not.toBe(fee?.id);
  });

  it('(LEASE 4.5) a repeat check of the same page raises nothing', async () => {
    const { repeat } = await signedLease('button');
    expect(repeat).toEqual([]);
  });

  it('(LEASE 5.1, 5.4) the demo seals the lease back-dated 30 days and marks it as the demo pact', async () => {
    const { sealed } = await signedLease('demo');
    expect(sealed?.status).toBe('sealed');
    if (sealed?.status !== 'sealed') return;
    expect(sealed.pact.sealedAt).toBe('2026-10-20T10:00:00.000Z');
    expect(sealed.pact.seeded).toBe('demo');
  });

  it('(LEASE 5.3) the first demo night raises the rent and the fee since the seeded date', async () => {
    const { night1 } = await signedLease('demo');
    expect(rentAlert(night1)?.pact?.note).toBe('On Oct 20, 2026, the day you signed the lease, the rent was $2,050; it is now $2,125 (+$75).');
    expect(feeAlert(night1)?.summary).toContain('$45 monthly amenity fee');
  });
});

describe('the landlord letter', () => {
  it('(LEASE 6.1, 6.2, 6.3) quotes what was advertised on the signing date against what is charged now', async () => {
    const { app, watch, night1 } = await signedLease('demo');
    const pack = disputePack({ ...(feeAlert(night1) as Alert) }, watch, resolvePactVocabulary(app));
    expect(pack).not.toBeNull();
    const body = pack?.letter.body ?? '';
    expect(pack?.letter.subject).toBe('Request to honor the advertised terms of Larkspur Flats, Unit 5B');
    expect(body).toContain('To: The landlord or property manager, Larkspur Flats, Unit 5B');
    expect(body).toContain('I signed the lease for Larkspur Flats, Unit 5B on Oct 20, 2026');
    expect(body).toContain('What was advertised on Oct 20, 2026, the day I signed the lease:');
    expect(body).toContain('What the page charges on Nov 19, 2026:');
    expect(body).toContain('A $45 monthly amenity fee applies to every unit.');
    expect(body).toContain('https://larkspur-rentals.example/rentals/listing/LR-2033');
    expect(pack?.pact?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body).toContain(pack?.pact?.sha256 ?? 'missing');
    expect(pack?.beforeDate).toBe('Oct 20, 2026');
    expect(pack?.afterDate).toBe('Nov 19, 2026');
  });

  it('(LEASE 6.2) the rent letter quotes dollars and cents on each side', async () => {
    const { app, watch, night1 } = await signedLease('demo');
    const pack = disputePack(rentAlert(night1) as Alert, watch, resolvePactVocabulary(app));
    expect(pack?.before).toEqual(['Rent: $2,050']);
    expect(pack?.after).toEqual(['Rent: $2,125']);
  });

  it('(LEASE 6.4, 6.5) says nothing of a bank, a bonus or the CFPB, and names no agency', async () => {
    const { app, watch, night1 } = await signedLease('demo');
    const pack = disputePack(feeAlert(night1) as Alert, watch, resolvePactVocabulary(app));
    const all = JSON.stringify(pack);
    expect(all.match(/bank|bonus|CFPB|Consumer Financial|customer care|consumerfinance/i)?.[0]).toBeUndefined();
    expect(pack?.authority?.text).toBe(
      "You can ask your local housing authority or your state attorney general's consumer office for help. Bring this letter and the evidence above.",
    );
    expect(pack?.complaint.url).toBe('');
  });

  it('(LEASE 6.6, 6.7, 6.8) titles the pack, labels the evidence and leaves the lease blanks', async () => {
    const { app, watch, night1 } = await signedLease('demo');
    const pack = disputePack(feeAlert(night1) as Alert, watch, resolvePactVocabulary(app));
    expect(pack?.ui?.title).toBe('Lease letter');
    const labels = pack?.evidence.map((r) => r.label) ?? [];
    expect(labels).toEqual(expect.arrayContaining(['Advertised on Oct 20, 2026', 'Advertised copy', 'Advertised SHA-256', 'Check the advertised page']));
    expect(pack?.blanks).toEqual(['[Your name]', '[Your address]', '[Unit]']);
  });

  it('(LEASE 6.9) the same alert gives the same pack, word for word', async () => {
    const { app, watch, night1 } = await signedLease('demo');
    const a = disputePack(feeAlert(night1) as Alert, watch, resolvePactVocabulary(app));
    const b = disputePack(feeAlert(night1) as Alert, watch, resolvePactVocabulary(app));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
