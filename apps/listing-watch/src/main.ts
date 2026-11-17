import { runCli } from '@ghost-watcher/template';
import { startFixtureServer } from '@ghost-watcher/template/testing';
import { listingSite } from '../fixtures/site';
import { buildApp } from './app';

const code = await runCli(process.argv.slice(2), {
  buildApp,
  defaultPort: 3132,
  defaultFixturePort: 3133,
  siteOriginVar: 'LISTING_SITE_ORIGIN',
  startFixtures: (port) => startFixtureServer(listingSite, { port }),
});
process.exitCode = code;
