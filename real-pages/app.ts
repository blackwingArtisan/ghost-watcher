/**
 * real-pages: three real public bank and card sign-up bonus pages, read only from their Internet
 * Archive copies (see README.md). Same shape as apps/bonus-watch/src/app.ts, built only from the
 * template's public API.
 *
 * Selectors are chosen from archived HTML. Where a site's markup changed between 2024 and 2026, a
 * `body` selector with a sentence pattern reads the same words in either layout.
 */
import { HOUR_MS, defineApp, defineWatch, rules, type Env, type GhostApp } from '@ghost-watcher/template';

/** Dates are read from the pages' own words, so they are the dates the pages stated. */
const DAY_MS = 24 * HOUR_MS;

export function buildApp(env: Env = process.env): GhostApp {
  const contactUrl = env.GHOST_CONTACT_URL;
  return defineApp({
    id: 'real-pages',
    name: 'Real Pages',
    tagline: 'Three real bonus pages, replayed from the Internet Archive.',
    version: '0.1.0',
    ...(contactUrl ? { contactUrl } : {}),
    alertTo: ['bonus.hunter@example.com'],
    theme: { accent: '#8dffb4', accentSecondary: '#e8c66a', sky: '#0d1414', moon: '#efe7c8', crest: 'Archive' },
    copy: {
      watchNoun: 'bonus pages',
      quiet: 'No bonus has stirred yet.',
      disclaimer: 'Reports what each page says. Not financial advice.',
      disputes: true,
      pacts: true,
    },
    watches: [
      defineWatch({
        id: 'td-checking-savings-bonus',
        name: 'TD Bank checking and savings bonus',
        subtitle: 'TD Bank · checking and savings bonus page',
        url: 'https://www.td.com/us/en/personal-banking/checking-and-saving-bonus',
        tags: ['checking', 'savings'],
        intervalMs: DAY_MS,
        fields: [
          // The page's <h1> reads "New TD checking ... customers can earn up to $500" and ends in a footnote
          // digit, so the lookahead lets the amount stop before that digit.
          { name: 'bonus', label: 'Headline bonus', selector: 'h1', pattern: 'up to (\\$\\d{1,3}(?:,\\d{3})*)(?=\\d{0,2}\\s*$)', kind: 'money', better: 'higher' },
          { name: 'deposit', label: 'Direct deposits for Beyond Checking', selector: 'body', pattern: 'TD Beyond Checking account and make (\\$[\\d,]+)', kind: 'money', better: 'lower' },
          { name: 'deadline', label: 'Offer valid through', selector: 'body', pattern: 'Offer valid through ([A-Za-z]+ \\d{1,2}, \\d{4})', kind: 'date', better: 'higher' },
          // The whole legal block whose first paragraph opens with "Offer valid through", from just after the date to the end (the date has its own field).
          { name: 'finePrint', label: 'Fine print', selector: '.cmp-text:has(.legal-text:contains("Offer valid through"))', pattern: 'Offer valid through [A-Za-z]+ \\d{1,2}, \\d{4}\\W*(.+)$', kind: 'text' },
        ],
        rules: [
          rules.wentUp('bonus', { severity: 'shriek' }),
          rules.wentDown('bonus', { severity: 'shriek' }),
          rules.changed('deposit'),
          rules.changed('deadline'),
          rules.changed('finePrint', { severity: 'whisper' }),
          rules.stealthEdit('finePrint', ['bonus']),
          rules.disappeared('bonus', { severity: 'shriek', label: 'bonus offer ends' }),
        ],
      }),
      defineWatch({
        id: 'td-student-offer',
        name: 'TD Bank student checking offer',
        subtitle: 'TD Bank · student checking bonus',
        url: 'https://www.td.com/us/en/personal-banking/checking-accounts/studentoffer',
        tags: ['checking'],
        intervalMs: DAY_MS,
        fields: [
          { name: 'bonus', label: 'Bonus', selector: '.offer-center-banner__offer-header', pattern: '\\$[\\d,]+', kind: 'money', better: 'higher' },
          { name: 'purchases', label: 'Debit card purchases needed', selector: 'body', pattern: 'make (\\d+) (?:qualifying )?debit card purchases', kind: 'number', better: 'lower' },
          { name: 'window', label: 'Days to qualify', selector: 'body', pattern: 'debit card purchases within (\\d+) days', kind: 'number', better: 'higher' },
          { name: 'finePrint', label: 'Fine print', selector: '.small-body-text:contains("qualifying website")', pattern: '^\\d?(.+)$', kind: 'text' },
        ],
        rules: [
          rules.wentUp('bonus', { severity: 'shriek' }),
          rules.wentDown('bonus', { severity: 'shriek' }),
          rules.changed('purchases'),
          rules.changed('window'),
          rules.changed('finePrint', { severity: 'whisper' }),
          rules.stealthEdit('finePrint', ['bonus']),
          rules.disappeared('bonus', { severity: 'shriek', label: 'bonus offer ends' }),
        ],
      }),
      defineWatch({
        id: 'chase-freedom-unlimited',
        name: 'Chase Freedom Unlimited',
        subtitle: 'Chase · card sign-up bonus',
        url: 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited',
        tags: ['card'],
        intervalMs: DAY_MS,
        fields: [
          { name: 'bonus', label: 'Bonus', selector: 'body', pattern: 'Earn an? (\\$[\\d,]+) bonus', kind: 'money', better: 'higher' },
          { name: 'spend', label: 'Spend needed', selector: 'body', pattern: 'after you spend (\\$[\\d,]+) on purchases', kind: 'money', better: 'lower' },
          { name: 'months', label: 'Months to spend', selector: 'body', pattern: 'in the first (\\d+) months from account opening', kind: 'number', better: 'higher' },
          { name: 'finePrint', label: 'Fine print', selector: 'body', pattern: '(You will receive [\\d,]+ bonus points with this bonus offer[^.]*\\.[^.]*\\.)', kind: 'text' },
        ],
        rules: [
          rules.wentUp('bonus', { severity: 'shriek' }),
          rules.wentDown('bonus', { severity: 'shriek' }),
          rules.changed('spend'),
          rules.changed('months'),
          rules.changed('finePrint', { severity: 'whisper' }),
          rules.stealthEdit('finePrint', ['bonus']),
          rules.disappeared('bonus', { severity: 'shriek', label: 'bonus offer ends' }),
        ],
      }),
    ],
  });
}
