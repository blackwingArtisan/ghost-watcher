/**
 * The check runner wires the pipeline together for one watch:
 * interval gate -> polite fetch -> extract -> diff -> rules -> alerts -> store.
 */
import type { GhostApp } from './app';
import type { Clock } from './clock';
import { diff, isEmptyDiff, type Diff, type Snapshot } from './diff';
import { extract, type Extraction } from './extract';
import type { Fetcher } from './fetcher';
import { buildPastTimeline, pastChangeCount, type HistorySource, type PastTimeline } from './history';
import { pageFingerprint } from './noise';
import { comparePact } from './pact';
import { evaluateRules, type Finding } from './rules';
import { needsReceipt, takeReceipt, type PageArchiver } from './receipts';
import { renderAlertMessage } from './alerts/render';
import type { Alert, AlertSink, DeliveryReceipt } from './alerts/types';
import type { GhostStore, WatchStatus } from './store/ghost-store';
import type { Watch } from './watch';

/**
 * `pageMoved` is true when the page's visible text differs from the previous visit. An `unchanged`
 * result with `pageMoved` is noise the ghost ignored; a `changed` result always has `pageMoved`.
 */
export type CheckResult =
  | { status: 'baseline'; watchId: string; snapshot: Snapshot; pageMoved: false }
  | { status: 'unchanged'; watchId: string; snapshot: Snapshot; diff: Diff; pageMoved: boolean }
  | {
      status: 'changed';
      watchId: string;
      snapshot: Snapshot;
      diff: Diff;
      alerts: Alert[];
      pageMoved: true;
      delivery?: DeliveryReceipt;
      deliveryError?: string;
    }
  | { status: 'skipped'; watchId: string; reason: 'interval' | 'backoff'; nextEligibleAt: string }
  | { status: 'blocked'; watchId: string; robotsUrl: string }
  | { status: 'error'; watchId: string; message: string };

export interface RunnerDeps {
  app: GhostApp;
  fetcher: Fetcher;
  store: GhostStore;
  sink: AlertSink;
  clock: Clock;
  /** Optional: archived copies of each page, read once on its first sighting (the Ghost of Terms Past). */
  history?: HistorySource;
  /**
   * Optional: asked to keep an archived copy of a page when a check finds a shriek or a bait and
   * switch. Without it, receipts still carry the before and after snapshot hashes.
   */
  archive?: PageArchiver;
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

    const page = pageFingerprint(outcome.html);
    const pageMoved = status.pageFingerprint !== undefined && status.pageFingerprint !== page;
    status.pageFingerprint = page;

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
      const past = await this.lookBack(watch, snapshot);
      const found = past ? pastChangeCount(past) : 0;
      Object.assign(status, {
        lastOutcome: 'baseline',
        lastMessage: found
          ? `First sighting recorded. The Ghost of Terms Past found ${found} earlier change${found === 1 ? '' : 's'}.`
          : 'First sighting recorded. The ghost now knows this page.',
      });
      await store.saveSnapshot(snapshot);
      await store.saveStatus(status);
      return { status: 'baseline', watchId: watch.id, snapshot, pageMoved: false };
    }

    const nightly = evaluateRules(watch, changes);
    if (!isEmptyDiff(changes)) await store.saveSnapshot(snapshot);
    const findings = await this.judgeAgainstPact(watch, extraction, changes, nightly);
    if (findings.length === 0) {
      const watchedMoved = !isEmptyDiff(changes);
      if (pageMoved || watchedMoved) status.ignoredChanges = (status.ignoredChanges ?? 0) + 1;
      Object.assign(status, {
        lastOutcome: 'unchanged',
        lastMessage: watchedMoved
          ? 'Something moved, but no rule cares about it.'
          : pageMoved
            ? 'The page changed, but nothing watched did.'
            : 'Nothing watched has changed.',
      });
      await store.saveStatus(status);
      return { status: 'unchanged', watchId: watch.id, snapshot, diff: changes, pageMoved: pageMoved || watchedMoved };
    }

    const receipt = needsReceipt(findings) ? await takeReceipt(previous, snapshot, this.deps.archive) : undefined;
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
      ...(finding.stealth ? { stealth: finding.stealth } : {}),
      ...(finding.tone ? { tone: finding.tone } : {}),
      ...(finding.pact ? { pact: finding.pact } : {}),
      ...(receipt && (finding.severity === 'shriek' || finding.stealth) ? { receipt } : {}),
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
      return { status: 'changed', watchId: watch.id, snapshot, diff: changes, alerts, pageMoved: true, delivery };
    } catch (error) {
      const deliveryError = error instanceof Error ? error.message : String(error);
      return { status: 'changed', watchId: watch.id, snapshot, diff: changes, alerts, pageMoved: true, deliveryError };
    }
  }

  /**
   * Judges a changed check against the sealed pact too. No pact, or one that cannot be read, leaves
   * the findings as they are: a damaged pact never fails a check.
   */
  private async judgeAgainstPact(watch: Watch, extraction: Extraction, changes: Diff, findings: Finding[]): Promise<Finding[]> {
    if (isEmptyDiff(changes)) return findings;
    try {
      const reading = await this.deps.store.pact(watch.id);
      return reading.status === 'sealed' ? comparePact(watch, reading.pact, extraction, changes, findings) : findings;
    } catch {
      return findings;
    }
  }

  /** Reads archived copies once, on the first sighting. An unreachable archive never fails the check. */
  private async lookBack(watch: Watch, snapshot: Snapshot): Promise<PastTimeline | null> {
    const { history, store, clock } = this.deps;
    if (!history) return null;
    const lookedAt = clock.now().toISOString();
    let timeline: PastTimeline;
    try {
      timeline = buildPastTimeline(watch, await history.captures(watch.url), snapshot, history.label, lookedAt);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      timeline = { source: history.label, lookedAt, captures: 0, entries: [], note: `Could not read ${history.label}: ${reason}` };
    }
    await store.savePastTimeline(watch.id, timeline);
    return timeline;
  }

  private async fail(status: WatchStatus, watch: Watch, message: string): Promise<CheckResult> {
    status.consecutiveErrors += 1;
    status.lastOutcome = 'error';
    status.lastMessage = message;
    await this.deps.store.saveStatus(status);
    return { status: 'error', watchId: watch.id, message };
  }
}
