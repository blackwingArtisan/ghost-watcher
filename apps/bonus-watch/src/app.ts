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
    tagline: 'Ghosts that haunt bank and card bonus pages, and wail the moment the terms change.',
    version: '0.1.0',
    alertTo: ['bonus.hunter@example.com'],
    theme: { accent: '#8dffb4', accentSecondary: '#e8c66a', sky: '#0d1414', moon: '#efe7c8', crest: 'Crypt' },
    copy: {
      watchNoun: 'bonus pages',
      quiet: 'No bonus has stirred yet. Summon the ghosts to take a first look.',
      disclaimer: 'Reports what each page says. Not financial advice. Banks shown in the demo are invented.',
    },
    watches: [
      defineWatch({
        id: 'lanternfield-checking',
        name: 'Lanternfield Everyday Checking',
        subtitle: 'Lanternfield Savings · checking bonus',
        url: `${site}/lanternfield/everyday-checking`,
        tags: ['checking'],
        intervalMs: 12 * HOUR_MS,
        fields: [
          { name: 'bonus', label: 'Bonus', selector: '[data-field="bonus"]', kind: 'money' },
          { name: 'minDeposit', label: 'Min. deposit', selector: '[data-field="min-deposit"]', kind: 'money' },
          { name: 'deadline', label: 'Deadline', selector: '[data-field="deadline"]', kind: 'date' },
          { name: 'finePrint', label: 'Fine print', selector: '#fine-print p', kind: 'text' },
        ],
        rules: [
          rules.wentUp('bonus', { severity: 'shriek' }),
          rules.wentDown('bonus', { severity: 'shriek' }),
          rules.changed('minDeposit'),
          rules.changed('deadline'),
          rules.appeared('finePrint', { matching: 'monthly (service|maintenance) fee applies', severity: 'shriek', label: 'fine print adds a monthly fee' }),
          rules.changed('finePrint', { severity: 'whisper' }),
          rules.disappeared('bonus', { severity: 'shriek', label: 'bonus offer ends' }),
        ],
      }),
      defineWatch({
        id: 'bramblewick-savings',
        name: 'Bramblewick High-Yield Savings',
        subtitle: 'Bramblewick FCU · savings bonus',
        url: `${site}/bramblewick/savings`,
        tags: ['savings'],
        fields: [
          { name: 'bonus', label: 'Bonus', selector: '.bonus-box .amount', kind: 'money' },
          { name: 'minBalance', label: 'Min. balance', selector: '.min', kind: 'money' },
          { name: 'deadline', label: 'Ends', selector: '.ends', kind: 'date' },
          { name: 'apy', label: 'APY', selector: '.rates .apy', kind: 'percent' },
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
        ],
      }),
      defineWatch({
        id: 'mossgate-nightfall',
        name: 'Mossgate Nightfall Card',
        subtitle: 'Mossgate Card Co. · card sign-up bonus',
        url: `${site}/mossgate/nightfall-card`,
        tags: ['card'],
        fields: [
          { name: 'points', label: 'Bonus points', selector: '#points', kind: 'number' },
          { name: 'spend', label: 'Spend needed', selector: '#spend', kind: 'money' },
          { name: 'annualFee', label: 'Annual fee', selector: '#annual-fee', kind: 'money' },
          { name: 'applyBy', label: 'Apply by', selector: '#apply-by', kind: 'date' },
          { name: 'finePrint', label: 'Fine print', selector: '#card-terms p', kind: 'text' },
        ],
        rules: [
          rules.wentUp('points', { severity: 'shriek' }),
          rules.wentDown('points', { severity: 'shriek' }),
          rules.changed('spend'),
          rules.wentUp('annualFee', { label: 'annual fee goes up' }),
          rules.changed('applyBy'),
          rules.appeared('finePrint', { matching: 'past \\d+ months', severity: 'shriek', label: 'fine print adds an eligibility window' }),
          rules.changed('finePrint', { severity: 'whisper' }),
        ],
      }),
      defineWatch({
        id: 'cinderhollow-members',
        name: 'Cinderhollow Member Offers',
        subtitle: 'Cinderhollow National Bank · members area',
        url: `${site}/members/cinderhollow/offers`,
        tags: ['checking'],
        fields: [{ name: 'bonus', label: 'Bonus', selector: '#member-bonus', kind: 'money' }],
        rules: [rules.changed('bonus')],
      }),
    ],
  });
}
