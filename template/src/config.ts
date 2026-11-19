/**
 * Environment-driven wiring. Every adapter defaults to its free local version; cloud adapters are
 * loaded (with a dynamic import) only when their variable selects them.
 *
 *   GHOST_DATA_DIR         where local data lives (default ./.ghost-data)
 *   GHOST_STORE            file (default) | memory | s3      (s3 needs GHOST_S3_BUCKET)
 *   GHOST_ALERTS           outbox (default) | console | ses | webhook, comma-separated (ses needs
 *                          GHOST_SES_FROM; webhook needs GHOST_WEBHOOK_URL)
 *   GHOST_WEBHOOK_URL      where webhook alerts go: an ntfy topic URL, a Discord or Slack webhook, or
 *                          your own endpoint (https, unless it is on this machine)
 *   GHOST_WEBHOOK_FORMAT   ntfy | discord | slack | json (default: detected from the URL)
 *   GHOST_ALERT_TO         comma-separated recipients (defaults to the app's invented demo address)
 *   GHOST_CONTACT_URL      contact URL sent in the User-Agent (overrides the app's optional one; required
 *                          for real sites, unnecessary when every watch is on a loopback or reserved host)
 *   GHOST_HISTORY          none (default) | wayback: on a first sighting, read archived copies of the page
 *   GHOST_HISTORY_BASE     archive origin (default https://web.archive.org; demo mode uses its fixture site)
 *   GHOST_HISTORY_LIMIT    archived copies to read per page, at most one a month (default 6)
 *   GHOST_INTERVAL_MINUTES override every watch's minimum check interval
 *   GHOST_HOST_GAP_MS      minimum gap between requests to one host (default 1000)
 *   GHOST_TIMEOUT_MS       request timeout (default 15000)
 */
import { join, relative, resolve } from 'node:path';
import type { GhostApp } from './app';
import { systemClock, type Clock } from './clock';
import { PoliteFetcher, buildUserAgent, type Fetcher } from './fetcher';
import { WAYBACK_BASE, WaybackHistorySource, type HistorySource } from './history';
import { ConsoleAlertSink, FanOutAlertSink, OutboxAlertSink } from './alerts/sinks';
import { WEBHOOK_FORMATS, WebhookAlertSink, type WebhookFormat } from './alerts/webhook';
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
  history?: HistorySource;
  describe: { store: string; alerts: string; userAgent: string; history: string };
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
  const labels: string[] = [];
  for (const kind of kinds) {
    labels.push(kind);
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
    } else if (kind === 'webhook') {
      const sink = makeWebhook(env);
      sinks.push(sink);
      // The URL can carry a secret token, so only the format is shown.
      labels[labels.length - 1] = `webhook (${sink.format})`;
    } else {
      throw new ConfigError(`GHOST_ALERTS entries must be outbox, console, ses or webhook, got "${kind}".`);
    }
  }
  if (sinks.length === 0) throw new ConfigError('GHOST_ALERTS selects no alert sink.');
  const sink = sinks.length === 1 ? (sinks[0] as AlertSink) : new FanOutAlertSink(sinks);
  return { sink, ...(outbox ? { outbox } : {}), label: labels.join(' + ') };
}

function makeWebhook(env: Env): WebhookAlertSink {
  const raw = env.GHOST_WEBHOOK_URL?.trim();
  if (!raw) throw new ConfigError('GHOST_ALERTS=webhook needs GHOST_WEBHOOK_URL (an ntfy topic, Discord or Slack webhook, or your own endpoint).');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError('GHOST_WEBHOOK_URL is not a valid URL.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !visitsThirdParty(url.toString()))) {
    throw new ConfigError('GHOST_WEBHOOK_URL must use https unless it points at this machine.');
  }
  const format = env.GHOST_WEBHOOK_FORMAT?.trim();
  if (format && !WEBHOOK_FORMATS.includes(format as WebhookFormat)) {
    throw new ConfigError(`GHOST_WEBHOOK_FORMAT must be one of ${WEBHOOK_FORMATS.join(', ')}, got "${format}".`);
  }
  return new WebhookAlertSink({ url: url.toString(), ...(format ? { format: format as WebhookFormat } : {}) });
}

function makeHistory(env: Env, userAgent: string, hasContact: boolean): { history?: HistorySource; label: string } {
  const kind = env.GHOST_HISTORY ?? 'none';
  if (kind === 'none' || kind === '') return { label: 'off' };
  if (kind !== 'wayback') throw new ConfigError(`GHOST_HISTORY must be none or wayback, got "${kind}".`);
  const base = env.GHOST_HISTORY_BASE?.trim() || WAYBACK_BASE;
  if (visitsThirdParty(base) && !hasContact) {
    throw new ConfigError(
      `GHOST_HISTORY=wayback asks ${new URL(base).host} for archived copies, so the watcher must identify itself. ` +
        'Set GHOST_CONTACT_URL to a page you control.',
    );
  }
  const limit = int(env, 'GHOST_HISTORY_LIMIT', 6);
  const remote = visitsThirdParty(base);
  const history = new WaybackHistorySource({
    userAgent,
    base,
    limit,
    gapMs: remote ? 1000 : 0,
    ...(remote ? {} : { label: 'the stand-in Wayback Machine' }),
  });
  return { history, label: `${history.label} (${limit} copies max)` };
}

const RESERVED_SUFFIXES = ['.example', '.test', '.invalid', '.localhost'];
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];

/** True for documentation-only hostnames (RFC 2606 and RFC 6761), which belong to no real operator. */
export function isReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    RESERVED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)) ||
    RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/** True for contact URLs on documentation-only domains, which no site operator could actually visit. */
export function isPlaceholderContact(contactUrl: string): boolean {
  try {
    return isReservedHost(new URL(contactUrl).hostname);
  } catch {
    return true;
  }
}

/**
 * True when a watch visits a real third-party site: anything that is not this machine (the local
 * fixture sites) and not a documentation-only domain.
 */
export function visitsThirdParty(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const loopback = host === 'localhost' || host === '[::1]' || /^127(\.\d{1,3}){3}$/.test(host);
    return !loopback && !isReservedHost(host);
  } catch {
    return false;
  }
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

  // A contact URL counts only if a site operator could visit it. A placeholder is never sent: real
  // sites need a real contact, and local fixture sites get an explicit local-only token instead.
  const configured = env.GHOST_CONTACT_URL?.trim() || baseApp.contactUrl?.trim() || undefined;
  const contactUrl = configured && !isPlaceholderContact(configured) ? configured : undefined;
  const remote = baseApp.watches.find((w) => visitsThirdParty(w.url));
  if (!contactUrl && remote) {
    const where = `"${remote.name}" watches ${new URL(remote.url).host}`;
    throw new ConfigError(
      configured
        ? `${where}, but the contact URL is still the placeholder ${configured}. ` +
            'Set GHOST_CONTACT_URL to a page you control so the site operator can reach you.'
        : `${where}, so the watcher must identify itself. ` +
            'Set GHOST_CONTACT_URL to a page you control so the site operator can reach you.',
    );
  }
  const userAgent = buildUserAgent(
    contactUrl ? { version: baseApp.version, contactUrl } : { version: baseApp.version, localOnly: true },
  );

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
  const { history, label: historyLabel } = makeHistory(env, userAgent, Boolean(contactUrl));
  const runner = new Runner({ app, fetcher, store, sink, clock, ...(history ? { history } : {}) });

  return {
    app,
    dataDir,
    fetcher,
    store,
    sink,
    ...(outbox ? { outbox } : {}),
    clock,
    runner,
    ...(history ? { history } : {}),
    describe: { store: storeLabel, alerts: alertLabel, userAgent, history: historyLabel },
  };
}
