/**
 * listing-watch: haunts rental listings and city building-permit pages and only speaks up for new
 * entries that match your filters (price, beds, neighborhood, permit type). Built only from the
 * template's public API.
 */
import {
  HOUR_MS,
  defineApp,
  defineWatch,
  rules,
  where,
  type Env,
  type GhostApp,
  type LetterContext,
  type LetterText,
  type PactCopy,
} from '@ghost-watcher/template';

export const DEFAULT_SITE = 'http://127.0.0.1:3133';

/** The renter's filters. Change these to taste; every rule below reads from them. */
export const FILTERS = {
  maxRent: 2100,
  minBeds: 2,
  neighborhoods: ['Old Mill', 'Larkspur Heights'],
  studioMaxRent: 1800,
  permitTypes: ['New Construction', 'Demolition'],
  bigProjectValuation: 1_000_000,
};

/** The tag that turns the pact on for a watch: only a listing's own page records what a renter signed. */
export const LEASE_TAG = 'lease';

const quotedLines = (lines: string[]): string[] => lines.map((line) => `  ${line}`);

function leaseHeader(c: LetterContext): string[] {
  return [
    '[Your name]',
    '[Your address], unit [Unit]',
    '',
    `To: The landlord or property manager, ${c.offer}`,
    `Re: Lease for ${c.offer}, unit [Unit]`,
    '',
    `I signed the lease for ${c.offer} on ${c.sealedDate}, relying on the terms advertised at ${c.url}.`,
  ];
}

function leaseRecords(c: LetterContext): string[] {
  return [
    'Records of both versions:',
    ...c.exhibitLines.map((line) => `  - ${line}`),
    `  - ${c.archiveLine}`,
    `  - SHA-256 of my record of the page on ${c.nowDate}: ${c.afterSha256}`,
  ];
}

function tidy(lines: string[]): string {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Letter to the landlord when the page now charges more, or adds a fee, than it advertised. */
export function leaseDisputeLetter(c: LetterContext): LetterText {
  return {
    subject: `Request to honor the advertised terms of ${c.offer}`,
    body: tidy([
      ...leaseHeader(c),
      'The page now charges different terms. I recorded the page on the day I signed and again after the change.',
      '',
      `What was advertised on ${c.sealedDate}, the day I signed the lease:`,
      ...quotedLines(c.before),
      '',
      `What the page charges on ${c.nowDate}:`,
      ...quotedLines(c.after),
      c.stealthLine,
      ...leaseRecords(c),
      '',
      'Please charge only the terms that were advertised on the day I signed the lease, and confirm in writing within 30 days.',
      '',
      'Sincerely,',
      '[Your name]',
    ]),
  };
}

/** Letter to the landlord when the page now advertises a lower rent than the one the renter signed at. */
export function leaseMatchLetter(c: LetterContext): LetterText {
  return {
    subject: `Request to match the lower rent advertised for ${c.offer}`,
    body: tidy([
      ...leaseHeader(c),
      'The page now advertises better terms. I recorded the page on the day I signed and again after the change.',
      '',
      `What was advertised on ${c.sealedDate}, the day I signed the lease:`,
      ...quotedLines(c.before),
      '',
      `What the page advertises on ${c.nowDate}:`,
      ...quotedLines(c.after),
      '',
      ...leaseRecords(c),
      '',
      'Please let me know in writing within 30 days whether you will apply the lower terms to my lease.',
      '',
      'Thank you,',
      '[Your name]',
    ]),
  };
}

/** The renter's words for the pact. Leases are signed a few weeks before move-in, so the demo signs 30 days back. */
export const LEASE_PACT_COPY: PactCopy = {
  sealLabel: 'I signed the lease',
  sealedChip: 'Lease sealed',
  sectionTitle: 'The lease pact',
  emptyLine: 'No lease pact yet. Seal the listing on the day you sign the lease.',
  valueColumn: 'The day you signed',
  day: 'the day you signed the lease',
  since: 'you signed the lease',
  dateBlank: '[Date you signed the lease]',
  blanks: ['[Your name]', '[Your address]', '[Unit]', '[Date you signed the lease]'],
  evidence: {
    page: (date) => `Advertised on ${date}`,
    copy: 'Advertised copy',
    sha256: 'Advertised SHA-256',
    check: 'Check the advertised page',
    tags: ['Advertised', 'Charged now'],
  },
  pack: {
    disputeTitle: 'Lease letter',
    matchTitle: 'Rent match',
    disputeIntro: (blanks) =>
      `Show your landlord the terms advertised on the day you signed the lease. Fill in the bracketed blanks (${blanks}), then send it yourself. Nothing here is sent for you.`,
    matchIntro: (blanks) =>
      `The listing now advertises better terms than the day you signed. Ask the landlord to apply them. Fill in the bracketed blanks (${blanks}), then send it yourself. Nothing here is sent for you.`,
    promisedHead: (date) => `${date}, the day you signed the lease: what was advertised`,
    letterHeading: '1. Letter to the landlord',
    letterLabel: 'Letter to the landlord',
    stampDispute: 'Charged more',
    stampMatch: 'Rent match',
  },
  letters: { dispute: leaseDisputeLetter, match: leaseMatchLetter },
  cfpb: false,
  authority: {
    heading: '3. If the landlord does not answer',
    text: "You can ask your local housing authority or your state attorney general's consumer office for help. Bring this letter and the evidence above.",
  },
  watchTags: [LEASE_TAG],
  demoAgeDays: 30,
};

export function buildApp(env: Env = process.env): GhostApp {
  const site = (env.LISTING_SITE_ORIGIN ?? DEFAULT_SITE).replace(/\/$/, '');
  return defineApp({
    id: 'listing-watch',
    name: 'Haunted Listings',
    tagline: 'Ghosts that prowl rental listings and city permit filings, and knock only when something fits.',
    version: '0.1.0',
    alertTo: ['night.owl.renter@example.com'],
    theme: { accent: '#ffad5c', accentSecondary: '#b89cff', sky: '#140f1f', moon: '#ffe3c2', crest: 'Lantern', motif: 'house' },
    copy: {
      watchNoun: 'listings and permits',
      quiet: 'No new listing or permit has matched your filters yet.',
      disclaimer: 'Reports what each page lists. Places and companies in the demo are invented.',
      feedName: 'Knocks at the door',
      pacts: true,
      disputes: true,
      pactCopy: LEASE_PACT_COPY,
    },
    watches: [
      defineWatch({
        id: 'larkspur-rentals',
        name: 'Larkspur Rentals',
        subtitle: `2+ bd under $${FILTERS.maxRent.toLocaleString('en-US')} in ${FILTERS.neighborhoods.join(' or ')}`,
        url: `${site}/rentals/search`,
        displayUrl: 'https://larkspur-rentals.example/rentals/search',
        tags: ['rentals'],
        intervalMs: 2 * HOUR_MS,
        lists: [
          {
            name: 'listings',
            label: 'listing',
            itemSelector: 'article.listing',
            identity: ['id'],
            describe: '{beds} bd in {neighborhood} at {address} for {price}/mo',
            brief: '{beds} bd {price} {neighborhood}',
            matchLabel: 'Window lit',
            fields: {
              id: { selector: ':self', attribute: 'data-listing-id', kind: 'text' },
              address: { selector: '.address', kind: 'text' },
              neighborhood: { selector: '.hood', kind: 'text' },
              beds: { selector: '.beds', kind: 'number', label: 'beds' },
              price: { selector: '.price', kind: 'money', label: 'Rent', better: 'lower' },
              link: { selector: 'a.details', attribute: 'href', kind: 'url' },
            },
          },
        ],
        rules: [
          rules.newItem(
            'listings',
            [where.atLeast('beds', FILTERS.minBeds), where.atMost('price', FILTERS.maxRent), where.oneOf('neighborhood', FILTERS.neighborhoods)],
            { severity: 'shriek', tone: 'good' },
          ),
          rules.itemChanged('listings', 'price', {
            direction: 'down',
            where: [where.atLeast('beds', FILTERS.minBeds), where.atMost('price', FILTERS.maxRent), where.oneOf('neighborhood', FILTERS.neighborhoods)],
            label: 'a listing you would take drops its rent',
          }),
        ],
      }),
      defineWatch({
        id: 'larkspur-flats-5b',
        name: 'Larkspur Flats, Unit 5B',
        subtitle: 'Your listing · rent, fees and move-in terms',
        url: `${site}/rentals/listing/LR-2033`,
        displayUrl: 'https://larkspur-rentals.example/rentals/listing/LR-2033',
        tags: ['rentals', LEASE_TAG],
        intervalMs: 6 * HOUR_MS,
        fields: [
          { name: 'rent', label: 'Rent', selector: '#rent', kind: 'money', better: 'lower' },
          { name: 'applicationFee', label: 'Application fee', selector: '#app-fee', kind: 'money', better: 'lower' },
          { name: 'deposit', label: 'Deposit', selector: '#deposit', kind: 'money', better: 'lower' },
          { name: 'moveIn', label: 'Move-in special', selector: '#move-in', kind: 'text' },
          { name: 'monthlyFees', label: 'Monthly fees', selector: '#fees p', kind: 'text' },
        ],
        rules: [
          rules.wentUp('rent', { severity: 'shriek' }),
          rules.wentDown('rent', { severity: 'shriek' }),
          rules.wentUp('applicationFee'),
          rules.wentUp('deposit'),
          rules.appeared('monthlyFees', {
            matching: '(monthly|community|amenity|service|trash|parking)[a-z ]* fee',
            severity: 'shriek',
            tone: 'bad',
            label: 'fine print adds a monthly fee',
          }),
          rules.changed('moveIn', { severity: 'whisper' }),
          rules.changed('monthlyFees', { severity: 'whisper' }),
        ],
      }),
      defineWatch({
        id: 'vale-availability',
        name: 'The Vale Apartments',
        subtitle: `Fenwick & Vale · studios under $${FILTERS.studioMaxRent.toLocaleString('en-US')}`,
        url: `${site}/vale/availability`,
        displayUrl: 'https://vale-apartments.example/availability',
        tags: ['rentals'],
        intervalMs: 6 * HOUR_MS,
        lists: [
          {
            name: 'units',
            label: 'unit',
            itemSelector: '#availability tr.unit',
            identity: ['unit'],
            describe: 'unit {unit}, {layout}, {rent}/mo, available {available}',
            brief: 'unit {unit}, {layout}, {rent}/mo',
            matchLabel: 'Window lit',
            fields: {
              unit: { selector: '.unit-no', kind: 'text' },
              layout: { selector: '.layout', kind: 'text' },
              rent: { selector: '.rent', kind: 'money', label: 'Rent', better: 'lower' },
              available: { selector: '.avail', kind: 'text' },
            },
          },
        ],
        rules: [
          rules.newItem('units', [where.atMost('rent', FILTERS.studioMaxRent)], { severity: 'shriek', tone: 'good' }),
          rules.itemRemoved('units', [], { label: 'a unit is rented' }),
        ],
      }),
      defineWatch({
        id: 'hollowmere-permits',
        name: 'Hollowmere Permits',
        subtitle: 'City of Hollowmere · new construction & demolition',
        url: `${site}/city/permits`,
        displayUrl: 'https://hollowmere.example/permits',
        tags: ['permits'],
        intervalMs: 24 * HOUR_MS,
        lists: [
          {
            name: 'permits',
            label: 'permit',
            itemSelector: '#permits tr.permit',
            identity: ['number'],
            describe: '{type} at {address} ({valuation}): {description}',
            brief: '{type} at {address} ({valuation})',
            matchLabel: 'New filing',
            fields: {
              number: { selector: '.num', kind: 'text' },
              type: { selector: '.type', kind: 'text' },
              address: { selector: '.addr', kind: 'text' },
              valuation: { selector: '.val', kind: 'money', label: 'Valuation' },
              filed: { selector: '.filed', kind: 'date' },
              description: { selector: '.desc', kind: 'text' },
            },
          },
        ],
        rules: [
          rules.newItem('permits', [where.oneOf('type', FILTERS.permitTypes)], { severity: 'moan' }),
          rules.newItem('permits', [where.atLeast('valuation', FILTERS.bigProjectValuation)], {
            severity: 'shriek',
            label: `new permit worth $${(FILTERS.bigProjectValuation / 1_000_000).toFixed(0)}M or more`,
          }),
        ],
      }),
      defineWatch({
        id: 'old-mill-lofts',
        name: 'Old Mill Lofts',
        subtitle: 'Leasing status · riverfront lofts',
        url: `${site}/old-mill-lofts`,
        displayUrl: 'https://old-mill-lofts.example/lofts',
        tags: ['rentals'],
        fields: [
          { name: 'status', label: 'Leasing', selector: '#leasing-status', kind: 'text' },
          { name: 'fromPrice', label: 'From', selector: '#from-price', kind: 'money', better: 'lower' },
        ],
        rules: [
          rules.appeared('status', { matching: 'now leasing', severity: 'shriek', tone: 'good', label: 'leasing opens' }),
          rules.wentDown('fromPrice'),
          rules.changed('status', { severity: 'whisper' }),
        ],
      }),
    ],
  });
}
