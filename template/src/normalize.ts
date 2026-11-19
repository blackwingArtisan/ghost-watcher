/**
 * Normalizers turn the raw text of a watched region into a canonical value, so that formatting noise
 * (whitespace, thousands separators, date formats, tracking parameters) never looks like a change.
 * Every function here is pure.
 */
import type { FieldKind } from './watch';

export type Value =
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number; display: string }
  | { kind: 'money'; amountMinor: number; currency: string; display: string }
  | { kind: 'date'; iso: string; display: string }
  | { kind: 'percent'; value: number; display: string }
  | { kind: 'url'; href: string; display: string };

/** A watched value, or `null` when the region was not found on the page. */
export type MaybeValue = Value | null;

/** The money shape written by versions before integer minor units: a decimal `value` in major units. */
export interface LegacyMoneyValue {
  kind: 'money';
  value: number;
  currency: string;
  display: string;
}

const SMART_PUNCTUATION: Array<[RegExp, string]> = [
  [/[‘’‚′]/g, "'"],
  [/[“”„″]/g, '"'],
  [/[–—−]/g, '-'],
  [/…/g, '...'],
];

/** Collapses all whitespace (including non-breaking spaces) to single spaces and straightens quotes. */
export function normalizeWhitespace(raw: string): string {
  let text = raw.replace(/[\s  -​  　﻿]+/g, ' ').trim();
  for (const [pattern, replacement] of SMART_PUNCTUATION) text = text.replace(pattern, replacement);
  return text;
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' };
const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;
const PREFIXED_MONEY = new RegExp(String.raw`(?:\b(USD|EUR|GBP|CAD)\s?|([$€£])\s?)${AMOUNT}(?:\s?([kK])\b)?`);
const SUFFIXED_MONEY = new RegExp(String.raw`${AMOUNT}\s?(USD|EUR|GBP|CAD)\b`);
const PLAIN_AMOUNT = new RegExp(AMOUNT);

const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Integer minor units (cents) from the digit strings of an amount: "1,234" and "56" become 123456.
 * The digits are parsed as integers and never pass through floating point. Returns null when the
 * result would not fit exactly in a JavaScript number.
 */
export function minorFromDigits(whole: string, fraction = '', multiplier = 1n): number | null {
  const digits = whole.replace(/,/g, '');
  if (!/^\d+$/.test(digits) || !/^\d{0,2}$/.test(fraction)) return null;
  const minor = (BigInt(digits) * 100n + BigInt(fraction.padEnd(2, '0'))) * multiplier;
  return minor <= MAX_SAFE_MINOR ? Number(minor) : null;
}

/**
 * Reads the first money amount in a string. Amounts with a currency symbol or code win over bare
 * numbers, so "Open by 12/31 and earn $300" reads as $300. The amount is returned in integer minor
 * units; amounts too large to hold exactly are not money (null).
 */
export function parseMoney(raw: string): { amountMinor: number; currency: string } | null {
  const text = normalizeWhitespace(raw);
  let amountMinor: number | null;
  let currency = 'USD';
  const prefixed = PREFIXED_MONEY.exec(text);
  const suffixed = prefixed ? null : SUFFIXED_MONEY.exec(text);
  if (prefixed) {
    const [, code, symbol, whole = '', cents, thousands] = prefixed;
    amountMinor = minorFromDigits(whole, cents, thousands ? 1000n : 1n);
    currency = code ?? (symbol ? CURRENCY_SYMBOLS[symbol] : undefined) ?? 'USD';
  } else if (suffixed) {
    const [, whole = '', cents, code = 'USD'] = suffixed;
    amountMinor = minorFromDigits(whole, cents);
    currency = code;
  } else {
    const plain = PLAIN_AMOUNT.exec(text);
    if (!plain) return null;
    amountMinor = minorFromDigits(plain[1] ?? '', plain[2]);
  }
  return amountMinor === null ? null : { amountMinor, currency };
}

/** Integer minor units from a plain decimal string such as "1234.5" (used to upgrade stored values). */
export function minorFromDecimal(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  return match ? minorFromDigits(match[1] ?? '', match[2]) : null;
}

/**
 * Formats integer minor units as a currency string for people: 30000 is "$300" and 123456 is
 * "$1,234.56". This is the only place minor units become decimals, and it does so with integer math.
 */
export function formatMinor(amountMinor: number, currency = 'USD'): string {
  const absolute = BigInt(Math.abs(amountMinor));
  const cents = absolute % 100n;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absolute / 100n);
  const text = cents === 0n ? formatted.replace(/\.00$/, '') : formatted.replace(/\.00$/, `.${String(cents).padStart(2, '0')}`);
  return amountMinor < 0 ? `-${text}` : text;
}

/**
 * Compares an amount in minor units with a target in major units (the unit app authors write, so
 * `where.atMost('price', 2100)` means $2,100). Exact: both sides are scaled to integers.
 * Returns null when the target is not a plain finite number.
 */
export function compareMinorToMajor(amountMinor: number, target: number): -1 | 0 | 1 | null {
  if (!Number.isFinite(target)) return null;
  let scaled: bigint;
  let scale = 0;
  if (Number.isInteger(target)) {
    scaled = BigInt(target);
  } else {
    const match = /^(-?)(\d+)\.(\d+)$/.exec(String(target));
    if (!match) return null;
    scaled = BigInt(`${match[1]}${match[2]}${match[3]}`);
    scale = (match[3] ?? '').length;
  }
  const left = BigInt(amountMinor) * 10n ** BigInt(scale);
  const right = scaled * 100n;
  return left < right ? -1 : left > right ? 1 : 0;
}

const NUMBER_PATTERN = /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/;

export function parseNumber(raw: string): number | null {
  const match = NUMBER_PATTERN.exec(normalizeWhitespace(raw));
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

export function parsePercent(raw: string): number | null {
  const text = normalizeWhitespace(raw);
  const match = /(-?\d+(?:\.\d+)?)\s?%/.exec(text) ?? /(-?\d+(?:\.\d+)?)\s?percent/i.exec(text);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const MONTH_NAMES = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

function monthIndex(name: string): number {
  const prefix = name.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((month) => month.startsWith(prefix));
}

function toIso(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** Parses common English date formats to an ISO calendar date (`YYYY-MM-DD`). */
export function parseDate(raw: string): string | null {
  const text = normalizeWhitespace(raw).replace(/(\d)(st|nd|rd|th)\b/gi, '$1');

  let match = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (match) return toIso(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  match = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/.exec(text);
  if (match) return toIso(Number(match[3]), Number(match[1]) - 1, Number(match[2]));

  match = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i').exec(text);
  if (match?.[1]) return toIso(Number(match[3]), monthIndex(match[1]), Number(match[2]));

  match = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_NAMES})\\.?,?\\s+(\\d{4})\\b`, 'i').exec(text);
  if (match?.[2]) return toIso(Number(match[3]), monthIndex(match[2]), Number(match[1]));

  return null;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga', '_gl', 'ref', 'ref_src', 'yclid']);

/** Canonical URL: lowercase host, no fragment, no tracking parameters, sorted query. */
export function normalizeUrl(raw: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(normalizeWhitespace(raw), base);
  } catch {
    return null;
  }
  url.hash = '';
  const kept = [...url.searchParams.entries()].filter(
    ([key]) => !key.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(key.toLowerCase()),
  );
  kept.sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);
  return url.toString();
}

/** Turns raw region text into a canonical value. Unparseable numbers, money and dates fall back to text. */
export function normalizeValue(raw: string, kind: FieldKind, baseUrl?: string): Value {
  const text = normalizeWhitespace(raw);
  switch (kind) {
    case 'money': {
      const money = parseMoney(text);
      return money ? { kind: 'money', ...money, display: formatMinor(money.amountMinor, money.currency) } : { kind: 'text', text };
    }
    case 'number': {
      const value = parseNumber(text);
      return value === null ? { kind: 'text', text } : { kind: 'number', value, display: value.toLocaleString('en-US') };
    }
    case 'percent': {
      const value = parsePercent(text);
      return value === null ? { kind: 'text', text } : { kind: 'percent', value, display: `${value}%` };
    }
    case 'date': {
      const iso = parseDate(text);
      return iso ? { kind: 'date', iso, display: formatDate(iso) } : { kind: 'text', text };
    }
    case 'url': {
      const href = normalizeUrl(text, baseUrl);
      return href ? { kind: 'url', href, display: href } : { kind: 'text', text };
    }
    case 'text':
      return { kind: 'text', text };
  }
}

/** The canonical comparison key of a value. Two values are equal when their keys are equal. */
export function canonical(value: MaybeValue): string {
  if (value === null) return '∅';
  switch (value.kind) {
    case 'text':
      return `text:${value.text}`;
    case 'number':
      return `number:${value.value}`;
    case 'money':
      return `money:${value.currency}:${value.amountMinor}`;
    case 'date':
      return `date:${value.iso}`;
    case 'percent':
      return `percent:${value.value}`;
    case 'url':
      return `url:${value.href}`;
  }
}

export function valuesEqual(a: MaybeValue, b: MaybeValue): boolean {
  return canonical(a) === canonical(b);
}

/**
 * Numeric reading of a value, for comparisons and deltas. Money reads as integer minor units, dates
 * as day numbers. Use `compareToTarget` to compare a value with a number written by an app author.
 */
export function numericValue(value: MaybeValue): number | null {
  if (value === null) return null;
  switch (value.kind) {
    case 'money':
      return value.amountMinor;
    case 'number':
    case 'percent':
      return value.value;
    case 'date':
      return Date.parse(`${value.iso}T00:00:00Z`) / 86_400_000;
    default:
      return null;
  }
}

/**
 * Compares a value with a target number as an app author writes it (major units for money).
 * Returns null when the value is not numeric or the target is unusable.
 */
export function compareToTarget(value: MaybeValue, target: number): -1 | 0 | 1 | null {
  if (value?.kind === 'money') return compareMinorToMajor(value.amountMinor, target);
  const number = numericValue(value);
  if (number === null || !Number.isFinite(target)) return null;
  return number < target ? -1 : number > target ? 1 : 0;
}

/**
 * Upgrades a stored value written by an earlier version (money with a decimal `value`) to integer
 * minor units. Current values pass through unchanged.
 */
export function upgradeStoredValue(value: MaybeValue | LegacyMoneyValue): MaybeValue {
  if (value === null || value.kind !== 'money' || !('value' in value)) return value as MaybeValue;
  const amountMinor = minorFromDecimal(value.value.toFixed(2));
  return amountMinor === null
    ? { kind: 'text', text: value.display }
    : { kind: 'money', amountMinor, currency: value.currency, display: value.display };
}

/** Human-readable form of a value for alerts and the dashboard. */
export function displayValue(value: MaybeValue): string {
  if (value === null) return 'nothing';
  return value.kind === 'text' ? value.text : value.display;
}

/** Plain text of a value for text matching (filters, appeared/disappeared patterns). */
export function textOf(value: MaybeValue): string {
  if (value === null) return '';
  return value.kind === 'text' ? value.text : value.display;
}
