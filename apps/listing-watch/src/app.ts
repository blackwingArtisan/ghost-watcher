/**
 * listing-watch: haunts rental listings and city building-permit pages and only speaks up for new
 * entries that match your filters (price, beds, neighborhood, permit type). Built only from the
 * template's public API.
 */
import { HOUR_MS, defineApp, defineWatch, rules, where, type Env, type GhostApp } from '@ghost-watcher/template';

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

export function buildApp(env: Env = process.env): GhostApp {
  const site = (env.LISTING_SITE_ORIGIN ?? DEFAULT_SITE).replace(/\/$/, '');
  return defineApp({
    id: 'listing-watch',
    name: 'Haunted Listings',
    tagline: 'Ghosts that prowl rental listings and city permit filings, and knock only when something fits.',
    version: '0.1.0',
    alertTo: ['night.owl.renter@example.com'],
    theme: { accent: '#ffad5c', accentSecondary: '#b89cff', sky: '#140f1f', moon: '#ffe3c2', crest: 'Lantern' },
    copy: {
      watchNoun: 'listings and permits',
      quiet: 'No new listing or permit has matched your filters yet.',
      disclaimer: 'Reports what each page lists. Places and companies in the demo are invented.',
    },
    watches: [
      defineWatch({
        id: 'larkspur-rentals',
        name: 'Larkspur Rentals',
        subtitle: `2+ bd under $${FILTERS.maxRent.toLocaleString('en-US')} in ${FILTERS.neighborhoods.join(' or ')}`,
        url: `${site}/rentals/search`,
        tags: ['rentals'],
        intervalMs: 2 * HOUR_MS,
        lists: [
          {
            name: 'listings',
            label: 'listing',
            itemSelector: 'article.listing',
            identity: ['id'],
            describe: '{beds} bd in {neighborhood} at {address} for {price}/mo',
            fields: {
              id: { selector: ':self', attribute: 'data-listing-id', kind: 'text' },
              address: { selector: '.address', kind: 'text' },
              neighborhood: { selector: '.hood', kind: 'text' },
              beds: { selector: '.beds', kind: 'number', label: 'beds' },
              price: { selector: '.price', kind: 'money', label: 'Rent' },
              link: { selector: 'a.details', attribute: 'href', kind: 'url' },
            },
          },
        ],
        rules: [
          rules.newItem(
            'listings',
            [where.atLeast('beds', FILTERS.minBeds), where.atMost('price', FILTERS.maxRent), where.oneOf('neighborhood', FILTERS.neighborhoods)],
            { severity: 'shriek' },
          ),
          rules.itemChanged('listings', 'price', {
            direction: 'down',
            where: [where.atLeast('beds', FILTERS.minBeds), where.atMost('price', FILTERS.maxRent), where.oneOf('neighborhood', FILTERS.neighborhoods)],
            label: 'a listing you would take drops its rent',
          }),
        ],
      }),
      defineWatch({
        id: 'vale-availability',
        name: 'The Vale Apartments',
        subtitle: `Fenwick & Vale · studios under $${FILTERS.studioMaxRent.toLocaleString('en-US')}`,
        url: `${site}/vale/availability`,
        tags: ['rentals'],
        intervalMs: 6 * HOUR_MS,
        lists: [
          {
            name: 'units',
            label: 'unit',
            itemSelector: '#availability tr.unit',
            identity: ['unit'],
            describe: 'unit {unit}, {layout}, {rent}/mo, available {available}',
            fields: {
              unit: { selector: '.unit-no', kind: 'text' },
              layout: { selector: '.layout', kind: 'text' },
              rent: { selector: '.rent', kind: 'money', label: 'Rent' },
              available: { selector: '.avail', kind: 'text' },
            },
          },
        ],
        rules: [
          rules.newItem('units', [where.atMost('rent', FILTERS.studioMaxRent)], { severity: 'shriek' }),
          rules.itemRemoved('units', [], { label: 'a unit is rented' }),
        ],
      }),
      defineWatch({
        id: 'hollowmere-permits',
        name: 'Hollowmere Permits',
        subtitle: 'City of Hollowmere · new construction & demolition',
        url: `${site}/city/permits`,
        tags: ['permits'],
        intervalMs: 24 * HOUR_MS,
        lists: [
          {
            name: 'permits',
            label: 'permit',
            itemSelector: '#permits tr.permit',
            identity: ['number'],
            describe: '{type} at {address} ({valuation}): {description}',
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
        tags: ['rentals'],
        fields: [
          { name: 'status', label: 'Leasing', selector: '#leasing-status', kind: 'text' },
          { name: 'fromPrice', label: 'From', selector: '#from-price', kind: 'money' },
        ],
        rules: [
          rules.appeared('status', { matching: 'now leasing', severity: 'shriek', label: 'leasing opens' }),
          rules.wentDown('fromPrice'),
          rules.changed('status', { severity: 'whisper' }),
        ],
      }),
    ],
  });
}
