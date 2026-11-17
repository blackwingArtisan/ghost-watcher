/**
 * Plain-English sentences for changes. Every alert carries one sentence a non-developer understands:
 * what changed, from what, to what.
 */
import type { ListItem } from './extract';
import type { FieldChange } from './diff';
import { displayValue, formatMoney, textOf, type MaybeValue } from './normalize';
import type { ListSpec } from './watch';

/** Splits text into sentences so a long block of fine print can be diffed by sentence. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+(?=[A-Z0-9"(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface TextChange {
  added: string[];
  removed: string[];
}

export function textChange(before: string, after: string): TextChange {
  const a = sentences(before);
  const b = sentences(after);
  const beforeSet = new Set(a.map((s) => s.toLowerCase()));
  const afterSet = new Set(b.map((s) => s.toLowerCase()));
  return {
    added: b.filter((s) => !beforeSet.has(s.toLowerCase())),
    removed: a.filter((s) => !afterSet.has(s.toLowerCase())),
  };
}

function quote(text: string, max = 140): string {
  const clean = text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  return `"${clean}"`;
}

function formatDelta(change: FieldChange): string {
  if (change.delta === undefined || change.after === null) return '';
  const sign = change.delta > 0 ? '+' : '-';
  const size = Math.abs(change.delta);
  switch (change.after.kind) {
    case 'money':
      return ` (${sign}${formatMoney(size, change.after.currency)})`;
    case 'percent':
      return ` (${sign}${size} points)`;
    case 'date': {
      const days = Math.round(size);
      return ` (${days} day${days === 1 ? '' : 's'} ${change.delta > 0 ? 'later' : 'sooner'})`;
    }
    default:
      return ` (${sign}${size.toLocaleString('en-US')})`;
  }
}

/** Ends a sentence with a period unless it already ends with punctuation (inside a quote or not). */
export function finish(sentence: string): string {
  return /[.!?…]"?$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * For one sentence that was edited, the smallest window of words that changed, with a little context:
 * ("...totaling $5,000 or more...", "...totaling $2,500 or more...").
 */
export function changedWindow(before: string, after: string, context = 2): [string, string] {
  const a = before.split(' ');
  const b = after.split(' ');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA -= 1;
    endB -= 1;
  }
  const from = Math.max(0, start - context);
  const clip = (words: string[], end: number) => {
    const to = Math.min(words.length, end + 1 + context);
    return `${from > 0 ? '…' : ''}${words.slice(from, to).join(' ')}${to < words.length ? '…' : ''}`;
  };
  return [clip(a, endA), clip(b, endB)];
}

function similar(a: string, b: string): boolean {
  const wa = new Set(a.toLowerCase().split(' '));
  const wb = b.toLowerCase().split(' ');
  const shared = wb.filter((w) => wa.has(w)).length;
  return shared / Math.max(wa.size, wb.length) >= 0.6;
}

/** "Bonus went up from $300 to $400 (+$100)." */
export function describeFieldChange(label: string, change: FieldChange): string {
  const before = displayValue(change.before);
  const after = displayValue(change.after);
  if (change.type === 'added') return finish(`${label} appeared: ${quote(after)}`);
  if (change.type === 'removed') return `${label} disappeared (it was ${quote(before)}).`;
  if (change.before?.kind === 'text' && change.after?.kind === 'text') {
    const { added, removed } = textChange(change.before.text, change.after.text);
    const parts: string[] = [];
    const unmatched = [...added];
    const gone: string[] = [];
    for (const old of removed) {
      const index = unmatched.findIndex((candidate) => similar(old, candidate));
      if (index >= 0) {
        const [was, now] = changedWindow(old, unmatched[index] as string);
        parts.push(`${quote(was)} became ${quote(now)}`);
        unmatched.splice(index, 1);
      } else {
        gone.push(old);
      }
    }
    if (unmatched.length > 0) parts.push(`it now says ${unmatched.map((s) => quote(s)).join(' and ')}`);
    if (gone.length > 0) parts.push(`it no longer says ${gone.map((s) => quote(s)).join(' and ')}`);
    if (parts.length > 0) return finish(`${label} changed: ${parts.join('; ')}`);
    return finish(`${label} changed from ${quote(before)} to ${quote(after)}`);
  }
  if (change.delta !== undefined && change.delta !== 0) {
    const verb = change.after?.kind === 'date' ? 'moved' : change.delta > 0 ? 'went up' : 'went down';
    return `${label} ${verb} from ${before} to ${after}${formatDelta(change)}.`;
  }
  return `${label} changed from ${before} to ${after}.`;
}

/** Fills a list's `describe` template, e.g. "{beds} bd in {neighborhood}" -> "2 bd in Old Mill". */
export function describeItem(list: Pick<ListSpec, 'describe' | 'identity'>, item: ListItem): string {
  const template = list.describe ?? list.identity.map((name) => `{${name}}`).join(', ');
  return template.replace(/\{([\w-]+)\}/g, (_, name: string) => {
    const value: MaybeValue = item.values[name] ?? null;
    return value === null ? '?' : displayValue(value);
  });
}

export function describeItemValue(value: MaybeValue): string {
  return textOf(value) || 'nothing';
}

export interface WordSegment {
  type: 'same' | 'added' | 'removed';
  text: string;
}

/** Word-level diff (longest common subsequence) for showing fine-print edits inline. */
export function wordDiff(before: string, after: string, maxWords = 600): WordSegment[] {
  const a = before.split(' ').filter(Boolean);
  const b = after.split(' ').filter(Boolean);
  if (a.length > maxWords || b.length > maxWords) {
    return [
      { type: 'removed', text: before },
      { type: 'added', text: after },
    ];
  }
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = table[i] as number[];
      row[j] = a[i] === b[j] ? ((table[i + 1] as number[])[j + 1] as number) + 1 : Math.max((table[i + 1] as number[])[j] as number, row[j + 1] as number);
    }
  }
  const segments: WordSegment[] = [];
  const push = (type: WordSegment['type'], word: string) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.text += ` ${word}`;
    else segments.push({ type, text: word });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i] as string);
      i += 1;
      j += 1;
    } else if (((table[i + 1] as number[])[j] as number) >= ((table[i] as number[])[j + 1] as number)) {
      push('removed', a[i] as string);
      i += 1;
    } else {
      push('added', b[j] as string);
      j += 1;
    }
  }
  while (i < a.length) push('removed', a[i++] as string);
  while (j < b.length) push('added', b[j++] as string);
  return segments;
}
