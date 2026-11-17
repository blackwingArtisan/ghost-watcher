import { runCli } from '@ghost-watcher/template';
import { startFixtureServer } from '@ghost-watcher/template/testing';
import { bonusSite } from '../fixtures/site';
import { buildApp } from './app';

const code = await runCli(process.argv.slice(2), {
  buildApp,
  defaultPort: 3130,
  defaultFixturePort: 3131,
  siteOriginVar: 'BONUS_SITE_ORIGIN',
  startFixtures: (port) => startFixtureServer(bonusSite, { port }),
});
process.exitCode = code;
