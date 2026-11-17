import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive each app's real dashboard in a browser against its local fixture site.
 * Ports 3134-3139 keep e2e runs clear of the dev ports (3130-3133); 3138-3139 run bonus-watch in
 * `demo` mode, where the app starts its own fixture site and takes the first sighting itself.
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
    {
      command: 'npx tsx apps/bonus-watch/src/main.ts demo --port 3138 --fixture-port 3139',
      url: 'http://127.0.0.1:3138/healthz',
      env: { GHOST_HOST_GAP_MS: '0', GHOST_DATA_DIR: '.ghost-e2e/bonus-demo', GHOST_FRESH: '1' },
      reuseExistingServer: false,
    },
  ],
});
