import { describe, expect, it } from 'vitest';
import { compareValues, diff } from '../src/diff';
import type { Extraction, ListItem } from '../src/extract';
import {
  compareMinorToMajor,
  compareToTarget,
  displayValue,
  formatMinor,
  minorFromDecimal,
  normalizeValue,
  parseMoney,
  upgradeStoredValue,
  valuesEqual,
  type LegacyMoneyValue,
} from '../src/normalize';
import { comparePact, PACT_VERSION, type Pact } from '../src/pact';
import { snapshotSha256 } from '../src/receipts';
import { evaluateRules, matchesFilter } from '../src/rules';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { defineWatch, rules, where } from '../src/watch';

const money = (raw: string) => normalizeValue(raw, 'money');

describe('money is integer cents', () => {
  it('reads "$1,234.56" as 123456 cents', () => {
    expect(money('$1,234.56')).toEqual({ kind: 'money', amountMinor: 123456, currency: 'USD', display: '$1,234.56' });
  });

  it('keeps amounts that binary floating point gets wrong', () => {
    // 4.35 * 100 is 434.99999999999994 and 1.15 * 100 is 114.99999999999999 in floating point.
    expect(parseMoney('$4.35')?.amountMinor).toBe(435);
    expect(parseMoney('$1.15')?.amountMinor).toBe(115);
    expect(parseMoney('$0.10')?.amountMinor).toBe(10);
    expect(parseMoney('$0.30')?.amountMinor).toBe(30);
  });

  it('pads and reads one or two fraction digits as cents', () => {
    expect(parseMoney('$12.5')?.amountMinor).toBe(1250);
    expect(parseMoney('$12.05')?.amountMinor).toBe(1205);
    expect(parseMoney('$12')?.amountMinor).toBe(1200);
  });

  it('treats grouping, trailing zeros and symbols as the same amount', () => {
    expect(valuesEqual(money('$1,200.00'), money('$1200'))).toBe(true);
    expect(valuesEqual(money('USD 1200.0'), money('$1,200'))).toBe(true);
    expect(valuesEqual(money('$0.30'), money('$0.3'))).toBe(true);
    expect(valuesEqual(money('£1200'), money('$1200'))).toBe(false);
  });

  it('computes a delta of exactly 20 cents from $0.10 to $0.30', () => {
    const change = compareValues('fee', money('$0.10'), money('$0.30'));
    expect(change?.delta).toBe(20);
    expect(Number.isInteger(change?.delta)).toBe(true);
  });

  it('computes exact deltas where floating point drifts', () => {
    expect(compareValues('fee', money('$0.30'), money('$0.60'))?.delta).toBe(30);
    expect(compareValues('fee', money('$1.10'), money('$2.20'))?.delta).toBe(110);
    expect(compareValues('fee', money('$4.35'), money('$1.15'))?.delta).toBe(-320);
  });

  it('parses amounts above 2^31 cents exactly', () => {
    const cents = 2 ** 31 + 1;
    expect(cents).toBe(2_147_483_649);
    expect(parseMoney('$21,474,836.49')?.amountMinor).toBe(cents);
    expect(parseMoney('$25,000,000.00')?.amountMinor).toBe(2_500_000_000);
    expect(displayValue(money('$25,000,000.01'))).toBe('$25,000,000.01');
  });

  it('parses the largest exact amount and refuses to round beyond it', () => {
    expect(parseMoney('$90,071,992,547,409.91')?.amountMinor).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMoney('$90,071,992,547,409.92')).toBeNull();
    expect(money('$90,071,992,547,409.92')).toEqual({ kind: 'text', text: '$90,071,992,547,409.92' });
  });

  it('multiplies a k suffix as an integer', () => {
    expect(parseMoney('$1.25k')?.amountMinor).toBe(125000);
  });

  it('formats cents only at the edge', () => {
    expect(formatMinor(123456)).toBe('$1,234.56');
    expect(formatMinor(30000)).toBe('$300');
    expect(formatMinor(5)).toBe('$0.05');
    expect(formatMinor(1250)).toBe('$12.50');
    expect(formatMinor(2_500_000_000)).toBe('$25,000,000');
    expect(formatMinor(Number.MAX_SAFE_INTEGER)).toBe('$90,071,992,547,409.91');
    expect(formatMinor(-5000)).toBe('-$50');
    expect(formatMinor(7500, 'GBP')).toBe('£75');
  });

  it('reads plain decimal strings as cents', () => {
    expect(minorFromDecimal('1234.50')).toBe(123450);
    expect(minorFromDecimal('12')).toBe(1200);
    expect(minorFromDecimal('1e21')).toBeNull();
  });
});

describe('money comparisons with targets written in dollars', () => {
  it('compares exactly without scaling floats', () => {
    expect(compareMinorToMajor(1999, 19.99)).toBe(0);
    expect(compareMinorToMajor(2000, 19.99)).toBe(1);
    expect(compareMinorToMajor(1998, 19.99)).toBe(-1);
    expect(compareMinorToMajor(1999, 19.999)).toBe(-1);
    expect(compareMinorToMajor(30, 0.3)).toBe(0);
    expect(compareMinorToMajor(2_500_000_000, 25_000_000)).toBe(0);
    expect(compareMinorToMajor(1, Number.NaN)).toBeNull();
  });

  it('compares non-money values as plain numbers', () => {
    expect(compareToTarget(normalizeValue('3', 'number'), 2)).toBe(1);
    expect(compareToTarget(money('$2'), 2)).toBe(0);
    expect(compareToTarget(normalizeValue('Ask us', 'text'), 2)).toBeNull();
    expect(compareToTarget(null, 2)).toBeNull();
  });

  const item = (price: string): ListItem => ({ key: 'a', values: { price: money(price) } });

  it('price lte and gte filters hold at the exact boundary', () => {
    expect(matchesFilter(item('$2,100'), [where.atMost('price', 2100)])).toBe(true);
    expect(matchesFilter(item('$2,100.01'), [where.atMost('price', 2100)])).toBe(false);
    expect(matchesFilter(item('$19.99'), [where.atMost('price', 19.99)])).toBe(true);
    expect(matchesFilter(item('$20'), [where.atMost('price', 19.99)])).toBe(false);
    expect(matchesFilter(item('$1,000,000'), [where.atLeast('price', 1_000_000)])).toBe(true);
    expect(matchesFilter(item('$999,999.99'), [where.atLeast('price', 1_000_000)])).toBe(false);
    expect(matchesFilter(item('$25,000,000.50'), [where.gt('price', 25_000_000)])).toBe(true);
    expect(matchesFilter(item('$300'), [where.eq('price', 300)])).toBe(true);
    expect(matchesFilter(item('$300.01'), [where.eq('price', 300)])).toBe(false);
    expect(matchesFilter(item('$300'), [where.oneOf('price', [250, 300])])).toBe(true);
  });
});

describe('money rules and sentences read the same as before', () => {
  const watch = defineWatch({
    id: 'fees',
    name: 'Fees',
    url: 'https://example.com/fees',
    fields: [
      { name: 'bonus', label: 'Bonus', selector: '.b', kind: 'money' },
      { name: 'fee', label: 'Fee', selector: '.f', kind: 'money' },
    ],
    rules: [
      rules.wentUp('bonus'),
      rules.wentDown('bonus'),
      rules.wentUp('fee', { minDelta: 0.2 }),
      rules.wentDown('fee', { minDelta: 0.2 }),
    ],
  });
  const extraction = (bonus: string, fee: string): Extraction => ({
    fields: { bonus: money(bonus), fee: money(fee) },
    lists: {},
  });
  const run = (before: [string, string], after: [string, string]) =>
    evaluateRules(watch, diff(extraction(...before), extraction(...after)));

  it('keeps the whole-dollar sentence', () => {
    expect(run(['$300', '$1'], ['$400', '$1']).map((f) => f.summary)).toEqual(['Bonus went up from $300 to $400 (+$100).']);
  });

  it('keeps the going-down sentence', () => {
    expect(run(['$400', '$1'], ['$350', '$1']).map((f) => f.summary)).toEqual(['Bonus went down from $400 to $350 (-$50).']);
  });

  it('writes cents in sentences', () => {
    expect(run(['$300', '$0.10'], ['$300', '$0.30']).map((f) => f.summary)).toEqual(['Fee went up from $0.10 to $0.30 (+$0.20).']);
    expect(run(['$300', '$1,234.56'], ['$300', '$1,200']).map((f) => f.summary)).toEqual([
      'Fee went down from $1,234.56 to $1,200 (-$34.56).',
    ]);
  });

  it('applies minDelta exactly: a $0.20 rise meets a $0.20 minimum', () => {
    // In floating point 0.30 - 0.10 is 0.19999999999999998, which would miss a 0.2 minimum.
    expect(run(['$300', '$0.10'], ['$300', '$0.30'])).toHaveLength(1);
    expect(run(['$300', '$0.10'], ['$300', '$0.29'])).toEqual([]);
    expect(run(['$300', '$0.30'], ['$300', '$0.10'])).toHaveLength(1);
  });

  it('stays silent when the amounts are the same after normalization', () => {
    expect(run(['$300', '$0.30'], ['$300.00', '$0.3'])).toEqual([]);
  });
});

describe('legacy snapshots with decimal money', () => {
  const legacy: LegacyMoneyValue = { kind: 'money', value: 1234.5, currency: 'USD', display: '$1,234.50' };

  it('upgrades a decimal value to cents and passes current values through', () => {
    expect(upgradeStoredValue(legacy)).toEqual({ kind: 'money', amountMinor: 123450, currency: 'USD', display: '$1,234.50' });
    const current = money('$300');
    expect(upgradeStoredValue(current)).toBe(current);
    expect(upgradeStoredValue(null)).toBeNull();
  });

  it('falls back to the displayed text when a legacy amount cannot be read', () => {
    expect(upgradeStoredValue({ ...legacy, value: 1e30 })).toEqual({ kind: 'text', text: '$1,234.50' });
  });

  it('reads an old snapshot from the store without raising a false change', async () => {
    const store = new GhostStore(new MemoryBlobStore());
    const old = {
      watchId: 'w',
      url: 'https://example.com',
      takenAt: '2026-10-01T00:00:00.000Z',
      fields: { bonus: { kind: 'money', value: 300, currency: 'USD', display: '$300' } },
      lists: { homes: [{ key: 'a', values: { price: { kind: 'money', value: 1850.25, currency: 'USD', display: '$1,850.25' } } }] },
    };
    await store.blobs.put('snapshots/w/latest.json', JSON.stringify(old));
    await store.blobs.put('snapshots/w/history/2026-10-01T00-00-00-000Z.json', JSON.stringify(old));
    const latest = await store.latestSnapshot('w');
    expect(latest?.fields.bonus).toEqual({ kind: 'money', amountMinor: 30000, currency: 'USD', display: '$300' });
    expect(latest?.lists.homes?.[0]?.values.price).toMatchObject({ amountMinor: 185025 });
    expect((await store.history('w'))[0]?.fields.bonus).toMatchObject({ amountMinor: 30000 });
    const current: Extraction = { fields: { bonus: money('$300') }, lists: { homes: [{ key: 'a', values: { price: money('$1,850.25') } }] } };
    const changes = diff(latest ?? undefined, current);
    expect(changes.fields).toEqual([]);
    expect(changes.lists).toEqual([]);
  });
});

describe('money against a sealed pact stays in integer cents', () => {
  const watch = defineWatch({
    id: 'fees',
    name: 'Fees',
    url: 'https://example.com/fees',
    fields: [{ name: 'fee', label: 'Fee', selector: '.f', kind: 'money', better: 'lower' }],
    rules: [rules.wentUp('fee', { minDelta: 0.2 }), rules.wentDown('fee', { minDelta: 0.2 })],
  });
  const extraction = (fee: string): Extraction => ({ fields: { fee: money(fee) }, lists: {} });
  const pactAt = (fee: string): Pact => {
    const snapshot = { watchId: 'fees', url: watch.url, takenAt: '2026-10-10T09:00:00.000Z', ...extraction(fee) };
    return {
      version: PACT_VERSION,
      watchId: 'fees',
      watchName: 'Fees',
      url: watch.url,
      sealedAt: '2026-10-10T14:00:00.000Z',
      snapshotTakenAt: snapshot.takenAt,
      sha256: snapshotSha256(snapshot),
      archive: { archiveUrl: null, archivedAt: null, archivedBy: null },
      snapshot,
    };
  };
  const judge = (promised: string, previous: string, tonight: string) => {
    const current = extraction(tonight);
    const nightly = diff(extraction(previous), current);
    return comparePact(watch, pactAt(promised), current, nightly, evaluateRules(watch, nightly));
  };

  it('(PACT 5.8) a pact of $0.10 and a page of $0.30 differ by exactly 20 cents, which meets a $0.20 minDelta', () => {
    const since = diff(pactAt('$0.10').snapshot, extraction('$0.30'));
    expect(since.fields[0]?.delta).toBe(20);
    expect(Number.isInteger(since.fields[0]?.delta)).toBe(true);
    const found = judge('$0.10', '$0.25', '$0.30');
    expect(found).toHaveLength(1);
    expect(found[0]?.summary).toBe('Since you applied on Oct 10, 2026: Fee went up from $0.10 to $0.30 (+$0.20).');
    expect(found[0]?.pact?.tone).toBe('bad');
  });

  it('(PACT 5.8) $0.29 against a pact of $0.10 stays under a $0.20 minDelta', () => {
    expect(judge('$0.10', '$0.28', '$0.29')).toEqual([]);
  });

  it('(PACT 5.8) $4.35 in a pact reference is 435 cents, never 434.99999999999994', () => {
    const found = judge('$4.35', '$4.35', '$1.15');
    expect(found[0]?.pact?.promised).toEqual({ kind: 'money', amountMinor: 435, currency: 'USD', display: '$4.35' });
    expect(found[0]?.pact?.note).toBe('On Oct 10, 2026, the day you applied, Fee was $4.35; it is now $1.15 (-$3.20).');
    expect(found[0]?.pact?.tone).toBe('good');
  });
});
