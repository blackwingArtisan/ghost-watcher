/**
 * The ghost keeps receipts. When a check finds a shriek or a bait and switch, the runner records
 * proof of what the page said before and after:
 *
 *   - the SHA-256 of the stored snapshot before the change and of the one after it, computed over
 *     the exact bytes the store writes, so `shasum -a 256` on the snapshot file reproduces it;
 *   - optionally, a permanent archived copy of the page from the Internet Archive's Save Page Now,
 *     so a third party holds a copy too ("the bank changed its terms after you applied").
 *
 * An unreachable archive never fails a check: the receipt keeps its hashes and says why it has no link.
 */
import { createHash } from 'node:crypto';
import { systemClock, type Clock } from './clock';
import type { Snapshot } from './diff';
import type { Transport } from './fetcher';
import { WAYBACK_BASE, waybackTimestampToIso } from './history';
import type { Severity } from './watch';

/** One side of a receipt: which stored snapshot, and its hash. */
export interface ReceiptSide {
  takenAt: string;
  sha256: string;
}

export interface Receipt {
  before: ReceiptSide;
  after: ReceiptSide;
  /** A permanent archived copy of the page as the ghost saw it, or null when none could be made. */
  archiveUrl: string | null;
  /** When the archive captured it (ISO), when known. */
  archivedAt: string | null;
  /** Who holds the archived copy, e.g. `the Internet Archive`. */
  archivedBy: string | null;
  /** Set when there is no archived copy, to say why. */
  note?: string;
}

/** The bytes the ghost store writes for a JSON document. Hashes are taken over exactly these bytes. */
export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** SHA-256 of a snapshot as stored (`snapshots/<watch>/history/<stamp>.json`). */
export function snapshotSha256(snapshot: Snapshot): string {
  return sha256Hex(serializeJson(snapshot));
}

/** A receipt is kept for the changes worth proving later: a shriek, or a bait and switch. */
export function needsReceipt(findings: ReadonlyArray<{ severity: Severity; stealth?: string }>): boolean {
  return findings.some((f) => f.severity === 'shriek' || Boolean(f.stealth));
}

/** "3f2a9c…d41e": a hash short enough for a stone or a feed line. */
export function shortHash(hex: string): string {
  return hex.length > 16 ? `${hex.slice(0, 8)}…${hex.slice(-4)}` : hex;
}

/** The archive port: asks an archive to keep a copy of a page now. */
export interface PageArchiver {
  readonly label: string;
  save(url: string): Promise<{ archiveUrl: string; archivedAt: string | null }>;
}

export interface SavePageNowOptions {
  userAgent: string;
  /** The Wayback Machine origin, or a local stand-in for demos and tests. */
  base?: string;
  label?: string;
  /** Save Page Now can take a while on a busy day. Default 60 s. */
  timeoutMs?: number;
  clock?: Clock;
  transport?: Transport;
}

const SNAPSHOT_PATH = /\/web\/(\d{14})\/(.+)$/;

/** `20260611093044` to a Wayback copy URL for `url` on `base`. */
function copyUrl(base: string, stamp: string, url: string): string {
  return `${base}/web/${stamp}/${url}`;
}

function stampOf(date: Date): string {
  return date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:TZ]/g, '').slice(0, 14);
}

/**
 * Internet Archive Save Page Now, anonymous: `GET {base}/save/{url}`. The archive answers with a
 * redirect to the new copy (`/web/<timestamp>/<url>`) or names it in `Content-Location`. When it only
 * accepts the job, the receipt links to the copy nearest the moment of the request, which the
 * Wayback Machine resolves to the new capture once it lands.
 */
export class SavePageNowArchiver implements PageArchiver {
  readonly label: string;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly clock: Clock;
  private readonly transport: Transport;

  constructor(private readonly options: SavePageNowOptions) {
    if (!options.userAgent) throw new Error('SavePageNowArchiver needs a User-Agent.');
    this.base = (options.base ?? WAYBACK_BASE).replace(/\/$/, '');
    this.label = options.label ?? (this.base === WAYBACK_BASE ? 'the Internet Archive' : `the archive at ${this.base}`);
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.clock = options.clock ?? systemClock;
    this.transport = options.transport ?? (globalThis.fetch as unknown as Transport);
  }

  async save(url: string): Promise<{ archiveUrl: string; archivedAt: string | null }> {
    return this.request(`${this.base}/save/${url}`, url);
  }

  /**
   * Stand-in archives only: asks for a copy dated `at`, via `{base}/save/<14-digit stamp>/<url>`, a
   * route the local fixture's stand-in Wayback offers so the demo's back-dated pact can have a copy
   * on its own date. The Internet Archive cannot back-date a copy, so asking it is an error.
   */
  async saveAt(url: string, at: Date): Promise<{ archiveUrl: string; archivedAt: string | null }> {
    if (this.base === WAYBACK_BASE) throw new Error('the Internet Archive cannot back-date a copy');
    return this.request(`${this.base}/save/${stampOf(at)}/${url}`, url);
  }

  private async request(target: string, url: string): Promise<{ archiveUrl: string; archivedAt: string | null }> {
    const requestedAt = this.clock.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Awaited<ReturnType<Transport>>;
    try {
      response = await this.transport(target, {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'text/html;q=0.9,*/*;q=0.5' },
        signal: controller.signal,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 429) throw new Error('the archive asked us to slow down (HTTP 429)');
    if (response.status < 200 || response.status >= 400) throw new Error(`the archive answered HTTP ${response.status}`);

    for (const candidate of [response.url, response.headers.get('content-location') ?? '']) {
      const match = SNAPSHOT_PATH.exec(candidate);
      if (match?.[1]) return { archiveUrl: copyUrl(this.base, match[1], match[2] ?? url), archivedAt: waybackTimestampToIso(match[1]) };
    }
    return { archiveUrl: copyUrl(this.base, stampOf(requestedAt), url), archivedAt: null };
  }
}

/** Builds a receipt for one change. The archive is asked at most once; a failure becomes a note. */
export async function takeReceipt(
  before: Snapshot,
  after: Snapshot,
  archiver: PageArchiver | undefined,
): Promise<Receipt> {
  const receipt: Receipt = {
    before: { takenAt: before.takenAt, sha256: snapshotSha256(before) },
    after: { takenAt: after.takenAt, sha256: snapshotSha256(after) },
    archiveUrl: null,
    archivedAt: null,
    archivedBy: null,
  };
  if (!archiver) return { ...receipt, note: 'Archiving is off; the snapshot hashes are the receipt.' };
  try {
    const saved = await archiver.save(after.url);
    return { ...receipt, archiveUrl: saved.archiveUrl, archivedAt: saved.archivedAt, archivedBy: archiver.label };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ...receipt, note: `Could not reach ${archiver.label}: ${reason}` };
  }
}
