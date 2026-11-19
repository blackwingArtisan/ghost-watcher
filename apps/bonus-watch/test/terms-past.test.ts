import { describe, expect, it } from 'vitest';
import { WaybackHistorySource, buildPastTimeline, extract, type Watch } from '@ghost-watcher/template';
import { startFixtureServer } from '@ghost-watcher/template/testing';
import { bonusSite } from '../fixtures/site';
import { buildApp } from '../src/app';

describe('bonus-watch: the Ghost of Terms Past', () => {
  it('tells the history of each offer from its archived copies', async () => {
    const fixture = await startFixtureServer(bonusSite, { port: 0 });
    try {
      const app = buildApp({ BONUS_SITE_ORIGIN: fixture.origin });
      const source = new WaybackHistorySource({ userAgent: 'GhostWatcher/test', base: `${fixture.origin}/__wayback`, gapMs: 0 });
      const timelineOf = async (id: string) => {
        const watch = app.watches.find((w) => w.id === id) as Watch;
        const today = await (await fetch(watch.url)).text();
        return buildPastTimeline(watch, await source.captures(watch.url), { takenAt: '2026-11-18T12:00:00Z', ...extract(today, watch) }, source.label, '2026-11-18T12:00:00Z');
      };
      const story = async (id: string) => (await timelineOf(id)).entries.map((e) => `${e.at.slice(0, 10)} ${e.kind}: ${e.lines.join(' ')}`);

      expect(await story('lanternfield-checking')).toEqual([
        '2026-03-04 first: Bonus $500 · Min. deposit $5,000 · Deadline Apr 30, 2026',
        '2026-06-11 change: Bonus went down from $500 to $300 (-$200). Deadline moved from Apr 30, 2026 to Sep 30, 2026 (153 days later).',
        '2026-11-18 now: Deadline moved from Sep 30, 2026 to Jan 15, 2027 (107 days later).',
      ]);
      expect((await story('mossgate-nightfall'))[1]).toContain('Bonus points went down from 80,000 to 60,000 (-20,000).');
      expect((await story('bramblewick-savings'))[1]).toContain('Bonus went up from $200 to $250 (+$50).');

      // The stone's ribbon and the fickleness score come from the same history.
      const lanternfield = await timelineOf('lanternfield-checking');
      expect(lanternfield.headline).toEqual({ text: 'Bonus cut $200 in June', tone: 'bad', at: '2026-06-11T09:30:44Z', field: 'bonus' });
      expect(lanternfield.fickleness).toMatchObject({ changes: 2, worse: 1, better: 1, months: 9, label: 'fickle' });
      expect(lanternfield.fickleness?.text).toBe('Fickle: changed 2 times in 9 months, 1 for the worse.');
      expect((await timelineOf('mossgate-nightfall')).headline).toMatchObject({ text: 'Bonus points cut 20,000 in June', tone: 'bad' });
      expect((await timelineOf('bramblewick-savings')).headline).toMatchObject({ text: 'Bonus raised $50 in June', tone: 'good' });
      // Each page has its own temper, so the stones do not all read alike.
      expect((await timelineOf('bramblewick-savings')).fickleness?.text).toBe('Fickle: changed 1 time in 9 months, 1 for the worse.');
      expect((await timelineOf('mossgate-nightfall')).fickleness?.text).toBe('Fickle: changed 2 times in 9 months, 2 for the worse.');
    } finally {
      await fixture.close();
    }
  });
});
