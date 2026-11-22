import { describe, expect, it } from 'vitest';
import { HOUR_MS, displayValue, extract, isPlaceholderContact, type Watch } from '@ghost-watcher/template';
import { buildApp } from './app';

/** A contact on a real, non-reserved domain. Nothing here contacts it. */
const TEST_CONTACT = 'https://github.com/blackwingArtisan/ghost-watcher';
const app = buildApp({ GHOST_CONTACT_URL: TEST_CONTACT });

function watch(id: string): Watch {
  const found = app.watches.find((w) => w.id === id);
  if (!found) throw new Error(`No watch ${id}`);
  return found;
}

describe('real-pages app definition (offline)', () => {
  it('defines three watches with unique ids and https URLs', () => {
    expect(app.watches.map((w) => w.id)).toEqual(['td-checking-savings-bonus', 'td-student-offer', 'chase-freedom-unlimited']);
    for (const w of app.watches) expect(new URL(w.url).protocol).toBe('https:');
  });

  it('checks no page more often than every 6 hours', () => {
    for (const w of app.watches) expect(w.intervalMs).toBeGreaterThanOrEqual(6 * HOUR_MS);
  });

  it('takes its contact URL from the environment and never sends a placeholder', () => {
    expect(app.contactUrl).toBe(TEST_CONTACT);
    expect(isPlaceholderContact(app.contactUrl ?? '')).toBe(false);
    expect(buildApp({}).contactUrl).toBeUndefined();
  });

  it('names a bonus, a requirement, a deadline and a fine print field on every watch', () => {
    const requirement = { 'td-checking-savings-bonus': 'deposit', 'td-student-offer': 'purchases', 'chase-freedom-unlimited': 'spend' };
    const deadline = { 'td-checking-savings-bonus': 'deadline', 'td-student-offer': 'window', 'chase-freedom-unlimited': 'months' };
    for (const w of app.watches) {
      const names = w.fields.map((f) => f.name);
      expect(names, w.id).toContain('bonus');
      expect(names, w.id).toContain('finePrint');
      expect(names, w.id).toContain(requirement[w.id as keyof typeof requirement]);
      expect(names, w.id).toContain(deadline[w.id as keyof typeof deadline]);
      expect(w.fields.find((f) => f.name === 'bonus')?.better, w.id).toBe('higher');
      expect(w.fields.find((f) => f.name === requirement[w.id as keyof typeof requirement])?.better, w.id).toBe('lower');
    }
  });

  it('has a rule for a bonus that goes up, goes down or disappears, and for fine print', () => {
    for (const w of app.watches) {
      const kinds = w.rules.map((r) => `${r.kind}:${'field' in r ? r.field : ''}`);
      expect(kinds, w.id).toEqual(expect.arrayContaining(['wentUp:bonus', 'wentDown:bonus', 'disappeared:bonus', 'changed:finePrint']));
    }
  });
});

describe('real-pages selectors on small stand-in HTML', () => {
  it('reads the TD headline bonus without the footnote digit after it', () => {
    const html = '<h1>New TD checking and savings customers can earn up to $500<sup>1</sup></h1>';
    expect(displayValue(extract(html, watch('td-checking-savings-bonus')).fields.bonus ?? null)).toBe('$500');
  });

  it('reads the TD deposit requirement and offer deadline from their sentences', () => {
    const html =
      '<p>Earn $300 when you open your new TD Beyond Checking account and make $2,500 in direct deposits.</p>' +
      '<div class="cmp-text"><span class="legal-text">1Offer valid through November 30, 2026 and is available only when opening online.</span></div>';
    const fields = extract(html, watch('td-checking-savings-bonus')).fields;
    expect(displayValue(fields.deposit ?? null)).toBe('$2,500');
    expect(displayValue(fields.deadline ?? null)).toBe('Nov 30, 2026');
    expect(displayValue(fields.finePrint ?? null)).toBe('and is available only when opening online.');
  });

  it('reads the Chase bonus, spend and window from the page sentences', () => {
    const html =
      '<p>Earn a $200 bonus after you spend $500 on purchases in the first 3 months from account opening.</p>' +
      '<p>You will receive 20,000 bonus points with this bonus offer, which can be redeemed for $200 cash back. To qualify, spend $500.</p>';
    const fields = extract(html, watch('chase-freedom-unlimited')).fields;
    expect(displayValue(fields.bonus ?? null)).toBe('$200');
    expect(displayValue(fields.spend ?? null)).toBe('$500');
    expect(displayValue(fields.months ?? null)).toBe('3');
    expect(displayValue(fields.finePrint ?? null)).toContain('20,000 bonus points');
  });

  it('ignores a page that has none of the watched words', () => {
    const fields = extract('<h1>Welcome</h1><p>Rates and fees.</p>', watch('td-student-offer')).fields;
    expect(Object.values(fields).every((v) => v === null)).toBe(true);
  });
});
