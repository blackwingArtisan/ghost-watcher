/**
 * Noise ratio: runs the same fixture nights through three watchers and counts their alerts.
 *
 *   whole page      alerts whenever the page's visible text changes (a watcher with no filter set)
 *   selector text   alerts whenever the raw text of the watched elements changes (the same CSS
 *                   selectors Ghost Watcher uses, compared as text after collapsing whitespace)
 *   Ghost Watcher   alerts when a rule fires on the normalized, diffed values
 *
 * Every watcher sees the exact same responses: one polite fetch per check, recorded and shared.
 * The fixture author lists which page changes a person would want to hear about; an alert on any
 * other visit is a false alarm.
 */
import * as cheerio from 'cheerio';
import type { GhostApp } from '../app';
import type { AlertSink } from '../alerts/types';
import { systemClock } from '../clock';
import { PoliteFetcher, buildUserAgent, type FetchOutcome, type Fetcher } from '../fetcher';
import { Runner } from '../runner';
import { MemoryBlobStore } from '../store/blob';
import { GhostStore } from '../store/ghost-store';
import type { Watch } from '../watch';
import { startFixtureServer, type FixtureSite } from './fixture-server';

export interface WorthKnowing {
  /** The fixture version (night) on which the page changed. */
  version: number;
  watchId: string;
  /** Why a person would want to hear about it, for the report. */
  why: string;
}

export interface NoiseRatioOptions {
  site: FixtureSite;
  /** Builds the app with its watches pointed at the fixture origin. */
  buildApp: (origin: string) => GhostApp;
  worthKnowing: WorthKnowing[];
  /** Checks per night (version). Default 4, one every 6 hours. */
  checksPerNight?: number;
}

export interface Tally {
  alerts: number;
  /** Alerts on a visit where a change worth knowing about happened. */
  caught: number;
  falseAlarms: number;
  /** Changes worth knowing about that raised no alert. */
  missed: number;
}

export interface NoiseReport {
  app: string;
  nights: number;
  checksPerNight: number;
  /** Pages every watcher could read (robots.txt-blocked pages are left out for all three). */
  pages: number;
  /** Visits counted after the first one per page, which only records a baseline. */
  visits: number;
  worthKnowing: number;
  wholePage: Tally;
  selectorText: Tally;
  ghostWatcher: Tally;
}

/** Wraps a fetcher and remembers the last outcome per URL, so other watchers can read the same response. */
class RecordingFetcher implements Fetcher {
  readonly last = new Map<string, FetchOutcome>();
  constructor(private readonly inner: Fetcher) {}
  async fetchPage(url: string): Promise<FetchOutcome> {
    const outcome = await this.inner.fetchPage(url);
    this.last.set(url, outcome);
    return outcome;
  }
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The raw text a selector-based watcher would compare: each watched element, unnormalized. */
export function selectorText(html: string, watch: Watch): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];
  for (const field of watch.fields) {
    const element = $(field.selector).first();
    parts.push(`${field.name}=${collapse((field.attribute ? element.attr(field.attribute) : element.text()) ?? '')}`);
  }
  for (const list of watch.lists) {
    const items = $(list.itemSelector)
      .map((_, element) => collapse($(element).text()))
      .get();
    parts.push(`${list.name}=${items.join(' | ')}`);
  }
  return parts.join('\n');
}

const emptyTally = (): Tally => ({ alerts: 0, caught: 0, falseAlarms: 0, missed: 0 });

function count(tally: Tally, fired: boolean, worth: boolean): void {
  if (!fired) return;
  tally.alerts += 1;
  if (worth) tally.caught += 1;
  else tally.falseAlarms += 1;
}

const silentSink: AlertSink = {
  channel: 'count',
  deliver: async (message) => ({ channel: 'count', reference: message.alerts[0]?.id ?? 'none' }),
};

export async function measureNoise(options: NoiseRatioOptions): Promise<NoiseReport> {
  const checksPerNight = options.checksPerNight ?? 4;
  const fixture = await startFixtureServer(options.site, { port: 0 });
  try {
    const built = options.buildApp(fixture.origin);
    const app: GhostApp = { ...built, watches: built.watches.map((watch) => ({ ...watch, intervalMs: 0 })) };
    const fetcher = new RecordingFetcher(
      new PoliteFetcher({
        userAgent: buildUserAgent({ version: app.version, localOnly: true }),
        clock: systemClock,
        minHostGapMs: 0,
        maxCrawlDelayMs: 0,
      }),
    );
    const runner = new Runner({ app, fetcher, store: new GhostStore(new MemoryBlobStore()), sink: silentSink, clock: systemClock });
    const worth = new Set(options.worthKnowing.map((w) => `${w.version}:${w.watchId}`));
    const tallies = { wholePage: emptyTally(), selectorText: emptyTally(), ghostWatcher: emptyTally() };
    const previousSelectorText = new Map<string, string>();
    const readable = new Set<string>();
    let visits = 0;

    for (let night = 1; night <= options.site.versions; night += 1) {
      if (night > 1) fixture.advance();
      for (let check = 0; check < checksPerNight; check += 1) {
        for (const watch of app.watches) {
          const result = await runner.check(watch, { force: true });
          const outcome = fetcher.last.get(watch.url);
          if (outcome?.status !== 'ok' || result.status === 'blocked' || result.status === 'error' || result.status === 'skipped') continue;
          readable.add(watch.id);
          const raw = selectorText(outcome.html, watch);
          const before = previousSelectorText.get(watch.id);
          previousSelectorText.set(watch.id, raw);
          if (result.status === 'baseline') continue;
          visits += 1;
          const isWorth = check === 0 && worth.has(`${night}:${watch.id}`);
          count(tallies.wholePage, result.pageMoved, isWorth);
          count(tallies.selectorText, before !== undefined && before !== raw, isWorth);
          count(tallies.ghostWatcher, result.status === 'changed', isWorth);
        }
      }
    }
    for (const tally of Object.values(tallies)) tally.missed = options.worthKnowing.length - tally.caught;
    return {
      app: app.name,
      nights: options.site.versions,
      checksPerNight,
      pages: readable.size,
      visits,
      worthKnowing: options.worthKnowing.length,
      ...tallies,
    };
  } finally {
    await fixture.close();
  }
}

/** A Markdown table of one or more reports, with a total row when there are several. */
export function noiseTable(reports: NoiseReport[]): string {
  const cell = (t: Tally) => `${t.alerts} (${t.falseAlarms} false, ${t.missed} missed)`;
  const sum = (pick: (r: NoiseReport) => Tally): Tally =>
    reports.map(pick).reduce((a, b) => ({ alerts: a.alerts + b.alerts, caught: a.caught + b.caught, falseAlarms: a.falseAlarms + b.falseAlarms, missed: a.missed + b.missed }), emptyTally());
  const rows = reports.map(
    (r) => `| ${r.app} | ${r.pages} pages, ${r.visits} visits | ${r.worthKnowing} | ${cell(r.wholePage)} | ${cell(r.selectorText)} | ${cell(r.ghostWatcher)} |`,
  );
  if (reports.length > 1) {
    const pages = reports.reduce((n, r) => n + r.pages, 0);
    const visits = reports.reduce((n, r) => n + r.visits, 0);
    const worthKnowing = reports.reduce((n, r) => n + r.worthKnowing, 0);
    rows.push(
      `| **Total** | ${pages} pages, ${visits} visits | ${worthKnowing} | **${cell(sum((r) => r.wholePage))}** | **${cell(sum((r) => r.selectorText))}** | **${cell(sum((r) => r.ghostWatcher))}** |`,
    );
  }
  return [
    '| App | Checked | Changes worth knowing | Whole-page watcher | Selector text watcher | Ghost Watcher |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}
