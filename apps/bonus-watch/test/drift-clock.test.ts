import { afterEach, describe, expect, it } from 'vitest';
import {
  GhostStore,
  PoliteFetcher,
  Runner,
  bonusClockView,
  buildUserAgent,
  buildWeeklyDigest,
  disputePack,
  driftSummary,
  manualClock,
  seedDemoPacts,
  type AlertMessage,
  type AlertSink,
} from '@ghost-watcher/template';
import { MemoryBlobStore, startFixtureServer } from '@ghost-watcher/template/testing';
import { bonusSite } from '../fixtures/site';
import { buildApp } from '../src/app';

const NOW = '2026-11-19T10:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function demo() {
  const fixture = await startFixtureServer(bonusSite, { port: 0 });
  cleanups.push(() => fixture.close());
  const built = buildApp({ BONUS_SITE_ORIGIN: fixture.origin });
  const app = { ...built, watches: built.watches.map((w) => ({ ...w, intervalMs: 0 })) };
  const clock = manualClock(NOW);
  const messages: AlertMessage[] = [];
  const sink: AlertSink = { channel: 'inbox', deliver: async (m) => (messages.push(m), { channel: 'inbox', reference: String(messages.length) }) };
  const store = new GhostStore(new MemoryBlobStore());
  const userAgent = buildUserAgent({ version: app.version, localOnly: true });
  const runner = new Runner({ app, fetcher: new PoliteFetcher({ userAgent, clock, minHostGapMs: 0, maxCrawlDelayMs: 0 }), store, sink, clock });
  await runner.checkAll({ force: true });
  await seedDemoPacts({ store, clock }, app.watches, { skip: app.copy.demoUnsealed ?? [] });
  const night = async () => {
    fixture.advance();
    await runner.checkAll({ force: true });
    clock.advance(DAY);
  };
  return { app, store, night, watch: (id: string) => app.watches.find((w) => w.id === id) };
}

describe('Fernwick drift: what only the pact catches', () => {
  it('(PACT 14.1, 14.2, 14.3, 14.5, 14.9, 14.10) stays quiet on nights 1 and 2 and shrieks once on night 3', async () => {
    const { store, night } = await demo();
    await night();
    expect(await store.alerts('fernwick-premier')).toEqual([]);
    await night();
    expect(await store.alerts('fernwick-premier')).toEqual([]);
    await night();
    const alerts = await store.alerts('fernwick-premier');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      severity: 'shriek',
      summary: 'Drifted since you applied: $5,000 → $3,500 over 3 nights',
      pact: { relation: 'differs', tone: 'bad' },
    });
  });

  it('(PACT 14.6, 14.7) the drift alert carries a receipt and a dispute letter quoting the pact day against now', async () => {
    const { store, night, watch } = await demo();
    await night();
    await night();
    await night();
    const [alert] = await store.alerts('fernwick-premier');
    expect(alert?.receipt).toBeDefined();
    const pack = alert && disputePack(alert, watch('fernwick-premier'));
    expect(pack?.letter.body).toContain('Oct 10, 2026');
    expect(pack?.letter.body).toContain('$5,000');
    expect(pack?.letter.body).toContain('$3,500');
  });

  it('(PACT 14.4) words one night as "1 night"', () => {
    const change = { field: 'bonus', type: 'changed', before: null, after: null } as unknown as Parameters<typeof driftSummary>[1];
    expect(driftSummary('you applied', change, 1)).toBe('Drifted since you applied: nothing → nothing over 1 night');
  });
});

describe('The bonus clock', () => {
  const mossgate = buildApp({}).watches.find((w) => w.id === 'mossgate-nightfall')?.bonusClock;
  const sealed = '2026-10-10T10:00:00.000Z';

  it('(PACT 15.2, 15.4, 15.3) counts days left to the requirement from the pact date and the injected now', () => {
    if (!mossgate) throw new Error('Mossgate has no clock');
    const view = bonusClockView(mossgate, sealed, undefined, NOW);
    expect(view).toMatchObject({ state: 'counting', line: '51 days left to spend $4,000', requirementDate: 'Jan 9, 2027', postingDate: 'Mar 6, 2027' });
  });

  it('(PACT 15.5) shows the bonus as due while the posting window runs', () => {
    if (!mossgate) throw new Error('Mossgate has no clock');
    expect(bonusClockView(mossgate, sealed, undefined, '2027-01-20T10:00:00.000Z')).toMatchObject({ state: 'posting', line: 'Bonus due in 45 days (Mar 6, 2027)' });
  });

  it('(PACT 15.6, 15.7, 15.8) says "Bonus due, not posted" with a letter citing the requirement, the pact date and the window', async () => {
    const { store, watch } = await demo();
    const fern = watch('fernwick-premier')?.bonusClock;
    if (!fern) throw new Error('Fernwick has no clock');
    const record = await store.pactRecord('fernwick-premier');
    if (record.status !== 'sealed') throw new Error('no pact');
    const view = bonusClockView(fern, record.record.sealedAt, undefined, NOW);
    expect(view.line).toBe('Bonus due, not posted');
    const { bonusClockLetter } = await import('@ghost-watcher/template');
    const letter = bonusClockLetter('Fernwick Premier Savings', 'https://fernwick.example/premier-savings', fern, record.record.sealedAt, view);
    expect(letter.body).toContain('deposit new funds');
    expect(letter.body).toContain('Oct 10, 2026');
    expect(letter.body).toContain('within 15 days after the deposit');
  });

  it('(PACT 15.10, 15.11, 15.12) "Bonus posted" stores the mark with the pact and stops the clock', async () => {
    const { store, watch } = await demo();
    const fern = watch('fernwick-premier')?.bonusClock;
    if (!fern) throw new Error('Fernwick has no clock');
    const marked = await store.markBonusPosted('fernwick-premier', NOW);
    expect(marked?.bonusPostedAt).toBe(NOW);
    const reread = await store.pact('fernwick-premier');
    expect(reread.status).toBe('sealed');
    expect(bonusClockView(fern, marked?.sealedAt ?? '', marked?.bonusPostedAt, NOW)).toMatchObject({ state: 'posted', line: 'Bonus posted', daysLeft: 0 });
    await seedDemoPacts({ store, clock: manualClock(NOW) }, [{ id: 'fernwick-premier', name: 'Fernwick' }]);
    const after = await store.pactRecord('fernwick-premier');
    expect(after.status === 'sealed' && after.record.bonusPostedAt).toBeFalsy();
  });

  it('(PACT 15.13) refuses to mark a ghost without a pact', async () => {
    const { store } = await demo();
    expect(await store.markBonusPosted('bramblewick-savings', NOW)).toBeNull();
  });

  it('(PACT 15.14, 15.15, 15.16) the digest lists every clock and the last seven days of changes, and says so when quiet', async () => {
    const { store, night, watch } = await demo();
    await night();
    await night();
    await night();
    const fern = watch('fernwick-premier')?.bonusClock;
    const mossRecord = await store.pactRecord('mossgate-nightfall');
    if (!fern || !mossgate || mossRecord.status !== 'sealed') throw new Error('setup');
    const items = [
      { name: 'Fernwick Premier Savings', clock: bonusClockView(fern, mossRecord.record.sealedAt, undefined, NOW), alerts: await store.alerts('fernwick-premier') },
      { name: 'Mossgate Nightfall Card', clock: bonusClockView(mossgate, mossRecord.record.sealedAt, undefined, NOW), alerts: [] },
    ];
    const week = buildWeeklyDigest({ appName: 'The Bonus Crypt', now: '2026-11-22T10:00:00.000Z', items });
    expect(week.text).toContain('- Fernwick Premier Savings: Bonus due, not posted');
    expect(week.text).toContain('- Mossgate Nightfall Card: ');
    expect(week.text).toContain('Drifted since you applied: $5,000 → $3,500 over 3 nights');
    const quiet = buildWeeklyDigest({ appName: 'The Bonus Crypt', now: '2026-12-30T10:00:00.000Z', items });
    expect(quiet.text).toContain('No changes this week.');
  });
});
