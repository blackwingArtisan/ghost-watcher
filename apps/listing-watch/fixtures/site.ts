/**
 * Invented rental listings and city permit pages for listing-watch, in the made-up city of Hollowmere.
 * Every company, address and number here is fictional.
 *
 * Version 1: the baseline.
 * Version 2: Larkspur Rentals posts three listings (one matches the filters) and cuts one price;
 *            Fenwick & Vale rents one unit and lists a new studio; the city files three permits
 *            (two match); Old Mill Lofts opens leasing. Listing order is shuffled as noise.
 * Version 3: another matching listing, and one more permit.
 * Larkspur Flats, Unit 5B (a listing detail page, for the lease pact): version 2 raises the rent from
 *            $2,050 to $2,125 and adds a $45 monthly amenity fee to the fine print; version 3 is the same.
 */
import type { FixtureSite, PageContext, WorthKnowing } from '@ghost-watcher/template/testing';

interface Listing {
  id: string;
  address: string;
  neighborhood: string;
  beds: string;
  baths: string;
  price: string;
  posted: string;
}

const LARKSPUR_V1: Listing[] = [
  { id: 'LR-2041', address: '14 Thornapple Ct, Unit 2', neighborhood: 'Larkspur Heights', beds: '2', baths: '1', price: '$2,300', posted: 'Oct 28, 2026' },
  { id: 'LR-2047', address: '88 Wicklow Ave', neighborhood: 'Riverside', beds: '1', baths: '1', price: '$1,450', posted: 'Oct 30, 2026' },
  { id: 'LR-2052', address: '301 Foxglove Ln', neighborhood: 'Old Mill', beds: '3', baths: '2', price: '$2,850', posted: 'Nov 2, 2026' },
];

const LARKSPUR_V2_NEW: Listing[] = [
  { id: 'LR-2066', address: '418 Bramble Row, Apt 3', neighborhood: 'Old Mill', beds: '2', baths: '1', price: '$1,950', posted: 'Nov 14, 2026' },
  { id: 'LR-2067', address: '9 Cobweb Alley', neighborhood: 'Old Mill', beds: '1', baths: '1', price: '$1,600', posted: 'Nov 14, 2026' },
  { id: 'LR-2069', address: '1220 Lantern St', neighborhood: 'Riverside', beds: '3', baths: '2', price: '$2,050', posted: 'Nov 15, 2026' },
];

const LARKSPUR_V3_NEW: Listing[] = [
  { id: 'LR-2081', address: '57 Mossgrove Pl', neighborhood: 'Larkspur Heights', beds: '2', baths: '2', price: '$2,075', posted: 'Nov 20, 2026' },
];

function larkspurListings(version: number): Listing[] {
  const base = LARKSPUR_V1.map((l) => (version >= 2 && l.id === 'LR-2041' ? { ...l, price: '$2,050' } : l));
  if (version === 1) return base;
  const all = [...LARKSPUR_V2_NEW, ...base];
  if (version >= 3) all.unshift(...LARKSPUR_V3_NEW);
  // Order shuffles between versions (sorted by "featured" on this site); order is never a change.
  return version === 2 ? [all[2], all[0], all[4], all[1], all[3], all[5]].filter((l): l is Listing => Boolean(l)) : all;
}

function larkspurFlats(ctx: PageContext): string {
  const raised = ctx.version >= 2;
  const rent = raised ? '$2,125' : '$2,050';
  const fees = raised
    ? 'Pets welcome. Water and trash are included in your rent. A $45 monthly amenity fee applies to every unit.'
    : 'Pets welcome. Water and trash are included in your rent.';
  return page(
    'Larkspur Flats, Unit 5B',
    'Larkspur Rentals',
    '#2f6f73',
    `<h1>Larkspur Flats, Unit 5B</h1><p class="lede">2 bd / 1 ba in Larkspur Heights. Ref ${ctx.requestNumber}.</p>
<dl>
<dt>Rent</dt><dd><span id="rent">${rent}</span>/mo</dd>
<dt>Application fee</dt><dd id="app-fee">$50</dd>
<dt>Security deposit</dt><dd id="deposit">$1,000</dd>
<dt>Move-in special</dt><dd id="move-in">First month's parking free on a 12-month lease.</dd>
</dl>
<section id="fees"><h2>Fees and fine print</h2><p>${fees}</p></section>
<p><a href="/rentals/search?utm_source=detail&amp;sid=${ctx.requestNumber}">Back to results</a></p>`,
    ctx,
  );
}

function page(title: string, brand: string, accent: string, body: string, ctx: PageContext): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | ${brand}</title>
<style>
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: #222; background: #fafafa; }
  header { background: ${accent}; color: #fff; padding: 16px 24px; }
  main { max-width: 960px; margin: 0 auto; padding: 24px; }
  .card { background: #fff; border-radius: 12px; padding: 16px; margin: 12px 0; box-shadow: 0 2px 10px rgba(0,0,0,.06); display: grid; grid-template-columns: 1fr auto; }
  .price { font-weight: 700; font-size: 20px; color: ${accent}; }
  table { border-collapse: collapse; width: 100%; background: #fff; } th, td { padding: 8px 10px; border-bottom: 1px solid #eee; text-align: left; }
  .ad { background: #eef6ff; padding: 10px; border-radius: 8px; font-size: 13px; }
  footer { color: #888; font-size: 12px; text-align: center; padding: 24px; }
</style>
</head>
<body>
<header><strong>${brand}</strong></header>
<main>
<div class="ad" id="ad-slot-${ctx.requestNumber % 3}">Sponsored: Moving soon? Rent a cauldron-sized truck from Hollowmere Haulers. Ref ${ctx.now.getTime().toString(36)}</div>
${body}
</main>
<footer>Updated ${ctx.now.toUTCString()} · ${brand} is invented for software demos. Questions: 555-01${20 + (ctx.version % 9)} or hello@example.com</footer>
</body>
</html>`;
}

function larkspur(ctx: PageContext): string {
  const cards = larkspurListings(ctx.version)
    .map(
      (l) => `<article class="card listing" data-listing-id="${l.id}">
  <div><h2 class="address">${l.address}</h2><p><span class="hood">${l.neighborhood}</span> · <span class="beds">${l.beds} bd</span> / ${l.baths} ba · posted <time>${l.posted}</time></p>
  <a class="details" href="/rentals/listing/${l.id}?utm_source=search&amp;utm_medium=list&amp;sid=${ctx.requestNumber}">View details</a></div>
  <div class="price">${l.price}<small>/mo</small></div>
</article>`,
    )
    .join('\n');
  return page('Apartments for rent in Hollowmere', 'Larkspur Rentals', '#2f6f73', `<h1>Apartments for rent in Hollowmere</h1><p>${larkspurListings(ctx.version).length} results</p>${cards}`, ctx);
}

interface Unit {
  unit: string;
  layout: string;
  rent: string;
  available: string;
}

function fenwickUnits(version: number): Unit[] {
  const units: Unit[] = [
    { unit: '1A', layout: 'Studio', rent: '$1,395', available: 'Now' },
    { unit: '2C', layout: '1 bed / 1 bath', rent: '$1,690', available: 'Dec 1, 2026' },
    { unit: '3B', layout: '2 bed / 1 bath', rent: '$2,240', available: 'Dec 15, 2026' },
  ];
  if (version >= 2) {
    units.splice(1, 1); // 2C was rented
    units.push({ unit: '4D', layout: 'Studio', rent: '$1,725', available: 'Jan 1, 2027' });
  }
  return units;
}

function fenwick(ctx: PageContext): string {
  const rows = fenwickUnits(ctx.version)
    .map((u) => `<tr class="unit"><td class="unit-no">${u.unit}</td><td class="layout">${u.layout}</td><td class="rent">${u.rent}</td><td class="avail">${u.available}</td></tr>`)
    .join('');
  return page(
    'The Vale Apartments: availability',
    'Fenwick & Vale Property Co.',
    '#6b4c9a',
    `<h1>The Vale Apartments</h1><p>612 Gallows Hill Rd, Hollowmere</p>
<table id="availability"><thead><tr><th>Unit</th><th>Layout</th><th>Rent</th><th>Available</th></tr></thead><tbody>${rows}</tbody></table>`,
    ctx,
  );
}

interface Permit {
  number: string;
  type: string;
  address: string;
  valuation: string;
  filed: string;
  description: string;
}

function permits(version: number): Permit[] {
  const list: Permit[] = [
    { number: 'BP-2026-1184', type: 'Alteration', address: '77 Sexton St', valuation: '$38,000', filed: '10/27/2026', description: 'Kitchen remodel' },
    { number: 'BP-2026-1191', type: 'Roofing', address: '450 Wraith Way', valuation: '$12,500', filed: '10/29/2026', description: 'Replace roof covering' },
    { number: 'BP-2026-1202', type: 'New Construction', address: '15 Larkspur Blvd', valuation: '$640,000', filed: '11/03/2026', description: 'Single-family dwelling' },
  ];
  if (version >= 2) {
    list.unshift(
      { number: 'BP-2026-1240', type: 'Demolition', address: '1200 Bramble Row', valuation: '$45,000', filed: '11/12/2026', description: 'Demolish detached garage' },
      { number: 'BP-2026-1243', type: 'Electrical', address: '33 Ember Ct', valuation: '$4,200', filed: '11/12/2026', description: 'Panel upgrade' },
      { number: 'BP-2026-1247', type: 'New Construction', address: '200 Old Mill Rd', valuation: '$2,400,000', filed: '11/13/2026', description: 'Four-story mixed-use building, 36 units' },
    );
  }
  if (version >= 3) {
    list.unshift({ number: 'BP-2026-1262', type: 'Demolition', address: '9 Cobweb Alley', valuation: '$120,000', filed: '11/19/2026', description: 'Demolish two-family dwelling' });
  }
  return list;
}

function cityPermits(ctx: PageContext): string {
  const rows = permits(ctx.version)
    .map(
      (p) => `<tr class="permit"><td class="num">${p.number}</td><td class="type">${p.type}</td><td class="addr">${p.address}</td><td class="val">${p.valuation}</td><td class="filed">${p.filed}</td><td class="desc">${p.description}</td></tr>`,
    )
    .join('');
  return page(
    'Building permits filed in the last 30 days',
    'City of Hollowmere: Department of Buildings',
    '#3c3c46',
    `<h1>Building permits filed in the last 30 days</h1><p>Data refreshed nightly. Session ${ctx.requestNumber}.</p>
<table id="permits"><thead><tr><th>Permit</th><th>Type</th><th>Address</th><th>Valuation</th><th>Filed</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`,
    ctx,
  );
}

function oldMillLofts(ctx: PageContext): string {
  const status = ctx.version >= 2 ? 'Now leasing: 12 units available for January move-in.' : 'Waitlist only. Join the list to hear first.';
  return page(
    'Old Mill Lofts',
    'Old Mill Lofts',
    '#8a4b2a',
    `<h1>Old Mill Lofts</h1><p class="lede">Converted textile mill lofts on the Hollowmere riverfront.</p>
<p id="leasing-status">${status}</p><p>Studios from <span id="from-price">$1,550</span></p>`,
    ctx,
  );
}

export const listingSite: FixtureSite = {
  name: 'listing-watch',
  versions: 3,
  robots: `# Invented Hollowmere fixture site
User-agent: *
Disallow: /account/
Allow: /

User-agent: GhostWatcher
Disallow: /account/
Crawl-delay: 0.2
`,
  pages: [
    { path: '/rentals/search', title: 'Larkspur Rentals: Hollowmere search results', render: larkspur },
    { path: '/rentals/listing/LR-2033', title: 'Larkspur Flats, Unit 5B: rent and fees', render: larkspurFlats },
    { path: '/vale/availability', title: 'Fenwick & Vale: The Vale availability', render: fenwick },
    { path: '/city/permits', title: 'City of Hollowmere: recent building permits', render: cityPermits },
    { path: '/old-mill-lofts', title: 'Old Mill Lofts: leasing status', render: oldMillLofts },
  ],
};

/**
 * The page changes a renter with these filters would want to hear about, night by night. Reordered
 * listings, footers and session counters are noise. Used by the noise-ratio comparison.
 */
export const listingWorthKnowing: WorthKnowing[] = [
  { version: 2, watchId: 'larkspur-rentals', why: 'a 2 bd in Old Mill at $1,950, and a price cut into budget' },
  { version: 2, watchId: 'larkspur-flats-5b', why: 'a rent rise and a new $45 monthly amenity fee' },
  { version: 2, watchId: 'vale-availability', why: 'a studio under $1,800' },
  { version: 2, watchId: 'hollowmere-permits', why: 'a demolition and a 36-unit new build' },
  { version: 2, watchId: 'old-mill-lofts', why: 'leasing opens' },
  { version: 3, watchId: 'larkspur-rentals', why: 'a 2 bd in Larkspur Heights at $2,075' },
  { version: 3, watchId: 'hollowmere-permits', why: 'a demolition on Cobweb Alley' },
];
