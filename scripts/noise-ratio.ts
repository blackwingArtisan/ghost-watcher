/**
 * Prints how many alerts three kinds of watcher would send over the same fixture nights:
 * a whole-page watcher, a selector text watcher, and Ghost Watcher. Run with `npm run noise`.
 */
import { measureNoise, noiseTable } from '@ghost-watcher/template/testing';
import { bonusSite, bonusWorthKnowing } from '../apps/bonus-watch/fixtures/site';
import { buildApp as buildBonus } from '../apps/bonus-watch/src/app';
import { listingSite, listingWorthKnowing } from '../apps/listing-watch/fixtures/site';
import { buildApp as buildListing } from '../apps/listing-watch/src/app';

const checksPerNight = 4;
const reports = [
  await measureNoise({ site: bonusSite, buildApp: (origin) => buildBonus({ BONUS_SITE_ORIGIN: origin }), worthKnowing: bonusWorthKnowing, checksPerNight, sealPacts: true }),
  await measureNoise({ site: listingSite, buildApp: (origin) => buildListing({ LISTING_SITE_ORIGIN: origin }), worthKnowing: listingWorthKnowing, checksPerNight }),
];

process.stdout.write(
  `Noise ratio: ${reports[0]?.nights ?? 0} nights of the invented fixture sites, checked every ${24 / checksPerNight} hours.\n` +
    'Each cell is alerts sent (false alarms, changes missed).\n\n' +
    `${noiseTable(reports)}\n`,
);
