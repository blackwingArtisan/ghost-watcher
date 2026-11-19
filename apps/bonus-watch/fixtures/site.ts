/**
 * Invented bank and card offer pages for bonus-watch. Every name, number and address here is made up.
 * Pages carry realistic noise (timestamps, rotating promos, request ids) that must never cause alerts.
 *
 * Version 1: the baseline.
 * Version 2: Lanternfield raises its bonus, lowers the deposit and extends the deadline; Mossgate adds
 *            an annual fee and a 48-month eligibility clause; Bramblewick only reformats its page.
 * Version 3: Bramblewick's offer ends; Lanternfield's fine print adds a monthly fee clause.
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

function lanternfield(ctx: PageContext): string {
  const v = ctx.version;
  const bonus = v >= 2 ? '$400' : '$300';
  const deposit = v >= 2 ? '$2,500' : '$5,000';
  const deadline = v >= 2 ? 'February 28, 2027' : 'January 15, 2027';
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
  return chrome(
    'High-Yield Savings',
    'Bramblewick Federal Credit Union',
    '#3d6b3a',
    `<section class="offer">
  <h1>High-Yield Savings</h1>
  <div class="bonus-box">
    <span class="label">New member bonus</span>
    <span class="amount">${reformatted ? '$&nbsp;250.00' : '$250'}</span>
  </div>
  <p>Keep a balance of <span class="min">${reformatted ? '$15000' : '$15,000'}</span> for 60 days.</p>
  <p>Offer ends <span class="ends">${reformatted ? '12/31/2026' : 'Dec 31, 2026'}</span>.</p>
  <table class="rates"><tr><th>Balance</th><th>APY</th></tr><tr><td>$0 and up</td><td class="apy">${reformatted ? '3.85 %' : '3.85%'}</td></tr></table>
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
  <p class="big"><span id="points">60,000</span> bonus points</p>
  <p>after you spend <span id="spend">$4,000</span> on purchases in the first 3 months.</p>
  <ul>
    <li>Annual fee: <span id="annual-fee">${fee}</span></li>
    <li>3x points at restaurants and costume shops</li>
    <li>Apply by <span id="apply-by">2026-12-15</span></li>
  </ul>
  <div class="terms" id="card-terms"><p>Points are awarded 8 weeks after the spending requirement is met. Purchases exclude balance transfers and cash advances.${clause}</p></div>
</section>`,
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

export const bonusSite: FixtureSite = {
  name: 'bonus-watch',
  versions: 3,
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
    { path: '/members/cinderhollow/offers', title: 'Cinderhollow National Bank: member offers (disallowed by robots.txt)', render: cinderhollow },
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
];
