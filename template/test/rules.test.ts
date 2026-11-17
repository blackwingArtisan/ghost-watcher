import { describe, expect, it } from 'vitest';
import { diff } from '../src/diff';
import type { Extraction, ListItem } from '../src/extract';
import { normalizeValue } from '../src/normalize';
import { describeCondition, describeRule, evaluateRules, matchesFilter } from '../src/rules';
import { defineWatch, rules, where, WatchDefinitionError } from '../src/watch';

const money = (raw: string) => normalizeValue(raw, 'money');
const text = (raw: string) => normalizeValue(raw, 'text');

function fields(values: Record<string, string | null>, kinds: Record<string, 'money' | 'text' | 'date'>): Extraction {
  const out: Extraction = { fields: {}, lists: {} };
  for (const [name, raw] of Object.entries(values)) out.fields[name] = raw === null ? null : normalizeValue(raw, kinds[name] ?? 'text');
  return out;
}

const bonusWatch = defineWatch({
  id: 'bonus',
  name: 'Bonus',
  url: 'https://example.com',
  fields: [
    { name: 'bonus', label: 'Bonus', selector: '.b', kind: 'money' },
    { name: 'deadline', label: 'Deadline', selector: '.d', kind: 'date' },
    { name: 'fine', label: 'Fine print', selector: '.f', kind: 'text' },
  ],
  rules: [
    rules.wentUp('bonus', { severity: 'shriek' }),
    rules.wentDown('bonus', { minDelta: 50 }),
    rules.changed('bonus'),
    rules.changed('deadline'),
    rules.appeared('fine', { matching: 'monthly fee' }),
    rules.disappeared('fine', { matching: 'no annual fee' }),
    rules.disappeared('bonus'),
  ],
});
const kinds = { bonus: 'money', deadline: 'date', fine: 'text' } as const;

function run(before: Record<string, string | null>, after: Record<string, string | null>) {
  return evaluateRules(bonusWatch, diff(fields(before, kinds), fields(after, kinds)));
}

describe('field rules', () => {
  const base = { bonus: '$300', deadline: 'Jan 15, 2027', fine: 'No annual fee. Terms apply.' };

  it('never fires on the first run (a baseline is not a change)', () => {
    expect(evaluateRules(bonusWatch, diff(undefined, fields(base, kinds)))).toEqual([]);
  });

  it('wentUp fires on an increase, and the generic changed rule is folded into it', () => {
    const findings = run(base, { ...base, bonus: '$400' });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleKind: 'wentUp', severity: 'shriek', summary: 'Bonus went up from $300 to $400 (+$100).' });
  });

  it('wentDown respects minDelta', () => {
    expect(run(base, { ...base, bonus: '$280' }).map((f) => f.ruleKind)).toEqual(['changed']);
    expect(run(base, { ...base, bonus: '$200' }).map((f) => f.ruleKind)).toEqual(['wentDown']);
  });

  it('changed explains date moves in days', () => {
    const [finding] = run(base, { ...base, deadline: 'Dec 31, 2026' });
    expect(finding?.summary).toBe('Deadline moved from Jan 15, 2027 to Dec 31, 2026 (15 days sooner).');
  });

  it('appeared and disappeared with a pattern quote the sentence', () => {
    const findings = run(base, { ...base, fine: 'A $12 monthly fee applies. Terms apply.' });
    const kindsFound = findings.map((f) => f.ruleKind).sort();
    expect(kindsFound).toEqual(['appeared', 'disappeared']);
    expect(findings.find((f) => f.ruleKind === 'appeared')?.summary).toBe('Fine print now says "A $12 monthly fee applies."');
    expect(findings.find((f) => f.ruleKind === 'disappeared')?.summary).toBe('Fine print no longer says "No annual fee."');
  });

  it('disappeared fires when the whole region vanishes', () => {
    const findings = run(base, { ...base, bonus: null });
    expect(findings.map((f) => f.ruleKind)).toEqual(['disappeared']);
    expect(findings[0]?.summary).toBe('Bonus disappeared (it was "$300").');
  });

  it('noise produces no findings', () => {
    expect(run(base, { bonus: '$300.00', deadline: '01/15/2027', fine: 'No annual  fee.  Terms apply.' })).toEqual([]);
  });

  it('wentUp ignores non-numeric changes instead of failing', () => {
    expect(run(base, { ...base, bonus: 'Ask in branch' }).map((f) => f.ruleKind)).toEqual(['changed']);
  });
});

describe('list rules and filters', () => {
  const item = (key: string, price: string, beds: string, hood: string): ListItem => ({
    key,
    values: { id: text(key), price: money(price), beds: normalizeValue(beds, 'number'), hood: text(hood) },
  });
  const listWatch = defineWatch({
    id: 'homes',
    name: 'Homes',
    url: 'https://example.com/homes',
    lists: [
      {
        name: 'homes',
        label: 'home',
        itemSelector: 'li',
        identity: ['id'],
        describe: '{beds} bd in {hood} for {price}',
        fields: {
          id: { selector: ':self', kind: 'text' },
          price: { selector: '.p', kind: 'money' },
          beds: { selector: '.b', kind: 'number' },
          hood: { selector: '.h', kind: 'text' },
        },
      },
    ],
    rules: [
      rules.newItem('homes', [where.atLeast('beds', 2), where.atMost('price', 2000), where.oneOf('hood', ['Old Mill', 'Riverside'])], { severity: 'shriek' }),
      rules.newItem('homes', [where.atMost('price', 1500)]),
      rules.itemRemoved('homes'),
      rules.itemChanged('homes', 'price', { direction: 'down' }),
    ],
  });
  const snapshot = (...items: ListItem[]): Extraction => ({ fields: {}, lists: { homes: items } });
  const a = item('a', '$1,900', '2', 'Old Mill');
  const before = snapshot(a, item('b', '$2,500', '3', 'Riverside'));

  it('newItem fires only for items matching every condition', () => {
    const after = snapshot(a, item('b', '$2,500', '3', 'Riverside'), item('c', '$1,950', '2', 'old mill'), item('d', '$1,800', '1', 'Old Mill'), item('e', '$1,700', '2', 'Hilltop'));
    const findings = evaluateRules(listWatch, diff(before, after));
    expect(findings.map((f) => f.summary)).toEqual(['New home: 2 bd in old mill for $1,950.']);
  });

  it('keeps one finding per item when two filters match, the loudest', () => {
    const after = snapshot(a, item('b', '$2,500', '3', 'Riverside'), item('f', '$1,400', '2', 'Riverside'));
    const findings = evaluateRules(listWatch, diff(before, after));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('shriek');
  });

  it('itemRemoved and itemChanged with a direction', () => {
    const after = snapshot(item('a', '$1,850', '2', 'Old Mill'));
    const findings = evaluateRules(listWatch, diff(before, after));
    expect(findings.map((f) => f.ruleKind).sort()).toEqual(['itemChanged', 'itemRemoved']);
    expect(findings.find((f) => f.ruleKind === 'itemChanged')?.summary).toBe('2 bd in Old Mill for $1,850: price went down from $1,900 to $1,850 (-$50).');
    const up = evaluateRules(listWatch, diff(before, snapshot(item('a', '$1,990', '2', 'Old Mill'), item('b', '$2,500', '3', 'Riverside'))));
    expect(up).toEqual([]);
  });

  it('filters compare text case-insensitively and numbers numerically', () => {
    expect(matchesFilter(a, [where.eq('hood', 'old mill')])).toBe(true);
    expect(matchesFilter(a, [where.neq('hood', 'Old Mill')])).toBe(false);
    expect(matchesFilter(a, [where.contains('hood', 'mill'), where.lt('price', 2000), where.gt('beds', 1)])).toBe(true);
    expect(matchesFilter(a, [where.atLeast('price', 'x' as unknown as number)])).toBe(false);
    expect(matchesFilter(a, [])).toBe(true);
  });

  it('describes rules and filters in words', () => {
    expect(describeRule(listWatch.rules[0]!, listWatch)).toBe('new home where beds ≥ 2 and price ≤ 2000 and hood is one of Old Mill, Riverside');
    expect(describeCondition(where.eq('type', 'Demolition'))).toBe('type is Demolition');
    expect(describeRule(rules.wentUp('bonus', { label: 'custom' }))).toBe('custom');
  });
});

describe('defineWatch validation', () => {
  it('rejects unknown fields in rules, bad ids and bad URLs', () => {
    expect(() =>
      defineWatch({ id: 'Bad Id', name: 'x', url: 'ftp://x', fields: [{ name: 'a', selector: 'a', kind: 'text' }], rules: [rules.changed('b')] }),
    ).toThrow(WatchDefinitionError);
  });
  it('defaults the interval to six hours', () => {
    const w = defineWatch({ id: 'ok', name: 'ok', url: 'https://example.com', fields: [{ name: 'a', selector: 'a', kind: 'text' }], rules: [] });
    expect(w.intervalMs).toBe(6 * 60 * 60 * 1000);
  });
  it('rejects list identity fields that do not exist and invalid patterns', () => {
    expect(() =>
      defineWatch({
        id: 'ok',
        name: 'ok',
        url: 'https://example.com',
        fields: [{ name: 'a', selector: 'a', kind: 'text', pattern: '(' }],
        lists: [{ name: 'l', itemSelector: 'li', identity: ['nope'], fields: {} }],
        rules: [],
      }),
    ).toThrow(/identity field "nope"[\s\S]*|invalid pattern/);
  });
});

