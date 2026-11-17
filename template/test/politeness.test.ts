import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { manualClock } from '../src/clock';
import { PoliteFetcher, buildUserAgent, type Transport } from '../src/fetcher';
import { crawlDelayMs, isAllowed, parseRobots, productToken } from '../src/robots';

const UA = buildUserAgent({ version: '0.1.0', contactUrl: 'https://example.com/ghost-watcher' });

describe('robots.txt', () => {
  const policy = parseRobots(`
# comment
User-agent: *
Disallow: /private/
Allow: /private/press$
Crawl-delay: 4

User-agent: GhostWatcher
User-agent: OtherBot
Disallow: /members/
Disallow: /*.pdf$
Allow: /members/public/
Crawl-delay: 2.5

Sitemap: https://example.com/sitemap.xml
`);

  it('uses the most specific group for our product token', () => {
    expect(productToken(UA)).toBe('ghostwatcher');
    expect(isAllowed(policy, UA, '/members/offers')).toBe(false);
    // The wildcard group does not apply once a specific group matches.
    expect(isAllowed(policy, UA, '/private/thing')).toBe(true);
    expect(crawlDelayMs(policy, UA)).toBe(2500);
  });

  it('lets the longest rule win, with Allow winning ties', () => {
    expect(isAllowed(policy, UA, '/members/public/rates')).toBe(true);
    expect(isAllowed(policy, 'SomeBot/1.0', '/private/press')).toBe(true);
    expect(isAllowed(policy, 'SomeBot/1.0', '/private/press/2')).toBe(false);
  });

  it('supports * and $ wildcards', () => {
    expect(isAllowed(policy, UA, '/files/terms.pdf')).toBe(false);
    expect(isAllowed(policy, UA, '/files/terms.pdf?v=2')).toBe(true);
  });

  it('allows everything when there is no matching group', () => {
    expect(isAllowed(parseRobots('User-agent: BadBot\nDisallow: /'), UA, '/anything')).toBe(true);
    expect(isAllowed(parseRobots(''), UA, '/')).toBe(true);
  });

  it('records sitemaps', () => {
    expect(policy.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });
});

describe('buildUserAgent', () => {
  it('names the product, version and a contact URL', () => {
    expect(UA).toBe('GhostWatcher/0.1.0 (+https://example.com/ghost-watcher; page-change watcher)');
  });
  it('refuses to build an anonymous User-Agent', () => {
    expect(() => buildUserAgent({ version: '1', contactUrl: '' })).toThrow(/contact URL/);
  });
});

interface Hit {
  path: string;
  ua: string;
}

let server: Server | undefined;

async function site(routes: Record<string, { status?: number; body: string; delayMs?: number }>): Promise<{ origin: string; hits: Hit[] }> {
  const hits: Hit[] = [];
  server = createServer((req, res) => {
    hits.push({ path: req.url ?? '', ua: String(req.headers['user-agent']) });
    const route = routes[req.url ?? ''];
    const respond = () => {
      res.writeHead(route?.status ?? (route ? 200 : 404), { 'Content-Type': 'text/html' });
      res.end(route?.body ?? 'not found');
    };
    if (route?.delayMs) setTimeout(respond, route.delayMs);
    else respond();
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { origin: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`, hits };
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe('PoliteFetcher', () => {
  it('asks robots.txt first, sends the honest User-Agent, and never requests a disallowed page', async () => {
    const { origin, hits } = await site({
      '/robots.txt': { body: 'User-agent: *\nDisallow: /members/\nCrawl-delay: 3' },
      '/offer': { body: '<p>$300</p>' },
      '/members/secret': { body: 'secret' },
    });
    const clock = manualClock();
    const fetcher = new PoliteFetcher({ userAgent: UA, clock, minHostGapMs: 0 });
    const ok = await fetcher.fetchPage(`${origin}/offer`);
    const blocked = await fetcher.fetchPage(`${origin}/members/secret`);
    expect(ok).toMatchObject({ status: 'ok', html: '<p>$300</p>', httpStatus: 200 });
    expect(blocked).toMatchObject({ status: 'blocked', reason: 'robots' });
    expect(hits.map((h) => h.path)).toEqual(['/robots.txt', '/offer']);
    expect(hits.every((h) => h.ua === UA)).toBe(true);
  });

  it('caches robots.txt and waits out Crawl-delay between requests to one host', async () => {
    const { origin, hits } = await site({
      '/robots.txt': { body: 'User-agent: *\nCrawl-delay: 3' },
      '/a': { body: 'a' },
      '/b': { body: 'b' },
    });
    const clock = manualClock();
    const fetcher = new PoliteFetcher({ userAgent: UA, clock, minHostGapMs: 0 });
    await fetcher.fetchPage(`${origin}/a`);
    await fetcher.fetchPage(`${origin}/b`);
    expect(hits.filter((h) => h.path === '/robots.txt')).toHaveLength(1);
    // Before /a (3 s after robots.txt) and before /b (3 s after /a).
    expect(clock.slept).toBe(6000);
  });

  it('treats a missing robots.txt as allow-all and a failing one as stay-away', async () => {
    const missing = await site({ '/page': { body: 'hello' } });
    const fetcher = new PoliteFetcher({ userAgent: UA, clock: manualClock(), minHostGapMs: 0 });
    expect((await fetcher.fetchPage(`${missing.origin}/page`)).status).toBe('ok');
    server?.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));

    const failing = await site({ '/robots.txt': { status: 500, body: 'oops' }, '/page': { body: 'hello' } });
    const fetcher2 = new PoliteFetcher({ userAgent: UA, clock: manualClock(), minHostGapMs: 0 });
    expect((await fetcher2.fetchPage(`${failing.origin}/page`)).status).toBe('blocked');
    expect(failing.hits.map((h) => h.path)).toEqual(['/robots.txt']);
  });

  it('reports HTTP errors and slow-down responses without throwing', async () => {
    const { origin } = await site({ '/gone': { status: 404, body: 'gone' }, '/busy': { status: 429, body: 'slow down' } });
    const fetcher = new PoliteFetcher({ userAgent: UA, clock: manualClock(), minHostGapMs: 0 });
    expect(await fetcher.fetchPage(`${origin}/gone`)).toMatchObject({ status: 'error', httpStatus: 404 });
    expect(await fetcher.fetchPage(`${origin}/busy`)).toMatchObject({ status: 'error', httpStatus: 429, message: expect.stringContaining('slow down') });
    expect(await fetcher.fetchPage('not a url')).toMatchObject({ status: 'error' });
  });

  it('times out slow pages', async () => {
    const { origin } = await site({ '/robots.txt': { status: 404, body: '' }, '/slow': { body: 'late', delayMs: 400 } });
    const fetcher = new PoliteFetcher({ userAgent: UA, minHostGapMs: 0, timeoutMs: 50 });
    expect(await fetcher.fetchPage(`${origin}/slow`)).toMatchObject({ status: 'error', message: expect.stringContaining('No answer') });
  });

  it('never has two requests in flight to the same host', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const transport: Transport = async (url) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { status: url.endsWith('/robots.txt') ? 404 : 200, url, text: async () => 'ok', headers: { get: () => null } };
    };
    const fetcher = new PoliteFetcher({ userAgent: UA, transport, minHostGapMs: 0 });
    await Promise.all(['a', 'b', 'c', 'd'].map((p) => fetcher.fetchPage(`https://shop.example.com/${p}`)));
    expect(maxInFlight).toBe(1);
  });
});
