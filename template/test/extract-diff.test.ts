import { describe, expect, it } from 'vitest';
import { diff, fingerprint, isEmptyDiff } from '../src/diff';
import { extract } from '../src/extract';
import { defineWatch } from '../src/watch';

const watch = defineWatch({
  id: 'demo',
  name: 'Demo',
  url: 'https://example.com/offer',
  fields: [
    { name: 'bonus', selector: '.bonus', kind: 'money' },
    { name: 'deadline', selector: 'time', attribute: 'datetime', kind: 'date' },
    { name: 'apy', selector: '.rate', kind: 'percent', pattern: 'APY of ([\\d.]+%)' },
    { name: 'missing', selector: '.does-not-exist', kind: 'text' },
  ],
  lists: [
    {
      name: 'homes',
      itemSelector: 'li.home',
      identity: ['id'],
      fields: {
        id: { selector: ':self', attribute: 'data-id', kind: 'text' },
        price: { selector: '.price', kind: 'money' },
        beds: { selector: '.beds', kind: 'number' },
      },
    },
  ],
  rules: [],
});

const page = (bonus: string, homes: string, noise = '') => `<html><body>
  <p class="banner">${noise}</p>
  <p class="bonus">Earn ${bonus} <script>track()</script></p>
  <time datetime="2027-01-15">January 15</time>
  <p class="rate">Enjoy an APY of 3.85% on balances.</p>
  <ul>${homes}</ul>
</body></html>`;

const home = (id: string, price: string, beds = '2') => `<li class="home" data-id="${id}"><span class="price">${price}</span><span class="beds">${beds} bd</span></li>`;

describe('extract', () => {
  it('reads fields by selector, attribute and pattern, ignoring scripts', () => {
    const result = extract(page('$300', home('a', '$1,900')), watch);
    expect(result.fields.bonus).toEqual({ kind: 'money', amountMinor: 30000, currency: 'USD', display: '$300' });
    expect(result.fields.deadline).toMatchObject({ kind: 'date', iso: '2027-01-15' });
    expect(result.fields.apy).toMatchObject({ kind: 'percent', value: 3.85 });
    expect(result.fields.missing).toBeNull();
  });

  it('reads list items with identity keys and skips duplicates', () => {
    const result = extract(page('$300', home('a', '$1,900') + home('b', '$2,100', '3') + home('a', '$1,900')), watch);
    expect(result.lists.homes?.map((item) => item.key)).toEqual(['a', 'b']);
    expect(result.lists.homes?.[1]?.values.beds).toMatchObject({ kind: 'number', value: 3 });
  });
});

describe('diff', () => {
  const v1 = extract(page('$300', home('a', '$1,900') + home('b', '$2,100')), watch);

  it('marks the first run as a baseline with everything added', () => {
    const d = diff(undefined, v1);
    expect(d.firstRun).toBe(true);
    expect(d.fields.every((change) => change.type === 'added')).toBe(true);
    expect(d.lists.filter((change) => change.type === 'itemAdded')).toHaveLength(2);
  });

  it('ignores noise outside the watched regions and list order', () => {
    const v2 = extract(page('$300.00', home('b', '$2,100') + home('a', '$1,900'), 'Generated at 10:31 pm, session 81f2'), watch);
    const d = diff(v1, v2);
    expect(isEmptyDiff(d)).toBe(true);
    expect(fingerprint(v1)).toBe(fingerprint(v2));
  });

  it('reports field changes with a numeric delta', () => {
    const v2 = extract(page('$400', home('a', '$1,900') + home('b', '$2,100')), watch);
    const d = diff(v1, v2);
    expect(d.fields).toEqual([
      expect.objectContaining({ field: 'bonus', type: 'changed', delta: 10000 }),
    ]);
  });

  it('reports added, removed and changed list items', () => {
    const v2 = extract(page('$300', home('a', '$1,750') + home('c', '$1,500')), watch);
    const d = diff(v1, v2);
    const types = d.lists.map((change) => `${change.type}:${'item' in change ? change.item.key : change.after.key}`);
    expect(types.sort()).toEqual(['itemAdded:c', 'itemChanged:a', 'itemRemoved:b']);
    const changed = d.lists.find((change) => change.type === 'itemChanged');
    expect(changed && changed.type === 'itemChanged' ? changed.changes[0]?.delta : undefined).toBe(-15000);
    expect(fingerprint(v1)).not.toBe(fingerprint(v2));
  });

  it('reports a region that vanished as removed', () => {
    const v2 = extract('<html><body></body></html>', watch);
    const d = diff(v1, v2);
    expect(d.fields.find((change) => change.field === 'bonus')?.type).toBe('removed');
  });
});
