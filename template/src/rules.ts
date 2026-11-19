/**
 * Rule evaluation: a pure function from (watch, diff) to findings. A finding is one reason to alert,
 * already explained in a plain sentence.
 */
import type { Diff, FieldChange, ListChange } from './diff';
import type { ListItem } from './extract';
import { compareMinorToMajor, compareToTarget, textOf, type MaybeValue } from './normalize';
import type { AlertPact } from './pact';
import { describeFieldChange, describeItem, finish, sentences } from './summary';
import type { Better, FilterCondition, ListSpec, Rule, RuleKind, Severity, Tone, Watch } from './watch';

export interface Finding {
  ruleKind: RuleKind;
  ruleLabel: string;
  severity: Severity;
  field?: string;
  list?: string;
  before?: MaybeValue;
  after?: MaybeValue;
  /** The list item this finding is about, for list rules. */
  item?: ListItem;
  summary: string;
  /** Set when a `stealthEdit` rule marked this change: why it looks like a bait and switch. */
  stealth?: string;
  /** Good or bad news for the reader. Left out when the change has no clear direction. */
  tone?: Exclude<Tone, 'neutral'>;
  /** Set when the finding was judged against a sealed pact (see `pact.ts`). */
  pact?: AlertPact;
}

/** Good or bad news, from the direction a numeric value moved and which direction is better. */
export function toneOf(delta: number | undefined, better: Better | undefined): Exclude<Tone, 'neutral'> | undefined {
  if (!better || delta === undefined || delta === 0) return undefined;
  return (delta > 0) === (better === 'higher') ? 'good' : 'bad';
}

function withTone<T extends Finding>(finding: T, tone: Exclude<Tone, 'neutral'> | undefined): T {
  return tone ? { ...finding, tone } : finding;
}

const DEFAULT_SEVERITY: Record<RuleKind, Severity> = {
  wentUp: 'moan',
  wentDown: 'moan',
  changed: 'moan',
  appeared: 'moan',
  disappeared: 'moan',
  stealthEdit: 'shriek',
  newItem: 'shriek',
  itemRemoved: 'whisper',
  itemChanged: 'moan',
};

export function describeRule(rule: Rule, watch?: Pick<Watch, 'fields' | 'lists'>): string {
  if (rule.label) return rule.label;
  const fieldLabel = (name: string) => watch?.fields.find((f) => f.name === name)?.label ?? name;
  const listLabel = (name: string) => watch?.lists.find((l) => l.name === name)?.label ?? name;
  const filter = (conditions: FilterCondition[] | undefined) =>
    conditions && conditions.length > 0 ? ` where ${conditions.map(describeCondition).join(' and ')}` : '';
  switch (rule.kind) {
    case 'wentUp':
      return `${fieldLabel(rule.field)} goes up${rule.minDelta ? ` by at least ${rule.minDelta}` : ''}`;
    case 'wentDown':
      return `${fieldLabel(rule.field)} goes down${rule.minDelta ? ` by at least ${rule.minDelta}` : ''}`;
    case 'changed':
      return `${fieldLabel(rule.field)} changes`;
    case 'appeared':
      return rule.matching ? `${fieldLabel(rule.field)} starts mentioning /${rule.matching}/` : `${fieldLabel(rule.field)} appears`;
    case 'disappeared':
      return rule.matching ? `${fieldLabel(rule.field)} stops mentioning /${rule.matching}/` : `${fieldLabel(rule.field)} disappears`;
    case 'stealthEdit':
      return `${fieldLabel(rule.field)} changes while ${joinWords(rule.headline.map(fieldLabel))} stay the same`;
    case 'newItem':
      return `new ${listLabel(rule.list)}${filter(rule.where)}`;
    case 'itemRemoved':
      return `${listLabel(rule.list)} removed${filter(rule.where)}`;
    case 'itemChanged':
      return `${listLabel(rule.list)} ${rule.field} ${rule.direction === 'down' ? 'drops' : rule.direction === 'up' ? 'rises' : 'changes'}${filter(rule.where)}`;
  }
}

const OP_WORDS: Record<FilterCondition['op'], string> = {
  eq: 'is',
  neq: 'is not',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  contains: 'contains',
  in: 'is one of',
};

export function describeCondition(condition: FilterCondition): string {
  const value = Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value);
  return `${condition.field} ${OP_WORDS[condition.op]} ${value}`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function sameText(a: string, b: string | number): boolean {
  return a.trim().toLowerCase() === String(b).trim().toLowerCase();
}

function conditionHolds(value: MaybeValue, condition: FilterCondition): boolean {
  const text = textOf(value);
  const target = condition.value;
  // Numeric targets are in the units an app author writes (dollars for money); money is compared
  // exactly in integer cents.
  const order = typeof target === 'number' ? compareToTarget(value, target) : null;
  switch (condition.op) {
    case 'eq':
      return typeof target === 'number' ? order === 0 : !Array.isArray(target) && sameText(text, target);
    case 'neq':
      return !conditionHolds(value, { ...condition, op: 'eq' });
    case 'lt':
      return order !== null && order < 0;
    case 'lte':
      return order !== null && order <= 0;
    case 'gt':
      return order !== null && order > 0;
    case 'gte':
      return order !== null && order >= 0;
    case 'contains':
      return text.toLowerCase().includes(String(target).toLowerCase());
    case 'in': {
      const options = Array.isArray(target) ? target : [target];
      return options.some((option) => conditionHolds(value, { field: condition.field, op: 'eq', value: option }));
    }
  }
}

/** True when the item satisfies every condition. An empty filter matches everything. */
export function matchesFilter(item: ListItem, conditions: FilterCondition[] = []): boolean {
  return conditions.every((condition) => conditionHolds(item.values[condition.field] ?? null, condition));
}

function fieldLabel(watch: Pick<Watch, 'fields'>, name: string): string {
  return watch.fields.find((field) => field.name === name)?.label ?? name;
}

function patternHolds(value: MaybeValue, pattern: string): boolean {
  return new RegExp(pattern, 'i').test(textOf(value));
}

/** Quotes the sentence that matches a pattern, e.g. `"A $12 monthly service fee applies..."`. */
function quoteMatching(text: string, pattern: string): string {
  const regex = new RegExp(pattern, 'i');
  const sentence = sentences(text).find((s) => regex.test(s)) ?? text;
  return finish(`"${sentence}"`);
}

/** `minDelta` is in the units an app author writes: dollars for money, which `delta` holds as cents. */
function meetsMinDelta(change: FieldChange, delta: number, minDelta: number | undefined): boolean {
  if (!minDelta) return true;
  if (change.after?.kind === 'money') {
    const order = compareMinorToMajor(delta, minDelta);
    return order !== null && order >= 0;
  }
  return delta >= minDelta;
}

function evaluateFieldRule(rule: Extract<Rule, { field: string }>, change: FieldChange, watch: Watch): string | null {
  const label = fieldLabel(watch, change.field);
  switch (rule.kind) {
    case 'wentUp':
    case 'wentDown': {
      if (change.type !== 'changed' || change.delta === undefined || change.after?.kind === 'date') return null;
      const delta = rule.kind === 'wentUp' ? change.delta : -change.delta;
      if (delta <= 0 || !meetsMinDelta(change, delta, rule.minDelta)) return null;
      return describeFieldChange(label, change);
    }
    case 'changed':
      return change.type === 'changed' ? describeFieldChange(label, change) : null;
    case 'appeared':
      if (rule.matching) {
        if (!patternHolds(change.after, rule.matching) || patternHolds(change.before, rule.matching)) return null;
        return `${label} now says ${quoteMatching(textOf(change.after), rule.matching)}`;
      }
      return change.type === 'added' ? describeFieldChange(label, change) : null;
    case 'disappeared':
      if (rule.matching) {
        if (patternHolds(change.after, rule.matching) || !patternHolds(change.before, rule.matching)) return null;
        return `${label} no longer says ${quoteMatching(textOf(change.before), rule.matching)}`;
      }
      return change.type === 'removed' ? describeFieldChange(label, change) : null;
    case 'stealthEdit':
      // Decided across fields in applyStealthEdits, not one change at a time.
      return null;
    default:
      return null;
  }
}

function listSpec(watch: Watch, name: string): ListSpec {
  const spec = watch.lists.find((list) => list.name === name);
  return spec ?? { name, itemSelector: '', fields: {}, identity: [] };
}

function evaluateListRule(rule: Extract<Rule, { list: string }>, change: ListChange, watch: Watch): Finding | null {
  if (change.list !== rule.list) return null;
  const spec = listSpec(watch, rule.list);
  const noun = spec.label ?? rule.list;
  const base = {
    ruleKind: rule.kind,
    ruleLabel: describeRule(rule, watch),
    severity: rule.severity ?? DEFAULT_SEVERITY[rule.kind],
    list: rule.list,
  };
  if (rule.kind === 'newItem' && change.type === 'itemAdded' && matchesFilter(change.item, rule.where)) {
    return withTone({ ...base, item: change.item, summary: `New ${noun}: ${describeItem(spec, change.item)}.` }, rule.tone);
  }
  if (rule.kind === 'itemRemoved' && change.type === 'itemRemoved' && matchesFilter(change.item, rule.where)) {
    return withTone({ ...base, item: change.item, summary: `${capitalize(noun)} gone: ${describeItem(spec, change.item)}.` }, rule.tone);
  }
  if (rule.kind === 'itemChanged' && change.type === 'itemChanged' && matchesFilter(change.after, rule.where)) {
    const fieldChange = change.changes.find((c) => c.field === rule.field);
    if (!fieldChange) return null;
    if (rule.direction) {
      if (fieldChange.delta === undefined) return null;
      if (rule.direction === 'up' ? fieldChange.delta <= 0 : fieldChange.delta >= 0) return null;
    }
    const label = spec.fields[rule.field]?.label ?? rule.field;
    return withTone(
      {
        ...base,
        item: change.after,
        before: fieldChange.before,
        after: fieldChange.after,
        summary: `${describeItem(spec, change.after)}: ${describeFieldChange(label, fieldChange)}`,
      },
      rule.tone ?? toneOf(fieldChange.delta, spec.fields[rule.field]?.better),
    );
  }
  return null;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Evaluates every rule of a watch against a diff. The first run of a watch only records a baseline,
 * so it never produces findings: a page you have never seen before has not "changed".
 */
export function evaluateRules(watch: Watch, d: Diff): Finding[] {
  if (d.firstRun) return [];
  const findings: Finding[] = [];
  for (const rule of watch.rules) {
    if ('list' in rule) {
      for (const change of d.lists) {
        const finding = evaluateListRule(rule, change, watch);
        if (finding) findings.push(finding);
      }
      continue;
    }
    for (const change of d.fields) {
      if (change.field !== rule.field) continue;
      const summary = evaluateFieldRule(rule, change, watch);
      if (summary) {
        const better = watch.fields.find((f) => f.name === change.field)?.better;
        const derived = change.type === 'removed' ? 'bad' : toneOf(change.delta, better);
        findings.push(
          withTone(
            {
              ruleKind: rule.kind,
              ruleLabel: describeRule(rule, watch),
              severity: rule.severity ?? DEFAULT_SEVERITY[rule.kind],
              field: change.field,
              before: change.before,
              after: change.after,
              summary,
            },
            rule.tone ?? derived,
          ),
        );
      }
    }
  }
  return applyStealthEdits(watch, d, dedupe(findings));
}

/**
 * A `stealthEdit` rule fires when its field changed and none of its headline fields did. Findings
 * already about that field are marked (and raised to the rule's severity) rather than duplicated;
 * only when no other rule noticed the change does the stealth edit become its own finding.
 */
function applyStealthEdits(watch: Watch, d: Diff, findings: Finding[]): Finding[] {
  const changed = new Set(d.fields.map((c) => c.field));
  let result = findings;
  for (const rule of watch.rules) {
    if (rule.kind !== 'stealthEdit') continue;
    const change = d.fields.find((c) => c.field === rule.field);
    if (!change || rule.headline.some((name) => changed.has(name))) continue;
    const label = fieldLabel(watch, rule.field);
    const headline = rule.headline.map((name) => fieldLabel(watch, name));
    const stealth = `${joinWords(headline)} stayed the same while the ${label.toLowerCase()} changed.`;
    const severity = rule.severity ?? DEFAULT_SEVERITY.stealthEdit;
    const onField = result.filter((f) => f.field === rule.field && !f.list);
    if (onField.length > 0) {
      result = result.map((f) =>
        f.field === rule.field && !f.list
          ? { ...f, stealth, tone: 'bad' as const, severity: LOUDNESS[severity] > LOUDNESS[f.severity] ? severity : f.severity }
          : f,
      );
      continue;
    }
    result = [
      ...result,
      {
        ruleKind: rule.kind,
        ruleLabel: describeRule(rule, watch),
        severity,
        field: rule.field,
        before: change.before,
        after: change.after,
        summary: describeFieldChange(label, change),
        stealth,
        tone: 'bad',
      },
    ];
  }
  return result;
}

const LOUDNESS: Record<Severity, number> = { whisper: 0, moan: 1, shriek: 2 };

/**
 * Two rules can describe the same change (for example `changed` and `wentUp` on one field, or two
 * `newItem` filters matching one listing). Keep one finding per change: the more specific rule for a
 * field, and the loudest rule for a list item.
 */
function dedupe(findings: Finding[]): Finding[] {
  const specific = new Set(findings.filter((f) => f.field && !f.list && f.ruleKind !== 'changed').map((f) => f.field));
  const kept: Finding[] = [];
  const byItem = new Map<string, number>();
  for (const finding of findings) {
    if (finding.ruleKind === 'changed' && finding.field && !finding.list && specific.has(finding.field)) continue;
    if (finding.list && finding.item) {
      const key = `${finding.ruleKind}:${finding.list}:${finding.item.key}`;
      const index = byItem.get(key);
      if (index !== undefined) {
        const existing = kept[index] as Finding;
        if (LOUDNESS[finding.severity] > LOUDNESS[existing.severity]) kept[index] = finding;
        continue;
      }
      byItem.set(key, kept.length);
    }
    kept.push(finding);
  }
  return kept;
}
