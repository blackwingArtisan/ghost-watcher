/**
 * bonus-watch: haunts bank and card sign-up bonus pages and speaks up when the bonus amount, the
 * minimum deposit, the deadline or the fine print changes. Built only from the template's public API.
 */
import { HOUR_MS, defineApp, defineWatch, rules, type Env, type GhostApp } from '@ghost-watcher/template';

export const DEFAULT_SITE = 'http://127.0.0.1:3131';

export function buildApp(env: Env = process.env): GhostApp {
  const site = (env.BONUS_SITE_ORIGIN ?? DEFAULT_SITE).replace(/\/$/, '');
  return defineApp({
    id: 'bonus-watch',
    name: 'The Bonus Crypt',
    tagline: 'Banks edit the fine print at night. Ghost Watcher keeps the receipts.',
    version: '0.1.0',
    alertTo: ['bonus.hunter@example.com'],
    theme: { accent: '#8dffb4', accentSecondary: '#e8c66a', sky: '#0d1414', moon: '#efe7c8', crest: 'Crypt' },
    copy: {
      watchNoun: 'bonus pages',
      quiet: 'No bonus has stirred yet. Summon the ghosts to take a first look.',
      disclaimer: 'Reports what each page says. Not financial advice. Banks shown in the demo are invented.',
      disputes: true,
      pacts: true,
      // Bramblewick stays unsealed in the demo: Lanternfield and Mossgate carry the pact stories (bonus
      // match and dispute letter), so this stone is free for a visitor to press "I applied today".
      demoUnsealed: ['bramblewick-savings'],
    },
    watches: [
      defineWatch({
        id: 'lanternfield-checking',
        name: 'Lanternfield Everyday Checking',
        subtitle: 'Lanternfield Savings · checking bonus',
        url: `${site}/lanternfield/everyday-checking`,
        displayUrl: 'https://lanternfield.example/everyday-checking',
        tags: ['checking'],
        intervalMs: 12 * HOUR_MS,
        fields: [
          { name: 'bonus', label: 'Bonus', selector: '[data-field="bonus"]', kind: 'money', better: 'higher' },
          { name: 'minDeposit', label: 'Min. deposit', selector: '[data-field="min-deposit"]', kind: 'money', better: 'lower' },
          { name: 'deadline', label: 'Deadline', selector: '[data-field="deadline"]', kind: 'date', better: 'higher' },
          { name: 'finePrint', label: 'Fine print', selector: '#fine-print p', kind: 'text' },
        ],
        rules: [
          rules.wentUp('bonus', { severity: 'shriek' }),
          rules.wentDown('bonus', { severity: 'shriek' }),
          rules.changed('minDeposit'),
          rules.changed('deadline'),
          rules.appeared('finePrint', { matching: 'monthly (service|maintenance) fee applies', severity: 'shriek', tone: 'bad', label: 'fine print adds a monthly fee' }),
          rules.changed('finePrint', { severity: 'whisper' }),
          rules.stealthEdit('finePrint', ['bonus']),
          rules.disappeared('bonus', { severity: 'shriek', label: 'bonus offer ends' }),
        ],
      }),
      defineWatch({
        id: 'bramblewick-savings',
        name: 'Bramblewick High-Yield Savings',
        subtitle: 'Bramblewick FCU · savings bonus',
        url: `${site}/bramblewick/savings`,
        displayUrl: 'https://bramblewick.example/savings',
        tags: ['savings'],
        fields: [
          { name: 'bonus', label: 'Bonus', selector: '.bonus-box .amount', kind: 'money', better: 'higher' },
          { name: 'minBalance', label: 'Min. balance', selector: '.min', kind: 'money', better: 'lower' },
          { name: 'deadline', label: 'Ends', selector: '.ends', kind: 'date', better: 'higher' },
          { name: 'apy', label: 'APY', selector: '.rates .apy', kind: 'percent', better: 'higher' },
          { name: 'finePrint', label: 'Fine print', selector: '#terms p', kind: 'text' },
        ],
        rules: [
          rules.wentUp('bonus', { severity: 'shriek' }),
          rules.wentDown('bonus', { severity: 'shriek' }),
          rules.disappeared('bonus', { severity: 'shriek', label: 'bonus offer ends' }),
          rules.changed('minBalance'),
          rules.changed('deadline'),
          rules.wentDown('apy', { severity: 'whisper' }),
          rules.changed('finePrint', { severity: 'whisper' }),
          rules.stealthEdit('finePrint', ['bonus']),
        ],
      }),
      defineWatch({
        id: 'mossgate-nightfall',
        name: 'Mossgate Nightfall Card',
        subtitle: 'Mossgate Card Co. · card sign-up bonus',
        url: `${site}/mossgate/nightfall-card`,
        displayUrl: 'https://mossgate.example/nightfall-card',
        tags: ['card'],
        fields: [
          { name: 'points', label: 'Bonus points', selector: '#points', kind: 'number', better: 'higher' },
          { name: 'spend', label: 'Spend needed', selector: '#spend', kind: 'money', better: 'lower' },
          { name: 'annualFee', label: 'Annual fee', selector: '#annual-fee', kind: 'money', better: 'lower' },
          { name: 'applyBy', label: 'Apply by', selector: '#apply-by', kind: 'date', better: 'higher' },
          { name: 'finePrint', label: 'Fine print', selector: '#card-terms p', kind: 'text' },
        ],
        // Spend $4,000 in the first 3 months; "points are awarded 8 weeks after the spending requirement is met".
        bonusClock: {
          requirement: 'spend $4,000',
          requirementDays: 91,
          requirementLabel: '3 months',
          postingDays: 56,
          postingLabel: 'within 8 weeks after the spending requirement is met',
        },
        rules: [
          rules.wentUp('points', { severity: 'shriek' }),
          rules.wentDown('points', { severity: 'shriek' }),
          rules.changed('spend'),
          rules.wentUp('annualFee', { label: 'annual fee goes up' }),
          rules.changed('applyBy'),
          rules.appeared('finePrint', { matching: 'past \\d+ months', severity: 'shriek', tone: 'bad', label: 'fine print adds an eligibility window' }),
          rules.changed('finePrint', { severity: 'whisper' }),
          rules.stealthEdit('finePrint', ['points']),
        ],
      }),
      defineWatch({
        id: 'fernwick-premier',
        name: 'Fernwick Premier Savings',
        subtitle: 'Fernwick Trust · new-money bonus',
        url: `${site}/fernwick/premier-savings`,
        displayUrl: 'https://fernwick.example/premier-savings',
        tags: ['savings'],
        fields: [{ name: 'bonus', label: 'Bonus', selector: '#fern-bonus', kind: 'money', better: 'higher' }],
        // Deposit within 20 days; the bonus posts within 15 days after that.
        bonusClock: {
          requirement: 'deposit new funds',
          requirementDays: 20,
          requirementLabel: '20 days of opening',
          postingDays: 15,
          postingLabel: 'within 15 days after the deposit',
        },
        // The page cuts the bonus $500 a night. No single night, and no two nights together ($1,000),
        // reaches $1,200, so the nightly ghost sleeps; the pact's total of $1,500 on night 3 does.
        rules: [rules.wentDown('bonus', { severity: 'shriek', minDelta: 1200 })],
      }),
      defineWatch({
        id: 'cinderhollow-members',
        name: 'Cinderhollow Member Offers',
        subtitle: 'Cinderhollow National Bank · members area',
        url: `${site}/members/cinderhollow/offers`,
        displayUrl: 'https://cinderhollow.example/members/offers',
        tags: ['checking'],
        fields: [{ name: 'bonus', label: 'Bonus', selector: '#member-bonus', kind: 'money' }],
        rules: [rules.changed('bonus')],
      }),
    ],
  });
}
