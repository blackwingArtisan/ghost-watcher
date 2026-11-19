/**
 * Seal the pact: the reader applied for an offer, so the ghost keeps the page as it was that day.
 * This module holds the pact's types and the pure comparison. Sealing (the effects) lives in
 * `sealing.ts` and storage in `GhostStore`.
 *
 * Every night is judged against the previous night as before, and against the pact too. The pact
 * comparison runs the same normalized diff and the same rules as a nightly check, so `minDelta`,
 * tone and `stealthEdit` mean the same thing. Money stays in integer cents throughout. Nothing here
 * reads a clock: dates come from stored ISO strings.
 */
import type { Alert } from './alerts/types';
import { compareValues, diff, type Diff, type FieldChange, type Snapshot } from './diff';
import type { Extraction } from './extract';
import { displayValue, type MaybeValue } from './normalize';
import { evaluateRules, toneOf, type Finding } from './rules';
import { formatDelta, letterDate, textChange } from './summary';
import type { Severity, Watch } from './watch';

export const PACT_VERSION = 1;
/** The demo back-dates its pacts by this many days. */
export const DEMO_PACT_AGE_DAYS = 40;

export interface PactArchive {
  archiveUrl: string | null;
  archivedAt: string | null;
  /** `PageArchiver.label`, e.g. `the Internet Archive`. */
  archivedBy: string | null;
  /** Why there is no archived copy. */
  note?: string;
}

/** `pacts/<watchId>/pact.json`. */
export interface PactRecord {
  version: typeof PACT_VERSION;
  watchId: string;
  watchName: string;
  /** The watched page, as the snapshot holds it. */
  url: string;
  /** The injected clock's time at sealing: "the day you applied". */
  sealedAt: string;
  /** `takenAt` of the sealed reading, so the reader can see how old it was. */
  snapshotTakenAt: string;
  /** `snapshotSha256` of the sealed snapshot, which is also the SHA-256 of its stored file. */
  sha256: string;
  archive: PactArchive;
  seeded?: 'demo';
}

export interface Pact extends PactRecord {
  snapshot: Snapshot;
}

export type PactReading =
  | { status: 'none' }
  | { status: 'sealed'; pact: Pact }
  | { status: 'corrupt'; reason: string };

/** What an alert keeps of the pact (`Alert.pact`). */
export interface AlertPact {
  sealedAt: string;
  sha256: string;
  archive: PactArchive;
  seeded?: 'demo';
  relation: 'differs' | 'restored';
  /** The field as the pact snapshot holds it. Null means the pact did not show it. */
  promised: MaybeValue;
  /** Direction of now against promised, from the field's `better`. */
  tone?: 'good' | 'bad';
  /** One plain sentence about the difference. */
  note: string;
}

const LOUDNESS: Record<Severity, number> = { whisper: 0, moan: 1, shriek: 2 };

const quoted = (text: string, max = 140): string => `"${text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text}"`;

/**
 * One sentence about a field against the pact, e.g.
 * `On Oct 10, 2026, the day you applied, Bonus was $400; it is now $300 (-$100).`
 */
export function pactNote(
  label: string,
  promised: MaybeValue,
  now: MaybeValue,
  sealedAt: string,
  relation: 'differs' | 'restored',
): string {
  const day = letterDate(sealedAt);
  if (relation === 'restored') {
    const detail = promised !== null && promised.kind !== 'text' ? `${label}: ${displayValue(promised)}` : label;
    return `The page is back to what it said on ${day}, the day you applied (${detail}).`;
  }
  const lead = `On ${day}, the day you applied,`;
  if (promised === null) return `${lead} the page did not show ${label}; it now says ${quoteValue(now)}.`;
  if (now === null) return `${lead} ${label} was ${quoteValue(promised)}; the page no longer shows it.`;
  if (promised.kind === 'text' && now.kind === 'text') {
    const { added, removed } = textChange(promised.text, now.text);
    const parts = [
      ...(removed.length ? [`it no longer says ${removed.map((s) => quoted(s)).join(' and ')}`] : []),
      ...(added.length ? [`it now says ${added.map((s) => quoted(s)).join(' and ')}`] : []),
    ];
    return `${lead} ${label} read differently: ${parts.length ? parts.join('; ') : `it now says ${quoted(now.text)}`}.`;
  }
  const change = compareValues(label, promised, now);
  return `${lead} ${label} was ${quoteValue(promised)}; it is now ${quoteValue(now)}${change ? formatDelta(change) : ''}.`;
}

function quoteValue(value: MaybeValue): string {
  return value !== null && value.kind === 'text' ? quoted(value.text) : displayValue(value);
}

/** The letter for an alert: `match` only for better terms with no bait and switch. */
export function pactVariant(alert: Pick<Alert, 'pact' | 'stealth'>): 'dispute' | 'match' {
  return alert.pact?.relation === 'differs' && alert.pact.tone === 'good' && !alert.stealth ? 'match' : 'dispute';
}

function fieldLabel(watch: Watch, name: string): string {
  return watch.fields.find((field) => field.name === name)?.label ?? name;
}

function toneAgainst(watch: Watch, change: FieldChange): 'good' | 'bad' | undefined {
  if (change.type === 'removed') return 'bad';
  return toneOf(change.delta, watch.fields.find((field) => field.name === change.field)?.better);
}

function loudest(findings: Finding[]): Finding | undefined {
  return findings.reduce<Finding | undefined>((top, f) => (!top || LOUDNESS[f.severity] > LOUDNESS[top.severity] ? f : top), undefined);
}

/**
 * Judges tonight's findings against the pact. A field that changed tonight is checked against the
 * value it had on the day the reader applied:
 *
 *  - still different: the finding carries a pact reference (and wins over a quieter nightly one);
 *  - small steps that only add up: a finding is raised on the night the total crosses a rule;
 *  - back to the promised value: the finding is marked `restored`.
 *
 * Fields that did not change tonight raise nothing, and list findings pass through untouched.
 */
export function comparePact(watch: Watch, pact: Pact, current: Extraction, nightly: Diff, findings: Finding[]): Finding[] {
  if (nightly.firstRun || nightly.fields.length === 0) return findings;
  const since = diff(pact.snapshot, current);
  const sinceFindings = evaluateRules(watch, since).filter((f) => f.field && !f.list);
  const prefix = `Since you applied on ${letterDate(pact.sealedAt)}:`;

  const base = { sealedAt: pact.sealedAt, sha256: pact.sha256, archive: pact.archive, ...(pact.seeded ? { seeded: pact.seeded } : {}) };
  const groups = new Map<string, Finding[]>();
  for (const name of new Set(nightly.fields.map((change) => change.field))) {
    const own = findings.filter((f) => f.field === name && !f.list);
    const label = fieldLabel(watch, name);
    const sinceChange = since.fields.find((change) => change.field === name);
    const promised = pact.snapshot.fields[name] ?? null;

    if (!sinceChange) {
      const note = pactNote(label, promised, current.fields[name] ?? null, pact.sealedAt, 'restored');
      groups.set(name, own.map((f) => ({ ...f, pact: { ...base, relation: 'restored', promised, note } })));
      continue;
    }

    const top = loudest(sinceFindings.filter((f) => f.field === name));
    const tone = top?.tone ?? toneAgainst(watch, sinceChange);
    const note = pactNote(label, sinceChange.before, sinceChange.after, pact.sealedAt, 'differs');
    const reference = (f: Pick<Finding, 'stealth'>): AlertPact => {
      const t = f.stealth ? 'bad' : tone;
      return { ...base, relation: 'differs', promised: sinceChange.before, ...(t ? { tone: t } : {}), note };
    };
    const raised = (f: Finding): Finding => ({ ...f, summary: `${prefix} ${f.summary}`, pact: reference(f) });

    const outranks =
      top !== undefined &&
      own.length > 0 &&
      (own.every((f) => LOUDNESS[top.severity] > LOUDNESS[f.severity]) || (Boolean(top.stealth) && !own.some((f) => f.stealth)));
    if (top && (own.length === 0 || outranks)) groups.set(name, [raised(top)]);
    else groups.set(name, own.map((f) => ({ ...f, pact: reference(f) })));
  }

  const result: Finding[] = [];
  const emitted = new Set<string>();
  for (const finding of findings) {
    const name = finding.field;
    if (!name || finding.list || !groups.has(name)) {
      result.push(finding);
    } else if (!emitted.has(name)) {
      emitted.add(name);
      result.push(...(groups.get(name) ?? []));
    }
  }
  for (const [name, group] of groups) if (!emitted.has(name)) result.push(...group);
  return result;
}
