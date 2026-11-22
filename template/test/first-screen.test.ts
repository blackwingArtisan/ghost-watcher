import { describe, expect, it } from 'vitest';
import { parseFlags } from '../src/cli';
import { lostGhostPage } from '../src/server';
import { dollarsFromCents, exhibitLines, moneySinceApplied, renderIntro } from '../src/ui/render.js';

const money = (amountMinor: number) => ({ kind: 'money', amountMinor, currency: 'USD' });
const pactAlert = (watchId: string, createdAt: string, promised: number, now: number, relation = 'differs', tone = 'bad') => ({
  alert: { watchId, field: 'bonus', createdAt, after: money(now), pact: { relation, tone, promised: money(promised) } },
});

describe('the first screen', () => {
  it('adds up money that turned against the pacts in integer cents, newest change per field', () => {
    const feed = [
      pactAlert('lantern', '2026-11-02T03:00:00Z', 30000, 20000),
      pactAlert('lantern', '2026-11-01T03:00:00Z', 30000, 25000),
      pactAlert('mossgate', '2026-11-02T03:00:00Z', 7500, 7425),
      pactAlert('bramble', '2026-11-02T03:00:00Z', 10000, 10000, 'restored'),
      pactAlert('better', '2026-11-02T03:00:00Z', 30000, 40000, 'differs', 'good'),
      { alert: { watchId: 'plain', createdAt: '2026-11-02T03:00:00Z', after: money(100) } },
    ];
    expect(moneySinceApplied(feed)).toBe(10075);
    expect(dollarsFromCents(10075)).toBe('$100.75');
    expect(dollarsFromCents(123400)).toBe('$1,234');
    expect(moneySinceApplied([])).toBe(0);
  });

  it('says what the stones are before the reader has to guess', () => {
    const line = renderIntro({ app: { motif: 'stone', pacts: true, demo: true } });
    expect(line).toContain('Each stone watches one page.');
    expect(line).toContain('its pact keeps what the page said on the day you signed up');
    expect(renderIntro({ app: { motif: 'house' } })).toBe('Each house watches one page. Its ghost wakes only for changes that matter.');
  });

  it('marks the clause one exhibit has and the other does not', () => {
    expect(exhibitLines(['Bonus: $300', 'Fine print: none'], ['Bonus: $300', 'Fine print: 48 months'])).toBe(
      '<li>Bonus: $300</li><li><mark class="exhibit__mark">Fine print: none</mark></li>',
    );
  });

  it('accepts --open so npm run bonus opens the browser', () => {
    expect(parseFlags(['demo', '--open']).open).toBe(true);
    expect(parseFlags(['demo']).open).toBeUndefined();
  });

  it('serves a lost ghost page that escapes the app name', () => {
    const html = lostGhostPage('Bonus <Crypt>');
    expect(html).toContain('This ghost is lost');
    expect(html).toContain('Back to Bonus &#60;Crypt&#62;');
    expect(html).not.toContain('<Crypt>');
  });
});
