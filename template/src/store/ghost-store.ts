/**
 * The ghost store keeps everything a watcher remembers between checks: snapshots (with a short
 * history), per-watch status (for intervals, back-off and acknowledgments) and alert history.
 */
import type { Snapshot } from '../diff';
import type { Alert } from '../alerts/types';
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
}

export interface GhostStoreOptions {
  /** Snapshots kept per watch (the newest is always kept). */
  historyLimit?: number;
  /** Alerts kept per watch. */
  alertLimit?: number;
}

const stamp = (iso: string) => iso.replace(/[:.]/g, '-');

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
    return this.blobs.put(key, `${JSON.stringify(value, null, 2)}\n`);
  }

  latestSnapshot(watchId: string): Promise<Snapshot | null> {
    return this.readJson<Snapshot>(`snapshots/${watchId}/latest.json`);
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
      if (snapshot) snapshots.push(snapshot);
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
