/**
 * The Fetcher port and its polite HTTP implementation. The watcher is a good neighbor: it asks
 * robots.txt first, sends an honest User-Agent with a contact URL, waits out Crawl-delay, sends one
 * request per host at a time, and gives up quickly instead of hammering a struggling site.
 */
import { systemClock, type Clock } from './clock';
import { ALLOW_ALL, DISALLOW_ALL, crawlDelayMs, isAllowed, parseRobots, type RobotsPolicy } from './robots';

export type FetchOutcome =
  | { status: 'ok'; html: string; finalUrl: string; httpStatus: number; fetchedAt: string }
  | { status: 'blocked'; reason: 'robots'; robotsUrl: string; fetchedAt: string }
  | { status: 'error'; message: string; httpStatus?: number; fetchedAt: string };

export interface Fetcher {
  fetchPage(url: string): Promise<FetchOutcome>;
}

/** Minimal shape of the platform `fetch`, so tests and other runtimes can supply their own transport. */
export type Transport = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; redirect: 'follow' },
) => Promise<{ status: number; url: string; text(): Promise<string>; headers: { get(name: string): string | null } }>;

export interface UserAgentOptions {
  product?: string;
  version: string;
  /** Where a site operator can learn about the watcher or reach its owner. Required: we identify ourselves. */
  contactUrl: string;
}

export function buildUserAgent({ product = 'GhostWatcher', version, contactUrl }: UserAgentOptions): string {
  if (!contactUrl) throw new Error('A contact URL is required so site operators can identify the watcher.');
  return `${product}/${version} (+${contactUrl}; page-change watcher)`;
}

export interface PoliteFetcherOptions {
  userAgent: string;
  timeoutMs?: number;
  robotsTtlMs?: number;
  /** Lower bound on the gap between two requests to one host, even without a Crawl-delay. */
  minHostGapMs?: number;
  /** Longest Crawl-delay we will wait out inside one check; longer delays are capped. */
  maxCrawlDelayMs?: number;
  maxBytes?: number;
  clock?: Clock;
  transport?: Transport;
}

interface RobotsEntry {
  policy: RobotsPolicy;
  expiresAt: number;
}

export class PoliteFetcher implements Fetcher {
  readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly robotsTtlMs: number;
  private readonly minHostGapMs: number;
  private readonly maxCrawlDelayMs: number;
  private readonly maxBytes: number;
  private readonly clock: Clock;
  private readonly transport: Transport;
  private readonly robots = new Map<string, RobotsEntry>();
  private readonly hostQueues = new Map<string, Promise<unknown>>();
  private readonly lastRequestAt = new Map<string, number>();

  constructor(options: PoliteFetcherOptions) {
    if (!options.userAgent) throw new Error('PoliteFetcher needs a User-Agent.');
    this.userAgent = options.userAgent;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.robotsTtlMs = options.robotsTtlMs ?? 60 * 60 * 1000;
    this.minHostGapMs = options.minHostGapMs ?? 1_000;
    this.maxCrawlDelayMs = options.maxCrawlDelayMs ?? 30_000;
    this.maxBytes = options.maxBytes ?? 2_000_000;
    this.clock = options.clock ?? systemClock;
    this.transport = options.transport ?? (globalThis.fetch as unknown as Transport);
  }

  async fetchPage(url: string): Promise<FetchOutcome> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return { status: 'error', message: `Not a valid URL: ${url}`, fetchedAt: this.clock.now().toISOString() };
    }
    return this.onHost(target.host, async () => {
      const policy = await this.policyFor(target);
      if (!isAllowed(policy, this.userAgent, target.pathname + target.search)) {
        return {
          status: 'blocked',
          reason: 'robots',
          robotsUrl: new URL('/robots.txt', target).toString(),
          fetchedAt: this.clock.now().toISOString(),
        } satisfies FetchOutcome;
      }
      return this.request(target, crawlDelayMs(policy, this.userAgent));
    });
  }

  /** Serializes all work for one host: at most one request in flight per host. */
  private onHost<T>(host: string, task: () => Promise<T>): Promise<T> {
    const previous = this.hostQueues.get(host) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.hostQueues.set(
      host,
      next.catch(() => undefined),
    );
    return next;
  }

  private async waitTurn(host: string, crawlDelay: number): Promise<void> {
    const gap = Math.max(this.minHostGapMs, Math.min(crawlDelay, this.maxCrawlDelayMs));
    const last = this.lastRequestAt.get(host);
    if (last !== undefined) {
      const wait = last + gap - this.clock.now().getTime();
      if (wait > 0) await this.clock.sleep(wait);
    }
    this.lastRequestAt.set(host, this.clock.now().getTime());
  }

  private async policyFor(target: URL): Promise<RobotsPolicy> {
    const origin = target.origin;
    const cached = this.robots.get(origin);
    const now = this.clock.now().getTime();
    if (cached && cached.expiresAt > now) return cached.policy;

    const robotsUrl = new URL('/robots.txt', target);
    await this.waitTurn(target.host, 0);
    let policy: RobotsPolicy;
    let ttl = this.robotsTtlMs;
    try {
      const response = await this.send(robotsUrl.toString());
      if (response.status >= 200 && response.status < 300) {
        policy = parseRobots(await response.text());
      } else if (response.status >= 400 && response.status < 500) {
        policy = ALLOW_ALL;
      } else {
        policy = DISALLOW_ALL;
        ttl = Math.min(ttl, 10 * 60 * 1000);
      }
    } catch {
      policy = DISALLOW_ALL;
      ttl = Math.min(ttl, 10 * 60 * 1000);
    }
    this.robots.set(origin, { policy, expiresAt: now + ttl });
    return policy;
  }

  private send(url: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    return this.transport(url, {
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      },
      signal: controller.signal,
      redirect: 'follow',
    }).finally(() => clearTimeout(timer));
  }

  private async request(target: URL, crawlDelay: number): Promise<FetchOutcome> {
    await this.waitTurn(target.host, crawlDelay);
    const fetchedAt = this.clock.now().toISOString();
    try {
      const response = await this.send(target.toString());
      if (response.status === 429 || response.status === 503) {
        return { status: 'error', httpStatus: response.status, message: 'The site asked us to slow down; backing off.', fetchedAt };
      }
      if (response.status < 200 || response.status >= 300) {
        return { status: 'error', httpStatus: response.status, message: `The page answered HTTP ${response.status}.`, fetchedAt };
      }
      const html = await response.text();
      if (html.length > this.maxBytes) {
        return { status: 'error', httpStatus: response.status, message: 'The page is larger than the watcher will read.', fetchedAt };
      }
      return { status: 'ok', html, finalUrl: response.url || target.toString(), httpStatus: response.status, fetchedAt };
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? `No answer within ${Math.round(this.timeoutMs / 1000)} seconds.`
          : `Could not reach the page (${error instanceof Error ? error.message : String(error)}).`;
      return { status: 'error', message, fetchedAt };
    }
  }
}
