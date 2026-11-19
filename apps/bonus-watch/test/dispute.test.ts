import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  CFPB_CATEGORIES,
  GhostStore,
  PoliteFetcher,
  Runner,
  SavePageNowArchiver,
  buildUserAgent,
  createDashboardServer,
  disputePack,
  loadDeps,
  systemClock,
  type Alert,
  type AlertMessage,
  type AlertSink,
} from '@ghost-watcher/template';
import { MemoryBlobStore, startFixtureServer } from '@ghost-watcher/template/testing';
import { renderDispute, renderFeed } from '../../../template/src/ui/render.js';
import { bonusSite } from '../fixtures/site';
import { buildApp } from '../src/app';

class Inbox implements AlertSink {
  readonly channel = 'inbox';
  messages: AlertMessage[] = [];
  async deliver(message: AlertMessage) {
    this.messages.push(message);
    return { channel: this.channel, reference: String(this.messages.length) };
  }
}

/** Runs the demo's first night with the stand-in archive and returns the alerts it raised. */
async function firstNight() {
  const fixture = await startFixtureServer(bonusSite, { port: 0 });
  try {
    const built = buildApp({ BONUS_SITE_ORIGIN: fixture.origin });
    const app = { ...built, watches: built.watches.map((w) => ({ ...w, intervalMs: 0 })) };
    const userAgent = buildUserAgent({ version: app.version, localOnly: true });
    const sink = new Inbox();
    const runner = new Runner({
      app,
      fetcher: new PoliteFetcher({ userAgent, minHostGapMs: 0, maxCrawlDelayMs: 0 }),
      store: new GhostStore(new MemoryBlobStore()),
      sink,
      clock: systemClock,
      archive: new SavePageNowArchiver({ userAgent, base: `${fixture.origin}/__wayback`, label: 'the stand-in Wayback Machine' }),
    });
    await runner.checkAll({ force: true });
    fixture.advance();
    await runner.checkAll({ force: true });
    const alerts = sink.messages.flatMap((m) => m.alerts);
    const watch = (id: string) => app.watches.find((w) => w.id === id);
    return { alerts, watch, origin: fixture.origin };
  } finally {
    await fixture.close();
  }
}

describe('bonus-watch: Raise the dead turns a receipt into a dispute pack', () => {
  it('quotes the old and new bonus with dates, the archived copy and both hashes for a shriek', async () => {
    const { alerts, watch } = await firstNight();
    const shriek = alerts.find((a) => a.watchId === 'lanternfield-checking' && a.field === 'bonus') as Alert;
    const pack = disputePack(shriek, watch('lanternfield-checking'));
    expect(pack).not.toBeNull();
    if (!pack) return;
    const receipt = shriek.receipt;
    if (!receipt?.archiveUrl) throw new Error('expected an archived receipt');

    expect(pack.kind).toBe('Shriek');
    expect(pack.before).toEqual(['Bonus: $300']);
    expect(pack.after).toEqual(['Bonus: $400']);
    expect(pack.beforeDate).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    expect(pack.letter.subject).toBe('Request to honor the advertised terms of Lanternfield Everyday Checking');
    const body = pack.letter.body;
    expect(body).toContain(`What the page said on ${pack.beforeDate}:\n  Bonus: $300`);
    expect(body).toContain(`What the page said on ${pack.afterDate}:\n  Bonus: $400`);
    expect(body).toContain(receipt.archiveUrl);
    expect(body).toContain(receipt.before.sha256);
    expect(body).toContain(receipt.after.sha256);
    expect(body).toContain('held by the stand-in Wayback Machine');
    expect(body).toContain('[Date you applied]');
    expect(body).not.toMatch(/\n{3,}/);

    // A checking account goes under the CFPB's deposit-account categories.
    expect(pack.complaint).toMatchObject({ ...CFPB_CATEGORIES.deposit, url: 'https://www.consumerfinance.gov/complaint/' });
    expect(pack.complaint.whatHappened).toContain('the page said Bonus: $300');
    expect(pack.complaint.whatHappened).toContain('it said Bonus: $400');
    expect(pack.complaint.whatHappened).toContain(receipt.before.sha256);
    expect(pack.evidence.map((row) => row.label)).toEqual([
      'Page',
      `Before (${pack.beforeDate})`,
      `After (${pack.afterDate})`,
      'Archived copy',
      'SHA-256 before',
      'SHA-256 after',
      'Check the hashes',
    ]);
    // Deterministic: the same alert always gives the same pack.
    expect(disputePack(shriek, watch('lanternfield-checking'))).toEqual(pack);
  });

  it('quotes only the fine-print sentence that changed for a bait and switch, under the card category', async () => {
    const { alerts, watch } = await firstNight();
    const stealth = alerts.find((a) => a.watchId === 'mossgate-nightfall' && a.stealth) as Alert;
    const pack = disputePack(stealth, watch('mossgate-nightfall'));
    if (!pack) throw new Error('expected a dispute pack');
    expect(pack.kind).toBe('Bait and switch');
    const added = 'Fine print: "Bonus not available if you have opened any Mossgate card in the past 48 months."';
    expect(pack.after).toEqual([added]);
    // The sentence was added, so the old side says what the page did not say, rather than all of it.
    expect(pack.before).toEqual([added.replace('Fine print: ', 'Fine print: did not say ')]);
    expect(pack.letter.body).toContain('The headline offer did not change, but the terms did. Bonus points stayed the same while the fine print changed.');
    expect(pack.complaint).toMatchObject(CFPB_CATEGORIES.card);
    expect(pack.complaint.whatHappened).toContain('The headline offer stayed the same');
  });

  it('only changes that kept a receipt get a pack and a Raise the dead button', async () => {
    const { alerts, watch } = await firstNight();
    const quiet = alerts.find((a) => !a.receipt);
    if (quiet) expect(disputePack(quiet, watch(quiet.watchId))).toBeNull();
    const withReceipt = alerts.filter((a) => a.receipt);
    const html = renderFeed({
      app: { demo: true, quiet: '' },
      feed: alerts.map((alert) => ({ alert, acknowledged: false, letter: null })),
      archive: [],
      generatedAt: new Date().toISOString(),
    });
    expect(html.match(/data-action="dispute"/g) ?? []).toHaveLength(withReceipt.length);

    const pack = disputePack(withReceipt[0] as Alert, watch((withReceipt[0] as Alert).watchId));
    const page = renderDispute(pack);
    expect(page).toContain('id="dispute-letter"');
    expect(page).toContain('id="dispute-cfpb"');
    expect(page).toContain('Show the bank its own terms from the day you applied.');
  });

  it('serves the pack from the dashboard, and 404s for a change with no receipt', async () => {
    const fixture = await startFixtureServer(bonusSite, { port: 0 });
    const built = buildApp({ BONUS_SITE_ORIGIN: fixture.origin });
    const app = { ...built, watches: built.watches.map((w) => ({ ...w, intervalMs: 0 })) };
    const deps = await loadDeps(app, { env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console', GHOST_HOST_GAP_MS: '0' } });
    (deps.sink as unknown as { write: (line: string) => void }).write = () => undefined;
    const server = createDashboardServer(deps);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      await deps.runner.checkAll({ force: true });
      fixture.advance();
      await deps.runner.checkAll({ force: true });
      const alerts = await deps.store.alerts('lanternfield-checking');
      const shriek = alerts.find((a) => a.field === 'bonus') as Alert;
      const response = await fetch(`${base}/api/ghosts/lanternfield-checking/alerts/${shriek.id}/dispute`);
      expect(response.status).toBe(200);
      const pack = await response.json();
      expect(pack.before).toEqual(['Bonus: $300']);
      // With archiving off, the hashes are the receipt and the letter says so.
      expect(pack.letter.body).toContain('No public archived copy was made');
      const quiet = alerts.find((a) => !a.receipt);
      if (quiet) expect((await fetch(`${base}/api/ghosts/lanternfield-checking/alerts/${quiet.id}/dispute`)).status).toBe(404);
      expect((await fetch(`${base}/api/ghosts/lanternfield-checking/alerts/nope/dispute`)).status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fixture.close();
    }
  });
});
