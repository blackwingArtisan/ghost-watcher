/**
 * Watch definitions: what page to haunt, which parts of it matter, and which changes deserve an alert.
 *
 * Watches are plain data (plus an optional `describe` template string), so they can be listed in the
 * dashboard, stored, and diffed without running any app code.
 */

/** How a watched value is normalized before it is compared. */
export type FieldKind = 'text' | 'money' | 'number' | 'date' | 'percent' | 'url';

/** One value read from a page. */
export interface FieldSpec {
  /** Stable key used in snapshots, rules and alerts, e.g. `bonus`. */
  name: string;
  /** Human label used in alert sentences, e.g. `Bonus amount`. Defaults to `name`. */
  label?: string;
  /** CSS selector for the element that holds the value. The first match wins. */
  selector: string;
  kind: FieldKind;
  /** Read this attribute instead of the element's text (for example `href` or `datetime`). */
  attribute?: string;
  /**
   * Optional regular expression applied to the element text. When it has a capture group, the first
   * group is used; otherwise the whole match. Useful when a value sits inside a sentence.
   */
  pattern?: string;
  /**
   * Which direction is good news for the reader: `higher` for a bonus or a rate, `lower` for a fee or
   * a deposit. Sets the tone of a change (good or bad), so the dashboard can color it the right way.
   */
  better?: Better;
}

/** Which way a numeric value should move to be good news. */
export type Better = 'higher' | 'lower';

/** Whether a change is good or bad news for the reader. Changes with no clear direction are neutral. */
export type Tone = 'good' | 'bad' | 'neutral';

/** One value read from each item of a repeated block (a listing card, a table row). */
export interface ListFieldSpec {
  selector: string;
  kind: FieldKind;
  attribute?: string;
  pattern?: string;
  label?: string;
  better?: Better;
}

/** A repeated block on a page, such as a list of listings or a table of permits. */
export interface ListSpec {
  name: string;
  label?: string;
  /** CSS selector matching each item container. */
  itemSelector: string;
  /** Fields read relative to each item container. Use `:self` to read the container itself. */
  fields: Record<string, ListFieldSpec>;
  /** Field names whose values identify an item across snapshots (for example an id or address). */
  identity: string[];
  /**
   * Template for describing an item in alert sentences, with `{field}` placeholders,
   * e.g. `{beds} bd in {neighborhood} for {price}`.
   */
  describe?: string;
  /** A shorter template for the card's newest-match line, e.g. `{beds} bd {price} {neighborhood}`. */
  brief?: string;
  /** Label for that line on the card. Default `Newest match`. */
  matchLabel?: string;
}

export type FilterOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'in';

/** A condition on a list item field. All conditions in a filter must match. */
export interface FilterCondition {
  field: string;
  op: FilterOp;
  value: string | number | Array<string | number>;
}

export type Severity = 'whisper' | 'moan' | 'shriek';

interface RuleBase {
  /** Optional override for the rule's name in alerts and the dashboard. */
  label?: string;
  /** How loudly the ghost reacts. Defaults depend on the rule kind. */
  severity?: Severity;
  /** Good or bad news. Defaults from the field's `better` direction, or `bad` for a value that disappears. */
  tone?: Exclude<Tone, 'neutral'>;
}

export type Rule =
  | (RuleBase & { kind: 'wentUp'; field: string; minDelta?: number })
  | (RuleBase & { kind: 'wentDown'; field: string; minDelta?: number })
  | (RuleBase & { kind: 'changed'; field: string })
  | (RuleBase & { kind: 'appeared'; field: string; matching?: string })
  | (RuleBase & { kind: 'disappeared'; field: string; matching?: string })
  /**
   * A stealth edit: `field` (usually the fine print) changed while every `headline` field stayed the
   * same. Findings on `field` are marked as a bait and switch instead of producing a second alert.
   */
  | (RuleBase & { kind: 'stealthEdit'; field: string; headline: string[] })
  | (RuleBase & { kind: 'newItem'; list: string; where?: FilterCondition[] })
  | (RuleBase & { kind: 'itemRemoved'; list: string; where?: FilterCondition[] })
  | (RuleBase & {
      kind: 'itemChanged';
      list: string;
      field: string;
      direction?: 'up' | 'down';
      where?: FilterCondition[];
    });

export type RuleKind = Rule['kind'];

export interface Watch {
  /** URL-safe id, unique within an app. */
  id: string;
  /** Display name of the ghost, e.g. `Lanternfield Savings: Everyday Checking`. */
  name: string;
  /** The page that is fetched, checked against robots.txt, hashed and archived. */
  url: string;
  /**
   * Optional address that every human-facing text shows instead of `url`: letters, packs, alert emails
   * and the dashboard. Demos use it to show a reserved `.example` address in place of the fixture
   * server. Fetching, robots.txt, hashing and archiving never use it.
   */
  displayUrl?: string;
  /** Short line shown under the ghost's name. */
  subtitle?: string;
  fields: FieldSpec[];
  lists: ListSpec[];
  rules: Rule[];
  /** Minimum time between scheduled checks of this URL. */
  intervalMs: number;
  /** Free-form labels for grouping in the dashboard. */
  tags: string[];
}

export type WatchInput = Omit<Watch, 'intervalMs' | 'lists' | 'tags' | 'fields'> & {
  intervalMs?: number;
  lists?: ListSpec[];
  fields?: FieldSpec[];
  tags?: string[];
};

export const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_INTERVAL_MS = 6 * HOUR_MS;

export class WatchDefinitionError extends Error {
  override name = 'WatchDefinitionError';
}

/** The address people read: the watch's display URL, or the URL it fetches. */
export function shownUrl(watch: Pick<Watch, 'url' | 'displayUrl'>): string {
  return watch.displayUrl ?? watch.url;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Validates a watch definition and fills in defaults. Throws `WatchDefinitionError` on mistakes. */
export function defineWatch(input: WatchInput): Watch {
  const watch: Watch = {
    ...input,
    fields: input.fields ?? [],
    lists: input.lists ?? [],
    tags: input.tags ?? [],
    intervalMs: input.intervalMs ?? DEFAULT_INTERVAL_MS,
  };
  const problems = validateWatch(watch);
  if (problems.length > 0) {
    throw new WatchDefinitionError(`Watch "${input.id}" is invalid: ${problems.join('; ')}`);
  }
  return watch;
}

export function validateWatch(watch: Watch): string[] {
  const problems: string[] = [];
  if (!ID_PATTERN.test(watch.id)) problems.push('id must be lowercase letters, digits and dashes');
  if (!watch.name.trim()) problems.push('name is required');
  try {
    const url = new URL(watch.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') problems.push('url must be http or https');
  } catch {
    problems.push(`url "${watch.url}" is not a valid URL`);
  }
  if (watch.displayUrl !== undefined) {
    try {
      const shown = new URL(watch.displayUrl);
      if (shown.protocol !== 'http:' && shown.protocol !== 'https:') problems.push('displayUrl must be http or https');
    } catch {
      problems.push(`displayUrl "${watch.displayUrl}" is not a valid URL`);
    }
  }
  if (watch.fields.length === 0 && watch.lists.length === 0) {
    problems.push('a watch needs at least one field or list');
  }
  if (!(watch.intervalMs >= 0)) problems.push('intervalMs must be zero or more');

  const fieldNames = new Set<string>();
  for (const field of watch.fields) {
    if (fieldNames.has(field.name)) problems.push(`duplicate field "${field.name}"`);
    fieldNames.add(field.name);
    if (field.pattern) checkPattern(field.pattern, `field "${field.name}"`, problems);
  }
  const lists = new Map<string, ListSpec>();
  for (const list of watch.lists) {
    if (lists.has(list.name) || fieldNames.has(list.name)) problems.push(`duplicate name "${list.name}"`);
    lists.set(list.name, list);
    if (list.identity.length === 0) problems.push(`list "${list.name}" needs at least one identity field`);
    for (const key of list.identity) {
      if (!(key in list.fields)) problems.push(`list "${list.name}" identity field "${key}" is not defined`);
    }
    for (const [name, spec] of Object.entries(list.fields)) {
      if (spec.pattern) checkPattern(spec.pattern, `list field "${list.name}.${name}"`, problems);
    }
  }

  for (const rule of watch.rules) {
    if ('field' in rule && !('list' in rule)) {
      if (!fieldNames.has(rule.field)) problems.push(`rule ${rule.kind} refers to unknown field "${rule.field}"`);
      if ((rule.kind === 'appeared' || rule.kind === 'disappeared') && rule.matching) {
        checkPattern(rule.matching, `rule ${rule.kind}`, problems);
      }
      if (rule.kind === 'stealthEdit') {
        if (rule.headline.length === 0) problems.push('rule stealthEdit needs at least one headline field');
        for (const name of rule.headline) {
          if (!fieldNames.has(name)) problems.push(`rule stealthEdit refers to unknown headline field "${name}"`);
          if (name === rule.field) problems.push(`rule stealthEdit cannot use "${name}" as its own headline`);
        }
      }
      continue;
    }
    if ('list' in rule) {
      const list = lists.get(rule.list);
      if (!list) {
        problems.push(`rule ${rule.kind} refers to unknown list "${rule.list}"`);
        continue;
      }
      if (rule.kind === 'itemChanged' && !(rule.field in list.fields)) {
        problems.push(`rule itemChanged refers to unknown field "${rule.list}.${rule.field}"`);
      }
      for (const condition of rule.where ?? []) {
        if (!(condition.field in list.fields)) {
          problems.push(`filter refers to unknown field "${rule.list}.${condition.field}"`);
        }
      }
    }
  }
  return problems;
}

function checkPattern(pattern: string, where: string, problems: string[]): void {
  try {
    new RegExp(pattern, 'i');
  } catch {
    problems.push(`${where} has an invalid pattern`);
  }
}

/** Throws if two watches in an app share an id. */
export function assertUniqueIds(watches: readonly Watch[]): void {
  const seen = new Set<string>();
  for (const watch of watches) {
    if (seen.has(watch.id)) throw new WatchDefinitionError(`Duplicate watch id "${watch.id}"`);
    seen.add(watch.id);
  }
}

/** Readable builders for rules, so app code reads like a sentence. */
export const rules = {
  wentUp: (field: string, options: { minDelta?: number } & RuleBase = {}): Rule => ({ kind: 'wentUp', field, ...options }),
  wentDown: (field: string, options: { minDelta?: number } & RuleBase = {}): Rule => ({ kind: 'wentDown', field, ...options }),
  changed: (field: string, options: RuleBase = {}): Rule => ({ kind: 'changed', field, ...options }),
  appeared: (field: string, options: { matching?: string } & RuleBase = {}): Rule => ({ kind: 'appeared', field, ...options }),
  disappeared: (field: string, options: { matching?: string } & RuleBase = {}): Rule => ({
    kind: 'disappeared',
    field,
    ...options,
  }),
  /** Fires when `field` changes while every `headline` field stays the same (a bait and switch). */
  stealthEdit: (field: string, headline: string[], options: RuleBase = {}): Rule => ({ kind: 'stealthEdit', field, headline, ...options }),
  newItem: (list: string, where: FilterCondition[] = [], options: RuleBase = {}): Rule => ({
    kind: 'newItem',
    list,
    where,
    ...options,
  }),
  itemRemoved: (list: string, where: FilterCondition[] = [], options: RuleBase = {}): Rule => ({
    kind: 'itemRemoved',
    list,
    where,
    ...options,
  }),
  itemChanged: (
    list: string,
    field: string,
    options: { direction?: 'up' | 'down'; where?: FilterCondition[] } & RuleBase = {},
  ): Rule => ({ kind: 'itemChanged', list, field, ...options }),
};

/** Readable builders for filter conditions. */
export const where = {
  eq: (field: string, value: string | number): FilterCondition => ({ field, op: 'eq', value }),
  neq: (field: string, value: string | number): FilterCondition => ({ field, op: 'neq', value }),
  lt: (field: string, value: number): FilterCondition => ({ field, op: 'lt', value }),
  atMost: (field: string, value: number): FilterCondition => ({ field, op: 'lte', value }),
  gt: (field: string, value: number): FilterCondition => ({ field, op: 'gt', value }),
  atLeast: (field: string, value: number): FilterCondition => ({ field, op: 'gte', value }),
  contains: (field: string, value: string): FilterCondition => ({ field, op: 'contains', value }),
  oneOf: (field: string, values: Array<string | number>): FilterCondition => ({ field, op: 'in', value: values }),
};
