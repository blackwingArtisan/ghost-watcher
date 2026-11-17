/** Serves the invented listing pages on their own (for e2e tests and for poking at them in a browser). */
import { startFixtureServer } from '@ghost-watcher/template/testing';
import { listingSite } from './site';

const port = Number(process.env.FIXTURE_PORT ?? 3133);
const fixtures = await startFixtureServer(listingSite, { port });
process.stdout.write(`listing-watch fixture site at ${fixtures.origin}\n`);
const stop = () => void fixtures.close().then(() => process.exit(0));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
