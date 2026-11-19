/**
 * Raise the dead: turns a receipt into a dispute pack. For a shriek or a bait and switch that kept a
 * receipt, the pack holds
 *
 *   - a letter to the bank quoting what its page said before and after the change, with dates;
 *   - the evidence: the archived copy and the SHA-256 of both stored snapshots;
 *   - prefilled text for a Consumer Financial Protection Bureau complaint, in the CFPB's own
 *     product and issue categories.
 *
 * Pure and deterministic: the same alert always yields the same pack, word for word. Anything only
 * the reader knows (their name, the date they applied, the account number) is left as a bracketed
 * blank for them to fill in. Nothing is sent anywhere.
 */
import type { Alert } from './alerts/types';
import { displayValue, type MaybeValue } from './normalize';
import { finish, textChange } from './summary';
import type { Watch } from './watch';

/** One product and issue pair from the CFPB complaint form. */
export interface ComplaintCategory {
  product: string;
  issue: string;
  subIssue: string;
}

/** Card offers and deposit-account offers sit under different CFPB products. */
export const CFPB_CATEGORIES = {
  card: {
    product: 'Credit card',
    issue: 'Advertising and marketing, including promotional offers',
    subIssue: "Didn't receive advertised or promotional terms",
  },
  deposit: {
    product: 'Checking or savings account',
    issue: 'Opening an account',
    subIssue: "Didn't receive terms that were advertised",
  },
} as const satisfies Record<string, ComplaintCategory>;

export const CFPB_COMPLAINT_URL = 'https://www.consumerfinance.gov/complaint/';

export interface EvidenceRow {
  label: string;
  value: string;
}

export interface DisputePack {
  alertId: string;
  watchId: string;
  watchName: string;
  url: string;
  /** "Bait and switch" or "Shriek": why this change deserves a letter. */
  kind: string;
  /** What the page said before and after, one line each, as quoted in the letter. */
  before: string[];
  after: string[];
  beforeDate: string;
  afterDate: string;
  letter: { subject: string; body: string };
  evidence: EvidenceRow[];
  complaint: ComplaintCategory & { url: string; whatHappened: string; desiredResolution: string };
  /** Blanks the reader fills in before sending, in the order they appear. */
  blanks: string[];
}

/** "Jun 11, 2026", in UTC so a pack reads the same on every machine. */
export function letterDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Deposit accounts unless the watch is tagged as a card. */
export function complaintCategory(watch: Pick<Watch, 'tags'> | undefined): ComplaintCategory {
  return watch?.tags.some((tag) => /card/i.test(tag)) ? CFPB_CATEGORIES.card : CFPB_CATEGORIES.deposit;
}

function quoteLines(label: string, before: MaybeValue | undefined, after: MaybeValue | undefined): { before: string[]; after: string[] } {
  if (before?.kind === 'text' && after?.kind === 'text') {
    // Long fine print: quote only the sentences that changed, so the letter points at the edit.
    const { added, removed } = textChange(before.text, after.text);
    if (added.length === 0 && removed.length === 0) return { before: [`${label}: "${before.text}"`], after: [`${label}: "${after.text}"`] };
    return {
      before: removed.length ? removed.map((s) => `${label}: "${s}"`) : added.map((s) => `${label}: did not say "${s}"`),
      after: added.length ? added.map((s) => `${label}: "${s}"`) : removed.map((s) => `${label}: no longer says "${s}"`),
    };
  }
  return {
    before: [`${label}: ${before === undefined || before === null ? 'not shown' : displayValue(before)}`],
    after: [`${label}: ${after === undefined || after === null ? 'not shown' : displayValue(after)}`],
  };
}

const BLANKS = ['[Your name]', '[Your address]', '[Date you applied]', '[Last 4 digits of the account]'];

/**
 * Builds the dispute pack for one alert, or null when the alert kept no receipt (only shrieks and
 * bait and switches do).
 */
export function disputePack(alert: Alert, watch?: Watch): DisputePack | null {
  const receipt = alert.receipt;
  if (!receipt) return null;
  const field = watch?.fields.find((f) => f.name === alert.field);
  const label = field?.label ?? alert.field ?? alert.list ?? 'Offer';
  const quoted = quoteLines(label, alert.before, alert.after);
  const beforeDate = letterDate(receipt.before.takenAt);
  const afterDate = letterDate(receipt.after.takenAt);
  const kind = alert.stealth ? 'Bait and switch' : 'Shriek';
  const category = complaintCategory(watch);
  const offer = alert.watchName;

  const archiveLine = receipt.archiveUrl
    ? `An archived copy of the page after the change, held by ${receipt.archivedBy ?? 'a public web archive'}: ${receipt.archiveUrl}${
        receipt.archivedAt ? ` (captured ${letterDate(receipt.archivedAt)})` : ''
      }`
    : `No public archived copy was made (${receipt.note ?? 'archiving was off'}).`;
  const hashLines = [
    `SHA-256 of my record of the page on ${beforeDate}: ${receipt.before.sha256}`,
    `SHA-256 of my record of the page on ${afterDate}: ${receipt.after.sha256}`,
  ];
  const stealthLine = alert.stealth ? `\nThe headline offer did not change, but the terms did. ${alert.stealth}\n` : '';

  const body = [
    '[Your name]',
    '[Your address]',
    '',
    `To: ${offer} customer care`,
    `Re: ${offer}, account ending [Last 4 digits of the account]`,
    '',
    `I applied for ${offer} on [Date you applied], relying on the terms published at ${alert.url}.`,
    'Those terms have since changed. I recorded the page before and after the change.',
    '',
    `What the page said on ${beforeDate}:`,
    ...quoted.before.map((line) => `  ${line}`),
    '',
    `What the page said on ${afterDate}:`,
    ...quoted.after.map((line) => `  ${line}`),
    stealthLine,
    'Records of both versions:',
    `  - ${archiveLine}`,
    ...hashLines.map((line) => `  - ${line}`),
    '',
    'Please honor the terms that were published on the day I applied, including any sign-up bonus they promised, and confirm in writing within 30 days. If we cannot resolve this, I will file a complaint with the Consumer Financial Protection Bureau and include these records.',
    '',
    'Sincerely,',
    '[Your name]',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  const whatHappened = [
    `I applied for ${offer} on [Date you applied] under the terms on the bank's page (${alert.url}).`,
    'The bank later changed those terms.',
    finish(`On ${beforeDate} the page said ${quoted.before.join('; ')}`),
    finish(`On ${afterDate} it said ${quoted.after.join('; ')}`),
    alert.stealth ? `The headline offer stayed the same, so the change was easy to miss. ${alert.stealth}` : '',
    receipt.archiveUrl ? `A public archived copy of the changed page: ${receipt.archiveUrl}.` : '',
    `I kept records of both versions (SHA-256 ${receipt.before.sha256} and ${receipt.after.sha256}) and can provide them.`,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    alertId: alert.id,
    watchId: alert.watchId,
    watchName: offer,
    url: alert.url,
    kind,
    before: quoted.before,
    after: quoted.after,
    beforeDate,
    afterDate,
    letter: { subject: `Request to honor the advertised terms of ${offer}`, body },
    evidence: [
      { label: 'Page', value: alert.url },
      { label: `Before (${beforeDate})`, value: quoted.before.join(' / ') },
      { label: `After (${afterDate})`, value: quoted.after.join(' / ') },
      { label: 'Archived copy', value: receipt.archiveUrl ?? `none: ${receipt.note ?? 'archiving was off'}` },
      { label: 'SHA-256 before', value: receipt.before.sha256 },
      { label: 'SHA-256 after', value: receipt.after.sha256 },
      { label: 'Check the hashes', value: `shasum -a 256 .ghost-data/store/snapshots/${alert.watchId}/history/*.json` },
    ],
    complaint: {
      ...category,
      url: CFPB_COMPLAINT_URL,
      whatHappened,
      desiredResolution: `Honor the terms of ${offer} that were published on the day I applied, including any promised sign-up bonus.`,
    },
    blanks: BLANKS,
  };
}
