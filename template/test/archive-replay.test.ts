import { describe, expect, it } from 'vitest';
import type { PastCapture } from '../src/history';
import { archiveReplayTable, replayArchive } from '../src/testing/archive-replay';
import { defineWatch, rules } from '../src/watch';

const watch = defineWatch({
  id: 'lantern',
  name: 'Lanternfield',
  url: 'https://bank.example/offer',
  fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money', better: 'higher' }],
  rules: [rules.changed('bonus')],
});

const copy = (at: string, bonus: string, footer: string): PastCapture => ({
  capturedAt: at,
  html: `<html><body><p class="bonus">${bonus}</p><footer>Updated ${footer}</footer></body></html>`,
  archiveUrl: `https://archive.example/web/${at}`,
});

describe('archive replay', () => {
  it('judges each step between archived copies with all three watchers', () => {
    const report = replayArchive(watch, [
      // Given out of order on purpose: the replay sorts oldest first.
      copy('2026-06-11T00:00:00Z', '$300', 'June'),
      copy('2026-01-05T00:00:00Z', '$500', 'January'),
      copy('2026-03-02T00:00:00Z', '$500', 'March'),
      copy('2026-04-20T00:00:00Z', '$500.00', 'March'),
    ]);
    expect(report).toEqual({
      watchId: 'lantern',
      name: 'Lanternfield',
      captures: 4,
      steps: 3,
      firstAt: '2026-01-05T00:00:00Z',
      lastAt: '2026-06-11T00:00:00Z',
      // A footer date, a reformatted amount and the real cut all move the page.
      wholePage: 3,
      // "$500" to "$500.00" fools a selector watcher; the footer does not.
      selectorText: 2,
      ghostWatcher: 1,
      said: ['2026-06-11: Bonus went down from $500 to $300 (-$200).'],
    });
  });

  it('reports a page with no copies, and totals several pages', () => {
    const empty = replayArchive({ ...watch, id: 'none', name: 'Nothing archived' }, []);
    expect(empty).toMatchObject({ captures: 0, steps: 0, firstAt: null, wholePage: 0, ghostWatcher: 0 });
    const one = replayArchive(watch, [copy('2026-01-05T00:00:00Z', '$500', 'a'), copy('2026-02-05T00:00:00Z', '$400', 'b')]);
    expect(archiveReplayTable([one, empty])).toBe(
      [
        '| Page | Archived copies replayed | Whole-page watcher | Selector text watcher | Ghost Watcher |',
        '| --- | --- | --- | --- | --- |',
        '| Lanternfield | 2 copies, 2026-01-05 to 2026-02-05 | 1 | 1 | 1 |',
        '| Nothing archived | 0 copies, none | 0 | 0 | 0 |',
        '| **Total** | 2 copies | **1** | **1** | **1** |',
      ].join('\n'),
    );
  });
});
