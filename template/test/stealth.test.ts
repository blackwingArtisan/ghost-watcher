import { describe, expect, it } from 'vitest';
import { renderAlertMessage } from '../src/alerts/render';
import type { Alert } from '../src/alerts/types';
import { diff } from '../src/diff';
import type { Extraction } from '../src/extract';
import { normalizeValue } from '../src/normalize';
import { describeRule, evaluateRules } from '../src/rules';
import { renderFeed } from '../src/ui/render.js';
import { defineWatch, rules, WatchDefinitionError } from '../src/watch';

const offer = (bonus: string, deposit: string, fine: string): Extraction => ({
  fields: {
    bonus: normalizeValue(bonus, 'money'),
    deposit: normalizeValue(deposit, 'money'),
    fine: normalizeValue(fine, 'text'),
  },
  lists: {},
});

const fields = [
  { name: 'bonus', label: 'Bonus', selector: '.b', kind: 'money' as const },
  { name: 'deposit', label: 'Min. deposit', selector: '.d', kind: 'money' as const },
  { name: 'fine', label: 'Fine print', selector: '.f', kind: 'text' as const },
];

const watch = defineWatch({
  id: 'offer',
  name: 'Offer',
  url: 'https://bank.example.com/offer',
  fields,
  rules: [
    rules.wentUp('bonus', { severity: 'shriek' }),
    rules.changed('deposit'),
    rules.appeared('fine', { matching: 'monthly fee', severity: 'moan', label: 'fine print adds a monthly fee' }),
    rules.changed('fine', { severity: 'whisper' }),
    rules.stealthEdit('fine', ['bonus', 'deposit']),
  ],
});

const BASE = 'Earn the bonus after qualifying deposits.';
const FEE = 'Earn the bonus after qualifying deposits. A $12 monthly fee applies.';

describe('rules.stealthEdit', () => {
  it('names itself in plain words', () => {
    expect(describeRule(rules.stealthEdit('fine', ['bonus', 'deposit']), watch)).toBe('Fine print changes while Bonus and Min. deposit stay the same');
  });

  it('marks the fine-print finding as a bait and switch, and raises it to a shriek, without a second alert', () => {
    const found = evaluateRules(watch, diff(offer('$300', '$500', BASE), offer('$300', '$500', FEE)));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      ruleKind: 'appeared',
      severity: 'shriek',
      summary: 'Fine print now says "A $12 monthly fee applies."',
      stealth: 'Bonus and Min. deposit stayed the same while the fine print changed.',
    });
  });

  it('stays quiet when a headline value changed too: that is a visible change, not a stealthy one', () => {
    const found = evaluateRules(watch, diff(offer('$300', '$500', BASE), offer('$400', '$500', FEE)));
    expect(found.map((f) => f.ruleKind)).toEqual(['wentUp', 'appeared']);
    expect(found.every((f) => f.stealth === undefined)).toBe(true);
    expect(evaluateRules(watch, diff(offer('$300', '$500', BASE), offer('$300', '$250', FEE))).some((f) => f.stealth)).toBe(false);
  });

  it('becomes its own finding when no other rule watches the field', () => {
    const lone = defineWatch({ id: 'lone', name: 'Lone', url: 'https://bank.example.com/x', fields, rules: [rules.stealthEdit('fine', ['bonus'])] });
    const found = evaluateRules(lone, diff(offer('$300', '$500', BASE), offer('$300', '$500', FEE)));
    expect(found).toEqual([
      expect.objectContaining({
        ruleKind: 'stealthEdit',
        severity: 'shriek',
        stealth: 'Bonus stayed the same while the fine print changed.',
        summary: expect.stringMatching(/^Fine print changed: /),
      }),
    ]);
    expect(evaluateRules(lone, diff(offer('$300', '$500', BASE), offer('$300', '$500', BASE)))).toEqual([]);
  });

  it('refuses unknown or self-referencing headline fields', () => {
    const bad = (headline: string[]) => () =>
      defineWatch({ id: 'bad', name: 'Bad', url: 'https://bank.example.com/x', fields, rules: [rules.stealthEdit('fine', headline)] });
    expect(bad(['nope'])).toThrow(WatchDefinitionError);
    expect(bad(['fine'])).toThrow(/its own headline/);
    expect(bad([])).toThrow(/at least one headline/);
  });
});

describe('the bait-and-switch banner', () => {
  const alert: Alert = {
    id: 'offer-1',
    watchId: 'offer',
    watchName: 'Offer',
    url: 'https://bank.example.com/offer',
    createdAt: '2026-11-18T12:00:00.000Z',
    severity: 'shriek',
    ruleKind: 'appeared',
    ruleLabel: 'fine print adds a monthly fee',
    summary: 'Fine print now says "A $12 monthly fee applies."',
    stealth: 'Bonus stayed the same while the fine print changed.',
  };

  it('leads the email subject, text and HTML', () => {
    const m = renderAlertMessage({ appName: 'Crypt', to: ['a@example.com'], watch: { id: 'offer', name: 'Offer', url: alert.url }, alerts: [alert], createdAt: alert.createdAt });
    expect(m.subject).toBe('[!] Bait and switch on Offer: Fine print now says "A $12 monthly fee applies."');
    expect(m.text).toContain('- [Shriek] BAIT AND SWITCH: Bonus stayed the same while the fine print changed. Fine print now says');
    expect(m.html).toContain('>Bait and switch</div>');
  });

  it('marks the Spirit mail entry', () => {
    const html = renderFeed({ generatedAt: alert.createdAt, app: { quiet: 'Quiet.' }, feed: [{ alert, acknowledged: false, letter: null }] });
    expect(html).toContain('data-stealth="true"');
    expect(html).toContain('<span class="stealth__tag">Bait and switch</span> Bonus stayed the same while the fine print changed.');
    const plain = renderFeed({ generatedAt: alert.createdAt, app: { quiet: 'Quiet.' }, feed: [{ alert: { ...alert, stealth: undefined }, acknowledged: false, letter: null }] });
    expect(plain).not.toContain('stealth');
  });
});
