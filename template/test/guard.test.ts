import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { defineApp, type GhostApp } from '../src/app';
import { manualClock } from '../src/clock';
import { ConfigError, isPlaceholderContact, loadDeps, visitsThirdParty } from '../src/config';
import { allowedHostSet, checkRequest, hostnameOf, parseHostList } from '../src/guard';
import { createDashboardServer } from '../src/server';
import { HOUR_MS, defineWatch, rules } from '../src/watch';

const local = allowedHostSet();

describe('request guard', () => {
  it('reads the hostname out of a Host header', () => {
    expect(hostnameOf('127.0.0.1:3130')).toBe('127.0.0.1');
    expect(hostnameOf('LocalHost')).toBe('localhost');
    expect(hostnameOf('[::1]:3130')).toBe('[::1]');
    expect(hostnameOf(undefined)).toBeNull();
    expect(hostnameOf('evil.example/path')).toBeNull();
    expect(hostnameOf('user@127.0.0.1')).toBeNull();
  });

  it('answers loopback hosts and refuses unknown ones (DNS rebinding)', () => {
    expect(checkRequest({ method: 'GET', headers: { host: '127.0.0.1:3130' } }, local)).toEqual({ ok: true });
    expect(checkRequest({ method: 'GET', headers: { host: 'localhost:3130' } }, local)).toEqual({ ok: true });
    expect(checkRequest({ method: 'GET', headers: { host: 'rebind.attacker.example:3130' } }, local).ok).toBe(false);
    expect(checkRequest({ method: 'GET', headers: {} }, local).ok).toBe(false);
  });

  it('accepts configured hosts such as a deployed hostname', () => {
    const hosts = allowedHostSet(parseHostList(' crypt.example.org , ,haunt.example.net:443 '));
    expect(checkRequest({ method: 'GET', headers: { host: 'crypt.example.org' } }, hosts)).toEqual({ ok: true });
    expect(checkRequest({ method: 'GET', headers: { host: 'haunt.example.net' } }, hosts)).toEqual({ ok: true });
    expect(checkRequest({ method: 'GET', headers: { host: 'other.example.org' } }, hosts).ok).toBe(false);
  });

  it('lets same-origin and non-browser POSTs through', () => {
    const host = '127.0.0.1:3130';
    expect(checkRequest({ method: 'POST', headers: { host } }, local)).toEqual({ ok: true });
    expect(checkRequest({ method: 'POST', headers: { host, origin: 'http://127.0.0.1:3130', 'sec-fetch-site': 'same-origin' } }, local)).toEqual({ ok: true });
    expect(checkRequest({ method: 'POST', headers: { host: '127.0.0.1:80', origin: 'http://127.0.0.1' } }, local)).toEqual({ ok: true });
  });

  it('refuses cross-origin and cross-site POSTs', () => {
    const host = '127.0.0.1:3130';
    expect(checkRequest({ method: 'POST', headers: { host, origin: 'http://evil.example' } }, local).ok).toBe(false);
    expect(checkRequest({ method: 'POST', headers: { host, origin: 'http://127.0.0.1:3131' } }, local).ok).toBe(false);
    expect(checkRequest({ method: 'POST', headers: { host, origin: 'null' } }, local).ok).toBe(false);
    expect(checkRequest({ method: 'POST', headers: { host, 'sec-fetch-site': 'cross-site' } }, local).ok).toBe(false);
    expect(checkRequest({ method: 'POST', headers: { host, 'sec-fetch-site': 'same-site' } }, local).ok).toBe(false);
  });
});

describe('contact URL honesty', () => {
  it('recognises documentation-only domains', () => {
    expect(isPlaceholderContact('https://example.com/ghost-watcher')).toBe(true);
    expect(isPlaceholderContact('https://crypt.example/about')).toBe(true);
    expect(isPlaceholderContact('not a url')).toBe(true);
    expect(isPlaceholderContact('https://stubborn-otter.dev/ghost-watcher')).toBe(false);
  });

  it('treats only real third-party sites as visits that need a reachable contact', () => {
    expect(visitsThirdParty('http://127.0.0.1:3131/offers/lanternfield')).toBe(false);
    expect(visitsThirdParty('http://localhost:3131/')).toBe(false);
    expect(visitsThirdParty('https://www.example.com/offer')).toBe(false);
    expect(visitsThirdParty('https://bank.invalid/offer')).toBe(false);
    expect(visitsThirdParty('https://www.lanternfield-bank.com/offer')).toBe(true);
  });

  const watchAt = (url: string, id = 'lantern') =>
    defineWatch({
      id,
      name: 'Lanternfield',
      url,
      intervalMs: 6 * HOUR_MS,
      fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' }],
      rules: [rules.wentUp('bonus')],
    });
  const appAt = (urls: string[], contactUrl?: string): GhostApp =>
    defineApp({
      id: 'test-app',
      name: 'Test Crypt',
      tagline: 'Testing',
      version: '0.1.0',
      ...(contactUrl === undefined ? {} : { contactUrl }),
      alertTo: ['tester@example.com'],
      copy: { watchNoun: 'pages', quiet: 'Quiet.' },
      watches: urls.map((url, index) => watchAt(url, `lantern-${index}`)),
    });
  const env = { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' };
  const REAL = 'https://www.lanternfield-bank.com/offer';
  const LOCAL = 'http://127.0.0.1:3131/offer';
  const LOCAL_ONLY_UA = 'GhostWatcher/0.1.0 (local-only, no public contact; page-change watcher)';

  it('refuses a real site when no contact URL is configured at all', async () => {
    const attempt = loadDeps(appAt([REAL]), { env });
    await expect(attempt).rejects.toBeInstanceOf(ConfigError);
    await expect(attempt).rejects.toThrow(/GHOST_CONTACT_URL/);
    await expect(attempt).rejects.toThrow(/must identify itself/);
  });

  it('refuses a real site while the only contact URL is a placeholder, whether from the app or the environment', async () => {
    const fromApp = loadDeps(appAt([REAL], 'https://example.com/about'), { env });
    await expect(fromApp).rejects.toBeInstanceOf(ConfigError);
    await expect(fromApp).rejects.toThrow(/placeholder https:\/\/example\.com\/about/);
    await expect(fromApp).rejects.toThrow(/GHOST_CONTACT_URL/);
    const fromEnv = loadDeps(appAt([REAL]), { env: { ...env, GHOST_CONTACT_URL: 'https://crypt.example/me' } });
    await expect(fromEnv).rejects.toThrow(/placeholder https:\/\/crypt\.example\/me/);
    await expect(loadDeps(appAt([REAL]), { env: { ...env, GHOST_CONTACT_URL: '  ' } })).rejects.toThrow(/must identify itself/);
  });

  it('refuses when only some of the watches are local', async () => {
    await expect(loadDeps(appAt([LOCAL, REAL]), { env })).rejects.toThrow(/lanternfield-bank\.com/);
  });

  it('accepts a real site once GHOST_CONTACT_URL names a reachable page', async () => {
    const real = await loadDeps(appAt([REAL]), { env: { ...env, GHOST_CONTACT_URL: 'https://stubborn-otter.dev/ghost-watcher' } });
    expect(real.describe.userAgent).toBe('GhostWatcher/0.1.0 (+https://stubborn-otter.dev/ghost-watcher; page-change watcher)');
    expect(real.app.contactUrl).toBe('https://stubborn-otter.dev/ghost-watcher');
  });

  it('accepts a real site when the app carries a real contact URL, and lets the environment override it', async () => {
    const fromApp = await loadDeps(appAt([REAL], 'https://stubborn-otter.dev/app'), { env });
    expect(fromApp.describe.userAgent).toContain('+https://stubborn-otter.dev/app;');
    const overridden = await loadDeps(appAt([REAL], 'https://stubborn-otter.dev/app'), {
      env: { ...env, GHOST_CONTACT_URL: 'https://stubborn-otter.dev/env' },
    });
    expect(overridden.describe.userAgent).toContain('+https://stubborn-otter.dev/env;');
  });

  it('sends the explicit local-only token when every watch is on a loopback or reserved host', async () => {
    const fixture = await loadDeps(appAt([LOCAL]), { env });
    expect(fixture.describe.userAgent).toBe(LOCAL_ONLY_UA);
    expect(fixture.app.contactUrl).toBeUndefined();
    const reserved = await loadDeps(appAt(['https://www.example.com/offer', 'https://bank.invalid/offer', 'http://localhost:3131/']), { env });
    expect(reserved.describe.userAgent).toBe(LOCAL_ONLY_UA);
    expect(reserved.fetcher).toMatchObject({ userAgent: LOCAL_ONLY_UA });
  });

  it('never presents a placeholder contact URL, even for local watches', async () => {
    const fromApp = await loadDeps(appAt([LOCAL], 'https://example.com/about'), { env });
    expect(fromApp.describe.userAgent).toBe(LOCAL_ONLY_UA);
    expect(fromApp.app.contactUrl).toBeUndefined();
    const fromEnv = await loadDeps(appAt([LOCAL]), { env: { ...env, GHOST_CONTACT_URL: 'https://example.org/me' } });
    expect(fromEnv.describe.userAgent).not.toContain('example.org');
    expect(fromEnv.describe.userAgent).toBe(LOCAL_ONLY_UA);
  });

  it('keeps a real contact URL for local watches when one is configured', async () => {
    const deps = await loadDeps(appAt([LOCAL]), { env: { ...env, GHOST_CONTACT_URL: 'https://stubborn-otter.dev/ghost-watcher' } });
    expect(deps.describe.userAgent).toContain('+https://stubborn-otter.dev/ghost-watcher;');
  });
});

describe('dashboard server refuses cross-origin writes', () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  function call(port: number, method: string, path: string, headers: Record<string, string>) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('returns 403 for a hostile Origin or Host and leaves the ghosts untouched', async () => {
    const app = defineApp({
      id: 'test-app',
      name: 'Test Crypt',
      tagline: 'Testing',
      version: '0.1.0',
      alertTo: ['tester@example.com'],
      copy: { watchNoun: 'pages', quiet: 'Quiet.' },
      watches: [
        defineWatch({
          id: 'lantern',
          name: 'Lanternfield',
          url: 'https://example.com/offer',
          intervalMs: 6 * HOUR_MS,
          fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' }],
          rules: [rules.wentUp('bonus')],
        }),
      ],
    });
    let fetches = 0;
    const clock = manualClock();
    const deps = await loadDeps(app, {
      env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' },
      clock,
      fetcher: {
        async fetchPage() {
          fetches += 1;
          return { status: 'ok', html: '<p class="bonus">$300</p>', finalUrl: 'https://example.com/offer', httpStatus: 200, fetchedAt: clock.now().toISOString() };
        },
      },
    });
    (deps.sink as unknown as { write: (line: string) => void }).write = () => undefined;
    server = createDashboardServer(deps, { allowedHosts: ['crypt.example.org'] });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const own = `127.0.0.1:${port}`;

    const hostile = await call(port, 'POST', '/api/check-all', { Host: own, Origin: 'http://evil.example' });
    expect(hostile.status).toBe(403);
    expect(JSON.parse(hostile.body).error).toMatch(/Cross-origin/);
    expect((await call(port, 'POST', '/api/ghosts/lantern/check', { Host: own, 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await call(port, 'GET', '/api/state', { Host: 'rebind.attacker.example' })).status).toBe(403);
    expect(fetches).toBe(0);

    expect((await call(port, 'GET', '/api/state', { Host: 'crypt.example.org' })).status).toBe(200);
    const same = await call(port, 'POST', '/api/check-all', { Host: own, Origin: `http://${own}`, 'Sec-Fetch-Site': 'same-origin' });
    expect(same.status).toBe(200);
    expect(fetches).toBe(1);
  });
});
