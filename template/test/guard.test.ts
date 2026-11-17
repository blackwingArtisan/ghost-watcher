import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { defineApp, type GhostApp } from '../src/app';
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

  const watchAt = (url: string) =>
    defineWatch({
      id: 'lantern',
      name: 'Lanternfield',
      url,
      intervalMs: 6 * HOUR_MS,
      fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' }],
      rules: [rules.wentUp('bonus')],
    });
  const appAt = (url: string): GhostApp =>
    defineApp({
      id: 'test-app',
      name: 'Test Crypt',
      tagline: 'Testing',
      version: '0.1.0',
      contactUrl: 'https://example.com/about',
      alertTo: ['tester@example.com'],
      copy: { watchNoun: 'pages', quiet: 'Quiet.' },
      watches: [watchAt(url)],
    });
  const env = { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' };

  it('refuses to visit a real site while the contact URL is still a placeholder', async () => {
    await expect(loadDeps(appAt('https://www.lanternfield-bank.com/offer'), { env })).rejects.toBeInstanceOf(ConfigError);
    await expect(loadDeps(appAt('https://www.lanternfield-bank.com/offer'), { env })).rejects.toThrow(/GHOST_CONTACT_URL/);
  });

  it('accepts a real site once GHOST_CONTACT_URL names a reachable page, and local fixtures without one', async () => {
    const real = await loadDeps(appAt('https://www.lanternfield-bank.com/offer'), {
      env: { ...env, GHOST_CONTACT_URL: 'https://stubborn-otter.dev/ghost-watcher' },
    });
    expect(real.describe.userAgent).toBe('GhostWatcher/0.1.0 (+https://stubborn-otter.dev/ghost-watcher; page-change watcher)');
    const fixture = await loadDeps(appAt('http://127.0.0.1:3131/offer'), { env });
    expect(fixture.describe.userAgent).toContain('+https://example.com/about');
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
      contactUrl: 'https://example.com/about',
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
    const deps = await loadDeps(app, {
      env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' },
      fetcher: {
        async fetchPage() {
          fetches += 1;
          return { status: 'ok', html: '<p class="bonus">$300</p>', finalUrl: 'https://example.com/offer', httpStatus: 200, fetchedAt: new Date().toISOString() };
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
