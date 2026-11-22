/**
 * The ghost store keeps everything a watcher remembers between checks: snapshots (with a short
 * history), per-watch status (for intervals, back-off and acknowledgments) and alert history.
 */
import type { Snapshot } from '../diff';
import type { ListItem } from '../extract';
import { upgradeStoredValue, type LegacyMoneyValue, type MaybeValue } from '../normalize';
import type { Alert } from '../alerts/types';
import type { PastTimeline } from '../history';
import { PACT_VERSION, type Pact, type PactReading, type PactRecord } from '../pact';
import { serializeJson, sha256Hex, snapshotSha256 } from '../receipts';
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

const pactKey = (watchId: string, name: string) => `pacts/${watchId}/${name}.json`;

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

export type PactRecordReading =
  | { status: 'none' }
  | { status: 'sealed'; record: PactRecord }
  | { status: 'corrupt'; reason: string };

const SHA256 = /^[0-9a-f]{64}$/;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nullableString = (value: unknown): boolean => value === null || typeof value === 'string';

/** Checks the shape of a stored `pact.json`; returns the reason it is unreadable, or null. */
function recordProblem(value: unknown, watchId: string): string | null {
  if (!isObject(value)) return 'the pact record is not an object';
  if (value.version !== PACT_VERSION) return 'the pact record has an unknown version';
  for (const name of ['watchId', 'watchName', 'url', 'sealedAt', 'snapshotTakenAt', 'sha256']) {
    if (typeof value[name] !== 'string') return `the pact record lacks "${name}"`;
  }
  if (value.watchId !== watchId) return 'the pact record belongs to another watch';
  if (!SHA256.test(value.sha256 as string)) return 'the pact record has no valid SHA-256';
  const archive = value.archive;
  if (!isObject(archive) || !['archiveUrl', 'archivedAt', 'archivedBy'].every((name) => nullableString(archive[name]))) {
    return 'the pact record lacks its archive facts';
  }
  if (archive.note !== undefined && typeof archive.note !== 'string') return 'the pact record has a bad archive note';
  if (value.bonusPostedAt !== undefined && typeof value.bonusPostedAt !== 'string') return 'the pact record has a bad posted mark';
  if (value.seeded !== undefined && value.seeded !== 'demo') return 'the pact record has a bad "seeded" mark';
  return null;
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

  /** Forgets everything: snapshots, statuses, alerts and history. Demo mode uses it to rewind. */
  async clear(): Promise<void> {
    for (const key of await this.blobs.list('')) await this.blobs.delete(key);
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

  /** The pact's record only (one read). Bad content is reported as `corrupt`, never thrown. */
  async pactRecord(watchId: string): Promise<PactRecordReading> {
    const text = await this.blobs.get(pactKey(watchId, 'pact'));
    if (text === null) return { status: 'none' };
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return { status: 'corrupt', reason: 'the pact record is not valid JSON' };
    }
    const problem = recordProblem(value, watchId);
    return problem ? { status: 'corrupt', reason: problem } : { status: 'sealed', record: value as PactRecord };
  }

  /** The pact with its snapshot, after checking the hash on the stored bytes. */
  async pact(watchId: string): Promise<PactReading> {
    const reading = await this.pactRecord(watchId);
    if (reading.status !== 'sealed') return reading;
    const { record } = reading;
    const text = await this.blobs.get(pactKey(watchId, record.sha256));
    if (text === null) return { status: 'corrupt', reason: 'the pact snapshot is missing' };
    if (sha256Hex(text) !== record.sha256) return { status: 'corrupt', reason: 'the pact snapshot does not match its SHA-256' };
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(text);
    } catch {
      return { status: 'corrupt', reason: 'the pact snapshot is not valid JSON' };
    }
    if (!isObject(snapshot) || !isObject(snapshot.fields) || !isObject(snapshot.lists) || typeof snapshot.takenAt !== 'string') {
      return { status: 'corrupt', reason: 'the pact snapshot has the wrong shape' };
    }
    const pact: Pact = { ...record, snapshot: upgradeSnapshot(snapshot as unknown as Snapshot) };
    return { status: 'sealed', pact };
  }

  /** The exact stored bytes of the pact snapshot, or null when the pact is missing or does not match its hash. */
  async pactSnapshotText(watchId: string): Promise<string | null> {
    const reading = await this.pactRecord(watchId);
    if (reading.status !== 'sealed') return null;
    const text = await this.blobs.get(pactKey(watchId, reading.record.sha256));
    return text !== null && sha256Hex(text) === reading.record.sha256 ? text : null;
  }

  /**
   * Writes the snapshot document, then the record, then removes older snapshot documents. If the
   * record write fails, the old record still points at its own untouched document.
   */
  async savePact(record: PactRecord, snapshot: Snapshot): Promise<void> {
    if (record.sha256 !== snapshotSha256(snapshot)) throw new Error('The pact record does not match its snapshot.');
    const snapshotKey = pactKey(record.watchId, record.sha256);
    const recordKey = pactKey(record.watchId, 'pact');
    await this.writeJson(snapshotKey, snapshot);
    await this.writeJson(recordKey, record);
    for (const key of await this.blobs.list(`pacts/${record.watchId}/`)) {
      if (key !== snapshotKey && key !== recordKey) await this.blobs.delete(key);
    }
  }

  /** Stores the posted mark in the pact record only. Null when there is no readable pact. */
  async markBonusPosted(watchId: string, at: string): Promise<PactRecord | null> {
    const reading = await this.pactRecord(watchId);
    if (reading.status !== 'sealed') return null;
    const record: PactRecord = { ...reading.record, bonusPostedAt: at };
    await this.writeJson(pactKey(watchId, 'pact'), record);
    return record;
  }

  /** Removes everything under the watch's pact path, readable or not. True when something was there. */
  async deletePact(watchId: string): Promise<boolean> {
    const keys = await this.blobs.list(`pacts/${watchId}/`);
    for (const key of keys) await this.blobs.delete(key);
    return keys.length > 0;
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
