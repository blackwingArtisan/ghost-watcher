/**
 * Environment-driven wiring. Every adapter defaults to its free local version; cloud adapters are
 * loaded (with a dynamic import) only when their variable selects them.
 *
 *   GHOST_DATA_DIR         where local data lives (default ./.ghost-data)
 *   GHOST_STORE            file (default) | memory | s3      (s3 needs GHOST_S3_BUCKET)
 *   GHOST_ALERTS           outbox (default) | console | ses  (ses needs GHOST_SES_FROM)
 *   GHOST_ALERT_TO         comma-separated recipients (defaults to the app's invented demo address)
 *   GHOST_CONTACT_URL      contact URL sent in the User-Agent (defaults to the app's)
 *   GHOST_INTERVAL_MINUTES override every watch's minimum check interval
 *   GHOST_HOST_GAP_MS      minimum gap between requests to one host (default 1000)
 *   GHOST_TIMEOUT_MS       request timeout (default 15000)
 */
import { join, relative, resolve } from 'node:path';
import type { GhostApp } from './app';
import { systemClock, type Clock } from './clock';
import { PoliteFetcher, buildUserAgent, type Fetcher } from './fetcher';
import { ConsoleAlertSink, FanOutAlertSink, OutboxAlertSink } from './alerts/sinks';
import type { AlertSink } from './alerts/types';
import { FileBlobStore, MemoryBlobStore, type BlobStore } from './store/blob';
import { GhostStore } from './store/ghost-store';
import { Runner } from './runner';

export type Env = Record<string, string | undefined>;

export interface GhostDeps {
  app: GhostApp;
  dataDir: string;
  fetcher: Fetcher;
  store: GhostStore;
  sink: AlertSink;
  /** The local outbox, when outbox delivery is enabled (the dashboard links to its previews). */
  outbox?: OutboxAlertSink;
  clock: Clock;
  runner: Runner;
  describe: { store: string; alerts: string; userAgent: string };
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function int(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new ConfigError(`${name} must be a non-negative number, got "${raw}".`);
  return value;
}

async function makeBlobStore(env: Env, app: GhostApp, dataDir: string): Promise<{ blobs: BlobStore; label: string }> {
  const kind = env.GHOST_STORE ?? 'file';
  switch (kind) {
    case 'file': {
      const root = join(dataDir, 'store');
      const shown = relative(process.cwd(), root);
      return { blobs: new FileBlobStore(root), label: `local files (${shown.startsWith('..') ? 'data dir' : shown})` };
    }
    case 'memory':
      return { blobs: new MemoryBlobStore(), label: 'in memory' };
    case 's3': {
      const bucket = env.GHOST_S3_BUCKET;
      if (!bucket) throw new ConfigError('GHOST_STORE=s3 needs GHOST_S3_BUCKET.');
      const { S3BlobStore } = await import('./store/s3');
      const prefix = env.GHOST_S3_PREFIX ?? `ghost-watcher/${app.id}/`;
      return {
        blobs: new S3BlobStore({ bucket, prefix, clientConfig: env.AWS_REGION ? { region: env.AWS_REGION } : {} }),
        label: `s3 (s3://${bucket}/${prefix})`,
      };
    }
    default:
      throw new ConfigError(`GHOST_STORE must be file, memory or s3, got "${kind}".`);
  }
}

async function makeSink(env: Env, dataDir: string): Promise<{ sink: AlertSink; outbox?: OutboxAlertSink; label: string }> {
  const kinds = (env.GHOST_ALERTS ?? 'outbox').split(',').map((k) => k.trim()).filter(Boolean);
  const sinks: AlertSink[] = [];
  let outbox: OutboxAlertSink | undefined;
  for (const kind of kinds) {
    if (kind === 'outbox') {
      outbox = new OutboxAlertSink(join(dataDir, 'outbox'));
      sinks.push(outbox);
    } else if (kind === 'console') {
      sinks.push(new ConsoleAlertSink());
    } else if (kind === 'ses') {
      const from = env.GHOST_SES_FROM;
      if (!from) throw new ConfigError('GHOST_ALERTS=ses needs GHOST_SES_FROM (a verified SES identity).');
      const { SesEmailAlertSink } = await import('./alerts/ses');
      sinks.push(
        new SesEmailAlertSink({
          from,
          ...(env.GHOST_SES_CONFIGURATION_SET ? { configurationSetName: env.GHOST_SES_CONFIGURATION_SET } : {}),
          clientConfig: env.AWS_REGION ? { region: env.AWS_REGION } : {},
        }),
      );
    } else {
      throw new ConfigError(`GHOST_ALERTS entries must be outbox, console or ses, got "${kind}".`);
    }
  }
  if (sinks.length === 0) throw new ConfigError('GHOST_ALERTS selects no alert sink.');
  const sink = sinks.length === 1 ? (sinks[0] as AlertSink) : new FanOutAlertSink(sinks);
  return { sink, ...(outbox ? { outbox } : {}), label: kinds.join(' + ') };
}

export interface LoadOptions {
  env?: Env;
  cwd?: string;
  clock?: Clock;
  fetcher?: Fetcher;
}

/** Builds the full dependency bundle for an app from environment variables. */
export async function loadDeps(baseApp: GhostApp, options: LoadOptions = {}): Promise<GhostDeps> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const clock = options.clock ?? systemClock;
  const dataDir = resolve(cwd, env.GHOST_DATA_DIR ?? '.ghost-data');

  const contactUrl = env.GHOST_CONTACT_URL ?? baseApp.contactUrl;
  if (!contactUrl) throw new ConfigError('Set GHOST_CONTACT_URL: the watcher must identify itself to the sites it visits.');
  const userAgent = buildUserAgent({ version: baseApp.version, contactUrl });

  const intervalOverride = env.GHOST_INTERVAL_MINUTES;
  const app: GhostApp = {
    ...baseApp,
    contactUrl,
    alertTo: env.GHOST_ALERT_TO ? env.GHOST_ALERT_TO.split(',').map((s) => s.trim()).filter(Boolean) : baseApp.alertTo,
    watches:
      intervalOverride === undefined || intervalOverride === ''
        ? baseApp.watches
        : baseApp.watches.map((w) => ({ ...w, intervalMs: int(env, 'GHOST_INTERVAL_MINUTES', 0) * 60_000 })),
  };

  const fetcher =
    options.fetcher ??
    new PoliteFetcher({
      userAgent,
      clock,
      minHostGapMs: int(env, 'GHOST_HOST_GAP_MS', 1000),
      timeoutMs: int(env, 'GHOST_TIMEOUT_MS', 15_000),
    });
  const { blobs, label: storeLabel } = await makeBlobStore(env, app, dataDir);
  const store = new GhostStore(blobs);
  const { sink, outbox, label: alertLabel } = await makeSink(env, dataDir);
  const runner = new Runner({ app, fetcher, store, sink, clock });

  return {
    app,
    dataDir,
    fetcher,
    store,
    sink,
    ...(outbox ? { outbox } : {}),
    clock,
    runner,
    describe: { store: storeLabel, alerts: alertLabel, userAgent },
  };
}
