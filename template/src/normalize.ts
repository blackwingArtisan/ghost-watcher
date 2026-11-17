/**
 * Normalizers turn the raw text of a watched region into a canonical value, so that formatting noise
 * (whitespace, thousands separators, date formats, tracking parameters) never looks like a change.
 * Every function here is pure.
 */
import type { FieldKind } from './watch';

export type Value =
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number; display: string }
  | { kind: 'money'; value: number; currency: string; display: string }
  | { kind: 'date'; iso: string; display: string }
  | { kind: 'percent'; value: number; display: string }
  | { kind: 'url'; href: string; display: string };

/** A watched value, or `null` when the region was not found on the page. */
export type MaybeValue = Value | null;

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

function amount(whole: string, cents: string | undefined): number {
  return Number(whole.replace(/,/g, '')) + (cents ? Number(cents.padEnd(2, '0')) / 100 : 0);
}

/**
 * Reads the first money amount in a string. Amounts with a currency symbol or code win over bare
 * numbers, so "Open by 12/31 and earn $300" reads as $300.
 */
export function parseMoney(raw: string): { value: number; currency: string } | null {
  const text = normalizeWhitespace(raw);
  let value: number;
  let currency = 'USD';
  const prefixed = PREFIXED_MONEY.exec(text);
  const suffixed = prefixed ? null : SUFFIXED_MONEY.exec(text);
  if (prefixed) {
    const [, code, symbol, whole = '', cents, thousands] = prefixed;
    value = amount(whole, cents) * (thousands ? 1000 : 1);
    currency = code ?? (symbol ? CURRENCY_SYMBOLS[symbol] : undefined) ?? 'USD';
  } else if (suffixed) {
    const [, whole = '', cents, code = 'USD'] = suffixed;
    value = amount(whole, cents);
    currency = code;
  } else {
    const plain = PLAIN_AMOUNT.exec(text);
    if (!plain) return null;
    value = amount(plain[1] ?? '', plain[2]);
  }
  return { value: Math.round(value * 100) / 100, currency };
}

export function formatMoney(value: number, currency = 'USD'): string {
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
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
      return money ? { kind: 'money', ...money, display: formatMoney(money.value, money.currency) } : { kind: 'text', text };
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
      return `money:${value.currency}:${value.value.toFixed(2)}`;
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

/** Numeric reading of a value, for comparisons and filters. Dates compare by day number. */
export function numericValue(value: MaybeValue): number | null {
  if (value === null) return null;
  switch (value.kind) {
    case 'number':
    case 'money':
    case 'percent':
      return value.value;
    case 'date':
      return Date.parse(`${value.iso}T00:00:00Z`) / 86_400_000;
    default:
      return null;
  }
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
