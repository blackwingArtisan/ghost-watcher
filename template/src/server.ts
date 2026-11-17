/**
 * The ghost dashboard: a `node:http` server that renders the graveyard and exposes a small JSON API.
 *
 *   GET  /                              dashboard (server-rendered first paint)
 *   GET  /api/state                     every ghost plus the alert feed
 *   GET  /api/ghosts/:id                one ghost: values now and before, lists, rules, alert log
 *   POST /api/ghosts/:id/check          check now (skips the interval; robots.txt still applies)
 *   POST /api/ghosts/:id/acknowledge    lay the ghost to rest
 *   POST /api/check-all                 check every watch now
 *   GET  /outbox/:file.html             preview of a letter in the local outbox
 *   GET  /healthz                       liveness
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GhostDeps } from './config';
import { dashboardState, ghostDetail } from './view';
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

function json(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
}

export interface DashboardOptions {
  /** Extra CSS variables merged over the app theme. */
  themeOverrides?: Record<string, string>;
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

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (method === 'GET' && path === '/') {
      const state = await dashboardState(deps);
      send(res, 200, renderPage(state, { css: '/ui/style.css', theme }), 'text/html; charset=utf-8', {
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; frame-ancestors 'none'",
      });
      return;
    }
    if (method === 'GET' && path === '/healthz') return json(res, 200, { ok: true, app: deps.app.id });
    if (method === 'GET' && path === '/api/state') return json(res, 200, await dashboardState(deps));

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

    const ghostRoute = /^\/api\/ghosts\/([a-z0-9-]+)(?:\/(check|acknowledge))?$/.exec(path);
    if (ghostRoute) {
      const watch = deps.runner.watch(ghostRoute[1] ?? '');
      if (!watch) return json(res, 404, { error: 'No such ghost' });
      const action = ghostRoute[2];
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
      return { status: result.status, watchId: result.watchId, alerts: result.alerts, delivery: result.delivery ?? null, deliveryError: result.deliveryError ?? null };
    case 'unchanged':
    case 'baseline':
      return { status: result.status, watchId: result.watchId };
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
