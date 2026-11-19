/** View models for the dashboard and its JSON API. */
import type { Alert } from './alerts/types';
import type { GhostDeps } from './config';
import type { Fickleness, PastHeadline, PastTimeline } from './history';
import { displayValue, type MaybeValue } from './normalize';
import { describeRule } from './rules';
import { nextEligibleAt } from './runner';
import { describeItem, wordDiff, type WordSegment } from './summary';
import type { Severity, Tone, Watch } from './watch';

export type GhostState = 'unborn' | 'dormant' | 'restless' | 'blocked' | 'lost';

export interface Reading {
  label: string;
  /** The value now, compact enough for a stone. `gone` when a watched value disappeared. */
  value: string;
  /** The value before the oldest unread change to this field, shown struck through on the stone. */
  before?: string;
  /** Good or bad news, from the change that set `before`. */
  tone?: Tone;
}

export interface GhostView {
  id: string;
  name: string;
  subtitle: string;
  url: string;
  tags: string[];
  state: GhostState;
  checking: boolean;
  unread: number;
  loudest: Severity | null;
  lastAttemptAt: string | null;
  lastChangeAt: string | null;
  lastMessage: string;
  nextEligibleAt: string | null;
  interval: string;
  checks: number;
  /** Visits where the page changed but nothing worth an alert did. */
  ignored: number;
  readings: Reading[];
  rules: string[];
  /** From the Ghost of Terms Past: the past change worth a ribbon, and how fickle the page is. */
  headline: PastHeadline | null;
  fickleness: Fickleness | null;
}

export interface FieldRow {
  name: string;
  label: string;
  now: string;
  before: string | null;
  changed: boolean;
  /** Long text values are shown as one block with inline insertions and deletions. */
  long: boolean;
  segments: WordSegment[] | null;
}

/** A dimmed letter in Spirit mail from the Ghost of Terms Past: a change found in archived copies. */
export interface ArchiveLetter {
  watchId: string;
  watchName: string;
  at: string;
  lines: string[];
  severity: Severity | null;
  tone: Tone;
  archiveUrl: string | null;
  source: string;
}

export interface ListView {
  name: string;
  label: string;
  count: number;
  items: Array<{ key: string; description: string; isNew: boolean }>;
}

export interface GhostDetail extends GhostView {
  fields: FieldRow[];
  lists: ListView[];
  alerts: Array<Alert & { acknowledged: boolean; letter: string | null }>;
  snapshots: string[];
  /** The Ghost of Terms Past: the page's archived history, read on the first sighting. */
  past: PastTimeline | null;
}

export interface FeedEntry {
  alert: Alert;
  acknowledged: boolean;
  letter: string | null;
}

export interface DashboardState {
  app: {
    id: string;
    name: string;
    tagline: string;
    version: string;
    watchNoun: string;
    quiet: string;
    disclaimer: string | null;
    userAgent: string;
    store: string;
    alerts: string;
    history: string;
    crest: string;
    motif: 'stone' | 'house';
    /** True when the dashboard runs in demo mode (the server sets it). */
    demo?: boolean;
  };
  ghosts: GhostView[];
  feed: FeedEntry[];
  /** Past changes found in archived copies, newest first, shown below the live letters. */
  archive: ArchiveLetter[];
  generatedAt: string;
}

const SEVERITY_ORDER: Severity[] = ['whisper', 'moan', 'shriek'];

export function formatInterval(ms: number): string {
  if (ms <= 0) return 'every visit (demo mode)';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `at most every ${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  if (hours < 48) return `at most every ${hours} h`;
  return `at most every ${Math.round(hours / 24)} days`;
}

function loudest(alerts: Alert[]): Severity | null {
  let best = -1;
  for (const alert of alerts) best = Math.max(best, SEVERITY_ORDER.indexOf(alert.severity));
  return best < 0 ? null : (SEVERITY_ORDER[best] ?? null);
}

async function letterIndex(deps: GhostDeps): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!deps.outbox) return map;
  for (const entry of await deps.outbox.entries()) {
    for (const id of entry.alertIds) if (!map.has(id)) map.set(id, entry.file);
  }
  return map;
}

/** "Jan 15 '27": a date short enough to sit on a stone without wrapping. */
export function compactDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return `${date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })} '${String(year).slice(-2)}`;
}

function stoneValue(value: MaybeValue): string {
  if (value === null) return 'gone';
  return value.kind === 'date' ? compactDate(value.iso) : displayValue(value);
}

export async function ghostView(deps: GhostDeps, watch: Watch): Promise<GhostView> {
  const [status, unread, snapshot, past] = await Promise.all([
    deps.store.status(watch.id),
    deps.store.unacknowledged(watch.id),
    deps.store.latestSnapshot(watch.id),
    deps.store.pastTimeline(watch.id),
  ]);
  let state: GhostState = 'unborn';
  if (status.lastOutcome === 'blocked') state = 'blocked';
  else if (status.lastOutcome === 'error') state = 'lost';
  else if (unread.length > 0) state = 'restless';
  else if (status.lastOutcome) state = 'dormant';
  if (unread.length > 0 && state === 'lost') state = 'restless';

  const readings: Reading[] = [];
  for (const field of watch.fields) {
    if (readings.length >= 4) break;
    const value: MaybeValue = snapshot?.fields[field.name] ?? null;
    if (value && value.kind === 'text' && value.text.length > 40) continue;
    const changes = unread
      .filter((alert) => alert.field === field.name && !alert.list && alert.before !== undefined)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const changedBy = changes[0];
    // A value the page never showed is left off the stone; one that vanished reads "gone".
    if (snapshot && value === null && !changedBy) continue;
    const shown = snapshot ? stoneValue(value) : '—';
    const before = changedBy && changedBy.before ? stoneValue(changedBy.before) : undefined;
    const tone: Tone | undefined = value === null && changedBy ? 'bad' : changes[changes.length - 1]?.tone;
    readings.push({
      label: field.label ?? field.name,
      value: shown,
      ...(before !== undefined && before !== shown ? { before, tone: tone ?? 'neutral' } : {}),
    });
  }
  for (const list of watch.lists) {
    readings.push({ label: list.label ?? list.name, value: snapshot ? `${snapshot.lists[list.name]?.length ?? 0} on page` : '—' });
  }
  const next = nextEligibleAt(watch, status);
  // A restless ghost keeps telling you what woke it, even after a quieter visit since.
  const newest = unread[0];
  const lastMessage =
    newest && status.lastOutcome !== 'changed'
      ? unread.length === 1
        ? newest.summary
        : `${unread.length} unread changes. Latest: ${newest.summary}`
      : (status.lastMessage ?? 'Not yet risen. Summon it to take a first look.');
  return {
    id: watch.id,
    name: watch.name,
    subtitle: watch.subtitle ?? new URL(watch.url).host,
    url: watch.url,
    tags: watch.tags,
    state,
    checking: deps.runner.isChecking(watch.id),
    unread: unread.length,
    loudest: loudest(unread),
    lastAttemptAt: status.lastAttemptAt ?? null,
    lastChangeAt: status.lastChangeAt ?? null,
    lastMessage,
    nextEligibleAt: next ? next.toISOString() : null,
    interval: formatInterval(watch.intervalMs),
    checks: status.checks,
    ignored: status.ignoredChanges ?? 0,
    readings,
    rules: watch.rules.map((rule) => describeRule(rule, watch)),
    headline: past?.headline ?? null,
    fickleness: past?.fickleness ?? null,
  };
}

/** Past changes from every ghost's Terms Past timeline, newest first. */
async function archiveLetters(deps: GhostDeps): Promise<ArchiveLetter[]> {
  const letters: ArchiveLetter[] = [];
  for (const watch of deps.app.watches) {
    const past = await deps.store.pastTimeline(watch.id);
    for (const entry of past?.entries ?? []) {
      if (entry.kind !== 'change') continue;
      letters.push({
        watchId: watch.id,
        watchName: watch.name,
        at: entry.at,
        lines: entry.lines,
        severity: entry.severity,
        tone: entry.tone ?? 'neutral',
        archiveUrl: entry.archiveUrl,
        source: past?.source ?? 'the archive',
      });
    }
  }
  return letters.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
}

export async function dashboardState(deps: GhostDeps): Promise<DashboardState> {
  const ghosts = await Promise.all(deps.app.watches.map((watch) => ghostView(deps, watch)));
  const letters = await letterIndex(deps);
  const feed: FeedEntry[] = [];
  for (const watch of deps.app.watches) {
    const [alerts, unread] = await Promise.all([deps.store.alerts(watch.id), deps.store.unacknowledged(watch.id)]);
    const unreadIds = new Set(unread.map((a) => a.id));
    for (const alert of alerts.slice(0, 25)) {
      feed.push({ alert, acknowledged: !unreadIds.has(alert.id), letter: letters.get(alert.id) ?? null });
    }
  }
  feed.sort((a, b) => b.alert.createdAt.localeCompare(a.alert.createdAt) || a.alert.id.localeCompare(b.alert.id));
  const { app } = deps;
  return {
    app: {
      id: app.id,
      name: app.name,
      tagline: app.tagline,
      version: app.version,
      watchNoun: app.copy.watchNoun,
      quiet: app.copy.quiet,
      disclaimer: app.copy.disclaimer ?? null,
      userAgent: deps.describe.userAgent,
      store: deps.describe.store,
      alerts: deps.describe.alerts,
      history: deps.describe.history,
      crest: app.theme.crest ?? 'Watch',
      motif: app.theme.motif ?? 'stone',
    },
    ghosts,
    feed: feed.slice(0, 30),
    archive: await archiveLetters(deps),
    generatedAt: deps.clock.now().toISOString(),
  };
}

export async function ghostDetail(deps: GhostDeps, watch: Watch): Promise<GhostDetail> {
  const [view, history, alerts, unread, letters, past] = await Promise.all([
    ghostView(deps, watch),
    deps.store.history(watch.id, 2),
    deps.store.alerts(watch.id),
    deps.store.unacknowledged(watch.id),
    letterIndex(deps),
    deps.store.pastTimeline(watch.id),
  ]);
  const [current, previous] = history;
  const fields: FieldRow[] = watch.fields.map((field) => {
    const now = current ? displayValue(current.fields[field.name] ?? null) : '—';
    const before = previous ? displayValue(previous.fields[field.name] ?? null) : null;
    const changed = before !== null && before !== now;
    const long = field.kind === 'text' && now.length > 60;
    return {
      name: field.name,
      label: field.label ?? field.name,
      now,
      before,
      changed,
      long,
      segments: long && changed && before !== null ? wordDiff(before, now) : null,
    };
  });
  const lists: ListView[] = watch.lists.map((list) => {
    const items = current?.lists[list.name] ?? [];
    const previousKeys = new Set((previous?.lists[list.name] ?? []).map((item) => item.key));
    return {
      name: list.name,
      label: list.label ?? list.name,
      count: items.length,
      items: items.map((item) => ({
        key: item.key,
        description: describeItem(list, item),
        isNew: previous !== undefined && !previousKeys.has(item.key),
      })),
    };
  });
  const unreadIds = new Set(unread.map((a) => a.id));
  return {
    ...view,
    fields,
    lists,
    alerts: alerts.slice(0, 40).map((alert) => ({ ...alert, acknowledged: !unreadIds.has(alert.id), letter: letters.get(alert.id) ?? null })),
    snapshots: history.map((s) => s.takenAt),
    past,
  };
}
