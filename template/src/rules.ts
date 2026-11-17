/**
 * Rule evaluation: a pure function from (watch, diff) to findings. A finding is one reason to alert,
 * already explained in a plain sentence.
 */
import type { Diff, FieldChange, ListChange } from './diff';
import type { ListItem } from './extract';
import { numericValue, textOf, type MaybeValue } from './normalize';
import { describeFieldChange, describeItem, finish, sentences } from './summary';
import type { FilterCondition, ListSpec, Rule, RuleKind, Severity, Watch } from './watch';

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
}

const DEFAULT_SEVERITY: Record<RuleKind, Severity> = {
  wentUp: 'moan',
  wentDown: 'moan',
  changed: 'moan',
  appeared: 'moan',
  disappeared: 'moan',
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

function sameText(a: string, b: string | number): boolean {
  return a.trim().toLowerCase() === String(b).trim().toLowerCase();
}

function conditionHolds(value: MaybeValue, condition: FilterCondition): boolean {
  const text = textOf(value);
  const number = numericValue(value);
  const target = condition.value;
  switch (condition.op) {
    case 'eq':
      return typeof target === 'number' ? number === target : !Array.isArray(target) && sameText(text, target);
    case 'neq':
      return !conditionHolds(value, { ...condition, op: 'eq' });
    case 'lt':
      return number !== null && typeof target === 'number' && number < target;
    case 'lte':
      return number !== null && typeof target === 'number' && number <= target;
    case 'gt':
      return number !== null && typeof target === 'number' && number > target;
    case 'gte':
      return number !== null && typeof target === 'number' && number >= target;
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

function evaluateFieldRule(rule: Extract<Rule, { field: string }>, change: FieldChange, watch: Watch): string | null {
  const label = fieldLabel(watch, change.field);
  switch (rule.kind) {
    case 'wentUp':
    case 'wentDown': {
      if (change.type !== 'changed' || change.delta === undefined || change.after?.kind === 'date') return null;
      const delta = rule.kind === 'wentUp' ? change.delta : -change.delta;
      if (delta <= 0 || delta < (rule.minDelta ?? 0)) return null;
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
    return { ...base, item: change.item, summary: `New ${noun}: ${describeItem(spec, change.item)}.` };
  }
  if (rule.kind === 'itemRemoved' && change.type === 'itemRemoved' && matchesFilter(change.item, rule.where)) {
    return { ...base, item: change.item, summary: `${capitalize(noun)} gone: ${describeItem(spec, change.item)}.` };
  }
  if (rule.kind === 'itemChanged' && change.type === 'itemChanged' && matchesFilter(change.after, rule.where)) {
    const fieldChange = change.changes.find((c) => c.field === rule.field);
    if (!fieldChange) return null;
    if (rule.direction) {
      if (fieldChange.delta === undefined) return null;
      if (rule.direction === 'up' ? fieldChange.delta <= 0 : fieldChange.delta >= 0) return null;
    }
    const label = spec.fields[rule.field]?.label ?? rule.field;
    return {
      ...base,
      item: change.after,
      before: fieldChange.before,
      after: fieldChange.after,
      summary: `${describeItem(spec, change.after)}: ${describeFieldChange(label, fieldChange)}`,
    };
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
        findings.push({
          ruleKind: rule.kind,
          ruleLabel: describeRule(rule, watch),
          severity: rule.severity ?? DEFAULT_SEVERITY[rule.kind],
          field: change.field,
          before: change.before,
          after: change.after,
          summary,
        });
      }
    }
  }
  return dedupe(findings);
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
