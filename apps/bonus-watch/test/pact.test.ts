import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEMO_PACT_AGE_DAYS,
  FileBlobStore,
  GhostStore,
  PoliteFetcher,
  Runner,
  SavePageNowArchiver,
  buildUserAgent,
  disputePack,
  manualClock,
  seedDemoPacts,
  type Alert,
  type AlertMessage,
  type AlertSink,
  type PageArchiver,
} from '@ghost-watcher/template';
import { MemoryBlobStore, startFixtureServer } from '@ghost-watcher/template/testing';
import { bonusSite } from '../fixtures/site';
import { buildApp } from '../src/app';

const NOW = '2026-11-19T10:00:00.000Z';
const SEEDED = '2026-10-10T10:00:00.000Z';

class Inbox implements AlertSink {
  readonly channel = 'inbox';
  messages: AlertMessage[] = [];
  async deliver(message: AlertMessage) {
    this.messages.push(message);
    return { channel: this.channel, reference: String(this.messages.length) };
  }
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** The demo's flow on the bonus fixture site: baseline, seed the pacts, then nights on demand. */
async function demo(options: { dir?: string } = {}) {
  const fixture = await startFixtureServer(bonusSite, { port: 0 });
  cleanups.push(() => fixture.close());
  const built = buildApp({ BONUS_SITE_ORIGIN: fixture.origin });
  const app = { ...built, watches: built.watches.map((w) => ({ ...w, intervalMs: 0 })) };
  const userAgent = buildUserAgent({ version: app.version, localOnly: true });
  const clock = manualClock(NOW);
  const sink = new Inbox();
  const store = new GhostStore(options.dir ? new FileBlobStore(options.dir) : new MemoryBlobStore());
  const stand = new SavePageNowArchiver({ userAgent, clock, base: `${fixture.origin}/__wayback`, label: 'the stand-in Wayback Machine' });
  const archiver = { calls: 0 };
  const archive: PageArchiver = {
    label: stand.label,
    save: async (url) => {
      archiver.calls += 1;
      return stand.save(url);
    },
  };
  const runner = new Runner({
    app,
    fetcher: new PoliteFetcher({ userAgent, clock, minHostGapMs: 0, maxCrawlDelayMs: 0 }),
    store,
    sink,
    clock,
    archive,
  });
  await runner.checkAll({ force: true });
  const callsBeforeSeeding = archiver.calls;
  const seeded = await seedDemoPacts({ store, clock }, app.watches);
  const night = async () => {
    fixture.advance();
    await runner.checkAll({ force: true });
    // The next night is a day later, as in life. Alert ids carry the check's time, so they stay distinct.
    clock.advance(24 * 60 * 60 * 1000);
  };
  const watch = (id: string) => app.watches.find((w) => w.id === id);
  const alerts = async (id: string): Promise<Alert[]> => store.alerts(id);
  return { app, store, clock, runner, seeded, night, watch, alerts, archiver, callsBeforeSeeding };
}

describe('bonus-watch: seeded pacts on the fixture site', () => {
  it('(PACT 8.1, 8.2, 8.3) seals a pact 40 days before now for every ghost with a snapshot, without calling the archiver', async () => {
    const { store, seeded, archiver, callsBeforeSeeding } = await demo();
    expect(DEMO_PACT_AGE_DAYS).toBe(40);
    expect(seeded.map((r) => r.status)).toEqual(['sealed', 'sealed', 'sealed', 'no-snapshot']);
    expect(archiver.calls).toBe(callsBeforeSeeding);
    for (const id of ['lanternfield-checking', 'bramblewick-savings', 'mossgate-nightfall']) {
      const reading = await store.pact(id);
      if (reading.status !== 'sealed') throw new Error(`expected a sealed pact for ${id}`);
      expect(reading.pact).toMatchObject({
        sealedAt: SEEDED,
        snapshotTakenAt: SEEDED,
        seeded: 'demo',
        archive: { archiveUrl: null, archivedAt: null, archivedBy: null, note: 'Demo pact: back-dated for the demo, so no archived copy was made.' },
      });
      expect(reading.pact.snapshot.takenAt).toBe(SEEDED);
    }
  });

  it('(PACT 8.7) the blocked ghost has no snapshot, so it is skipped and stays without a pact', async () => {
    const { store, seeded } = await demo();
    expect(seeded[3]).toEqual({ status: 'no-snapshot' });
    expect((await store.pactRecord('cinderhollow-members')).status).toBe('none');
  });

  it('(PACT 8.2) the pact file on disk hashes to the recorded SHA-256 with shasum', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghost-pact-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const { store } = await demo({ dir });
    const reading = await store.pactRecord('lanternfield-checking');
    if (reading.status !== 'sealed') throw new Error('expected a pact');
    const bytes = await readFile(join(dir, 'pacts', 'lanternfield-checking', `${reading.record.sha256}.json`));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(reading.record.sha256);
  });

  it('(PACT 6.1, 6.3, 6.4, 7.1, 7.3, 8.5) night 1 gives Lanternfield the bonus match letter, dated from the seed', async () => {
    const { night, alerts, watch } = await demo();
    await night();
    const shriek = (await alerts('lanternfield-checking')).find((a) => a.field === 'bonus') as Alert;
    expect(shriek.pact).toMatchObject({ relation: 'differs', tone: 'good', seeded: 'demo', sealedAt: SEEDED });
    expect(shriek.pact?.note).toBe('On Oct 10, 2026, the day you applied, Bonus was $300; it is now $400 (+$100).');
    const pack = disputePack(shriek, watch('lanternfield-checking'));
    if (!pack?.pact) throw new Error('expected a pack with a pact');
    expect(pack.pact).toMatchObject({ variant: 'match', relation: 'differs', appliedDate: 'Oct 10, 2026', seeded: true });
    expect(pack.beforeDate).toBe('Oct 10, 2026');
    expect(pack.afterDate).toBe('Nov 19, 2026');
    expect(pack.before).toEqual(['Bonus: $300']);
    expect(pack.after).toEqual(['Bonus: $400']);
    expect(pack.letter.subject).toBe('Request to match the improved terms of Lanternfield Everyday Checking');
    expect(pack.letter.body).toContain('I applied for Lanternfield Everyday Checking on Oct 10, 2026');
    expect(pack.letter.body).toContain('What the page promised on Oct 10, 2026, the day I applied:\n  Bonus: $300');
    expect(pack.letter.body).toContain('What the page says on Nov 19, 2026:\n  Bonus: $400');
    expect(pack.letter.body).toContain('Exhibit A SHA-256: ' + shriek.pact?.sha256);
    expect(pack.letter.body).toContain('no public archived copy was made (Demo pact: back-dated for the demo, so no archived copy was made.)');
    expect(pack.letter.body).not.toContain('[Date you applied]');
    expect(pack.letter.body).not.toMatch(/CFPB|Consumer Financial/);
    expect(pack.blanks).toEqual(['[Your name]', '[Your address]', '[Last 4 digits of the account]']);
  });

  it('(PACT 6.1, 6.5, 7.2, 8.5) night 1 gives Mossgate the dispute letter with Exhibit A, dated from the seed', async () => {
    const { night, alerts, watch } = await demo();
    await night();
    const stealth = (await alerts('mossgate-nightfall')).find((a) => a.stealth) as Alert;
    expect(stealth.pact?.sealedAt).toBe(SEEDED);
    const pack = disputePack(stealth, watch('mossgate-nightfall'));
    if (!pack?.pact) throw new Error('expected a pack with a pact');
    expect(pack.pact).toMatchObject({ variant: 'dispute', appliedDate: 'Oct 10, 2026' });
    expect(pack.letter.subject).toBe('Request to honor the advertised terms of Mossgate Nightfall Card');
    expect(pack.letter.body).toContain('I applied for Mossgate Nightfall Card on Oct 10, 2026');
    expect(pack.letter.body).toContain('Exhibit A');
    expect(pack.letter.body).toContain('Consumer Financial Protection Bureau');
    expect(pack.evidence.map((row) => row.label)).toContain('Exhibit A SHA-256');
    expect(pack.evidence.find((row) => row.label === 'Exhibit A SHA-256')?.value).toBe(stealth.pact?.sha256);
    expect(pack.blanks).not.toContain('[Date you applied]');
  });

  it('(PACT 6.4, 7.2, 8.5) night 2 adds a Lanternfield dispute pack for the new monthly fee clause', async () => {
    const { night, alerts, watch } = await demo();
    await night();
    const before = await alerts('lanternfield-checking');
    await night();
    const added = (await alerts('lanternfield-checking')).filter((a) => !before.some((b) => b.id === a.id));
    const fee = added.find((a) => a.receipt && a.field === 'finePrint') as Alert;
    expect(fee, 'a night-2 alert with a receipt').toBeDefined();
    expect(fee.pact).toMatchObject({ relation: 'differs', tone: 'bad', sealedAt: SEEDED });
    const pack = disputePack(fee, watch('lanternfield-checking'));
    expect(pack?.pact).toMatchObject({ variant: 'dispute', appliedDate: 'Oct 10, 2026' });
    expect(pack?.beforeDate).toBe('Oct 10, 2026');
    expect(pack?.letter.subject).toBe('Request to honor the advertised terms of Lanternfield Everyday Checking');
  });

  it('(PACT 8.4) after a clear and a new baseline, as rewind does, seeding seals fresh pacts dated 40 days before the new now', async () => {
    const { store, clock, runner, app } = await demo();
    await store.clear();
    expect((await store.pactRecord('lanternfield-checking')).status).toBe('none');
    clock.advance(24 * 60 * 60 * 1000);
    await runner.checkAll({ force: true });
    const results = await seedDemoPacts({ store, clock }, app.watches);
    expect(results.map((r) => r.status)).toEqual(['sealed', 'sealed', 'sealed', 'no-snapshot']);
    const reading = await store.pactRecord('lanternfield-checking');
    expect(reading).toMatchObject({ status: 'sealed', record: { sealedAt: '2026-10-11T10:00:00.000Z', seeded: 'demo' } });
  });
});
