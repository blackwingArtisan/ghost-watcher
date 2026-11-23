import { describe, expect, it } from 'vitest';
import { bookmarkletHref, renderSealPage, sealPrefill } from '../src/ui/render.js';

describe('the Seal this page bookmarklet', () => {
  it("(ANY 7.1, 7.2, 7.4) is a javascript: link that opens the dashboard's origin with only the tab's address", () => {
    const href = bookmarkletHref('http://127.0.0.1:3130');
    expect(href.startsWith('javascript:')).toBe(true);
    const opened: string[] = [];
    const run = new Function('window', 'location', 'encodeURIComponent', href.slice('javascript:'.length));
    run({ open: (url: string, target: string) => opened.push(`${url} ${target}`) }, { href: 'https://bank.example/offer?a=1&b=2' }, encodeURIComponent);
    expect(opened).toEqual(['http://127.0.0.1:3130/?seal=https%3A%2F%2Fbank.example%2Foffer%3Fa%3D1%26b%3D2 _blank']);
  });

  it('(ANY 7.3) a seal parameter fills the form only for http and https addresses', () => {
    expect(sealPrefill('https://bank.example/offer')).toBe('https://bank.example/offer');
    expect(sealPrefill('javascript:alert(1)')).toBe('');
    expect(sealPrefill('not a url')).toBe('');
    expect(sealPrefill(null)).toBe('');
  });

  it('(ANY 2.1, 7.1) the form and the link show only where the app offers pacts', () => {
    expect(renderSealPage({ app: { pacts: false } })).toBe('');
    const html = renderSealPage({ app: { pacts: true } });
    expect(html).toContain('Seal a page');
    expect(html).toContain('I applied today');
    expect(html).toContain('Seal this page');
    expect(html).toContain('role="status"');
  });
});
