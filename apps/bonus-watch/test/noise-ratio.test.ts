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
    });
    expect(report).toMatchObject({ nights: 3, pages: 3, visits: 33, worthKnowing: 4 });
    expect(report.ghostWatcher).toEqual({ alerts: 4, caught: 4, falseAlarms: 0, missed: 0 });
    // Bramblewick's reformat ("$250" to "$ 250.00") fools a selector watcher once.
    expect(report.selectorText).toEqual({ alerts: 5, caught: 4, falseAlarms: 1, missed: 0 });
    // Timestamps and request ids change every visit, so a whole-page watcher alerts every time.
    expect(report.wholePage).toEqual({ alerts: 33, caught: 4, falseAlarms: 29, missed: 0 });
  });
});
