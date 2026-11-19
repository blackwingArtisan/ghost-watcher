/**
 * The ghost store keeps everything a watcher remembers between checks: snapshots (with a short
 * history), per-watch status (for intervals, back-off and acknowledgments) and alert history.
 */
import type { Snapshot } from '../diff';
import type { ListItem } from '../extract';
import { upgradeStoredValue, type LegacyMoneyValue, type MaybeValue } from '../normalize';
import type { Alert } from '../alerts/types';
import type { PastTimeline } from '../history';
import { serializeJson } from '../receipts';
import type { BlobStore } from './blob';

export type LastOutcome = 'baseline' | 'unchanged' | 'changed' | 'blocked' | 'error';

export interface WatchStatus {
  watchId: string;
  lastAttemptAt?: string;
  lastOutcome?: LastOutcome;
  lastMessage?: string;
  lastChangeAt?: string;
  consecutiveErrors: number;
  /** Alerts created at or before this instant count as acknowledged ("laid to rest"). */
  acknowledgedAt?: string;
  checks: number;
  /** Fingerprint of the page's visible text at the last successful visit (see `noise.ts`). */
  pageFingerprint?: string;
  /** Visits where the page changed but no rule cared: noise the ghost slept through. */
  ignoredChanges?: number;
}

export interface GhostStoreOptions {
  /** Snapshots kept per watch (the newest is always kept). */
  historyLimit?: number;
  /** Alerts kept per watch. */
  alertLimit?: number;
}

const stamp = (iso: string) => iso.replace(/[:.]/g, '-');

type StoredValue = MaybeValue | LegacyMoneyValue;

/** Upgrades values written by earlier versions (money as a decimal) so an upgrade raises no false change. */
function upgradeSnapshot(snapshot: Snapshot): Snapshot {
  const upgrade = (values: Record<string, MaybeValue>): Record<string, MaybeValue> =>
    Object.fromEntries(Object.entries(values).map(([name, value]) => [name, upgradeStoredValue(value as StoredValue)]));
  const lists: Record<string, ListItem[]> = {};
  for (const [name, items] of Object.entries(snapshot.lists)) {
    lists[name] = items.map((item) => ({ ...item, values: upgrade(item.values) }));
  }
  return { ...snapshot, fields: upgrade(snapshot.fields), lists };
}

export class GhostStore {
  private readonly historyLimit: number;
  private readonly alertLimit: number;

  constructor(
    readonly blobs: BlobStore,
    options: GhostStoreOptions = {},
  ) {
    this.historyLimit = options.historyLimit ?? 20;
    this.alertLimit = options.alertLimit ?? 200;
  }

  private async readJson<T>(key: string): Promise<T | null> {
    const body = await this.blobs.get(key);
    if (body === null) return null;
    return JSON.parse(body) as T;
  }

  private writeJson(key: string, value: unknown): Promise<void> {
    // Receipts hash exactly these bytes (see receipts.ts), so keep the two in step.
    return this.blobs.put(key, serializeJson(value));
  }

  async latestSnapshot(watchId: string): Promise<Snapshot | null> {
    const snapshot = await this.readJson<Snapshot>(`snapshots/${watchId}/latest.json`);
    return snapshot ? upgradeSnapshot(snapshot) : null;
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    await this.writeJson(`snapshots/${snapshot.watchId}/history/${stamp(snapshot.takenAt)}.json`, snapshot);
    await this.writeJson(`snapshots/${snapshot.watchId}/latest.json`, snapshot);
    const history = await this.blobs.list(`snapshots/${snapshot.watchId}/history/`);
    for (const key of history.slice(0, Math.max(0, history.length - this.historyLimit))) await this.blobs.delete(key);
  }

  /** Snapshots newest first. */
  async history(watchId: string, limit = 5): Promise<Snapshot[]> {
    const keys = (await this.blobs.list(`snapshots/${watchId}/history/`)).reverse().slice(0, limit);
    const snapshots: Snapshot[] = [];
    for (const key of keys) {
      const snapshot = await this.readJson<Snapshot>(key);
      if (snapshot) snapshots.push(upgradeSnapshot(snapshot));
    }
    return snapshots;
  }

  async status(watchId: string): Promise<WatchStatus> {
    return (await this.readJson<WatchStatus>(`status/${watchId}.json`)) ?? { watchId, consecutiveErrors: 0, checks: 0 };
  }

  saveStatus(status: WatchStatus): Promise<void> {
    return this.writeJson(`status/${status.watchId}.json`, status);
  }

  async alerts(watchId: string): Promise<Alert[]> {
    return (await this.readJson<Alert[]>(`alerts/${watchId}.json`)) ?? [];
  }

  async appendAlerts(watchId: string, alerts: Alert[]): Promise<void> {
    if (alerts.length === 0) return;
    const existing = await this.alerts(watchId);
    const merged = [...alerts.slice().reverse(), ...existing].slice(0, this.alertLimit);
    await this.writeJson(`alerts/${watchId}.json`, merged);
  }

  /** The Ghost of Terms Past timeline, recorded on the first sighting. */
  pastTimeline(watchId: string): Promise<PastTimeline | null> {
    return this.readJson<PastTimeline>(`past/${watchId}.json`);
  }

  savePastTimeline(watchId: string, timeline: PastTimeline): Promise<void> {
    return this.writeJson(`past/${watchId}.json`, timeline);
  }

  async acknowledge(watchId: string, at: string): Promise<WatchStatus> {
    const status = await this.status(watchId);
    status.acknowledgedAt = at;
    await this.saveStatus(status);
    return status;
  }

  /** Alerts the user has not laid to rest yet. */
  async unacknowledged(watchId: string): Promise<Alert[]> {
    const [alerts, status] = await Promise.all([this.alerts(watchId), this.status(watchId)]);
    const cutoff = status.acknowledgedAt ? Date.parse(status.acknowledgedAt) : -Infinity;
    return alerts.filter((alert) => Date.parse(alert.createdAt) > cutoff);
  }
}
