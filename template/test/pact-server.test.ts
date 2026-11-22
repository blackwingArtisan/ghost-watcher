import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { defineApp } from '../src/app';
import { loadDeps, type GhostDeps } from '../src/config';
import { createDashboardServer } from '../src/server';
import { startFixtureServer, type FixtureServer } from '../src/testing/fixture-server';
import { HOUR_MS, defineWatch, rules } from '../src/watch';
import { renderDispute, renderFeed, renderGhostCard, renderDetail } from '../src/ui/render.js';
import { failingArchiver, savingArchiver } from './pact-support';

const page = (bonus: string) => `<html><body><h1>Offer</h1><p class="bonus">${bonus}</p></body></html>`;

function makeApp(pacts: boolean, name = 'Lanternfield Everyday Checking') {
  return defineApp({
    id: 'pact-test',
    name: 'Test Crypt',
    tagline: 'Testing',
    version: '0.1.0',
    alertTo: ['tester@example.com'],
    copy: { watchNoun: 'pages', quiet: 'Quiet.', disputes: true, ...(pacts ? { pacts: true } : {}) },
    watches: [
      defineWatch({
        id: 'lantern',
        name,
        url: 'http://127.0.0.1:9/offer',
        intervalMs: 6 * HOUR_MS,
        fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money', better: 'higher' }],
        rules: [rules.wentUp('bonus', { severity: 'shriek' }), rules.wentDown('bonus', { severity: 'shriek' })],
      }),
    ],
  });
}

interface Running {
  base: string;
  deps: GhostDeps;
  fixtures: FixtureServer;
  json: (path: string, method?: string, body?: string) => Promise<{ status: number; body: any }>;
  /** A request with a chosen Origin header (fetch may not set it). */
  withOrigin: (path: string, method: string, origin: string) => Promise<number>;
  close: () => Promise<void>;
}

async function start(options: { pacts?: boolean; archive?: 'saving' | 'failing'; name?: string } = {}): Promise<Running> {
  const fixtures = await startFixtureServer({
    name: 'pact-test',
    versions: 3,
    robots: 'User-agent: *\nDisallow: /private/',
    pages: [{ path: '/offer', title: 'Offer', render: ({ version }) => page(['$300', '$450', '$450'][version - 1] ?? '$450') }],
  });
  const app = makeApp(options.pacts ?? true, options.name);
  const siteApp = { ...app, watches: app.watches.map((w) => ({ ...w, url: `${fixtures.origin}/offer` })) };
  const loaded = await loadDeps(siteApp, { env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console', GHOST_HOST_GAP_MS: '0' } });
  (loaded.sink as unknown as { write: (line: string) => void }).write = () => undefined;
  const archive = options.archive === 'saving' ? savingArchiver('the test archive') : options.archive === 'failing' ? failingArchiver('the test archive') : undefined;
  const deps: GhostDeps = archive ? { ...loaded, archive } : loaded;
  const server = createDashboardServer(deps);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    deps,
    fixtures,
    json: async (path, method = 'GET', body) => {
      const response = await fetch(`${base}${path}`, { method, ...(body !== undefined ? { body, headers: { 'Content-Type': 'application/json' } } : {}) });
      return { status: response.status, body: await response.json() };
    },
    withOrigin: (path, method, origin) =>
      new Promise((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port, path, method, headers: { Origin: origin } }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        });
        req.on('error', reject);
        req.end();
      }),
    close: async () => {
      await new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
      await fixtures.close();
    },
  };
}

let running: Running | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

describe('pact routes on a real dashboard server', () => {
  it('(PACT 9.4) refuses to seal a ghost that has no snapshot and stores nothing', async () => {
    running = await start();
    const res = await running.json('/api/ghosts/lantern/pact', 'POST', '{}');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('no-snapshot');
    expect((await running.deps.store.pactRecord('lantern')).status).toBe('none');
  });

  it('(PACT 9.2) seals with 201, the pact and the archive outcome, and (PACT 9.1) GET reads it without the snapshot body', async () => {
    running = await start({ archive: 'saving' });
    expect((await running.json('/api/ghosts/lantern/pact')).body).toEqual({ state: 'none', pact: null });
    await running.json('/api/ghosts/lantern/check', 'POST');
    const sealed = await running.json('/api/ghosts/lantern/pact', 'POST');
    expect(sealed.status).toBe(201);
    expect(sealed.body).toMatchObject({ state: 'sealed', replaced: false, archive: { saved: true, note: null } });
    expect(sealed.body.pact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sealed.body.pact.shortHash).toMatch(/^[0-9a-f]{8}…[0-9a-f]{4}$/);

    const read = await running.json('/api/ghosts/lantern/pact');
    expect(read.status).toBe(200);
    expect(read.body.state).toBe('sealed');
    expect(read.body.pact.sha256).toBe(sealed.body.pact.sha256);
    expect(read.body.pact.snapshot).toBeUndefined();
    expect(JSON.stringify(read.body)).not.toContain('"fields"');
  });

  it('(PACT 9.2) says so when the archive could not be reached: the pact still seals, with its hash only', async () => {
    running = await start({ archive: 'failing' });
    await running.json('/api/ghosts/lantern/check', 'POST');
    const sealed = await running.json('/api/ghosts/lantern/pact', 'POST');
    expect(sealed.status).toBe(201);
    expect(sealed.body.archive).toEqual({ saved: false, note: 'Could not reach the test archive: timed out' });
  });

  it('(PACT 9.3) answers 409 pact-exists and changes nothing until replacement is confirmed', async () => {
    running = await start();
    await running.json('/api/ghosts/lantern/check', 'POST');
    const first = await running.json('/api/ghosts/lantern/pact', 'POST', '{}');
    const again = await running.json('/api/ghosts/lantern/pact', 'POST', '{}');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('pact-exists');
    expect(again.body.pact.sha256).toBe(first.body.pact.sha256);
    const wrongType = await running.json('/api/ghosts/lantern/pact', 'POST', '{"confirmReplace":"yes"}');
    expect(wrongType.status).toBe(409);
    const confirmed = await running.json('/api/ghosts/lantern/pact', 'POST', '{"confirmReplace":true}');
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.replaced).toBe(true);
  });

  it('(PACT 9.5) answers 400 for a body that is not a JSON object and 413 over 1 KiB, and stores nothing', async () => {
    running = await start();
    await running.json('/api/ghosts/lantern/check', 'POST');
    for (const bad of ['[]', '"yes"', 'null', '{oops', '42']) {
      const res = await running.json('/api/ghosts/lantern/pact', 'POST', bad);
      expect(res.status, bad).toBe(400);
    }
    const big = await running.json('/api/ghosts/lantern/pact', 'POST', JSON.stringify({ confirmReplace: true, pad: 'x'.repeat(2000) }));
    expect(big.status).toBe(413);
    expect((await running.deps.store.pactRecord('lantern')).status).toBe('none');
    // An empty body is `{}`.
    expect((await running.json('/api/ghosts/lantern/pact', 'POST')).status).toBe(201);
  });

  it('(PACT 9.6) DELETE breaks the pact and reports whether anything was removed', async () => {
    running = await start();
    await running.json('/api/ghosts/lantern/check', 'POST');
    await running.json('/api/ghosts/lantern/pact', 'POST');
    expect((await running.json('/api/ghosts/lantern/pact', 'DELETE')).body).toEqual({ state: 'none', removed: true });
    expect((await running.json('/api/ghosts/lantern/pact', 'DELETE')).body).toEqual({ state: 'none', removed: false });
    expect((await running.json('/api/ghosts/lantern/pact')).body.state).toBe('none');
  });

  it('(PACT 9.7) refuses a POST or DELETE from a foreign Origin and changes nothing', async () => {
    running = await start();
    await running.json('/api/ghosts/lantern/check', 'POST');
    expect(await running.withOrigin('/api/ghosts/lantern/pact', 'POST', 'http://evil.example')).toBe(403);
    expect((await running.deps.store.pactRecord('lantern')).status).toBe('none');
    await running.json('/api/ghosts/lantern/pact', 'POST');
    expect(await running.withOrigin('/api/ghosts/lantern/pact', 'DELETE', 'http://evil.example')).toBe(403);
    expect((await running.deps.store.pactRecord('lantern')).status).toBe('sealed');
  });

  it('(PACT 9.8) answers 404 on all three methods for an unknown ghost', async () => {
    running = await start();
    for (const method of ['GET', 'POST', 'DELETE']) {
      expect((await running.json('/api/ghosts/nobody/pact', method)).status, method).toBe(404);
    }
  });

  it('(PACT 9.8, 11.5) answers 404 on all three methods when the app does not set copy.pacts, and shows no pact in the API', async () => {
    running = await start({ pacts: false });
    await running.json('/api/ghosts/lantern/check', 'POST');
    for (const method of ['GET', 'POST', 'DELETE']) {
      expect((await running.json('/api/ghosts/lantern/pact', method)).status, method).toBe(404);
    }
    expect((await running.deps.store.pactRecord('lantern')).status).toBe('none');
    const state = (await running.json('/api/state')).body;
    expect(state.app.pacts).toBe(false);
    expect(Object.keys(state.ghosts[0])).not.toContain('pact');
    expect(Object.keys(state.ghosts[0])).not.toContain('canSeal');
    const detail = (await running.json('/api/ghosts/lantern')).body;
    expect(Object.keys(detail)).not.toContain('pact');
    expect(Object.keys(detail.fields[0])).not.toContain('pact');
    const html = await (await fetch(running.base)).text();
    expect(html).not.toContain('I applied today');
  });

  it('(PACT 9.9, 10.1, 10.2) /api/state carries the pact badge and canSeal for each ghost', async () => {
    running = await start();
    let ghost = (await running.json('/api/state')).body.ghosts[0];
    expect(ghost).toMatchObject({ pact: null, canSeal: false });
    await running.json('/api/ghosts/lantern/check', 'POST');
    ghost = (await running.json('/api/state')).body.ghosts[0];
    expect(ghost).toMatchObject({ pact: null, canSeal: true });
    await running.json('/api/ghosts/lantern/pact', 'POST');
    const state = (await running.json('/api/state')).body;
    expect(state.app.pacts).toBe(true);
    expect(state.ghosts[0].pact).toMatchObject({ state: 'sealed', seeded: false });
    expect(state.ghosts[0].pact.shortHash).toMatch(/…/);
  });

  it('(PACT 9.1, 10.4) reports a damaged pact as corrupt in the route, the state and the séance', async () => {
    running = await start();
    await running.json('/api/ghosts/lantern/check', 'POST');
    const sealed = await running.json('/api/ghosts/lantern/pact', 'POST');
    await running.deps.store.blobs.put(`pacts/lantern/${sealed.body.pact.sha256}.json`, '{"tampered":true}');
    const read = await running.json('/api/ghosts/lantern/pact');
    expect(read.body).toMatchObject({ state: 'corrupt', pact: { state: 'corrupt' } });
    expect(read.body.reason).toMatch(/SHA-256/);
    const detail = (await running.json('/api/ghosts/lantern')).body;
    expect(detail.pact.state).toBe('corrupt');
    expect(detail.fields[0].pact).toBeUndefined();
    // A seal over a corrupt pact needs no confirmation.
    expect((await running.json('/api/ghosts/lantern/pact', 'POST', '{}')).status).toBe(201);
  });

  it('(PACT 10.9, 10.10) the séance detail carries the verified pact and the promised value of each field', async () => {
    running = await start();
    await running.json('/api/ghosts/lantern/check', 'POST');
    await running.json('/api/ghosts/lantern/pact', 'POST');
    running.fixtures.advance();
    await running.json('/api/ghosts/lantern/check', 'POST');
    const detail = (await running.json('/api/ghosts/lantern')).body;
    expect(detail.pact.state).toBe('sealed');
    expect(detail.fields[0]).toMatchObject({ label: 'Bonus', now: '$450', pact: '$300' });
  });

  it('(PACT 9.1) the dispute route carries pack.pact for an alert judged against the pact', async () => {
    running = await start({ archive: 'saving' });
    await running.json('/api/ghosts/lantern/check', 'POST');
    await running.json('/api/ghosts/lantern/pact', 'POST');
    running.fixtures.advance();
    const checked = await running.json('/api/ghosts/lantern/check', 'POST');
    const alert = checked.body.result.alerts[0];
    expect(alert.pact).toMatchObject({ relation: 'differs', tone: 'good' });
    const pack = (await running.json(`/api/ghosts/lantern/alerts/${alert.id}/dispute`)).body;
    expect(pack.pact).toMatchObject({ variant: 'match', relation: 'differs', seeded: false });
    expect(pack.pact.checkCommand).toContain(`pacts/lantern/${alert.pact.sha256}.json`);
    expect(pack.letter.subject).toBe('Request to match the improved terms of Lanternfield Everyday Checking');
  });
});

describe('the ghost testifies: routes and pack link', () => {
  let running: Running | undefined;
  afterEach(async () => {
    await running?.close();
    running = undefined;
  });

  it('(PACT 16.9) GET /verify answers the verify page as HTML with a CSP that lets it fetch a named copy', async () => {
    running = await start();
    const response = await fetch(`${running.base}/verify`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'self' https:");
    const html = await response.text();
    expect(html).toContain('The ghost testifies');
    expect(html).toContain('<script type="module" src="/ui/verify.js">');
    const port = Number(new URL(running.base).port);
    const refused = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: '/verify', headers: { Host: 'evil.example' } }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      });
      req.on('error', reject);
      req.end();
    });
    expect(refused).toBe(403);
  });

  it('(PACT 16.21) the snapshot route answers the stored bytes, whose SHA-256 is the pact SHA-256', async () => {
    running = await start();
    await running.json('/api/ghosts/lantern/check', 'POST');
    const sealed = (await running.json('/api/ghosts/lantern/pact', 'POST', '{}')).body;
    const response = await fetch(`${running.base}/api/ghosts/lantern/pact/snapshot`);
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sealed.pact.sha256);
  });

  it('(PACT 16.22) the snapshot route answers 404 with no pact and when the stored snapshot is damaged', async () => {
    running = await start();
    await running.json('/api/ghosts/lantern/check', 'POST');
    expect((await running.json('/api/ghosts/lantern/pact/snapshot')).status).toBe(404);
    const sealed = (await running.json('/api/ghosts/lantern/pact', 'POST', '{}')).body;
    await running.deps.store.blobs.put(`pacts/lantern/${sealed.pact.sha256}.json`, '{"tampered":true}');
    expect((await running.json('/api/ghosts/lantern/pact/snapshot')).status).toBe(404);
  });

  it('(PACT 16.19, 16.20) the pack carries a verifyUrl with copy, hash and sealed time, and the page shows "Verify it"', async () => {
    running = await start({ archive: 'saving' });
    await running.json('/api/ghosts/lantern/check', 'POST');
    await running.json('/api/ghosts/lantern/pact', 'POST');
    running.fixtures.advance();
    const alert = (await running.json('/api/ghosts/lantern/check', 'POST')).body.result.alerts[0];
    const pack = (await running.json(`/api/ghosts/lantern/alerts/${alert.id}/dispute`)).body;
    const link = new URL(pack.pact.verifyUrl, 'http://page.local');
    expect(link.pathname).toBe('/verify');
    expect(link.searchParams.get('copy')).toBe('/api/ghosts/lantern/pact/snapshot');
    expect(link.searchParams.get('sha256')).toBe(alert.pact.sha256);
    expect(link.searchParams.get('sealed')).toBe(alert.pact.sealedAt);
    const html = renderDispute(pack);
    expect(html).toContain('>Verify it</a>');
    expect(html).toContain(`href="${pack.pact.verifyUrl.replace(/&/g, '&amp;')}"`);
    expect(renderDispute({ ...pack, pact: { ...pack.pact, verifyUrl: undefined } })).not.toContain('Verify it');
  });
});

/** A ghost view shaped like the API's, with the pact fields the renderer reads. */
const ghost = (extra: Record<string, unknown> = {}) => ({
  id: 'lantern',
  name: 'Lanternfield Everyday Checking',
  subtitle: 'Lanternfield Savings',
  url: 'http://127.0.0.1:9/offer',
  state: 'dormant',
  checking: false,
  unread: 0,
  loudest: null,
  lastAttemptAt: null,
  lastMessage: 'First sighting recorded.',
  ignored: 0,
  readings: [],
  headline: null,
  fickleness: null,
  ...extra,
});

const SEALED = {
  state: 'sealed',
  sealedAt: '2026-10-10T14:15:02.000Z',
  sealedDate: 'Oct 10, 2026',
  snapshotTakenAt: '2026-10-10T14:10:00.000Z',
  sha256: '9b1f4c07'.padEnd(60, 'a') + 'e4a2',
  shortHash: '9b1f4c07…e4a2',
  archive: { archiveUrl: null, archivedAt: null, archivedBy: null, note: 'Archiving is off; the snapshot hash is the pact.' },
  seeded: false,
};

describe('pact rendering (string level)', () => {
  it('(PACT 10.1) a stone with a snapshot and no pact shows "I applied today" named for the watch', () => {
    const html = renderGhostCard(ghost({ pact: null, canSeal: true }));
    expect(html).toContain('data-action="pact-seal"');
    expect(html).toContain('>I applied today</button>');
    expect(html).toContain('aria-label="I applied today: seal the pact for Lanternfield Everyday Checking"');
    expect(html).not.toMatch(/data-action="pact-seal"[^>]*disabled/);
  });

  it('(PACT 10.2) a stone with no snapshot disables the button and describes why', () => {
    const html = renderGhostCard(ghost({ pact: null, canSeal: false }));
    expect(html).toMatch(/data-action="pact-seal"[^>]*disabled aria-describedby="pact-why-lantern"/);
    expect(html).toContain('id="pact-why-lantern">Not seen yet. Summon the ghost first.');
  });

  it('(PACT 10.3) a sealed stone shows "Pact sealed", the compact date and the short hash, and a demo tag when seeded', () => {
    const html = renderGhostCard(ghost({ pact: SEALED, canSeal: true }));
    expect(html).toContain('Pact sealed');
    expect(html).toContain('Oct 10 &#39;26');
    expect(html).toContain('9b1f4c07…e4a2');
    expect(html).not.toContain('data-action="pact-seal"');
    expect(html).not.toContain('class="pact-demo"');
    expect(renderGhostCard(ghost({ pact: { ...SEALED, seeded: true }, canSeal: true }))).toContain('class="pact-demo">demo</span>');
  });

  it('(PACT 10.4) a corrupt pact shows "Pact unreadable" in words', () => {
    const html = renderGhostCard(ghost({ pact: { state: 'corrupt', reason: 'bad' }, canSeal: true }));
    expect(html).toContain('Pact unreadable');
  });

  it('(PACT 11.5) a stone from an app without pacts renders as before', () => {
    const html = renderGhostCard(ghost());
    expect(html).not.toContain('pact');
    expect(html).not.toContain('I applied today');
  });

  const detail = (extra: Record<string, unknown> = {}) => ({
    ...ghost({ canSeal: true }),
    interval: 'at most every 6 h',
    nextEligibleAt: null,
    checks: 2,
    rules: [],
    fields: [
      { name: 'bonus', label: 'Bonus', now: '$450', before: '$300', changed: true, long: false, segments: null, pact: '$300' },
      { name: 'fee', label: 'Annual fee', now: '$0', before: '$0', changed: false, long: false, segments: null, pact: '$0' },
    ],
    lists: [],
    alerts: [],
    past: null,
    pact: SEALED,
    ...extra,
  });

  it('(PACT 10.9, 10.10) the séance shows the pact section and the "The day you applied" column', () => {
    const html = renderDetail(detail(), '2026-11-19T10:00:00Z');
    expect(html).toContain('<h3 id="pact-title">The pact');
    expect(html).toContain('Oct 10, 2026');
    expect(html).toContain(SEALED.sha256);
    expect(html).toContain('hashes only');
    expect(html).toContain('<th scope="col">The day you applied</th>');
    expect(html).toContain('data-pact-differs="true"');
    expect(html.match(/data-pact-differs="true"/g)).toHaveLength(1);
    expect(html).toContain('data-action="pact-ask-replace"');
    expect(html).toContain('data-action="pact-ask-break"');
    expect(html).toContain('aria-label="Break the pact for Lanternfield Everyday Checking"');
    expect(renderDetail(detail({ pact: { ...SEALED, seeded: true } }))).toContain('demo pact');
  });

  it('(PACT 10.9) a ghost with no pact offers "I applied today" in the séance, and no column', () => {
    const html = renderDetail(detail({ pact: null }));
    expect(html).toContain('No pact yet. Seal one on the day you apply.');
    expect(html).toContain('aria-label="I applied today: seal the pact for Lanternfield Everyday Checking"');
    expect(html).not.toContain('The day you applied</th>');
  });

  it('(PACT 10.4, 10.9) a corrupt pact is explained and can be sealed again without a question', () => {
    const html = renderDetail(detail({ pact: { state: 'corrupt', reason: 'the pact snapshot is missing' }, fields: [] }));
    expect(html).toContain('The pact cannot be read: the pact snapshot is missing.');
    expect(html).toContain('data-action="pact-seal"');
    expect(html).toContain('>Seal again</button>');
  });

  it('(PACT 10.7) the confirmation names the question and offers "Keep it"', () => {
    const replace = renderDetail(detail(), undefined, { confirm: 'replace' });
    expect(replace).toContain('role="group"');
    expect(replace).toContain('Replace the pact sealed Oct 10, 2026?');
    expect(replace).toContain('data-action="pact-confirm-replace"');
    expect(replace).toContain('data-action="pact-cancel"');
    expect(replace).toContain('>Keep it</button>');
    const broken = renderDetail(detail(), undefined, { confirm: 'break' });
    expect(broken).toContain('Break the pact sealed Oct 10, 2026?');
    expect(broken).toContain('>Yes, break</button>');
    expect(renderDetail(detail())).not.toContain('role="group"');
  });

  const pactNote = 'On Oct 10, 2026, the day you applied, the bonus was $300; it is now $450 (+$150).';
  const alert = (pact: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}) => ({
    id: 'a1',
    watchId: 'lantern',
    watchName: 'Lanternfield Everyday Checking',
    severity: 'shriek',
    tone: 'good',
    summary: 'Bonus went up from $300 to $450 (+$150).',
    createdAt: '2026-11-19T10:00:00Z',
    ruleLabel: 'bonus went up',
    receipt: { before: { sha256: 'a'.repeat(64) }, after: { sha256: 'b'.repeat(64) }, archiveUrl: null },
    ...(pact ? { pact } : {}),
    ...extra,
  });
  const matchPact = { relation: 'differs', tone: 'good', note: pactNote };

  it('(PACT 10.11) Spirit mail and the haunting log show the pact note, and the match button says "Ask for the match"', () => {
    const state = { app: { demo: false, disputes: true, quiet: '' }, generatedAt: '2026-11-19T10:00:00Z', feed: [{ alert: alert(matchPact), acknowledged: false, letter: null }], archive: [] };
    const feed = renderFeed(state);
    expect(feed).toContain(pactNote);
    expect(feed).toContain('>Ask for the match</button>');
    expect(feed).toContain('aria-label="Ask for the match: bonus match letter for Lanternfield Everyday Checking"');
    const log = renderDetail(detail({ alerts: [{ ...alert(matchPact), acknowledged: false, letter: null }] }), undefined, { disputes: true });
    expect(log).toContain(pactNote);
    expect(log).toContain('>Ask for the match</button>');
  });

  it('(PACT 10.11) a bad change or a bait and switch keeps "Raise the dead", and an alert with no pact is untouched', () => {
    const bad = renderFeed({ app: { disputes: true }, generatedAt: '2026-11-19T10:00:00Z', feed: [{ alert: alert({ relation: 'differs', tone: 'bad', note: 'x' }), acknowledged: false, letter: null }], archive: [] });
    expect(bad).toContain('>Raise the dead</button>');
    const stealth = renderFeed({ app: { disputes: true }, generatedAt: '2026-11-19T10:00:00Z', feed: [{ alert: alert(matchPact, { stealth: 'Fine print changed.' }), acknowledged: false, letter: null }], archive: [] });
    expect(stealth).toContain('>Raise the dead</button>');
    const none = renderFeed({ app: { disputes: true }, generatedAt: '2026-11-19T10:00:00Z', feed: [{ alert: alert(undefined), acknowledged: false, letter: null }], archive: [] });
    expect(none).not.toContain('pact-note');
    expect(none).toContain('>Raise the dead</button>');
  });

  const pack = (pact: Record<string, unknown> | undefined) => ({
    alertId: 'a1',
    watchId: 'lantern',
    watchName: 'Lanternfield Everyday Checking',
    kind: 'Shriek',
    before: ['Bonus: $300'],
    after: ['Bonus: $450'],
    beforeDate: pact ? 'Oct 10, 2026' : 'Nov 18, 2026',
    afterDate: 'Nov 19, 2026',
    letter: { subject: 'Subject line', body: 'Body' },
    evidence: [{ label: 'Exhibit A SHA-256', value: 'f'.repeat(64) }],
    complaint: { url: 'https://www.consumerfinance.gov/complaint/', product: 'P', issue: 'I', subIssue: 'S', whatHappened: 'What', desiredResolution: 'Fair' },
    blanks: pact ? ['[Your name]', '[Your address]', '[Last 4 digits of the account]'] : ['[Your name]', '[Your address]', '[Date you applied]', '[Last 4 digits of the account]'],
    ...(pact ? { pact } : {}),
  });

  it('(PACT 10.13) titles the pack "Bonus match" or "Dispute pack" and dates its columns from the pact', () => {
    const match = renderDispute(pack({ variant: 'match', relation: 'differs' }));
    expect(match).toContain('Bonus match: Lanternfield Everyday Checking');
    expect(match).toContain('Oct 10, 2026, the day you applied: what the page promised');
    expect(match).toContain('Nov 19, 2026: what it says now');
    expect(match).not.toContain('CFPB');
    expect(match).not.toContain('[Date you applied]');
    const dispute = renderDispute(pack({ variant: 'dispute', relation: 'differs' }));
    expect(dispute).toContain('Dispute pack: Lanternfield Everyday Checking');
    expect(dispute).toContain('Oct 10, 2026, the day you applied: what the page promised');
    expect(dispute).toContain('CFPB');
    const restored = renderDispute(pack({ variant: 'dispute', relation: 'restored' }));
    expect(restored).toContain('what the page said');
    expect(restored).not.toContain('what the page promised');
  });

  it('(PACT 10.13) a pack without pack.pact renders as before', () => {
    const html = renderDispute(pack(undefined));
    expect(html).toContain('Dispute pack: Lanternfield Everyday Checking');
    expect(html).toContain('Nov 18, 2026: what the page said');
    expect(html).toContain('[Date you applied]');
    expect(html).toContain('3. If the bank says no: a CFPB complaint');
    expect(html).not.toContain('data-variant');
    expect(html).not.toContain('the day you applied: what the page');
  });

  it('(PACT 11.3) a hostile watch name, archive note and reason are escaped everywhere', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const note = '"><script>alert(2)</script>';
    const hostile = { ...SEALED, archive: { archiveUrl: null, archivedAt: null, archivedBy: evil, note } };
    const html = [
      renderGhostCard(ghost({ name: evil, pact: hostile, canSeal: true })),
      renderGhostCard(ghost({ name: evil, pact: null, canSeal: true })),
      renderGhostCard(ghost({ name: evil, pact: { state: 'corrupt', reason: note } })),
      renderDetail(detail({ name: evil, pact: hostile }), undefined, { confirm: 'break' }),
      renderDetail(detail({ name: evil, pact: { state: 'corrupt', reason: note } })),
      renderDetail(detail({ name: evil, pact: { ...hostile, archive: { ...hostile.archive, archiveUrl: 'javascript:alert(3)"' } } })),
      renderFeed({ app: { disputes: true }, generatedAt: '2026-11-19T10:00:00Z', feed: [{ alert: alert({ relation: 'differs', tone: 'good', note }, { watchName: evil }), acknowledged: false, letter: null }], archive: [] }),
      renderDispute({ ...pack({ variant: 'match', relation: 'differs' }), watchName: evil, beforeDate: evil, blanks: [evil] }),
    ].join('\n');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).not.toContain('javascript:alert(3)"');
  });
});
