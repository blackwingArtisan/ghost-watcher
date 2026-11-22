import { describe, expect, it } from 'vitest';
import { READ_ONLY_MESSAGE, createReplay } from './replay.js';

const bodies: Record<string, unknown> = {
  s0: { app: { night: 0 }, generatedAt: '2026-11-01T00:00:00.000Z', ghosts: [] },
  s1: { app: { night: 1 }, generatedAt: '2026-11-02T00:00:00.000Z', ghosts: [] },
  s1a: { app: { night: 1 }, generatedAt: '2026-11-02T00:05:00.000Z', ghosts: [] },
  arrive1: { version: 2, moved: true, results: [{ status: 'changed', watchId: 'moss' }] },
  check0: { results: [{ status: 'unchanged', watchId: 'moss', pageMoved: false }] },
  detail0: { id: 'moss', alerts: [] },
  sealA: { state: 'sealed', pact: { sha256: 'ab'.repeat(32) } },
  sealState: { app: { night: 0 }, generatedAt: '2026-11-01T00:00:00.000Z', ghosts: [{ id: 'bram', pact: { state: 'sealed' } }] },
  sealDetail: { id: 'bram', pact: { state: 'sealed' } },
  pack1: { letter: 'Dear bank' },
};

const manifest = {
  root: '',
  nodes: {
    '': {
      routes: { 'GET /api/state': 's0', 'POST /api/check-all': 'check0', 'GET /api/ghosts/moss': 'detail0', 'GET /api/ghosts/bram': 'detail0' },
      next: '/',
      seals: { bram: { status: 201, answer: 'sealA', routes: { 'GET /api/state': 'sealState', 'GET /api/ghosts/bram': 'sealDetail' } } },
    },
    '/': {
      routes: { 'GET /api/state': 's1', arrival: 'arrive1', 'GET /api/ghosts/moss/alerts/a1/dispute': 'pack1' },
      acks: { moss: '/moss' },
    },
    '/moss': { routes: { 'GET /api/state': 's1a' } },
  },
};

const replay = () => createReplay(manifest, async (id) => bodies[id]);

describe('static demo replay', () => {
  it('answers recorded GET routes at the current stop and 404s the rest', async () => {
    const r = replay();
    expect(await r.handle('GET', '/api/state')).toEqual({ status: 200, body: bodies.s0 });
    expect(await r.handle('GET', '/api/ghosts/moss')).toEqual({ status: 200, body: bodies.detail0 });
    expect((await r.handle('GET', '/api/ghosts/ghost-x')).status).toBe(404);
  });

  it('lets a night pass with the recorded arrival, then reports no more nights', async () => {
    const r = replay();
    expect(await r.handle('POST', '/api/demo/next-night')).toEqual({ status: 200, body: bodies.arrive1 });
    expect(r.position).toBe('/');
    expect(await r.handle('GET', '/api/ghosts/moss/alerts/a1/dispute')).toEqual({ status: 200, body: bodies.pack1 });
    await r.handle('POST', '/api/ghosts/moss/acknowledge');
    expect(await r.handle('POST', '/api/demo/next-night')).toEqual({ status: 200, body: { version: 2, moved: false, results: [] } });
  });

  it('lays a ghost to rest by moving to the recorded stop, and rewinds to the first sighting', async () => {
    const r = replay();
    await r.handle('POST', '/api/demo/next-night');
    expect(await r.handle('POST', '/api/ghosts/moss/acknowledge')).toEqual({ status: 200, body: { acknowledgedAt: '2026-11-02T00:05:00.000Z' } });
    expect(r.position).toBe('/moss');
    expect(await r.handle('POST', '/api/demo/rewind')).toEqual({ status: 200, body: { night: 0 } });
    expect(r.position).toBe('');
  });

  it('answers a single check from the recorded check-all', async () => {
    expect(await replay().handle('POST', '/api/ghosts/moss/check')).toEqual({ status: 200, body: { result: { status: 'unchanged', watchId: 'moss', pageMoved: false } } });
  });

  it('explains that pacts cannot be sealed or broken on the static site', async () => {
    const r = replay();
    for (const method of ['POST', 'DELETE']) {
      expect(await r.handle(method, '/api/ghosts/moss/pact')).toEqual({ status: 409, body: { code: 'read-only', error: READ_ONLY_MESSAGE } });
    }
  });

  it('(PACT 13.19, 13.20) answers the recorded seal for the unsealed ghost, then reads that ghost from the recording made after it', async () => {
    const r = replay();
    expect(await r.handle('GET', '/api/ghosts/bram')).toEqual({ status: 200, body: bodies.detail0 });
    expect(await r.handle('POST', '/api/ghosts/bram/pact')).toEqual({ status: 201, body: bodies.sealA });
    expect(await r.handle('GET', '/api/state')).toEqual({ status: 200, body: bodies.sealState });
    expect(await r.handle('GET', '/api/ghosts/bram')).toEqual({ status: 200, body: bodies.sealDetail });
    expect(await r.handle('GET', '/api/ghosts/moss')).toEqual({ status: 200, body: bodies.detail0 });
  });

  it('(PACT 13.21) sealing the same ghost again, replacing or breaking it, and sealing any other ghost keep the explanation', async () => {
    const r = replay();
    await r.handle('POST', '/api/ghosts/bram/pact');
    const readOnly = { status: 409, body: { code: 'read-only', error: READ_ONLY_MESSAGE } };
    expect(await r.handle('POST', '/api/ghosts/bram/pact')).toEqual(readOnly);
    expect(await r.handle('DELETE', '/api/ghosts/bram/pact')).toEqual(readOnly);
    expect(await r.handle('POST', '/api/ghosts/moss/pact')).toEqual(readOnly);
  });

  it('(PACT 13.20) a rewind forgets the seal, and the fresh-pact route is a harmless no-op', async () => {
    const r = replay();
    await r.handle('POST', '/api/ghosts/bram/pact');
    await r.handle('POST', '/api/demo/rewind');
    expect(await r.handle('GET', '/api/state')).toEqual({ status: 200, body: bodies.s0 });
    expect((await r.handle('POST', '/api/ghosts/bram/pact')).status).toBe(201);
    expect(await r.handle('POST', '/api/demo/fresh-pact')).toEqual({ status: 200, body: { state: 'none', removed: false } });
  });
});
