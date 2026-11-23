import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defineApp } from '../src/app';
import { manualClock } from '../src/clock';
import { loadDeps, type GhostDeps } from '../src/config';
import { ADDED_PAGES_KEY, MAX_ADDED_PAGES, loadAddedPages, normalizePageUrl, pageIdFor, sealAnyPage } from '../src/pages';
import { createDashboardServer } from '../src/server';
import { startFixtureServer, type FixtureServer } from '../src/testing/fixture-server';
import { HOUR_MS, defineWatch, rules } from '../src/watch';
import { JS_RENDERED_MESSAGE } from '../src/pages';
import { articleSite } from './seal-any-page-support';

const NOW = '2026-11-19T10:00:00Z';

const baseApp = () =>
  defineApp({
    id: 'any-page-test',
    name: 'Test Crypt',
    tagline: 'Testing',
    version: '0.1.0',
    alertTo: ['tester@example.com'],
    copy: { watchNoun: 'pages', quiet: 'Quiet.', disputes: true, pacts: true },
    watches: [
      defineWatch({
        id: 'own',
        name: 'Own page',
        url: 'http://127.0.0.1:9/own',
        intervalMs: 6 * HOUR_MS,
        fields: [{ name: 'bonus', selector: '.b', kind: 'money' }],
        rules: [rules.changed('bonus')],
      }),
    ],
  });

interface Running {
  base: string;
  deps: GhostDeps;
  fixtures: FixtureServer;
  dir: string;
  app: ReturnType<typeof baseApp>;
  post: (body: string) => Promise<{ status: number; body: any }>;
  get: (path: string, method?: string) => Promise<{ status: number; body: any }>;
  close: () => Promise<void>;
}

const open: Running[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const r of open.splice(0)) await r.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function start(options: { dir?: string; fixtures?: FixtureServer; contact?: string } = {}): Promise<Running> {
  const fixtures = options.fixtures ?? (await startFixtureServer(articleSite));
  const dir = options.dir ?? (await mkdtemp(join(tmpdir(), 'any-page-')));
  if (!options.dir) dirs.push(dir);
  const app = baseApp();
  const deps = await loadDeps(app, {
    clock: manualClock(NOW),
    env: { GHOST_STORE: 'file', GHOST_DATA_DIR: dir, GHOST_ALERTS: 'outbox', GHOST_HOST_GAP_MS: '0', ...(options.contact ? { GHOST_CONTACT_URL: options.contact } : {}) },
  });
  const server = createDashboardServer(deps);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const running: Running = {
    base,
    deps,
    fixtures,
    dir,
    app,
    post: async (body) => {
      const r = await fetch(`${base}/api/pages`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
      return { status: r.status, body: await r.json() };
    },
    get: async (path, method = 'GET') => {
      const r = await fetch(`${base}${path}`, { method });
      return { status: r.status, body: await r.json() };
    },
    close: async () => {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (!options.fixtures) await fixtures.close();
    },
  };
  open.push(running);
  return running;
}

const seal = (r: Running, path: string) => r.post(JSON.stringify({ url: `${r.fixtures.origin}${path}` }));
const pageHits = (r: Running, path: string) => r.fixtures.log.filter((e) => e.path === path).length;

describe('seal any page', () => {
  it('(ANY 2.2, 2.3, 2.4, 4.5, 4.6, 6.1, 6.5) seals a readable page with one request, and the ghost appears with a pact', async () => {
    const r = await start();
    const res = await seal(r, '/article');
    expect(res.status).toBe(201);
    const id = pageIdFor(`${r.fixtures.origin}/article`);
    expect(res.body).toMatchObject({ state: 'sealed', ghostId: id, name: 'Hollowmere welcome bonus terms' });
    expect(res.body.pact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pageHits(r, '/article')).toBe(1);
    expect((await r.deps.store.pact(id)).status).toBe('sealed');
    const watch = r.deps.app.watches.find((w) => w.id === id);
    expect(watch?.intervalMs).toBe(6 * HOUR_MS);
    const state = await r.get('/api/state');
    expect(state.body.ghosts.map((g: { id: string }) => g.id)).toContain(id);
    expect((await loadAddedPages(r.deps.store.blobs)).map((p) => p.id)).toEqual([id]);
  });

  it('(ANY 2.2) the request names the watcher honestly with the local-only token', async () => {
    const r = await start();
    await seal(r, '/article');
    expect(r.fixtures.log.find((e) => e.path === '/article')?.userAgent).toContain('local-only, no public contact');
  });

  it('(ANY 3.1, 3.2, 3.3) refuses a page that renders in the browser, with the plain sentence, and stores nothing', async () => {
    const r = await start();
    const res = await seal(r, '/shell');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'js-rendered', error: JS_RENDERED_MESSAGE });
    expect(r.deps.app.watches.map((w) => w.id)).toEqual(['own']);
    expect(await r.deps.store.blobs.get(ADDED_PAGES_KEY)).toBeNull();
    expect((await r.deps.store.pact(pageIdFor(`${r.fixtures.origin}/shell`))).status).toBe('none');
  });

  it('(ANY 4.1) refuses a page robots.txt disallows, without requesting it', async () => {
    const r = await start();
    const res = await seal(r, '/private/terms');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('blocked');
    expect(pageHits(r, '/private/terms')).toBe(0);
    expect(r.deps.app.watches).toHaveLength(1);
  });

  it('(ANY 4.2, 4.3) a real host needs GHOST_CONTACT_URL, and nothing is requested', async () => {
    const r = await start();
    const res = await r.post(JSON.stringify({ url: 'https://offers.bankwatch.org/terms' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('needs-contact');
    expect(res.body.error).toContain('GHOST_CONTACT_URL');
    expect(r.fixtures.log).toHaveLength(0);
  });

  it('(ANY 4.4) a failing page is refused with the reason and stores nothing', async () => {
    const r = await start();
    const res = await seal(r, '/missing');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('fetch-failed');
    expect(r.deps.app.watches).toHaveLength(1);
  });

  it('(ANY 2.6, 9.2) refuses bad addresses and oversized bodies before any fetch', async () => {
    const r = await start();
    for (const url of ['not a url', 'ftp://127.0.0.1/x', 'http://user:pw@127.0.0.1/x', '']) {
      const res = await r.post(JSON.stringify({ url }));
      expect(res.body.code).toBe('bad-url');
    }
    expect((await r.post(JSON.stringify({ url: `http://127.0.0.1/${'a'.repeat(5000)}` }))).status).toBe(413);
    expect(r.fixtures.log).toHaveLength(0);
    expect(normalizePageUrl('https://x.example/a?utm_source=m&b=1#frag')).toBe('https://x.example/a?b=1');
  });

  it('(ANY 2.7) the same page twice answers page-exists and fetches nothing more', async () => {
    const r = await start();
    await seal(r, '/article');
    const again = await r.post(JSON.stringify({ url: `${r.fixtures.origin}/article?utm_campaign=x#top` }));
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'page-exists', ghostId: pageIdFor(`${r.fixtures.origin}/article`) });
    expect(pageHits(r, '/article')).toBe(1);
  });

  it('(ANY 2.8) refuses the thirty-first added page', async () => {
    const r = await start();
    for (let i = 0; i < MAX_ADDED_PAGES; i += 1) {
      r.deps.app.watches.push(defineWatch({ id: `p${i}`, name: `P${i}`, url: `http://127.0.0.1:9/${i}`, tags: ['added'], fields: [{ name: 't', selector: 'p', kind: 'text' }], rules: [] }));
    }
    const res = await seal(r, '/article');
    expect(res.body.code).toBe('too-many');
    expect(r.fixtures.log).toHaveLength(0);
  });

  it('(ANY 6.2, 6.4) after a restart the page is a ghost again with its pact, and the app definition is untouched', async () => {
    const first = await start();
    const id = (await seal(first, '/article')).body.ghostId as string;
    const sha = (await first.deps.store.pact(id)).status === 'sealed' ? (await first.get(`/api/ghosts/${id}/pact`)).body.pact.sha256 : '';
    const dir = first.dir;
    await first.close();
    open.splice(open.indexOf(first), 1);

    const second = await start({ dir, fixtures: first.fixtures });
    expect(second.deps.app.watches.map((w) => w.id)).toEqual(['own', id]);
    expect((await second.get(`/api/ghosts/${id}/pact`)).body.pact.sha256).toBe(sha);
    expect(second.app.watches.map((w) => w.id)).toEqual(['own']);
    expect(first.app.watches.map((w) => w.id)).toEqual(['own']);
  });

  it('(ANY 6.3) an unreadable list starts with no added pages', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'any-page-'));
    dirs.push(dir);
    await mkdir(join(dir, 'store', 'pages'), { recursive: true });
    await writeFile(join(dir, 'store', 'pages', 'added.json'), '{not json');
    const r = await start({ dir });
    expect(r.deps.app.watches.map((w) => w.id)).toEqual(['own']);
  });

  it('(ANY 5.1, 5.3) a change in the text shrieks, and only the changed sentences are quoted', async () => {
    const r = await start();
    const id = (await seal(r, '/article')).body.ghostId as string;
    await fetch(`${r.fixtures.origin}/__fixture/advance`, { method: 'POST' });
    const check = await r.get(`/api/ghosts/${id}/check`, 'POST');
    expect(check.body.result.status).toBe('changed');
    const alert = check.body.result.alerts[0];
    expect(alert.severity).toBe('shriek');
    expect(alert.ruleLabel).toBe('Page text changed');
    expect(alert.summary).toContain('$3,000');
    expect(alert.summary).not.toContain('Hollowmere is an invented institution');
    expect(alert.summary).toContain('180 days');
    expect(alert.pact?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('(ANY 5.2, 1.5) a check that only meets new noise raises nothing', async () => {
    const r = await start();
    const id = (await seal(r, '/article')).body.ghostId as string;
    for (let i = 0; i < 3; i += 1) {
      const check = await r.get(`/api/ghosts/${id}/check`, 'POST');
      expect(check.body.result.status).toBe('unchanged');
    }
    expect((await r.deps.store.alerts(id)).length).toBe(0);
  });

  it('(ANY 5.5) the new ghost can be sealed again, broken and laid to rest like any other', async () => {
    const r = await start();
    const id = (await seal(r, '/article')).body.ghostId as string;
    expect((await r.get(`/api/ghosts/${id}/pact`, 'DELETE')).body.removed).toBe(true);
    expect((await r.get(`/api/ghosts/${id}/pact`, 'POST')).status).toBe(201);
    expect((await r.get(`/api/ghosts/${id}/acknowledge`, 'POST')).status).toBe(200);
  });

  it('(ANY 9.1) a foreign Origin may not add a page', async () => {
    const r = await start();
    const res = await fetch(`${r.base}/api/pages`, { method: 'POST', body: '{}', headers: { Origin: 'http://evil.test' } });
    expect(res.status).toBe(403);
  });

  it('(ANY 2.2) sealAnyPage can be called without the dashboard', async () => {
    const r = await start();
    const res = await sealAnyPage(r.deps, `${r.fixtures.origin}/article`);
    expect(res.status).toBe('sealed');
  });
});
