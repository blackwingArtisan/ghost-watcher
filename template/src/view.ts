/** View models for the dashboard and its JSON API. */
import type { Alert } from './alerts/types';
import type { GhostDeps } from './config';
import { displayValue, type MaybeValue } from './normalize';
import { describeRule } from './rules';
import { nextEligibleAt } from './runner';
import { describeItem, wordDiff, type WordSegment } from './summary';
import type { Severity, Watch } from './watch';

export type GhostState = 'unborn' | 'dormant' | 'restless' | 'blocked' | 'lost';

export interface Reading {
  label: string;
  value: string;
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
  readings: Reading[];
  rules: string[];
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
    /** True when the dashboard runs in demo mode (the server sets it). */
    demo?: boolean;
  };
  ghosts: GhostView[];
  feed: FeedEntry[];
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

export async function ghostView(deps: GhostDeps, watch: Watch): Promise<GhostView> {
  const [status, unread, snapshot] = await Promise.all([
    deps.store.status(watch.id),
    deps.store.unacknowledged(watch.id),
    deps.store.latestSnapshot(watch.id),
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
    readings.push({ label: field.label ?? field.name, value: snapshot ? displayValue(value) : '—' });
  }
  for (const list of watch.lists) {
    readings.push({ label: list.label ?? list.name, value: snapshot ? `${snapshot.lists[list.name]?.length ?? 0} on page` : '—' });
  }
  const next = nextEligibleAt(watch, status);
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
    lastMessage: status.lastMessage ?? 'Not yet risen. Summon it to take a first look.',
    nextEligibleAt: next ? next.toISOString() : null,
    interval: formatInterval(watch.intervalMs),
    checks: status.checks,
    readings,
    rules: watch.rules.map((rule) => describeRule(rule, watch)),
  };
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
    },
    ghosts,
    feed: feed.slice(0, 30),
    generatedAt: deps.clock.now().toISOString(),
  };
}

export async function ghostDetail(deps: GhostDeps, watch: Watch): Promise<GhostDetail> {
  const [view, history, alerts, unread, letters] = await Promise.all([
    ghostView(deps, watch),
    deps.store.history(watch.id, 2),
    deps.store.alerts(watch.id),
    deps.store.unacknowledged(watch.id),
    letterIndex(deps),
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
  };
}
