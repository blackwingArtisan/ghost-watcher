/**
 * The ghost dashboard: a `node:http` server that renders the graveyard and exposes a small JSON API.
 *
 *   GET  /                              dashboard (server-rendered first paint)
 *   GET  /api/state                     every ghost plus the alert feed
 *   GET  /api/ghosts/:id                one ghost: values now and before, lists, rules, alert log
 *   POST /api/ghosts/:id/check          check now (skips the interval; robots.txt still applies)
 *   POST /api/ghosts/:id/acknowledge    lay the ghost to rest
 *   GET  /api/ghosts/:id/alerts/:alert/dispute   the dispute pack for a change that kept a receipt
 *   GET  /api/ghosts/:id/pact           the sealed pact (apps with `copy.pacts` only; 404 otherwise)
 *   POST /api/ghosts/:id/pact           seal the pact: "I applied today" (body `{}` or `{"confirmReplace":true}`)
 *   DELETE /api/ghosts/:id/pact         break the pact
 *   POST /api/check-all                 check every watch now
 *   POST /api/demo/next-night           demo mode only: advance the fixture site, then check every watch
 *   POST /api/demo/rewind               demo mode only: back to the first sighting
 *   GET  /outbox/:file.html             preview of a letter in the local outbox
 *   GET  /healthz                       liveness
 *
 * Every request must name an expected Host (loopback, or one listed in `allowedHosts`), and every
 * POST must come from the dashboard's own origin. See `guard.ts`.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GhostDeps } from './config';
import { allowedHostSet, checkRequest } from './guard';
import { disputePack } from './dispute';
import { disputesEnabledFor, pactEnabledFor, resolvePactVocabulary } from './pact-vocabulary';
import { breakPact, sealPact } from './sealing';
import { dashboardState, forDashboard, ghostDetail, pactViewOf, pactViewOfReading } from './view';
// The renderer is a plain ES module shared with the browser (no build step).
import { renderPage } from './ui/render.js';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const FONT_PACKAGES: Record<string, string> = {
  'pirata-one': '@fontsource/pirata-one',
  'ibm-plex-sans': '@fontsource/ibm-plex-sans',
  'ibm-plex-mono': '@fontsource/ibm-plex-mono',
};

const STATIC: Record<string, { file: string; type: string }> = {
  '/ui/app.js': { file: join(here, 'ui', 'app.js'), type: 'text/javascript; charset=utf-8' },
  '/ui/render.js': { file: join(here, 'ui', 'render.js'), type: 'text/javascript; charset=utf-8' },
  '/ui/style.css': { file: join(here, 'ui', 'style.css'), type: 'text/css; charset=utf-8' },
};

function fontPath(file: string): string | null {
  const match = /^((pirata-one|ibm-plex-sans|ibm-plex-mono)-latin-\d{3}-normal\.woff2)$/.exec(file);
  if (!match?.[2]) return null;
  const pkg = FONT_PACKAGES[match[2]];
  if (!pkg) return null;
  return join(dirname(require.resolve(pkg)), 'files', match[1] as string);
}

function send(res: ServerResponse, status: number, body: string | Buffer, type: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  });
  res.end(body);
}

/** Largest request body the pact routes accept. */
export const MAX_JSON_BODY_BYTES = 1024;

type JsonBody = { ok: true; value: Record<string, unknown> } | { ok: false; status: 400 | 413; error: string };

/**
 * Reads a small JSON object from the request. An empty body counts as `{}`. A body over `maxBytes`
 * is discarded as it arrives (never buffered) and reported as 413.
 */
export async function readJsonBody(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<JsonBody> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooBig = false;
  for await (const chunk of req) {
    const part = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += part.length;
    if (size > maxBytes) tooBig = true;
    if (!tooBig) chunks.push(part);
  }
  if (tooBig) return { ok: false, status: 413, error: `The request body is larger than ${maxBytes} bytes` };
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text === '') return { ok: true, value: {} };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: 'The request body is not valid JSON' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, status: 400, error: 'The request body must be a JSON object' };
  return { ok: true, value: value as Record<string, unknown> };
}

function json(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
}

export interface DashboardOptions {
  /** Extra CSS variables merged over the app theme. */
  themeOverrides?: Record<string, string>;
  /**
   * Hostnames, besides localhost and loopback addresses, that the dashboard answers to (for example
   * the public hostname of a deployed instance). Requests naming any other Host are refused.
   */
  allowedHosts?: readonly string[];
  /**
   * Demo mode only: moves the local fixture site to its next version, so a visitor can watch a
   * change happen from the dashboard. Returns the new version and whether anything moved.
   */
  demo?: DemoControls;
}

export interface DemoControls {
  nextNight(): { version: number; moved: boolean };
  /** Nights passed so far (0 at the first sighting). */
  night(): number;
  /** Back to the first sighting: the fixture site's first version and a fresh baseline. */
  rewind(): Promise<void>;
}

export function themeVariables(deps: GhostDeps): Record<string, string> {
  const { theme } = deps.app;
  return {
    accent: theme.accent,
    'accent-2': theme.accentSecondary,
    sky: theme.sky,
    moon: theme.moon ?? '#f3ecd2',
  };
}

export function createDashboardServer(deps: GhostDeps, options: DashboardOptions = {}): Server {
  const theme = { ...themeVariables(deps), ...options.themeOverrides };
  const allowedHosts = allowedHostSet(options.allowedHosts);
  const currentState = async () => {
    const state = await dashboardState(deps);
    return options.demo ? { ...state, app: { ...state.app, demo: true, night: options.demo.night() } } : state;
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    const verdict = checkRequest(req, allowedHosts);
    if (!verdict.ok) return json(res, 403, { error: verdict.reason });

    if (method === 'GET' && path === '/') {
      const state = await currentState();
      send(res, 200, renderPage(state, { css: '/ui/style.css', theme, demo: Boolean(options.demo) }), 'text/html; charset=utf-8', {
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; frame-ancestors 'none'",
      });
      return;
    }
    if (method === 'GET' && path === '/healthz') return json(res, 200, { ok: true, app: deps.app.id });
    if (method === 'GET' && path === '/api/state') return json(res, 200, await currentState());

    const staticFile = STATIC[path];
    if (method === 'GET' && staticFile) {
      send(res, 200, await readFile(staticFile.file), staticFile.type, { 'Cache-Control': 'no-cache' });
      return;
    }
    if (method === 'GET' && path.startsWith('/ui/fonts/')) {
      const file = fontPath(path.slice('/ui/fonts/'.length));
      if (!file) return json(res, 404, { error: 'Not found' });
      send(res, 200, await readFile(file), 'font/woff2', { 'Cache-Control': 'public, max-age=604800' });
      return;
    }
    if (method === 'GET' && path.startsWith('/outbox/')) {
      const name = decodeURIComponent(path.slice('/outbox/'.length));
      if (!deps.outbox || !/^[\w-]+\.html$/.test(name)) return json(res, 404, { error: 'Not found' });
      try {
        const html = await readFile(join(deps.outbox.dir, name), 'utf8');
        send(res, 200, html, 'text/html; charset=utf-8', { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
      } catch {
        json(res, 404, { error: 'No such letter' });
      }
      return;
    }

    if (method === 'POST' && path === '/api/check-all') {
      const results = await deps.runner.checkAll({ force: true });
      return json(res, 200, { results: results.map(publicResult) });
    }

    if (method === 'POST' && path === '/api/demo/rewind') {
      if (!options.demo) return json(res, 404, { error: 'Not found' });
      await options.demo.rewind();
      return json(res, 200, { night: options.demo.night() });
    }

    if (method === 'POST' && path === '/api/demo/next-night') {
      if (!options.demo) return json(res, 404, { error: 'Not found' });
      const night = options.demo.nextNight();
      const results = night.moved ? await deps.runner.checkAll({ force: true }) : [];
      return json(res, 200, { ...night, results: results.map(publicResult) });
    }

    const disputeRoute = /^\/api\/ghosts\/([a-z0-9-]+)\/alerts\/([a-z0-9-]+)\/dispute$/.exec(path);
    if (method === 'GET' && disputeRoute) {
      const watch = deps.runner.watch(disputeRoute[1] ?? '');
      if (!watch) return json(res, 404, { error: 'No such ghost' });
      const alert = (await deps.store.alerts(watch.id)).find((a) => a.id === disputeRoute[2]);
      const pack = alert && disputesEnabledFor(deps.app, watch) ? disputePack(alert, watch, resolvePactVocabulary(deps.app)) : null;
      if (!pack) return json(res, 404, { error: 'No receipt was kept for that change' });
      return json(res, 200, pack);
    }

    const ghostRoute = /^\/api\/ghosts\/([a-z0-9-]+)(?:\/(check|acknowledge|pact))?$/.exec(path);
    if (ghostRoute) {
      const watch = deps.runner.watch(ghostRoute[1] ?? '');
      if (!watch) return json(res, 404, { error: 'No such ghost' });
      const action = ghostRoute[2];
      if (action === 'pact') {
        if (!pactEnabledFor(deps.app, watch)) return json(res, 404, { error: 'Not found' });
        const sealDeps = { store: deps.store, clock: deps.clock, ...(deps.archive ? { archive: deps.archive } : {}) };
        if (method === 'GET') {
          const reading = await deps.store.pact(watch.id);
          if (reading.status === 'none') return json(res, 200, { state: 'none', pact: null });
          if (reading.status === 'corrupt') return json(res, 200, { state: 'corrupt', pact: pactViewOfReading(reading), reason: reading.reason });
          const { snapshot: _body, ...record } = reading.pact;
          return json(res, 200, { state: 'sealed', pact: pactViewOf(record) });
        }
        if (method === 'POST') {
          const body = await readJsonBody(req);
          if (!body.ok) return json(res, body.status, { error: body.error });
          const result = await sealPact(sealDeps, watch, { confirmReplace: body.value.confirmReplace === true });
          if (result.status === 'exists') return json(res, 409, { code: 'pact-exists', error: 'A pact already exists for this ghost', pact: pactViewOf(result.pact) });
          if (result.status === 'no-snapshot') return json(res, 409, { code: 'no-snapshot', error: 'This ghost has no reading to seal yet' });
          const { snapshot: _body, ...record } = result.pact;
          return json(res, 201, {
            state: 'sealed',
            replaced: result.replaced,
            pact: pactViewOf(record),
            archive: { saved: record.archive.archiveUrl !== null, note: record.archive.note ?? null },
          });
        }
        if (method === 'DELETE') {
          const { removed } = await breakPact(sealDeps, watch.id);
          return json(res, 200, { state: 'none', removed });
        }
        return json(res, 405, { error: 'Method not allowed' });
      }
      if (method === 'GET' && !action) return json(res, 200, await ghostDetail(deps, watch));
      if (method === 'POST' && action === 'check') {
        const result = await deps.runner.check(watch, { force: true });
        return json(res, 200, { result: publicResult(result) });
      }
      if (method === 'POST' && action === 'acknowledge') {
        const status = await deps.store.acknowledge(watch.id, deps.clock.now().toISOString());
        return json(res, 200, { acknowledgedAt: status.acknowledgedAt });
      }
      return json(res, 405, { error: 'Method not allowed' });
    }
    if (method === 'GET' && !path.startsWith('/api/') && (req.headers.accept ?? '').includes('text/html')) {
      send(res, 404, lostGhostPage(deps.app.name), 'text/html; charset=utf-8', {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'",
      });
      return;
    }
    json(res, 404, { error: 'Not found' });
  }

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) json(res, 500, { error: message });
      else res.end();
    });
  });
}

/** Strips bulky fields (full snapshots) from a check result before sending it to the browser. */
function publicResult(result: Awaited<ReturnType<GhostDeps['runner']['check']>>) {
  switch (result.status) {
    case 'changed':
      return {
        status: result.status,
        watchId: result.watchId,
        pageMoved: true,
        alerts: result.alerts.map(forDashboard),
        delivery: result.delivery ?? null,
        deliveryError: result.deliveryError ?? null,
      };
    case 'unchanged':
    case 'baseline':
      return { status: result.status, watchId: result.watchId, pageMoved: result.pageMoved };
    default:
      return result;
  }
}

export function listen(server: Server, port: number, host = '127.0.0.1'): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actual = typeof address === 'object' && address ? address.port : port;
      resolve(`http://${host}:${actual}`);
    });
  });
}

/** The page a browser gets for an address the dashboard does not know: a lost ghost and a way home. */
export function lostGhostPage(appName: string): string {
  const name = appName.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lost ghost · ${name}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 0%,#2a2145,#0c0a16 70%);color:#ece6ff;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
main{max-width:30rem}
svg{width:96px;height:auto;opacity:.85;animation:drift 4s ease-in-out infinite alternate}
h1{font:600 1.6rem/1.2 Georgia,serif;margin:.6em 0 .3em}
p{color:#b9b0d8;margin:.4em 0}
a{display:inline-block;margin-top:1em;padding:10px 18px;border-radius:999px;background:#7cf2b0;color:#0c0a16;font-weight:600;text-decoration:none}
a:focus-visible{outline:3px solid #fff;outline-offset:3px}
@keyframes drift{from{transform:translateY(4px)}to{transform:translateY(-6px)}}
@media (prefers-reduced-motion:reduce){svg{animation:none}}
</style>
</head>
<body>
<main>
<svg viewBox="0 0 120 142" aria-hidden="true"><path fill="#f4f0ff" d="M60 8C30 8 16 33 16 62V116q7-10 14 0t15 0 15 0 15 0 15 0 14 0V62C104 33 90 8 60 8Z"/><ellipse cx="44" cy="58" rx="7" ry="10" fill="#120f22"/><ellipse cx="76" cy="58" rx="7" ry="10" fill="#120f22"/><ellipse cx="60" cy="84" rx="8" ry="6" fill="#120f22"/></svg>
<h1>This ghost is lost</h1>
<p>Nothing haunts this address. The page may have moved, or the link was mistyped.</p>
<a href="/">Back to ${name}</a>
</main>
</body>
</html>`;
}
