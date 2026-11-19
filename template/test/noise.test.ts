import { describe, expect, it } from 'vitest';
import { defineApp } from '../src/app';
import type { AlertSink } from '../src/alerts/types';
import { manualClock } from '../src/clock';
import type { FetchOutcome, Fetcher } from '../src/fetcher';
import { pageFingerprint, pageText } from '../src/noise';
import { Runner } from '../src/runner';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { selectorText } from '../src/testing/noise-ratio';
import { defineWatch, rules } from '../src/watch';
import { ghostView } from '../src/view';
import { noiseSummary } from '../src/ui/render.js';

describe('page text and fingerprints', () => {
  it('reads only the visible body text, with whitespace collapsed', () => {
    const html = '<html><head><title>T</title><script>var x = 1;</script></head><body><p>Bonus\n   $300</p><style>p{}</style><noscript>enable js</noscript></body></html>';
    expect(pageText(html)).toBe('Bonus $300');
  });

  it('gives the same fingerprint to markup-only changes and a new one to new words', () => {
    const a = '<body><p class="x">Bonus $300</p></body>';
    const b = '<body><div><span>Bonus</span>   <b>$300</b></div><script>track()</script></body>';
    const c = '<body><p>Bonus $300</p><footer>Generated 10:42</footer></body>';
    expect(pageFingerprint(a)).toBe(pageFingerprint(b));
    expect(pageFingerprint(a)).not.toBe(pageFingerprint(c));
  });
});

const watch = defineWatch({
  id: 'lantern',
  name: 'Lanternfield',
  url: 'https://example.com/offer',
  intervalMs: 0,
  fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' }],
  rules: [rules.wentUp('bonus')],
});

const app = defineApp({
  id: 'noise-app',
  name: 'Noise Crypt',
  tagline: 'Testing',
  version: '0.1.0',
  alertTo: ['tester@example.com'],
  copy: { watchNoun: 'pages', quiet: 'Quiet.' },
  watches: [watch],
});

const page = (bonus: string, stamp: string) => `<html><body><p class="bonus">${bonus}</p><footer>Generated ${stamp}</footer></body></html>`;

class ListFetcher implements Fetcher {
  private index = 0;
  constructor(private readonly pages: string[], private readonly clock: { now(): Date }) {}
  async fetchPage(url: string): Promise<FetchOutcome> {
    const html = this.pages[Math.min(this.index, this.pages.length - 1)] as string;
    this.index += 1;
    return { status: 'ok', html, finalUrl: url, httpStatus: 200, fetchedAt: this.clock.now().toISOString() };
  }
}

const sink: AlertSink = { channel: 'none', deliver: async () => ({ channel: 'none', reference: 'x' }) };

describe('Runner noise counting', () => {
  it('flags a page that moved, counts the visits it ignored, and never counts a real change as noise', async () => {
    const clock = manualClock('2026-10-31T00:00:00Z');
    const pages = [page('$300', '1'), page('$300', '1'), page('$300', '2'), page('$300.00', '3'), page('$400', '4')];
    const store = new GhostStore(new MemoryBlobStore());
    const runner = new Runner({ app, fetcher: new ListFetcher(pages, clock), store, sink, clock });

    const results = [];
    for (let i = 0; i < pages.length; i += 1) results.push(await runner.check(watch));
    expect(results.map((r) => [r.status, 'pageMoved' in r ? r.pageMoved : null])).toEqual([
      ['baseline', false],
      ['unchanged', false],
      ['unchanged', true],
      ['unchanged', true],
      ['changed', true],
    ]);
    const status = await store.status('lantern');
    expect(status.ignoredChanges).toBe(2);
    expect(status.lastOutcome).toBe('changed');

    const deps = { app, store, runner, clock, outbox: undefined } as unknown as Parameters<typeof ghostView>[0];
    expect((await ghostView(deps, watch)).ignored).toBe(2);
  });

  it('says the page changed but nothing watched did', async () => {
    const clock = manualClock('2026-10-31T00:00:00Z');
    const store = new GhostStore(new MemoryBlobStore());
    const runner = new Runner({ app, fetcher: new ListFetcher([page('$300', '1'), page('$300', '2')], clock), store, sink, clock });
    await runner.check(watch);
    await runner.check(watch);
    expect((await store.status('lantern')).lastMessage).toBe('The page changed, but nothing watched did.');
  });
});

describe('noise summaries and selector text', () => {
  it('summarizes a round of visits in one line', () => {
    expect(
      noiseSummary([
        { status: 'changed', pageMoved: true },
        { status: 'unchanged', pageMoved: true },
        { status: 'changed', pageMoved: true },
        { status: 'blocked' },
      ]),
    ).toBe('3 pages changed: 2 worth waking for, 1 ignored as noise.');
    expect(noiseSummary([{ status: 'unchanged', pageMoved: false }])).toBe('');
  });

  it('reads the raw text of the watched elements, as a selector-based watcher would', () => {
    const html = '<body><p class="bonus"> $ 300.00 </p><ul><li class="i">A</li><li class="i">B</li></ul></body>';
    const listWatch = defineWatch({
      id: 'w',
      name: 'W',
      url: 'https://example.com/',
      fields: [{ name: 'bonus', selector: '.bonus', kind: 'money' }],
      lists: [{ name: 'items', itemSelector: 'li.i', identity: ['t'], fields: { t: { selector: ':self', kind: 'text' } } }],
      rules: [],
    });
    expect(selectorText(html, listWatch)).toBe('bonus=$ 300.00\nitems=A | B');
  });
});
