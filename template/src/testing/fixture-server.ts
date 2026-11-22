/**
 * A local fixture site for demos and tests: serves numbered versions of pages plus a robots.txt, and
 * lets a test move every page to its next version. Apps never need a live site to prove they work.
 *
 *   POST /__fixture/advance        move every page to the next version
 *   POST /__fixture/reset          back to version 1, clear the request log and any outage
 *   POST /__fixture/version?n=2    jump to a version
 *   POST /__fixture/outage?on=1    answer 503 for every page (robots.txt keeps working)
 *   GET  /__fixture/log            every request received, with its User-Agent
 *   GET  /__fixture/state          current version and outage flag
 *
 * Sites with `past` versions also stand in for the Internet Archive's Wayback Machine, with the same
 * request and response shapes, so the Ghost of Terms Past can be demonstrated and tested offline:
 *
 *   GET  /__wayback/cdx/search/cdx?url=<url>&output=json&limit=-N   capture list (CDX JSON)
 *   GET  /__wayback/web/<timestamp>id_/<url>                        one archived copy
 *   GET  /__wayback/save/<url>                                      Save Page Now: keeps a copy of the
 *                                                                   page at the current version and
 *                                                                   redirects to it
 *   GET  /__wayback/save/<14-digit stamp>/<url>                     stand-in only: the same, but the copy
 *                                                                   is dated <stamp> (the demo's back-dated
 *                                                                   pact; the real archive cannot do this)
 */
import { createServer, type Server } from 'node:http';

export interface PageContext {
  /** 1-based version of the site being served. */
  version: number;
  /** Increments on every request, so pages can include noise (timestamps, nonces) that changes each time. */
  requestNumber: number;
  now: Date;
}

export interface FixturePage {
  path: string;
  title: string;
  /** Renders the page for a version. Versions beyond the last one keep serving the last. */
  render: (context: PageContext) => string;
}

export interface FixtureSite {
  name: string;
  robots: string;
  pages: FixturePage[];
  /** Highest version any page knows about. */
  versions: number;
  /**
   * Archived copies served by the stand-in Wayback endpoints: each renders every page at `version`
   * (zero or below, before the live site's version 1) as it looked at `capturedAt`.
   */
  past?: Array<{ version: number; capturedAt: string }>;
}

/** `2026-06-11T09:30:44Z` to `20260611093044`. */
function waybackStamp(iso: string): string {
  return iso.replace(/\.\d+Z$/, 'Z').replace(/[-:TZ]/g, '').slice(0, 14);
}

/** `20260611093044` to `2026-06-11T09:30:44Z`. */
function stampToIso(stamp: string): string {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`;
}

function pagePathOf(target: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(target) ? target : `http://${target}`).pathname;
  } catch {
    return null;
  }
}

export interface RequestRecord {
  method: string;
  path: string;
  userAgent: string;
  status: number;
  at: string;
}

/** A copy kept by the stand-in Save Page Now endpoint. */
export interface SavedCopy {
  stamp: string;
  path: string;
  version: number;
  capturedAt: string;
}

export interface FixtureServer {
  origin: string;
  server: Server;
  readonly version: number;
  readonly log: RequestRecord[];
  /** Copies kept by the stand-in Save Page Now endpoint, oldest first. */
  readonly saved: SavedCopy[];
  advance(): number;
  reset(): void;
  close(): Promise<void>;
}

function indexPage(site: FixtureSite, version: number): string {
  const links = site.pages
    .map((p) => `<li><a href="${p.path}">${p.title}</a> <code>${p.path}</code></li>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${site.name} fixture site</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#222}code{color:#666}</style></head>
<body><h1>${site.name}: local fixture site</h1><p>Invented pages for demos and tests. Serving version <b>${version}</b> of ${site.versions}.</p>
<ul>${links}</ul><form method="post" action="/__fixture/advance"><button>Advance to the next version</button></form></body></html>`;
}

export async function startFixtureServer(site: FixtureSite, options: { port?: number; host?: string } = {}): Promise<FixtureServer> {
  let version = 1;
  let outage = false;
  let requestNumber = 0;
  const log: RequestRecord[] = [];
  const saved: SavedCopy[] = [];
  const pages = new Map(site.pages.map((page) => [page.path, page]));

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture.local');
    const method = req.method ?? 'GET';
    const record = (status: number) => {
      if (!url.pathname.startsWith('/__fixture')) {
        log.push({ method, path: url.pathname + url.search, userAgent: String(req.headers['user-agent'] ?? ''), status, at: new Date().toISOString() });
      }
    };
    const reply = (status: number, body: string, type = 'text/html; charset=utf-8') => {
      record(status);
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    };

    if (url.pathname.startsWith('/__fixture/')) {
      const action = url.pathname.slice('/__fixture/'.length);
      if (method === 'GET' && action === 'log') return reply(200, JSON.stringify(log), 'application/json');
      if (method === 'GET' && action === 'state') return reply(200, JSON.stringify({ version, versions: site.versions, outage }), 'application/json');
      if (method === 'POST' && action === 'advance') {
        version = Math.min(site.versions, version + 1);
        if (String(req.headers.accept ?? '').includes('text/html')) {
          res.writeHead(303, { Location: '/' });
          return res.end();
        }
        return reply(200, JSON.stringify({ version }), 'application/json');
      }
      if (method === 'POST' && action === 'reset') {
        version = 1;
        outage = false;
        log.length = 0;
        saved.length = 0;
        return reply(200, JSON.stringify({ version }), 'application/json');
      }
      if (method === 'POST' && action === 'version') {
        const n = Number(url.searchParams.get('n'));
        if (Number.isInteger(n) && n >= 1 && n <= site.versions) version = n;
        return reply(200, JSON.stringify({ version }), 'application/json');
      }
      if (method === 'POST' && action === 'outage') {
        outage = url.searchParams.get('on') !== '0';
        return reply(200, JSON.stringify({ outage }), 'application/json');
      }
      return reply(404, 'Unknown fixture action', 'text/plain');
    }

    if (method === 'GET' && url.pathname === '/__wayback/cdx/search/cdx') {
      const path = pagePathOf(url.searchParams.get('url') ?? '');
      const page = path ? pages.get(path) : undefined;
      const original = `http://${req.headers.host ?? 'fixture.local'}${path ?? '/'}`;
      let rows = page ? (site.past ?? []).map((p) => [waybackStamp(p.capturedAt), original, '200']) : [];
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      const limit = Number(url.searchParams.get('limit') ?? '0');
      if (limit < 0) rows = rows.slice(limit);
      else if (limit > 0) rows = rows.slice(0, limit);
      const body = rows.length > 0 ? [['timestamp', 'original', 'statuscode'], ...rows] : [];
      return reply(200, JSON.stringify(body), 'application/json');
    }
    const save = /^\/__wayback\/save\/(?:(\d{14})\/)?(.+)$/.exec(url.pathname);
    if (method === 'GET' && save) {
      const target = `${save[2] ?? ''}${url.search}`;
      const path = pagePathOf(target);
      if (!path || !pages.has(path) || outage) return reply(path && pages.has(path) ? 503 : 404, '<h1>Could not save that page</h1>');
      const capturedAt = save[1] ? stampToIso(save[1]) : new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const copy: SavedCopy = { stamp: waybackStamp(capturedAt), path, version, capturedAt };
      saved.push(copy);
      record(302);
      res.writeHead(302, { Location: `/__wayback/web/${copy.stamp}/${target}`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    const archived = /^\/__wayback\/web\/(\d{14})(?:id_)?\/(.+)$/.exec(url.pathname);
    if (method === 'GET' && archived) {
      const path = pagePathOf(archived[2] ?? '');
      const page = path ? pages.get(path) : undefined;
      const past = (site.past ?? []).find((p) => waybackStamp(p.capturedAt) === archived[1]);
      const kept = [...saved].reverse().find((c) => c.stamp === archived[1] && c.path === path);
      const copy = kept ?? (past ? { version: past.version, capturedAt: past.capturedAt } : undefined);
      if (!copy || !page) return reply(404, '<h1>Not in the archive</h1>');
      requestNumber += 1;
      return reply(200, page.render({ version: copy.version, requestNumber, now: new Date(copy.capturedAt) }));
    }

    if (method !== 'GET' && method !== 'HEAD') return reply(405, 'Method not allowed', 'text/plain');
    if (url.pathname === '/robots.txt') return reply(200, site.robots, 'text/plain; charset=utf-8');
    if (url.pathname === '/') return reply(200, indexPage(site, version));
    const page = pages.get(url.pathname);
    if (!page) return reply(404, '<h1>Not found</h1>');
    if (outage) return reply(503, '<h1>Down for maintenance</h1>');
    requestNumber += 1;
    return reply(200, page.render({ version, requestNumber, now: new Date() }));
  });

  const host = options.host ?? '127.0.0.1';
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    origin: `http://${host}:${port}`,
    server,
    get version() {
      return version;
    },
    log,
    saved,
    advance() {
      version = Math.min(site.versions, version + 1);
      return version;
    },
    reset() {
      version = 1;
      outage = false;
      log.length = 0;
      saved.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
