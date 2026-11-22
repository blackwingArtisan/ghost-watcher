import { describe, expect, it } from 'vitest';
import { measureNoise } from '@ghost-watcher/template/testing';
import { bonusSite, bonusWorthKnowing } from '../fixtures/site';
import { buildApp } from '../src/app';

describe('bonus-watch noise ratio (the numbers in the README)', () => {
  it('sends one alert per change worth knowing, where plain watchers cry wolf', async () => {
    const report = await measureNoise({
      site: bonusSite,
      buildApp: (origin) => buildApp({ BONUS_SITE_ORIGIN: origin }),
      worthKnowing: bonusWorthKnowing,
      checksPerNight: 4,
      sealPacts: true,
    });
    expect(report).toMatchObject({ nights: 4, pages: 4, visits: 60, worthKnowing: 5 });
    expect(report.ghostWatcher).toEqual({ alerts: 5, caught: 5, falseAlarms: 0, missed: 0 });
    // Bramblewick's reformat ("$250" to "$ 250.00") fools a selector watcher once, and it alerts on each
    // of Fernwick's three $500 cuts, two of which are not yet worth knowing.
    expect(report.selectorText).toEqual({ alerts: 8, caught: 5, falseAlarms: 3, missed: 0 });
    // Timestamps and request ids change every visit, so a whole-page watcher alerts every time.
    expect(report.wholePage).toEqual({ alerts: 60, caught: 5, falseAlarms: 55, missed: 0 });
  });
});
