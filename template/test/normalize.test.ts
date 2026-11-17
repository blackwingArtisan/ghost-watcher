import { describe, expect, it } from 'vitest';
import {
  canonical,
  displayValue,
  normalizeUrl,
  normalizeValue,
  normalizeWhitespace,
  numericValue,
  parseDate,
  parseMoney,
  parseNumber,
  parsePercent,
  valuesEqual,
} from '../src/normalize';

describe('normalizeWhitespace', () => {
  it('collapses runs of spaces, tabs, newlines and non-breaking spaces', () => {
    expect(normalizeWhitespace('  Earn a \n\t $300   bonus ')).toBe('Earn a $300 bonus');
  });
  it('straightens smart quotes and dashes so typography edits are not changes', () => {
    expect(normalizeWhitespace('“No fee” — it’s true')).toBe('"No fee" - it\'s true');
  });
});

describe('parseMoney', () => {
  it.each([
    ['$300', 300],
    ['$1,500.00', 1500],
    ['$ 250.00', 250],
    ['USD 1200', 1200],
    ['1,200 USD', 1200],
    ['$2.5k', 2500],
    ['Earn a $400 bonus', 400],
  ])('reads %s as %d', (raw, value) => {
    expect(parseMoney(raw)?.value).toBe(value);
  });
  it('prefers an amount with a currency symbol over earlier bare numbers', () => {
    expect(parseMoney('Open by 12/31 and earn $300')?.value).toBe(300);
  });
  it('keeps the currency', () => {
    expect(parseMoney('£75')).toEqual({ value: 75, currency: 'GBP' });
  });
  it('returns null when there is no number at all', () => {
    expect(parseMoney('Bonus ended')).toBeNull();
  });
});

describe('parseNumber and parsePercent', () => {
  it('ignores grouping separators', () => {
    expect(parseNumber('60,000 bonus points')).toBe(60000);
  });
  it('reads percentages written several ways', () => {
    expect(parsePercent('3.85%')).toBe(3.85);
    expect(parsePercent('3.85 %')).toBe(3.85);
    expect(parsePercent('4 percent APY')).toBe(4);
    expect(parsePercent('no rate')).toBeNull();
  });
});

describe('parseDate', () => {
  it.each([
    ['January 15, 2027', '2027-01-15'],
    ['Jan 15 2027', '2027-01-15'],
    ['Jan. 15th, 2027', '2027-01-15'],
    ['15 January 2027', '2027-01-15'],
    ['01/15/2027', '2027-01-15'],
    ['1/15/27', '2027-01-15'],
    ['2027-01-15', '2027-01-15'],
    ['Tuesday, December 31, 2026', '2026-12-31'],
  ])('reads %s', (raw, iso) => {
    expect(parseDate(raw)).toBe(iso);
  });
  it('rejects impossible dates', () => {
    expect(parseDate('February 30, 2027')).toBeNull();
  });
});

describe('normalizeUrl', () => {
  it('drops tracking parameters and fragments, and sorts the rest', () => {
    expect(normalizeUrl('https://Example.com/offer?utm_source=x&b=2&a=1&gclid=abc#terms')).toBe('https://example.com/offer?a=1&b=2');
  });
  it('resolves relative links against the page', () => {
    expect(normalizeUrl('/listing/7?utm_medium=list', 'https://example.com/search')).toBe('https://example.com/listing/7');
  });
});

describe('normalizeValue and equality', () => {
  it('treats formatting differences as equal', () => {
    expect(valuesEqual(normalizeValue('$15,000', 'money'), normalizeValue('$15000.00', 'money'))).toBe(true);
    expect(valuesEqual(normalizeValue('Dec 31, 2026', 'date'), normalizeValue('12/31/2026', 'date'))).toBe(true);
    expect(valuesEqual(normalizeValue('Membership  applies.', 'text'), normalizeValue('Membership applies.', 'text'))).toBe(true);
  });
  it('treats real changes as different', () => {
    expect(valuesEqual(normalizeValue('$300', 'money'), normalizeValue('$400', 'money'))).toBe(false);
    expect(valuesEqual(null, normalizeValue('$400', 'money'))).toBe(false);
  });
  it('falls back to text when a value cannot be parsed for its kind', () => {
    const value = normalizeValue('Offer ended', 'money');
    expect(value).toEqual({ kind: 'text', text: 'Offer ended' });
    expect(numericValue(value)).toBeNull();
  });
  it('formats values for people', () => {
    expect(displayValue(normalizeValue('$1500', 'money'))).toBe('$1,500');
    expect(displayValue(normalizeValue('2027-02-28', 'date'))).toBe('Feb 28, 2027');
    expect(displayValue(null)).toBe('nothing');
  });
  it('has stable canonical keys', () => {
    expect(canonical(normalizeValue('$300', 'money'))).toBe('money:USD:300.00');
    expect(canonical(null)).toBe('∅');
  });
  it('reads dates as day numbers for comparisons', () => {
    const a = numericValue(normalizeValue('Jan 1, 2027', 'date'));
    const b = numericValue(normalizeValue('Jan 11, 2027', 'date'));
    expect((b ?? 0) - (a ?? 0)).toBe(10);
  });
});
