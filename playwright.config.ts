import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive each app's real dashboard in a browser against its local fixture site.
 * Ports 3134-3137 keep e2e runs clear of the dev ports (3130-3133).
 */
const common = {
  GHOST_INTERVAL_MINUTES: '0',
  GHOST_HOST_GAP_MS: '0',
  GHOST_TICK_SECONDS: '0',
};

export default defineConfig({
  testDir: './e2e',
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
      url: 'http://127.0.0.1:3135/robots.txt',
      env: { FIXTURE_PORT: '3135' },
      reuseExistingServer: false,
    },
    {
      command: 'npx tsx apps/bonus-watch/src/main.ts serve --fresh --port 3134',
      url: 'http://127.0.0.1:3134/healthz',
      env: { ...common, BONUS_SITE_ORIGIN: 'http://127.0.0.1:3135', GHOST_DATA_DIR: '.ghost-e2e/bonus-watch' },
      reuseExistingServer: false,
    },
    {
      command: 'npx tsx apps/listing-watch/fixtures/serve.ts',
      url: 'http://127.0.0.1:3137/robots.txt',
      env: { FIXTURE_PORT: '3137' },
      reuseExistingServer: false,
    },
    {
      command: 'npx tsx apps/listing-watch/src/main.ts serve --fresh --port 3136',
      url: 'http://127.0.0.1:3136/healthz',
      env: { ...common, LISTING_SITE_ORIGIN: 'http://127.0.0.1:3137', GHOST_DATA_DIR: '.ghost-e2e/listing-watch' },
      reuseExistingServer: false,
    },
  ],
});
