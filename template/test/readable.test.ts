import { describe, expect, it } from 'vitest';
import { extract } from '../src/extract';
import { MIN_READABLE_CHARS, pageTitle, readableText } from '../src/readable';
import { defineWatch, rules } from '../src/watch';
import { articlePage, SHELL_PAGE } from './seal-any-page-support';

describe('readable text extraction', () => {
  it('(ANY 1.1, 1.2) reads the main content: headings, paragraphs and list items in order, each once', () => {
    const text = readableText(articlePage({ version: 1, requestNumber: 1 }));
    expect(text).toBe(
      'Hollowmere welcome bonus terms. ' +
        'Open a Hollowmere Everyday account and earn a $200 welcome bonus. The offer is for new members only. ' +
        'Receive direct deposits totaling $2,000 within 60 days of opening the account to qualify. ' +
        'Keep a balance of at least $500 for 90 days. The bonus is paid within 30 days after you qualify. ' +
        'Hollowmere is an invented institution for software demos, not a real credit union.',
    );
  });

  it('(ANY 1.3) drops scripts, navigation, the cookie banner, the ad slot and the footer', () => {
    const text = readableText(articlePage({ version: 1, requestNumber: 7 }));
    for (const noise of ['cookies', 'Sign in', 'Sponsored', 'Page generated', '__session', 'request id']) expect(text).not.toContain(noise);
  });

  it('(ANY 1.4) drops time elements and lines that only state a stamp or an id', () => {
    const text = readableText(
      '<body><main><h1>Terms</h1><p>Page generated 2026-11-19T10:00:00Z</p><p>Request id: 00ab12</p><p>Last updated Nov 19, 2026</p>' +
        '<time datetime="2026-11-19">Nov 19</time><p class="timestamp">12:00</p><p>The fee is $5 a month for every account held.</p></main></body>',
    );
    expect(text).toBe('Terms. The fee is $5 a month for every account held.');
  });

  it('(ANY 1.5) the same page read twice with different noise gives the same text', () => {
    const a = readableText(articlePage({ version: 1, requestNumber: 1 }));
    const b = readableText(articlePage({ version: 1, requestNumber: 4242, now: new Date('2031-01-01T00:00:00Z'), spaced: true }));
    expect(b).toBe(a);
  });

  it('(ANY 1.5) money is written one way, so "$ 200.00" and "$200" are the same sentence', () => {
    expect(readableText('<main><p>Earn a $ 200.00 bonus after you qualify for it.</p></main>')).toBe(readableText('<main><p>Earn a $200 bonus after you qualify for it.</p></main>'));
  });

  it('(ANY 1.1) falls back to the article, then to the body, when there is no main element', () => {
    expect(readableText('<body><p>Outside.</p><article><p>Inside the article only.</p></article></body>')).toBe('Inside the article only.');
    expect(readableText('<body><p>Only a body paragraph.</p></body>')).toBe('Only a body paragraph.');
  });

  it('(ANY 3.1, 3.3) a page that builds its content in the browser reads as shorter than the threshold', () => {
    expect(readableText(SHELL_PAGE).length).toBeLessThan(MIN_READABLE_CHARS);
    expect(readableText(articlePage({ version: 1, requestNumber: 1 })).length).toBeGreaterThanOrEqual(MIN_READABLE_CHARS);
  });

  it('(ANY 2.9) names the ghost from the h1, then the title', () => {
    expect(pageTitle('<title>Tab</title><h1>  Big   name </h1>')).toBe('Big name');
    expect(pageTitle('<title>Tab</title>')).toBe('Tab');
  });

  it('(ANY 1.6, 5.4) a field with the :readable selector watches the whole text', () => {
    const watch = defineWatch({
      id: 'r',
      name: 'R',
      url: 'http://127.0.0.1/x',
      fields: [{ name: 'text', selector: ':readable', kind: 'text' }],
      rules: [rules.changed('text')],
    });
    const found = extract(articlePage({ version: 1, requestNumber: 1 }), watch).fields.text;
    expect(found).toMatchObject({ kind: 'text' });
    expect(JSON.stringify(found)).toContain('$200 welcome bonus');
  });
});
