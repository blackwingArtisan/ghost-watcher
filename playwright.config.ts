import { defineConfig, devices } from '@playwright/test';
import { origin, ports } from './e2e/ports';

/**
 * End-to-end tests drive each app's real dashboard in a browser against its local fixture site.
 * Ports come from e2e/ports.ts: GHOST_E2E_PORT is the base port (default 3134) and the eight servers
 * take base+0 to base+7, which keeps e2e runs clear of the dev ports (3130-3133). Set it to run
 * parallel CI jobs or a second checkout side by side. The last two ports run bonus-watch in `demo`
 * mode, where the app starts its own fixture site and takes the first sighting itself.
 */
const common = {
  GHOST_INTERVAL_MINUTES: '0',
  GHOST_HOST_GAP_MS: '0',
  GHOST_TICK_SECONDS: '0',
};

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts', // e2e/ports.test.ts is a Vitest test
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1360, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx apps/bonus-watch/fixtures/serve.ts',
      url: `${origin(ports.bonusFixtures)}/robots.txt`,
      env: { FIXTURE_PORT: String(ports.bonusFixtures) },
      reuseExistingServer: false,
    },
    {
      command: `npx tsx apps/bonus-watch/src/main.ts serve --fresh --port ${ports.bonusDashboard}`,
      url: `${origin(ports.bonusDashboard)}/healthz`,
      env: { ...common, BONUS_SITE_ORIGIN: origin(ports.bonusFixtures), GHOST_DATA_DIR: '.ghost-e2e/bonus-watch' },
      reuseExistingServer: false,
    },
    {
      command: 'npx tsx apps/listing-watch/fixtures/serve.ts',
      url: `${origin(ports.listingFixtures)}/robots.txt`,
      env: { FIXTURE_PORT: String(ports.listingFixtures) },
      reuseExistingServer: false,
    },
    {
      command: `npx tsx apps/listing-watch/src/main.ts serve --fresh --port ${ports.listingDashboard}`,
      url: `${origin(ports.listingDashboard)}/healthz`,
      env: { ...common, LISTING_SITE_ORIGIN: origin(ports.listingFixtures), GHOST_DATA_DIR: '.ghost-e2e/listing-watch' },
      reuseExistingServer: false,
    },
    {
      command: `npx tsx apps/bonus-watch/src/main.ts demo --port ${ports.demoDashboard} --fixture-port ${ports.demoFixtures}`,
      url: `${origin(ports.demoDashboard)}/healthz`,
      env: { GHOST_HOST_GAP_MS: '0', GHOST_DATA_DIR: '.ghost-e2e/bonus-demo', GHOST_FRESH: '1' },
      reuseExistingServer: false,
    },
    {
      command: `npx tsx apps/listing-watch/src/main.ts demo --port ${ports.listingDemoDashboard} --fixture-port ${ports.listingDemoFixtures}`,
      url: `${origin(ports.listingDemoDashboard)}/healthz`,
      env: { GHOST_HOST_GAP_MS: '0', GHOST_DATA_DIR: '.ghost-e2e/listing-demo', GHOST_FRESH: '1' },
      reuseExistingServer: false,
    },
  ],
});
