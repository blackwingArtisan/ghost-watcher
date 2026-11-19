import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defineApp } from '../src/app';
import type { AlertMessage, AlertSink } from '../src/alerts/types';
import { manualClock } from '../src/clock';
import { ConfigError, loadDeps } from '../src/config';
import { extract } from '../src/extract';
import type { FetchOutcome, Fetcher, Transport } from '../src/fetcher';
import {
  WaybackHistorySource,
  buildPastTimeline,
  cdxQueryUrl,
  parseCdx,
  pastChangeCount,
  waybackTimestampToIso,
  type HistorySource,
  type PastCapture,
} from '../src/history';
import { Runner } from '../src/runner';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { startFixtureServer, type FixtureSite } from '../src/testing/fixture-server';
import { defineWatch, rules } from '../src/watch';

const recorded = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'wayback');
const read = (name: string) => readFileSync(join(recorded, name), 'utf8');
const STAMPS = ['20241231223224', '20251231223917', '20261118082138'];

/** Serves the recorded Wayback responses and remembers every request. */
function recordedTransport(): { transport: Transport; requests: Array<{ url: string; userAgent: string }> } {
  const requests: Array<{ url: string; userAgent: string }> = [];
  const transport: Transport = async (url, init) => {
    requests.push({ url, userAgent: init.headers['User-Agent'] ?? '' });
    const reply = (status: number, body: string) => ({ status, url, text: async () => body, headers: { get: () => null } });
    if (url.includes('/cdx/search/cdx?')) return reply(200, read('cdx-example-com.json'));
    const stamp = /\/web\/(\d{14})id_\//.exec(url)?.[1];
    if (stamp && STAMPS.includes(stamp)) return reply(200, read(`example-com-${stamp}.html`));
    return reply(404, 'not archived');
  };
  return { transport, requests };
}

const notice = defineWatch({
  id: 'example-notice',
  name: 'Example Domain notice',
  url: 'https://example.com/',
  fields: [{ name: 'notice', label: 'Notice', selector: 'body p', kind: 'text' }],
  rules: [rules.changed('notice')],
});

describe('Wayback CDX helpers', () => {
  it('converts Wayback timestamps to ISO', () => {
    expect(waybackTimestampToIso('20260611093044')).toBe('2026-06-11T09:30:44Z');
    expect(() => waybackTimestampToIso('June 2026')).toThrow();
  });

  it('asks for the newest captures, one a month, successful responses only', () => {
    const query = new URL(cdxQueryUrl('https://web.archive.org/', 'https://bank.example.com/offer?x=1', 6));
    expect(query.origin + query.pathname).toBe('https://web.archive.org/cdx/search/cdx');
    expect(Object.fromEntries(query.searchParams)).toEqual({
      url: 'bank.example.com/offer?x=1',
      output: 'json',
      fl: 'timestamp,original,statuscode',
      filter: 'statuscode:200',
      collapse: 'timestamp:6',
      limit: '-6',
    });
  });

  it('parses a recorded CDX reply, an empty reply, and refuses garbage', () => {
    expect(parseCdx(read('cdx-example-com.json'))).toEqual([
      { timestamp: '20241231223224', original: 'https://www.example.com/' },
      { timestamp: '20251231223917', original: 'http://www.example.com/' },
      { timestamp: '20261118082138', original: 'http://www.example.com/' },
    ]);
    expect(parseCdx('[]')).toEqual([]);
    expect(parseCdx('')).toEqual([]);
    expect(() => parseCdx('<html>rate limited</html>')).toThrow(/unreadable/);
  });
});

describe('WaybackHistorySource (recorded responses)', () => {
  it('reads the capture list, then each capture, oldest first, one request at a time with an honest User-Agent', async () => {
    const { transport, requests } = recordedTransport();
    const source = new WaybackHistorySource({ userAgent: 'GhostWatcher/0.1.0 (+https://watcher.example.org/about; page-change watcher)', transport, gapMs: 0, limit: 3 });
    const captures = await source.captures('https://example.com/');
    expect(source.label).toBe('the Internet Archive');
    expect(captures.map((c) => c.capturedAt)).toEqual(['2024-12-31T22:32:24Z', '2025-12-31T22:39:17Z', '2026-11-18T08:21:38Z']);
    expect(captures[0]?.archiveUrl).toBe('https://web.archive.org/web/20241231223224/https://www.example.com/');
    expect(requests.map((r) => r.url)).toEqual([
      cdxQueryUrl('https://web.archive.org', 'https://example.com/', 3),
      'https://web.archive.org/web/20241231223224id_/https://www.example.com/',
      'https://web.archive.org/web/20251231223917id_/http://www.example.com/',
      'https://web.archive.org/web/20261118082138id_/http://www.example.com/',
    ]);
    expect(new Set(requests.map((r) => r.userAgent))).toEqual(new Set(['GhostWatcher/0.1.0 (+https://watcher.example.org/about; page-change watcher)']));
  });

  it('skips a capture that fails to load and throws when the capture list fails', async () => {
    const { transport } = recordedTransport();
    const flaky: Transport = async (url, init) => (url.includes('20251231223917') ? Promise.reject(new Error('reset')) : transport(url, init));
    const captures = await new WaybackHistorySource({ userAgent: 'GW', transport: flaky, gapMs: 0 }).captures('https://example.com/');
    expect(captures).toHaveLength(2);

    const down: Transport = async (url) => ({ status: 503, url, text: async () => 'busy', headers: { get: () => null } });
    await expect(new WaybackHistorySource({ userAgent: 'GW', transport: down, gapMs: 0 }).captures('https://example.com/')).rejects.toThrow(/HTTP 503/);
  });

  it('waits between requests to the archive', async () => {
    const clock = manualClock('2026-11-18T00:00:00Z');
    const slept: number[] = [];
    const sleeping = { now: () => clock.now(), sleep: async (ms: number) => { slept.push(ms); clock.advance(ms); } };
    const { transport } = recordedTransport();
    await new WaybackHistorySource({ userAgent: 'GW', transport, gapMs: 1000, clock: sleeping }).captures('https://example.com/');
    expect(slept).toEqual([1000, 1000, 1000]);
  });
});

describe('buildPastTimeline', () => {
  it("finds the real wording changes in example.com's archived copies", async () => {
    const { transport } = recordedTransport();
    const captures = await new WaybackHistorySource({ userAgent: 'GW', transport, gapMs: 0 }).captures('https://example.com/');
    const today = extract(read('example-com-20261118082138.html'), notice);
    const timeline = buildPastTimeline(notice, captures, { takenAt: '2026-11-19T12:00:00Z', ...today }, 'the Internet Archive', '2026-11-19T12:00:00Z');

    expect(timeline.captures).toBe(3);
    expect(timeline.entries.map((e) => [e.kind, e.at])).toEqual([
      ['first', '2024-12-31T22:32:24Z'],
      ['change', '2025-12-31T22:39:17Z'],
      ['change', '2026-11-18T08:21:38Z'],
      ['now', '2026-11-19T12:00:00Z'],
    ]);
    expect(timeline.entries[0]?.lines[0]).toContain('This domain is for use in illustrative examples in documents.');
    expect(timeline.entries[1]?.lines[0]).toMatch(/^Notice changed: /);
    expect(timeline.entries[1]?.lines[0]).toContain('documentation examples without needing permission');
    expect(timeline.entries[2]?.lines[0]).toContain('avoid relying on it for testing and monitoring purposes');
    expect(timeline.entries[3]).toMatchObject({ lines: ['Nothing watched has changed since the last archived copy.'], severity: null });
    expect(pastChangeCount(timeline)).toBe(2);
  });

  it('skips copies in a layout the ghost cannot read, and explains an empty history', () => {
    const odd: PastCapture = { capturedAt: '2023-01-01T00:00:00Z', html: '<html><body><div>old layout</div></body></html>', archiveUrl: 'x' };
    const today = { takenAt: '2026-11-19T00:00:00Z', fields: { notice: null }, lists: {} };
    expect(buildPastTimeline(notice, [odd], today, 'the Internet Archive', today.takenAt)).toMatchObject({
      captures: 0,
      entries: [],
      note: 'The Internet Archive has copies of this page, but none in a layout the ghost can read.',
    });
    expect(buildPastTimeline(notice, [], today, 'the Internet Archive', today.takenAt).note).toBe('The Internet Archive has no earlier copies of this page.');
  });
});

const bonusWatch = defineWatch({
  id: 'lantern',
  name: 'Lanternfield',
  url: 'http://127.0.0.1:9/offer',
  intervalMs: 0,
  fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' }],
  rules: [rules.wentUp('bonus'), rules.wentDown('bonus')],
});
const app = defineApp({
  id: 'history-app',
  name: 'History Crypt',
  tagline: 'Testing',
  version: '0.1.0',
  alertTo: ['tester@example.com'],
  copy: { watchNoun: 'pages', quiet: 'Quiet.' },
  watches: [bonusWatch],
});
const offer = (bonus: string) => `<html><body><p class="bonus">${bonus}</p></body></html>`;

class OneFetcher implements Fetcher {
  constructor(private readonly html: string, private readonly clock: { now(): Date }) {}
  async fetchPage(url: string): Promise<FetchOutcome> {
    return { status: 'ok', html: this.html, finalUrl: url, httpStatus: 200, fetchedAt: this.clock.now().toISOString() };
  }
}

class CountingSink implements AlertSink {
  readonly channel = 'count';
  messages: AlertMessage[] = [];
  async deliver(message: AlertMessage) {
    this.messages.push(message);
    return { channel: this.channel, reference: 'x' };
  }
}

describe('Runner and the Ghost of Terms Past', () => {
  it('reads history once on the first sighting, stores the timeline, and sends no alert for the past', async () => {
    const clock = manualClock('2026-11-18T12:00:00Z');
    let calls = 0;
    const history: HistorySource = {
      label: 'a test archive',
      captures: async () => {
        calls += 1;
        return [
          { capturedAt: '2026-03-01T00:00:00Z', html: offer('$500'), archiveUrl: 'a' },
          { capturedAt: '2026-06-01T00:00:00Z', html: offer('$300'), archiveUrl: 'b' },
        ];
      },
    };
    const store = new GhostStore(new MemoryBlobStore());
    const sink = new CountingSink();
    const runner = new Runner({ app, fetcher: new OneFetcher(offer('$400'), clock), store, sink, clock, history });

    expect((await runner.check(bonusWatch)).status).toBe('baseline');
    expect((await store.status('lantern')).lastMessage).toBe('First sighting recorded. The Ghost of Terms Past found 2 earlier changes.');
    const timeline = await store.pastTimeline('lantern');
    expect(timeline?.entries.map((e) => e.lines[0])).toEqual([
      'Bonus $500',
      'Bonus went down from $500 to $300 (-$200).',
      'Bonus went up from $300 to $400 (+$100).',
    ]);
    expect(sink.messages).toHaveLength(0);
    expect(await store.alerts('lantern')).toHaveLength(0);

    await runner.check(bonusWatch);
    expect(calls).toBe(1);
  });

  it('records why the history is missing when the archive fails, and still takes the baseline', async () => {
    const clock = manualClock('2026-11-18T12:00:00Z');
    const history: HistorySource = { label: 'a test archive', captures: async () => Promise.reject(new Error('timed out')) };
    const store = new GhostStore(new MemoryBlobStore());
    const runner = new Runner({ app, fetcher: new OneFetcher(offer('$400'), clock), store, sink: new CountingSink(), clock, history });
    expect((await runner.check(bonusWatch)).status).toBe('baseline');
    expect((await store.pastTimeline('lantern'))?.note).toBe('Could not read a test archive: timed out');
    expect((await store.status('lantern')).lastMessage).toBe('First sighting recorded. The ghost now knows this page.');
  });
});

describe('the fixture site as a stand-in Wayback Machine', () => {
  const site: FixtureSite = {
    name: 'archive-test',
    versions: 2,
    robots: 'User-agent: *\nAllow: /\n',
    past: [
      { version: 0, capturedAt: '2026-06-01T08:00:00Z' },
      { version: -1, capturedAt: '2026-03-01T08:00:00Z' },
    ],
    pages: [{ path: '/offer', title: 'Offer', render: (ctx) => offer(ctx.version <= -1 ? '$500' : ctx.version === 0 ? '$300' : '$400') }],
  };

  it('answers CDX queries and serves archived copies through the real adapter', async () => {
    const fixture = await startFixtureServer(site, { port: 0 });
    try {
      const source = new WaybackHistorySource({ userAgent: 'GW', base: `${fixture.origin}/__wayback`, gapMs: 0 });
      const captures = await source.captures(`${fixture.origin}/offer`);
      expect(captures.map((c) => [c.capturedAt, extract(c.html, bonusWatch).fields.bonus])).toEqual([
        ['2026-03-01T08:00:00Z', expect.objectContaining({ amountMinor: 50000 })],
        ['2026-06-01T08:00:00Z', expect.objectContaining({ amountMinor: 30000 })],
      ]);
      expect(await source.captures(`${fixture.origin}/not-a-page`)).toEqual([]);
      const limited = await new WaybackHistorySource({ userAgent: 'GW', base: `${fixture.origin}/__wayback`, gapMs: 0, limit: 1 }).captures(`${fixture.origin}/offer`);
      expect(limited.map((c) => c.capturedAt)).toEqual(['2026-06-01T08:00:00Z']);
    } finally {
      await fixture.close();
    }
  });
});

describe('history configuration', () => {
  it('is off by default, and refuses a real archive without a contact URL', async () => {
    const env = { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' };
    expect((await loadDeps(app, { env })).describe.history).toBe('off');
    await expect(loadDeps(app, { env: { ...env, GHOST_HISTORY: 'wayback' } })).rejects.toThrow(ConfigError);
    await expect(loadDeps(app, { env: { ...env, GHOST_HISTORY: 'wayback' } })).rejects.toThrow(/web\.archive\.org/);
    await expect(loadDeps(app, { env: { ...env, GHOST_HISTORY: 'tarot' } })).rejects.toThrow(/none or wayback/);
    // A documentation-only contact is never sent, so it does not count as one.
    await expect(loadDeps(app, { env: { ...env, GHOST_HISTORY: 'wayback', GHOST_CONTACT_URL: 'https://watcher.example.org/about' } })).rejects.toThrow(
      /must identify itself/,
    );
    const withContact = await loadDeps(app, { env: { ...env, GHOST_HISTORY: 'wayback', GHOST_CONTACT_URL: 'https://stubborn-otter.dev/ghost-watcher' } });
    expect(withContact.history?.label).toBe('the Internet Archive');
  });

  it('accepts a local stand-in archive with the local-only User-Agent', async () => {
    const deps = await loadDeps(app, { env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console', GHOST_HISTORY: 'wayback', GHOST_HISTORY_BASE: 'http://127.0.0.1:9/__wayback' } });
    expect(deps.history?.label).toBe('the stand-in Wayback Machine');
    expect(deps.describe.history).toBe('the stand-in Wayback Machine (6 copies max)');
  });
});
