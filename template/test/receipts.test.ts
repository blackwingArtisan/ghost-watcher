import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { defineApp } from '../src/app';
import { renderAlertMessage, receiptLines } from '../src/alerts/render';
import type { AlertMessage, AlertSink } from '../src/alerts/types';
import { compactText } from '../src/alerts/webhook';
import { manualClock } from '../src/clock';
import { ConfigError, loadDeps } from '../src/config';
import type { FetchOutcome, Fetcher, Transport } from '../src/fetcher';
import {
  SavePageNowArchiver,
  needsReceipt,
  shortHash,
  snapshotSha256,
  takeReceipt,
  type PageArchiver,
  type Receipt,
} from '../src/receipts';
import { Runner } from '../src/runner';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { startFixtureServer, type FixtureSite } from '../src/testing/fixture-server';
import { renderFeed, renderReceipt } from '../src/ui/render.js';
import { defineWatch, rules } from '../src/watch';

const watch = defineWatch({
  id: 'lantern',
  name: 'Lanternfield',
  url: 'http://127.0.0.1:9/offer',
  intervalMs: 0,
  fields: [
    { name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' },
    { name: 'deposit', label: 'Min. deposit', selector: '.deposit', kind: 'money' },
  ],
  rules: [rules.wentUp('bonus', { severity: 'shriek' }), rules.changed('deposit')],
});
const app = defineApp({
  id: 'receipt-app',
  name: 'Receipt Crypt',
  tagline: 'Testing',
  version: '0.1.0',
  alertTo: ['tester@example.com'],
  copy: { watchNoun: 'pages', quiet: 'Quiet.' },
  watches: [watch],
});
const offer = (bonus: string, deposit: string) => `<html><body><p class="bonus">${bonus}</p><p class="deposit">${deposit}</p></body></html>`;

class PageFetcher implements Fetcher {
  html = offer('$300', '$500');
  constructor(private readonly clock: { now(): Date }) {}
  async fetchPage(url: string): Promise<FetchOutcome> {
    return { status: 'ok', html: this.html, finalUrl: url, httpStatus: 200, fetchedAt: this.clock.now().toISOString() };
  }
}

class Inbox implements AlertSink {
  readonly channel = 'inbox';
  messages: AlertMessage[] = [];
  async deliver(message: AlertMessage) {
    this.messages.push(message);
    return { channel: this.channel, reference: String(this.messages.length) };
  }
}

function setup(archive?: PageArchiver) {
  const clock = manualClock('2026-11-18T12:00:00Z');
  const blobs = new MemoryBlobStore();
  const store = new GhostStore(blobs);
  const fetcher = new PageFetcher(clock);
  const sink = new Inbox();
  const runner = new Runner({ app, fetcher, store, sink, clock, ...(archive ? { archive } : {}) });
  return { clock, blobs, store, fetcher, sink, runner };
}

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('receipts: snapshot hashes', () => {
  it('hash the exact bytes the store wrote, so shasum on the snapshot file reproduces them', async () => {
    const { blobs, clock, fetcher, runner, sink } = setup();
    await runner.check(watch);
    const [beforeKey] = await blobs.list('snapshots/lantern/history/');
    clock.advance(60_000);
    fetcher.html = offer('$400', '$500');
    const result = await runner.check(watch);
    expect(result.status).toBe('changed');
    const keys = await blobs.list('snapshots/lantern/history/');
    const afterKey = keys[keys.length - 1] as string;

    const receipt = sink.messages[0]?.alerts[0]?.receipt as Receipt;
    expect(receipt.before).toEqual({ takenAt: '2026-11-18T12:00:00.000Z', sha256: sha((await blobs.get(beforeKey as string)) as string) });
    expect(receipt.after).toEqual({ takenAt: '2026-11-18T12:01:00.000Z', sha256: sha((await blobs.get(afterKey)) as string) });
    expect(receipt.before.sha256).not.toBe(receipt.after.sha256);
    expect(receipt.archiveUrl).toBeNull();
    expect(receipt.note).toBe('Archiving is off; the snapshot hashes are the receipt.');
  });

  it('are kept only for a shriek or a bait and switch', async () => {
    expect(needsReceipt([{ severity: 'moan' }, { severity: 'whisper' }])).toBe(false);
    expect(needsReceipt([{ severity: 'moan' }, { severity: 'shriek' }])).toBe(true);
    expect(needsReceipt([{ severity: 'moan', stealth: 'Bonus stayed the same while the fine print changed.' }])).toBe(true);

    const { clock, fetcher, runner, sink } = setup();
    await runner.check(watch);
    clock.advance(60_000);
    fetcher.html = offer('$300', '$250');
    await runner.check(watch);
    expect(sink.messages[0]?.alerts.map((a) => a.receipt)).toEqual([undefined]);
  });

  it('shortens a hash for a stone or a feed line', () => {
    expect(shortHash('3f2a9c1b77aa00112233445566778899aabbccddeeff00112233445566d41e')).toBe('3f2a9c1b…d41e');
    expect(shortHash('abc')).toBe('abc');
  });

  it('match snapshotSha256 for the same snapshot', () => {
    const snapshot = { watchId: 'w', url: 'http://127.0.0.1/x', takenAt: '2026-01-01T00:00:00Z', fields: {}, lists: {} };
    expect(snapshotSha256(snapshot)).toBe(sha(`${JSON.stringify(snapshot, null, 2)}\n`));
  });
});

function transportReplying(reply: { status: number; url?: string; headers?: Record<string, string> }) {
  const requests: Array<{ url: string; userAgent: string }> = [];
  const transport: Transport = async (url, init) => {
    requests.push({ url, userAgent: init.headers['User-Agent'] ?? '' });
    return {
      status: reply.status,
      url: reply.url ?? url,
      text: async () => '',
      headers: { get: (name: string) => reply.headers?.[name.toLowerCase()] ?? null },
    };
  };
  return { transport, requests };
}

describe('SavePageNowArchiver', () => {
  const page = 'https://bank.example.com/offer';

  it('asks Save Page Now with an honest User-Agent and reads the new copy from the redirect', async () => {
    const { transport, requests } = transportReplying({ status: 200, url: `https://web.archive.org/web/20261118120102/${page}` });
    const archiver = new SavePageNowArchiver({ userAgent: 'GhostWatcher/0.1.0 (+https://watcher.example.org; page-change watcher)', transport });
    expect(archiver.label).toBe('the Internet Archive');
    expect(await archiver.save(page)).toEqual({ archiveUrl: `https://web.archive.org/web/20261118120102/${page}`, archivedAt: '2026-11-18T12:01:02Z' });
    expect(requests).toEqual([{ url: `https://web.archive.org/save/${page}`, userAgent: 'GhostWatcher/0.1.0 (+https://watcher.example.org; page-change watcher)' }]);
  });

  it('reads the copy from Content-Location when there is no redirect', async () => {
    const { transport } = transportReplying({ status: 200, headers: { 'content-location': `/web/20261118120102/${page}` } });
    expect((await new SavePageNowArchiver({ userAgent: 'GW', transport }).save(page)).archiveUrl).toBe(`https://web.archive.org/web/20261118120102/${page}`);
  });

  it('links to the copy nearest the request when the archive only accepts the job', async () => {
    const { transport } = transportReplying({ status: 200 });
    const clock = manualClock('2026-11-18T12:00:00Z');
    expect(await new SavePageNowArchiver({ userAgent: 'GW', transport, clock }).save(page)).toEqual({
      archiveUrl: `https://web.archive.org/web/20261118120000/${page}`,
      archivedAt: null,
    });
  });

  it('turns a refusal into an error, and a receipt turns that error into a note', async () => {
    const slow = new SavePageNowArchiver({ userAgent: 'GW', transport: transportReplying({ status: 429 }).transport });
    await expect(slow.save(page)).rejects.toThrow(/slow down/);
    const down = new SavePageNowArchiver({ userAgent: 'GW', transport: transportReplying({ status: 520 }).transport });
    await expect(down.save(page)).rejects.toThrow(/HTTP 520/);

    const snap = (takenAt: string) => ({ watchId: 'w', url: page, takenAt, fields: {}, lists: {} });
    const receipt = await takeReceipt(snap('2026-11-17T00:00:00Z'), snap('2026-11-18T00:00:00Z'), slow);
    expect(receipt).toMatchObject({ archiveUrl: null, archivedBy: null, note: 'Could not reach the Internet Archive: the archive asked us to slow down (HTTP 429)' });
    expect(receipt.before.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('receipts in letters, the feed and the runner', () => {
  it('an archive failure never fails the check, and the letter still carries the hashes', async () => {
    const archive: PageArchiver = { label: 'a test archive', save: async () => Promise.reject(new Error('timed out')) };
    const { clock, fetcher, runner, sink } = setup(archive);
    await runner.check(watch);
    clock.advance(60_000);
    fetcher.html = offer('$400', '$500');
    expect((await runner.check(watch)).status).toBe('changed');
    const message = sink.messages[0] as AlertMessage;
    expect(message.text).toContain('The ghost kept a receipt:');
    expect(message.text).toContain('Archived copy: none. Could not reach a test archive: timed out');
    expect(message.text).toMatch(/Before: sha256 [0-9a-f]{64} \(snapshot of 2026-11-18T12:00:00.000Z\)/);
  });

  it('puts the archived copy and both hashes in the letter, the feed and the webhook text', async () => {
    const archive: PageArchiver = {
      label: 'a test archive',
      save: async (url) => ({ archiveUrl: `https://archive.test/web/20261118120100/${url}`, archivedAt: '2026-11-18T12:01:00Z' }),
    };
    const { clock, fetcher, runner, sink } = setup(archive);
    await runner.check(watch);
    clock.advance(60_000);
    fetcher.html = offer('$400', '$250');
    await runner.check(watch);
    const message = sink.messages[0] as AlertMessage;
    const [bonus, deposit] = message.alerts;
    expect(bonus?.receipt?.archiveUrl).toBe('https://archive.test/web/20261118120100/http://127.0.0.1:9/offer');
    // The receipt rides on the shriek; the routine deposit change does not need one.
    expect(deposit?.receipt).toBeUndefined();

    const receipt = bonus?.receipt as Receipt;
    expect(receiptLines(receipt)[0]).toBe('Archived copy: https://archive.test/web/20261118120100/http://127.0.0.1:9/offer (a test archive, saved 2026-11-18T12:01:00Z)');
    expect(message.html).toContain('The ghost kept a receipt');
    expect(message.html).toContain(receipt.after.sha256);
    expect(compactText(message)).toContain('Receipt: https://archive.test/web/20261118120100/');

    const rendered = renderAlertMessage({ appName: 'X', to: [], watch, alerts: [deposit!], createdAt: message.createdAt });
    expect(rendered.text).not.toContain('receipt');

    const line = renderReceipt(receipt);
    expect(line).toContain('href="https://archive.test/web/20261118120100/http://127.0.0.1:9/offer"');
    expect(line).toContain(`title="after: ${receipt.after.sha256}"`);
    const feed = renderFeed({ app: { quiet: '' }, generatedAt: message.createdAt, feed: [{ alert: bonus, acknowledged: false, letter: null }] });
    expect(feed).toContain('class="receipt"');
  });
});

describe('the fixture site as a stand-in Save Page Now', () => {
  const site: FixtureSite = {
    name: 'save-test',
    versions: 2,
    robots: 'User-agent: *\nAllow: /\n',
    pages: [{ path: '/offer', title: 'Offer', render: (ctx) => offer(ctx.version === 1 ? '$300' : '$400', '$500') }],
  };

  it('keeps a copy at the current version and serves it at its permanent link', async () => {
    const fixture = await startFixtureServer(site, { port: 0 });
    try {
      const archiver = new SavePageNowArchiver({ userAgent: 'GW', base: `${fixture.origin}/__wayback` });
      fixture.advance();
      const saved = await archiver.save(`${fixture.origin}/offer`);
      expect(saved.archiveUrl).toMatch(new RegExp(`^${fixture.origin}/__wayback/web/\\d{14}/${fixture.origin}/offer$`));
      expect(fixture.saved.map((c) => c.version)).toEqual([2]);
      // The live page goes back to $300, but the copy kept at version 2 still says $400.
      await fetch(`${fixture.origin}/__fixture/version?n=1`, { method: 'POST' });
      expect(await (await fetch(`${fixture.origin}/offer`)).text()).toContain('$300');
      expect(await (await fetch(saved.archiveUrl)).text()).toContain('$400');
      fixture.reset();
      expect(fixture.saved).toHaveLength(0);
      await expect(archiver.save(`${fixture.origin}/missing`)).rejects.toThrow(/HTTP 404/);
    } finally {
      await fixture.close();
    }
  });
});

describe('receipt configuration', () => {
  const env = { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' };

  it('keeps hashes by default and refuses the real archive without a contact URL', async () => {
    const deps = await loadDeps(app, { env });
    expect(deps.describe.receipts).toBe('snapshot hashes');
    expect(deps.archive).toBeUndefined();
    await expect(loadDeps(app, { env: { ...env, GHOST_RECEIPTS: 'archive' } })).rejects.toThrow(ConfigError);
    await expect(loadDeps(app, { env: { ...env, GHOST_RECEIPTS: 'archive' } })).rejects.toThrow(/web\.archive\.org/);
    await expect(loadDeps(app, { env: { ...env, GHOST_RECEIPTS: 'notary' } })).rejects.toThrow(/hashes or archive/);
    const real = await loadDeps(app, { env: { ...env, GHOST_RECEIPTS: 'archive', GHOST_CONTACT_URL: 'https://stubborn-otter.dev/ghost-watcher' } });
    expect(real.archive?.label).toBe('the Internet Archive');
  });

  it('accepts a local stand-in archive with the local-only User-Agent', async () => {
    const deps = await loadDeps(app, { env: { ...env, GHOST_RECEIPTS: 'archive', GHOST_ARCHIVE_BASE: 'http://127.0.0.1:9/__wayback' } });
    expect(deps.describe.receipts).toBe('snapshot hashes + archived copies (the stand-in Wayback Machine)');
  });
});
