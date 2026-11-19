/**
 * Semantic diff of two snapshots. It compares canonical values, never raw HTML, so a page can be
 * re-themed, re-ordered or re-stamped without the ghost stirring.
 */
import type { Extraction, ListItem } from './extract';
import { canonical, numericValue, valuesEqual, type MaybeValue } from './normalize';

export interface Snapshot extends Extraction {
  watchId: string;
  url: string;
  /** ISO timestamp of the fetch that produced this snapshot. */
  takenAt: string;
}

export interface FieldChange {
  field: string;
  type: 'added' | 'removed' | 'changed';
  before: MaybeValue;
  after: MaybeValue;
  /**
   * `after - before` when both values are numeric: integer minor units (cents) for money, days for
   * dates, otherwise the plain difference.
   */
  delta?: number;
}

export type ListChange =
  | { type: 'itemAdded'; list: string; item: ListItem }
  | { type: 'itemRemoved'; list: string; item: ListItem }
  | { type: 'itemChanged'; list: string; before: ListItem; after: ListItem; changes: FieldChange[] };

export interface Diff {
  /** True when there was no previous snapshot: everything is "added" and this run sets the baseline. */
  firstRun: boolean;
  fields: FieldChange[];
  lists: ListChange[];
}

export function compareValues(field: string, before: MaybeValue, after: MaybeValue): FieldChange | null {
  if (valuesEqual(before, after)) return null;
  if (before === null) return { field, type: 'added', before, after };
  if (after === null) return { field, type: 'removed', before, after };
  const change: FieldChange = { field, type: 'changed', before, after };
  const a = numericValue(before);
  const b = numericValue(after);
  if (a !== null && b !== null && before.kind === after.kind) {
    // Money is integer cents, so its delta is exact. Other kinds are rounded to hide float dust.
    change.delta = before.kind === 'money' ? b - a : Math.round((b - a) * 100) / 100;
  }
  return change;
}

function diffRecords(before: Record<string, MaybeValue>, after: Record<string, MaybeValue>): FieldChange[] {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changes: FieldChange[] = [];
  for (const name of names) {
    const change = compareValues(name, before[name] ?? null, after[name] ?? null);
    if (change) changes.push(change);
  }
  return changes;
}

function diffList(list: string, before: ListItem[], after: ListItem[]): ListChange[] {
  const previous = new Map(before.map((item) => [item.key, item]));
  const current = new Map(after.map((item) => [item.key, item]));
  const changes: ListChange[] = [];
  for (const item of after) {
    const old = previous.get(item.key);
    if (!old) {
      changes.push({ type: 'itemAdded', list, item });
      continue;
    }
    const fieldChanges = diffRecords(old.values, item.values);
    if (fieldChanges.length > 0) changes.push({ type: 'itemChanged', list, before: old, after: item, changes: fieldChanges });
  }
  for (const item of before) {
    if (!current.has(item.key)) changes.push({ type: 'itemRemoved', list, item });
  }
  return changes;
}

/** Pure diff of the previous snapshot (if any) against the current extraction. */
export function diff(previous: Extraction | undefined, current: Extraction): Diff {
  const before: Extraction = previous ?? { fields: {}, lists: {} };
  const lists: ListChange[] = [];
  const listNames = [...new Set([...Object.keys(before.lists), ...Object.keys(current.lists)])];
  for (const name of listNames) {
    lists.push(...diffList(name, before.lists[name] ?? [], current.lists[name] ?? []));
  }
  return { firstRun: previous === undefined, fields: diffRecords(before.fields, current.fields), lists };
}

export function isEmptyDiff(d: Diff): boolean {
  return d.fields.length === 0 && d.lists.length === 0;
}

/** A short fingerprint of an extraction, used to tell whether anything watched changed at all. */
export function fingerprint(extraction: Extraction): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(extraction.fields).sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`${name}=${canonical(value)}`);
  }
  for (const [name, items] of Object.entries(extraction.lists).sort(([a], [b]) => a.localeCompare(b))) {
    const keys = items.map((item) => `${item.key}{${Object.entries(item.values).map(([k, v]) => `${k}=${canonical(v)}`).join(',')}}`);
    parts.push(`${name}=[${keys.sort().join(';')}]`);
  }
  let hash = 0x811c9dc5;
  const text = parts.join('\n');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
