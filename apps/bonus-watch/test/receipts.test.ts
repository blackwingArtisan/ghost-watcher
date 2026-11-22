import { describe, expect, it } from 'vitest';
import {
  GhostStore,
  PoliteFetcher,
  Runner,
  SavePageNowArchiver,
  buildUserAgent,
  manualClock,
  type AlertMessage,
  type AlertSink,
} from '@ghost-watcher/template';
import { MemoryBlobStore, startFixtureServer } from '@ghost-watcher/template/testing';
import { bonusSite } from '../fixtures/site';
import { buildApp } from '../src/app';

/** The test's own now. The fetcher, runner and archiver all read it, so no date depends on the day the test runs. */
const NOW = '2026-11-19T10:00:00.000Z';

class Inbox implements AlertSink {
  readonly channel = 'inbox';
  messages: AlertMessage[] = [];
  async deliver(message: AlertMessage) {
    this.messages.push(message);
    return { channel: this.channel, reference: String(this.messages.length) };
  }
}

describe('bonus-watch: the ghost keeps receipts', () => {
  it('archives the page and hashes both snapshots for the shriek and the bait and switch of night one', async () => {
    const fixture = await startFixtureServer(bonusSite, { port: 0 });
    try {
      const built = buildApp({ BONUS_SITE_ORIGIN: fixture.origin });
      const app = { ...built, watches: built.watches.map((w) => ({ ...w, intervalMs: 0 })) };
      const userAgent = buildUserAgent({ version: app.version, localOnly: true });
      const clock = manualClock(NOW);
      const sink = new Inbox();
      const runner = new Runner({
        app,
        fetcher: new PoliteFetcher({ userAgent, clock, minHostGapMs: 0, maxCrawlDelayMs: 0 }),
        store: new GhostStore(new MemoryBlobStore()),
        sink,
        clock,
        archive: new SavePageNowArchiver({ userAgent, clock, base: `${fixture.origin}/__wayback`, label: 'the stand-in Wayback Machine' }),
      });
      await runner.checkAll({ force: true });
      fixture.advance();
      await runner.checkAll({ force: true });

      const letter = (id: string) => sink.messages.find((m) => m.watchId === id) as AlertMessage;
      const lanternfield = letter('lanternfield-checking').alerts.find((a) => a.field === 'bonus');
      const mossgate = letter('mossgate-nightfall').alerts.find((a) => a.stealth);
      for (const alert of [lanternfield, mossgate]) {
        expect(alert?.receipt?.archivedBy).toBe('the stand-in Wayback Machine');
        expect(alert?.receipt?.before.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(alert?.receipt?.after.sha256).not.toBe(alert?.receipt?.before.sha256);
      }
      // The archived copy is the page as the ghost saw it on the night it changed.
      expect(await (await fetch(lanternfield?.receipt?.archiveUrl as string)).text()).toContain('$400 bonus');
      expect(await (await fetch(mossgate?.receipt?.archiveUrl as string)).text()).toContain('past 48 months');
      expect(letter('mossgate-nightfall').text).toContain('The ghost kept a receipt:');
      // Bramblewick only reformatted its page, so nothing was archived for it.
      expect(fixture.saved.map((c) => c.path).sort()).toEqual(['/lanternfield/everyday-checking', '/mossgate/nightfall-card']);
    } finally {
      await fixture.close();
    }
  });
});
