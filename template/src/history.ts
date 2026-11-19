/**
 * The Ghost of Terms Past. On a ghost's first sighting, a `HistorySource` supplies archived copies of
 * the page, and they run through the same extract, diff and rules pipeline as a live check. The
 * séance can then show what the ghost would have told you had it been watching all along
 * ("Bonus went down from $500 to $300 in June"), instead of starting with an empty history.
 *
 * Past changes are history, not news: they are shown in the séance and never sent as alerts.
 */
import { systemClock, type Clock } from './clock';
import { diff, type Snapshot } from './diff';
import { extract, type Extraction } from './extract';
import type { Transport } from './fetcher';
import { displayValue, formatMinor, numericValue } from './normalize';
import { evaluateRules, type Finding } from './rules';
import type { Severity, Tone, Watch } from './watch';

/** One archived copy of a page. */
export interface PastCapture {
  /** ISO timestamp of the capture. */
  capturedAt: string;
  html: string;
  /** A link a person can open to see the archived copy. */
  archiveUrl: string;
}

/** The history port: archived copies of a URL, oldest first. */
export interface HistorySource {
  /** Shown in the séance, e.g. `the Internet Archive`. */
  readonly label: string;
  captures(url: string): Promise<PastCapture[]>;
}

export interface WaybackOptions {
  userAgent: string;
  /** The Wayback Machine origin, or a local stand-in for demos and tests. */
  base?: string;
  /** How the séance names the source. Defaults to `the Internet Archive` for the real Wayback Machine. */
  label?: string;
  /** Most recent captures to read, at most one per calendar month. Default 6. */
  limit?: number;
  timeoutMs?: number;
  /** Gap between two requests to the archive. Default 1000 ms. */
  gapMs?: number;
  maxBytes?: number;
  clock?: Clock;
  transport?: Transport;
}

export const WAYBACK_BASE = 'https://web.archive.org';

/** `20260611093044` to `2026-06-11T09:30:44Z`. */
export function waybackTimestampToIso(timestamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(timestamp);
  if (!m) throw new Error(`Not a Wayback timestamp: ${timestamp}`);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}Z`;
}

/** The CDX query for the newest captures of a URL, one per month, successful responses only. */
export function cdxQueryUrl(base: string, url: string, limit: number): string {
  const target = url.replace(/^https?:\/\//i, '');
  const params = new URLSearchParams({
    url: target,
    output: 'json',
    fl: 'timestamp,original,statuscode',
    filter: 'statuscode:200',
    collapse: 'timestamp:6',
    limit: String(-Math.max(1, Math.floor(limit))),
  });
  return `${base.replace(/\/$/, '')}/cdx/search/cdx?${params.toString()}`;
}

/** Parses CDX JSON output (a header row, then one row per capture). Unknown shapes yield no rows. */
export function parseCdx(body: string): Array<{ timestamp: string; original: string }> {
  let rows: unknown;
  try {
    rows = JSON.parse(body.trim() || '[]');
  } catch {
    throw new Error('The archive returned an unreadable capture list.');
  }
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const header = rows[0] as unknown[];
  const ts = header.indexOf('timestamp');
  const orig = header.indexOf('original');
  if (ts < 0 || orig < 0) return [];
  return rows
    .slice(1)
    .filter((row): row is string[] => Array.isArray(row) && typeof row[ts] === 'string' && typeof row[orig] === 'string')
    .map((row) => ({ timestamp: row[ts] as string, original: row[orig] as string }))
    .filter((row) => /^\d{14}$/.test(row.timestamp))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Reads past copies from the Internet Archive's Wayback Machine: one CDX query for the newest
 * captures (at most one a month), then each capture's original bytes (`id_`), one request at a time.
 * A capture that fails to load is skipped; a failed capture list throws.
 */
export class WaybackHistorySource implements HistorySource {
  readonly label: string;
  private readonly base: string;
  private readonly limit: number;
  private readonly timeoutMs: number;
  private readonly gapMs: number;
  private readonly maxBytes: number;
  private readonly clock: Clock;
  private readonly transport: Transport;
  private lastRequestAt: number | null = null;

  constructor(private readonly options: WaybackOptions) {
    if (!options.userAgent) throw new Error('WaybackHistorySource needs a User-Agent.');
    this.base = (options.base ?? WAYBACK_BASE).replace(/\/$/, '');
    this.label = options.label ?? (this.base === WAYBACK_BASE ? 'the Internet Archive' : `the archive at ${this.base}`);
    this.limit = options.limit ?? 6;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.gapMs = options.gapMs ?? 1_000;
    this.maxBytes = options.maxBytes ?? 2_000_000;
    this.clock = options.clock ?? systemClock;
    this.transport = options.transport ?? (globalThis.fetch as unknown as Transport);
  }

  async captures(url: string): Promise<PastCapture[]> {
    const list = await this.get(cdxQueryUrl(this.base, url, this.limit));
    if (list.status < 200 || list.status >= 300) throw new Error(`The archive answered HTTP ${list.status}.`);
    const rows = parseCdx(list.body);
    const captures: PastCapture[] = [];
    for (const row of rows) {
      try {
        const page = await this.get(`${this.base}/web/${row.timestamp}id_/${row.original}`);
        if (page.status < 200 || page.status >= 300 || page.body.length > this.maxBytes) continue;
        captures.push({
          capturedAt: waybackTimestampToIso(row.timestamp),
          html: page.body,
          archiveUrl: `${this.base}/web/${row.timestamp}/${row.original}`,
        });
      } catch {
        // One unreadable capture should not hide the others.
      }
    }
    return captures;
  }

  private async get(url: string): Promise<{ status: number; body: string }> {
    if (this.lastRequestAt !== null) {
      const wait = this.lastRequestAt + this.gapMs - this.clock.now().getTime();
      if (wait > 0) await this.clock.sleep(wait);
    }
    this.lastRequestAt = this.clock.now().getTime();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.transport(url, {
        headers: { 'User-Agent': this.options.userAgent, Accept: 'text/html,application/json;q=0.9,*/*;q=0.5' },
        signal: controller.signal,
        redirect: 'follow',
      });
      return { status: response.status, body: await response.text() };
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface PastEntry {
  /** `first`: the oldest copy read; `change`: a copy that differs from the one before; `now`: today's first sighting. */
  kind: 'first' | 'change' | 'now';
  at: string;
  archiveUrl: string | null;
  /** Plain sentences: the values on the oldest copy, or what changed. */
  lines: string[];
  severity: Severity | null;
  /** Bad when any change in this step was bad news, else good when any was good news. */
  tone?: Exclude<Tone, 'neutral'>;
}

/** The one past change worth putting on the stone: "Bonus cut $200 in June". */
export interface PastHeadline {
  text: string;
  tone: Tone;
  at: string;
  field: string;
}

/**
 * How often the page changed what the ghost watches, over the span its archived copies cover:
 * `steady` (never), `very fickle` (three or more changes, at a rate of three or more a year) or `fickle`.
 */
export interface Fickleness {
  changes: number;
  /** Changes that were bad news for the reader, and good news. */
  worse: number;
  better: number;
  /** Whole months between the oldest readable copy and today's first sighting (at least 1). */
  months: number;
  perYear: number;
  label: 'steady' | 'fickle' | 'very fickle';
  /** "Fickle: changed 2 times in 9 months, 1 for the worse." */
  text: string;
}

export interface PastTimeline {
  source: string;
  lookedAt: string;
  /** Archived copies the watched regions could be read from. */
  captures: number;
  entries: PastEntry[];
  /** Set when there is nothing to show, to say why. */
  note?: string;
  headline?: PastHeadline;
  fickleness?: Fickleness;
}

const LOUDNESS: Severity[] = ['whisper', 'moan', 'shriek'];

function loudest(severities: Severity[]): Severity | null {
  let best = -1;
  for (const s of severities) best = Math.max(best, LOUDNESS.indexOf(s));
  return best < 0 ? null : (LOUDNESS[best] ?? null);
}

function toneOfStep(findings: Finding[]): Exclude<Tone, 'neutral'> | undefined {
  if (findings.some((f) => f.tone === 'bad')) return 'bad';
  return findings.some((f) => f.tone === 'good') ? 'good' : undefined;
}

function monthName(iso: string, lookedAt: string): string {
  const options: Intl.DateTimeFormatOptions = { month: 'long', timeZone: 'UTC' };
  if (iso.slice(0, 4) !== lookedAt.slice(0, 4)) options.year = 'numeric';
  return new Date(iso).toLocaleDateString('en-US', options);
}

/** "Bonus cut $200", "Annual fee raised $95", "Bonus points cut 20,000"; null for non-numeric changes. */
export function headlineOf(watch: Watch, finding: Finding): string | null {
  const { before = null, after = null } = finding;
  if (!finding.field || !before || !after || before.kind !== after.kind || after.kind === 'date') return null;
  const a = numericValue(before);
  const b = numericValue(after);
  if (a === null || b === null || a === b) return null;
  const label = watch.fields.find((f) => f.name === finding.field)?.label ?? finding.field;
  const size = Math.abs(b - a);
  const amount =
    after.kind === 'money'
      ? formatMinor(size, after.currency)
      : after.kind === 'percent'
        ? `${Math.round(size * 100) / 100} points`
        : (Math.round(size * 100) / 100).toLocaleString('en-US');
  return `${label} ${b < a ? 'cut' : 'raised'} ${amount}`;
}

const MONTH_MS = 30.44 * 86_400_000;

function fickleness(entries: PastEntry[], firstAt: string, nowAt: string): Fickleness {
  const steps = entries.filter((e) => e.kind === 'change' || (e.kind === 'now' && e.severity !== null));
  const months = Math.max(1, Math.round((Date.parse(nowAt) - Date.parse(firstAt)) / MONTH_MS));
  const changes = steps.length;
  const worse = steps.filter((e) => e.tone === 'bad').length;
  const better = steps.filter((e) => e.tone === 'good').length;
  const perYear = Math.round(((changes * 12) / months) * 10) / 10;
  // One change is never "very" fickle, however short the span of copies.
  const label = changes === 0 ? 'steady' : changes >= 3 && perYear >= 3 ? 'very fickle' : 'fickle';
  const span = `${months} month${months === 1 ? '' : 's'}`;
  const text =
    changes === 0
      ? `Steady: nothing watched changed in ${span} of archived copies.`
      : `${label === 'fickle' ? 'Fickle' : 'Very fickle'}: changed ${changes} time${changes === 1 ? '' : 's'} in ${span}${
          worse ? `, ${worse} for the worse` : ''
        }.`;
  return { changes, worse, better, months, perYear, label, text };
}

function foundSomething(extraction: Extraction): boolean {
  return Object.values(extraction.fields).some((v) => v !== null) || Object.values(extraction.lists).some((items) => items.length > 0);
}

/** "Bonus $500 · Min. deposit $5,000 · Deadline Apr 30, 2026" */
export function describeValues(watch: Watch, extraction: Extraction): string {
  const parts: string[] = [];
  const long: string[] = [];
  for (const field of watch.fields) {
    const value = extraction.fields[field.name] ?? null;
    if (value === null) continue;
    const shown = displayValue(value);
    const label = field.label ?? field.name;
    if (shown.length > 48) long.push(`${label}: "${shown.length > 140 ? `${shown.slice(0, 139).trimEnd()}…` : shown}"`);
    else parts.push(`${label} ${shown}`);
  }
  for (const list of watch.lists) parts.push(`${extraction.lists[list.name]?.length ?? 0} × ${list.label ?? list.name}`);
  // Long text (fine print) is quoted only when there is nothing shorter to show.
  return parts.join(' · ') || long[0] || 'Watched regions found.';
}

/**
 * Runs archived copies, oldest first, through extract, diff and the watch's own rules, and ends with
 * the step from the newest copy to today's first sighting. Copies where none of the watched regions
 * can be found (an older layout) are skipped.
 */
export function buildPastTimeline(
  watch: Watch,
  captures: PastCapture[],
  current: Pick<Snapshot, 'takenAt' | 'fields' | 'lists'>,
  source: string,
  lookedAt: string,
): PastTimeline {
  const entries: PastEntry[] = [];
  let previous: Extraction | null = null;
  let firstAt: string | null = null;
  let used = 0;
  let best: { finding: Finding; at: string; text: string } | null = null;
  const consider = (findings: Finding[], at: string) => {
    for (const finding of findings) {
      const text = headlineOf(watch, finding);
      if (!text) continue;
      // The loudest numeric change wins; among equals, the most recent.
      if (!best || LOUDNESS.indexOf(finding.severity) >= LOUDNESS.indexOf(best.finding.severity)) best = { finding, at, text };
    }
  };
  for (const capture of [...captures].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
    if (capture.capturedAt >= current.takenAt) continue;
    const extraction = extract(capture.html, watch);
    if (!foundSomething(extraction)) continue;
    used += 1;
    if (!previous) {
      firstAt = capture.capturedAt;
      entries.push({ kind: 'first', at: capture.capturedAt, archiveUrl: capture.archiveUrl, lines: [describeValues(watch, extraction)], severity: null });
    } else {
      const findings = evaluateRules(watch, diff(previous, extraction));
      if (findings.length > 0) {
        const tone = toneOfStep(findings);
        entries.push({
          kind: 'change',
          at: capture.capturedAt,
          archiveUrl: capture.archiveUrl,
          lines: findings.map((f) => f.summary),
          severity: loudest(findings.map((f) => f.severity)),
          ...(tone ? { tone } : {}),
        });
        consider(findings, capture.capturedAt);
      }
    }
    previous = extraction;
  }
  if (!previous) {
    return {
      source,
      lookedAt,
      captures: 0,
      entries: [],
      note:
        captures.length === 0
          ? `${capitalize(source)} has no earlier copies of this page.`
          : `${capitalize(source)} has copies of this page, but none in a layout the ghost can read.`,
    };
  }
  const findings = evaluateRules(watch, diff(previous, { fields: current.fields, lists: current.lists }));
  const tone = toneOfStep(findings);
  entries.push({
    kind: 'now',
    at: current.takenAt,
    archiveUrl: null,
    lines: findings.length > 0 ? findings.map((f) => f.summary) : ['Nothing watched has changed since the last archived copy.'],
    severity: loudest(findings.map((f) => f.severity)),
    ...(tone ? { tone } : {}),
  });
  consider(findings, current.takenAt);
  const chosen = best as { finding: Finding; at: string; text: string } | null;
  const headline: PastHeadline | undefined = chosen
    ? { text: `${chosen.text} in ${monthName(chosen.at, lookedAt)}`, tone: chosen.finding.tone ?? 'neutral', at: chosen.at, field: chosen.finding.field ?? '' }
    : undefined;
  return {
    source,
    lookedAt,
    captures: used,
    entries,
    ...(headline ? { headline } : {}),
    fickleness: fickleness(entries, firstAt ?? current.takenAt, current.takenAt),
  };
}

/** Changes the timeline found, counting today's step only when it changed something. */
export function pastChangeCount(timeline: PastTimeline): number {
  return timeline.entries.filter((e) => e.kind === 'change' || (e.kind === 'now' && e.severity !== null)).length;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
