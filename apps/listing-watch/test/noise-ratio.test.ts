import { describe, expect, it } from 'vitest';
import { measureNoise } from '@ghost-watcher/template/testing';
import { listingSite, listingWorthKnowing } from '../fixtures/site';
import { buildApp } from '../src/app';

describe('listing-watch noise ratio (the numbers in the README)', () => {
  it('alerts once per night a page gains something that fits the filters', async () => {
    const report = await measureNoise({
      site: listingSite,
      buildApp: (origin) => buildApp({ LISTING_SITE_ORIGIN: origin }),
      worthKnowing: listingWorthKnowing,
      checksPerNight: 4,
    });
    expect(report).toMatchObject({ nights: 3, pages: 4, visits: 44, worthKnowing: 6 });
    expect(report.ghostWatcher).toEqual({ alerts: 6, caught: 6, falseAlarms: 0, missed: 0 });
    expect(report.selectorText).toEqual({ alerts: 6, caught: 6, falseAlarms: 0, missed: 0 });
    expect(report.wholePage).toEqual({ alerts: 44, caught: 6, falseAlarms: 38, missed: 0 });
  });
});
