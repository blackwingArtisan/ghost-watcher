/**
 * Invented bank and card offer pages for bonus-watch. Every name, number and address here is made up.
 * Pages carry realistic noise (timestamps, rotating promos, request ids) that must never cause alerts.
 *
 * Version 1: the baseline.
 * Version 2: Lanternfield raises its bonus, lowers the deposit and extends the deadline; Mossgate adds
 *            an annual fee and a 48-month eligibility clause; Bramblewick only reformats its page.
 * Version 3: Bramblewick's offer ends; Lanternfield's fine print adds a monthly fee clause.
 *
 * Version 4: only Fernwick moves. Its bonus is cut in steps of $500 (v1 $5,000, v2 $4,500, v3 $4,000, v4
 *            $3,500), each too small to wake the nightly ghost; only the pact adds them up.
 *
 * Archived copies (served by the stand-in Wayback endpoints for the Ghost of Terms Past):
 * Version -1 (March 2026): Lanternfield $500, Bramblewick $200 at 4.10% APY, Mossgate 80,000 points.
 * Version 0 (June 2026):   Lanternfield cuts to $300 and moves its deadline; Bramblewick raises to
 *                          $250 and settles on today's terms; Mossgate cuts to 60,000 points. Since
 *                          June, Lanternfield moved its deadline again and Mossgate raised the spend
 *                          from $3,000 to $4,000, so each page has its own fickleness.
 */
import type { FixtureSite, PageContext, WorthKnowing } from '@ghost-watcher/template/testing';

const PROMOS = [
  'Spooky season savings: 0.50% APY on new CDs this week only.',
  'Download our mobile app and deposit checks from anywhere.',
  'Ask about our Haunted House home equity line.',
  'Free coin counting every Thursday at participating branches.',
];

function chrome(title: string, brand: string, color: string, body: string, ctx: PageContext): string {
  const promo = PROMOS[ctx.requestNumber % PROMOS.length];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | ${brand}</title>
<style>
  body { margin: 0; font: 16px/1.55 Georgia, 'Times New Roman', serif; color: #1d1d24; background: #f6f4ef; }
  header { background: ${color}; color: #fff; padding: 18px 28px; display: flex; justify-content: space-between; align-items: center; }
  header b { font: 700 20px/1 system-ui, sans-serif; letter-spacing: .02em; }
  nav a { color: #fff; margin-left: 18px; font: 14px system-ui, sans-serif; text-decoration: none; opacity: .9; }
  main { max-width: 820px; margin: 0 auto; padding: 28px; }
  .promo { background: #fff6d8; border: 1px solid #ecdca0; padding: 10px 14px; font: 14px system-ui, sans-serif; border-radius: 8px; }
  .offer { background: #fff; border-radius: 14px; padding: 26px; box-shadow: 0 4px 18px rgba(0,0,0,.06); margin-top: 18px; }
  .big { font: 700 44px/1.1 system-ui, sans-serif; color: ${color}; margin: 6px 0; }
  .terms { font-size: 13px; color: #555; border-top: 1px solid #e4e0d6; margin-top: 22px; padding-top: 14px; }
  footer { font: 12px system-ui, sans-serif; color: #777; text-align: center; padding: 30px; }
  table { border-collapse: collapse; width: 100%; } td, th { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
</style>
<script>window.__analytics = { session: "${ctx.requestNumber}-${ctx.now.getTime().toString(36)}" };</script>
</head>
<body>
<header><b>${brand}</b><nav><a href="#">Personal</a><a href="#">Business</a><a href="#">Locations</a><a href="#">Sign in</a></nav></header>
<main>
<p class="promo" data-rotating>${promo}</p>
${body}
</main>
<footer>
  Page generated ${ctx.now.toISOString()} · request ${ctx.requestNumber.toString(16).padStart(6, '0')} ·
  ${brand} is an invented institution for software demos, not a real bank. Call 555-01${10 + (ctx.requestNumber % 9)}.
</footer>
</body>
</html>`;
}

/** Picks the value for a version: archived (-1, 0), live baseline (1), and later nights (2+). */
function byVersion<T>(v: number, values: { past?: T; june?: T; now: T; later?: T }): T {
  if (v <= -1 && values.past !== undefined) return values.past;
  if (v <= 0 && values.june !== undefined) return values.june;
  if (v >= 2 && values.later !== undefined) return values.later;
  return values.now;
}

function lanternfield(ctx: PageContext): string {
  const v = ctx.version;
  const bonus = byVersion(v, { past: '$500', now: '$300', later: '$400' });
  const deposit = byVersion(v, { now: '$5,000', later: '$2,500' });
  const deadline = byVersion(v, { past: 'April 30, 2026', june: 'September 30, 2026', now: 'January 15, 2027', later: 'February 28, 2027' });
  const fine = [
    'Offer available to new personal checking customers only.',
    `Open an Everyday Checking account and receive qualifying direct deposits totaling ${deposit} or more within 90 days of account opening.`,
    'Bonus will be credited within 30 days after the qualifying period.',
    v >= 3 ? 'A $12 monthly service fee applies unless you keep a $1,500 daily balance.' : 'There is no monthly service fee for the first 12 months.',
    'Account must remain open for 6 months or the bonus may be deducted at closing.',
  ].join(' ');
  return chrome(
    'Everyday Checking bonus',
    'Lanternfield Savings',
    '#1f4d7a',
    `<section class="offer" id="checking-offer">
  <h1>Everyday Checking</h1>
  <p>Earn a</p>
  <p class="big" data-field="bonus">${bonus} bonus</p>
  <p>when you set up direct deposits of <strong data-field="min-deposit">${deposit}</strong> in your first 90 days.</p>
  <p>Open your account by <time data-field="deadline">${deadline}</time>.</p>
  <div class="terms" id="fine-print"><h2>Offer details</h2><p>${fine}</p></div>
</section>`,
    ctx,
  );
}

function bramblewick(ctx: PageContext): string {
  const v = ctx.version;
  if (v >= 3) {
    return chrome(
      'High-Yield Savings',
      'Bramblewick Federal Credit Union',
      '#3d6b3a',
      `<section class="offer"><h1>High-Yield Savings</h1>
  <p class="notice">This promotion has ended. Thank you for your interest.</p>
  <table class="rates"><tr><th>Balance</th><th>APY</th></tr><tr><td>$0 and up</td><td class="apy">3.85%</td></tr></table>
  <div class="terms" id="terms"><p>Rates are variable and may change after the account is opened. Membership eligibility applies.</p></div></section>`,
      ctx,
    );
  }
  // Version 2 changes only formatting: whitespace, date style, number grouping and markup order.
  const reformatted = v === 2;
  const bonus = byVersion(v, { past: '$200', now: '$250' });
  const minimum = byVersion(v, { past: '$10,000', now: '$15,000' });
  const ends = byVersion(v, { past: 'Jun 30, 2026', now: 'Dec 31, 2026' });
  const apy = byVersion(v, { past: '4.10%', now: '3.85%' });
  return chrome(
    'High-Yield Savings',
    'Bramblewick Federal Credit Union',
    '#3d6b3a',
    `<section class="offer">
  <h1>High-Yield Savings</h1>
  <div class="bonus-box">
    <span class="label">New member bonus</span>
    <span class="amount">${reformatted ? '$&nbsp;250.00' : bonus}</span>
  </div>
  <p>Keep a balance of <span class="min">${reformatted ? '$15000' : minimum}</span> for 60 days.</p>
  <p>Offer ends <span class="ends">${reformatted ? '12/31/2026' : ends}</span>.</p>
  <table class="rates"><tr><th>Balance</th><th>APY</th></tr><tr><td>$0 and up</td><td class="apy">${reformatted ? '3.85 %' : apy}</td></tr></table>
  <div class="terms" id="terms"><p>${
    reformatted
      ? 'Rates are variable and may change after the account is opened.\n\n      Membership eligibility applies.   Bonus is reported as interest on IRS Form 1099-INT.'
      : 'Rates are variable and may change after the account is opened. Membership eligibility applies. Bonus is reported as interest on IRS Form 1099-INT.'
  }</p></div>
</section>`,
    ctx,
  );
}

function mossgate(ctx: PageContext): string {
  const v = ctx.version;
  const fee = v >= 2 ? '$95' : '$0';
  const points = byVersion(v, { past: '80,000', now: '60,000' });
  const spend = byVersion(v, { past: '$3,000', june: '$3,000', now: '$4,000' });
  const applyBy = byVersion(v, { past: '2026-05-31', now: '2026-12-15' });
  const clause =
    v >= 2
      ? ' Bonus not available if you have opened any Mossgate card in the past 48 months.'
      : '';
  return chrome(
    'Nightfall Rewards Card',
    'Mossgate Card Co.',
    '#5a2d6e',
    `<section class="offer card-offer">
  <h1>Nightfall Rewards Card</h1>
  <p class="big"><span id="points">${points}</span> bonus points</p>
  <p>after you spend <span id="spend">${spend}</span> on purchases in the first 3 months.</p>
  <ul>
    <li>Annual fee: <span id="annual-fee">${fee}</span></li>
    <li>3x points at restaurants and costume shops</li>
    <li>Apply by <span id="apply-by">${applyBy}</span></li>
  </ul>
  <div class="terms" id="card-terms"><p>Points are awarded 8 weeks after the spending requirement is met. Purchases exclude balance transfers and cash advances.${clause}</p></div>
</section>`,
    ctx,
  );
}

function fernwick(ctx: PageContext): string {
  const bonus = ['$5,000', '$5,000', '$4,500', '$4,000', '$3,500'][Math.max(1, Math.min(4, ctx.version))];
  return chrome(
    'Premier Savings bonus',
    'Fernwick Trust',
    '#2f5d62',
    `<section class="offer"><h1>Premier Savings</h1><p>New money bonus</p><p class="big" id="fern-bonus">${bonus}</p>
  <p>Deposit new funds within 20 days of opening. The bonus posts within 15 days after that.</p>
  <div class="terms" id="fern-terms"><p>Rates are variable. Membership is open to everyone.</p></div></section>`,
    ctx,
  );
}

function cinderhollow(ctx: PageContext): string {
  return chrome(
    'Member offers',
    'Cinderhollow National Bank',
    '#7a3b1f',
    `<section class="offer"><h1>Members-only offers</h1><p class="big" id="member-bonus">$500</p><p>Private offers for existing members.</p></section>`,
    ctx,
  );
}

/**
 * A plain article page for "seal any page": readable text with the usual noise around it (cookie banner,
 * navigation, an ad slot, a "page generated" stamp, a request id, a dated `time` element). Version 2 changes
 * one sentence of the terms and adds one.
 */
function loyaltyTerms(ctx: PageContext): string {
  const later = ctx.version >= 2;
  const deposit = later ? '$3,000' : '$2,000';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Hollowmere Credit Union: Welcome bonus terms</title>
<script>window.__session = "${ctx.requestNumber}-${ctx.now.getTime().toString(36)}";</script></head>
<body>
<div id="cookie-banner">We use cookies. <button>Accept</button> Request ${ctx.requestNumber}.</div>
<nav><a href="/">Home</a> <a href="/guides/loyalty-terms">Offers</a> <a href="/">Sign in</a></nav>
<div class="ad-slot">Sponsored: ${ctx.requestNumber % 2 === 0 ? 'Ask about our haunted home loans' : 'Free coin counting on Thursdays'}.</div>
<main>
<article>
<h1>Hollowmere welcome bonus terms</h1>
<time datetime="${ctx.now.toISOString()}">${ctx.now.toUTCString()}</time>
<p>Open a Hollowmere Everyday account and earn a $ 200.00 welcome bonus. The offer is for new members only.</p>
<p>Receive direct deposits totaling ${deposit} within 60 days of opening the account to qualify.</p>
<ul>
<li>Keep a balance of at least $500 for 90 days.</li>
<li>The bonus is paid within 30 days after you qualify.</li>${later ? '\n<li>Accounts closed within 180 days forfeit the bonus.</li>' : ''}
</ul>
<p>Hollowmere is an invented institution for software demos, not a real credit union.</p>
</article>
</main>
<footer>Page generated ${ctx.now.toISOString()} · request id ${ctx.requestNumber.toString(16).padStart(6, '0')}</footer>
</body></html>`;
}

/** A page whose content is built by a script in the browser: the server sends an empty shell. */
function appShell(ctx: PageContext): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Hollowmere app</title></head>
<body><div id="root"></div><noscript>Please enable JavaScript.</noscript>
<script>document.getElementById('root').textContent = 'Offers load here ${ctx.requestNumber}';</script>
</body></html>`;
}

export const bonusSite: FixtureSite = {
  name: 'bonus-watch',
  versions: 4,
  past: [
    { version: -1, capturedAt: '2026-03-04T15:12:09Z' },
    { version: 0, capturedAt: '2026-06-11T09:30:44Z' },
  ],
  robots: `# Invented bank fixture site
User-agent: *
Disallow: /members/
Crawl-delay: 0.2

User-agent: BadBot
Disallow: /
`,
  pages: [
    { path: '/lanternfield/everyday-checking', title: 'Lanternfield Savings: Everyday Checking', render: lanternfield },
    { path: '/bramblewick/savings', title: 'Bramblewick FCU: High-Yield Savings', render: bramblewick },
    { path: '/mossgate/nightfall-card', title: 'Mossgate Card Co.: Nightfall Rewards Card', render: mossgate },
    { path: '/fernwick/premier-savings', title: 'Fernwick Trust: Premier Savings', render: fernwick },
    { path: '/members/cinderhollow/offers', title: 'Cinderhollow National Bank: member offers (disallowed by robots.txt)', render: cinderhollow },
    { path: '/guides/loyalty-terms', title: 'Hollowmere: welcome bonus terms (article, for sealing any page)', render: loyaltyTerms },
    { path: '/guides/app-shell', title: 'Hollowmere: app shell (renders in the browser)', render: appShell },
  ],
};

/**
 * The page changes a bonus hunter would want to hear about, night by night. Everything else the
 * site does (timestamps, request ids, rotating promos, Bramblewick's reformat) is noise. Used by the
 * noise-ratio comparison.
 */
export const bonusWorthKnowing: WorthKnowing[] = [
  { version: 2, watchId: 'lanternfield-checking', why: 'bonus raised to $400, smaller deposit, later deadline' },
  { version: 2, watchId: 'mossgate-nightfall', why: 'a $95 annual fee and a 48-month eligibility clause' },
  { version: 3, watchId: 'lanternfield-checking', why: 'the fine print adds a $12 monthly fee' },
  { version: 3, watchId: 'bramblewick-savings', why: 'the bonus offer ends' },
  { version: 4, watchId: 'fernwick-premier', why: 'the bonus was cut from $5,000 to $3,500 in three small steps (only a pact adds them up)' },
];
