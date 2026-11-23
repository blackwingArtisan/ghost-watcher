/**
 * AWS Lambda entry point for the nightly check. EventBridge Scheduler invokes it once a night; it
 * builds the app from environment variables (S3 store, Object Lock pact bucket, SES or webhook
 * alerts), runs `Runner.checkAll` once and returns a summary.
 *
 * Node.js handler signature: `async (event, context) => result`. Built by `sam build` (esbuild).
 */
import { loadDeps, type CloudClients, type Env, type GhostApp } from '@ghost-watcher/template';
import type { Clock, Fetcher } from '@ghost-watcher/template';
import { buildApp as buildBonusApp } from '../apps/bonus-watch/src/app';
import { buildApp as buildListingApp } from '../apps/listing-watch/src/app';

export interface NightlySummary {
  app: string;
  checked: number;
  changed: number;
  baseline: number;
  unchanged: number;
  skipped: number;
  blocked: number;
  failed: number;
  alerts: number;
}

export interface HandlerOptions {
  env?: Env;
  /** Replaces the app chosen by `GHOST_APP`. */
  app?: GhostApp;
  clock?: Clock;
  fetcher?: Fetcher;
  clients?: CloudClients;
}

/** Lambda needs a writable directory only for local data; the S3 store keeps nothing there. */
const LAMBDA_DATA_DIR = '/tmp/ghost-data';

function pickApp(env: Env): GhostApp {
  const name = env.GHOST_APP ?? 'bonus-watch';
  if (name === 'bonus-watch') return buildBonusApp(env);
  if (name === 'listing-watch') return buildListingApp(env);
  throw new Error(`GHOST_APP must be bonus-watch or listing-watch, got "${name}".`);
}

export function createHandler(options: HandlerOptions = {}) {
  return async (_event?: unknown, _context?: unknown): Promise<NightlySummary> => {
    const env: Env = { GHOST_STORE: 's3', GHOST_DATA_DIR: LAMBDA_DATA_DIR, ...(options.env ?? process.env) };
    const app = options.app ?? pickApp(env);
    const deps = await loadDeps(app, {
      env,
      ...(options.clock ? { clock: options.clock } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      ...(options.clients ? { clients: options.clients } : {}),
    });
    const results = await deps.runner.checkAll();
    const count = (status: string) => results.filter((r) => r.status === status).length;
    const summary: NightlySummary = {
      app: deps.app.id,
      checked: results.length,
      changed: count('changed'),
      baseline: count('baseline'),
      unchanged: count('unchanged'),
      skipped: count('skipped'),
      blocked: count('blocked'),
      failed: count('error'),
      alerts: results.reduce((sum, r) => sum + (r.status === 'changed' ? r.alerts.length : 0), 0),
    };
    console.log(JSON.stringify({ nightly: summary }));
    return summary;
  };
}

export const handler = createHandler();
