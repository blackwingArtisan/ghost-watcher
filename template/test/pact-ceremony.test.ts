import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { defineApp } from '../src/app';
import { manualClock } from '../src/clock';
import { loadDeps } from '../src/config';
import { createDashboardServer } from '../src/server';
import { seedDemoPacts } from '../src/sealing';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { renderGhostCard, renderSealCeremony } from '../src/ui/render.js';
import { defineWatch, rules } from '../src/watch';
import { money, snapshot } from './pact-support';

const NOW = '2026-11-19T10:00:00Z';
const HASH = 'ab12'.repeat(16);

describe('the sealing ceremony markup', () => {
  it('(PACT 13.2) draws the wax seal as inline SVG with the ghost crest and no image file', () => {
    const html = renderSealCeremony(HASH);
    expect(html).toContain('<svg class="wax"');
    expect(html).toContain('class="wax__ghost"');
    expect(html).not.toMatch(/<img|url\(/);
  });

  it('(PACT 13.5) holds the full hash in a visually hidden aria-live span and hides the typed line from screen readers', () => {
    const html = renderSealCeremony(HASH, { final: true });
    expect(html).toMatch(/<span class="visually-hidden" role="status" aria-live="polite"[^>]*>Pact sealed\. SHA-256 ab12/);
    expect(html).toContain(`SHA-256 ${HASH}</span>`);
    expect(html).toMatch(/<code class="seal-ceremony__typed" aria-hidden="true"/);
  });

  it('(PACT 13.4) starts with an empty typed line that JavaScript fills in', () => {
    const html = renderSealCeremony(HASH);
    expect(html).toContain('data-playing="true"');
    expect(html).toContain(`data-hash="${HASH}"></code>`);
  });

  it('(PACT 13.8) the final state (reduced motion) has the whole hash and nothing left to play', () => {
    const html = renderSealCeremony(HASH, { final: true });
    expect(html).toContain('data-playing="false"');
    expect(html).toContain(`data-hash="${HASH}">${HASH}</code>`);
  });

  it('(PACT 13.7) a stone drawn with a sealed pact shows the wax badge and no ceremony', () => {
    const ghost = {
      id: 'g', name: 'G', subtitle: '', state: 'quiet', readings: [], lastMessage: '', canSeal: true,
      pact: { state: 'sealed', sealedAt: '2026-11-19T10:00:00Z', sealedDate: 'Nov 19, 2026', sha256: HASH, shortHash: 'ab12ab12', seeded: false },
    };
    const html = renderGhostCard(ghost);
    expect(html).toContain('ghost__pact-tag ghost__pact-tag--wax');
    expect(html).toContain('Pact sealed');
    expect(html).not.toContain('seal-ceremony');
  });
});

describe('seeding and the fresh-pact route', () => {
  it('(PACT 13.12) seeding skips the watches it is told to leave unsealed', async () => {
    const store = new GhostStore(new MemoryBlobStore());
    for (const id of ['a', 'b']) await store.saveSnapshot(snapshot('2026-11-19T09:00:00.000Z', { bonus: money('$300') }, id, 'http://127.0.0.1:9/offer'));
    const results = await seedDemoPacts({ store, clock: manualClock(NOW) }, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { skip: ['b'] });
    expect(results.map((r) => r.status)).toEqual(['sealed']);
    expect((await store.pact('a')).status).toBe('sealed');
    expect((await store.pact('b')).status).toBe('none');
  });

  const app = defineApp({
    id: 'fresh-test',
    name: 'Fresh Crypt',
    tagline: 'Testing',
    version: '0.1.0',
    alertTo: ['tester@example.com'],
    copy: { watchNoun: 'pages', quiet: 'Quiet.', pacts: true, demoUnsealed: ['b'] },
    watches: ['a', 'b'].map((id) =>
      defineWatch({
        id,
        name: id.toUpperCase(),
        url: 'http://127.0.0.1:9/offer',
        fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money', better: 'higher' }],
        rules: [rules.wentUp('bonus')],
      }),
    ),
  });

  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function run(demo: boolean) {
    const deps = await loadDeps(app, { env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' }, clock: manualClock(NOW) });
    for (const id of ['a', 'b']) await deps.store.saveSnapshot(snapshot('2026-11-19T09:00:00.000Z', { bonus: money('$300') }, id, 'http://127.0.0.1:9/offer'));
    await seedDemoPacts(deps, app.watches, { skip: [] });
    const server = createDashboardServer(deps, demo ? { demo: { nextNight: () => ({ version: 1, moved: false }), night: () => 0, rewind: async () => undefined } } : {});
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    close = () => new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = async (id: unknown) => {
      const res = await fetch(`${base}/api/demo/fresh-pact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      return res.status;
    };
    return { deps, base, post };
  }

  it('(PACT 13.14) in demo mode the route clears the named ghost\'s pact and only that one', async () => {
    const { deps, post } = await run(true);
    expect(await post('b')).toBe(200);
    expect((await deps.store.pact('b')).status).toBe('none');
    expect((await deps.store.pact('a')).status).toBe('sealed');
  });

  it('(PACT 13.15) the demo state names the first unsealed ghost, so ?fresh-pact=1 has a target', async () => {
    const { base } = await run(true);
    const state = (await (await fetch(`${base}/api/state`)).json()) as { app: { demo: boolean; freshPact: string | null } };
    expect(state.app).toMatchObject({ demo: true, freshPact: 'b' });
  });

  it('(PACT 13.16) outside demo mode the route answers 404 and clears nothing, and the state has no target', async () => {
    const { deps, base, post } = await run(false);
    expect(await post('b')).toBe(404);
    expect((await deps.store.pact('b')).status).toBe('sealed');
    const state = (await (await fetch(`${base}/api/state`)).json()) as { app: Record<string, unknown> };
    expect(state.app).not.toHaveProperty('freshPact');
  });

  it('(PACT 13.17) an unknown ghost or a missing id answers 404 and clears nothing', async () => {
    const { deps, post } = await run(true);
    expect(await post('nobody')).toBe(404);
    expect(await post(1)).toBe(404);
    expect((await deps.store.pact('a')).status).toBe('sealed');
    expect((await deps.store.pact('b')).status).toBe('sealed');
  });
});
