/**
 * The check runner wires the pipeline together for one watch:
 * interval gate -> polite fetch -> extract -> diff -> rules -> alerts -> store.
 */
import type { GhostApp } from './app';
import type { Clock } from './clock';
import { diff, isEmptyDiff, type Diff, type Snapshot } from './diff';
import { extract } from './extract';
import type { Fetcher } from './fetcher';
import { evaluateRules } from './rules';
import { renderAlertMessage } from './alerts/render';
import type { Alert, AlertSink, DeliveryReceipt } from './alerts/types';
import type { GhostStore, WatchStatus } from './store/ghost-store';
import type { Watch } from './watch';

export type CheckResult =
  | { status: 'baseline'; watchId: string; snapshot: Snapshot }
  | { status: 'unchanged'; watchId: string; snapshot: Snapshot; diff: Diff }
  | { status: 'changed'; watchId: string; snapshot: Snapshot; diff: Diff; alerts: Alert[]; delivery?: DeliveryReceipt; deliveryError?: string }
  | { status: 'skipped'; watchId: string; reason: 'interval' | 'backoff'; nextEligibleAt: string }
  | { status: 'blocked'; watchId: string; robotsUrl: string }
  | { status: 'error'; watchId: string; message: string };

export interface RunnerDeps {
  app: GhostApp;
  fetcher: Fetcher;
  store: GhostStore;
  sink: AlertSink;
  clock: Clock;
}

export interface CheckOptions {
  /** Skip the per-URL interval and error back-off (an explicit "check now"). robots.txt still applies. */
  force?: boolean;
}

/** Back-off after consecutive errors: 15 min, 30 min, 1 h ... capped at 24 h. */
export function backoffMs(consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) return 0;
  return Math.min(24 * 60 * 60 * 1000, 15 * 60 * 1000 * 2 ** (consecutiveErrors - 1));
}

/** When a watch may next be checked by the scheduler. */
export function nextEligibleAt(watch: Watch, status: WatchStatus): Date | null {
  if (!status.lastAttemptAt) return null;
  const wait = Math.max(watch.intervalMs, backoffMs(status.consecutiveErrors));
  return new Date(Date.parse(status.lastAttemptAt) + wait);
}

export class Runner {
  private readonly inFlight = new Map<string, Promise<CheckResult>>();

  constructor(private readonly deps: RunnerDeps) {}

  get app(): GhostApp {
    return this.deps.app;
  }

  watch(id: string): Watch | undefined {
    return this.deps.app.watches.find((w) => w.id === id);
  }

  /** Checks one watch. Concurrent calls for the same watch share one check. */
  check(watch: Watch, options: CheckOptions = {}): Promise<CheckResult> {
    const running = this.inFlight.get(watch.id);
    if (running) return running;
    const promise = this.run(watch, options).finally(() => this.inFlight.delete(watch.id));
    this.inFlight.set(watch.id, promise);
    return promise;
  }

  isChecking(watchId: string): boolean {
    return this.inFlight.has(watchId);
  }

  /** Checks every watch in order (the fetcher keeps per-host politeness across them). */
  async checkAll(options: CheckOptions = {}): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const watch of this.deps.app.watches) results.push(await this.check(watch, options));
    return results;
  }

  private async run(watch: Watch, options: CheckOptions): Promise<CheckResult> {
    const { fetcher, store, clock } = this.deps;
    const status = await store.status(watch.id);
    const eligible = nextEligibleAt(watch, status);
    if (!options.force && eligible && eligible.getTime() > clock.now().getTime()) {
      return {
        status: 'skipped',
        watchId: watch.id,
        reason: status.consecutiveErrors > 0 ? 'backoff' : 'interval',
        nextEligibleAt: eligible.toISOString(),
      };
    }

    const outcome = await fetcher.fetchPage(watch.url);
    const attemptAt = outcome.fetchedAt;
    status.lastAttemptAt = attemptAt;
    status.checks += 1;

    if (outcome.status === 'blocked') {
      Object.assign(status, { lastOutcome: 'blocked', lastMessage: `robots.txt asks watchers not to visit this page.`, consecutiveErrors: 0 });
      await store.saveStatus(status);
      return { status: 'blocked', watchId: watch.id, robotsUrl: outcome.robotsUrl };
    }
    if (outcome.status === 'error') {
      return this.fail(status, watch, outcome.message);
    }

    const extraction = extract(outcome.html, watch);
    const foundSomething =
      Object.values(extraction.fields).some((value) => value !== null) ||
      Object.values(extraction.lists).some((items) => items.length > 0);
    if (!foundSomething) {
      return this.fail(status, watch, 'None of the watched regions were found. The page layout may have changed.');
    }

    const previous = await store.latestSnapshot(watch.id);
    const snapshot: Snapshot = { watchId: watch.id, url: watch.url, takenAt: attemptAt, ...extraction };
    const changes = diff(previous ?? undefined, extraction);
    status.consecutiveErrors = 0;

    if (!previous) {
      Object.assign(status, { lastOutcome: 'baseline', lastMessage: 'First sighting recorded. The ghost now knows this page.' });
      await store.saveSnapshot(snapshot);
      await store.saveStatus(status);
      return { status: 'baseline', watchId: watch.id, snapshot };
    }

    const findings = evaluateRules(watch, changes);
    if (!isEmptyDiff(changes)) await store.saveSnapshot(snapshot);
    if (findings.length === 0) {
      Object.assign(status, {
        lastOutcome: 'unchanged',
        lastMessage: isEmptyDiff(changes)
          ? 'Nothing watched has changed.'
          : 'Something moved, but no rule cares about it.',
      });
      await store.saveStatus(status);
      return { status: 'unchanged', watchId: watch.id, snapshot, diff: changes };
    }

    const alerts: Alert[] = findings.map((finding, index) => ({
      id: `${watch.id}-${attemptAt.replace(/\D/g, '')}-${index + 1}`,
      watchId: watch.id,
      watchName: watch.name,
      url: watch.url,
      createdAt: attemptAt,
      severity: finding.severity,
      ruleKind: finding.ruleKind,
      ruleLabel: finding.ruleLabel,
      summary: finding.summary,
      ...(finding.field ? { field: finding.field } : {}),
      ...(finding.list ? { list: finding.list } : {}),
      ...(finding.before !== undefined ? { before: finding.before } : {}),
      ...(finding.after !== undefined ? { after: finding.after } : {}),
      ...(finding.item ? { item: finding.item } : {}),
    }));
    await store.appendAlerts(watch.id, alerts);
    Object.assign(status, {
      lastOutcome: 'changed',
      lastChangeAt: attemptAt,
      lastMessage: alerts.length === 1 ? alerts[0]?.summary : `${alerts.length} changes worth knowing about.`,
    });
    await store.saveStatus(status);

    const message = renderAlertMessage({
      appName: this.deps.app.name,
      to: this.deps.app.alertTo,
      watch,
      alerts,
      createdAt: attemptAt,
      ...(this.deps.app.copy.disclaimer ? { footer: this.deps.app.copy.disclaimer } : {}),
    });
    try {
      const delivery = await this.deps.sink.deliver(message);
      return { status: 'changed', watchId: watch.id, snapshot, diff: changes, alerts, delivery };
    } catch (error) {
      const deliveryError = error instanceof Error ? error.message : String(error);
      return { status: 'changed', watchId: watch.id, snapshot, diff: changes, alerts, deliveryError };
    }
  }

  private async fail(status: WatchStatus, watch: Watch, message: string): Promise<CheckResult> {
    status.consecutiveErrors += 1;
    status.lastOutcome = 'error';
    status.lastMessage = message;
    await this.deps.store.saveStatus(status);
    return { status: 'error', watchId: watch.id, message };
  }
}
