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
    expect(report).toMatchObject({ nights: 3, pages: 5, visits: 55, worthKnowing: 7 });
    expect(report.ghostWatcher).toEqual({ alerts: 7, caught: 7, falseAlarms: 0, missed: 0 });
    expect(report.selectorText).toEqual({ alerts: 7, caught: 7, falseAlarms: 0, missed: 0 });
    expect(report.wholePage).toEqual({ alerts: 55, caught: 7, falseAlarms: 48, missed: 0 });
  });
});
