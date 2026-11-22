/**
 * The words of a pact. The pact machinery (sealing, comparison, the dispute pack) is the same for every
 * app; what the reader sees and what the letter says is not. An app sets `copy.pactCopy` to supply its
 * own button label, chip and section names, the "day" phrase used in notes, its letter templates, its
 * evidence labels and its complaint authority text. An app that sets nothing gets
 * `BONUS_PACT_VOCABULARY`, which holds the bank-offer wording the Bonus Crypt has always used.
 *
 * Pure data and pure functions: no clock, no effects.
 */
import type { Watch } from './watch';

/** Everything a letter template may quote. All dates are already formatted with `letterDate`. */
export interface LetterContext {
  /** The watch's name, e.g. `Larkspur Flats, Unit 5B`. */
  offer: string;
  /** The page address the reader relied on (the display URL when the watch sets one). */
  url: string;
  /** The date the pact was sealed. */
  sealedDate: string;
  /** The date of the page now. */
  nowDate: string;
  /** What the page said on the sealed date, one quoted line each. */
  before: string[];
  /** What the page says now, one quoted line each. */
  after: string[];
  /** Exhibit lines: the archived copy of the sealed page and its SHA-256. */
  exhibitLines: string[];
  /** The archived copy of the page now (or why there is none). */
  archiveLine: string;
  /** SHA-256 of the record of the page now. */
  afterSha256: string;
  /** "The headline offer did not change..." line for a bait and switch, or an empty string. */
  stealthLine: string;
}

export interface LetterText {
  subject: string;
  body: string;
}

export type LetterTemplate = (context: LetterContext) => LetterText;

/** Wording of the pack page around the letter. */
export interface PackWords {
  disputeTitle: string;
  matchTitle: string;
  /** The line under the title; `blanks` is the list of bracketed blanks, already joined. */
  disputeIntro: (blanks: string) => string;
  matchIntro: (blanks: string) => string;
  /** Heading of the "before" exhibit: what the page promised on the sealed date. */
  promisedHead: (sealedDate: string) => string;
  letterHeading: string;
  letterLabel: string;
  stampDispute: string;
  stampMatch: string;
}

export interface EvidenceWords {
  /** Label of the row that quotes the sealed page: `Exhibit A: the page on Oct 10, 2026`. */
  page: (sealedDate: string) => string;
  copy: string;
  sha256: string;
  check: string;
  /** The two small tags over the before and after exhibits. */
  tags: [string, string];
}

export interface PactVocabulary {
  /** Label of the seal button: `I applied today`. */
  sealLabel: string;
  /** Name of the sealed mark on a stone: `Pact sealed`. */
  sealedChip: string;
  sectionTitle: string;
  /** The séance line when no pact exists. */
  emptyLine: string;
  /** Heading of the séance value-table column holding the sealed value. */
  valueColumn: string;
  /** Notes say `On <date>, <day>, the bonus was ...`. */
  day: string;
  /** The summary prefix is `Since <since> on <date>:`. */
  since: string;
  /** The bracketed blank that the sealed date fills. */
  dateBlank: string;
  /** The blanks the reader fills in, in order, with `dateBlank` among them. Default: the bank's four. */
  blanks?: string[];
  evidence: EvidenceWords;
  pack: PackWords;
  /** Replaces the default bank letters when set. */
  letters?: { dispute: LetterTemplate; match: LetterTemplate };
  /** False hides the CFPB section. */
  cfpb: boolean;
  /** Replaces the CFPB section with a heading and one neutral line. */
  authority?: { heading: string; text: string };
  /** Offer the pact only on watches that carry one of these tags. */
  watchTags?: string[];
  /** Age of the demo's seeded pacts, in days. */
  demoAgeDays: number;
}

/** What an app may set: any part of the vocabulary. */
export type PactCopy = Partial<Omit<PactVocabulary, 'evidence' | 'pack'>> & {
  evidence?: Partial<EvidenceWords>;
  pack?: Partial<PackWords>;
};

/** The bank-offer wording. Every string here is the literal the template used before it was generic. */
export const BONUS_PACT_VOCABULARY: PactVocabulary = {
  sealLabel: 'I applied today',
  sealedChip: 'Pact sealed',
  sectionTitle: 'The pact',
  emptyLine: 'No pact yet. Seal one on the day you apply.',
  valueColumn: 'The day you applied',
  day: 'the day you applied',
  since: 'you applied',
  dateBlank: '[Date you applied]',
  evidence: {
    page: (date) => `Exhibit A: the page on ${date}`,
    copy: 'Exhibit A archived copy',
    sha256: 'Exhibit A SHA-256',
    check: 'Check Exhibit A',
    tags: ['Exhibit A', 'Exhibit B'],
  },
  pack: {
    disputeTitle: 'Dispute pack',
    matchTitle: 'Bonus match',
    disputeIntro: (blanks) =>
      `Show the bank its own terms from the day you applied. Fill in the bracketed blanks (${blanks}), then send it yourself. Nothing here is sent for you.`,
    matchIntro: (blanks) =>
      `The bank improved its terms after you applied. Ask it for the better terms. Fill in the bracketed blanks (${blanks}), then send it yourself. Nothing here is sent for you.`,
    promisedHead: (date) => `${date}, the day you applied: what the page promised`,
    letterHeading: '1. Letter to the bank',
    letterLabel: 'Letter to the bank',
    stampDispute: 'Terms changed',
    stampMatch: 'Bonus match',
  },
  cfpb: true,
  demoAgeDays: 40,
};

/** The vocabulary an app uses: its `pactCopy` laid over the bank wording. */
export function resolvePactVocabulary(app: { copy: { pactCopy?: PactCopy | undefined } }): PactVocabulary {
  const set = app.copy.pactCopy;
  if (!set) return BONUS_PACT_VOCABULARY;
  const { evidence, pack, ...rest } = set;
  const defined = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  return {
    ...BONUS_PACT_VOCABULARY,
    ...defined,
    evidence: { ...BONUS_PACT_VOCABULARY.evidence, ...evidence },
    pack: { ...BONUS_PACT_VOCABULARY.pack, ...pack },
  };
}

/** True when the app has pacts on and the vocabulary lets this watch carry one. */
export function pactEnabledFor(app: { copy: { pacts?: boolean | undefined; pactCopy?: PactCopy | undefined } }, watch: Pick<Watch, 'tags'>): boolean {
  if (app.copy.pacts !== true) return false;
  const tags = app.copy.pactCopy?.watchTags;
  return !tags || watch.tags.some((tag) => tags.includes(tag));
}

/**
 * True when the app offers dispute packs for this watch. A vocabulary with `watchTags` writes letters
 * for those watches only (the lease letter makes no sense for a permit table).
 */
export function disputesEnabledFor(
  app: { copy: { disputes?: boolean | undefined; pactCopy?: PactCopy | undefined } },
  watch: Pick<Watch, 'tags'>,
): boolean {
  if (app.copy.disputes !== true) return false;
  const tags = app.copy.pactCopy?.watchTags;
  return !tags || watch.tags.some((tag) => tags.includes(tag));
}

/** The strings the dashboard script needs. Sent only when the app sets `pactCopy`. */
export interface PactUiCopy {
  sealLabel: string;
  sealedChip: string;
  sectionTitle: string;
  emptyLine: string;
  valueColumn: string;
}

export function pactUiCopy(app: { copy: { pactCopy?: PactCopy | undefined } }): PactUiCopy | undefined {
  if (!app.copy.pactCopy) return undefined;
  const v = resolvePactVocabulary(app);
  return { sealLabel: v.sealLabel, sealedChip: v.sealedChip, sectionTitle: v.sectionTitle, emptyLine: v.emptyLine, valueColumn: v.valueColumn };
}
