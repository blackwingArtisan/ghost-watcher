/**
 * Sealing and breaking a pact. These are the effects around `pact.ts`: read the watch's latest
 * snapshot, hash it, ask the archiver once for a copy of the page, and write the pact through the
 * ghost store. Sealing never fetches the watched page, so it is instant and polite.
 */
import type { Clock } from './clock';
import type { Pact, PactArchive, PactRecord } from './pact';
import { DEMO_PACT_AGE_DAYS, PACT_VERSION } from './pact';
import { snapshotSha256, type PageArchiver } from './receipts';
import type { GhostStore } from './store/ghost-store';
import type { Watch } from './watch';

export interface SealDeps {
  store: GhostStore;
  clock: Clock;
  /** Optional: asked once to keep an archived copy of the page. Without it the hash is the pact. */
  archive?: PageArchiver;
}

export type SealResult =
  | { status: 'sealed'; pact: Pact; replaced: boolean }
  | { status: 'exists'; pact: PactRecord }
  | { status: 'no-snapshot' };

export interface SealOptions {
  /** Replace a readable pact. Without it, an existing pact is left alone. */
  confirmReplace?: boolean;
}

export const NO_ARCHIVER_NOTE = 'Archiving is off; the snapshot hash is the pact.';

async function archiveOf(archiver: PageArchiver | undefined, url: string): Promise<PactArchive> {
  if (!archiver) return { archiveUrl: null, archivedAt: null, archivedBy: null, note: NO_ARCHIVER_NOTE };
  try {
    const saved = await archiver.save(url);
    return { archiveUrl: saved.archiveUrl, archivedAt: saved.archivedAt, archivedBy: archiver.label };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { archiveUrl: null, archivedAt: null, archivedBy: null, note: `Could not reach ${archiver.label}: ${reason}` };
  }
}

/**
 * Seals the watch's latest stored snapshot as its pact. A readable pact is only replaced with
 * `confirmReplace`; an unreadable one never blocks.
 */
export async function sealPact(deps: SealDeps, watch: Pick<Watch, 'id' | 'name'>, options: SealOptions = {}): Promise<SealResult> {
  // "Readable" means the snapshot document is there and matches its hash, not just that pact.json parses.
  const existing = await deps.store.pact(watch.id);
  if (existing.status === 'sealed' && options.confirmReplace !== true) {
    const { snapshot: _body, ...record } = existing.pact;
    return { status: 'exists', pact: record };
  }

  const snapshot = await deps.store.latestSnapshot(watch.id);
  if (!snapshot) return { status: 'no-snapshot' };

  const record: PactRecord = {
    version: PACT_VERSION,
    watchId: watch.id,
    watchName: watch.name,
    url: snapshot.url,
    sealedAt: deps.clock.now().toISOString(),
    snapshotTakenAt: snapshot.takenAt,
    sha256: snapshotSha256(snapshot),
    archive: await archiveOf(deps.archive, snapshot.url),
  };
  await deps.store.savePact(record, snapshot);
  return { status: 'sealed', pact: { ...record, snapshot }, replaced: existing.status === 'sealed' };
}

/** Removes the pact and its snapshot, readable or not. Succeeds when there is none. */
export async function breakPact(deps: Pick<SealDeps, 'store'>, watchId: string): Promise<{ removed: boolean }> {
  return { removed: await deps.store.deletePact(watchId) };
}

/** An archive that can keep a copy dated on a given day: only the demo's stand-in Wayback Machine can. */
export interface DatedArchiver {
  readonly label: string;
  saveAt(url: string, at: Date): Promise<{ archiveUrl: string; archivedAt: string | null }>;
}

function canDate(archive: PageArchiver | undefined): archive is PageArchiver & DatedArchiver {
  return archive !== undefined && typeof (archive as Partial<DatedArchiver>).saveAt === 'function';
}

export const DEMO_PACT_NOTE = 'Demo pact: back-dated for the demo, so no archived copy was made.';

const DAY_MS = 86_400_000;

const demoArchive: PactArchive = { archiveUrl: null, archivedAt: null, archivedBy: null, note: DEMO_PACT_NOTE };

async function datedCopy(archiver: DatedArchiver, url: string, sealedAt: string): Promise<PactArchive> {
  try {
    const saved = await archiver.saveAt(url, new Date(sealedAt));
    return { archiveUrl: saved.archiveUrl, archivedAt: saved.archivedAt, archivedBy: archiver.label };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { archiveUrl: null, archivedAt: null, archivedBy: null, note: `Could not reach ${archiver.label}: ${reason}` };
  }
}

/**
 * The demo's pact: for every watch with a snapshot, seals that snapshot as if the reader had applied
 * `ageDays` ago (40 by default). The sealed snapshot's `takenAt` is moved back to the same date, and
 * its hash is taken over that back-dated document, so `shasum` on the stored file still matches.
 * The real archiver is never asked for a copy in the past. A stand-in archive that can date a copy
 * (`saveAt`, the demo's fixture Wayback) is asked once per watch, so Exhibit A links a copy dated on
 * the pact date; if it fails, the pact is still seeded with the reason. Watches with no snapshot
 * (a blocked page) are skipped and reported as `no-snapshot`. An existing pact is replaced.
 */
export async function seedDemoPacts(
  deps: Pick<SealDeps, 'store' | 'clock'> & { archive?: PageArchiver },
  watches: ReadonlyArray<Pick<Watch, 'id' | 'name'>>,
  options: { ageDays?: number; skip?: readonly string[] } = {},
): Promise<SealResult[]> {
  const ageDays = options.ageDays ?? DEMO_PACT_AGE_DAYS;
  const results: SealResult[] = [];
  for (const watch of watches) {
    if (options.skip?.includes(watch.id)) continue;
    const latest = await deps.store.latestSnapshot(watch.id);
    if (!latest) {
      results.push({ status: 'no-snapshot' });
      continue;
    }
    const existing = await deps.store.pact(watch.id);
    const sealedAt = new Date(deps.clock.now().getTime() - ageDays * DAY_MS).toISOString();
    const snapshot = { ...latest, takenAt: sealedAt };
    const record: PactRecord = {
      version: PACT_VERSION,
      watchId: watch.id,
      watchName: watch.name,
      url: snapshot.url,
      sealedAt,
      snapshotTakenAt: sealedAt,
      sha256: snapshotSha256(snapshot),
      archive: canDate(deps.archive) ? await datedCopy(deps.archive, snapshot.url, sealedAt) : demoArchive,
      seeded: 'demo',
    };
    await deps.store.savePact(record, snapshot);
    results.push({ status: 'sealed', pact: { ...record, snapshot }, replaced: existing.status === 'sealed' });
  }
  return results;
}
