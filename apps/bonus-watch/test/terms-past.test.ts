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
      const story = async (id: string) => {
        const watch = app.watches.find((w) => w.id === id) as Watch;
        const today = await (await fetch(watch.url)).text();
        const timeline = buildPastTimeline(watch, await source.captures(watch.url), { takenAt: '2026-11-18T12:00:00Z', ...extract(today, watch) }, source.label, '2026-11-18T12:00:00Z');
        return timeline.entries.map((e) => `${e.at.slice(0, 10)} ${e.kind}: ${e.lines.join(' ')}`);
      };

      expect(await story('lanternfield-checking')).toEqual([
        '2026-03-04 first: Bonus $500 · Min. deposit $5,000 · Deadline Apr 30, 2026',
        '2026-06-11 change: Bonus went down from $500 to $300 (-$200). Deadline moved from Apr 30, 2026 to Sep 30, 2026 (153 days later).',
        '2026-11-18 now: Deadline moved from Sep 30, 2026 to Jan 15, 2027 (107 days later).',
      ]);
      expect((await story('mossgate-nightfall'))[1]).toContain('Bonus points went down from 80,000 to 60,000 (-20,000).');
      expect((await story('bramblewick-savings'))[1]).toContain('Bonus went up from $200 to $250 (+$50).');
    } finally {
      await fixture.close();
    }
  });
});
