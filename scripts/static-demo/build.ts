/**
 * Builds the Bonus Crypt as a static site that needs no server: a recorded demo for static hosting.
 *
 *   npx tsx scripts/static-demo/build.ts      (or: npm run build:static)   ->  dist/
 *
 * It starts the real bonus-watch demo on STATIC_PORT (default 4140) and the port after it, against a
 * throwaway data folder and the invented fixture site. Then it walks every path a visitor can take
 * (each night, and laying any restless ghost to rest along the way), records what every API route
 * answers at each stop, and writes the dashboard, its assets, the outbox letters and the recording
 * to dist/. `replay.js` answers the dashboard's API calls from that recording in the browser.
 * Nothing leaves the machine, and watching real pages still needs the Node server (`npm run bonus`).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const out = resolve(root, process.env.STATIC_OUT ?? 'dist');
const port = Number(process.env.STATIC_PORT ?? 4140);
const origin = `http://127.0.0.1:${port}`;
const fixtureOrigin = `http://127.0.0.1:${port + 1}`;
/** Where the static site is served; archived copies are linked absolutely, as the server links them. */
const siteUrl = (process.env.STATIC_SITE_URL ?? 'https://ghost-watcher.pages.dev').replace(/\/$/, '');

/** One stop on the recording: the ghosts laid to rest during each night so far, oldest night first. */
type Path = string[][];
const keyOf = (path: Path): string => path.map((night) => [...night].sort().join('+')).join('/');

interface ReplayNode {
  routes: Record<string, string>;
  next?: string;
  acks?: Record<string, string>;
}

const blobs = new Map<string, string>();
const files = new Map<string, string>();
/** Archived copies to save next to the page: site path -> address on the fixture site's archive. */
const archived = new Map<string, string>();

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const waybackRe = new RegExp(`${escapeRe(fixtureOrigin)}/__wayback/web/(\\d{14})/${escapeRe(fixtureOrigin)}(/[\\w/-]*)`, 'g');

/**
 * Fixture-site addresses are local to the build. Archived copies become files on the static site;
 * every other address points at the invented domain the fixture pages stand for.
 */
function portable(text: string): string {
  const withArchive = text.replace(waybackRe, (match, stamp: string, path: string) => {
    const file = `archive/${stamp}${path.replace(/\/$/, '') || '/index'}.html`;
    archived.set(file, match);
    return `${siteUrl}/${file}`;
  });
  return withArchive.split(fixtureOrigin).join('https://bonus-crypt.example');
}

function blob(value: unknown): string {
  const text = portable(JSON.stringify(value));
  const id = createHash('sha256').update(text).digest('hex').slice(0, 16);
  blobs.set(id, text);
  return id;
}

async function call(method: string, path: string): Promise<{ status: number; body: unknown; text: string }> {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(method === 'GET' ? {} : { Origin: origin, 'Content-Type': 'application/json' }) },
    ...(method === 'GET' ? {} : { body: '{}' }),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // HTML (the page, letters) stays text
  }
  if (!response.ok && response.status !== 404) throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
  return { status: response.status, body, text };
}

/** Puts the real demo at a stop: rewind, then each night's laying-to-rest and the night that follows. */
async function goTo(path: Path): Promise<unknown> {
  await call('POST', '/api/demo/rewind');
  let arrival: unknown;
  for (const [i, night] of path.entries()) {
    for (const id of night) await call('POST', `/api/ghosts/${id}/acknowledge`);
    if (i < path.length - 1) arrival = (await call('POST', '/api/demo/next-night')).body;
  }
  return arrival;
}

async function record(path: Path): Promise<{ node: ReplayNode; state: any }> {
  const arrival = await goTo(path);
  const routes: Record<string, string> = {};
  const state = (await call('GET', '/api/state')).body as any;
  routes['GET /api/state'] = blob(state);
  if (arrival !== undefined) routes.arrival = blob(arrival);

  const letters = new Set<string>();
  for (const entry of state.feed) if (entry.letter) letters.add(entry.letter);
  for (const ghost of state.ghosts) {
    const detail = (await call('GET', `/api/ghosts/${ghost.id}`)).body as any;
    routes[`GET /api/ghosts/${ghost.id}`] = blob(detail);
    if (state.app.pacts) routes[`GET /api/ghosts/${ghost.id}/pact`] = blob((await call('GET', `/api/ghosts/${ghost.id}/pact`)).body);
    for (const alert of detail.alerts) {
      if (alert.letter) letters.add(alert.letter);
      const pack = await call('GET', `/api/ghosts/${ghost.id}/alerts/${alert.id}/dispute`);
      if (pack.status === 200) routes[`GET /api/ghosts/${ghost.id}/alerts/${alert.id}/dispute`] = blob(pack.body);
    }
  }
  for (const letter of letters) files.set(`outbox/${letter}.html`, portable((await call('GET', `/outbox/${encodeURIComponent(letter)}.html`)).text));
  // Last, because a check updates each ghost's "last visited" time.
  routes['POST /api/check-all'] = blob((await call('POST', '/api/check-all')).body);
  await keepArchivedCopies();
  return { node: { routes }, state };
}

/** Saves each newly linked archived copy now: a rewind clears the fixture archive's saved pages. */
async function keepArchivedCopies(): Promise<void> {
  for (const [rel, address] of archived) {
    if (files.has(rel)) continue;
    const copy = await fetch(address);
    if (!copy.ok) throw new Error(`The fixture archive no longer holds ${address} (${copy.status})`);
    files.set(rel, portable(await copy.text()));
  }
}

/** Walks every stop reachable from the first sighting, breadth first. */
async function walk(): Promise<Record<string, ReplayNode>> {
  const nodes: Record<string, ReplayNode> = {};
  const queue: Path[] = [[[]]];
  while (queue.length > 0) {
    const path = queue.shift() as Path;
    const key = keyOf(path);
    if (nodes[key]) continue;
    const { node, state } = await record(path);
    nodes[key] = node;
    const tonight = path[path.length - 1] as string[];
    for (const ghost of state.ghosts) {
      if (ghost.state !== 'restless' || tonight.includes(ghost.id)) continue;
      const next: Path = [...path.slice(0, -1), [...tonight, ghost.id]];
      node.acks = { ...node.acks, [ghost.id]: keyOf(next) };
      queue.push(next);
    }
    const night = state.app.night as number;
    const probe = (await call('POST', '/api/demo/next-night')).body as { moved: boolean };
    if (probe.moved) {
      const next: Path = [...path, []];
      node.next = keyOf(next);
      queue.push(next);
    }
    process.stdout.write(`Recorded night ${night}${tonight.length ? `, laid to rest: ${tonight.join(', ')}` : ''}\n`);
  }
  return nodes;
}

async function waitForDashboard(): Promise<void> {
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(`${origin}/healthz`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`The demo did not start on port ${port}.`);
}

async function stop(demo: ChildProcess): Promise<void> {
  if (demo.exitCode !== null) return;
  const exited = new Promise((r) => demo.once('exit', r));
  demo.kill();
  await exited;
}

const work = await mkdtemp(join(tmpdir(), 'ghost-static-'));
const demo = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts', 'demo', '--port', String(port), '--fixture-port', String(port + 1)], {
  cwd: join(root, 'apps', 'bonus-watch'),
  env: { ...process.env, GHOST_DATA_DIR: join(work, 'data'), GHOST_HOST_GAP_MS: '0', GHOST_FRESH: '1' },
  stdio: 'ignore',
});
try {
  await waitForDashboard();
  const nodes = await walk();
  await goTo([[]]);
  const page = (await call('GET', '/')).text;
  const css = (await call('GET', '/ui/style.css')).text;

  await rm(out, { recursive: true, force: true });
  const write = async (rel: string, content: string | Buffer) => {
    await mkdir(dirname(join(out, rel)), { recursive: true });
    await writeFile(join(out, rel), content);
  };
  await write('index.html', portable(page).replace('<script type="module" src="/ui/app.js">', '<script type="module" src="/ui/shim.js"></script>\n<script type="module" src="/ui/app.js">'));
  await write('ui/style.css', css);
  for (const name of ['app.js', 'render.js']) await write(`ui/${name}`, (await call('GET', `/ui/${name}`)).text);
  for (const font of css.matchAll(/url\('\/ui\/fonts\/([\w-]+\.woff2)'\)/g)) {
    const response = await fetch(`${origin}/ui/fonts/${font[1]}`);
    await write(`ui/fonts/${font[1]}`, Buffer.from(await response.arrayBuffer()));
  }
  await cp(join(root, 'scripts', 'static-demo', 'shim.js'), join(out, 'ui', 'shim.js'));
  await cp(join(root, 'scripts', 'static-demo', 'replay.js'), join(out, 'ui', 'replay.js'));
  for (const [rel, content] of files) await write(rel, content);
  for (const [id, text] of blobs) await write(`replay/${id}.json`, text);
  await write('replay/manifest.json', JSON.stringify({ root: keyOf([[]]), nodes }));
  await write(
    '_headers',
    [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: no-referrer',
      "  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; frame-ancestors 'none'",
      '',
    ].join('\n'),
  );
  process.stdout.write(`Wrote ${Object.keys(nodes).length} recorded stops and ${blobs.size} responses to ${out}\n`);
} finally {
  await stop(demo);
  await rm(work, { recursive: true, force: true });
}
