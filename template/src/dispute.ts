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
import { pactVariant } from './pact';
import { BONUS_PACT_VOCABULARY, resolvePactVocabulary, type PactVocabulary } from './pact-vocabulary';
import { finish, letterDate, pairEdits, textChange } from './summary';
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
  /** Present only for apps that set `pactCopy`: the neutral line that replaces the CFPB section. */
  authority?: { heading: string; text: string };
  /** Present only for apps that set `pactCopy`: the words around the letter. */
  ui?: PackUi;
  /** Blanks the reader fills in before sending, in the order they appear. */
  blanks: string[];
  /** Present only when the alert was judged against a sealed pact. */
  pact?: PackPact;
}

/** The words the pack page uses, resolved from the app's pact vocabulary. */
export interface PackUi {
  title: string;
  intro: string;
  promisedHead: string | null;
  letterHeading: string;
  letterLabel: string;
  stamp: string;
  tags: [string, string];
  /** True when the pack shows the CFPB complaint section. */
  federalComplaint: boolean;
}

/** The pact facts a pack quotes as Exhibit A. */
export interface PackPact {
  variant: 'dispute' | 'match';
  relation: 'differs' | 'restored';
  /** `letterDate` of the day the pact was sealed, e.g. `Oct 10, 2026`. */
  appliedDate: string;
  sha256: string;
  archiveUrl: string | null;
  archivedBy: string | null;
  /** Why there is no archived copy. */
  note: string | null;
  seeded: boolean;
  checkCommand: string;
  /** The verify page, with the stored snapshot's address, the pact's SHA-256 and the sealed time in the query. */
  verifyUrl: string;
}

export { letterDate };

/** `/verify` with the address of the stored snapshot, the pact's hash and the sealed time. */
export function verifyUrl(watchId: string, sha256: string, sealedAt: string): string {
  const query = new URLSearchParams({ copy: `/api/ghosts/${watchId}/pact/snapshot`, sha256, sealed: sealedAt });
  return `/verify?${query.toString()}`;
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
    // A reworded sentence is quoted whole on both sides: as it read, then as it reads now. "Did not
    // say" is only for a sentence that is wholly new, "no longer says" only for one that is gone.
    const { edited, fresh, gone } = pairEdits(removed, added);
    return {
      before: [
        ...edited.map(({ was }) => `${label}: "${was}"`),
        ...gone.map((sentence) => `${label}: "${sentence}"`),
        ...fresh.map((sentence) => `${label}: did not say "${sentence}"`),
      ],
      after: [
        ...edited.map(({ now }) => `${label}: "${now}"`),
        ...fresh.map((sentence) => `${label}: "${sentence}"`),
        ...gone.map((sentence) => `${label}: no longer says "${sentence}"`),
      ],
    };
  }
  return {
    before: [`${label}: ${before === undefined || before === null ? 'not shown' : displayValue(before)}`],
    after: [`${label}: ${after === undefined || after === null ? 'not shown' : displayValue(after)}`],
  };
}


function archivedCopy(archiveUrl: string | null, archivedBy: string | null, archivedAt: string | null, note: string | null): string {
  return archiveUrl
    ? `archived copy held by ${archivedBy ?? 'a public web archive'}: ${archiveUrl}${archivedAt ? ` (captured ${letterDate(archivedAt)})` : ''}`
    : `no public archived copy was made (${note ?? 'archiving was off'})`;
}

/**
 * Builds the dispute pack for one alert, or null when the alert kept no receipt (only shrieks and
 * bait and switches do).
 */
export function disputePack(alert: Alert, watch?: Watch, vocabulary: PactVocabulary = BONUS_PACT_VOCABULARY): DisputePack | null {
  const custom = vocabulary !== BONUS_PACT_VOCABULARY;
  const receipt = alert.receipt;
  if (!receipt) return null;
  const field = watch?.fields.find((f) => f.name === alert.field);
  const label = field?.label ?? alert.field ?? alert.list ?? 'Offer';
  const sealed = alert.pact;
  const DATE_BLANK = vocabulary.dateBlank;
  const BLANKS = vocabulary.blanks ?? ['[Your name]', '[Your address]', DATE_BLANK, '[Last 4 digits of the account]'];
  const applied = sealed ? letterDate(sealed.sealedAt) : DATE_BLANK;
  const differs = sealed?.relation === 'differs';
  const variant = pactVariant(alert);
  const packPact: PackPact | undefined = sealed
    ? {
        variant,
        relation: sealed.relation,
        appliedDate: applied,
        sha256: sealed.sha256,
        archiveUrl: sealed.archive.archiveUrl,
        archivedBy: sealed.archive.archivedBy,
        note: sealed.archive.note ?? null,
        seeded: sealed.seeded === 'demo',
        checkCommand: `shasum -a 256 .ghost-data/store/pacts/${alert.watchId}/${sealed.sha256}.json`,
        verifyUrl: verifyUrl(alert.watchId, sealed.sha256, sealed.sealedAt),
      }
    : undefined;
  const exhibitLines = packPact
    ? [
        `${vocabulary.evidence.tags[0]}, the page on ${applied}: ${archivedCopy(packPact.archiveUrl, packPact.archivedBy, sealed?.archive.archivedAt ?? null, packPact.note)}`,
        `${vocabulary.evidence.sha256}: ${packPact.sha256}`,
      ]
    : [];

  const quoted =
    sealed?.relation === 'differs' ? quoteLines(label, sealed.promised, alert.after) : quoteLines(label, alert.before, alert.after);
  const beforeDate = sealed?.relation === 'differs' ? applied : letterDate(receipt.before.takenAt);
  const afterDate = letterDate(receipt.after.takenAt);
  const kind = alert.stealth ? 'Bait and switch' : variant === 'match' && differs ? 'Better terms' : 'Shriek';
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

  const plainBody = [
    '[Your name]',
    '[Your address]',
    '',
    `To: ${offer} customer care`,
    `Re: ${offer}, account ending [Last 4 digits of the account]`,
    '',
    `I applied for ${offer} on ${applied}, relying on the terms published at ${alert.url}.`,
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


  const pactBody = (): string =>
    [
      '[Your name]',
      '[Your address]',
      '',
      `To: ${offer} customer care`,
      `Re: ${offer}, account ending [Last 4 digits of the account]`,
      '',
      `I applied for ${offer} on ${applied}, relying on the terms published at ${alert.url}.`,
      variant === 'match'
        ? 'Since then the page has improved its terms. I sealed a record of the page on the day I applied and recorded it again after the improvement.'
        : 'Those terms have since changed. I sealed a record of the page on the day I applied and recorded it again after the change.',
      '',
      `What the page promised on ${applied}, the day I applied:`,
      ...quoted.before.map((line) => `  ${line}`),
      '',
      `What the page says on ${afterDate}:`,
      ...quoted.after.map((line) => `  ${line}`),
      stealthLine,
      'Records of both versions:',
      ...exhibitLines.map((line) => `  - ${line}`),
      `  - ${archiveLine}`,
      `  - SHA-256 of my record of the page on ${afterDate}: ${receipt.after.sha256}`,
      '',
      ...(variant === 'match'
        ? [
            'Since I applied as a customer, I would like my account to receive the improved terms now on offer. Please let me know in writing within 30 days whether you will match them.',
            '',
            'Thank you,',
          ]
        : [
            'Please honor the terms that were published on the day I applied, including any sign-up bonus they promised, and confirm in writing within 30 days. If we cannot resolve this, I will file a complaint with the Consumer Financial Protection Bureau and include these records.',
            '',
            'Sincerely,',
          ]),
      '[Your name]',
    ]
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');

  const context = {
    offer,
    url: alert.url,
    sealedDate: applied,
    nowDate: afterDate,
    before: quoted.before,
    after: quoted.after,
    exhibitLines,
    archiveLine,
    afterSha256: receipt.after.sha256,
    stealthLine: alert.stealth ? `The headline offer did not change, but the terms did. ${alert.stealth}` : '',
  };
  const custom_letter = differs && vocabulary.letters ? vocabulary.letters[variant === 'match' ? 'match' : 'dispute'](context) : null;
  const body = custom_letter ? custom_letter.body : differs ? pactBody() : plainBody;

  const plainWhatHappened = [
    `I applied for ${offer} on ${applied} under the terms on the bank's page (${alert.url}).`,
    'The bank later changed those terms.',
    finish(`On ${beforeDate} the page said ${quoted.before.join('; ')}`),
    finish(`On ${afterDate} it said ${quoted.after.join('; ')}`),
    alert.stealth ? `The headline offer stayed the same, so the change was easy to miss. ${alert.stealth}` : '',
    receipt.archiveUrl ? `A public archived copy of the changed page: ${receipt.archiveUrl}.` : '',
    `I kept records of both versions (SHA-256 ${receipt.before.sha256} and ${receipt.after.sha256}) and can provide them.`,
  ]
    .filter(Boolean)
    .join(' ');
  const pactWhatHappened = [
    `I applied for ${offer} on ${applied} under the terms on the bank's page (${alert.url}).`,
    variant === 'match'
      ? 'The bank later improved those terms but has not applied them to my application.'
      : 'The bank later changed those terms.',
    finish(`On ${applied}, the day I applied, the page promised ${quoted.before.join('; ')}`),
    finish(`On ${afterDate} it said ${quoted.after.join('; ')}`),
    alert.stealth ? `The headline offer stayed the same, so the change was easy to miss. ${alert.stealth}` : '',
    packPact?.archiveUrl ? `A public archived copy of the page on the day I applied: ${packPact.archiveUrl}.` : '',
    receipt.archiveUrl ? `A public archived copy of the changed page: ${receipt.archiveUrl}.` : '',
    `I kept records of both versions (SHA-256 ${packPact?.sha256} and ${receipt.after.sha256}) and can provide them.`,
  ]
    .filter(Boolean)
    .join(' ');
  const whatHappened = differs ? pactWhatHappened : plainWhatHappened;

  const exhibitRows: EvidenceRow[] = packPact
    ? [
        { label: vocabulary.evidence.page(applied), value: differs ? quoted.before.join(' / ') : packPact.appliedDate },
        { label: vocabulary.evidence.copy, value: packPact.archiveUrl ?? `none: ${packPact.note ?? 'archiving was off'}` },
        { label: vocabulary.evidence.sha256, value: packPact.sha256 },
        { label: vocabulary.evidence.check, value: packPact.checkCommand },
      ]
    : [];
  const fetched: EvidenceRow[] = alert.fetchUrl ? [{ label: 'Fetched from', value: alert.fetchUrl }] : [];
  const evidence: EvidenceRow[] = differs
    ? [
        { label: 'Page', value: alert.url },
        ...fetched,
        ...exhibitRows,
        { label: `Now (${afterDate})`, value: quoted.after.join(' / ') },
        { label: 'Archived copy now', value: receipt.archiveUrl ?? `none: ${receipt.note ?? 'archiving was off'}` },
        { label: 'SHA-256 now', value: receipt.after.sha256 },
        { label: 'Check the hashes', value: `shasum -a 256 .ghost-data/store/snapshots/${alert.watchId}/history/*.json` },
      ]
    : [
        { label: 'Page', value: alert.url },
        ...fetched,
        { label: `Before (${beforeDate})`, value: quoted.before.join(' / ') },
        { label: `After (${afterDate})`, value: quoted.after.join(' / ') },
        { label: 'Archived copy', value: receipt.archiveUrl ?? `none: ${receipt.note ?? 'archiving was off'}` },
        { label: 'SHA-256 before', value: receipt.before.sha256 },
        { label: 'SHA-256 after', value: receipt.after.sha256 },
        { label: 'Check the hashes', value: `shasum -a 256 .ghost-data/store/snapshots/${alert.watchId}/history/*.json` },
        ...exhibitRows,
      ];

  const blanksList = (sealed ? BLANKS.filter((blank) => blank !== DATE_BLANK) : BLANKS).join(', ');
  const isMatch = variant === 'match' && differs;
  const words = vocabulary.pack;
  const customParts: Pick<DisputePack, 'ui' | 'authority'> = {
    ui: {
      title: isMatch ? words.matchTitle : words.disputeTitle,
      intro: isMatch ? words.matchIntro(blanksList) : words.disputeIntro(blanksList),
      promisedHead: differs ? words.promisedHead(applied) : null,
      letterHeading: words.letterHeading,
      letterLabel: words.letterLabel,
      stamp: isMatch ? words.stampMatch : alert.stealth ? 'Bait and switch' : words.stampDispute,
      tags: vocabulary.evidence.tags,
      federalComplaint: vocabulary.cfpb && !vocabulary.authority,
    },
    ...(vocabulary.authority ? { authority: vocabulary.authority } : {}),
  };
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
    letter: {
      subject:
        custom_letter?.subject ??
        (variant === 'match' && differs ? `Request to match the improved terms of ${offer}` : `Request to honor the advertised terms of ${offer}`),
      body,
    },
    evidence,
    complaint: custom && (vocabulary.authority || !vocabulary.cfpb)
      ? {
          product: '',
          issue: '',
          subIssue: '',
          url: '',
          whatHappened: [
            finish(`On ${beforeDate} the page said ${quoted.before.join('; ')}`),
            finish(`On ${afterDate} it said ${quoted.after.join('; ')}`),
          ].join(' '),
          desiredResolution: `Charge the terms of ${offer} that were advertised on ${applied}.`,
        }
      : {
          ...category,
          url: CFPB_COMPLAINT_URL,
          whatHappened,
          desiredResolution:
            variant === 'match' && differs
              ? `Apply the improved terms of ${offer} now on offer to my application.`
              : `Honor the terms of ${offer} that were published on the day I applied, including any promised sign-up bonus.`,
        },
    blanks: sealed ? BLANKS.filter((blank) => blank !== DATE_BLANK) : BLANKS,
    ...(packPact ? { pact: packPact } : {}),
    ...(custom ? customParts : {}),
  };
}
