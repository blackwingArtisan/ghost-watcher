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
import { noiseSummary, renderGhostCard } from '../src/ui/render.js';

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

  it('shows the change on the stone until it is read: the old value struck through, the new one beside it', async () => {
    const clock = manualClock('2026-10-31T00:00:00Z');
    const pages = [page('$300', '1'), page('$400', '2'), page('$450', '3')];
    const store = new GhostStore(new MemoryBlobStore());
    const runner = new Runner({ app, fetcher: new ListFetcher(pages, clock), store, sink, clock });
    const deps = { app, store, runner, clock, outbox: undefined } as unknown as Parameters<typeof ghostView>[0];
    for (let i = 0; i < pages.length; i += 1) {
      await runner.check(watch);
      clock.advance(1000);
    }
    // Two unread rises: the stone shows the value from before the first one.
    const view = await ghostView(deps, watch);
    expect(view.readings).toEqual([{ label: 'Bonus', value: '$450', before: '$300', tone: 'neutral' }]);
    expect(renderGhostCard(view, clock.now().toISOString())).toContain(
      '<div class="reading" data-changed="true" data-tone="neutral"><dt>Bonus</dt><dd><del aria-label="was $300">$300</del> <ins aria-label="now $450">$450</ins></dd></div>',
    );
    await store.acknowledge('lantern', clock.now().toISOString());
    expect((await ghostView(deps, watch)).readings).toEqual([{ label: 'Bonus', value: '$450' }]);
  });

  it('colors a change by what it means for the reader, says "gone" for a lost value and hides one never seen', async () => {
    const feeWatch = defineWatch({
      id: 'fees',
      name: 'Fee Crypt',
      url: 'https://example.com/fees',
      intervalMs: 0,
      fields: [
        { name: 'fee', label: 'Fee', selector: '.fee', kind: 'money', better: 'lower' },
        { name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money', better: 'higher' },
        { name: 'perk', label: 'Perk', selector: '.perk', kind: 'text' },
      ],
      rules: [rules.changed('fee'), rules.changed('bonus'), rules.disappeared('bonus')],
    });
    const feeApp = { ...app, watches: [feeWatch] };
    const html = (fee: string, bonus: string | null) =>
      `<html><body><p class="fee">${fee}</p>${bonus ? `<p class="bonus">${bonus}</p>` : ''}</body></html>`;
    const clock = manualClock('2026-10-31T00:00:00Z');
    const store = new GhostStore(new MemoryBlobStore());
    const runner = new Runner({ app: feeApp, fetcher: new ListFetcher([html('$5', '$300'), html('$15', '$350'), html('$15', null)], clock), store, sink, clock });
    const deps = { app: feeApp, store, runner, clock, outbox: undefined } as unknown as Parameters<typeof ghostView>[0];
    await runner.check(feeWatch);
    clock.advance(1000);
    const night = await runner.check(feeWatch);
    expect(night.status === 'changed' && night.alerts.map((a) => [a.field, a.tone])).toEqual([
      ['fee', 'bad'],
      ['bonus', 'good'],
    ]);
    expect((await ghostView(deps, feeWatch)).readings).toEqual([
      { label: 'Fee', value: '$15', before: '$5', tone: 'bad' },
      { label: 'Bonus', value: '$350', before: '$300', tone: 'good' },
    ]);
    clock.advance(1000);
    await runner.check(feeWatch);
    const view = await ghostView(deps, feeWatch);
    // The perk never appeared on the page, so the stone leaves it off rather than reading "nothing".
    expect(view.readings).toEqual([
      { label: 'Fee', value: '$15', before: '$5', tone: 'bad' },
      { label: 'Bonus', value: 'gone', before: '$300', tone: 'bad' },
    ]);
    expect(renderGhostCard(view, clock.now().toISOString())).toContain('<ins aria-label="now gone" data-gone="true">gone</ins>');
    // A quiet visit afterwards does not make the stone forget why the ghost is restless.
    clock.advance(1000);
    await runner.check(feeWatch);
    expect((await ghostView(deps, feeWatch)).lastMessage).toBe('3 unread changes. Latest: Bonus disappeared (it was "$350").');
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
