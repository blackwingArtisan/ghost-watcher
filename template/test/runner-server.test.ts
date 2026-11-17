import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { defineApp, type GhostApp } from '../src/app';
import type { AlertMessage, AlertSink } from '../src/alerts/types';
import { manualClock } from '../src/clock';
import { loadDeps } from '../src/config';
import type { FetchOutcome, Fetcher } from '../src/fetcher';
import { backoffMs, Runner } from '../src/runner';
import { createDashboardServer } from '../src/server';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { startFixtureServer, type FixtureServer } from '../src/testing/fixture-server';
import { HOUR_MS, defineWatch, rules } from '../src/watch';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Scripted = DistributiveOmit<FetchOutcome, 'fetchedAt'>;

const offer = (bonus: string) => `<html><body><p class="bonus">${bonus}</p><footer>${Math.random()}</footer></body></html>`;

class ScriptedFetcher implements Fetcher {
  calls = 0;
  constructor(private readonly outcomes: Scripted[], private readonly clock: { now(): Date }) {}
  async fetchPage(): Promise<FetchOutcome> {
    const outcome = this.outcomes[Math.min(this.calls, this.outcomes.length - 1)];
    this.calls += 1;
    return { ...outcome, fetchedAt: this.clock.now().toISOString() } as FetchOutcome;
  }
}

class RecordingSink implements AlertSink {
  readonly channel = 'recording';
  messages: AlertMessage[] = [];
  async deliver(message: AlertMessage) {
    this.messages.push(message);
    return { channel: this.channel, reference: String(this.messages.length) };
  }
}

const watch = defineWatch({
  id: 'lantern',
  name: 'Lanternfield',
  url: 'https://example.com/offer',
  intervalMs: 6 * HOUR_MS,
  fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' }],
  rules: [rules.wentUp('bonus'), rules.wentDown('bonus')],
});

const app: GhostApp = defineApp({
  id: 'test-app',
  name: 'Test Crypt',
  tagline: 'Testing',
  version: '0.1.0',
  contactUrl: 'https://example.com/about',
  alertTo: ['tester@example.com'],
  copy: { watchNoun: 'pages', quiet: 'Quiet.' },
  watches: [watch],
});

const ok = (bonus: string) => ({ status: 'ok' as const, html: offer(bonus), finalUrl: watch.url, httpStatus: 200 });

function setup(outcomes: Scripted[]) {
  const clock = manualClock('2026-10-31T00:00:00Z');
  const fetcher = new ScriptedFetcher(outcomes, clock);
  const store = new GhostStore(new MemoryBlobStore());
  const sink = new RecordingSink();
  const runner = new Runner({ app, fetcher, store, sink, clock });
  return { clock, fetcher, store, sink, runner };
}

describe('Runner', () => {
  it('records a baseline, then alerts on a real change and delivers one message', async () => {
    const { clock, runner, sink, store } = setup([ok('$300'), ok('$300.00'), ok('$400')]);
    expect((await runner.check(watch)).status).toBe('baseline');
    clock.advance(7 * HOUR_MS);
    expect((await runner.check(watch)).status).toBe('unchanged');
    clock.advance(7 * HOUR_MS);
    const result = await runner.check(watch);
    expect(result.status).toBe('changed');
    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0]?.alerts[0]?.summary).toBe('Bonus went up from $300 to $400 (+$100).');
    expect(await store.unacknowledged('lantern')).toHaveLength(1);
    expect((await store.status('lantern')).checks).toBe(3);
  });

  it('respects the per-URL interval unless forced', async () => {
    const { clock, runner, fetcher } = setup([ok('$300')]);
    await runner.check(watch);
    clock.advance(HOUR_MS);
    const skipped = await runner.check(watch);
    expect(skipped).toMatchObject({ status: 'skipped', reason: 'interval', nextEligibleAt: '2026-10-31T06:00:00.000Z' });
    expect(fetcher.calls).toBe(1);
    expect((await runner.check(watch, { force: true })).status).toBe('unchanged');
    expect(fetcher.calls).toBe(2);
  });

  it('backs off after errors and never alerts on them', async () => {
    const zeroInterval = { ...watch, intervalMs: 0 };
    const { clock, runner, sink, fetcher } = setup([{ status: 'error', message: 'HTTP 503' }]);
    expect((await runner.check(zeroInterval)).status).toBe('error');
    expect((await runner.check(zeroInterval)).status).toBe('skipped');
    clock.advance(backoffMs(1));
    expect((await runner.check(zeroInterval)).status).toBe('error');
    const skipped = await runner.check(zeroInterval);
    expect(skipped).toMatchObject({ status: 'skipped', reason: 'backoff' });
    expect(fetcher.calls).toBe(2);
    expect(sink.messages).toHaveLength(0);
    expect(backoffMs(2)).toBe(30 * 60 * 1000);
    expect(backoffMs(40)).toBe(24 * HOUR_MS);
  });

  it('treats a page with none of the watched regions as an error, keeping the old snapshot', async () => {
    const { runner, store } = setup([ok('$300'), { status: 'ok', html: '<html><body>Redesigned!</body></html>', finalUrl: watch.url, httpStatus: 200 }]);
    await runner.check(watch);
    const result = await runner.check(watch, { force: true });
    expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('layout may have changed') });
    expect((await store.latestSnapshot('lantern'))?.fields.bonus).toMatchObject({ value: 300 });
  });

  it('records robots.txt refusals as blocked', async () => {
    const { runner, store } = setup([{ status: 'blocked', reason: 'robots', robotsUrl: 'https://example.com/robots.txt' }]);
    expect((await runner.check(watch)).status).toBe('blocked');
    expect((await store.status('lantern')).lastOutcome).toBe('blocked');
  });

  it('shares one check between concurrent requests for the same watch', async () => {
    const { runner, fetcher } = setup([ok('$300')]);
    const [a, b] = await Promise.all([runner.check(watch, { force: true }), runner.check(watch, { force: true })]);
    expect(a).toBe(b);
    expect(fetcher.calls).toBe(1);
  });

  it('still records alerts when delivery fails', async () => {
    const clock = manualClock();
    const fetcher = new ScriptedFetcher([ok('$300'), ok('$500')], clock);
    const store = new GhostStore(new MemoryBlobStore());
    const failing: AlertSink = { channel: 'broken', deliver: () => Promise.reject(new Error('mail server down')) };
    const runner = new Runner({ app, fetcher, store, sink: failing, clock });
    await runner.check(watch);
    const result = await runner.check(watch, { force: true });
    expect(result).toMatchObject({ status: 'changed', deliveryError: 'mail server down' });
    expect(await store.alerts('lantern')).toHaveLength(1);
  });
});

describe('dashboard server against a fixture site', () => {
  let fixtures: FixtureServer | undefined;
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    await fixtures?.close();
  });

  it('serves the page and API: check now, a change, the séance, and laying to rest', async () => {
    fixtures = await startFixtureServer({
      name: 'test',
      versions: 2,
      robots: 'User-agent: *\nDisallow: /private/',
      pages: [{ path: '/offer', title: 'Offer', render: ({ version }) => offer(version === 1 ? '$300' : '$450') }],
    });
    const siteApp = { ...app, watches: [{ ...watch, url: `${fixtures.origin}/offer` }] };
    const deps = await loadDeps(siteApp, { env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console', GHOST_HOST_GAP_MS: '0' } });
    (deps.sink as unknown as { write: (line: string) => void }).write = () => undefined;
    const server = createDashboardServer(deps);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));

    const html = await (await fetch(base)).text();
    expect(html).toContain('<h1>Test Crypt</h1>');
    expect(html).toContain('data-state="unborn"');
    expect(html).toContain('GhostWatcher/0.1.0');

    const first = await (await fetch(`${base}/api/ghosts/lantern/check`, { method: 'POST' })).json();
    expect(first.result.status).toBe('baseline');
    fixtures.advance();
    const second = await (await fetch(`${base}/api/ghosts/lantern/check`, { method: 'POST' })).json();
    expect(second.result.status).toBe('changed');
    expect(second.result.alerts[0].summary).toBe('Bonus went up from $300 to $450 (+$150).');

    const state = await (await fetch(`${base}/api/state`)).json();
    expect(state.ghosts[0]).toMatchObject({ id: 'lantern', state: 'restless', unread: 1 });
    expect(state.feed).toHaveLength(1);

    const detail = await (await fetch(`${base}/api/ghosts/lantern`)).json();
    expect(detail.fields[0]).toMatchObject({ label: 'Bonus', now: '$450', before: '$300', changed: true });

    await fetch(`${base}/api/ghosts/lantern/acknowledge`, { method: 'POST' });
    const after = await (await fetch(`${base}/api/state`)).json();
    expect(after.ghosts[0].state).toBe('dormant');

    expect((await fetch(`${base}/api/ghosts/nobody`)).status).toBe(404);
    expect((await fetch(`${base}/outbox/../../etc/passwd`)).status).toBe(404);
    expect((await fetch(`${base}/ui/style.css`)).headers.get('content-type')).toContain('text/css');
    expect((await fetch(`${base}/ui/fonts/pirata-one-latin-400-normal.woff2`)).status).toBe(200);
    expect(fixtures.log.every((entry) => entry.userAgent.startsWith('GhostWatcher/0.1.0'))).toBe(true);
  });
});
