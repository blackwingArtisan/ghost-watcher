/**
 * The command line every app shares:
 *
 *   check [--force] [--watch <id>] [--json]   check watches once (respects intervals unless --force)
 *   serve [--port <n>] [--fresh]              run the dashboard and a polite scheduler
 *   demo  [--port <n>] [--fixture-port <n>] [--open]
 *                                             start the app's local fixture site, then serve against it;
 *                                             --open opens the night view in the default browser
 *   list                                      print the watches
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GhostApp } from './app';
import { loadDeps, type Env } from './config';
import type { CheckResult } from './runner';
import { parseHostList } from './guard';
import { createDashboardServer, listen } from './server';
import { pactEnabledFor, resolvePactVocabulary } from './pact-vocabulary';
import { seedDemoPacts } from './sealing';
import type { FixtureServer } from './testing/fixture-server';

export interface CliOptions {
  /** Builds the app. `siteOrigin` lets demo apps point their watches at a local fixture site. */
  buildApp: (env: Env) => GhostApp;
  defaultPort: number;
  /** For `demo`: starts the app's fixture site and returns it. */
  startFixtures?: (port: number) => Promise<FixtureServer>;
  defaultFixturePort?: number;
  /** Environment variable the app reads for its site origin (set by `demo`). */
  siteOriginVar?: string;
  env?: Env;
  out?: (line: string) => void;
}

interface Flags {
  command: string;
  force: boolean;
  json: boolean;
  fresh: boolean;
  open?: boolean;
  watch?: string;
  port?: number;
  fixturePort?: number;
}

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = { command: argv[0] ?? 'help', force: false, json: false, fresh: false };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      i += 1;
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    if (arg === '--force') flags.force = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--fresh') flags.fresh = true;
    else if (arg === '--open') flags.open = true;
    else if (arg === '--watch') flags.watch = next();
    else if (arg === '--port') flags.port = Number(next());
    else if (arg === '--fixture-port') flags.fixturePort = Number(next());
    else throw new Error(`Unknown option ${arg}`);
  }
  return flags;
}

const ICON: Record<CheckResult['status'], string> = {
  baseline: '·',
  unchanged: '·',
  changed: '!',
  skipped: '~',
  blocked: 'x',
  error: '?',
};

export function describeResult(result: CheckResult, name: string): string {
  const head = `${ICON[result.status]} ${name}`;
  switch (result.status) {
    case 'baseline':
      return `${head}: first sighting recorded`;
    case 'unchanged':
      return `${head}: nothing new${result.pageMoved ? ' (the page changed; ignored as noise)' : ''}`;
    case 'changed':
      return [`${head}: ${result.alerts.length} change(s)`, ...result.alerts.map((a) => `    - ${a.summary}`), result.delivery ? `    delivered via ${result.delivery.channel}: ${result.delivery.reference}` : `    delivery failed: ${result.deliveryError}`].join('\n');
    case 'skipped':
      return `${head}: resting until ${result.nextEligibleAt} (${result.reason})`;
    case 'blocked':
      return `${head}: robots.txt says no (${result.robotsUrl})`;
    case 'error':
      return `${head}: ${result.message}`;
  }
}

export async function runCli(argv: string[], options: CliOptions): Promise<number> {
  const out = options.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const env: Env = { ...(options.env ?? process.env) };
  const flags = parseFlags(argv);

  let fixtures: FixtureServer | undefined;
  if (flags.command === 'demo') {
    if (!options.startFixtures) throw new Error('This app has no fixture site for demo mode.');
    fixtures = await options.startFixtures(flags.fixturePort ?? options.defaultFixturePort ?? 0);
    if (options.siteOriginVar) env[options.siteOriginVar] = fixtures.origin;
    env.GHOST_INTERVAL_MINUTES ??= '0';
    // The fixture site also stands in for the Internet Archive, so the first sighting fills the
    // Ghost of Terms Past without leaving this machine.
    env.GHOST_HISTORY ??= 'wayback';
    env.GHOST_HISTORY_BASE ??= `${fixtures.origin}/__wayback`;
    // ...and for Save Page Now, so every shriek in the demo carries an archived receipt.
    env.GHOST_RECEIPTS ??= 'archive';
    env.GHOST_ARCHIVE_BASE ??= `${fixtures.origin}/__wayback`;
    out(`Fixture site (invented pages) at ${fixtures.origin}  (POST ${fixtures.origin}/__fixture/advance to change it)`);
  }

  const app = options.buildApp(env);
  if (flags.command === 'list') {
    for (const watch of app.watches) out(`${watch.id}\t${watch.name}\t${watch.url}`);
    return 0;
  }

  if (flags.fresh || flags.command === 'demo') {
    const dataDir = resolve(env.GHOST_DATA_DIR ?? '.ghost-data');
    if (flags.fresh || env.GHOST_FRESH === '1') await rm(dataDir, { recursive: true, force: true });
  }
  const deps = await loadDeps(app, { env });

  if (flags.command === 'check') {
    const watches = flags.watch ? deps.app.watches.filter((w) => w.id === flags.watch) : deps.app.watches;
    if (watches.length === 0) {
      out(`No watch with id "${flags.watch}".`);
      return 2;
    }
    const results: CheckResult[] = [];
    for (const watch of watches) {
      const result = await deps.runner.check(watch, { force: flags.force });
      results.push(result);
      if (!flags.json) out(describeResult(result, watch.name));
    }
    if (flags.json) out(JSON.stringify(results.map((r) => ('snapshot' in r ? { ...r, snapshot: undefined } : r)), null, 2));
    return results.some((r) => r.status === 'error') ? 1 : 0;
  }

  if (flags.command === 'serve' || flags.command === 'demo') {
    const site = fixtures;
    if (flags.command === 'demo') {
      // Take the first sighting now, so the visitor's first click already shows a change.
      const baseline = await deps.runner.checkAll({ force: true });
      out(`First sighting taken for ${baseline.filter((r) => r.status === 'baseline').length} of ${baseline.length} pages.`);
      // The demo reader "applied" 40 days ago, so the first night already has a pact to quote.
      if (deps.app.copy.pacts) await seedDemoPacts(deps, deps.app.watches.filter((w) => pactEnabledFor(deps.app, w)), { ageDays: resolvePactVocabulary(deps.app).demoAgeDays, skip: deps.app.copy.demoUnsealed ?? [] });
    }
    const server = createDashboardServer(deps, {
      allowedHosts: [...parseHostList(env.GHOST_ALLOWED_HOSTS), ...parseHostList(env.RENDER_EXTERNAL_HOSTNAME)],
      ...(site
        ? {
            demo: {
              nextNight: () => {
                const before = site.version;
                const version = site.advance();
                return { version, moved: version !== before };
              },
              night: () => site.version - 1,
              rewind: async () => {
                site.reset();
                await deps.store.clear();
                await deps.runner.checkAll({ force: true });
                if (deps.app.copy.pacts) await seedDemoPacts(deps, deps.app.watches.filter((w) => pactEnabledFor(deps.app, w)), { ageDays: resolvePactVocabulary(deps.app).demoAgeDays, skip: deps.app.copy.demoUnsealed ?? [] });
              },
            },
          }
        : {}),
    });
    const url = await listen(server, flags.port ?? Number(env.PORT ?? options.defaultPort), env.HOST ?? '127.0.0.1');
    out(`${deps.app.name} is haunting ${deps.app.watches.length} pages at ${url}`);
    if (site) {
      out(`Open ${url}/?night=1 to watch one night pass as the page loads (or ${url} to start calm).`);
      if (flags.open) openInBrowser(`${url}/?night=1`);
    }
    out(`User-Agent: ${deps.describe.userAgent}`);
    out(`Snapshots: ${deps.describe.store} | Alerts: ${deps.describe.alerts} | History: ${deps.describe.history} | Receipts: ${deps.describe.receipts}`);

    const tickSeconds = Number(env.GHOST_TICK_SECONDS ?? 300);
    let timer: NodeJS.Timeout | undefined;
    if (tickSeconds > 0 && flags.command === 'serve') {
      timer = setInterval(() => {
        void deps.runner.checkAll().catch((error: unknown) => out(`Scheduled check failed: ${String(error)}`));
      }, tickSeconds * 1000);
      out(`Scheduler: every ${tickSeconds}s, each page at most ${deps.app.watches[0] ? Math.round(deps.app.watches[0].intervalMs / 60000) : 0} min apart`);
    }
    const shutdown = () => {
      if (timer) clearInterval(timer);
      server.closeAllConnections?.();
      server.close();
      void fixtures?.close();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    await new Promise<void>((done) => server.once('close', () => done()));
    return 0;
  }

  out('Usage: check [--force] [--watch <id>] [--json] | serve [--port <n>] [--fresh] | demo | list');
  return flags.command === 'help' ? 0 : 2;
}

/** Opens a local dashboard address in the default browser; a missing opener is not an error. */
function openInBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    const child = spawn(command, args as string[], { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // No browser opener on this machine: the printed address is enough.
  }
}
