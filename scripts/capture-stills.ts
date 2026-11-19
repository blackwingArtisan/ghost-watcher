/**
 * Re-takes the README stills from the real demos, so they never drift from the dashboard:
 *
 *   docs/bonus-crypt.png               the Bonus Crypt after one night
 *   docs/haunted-listings.png          the Haunted Listings street after one night
 *
 *   npx tsx scripts/capture-stills.ts      (or: npm run stills)
 *
 * Each demo runs on STILLS_PORT (default 3142) and the port after it, against a throwaway data
 * folder and its invented fixture site. Nothing leaves the machine.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.STILLS_PORT ?? 3142);
// 1440 CSS pixels wide, saved 1200 pixels wide: the layout a laptop sees, at a README-friendly size.
const viewport = { width: 1440, height: 900 };
const deviceScaleFactor = 1200 / 1440;

function startDemo(app: string, work: string): ChildProcess {
  return spawn(process.execPath, ['--import', 'tsx', 'src/main.ts', 'demo', '--port', String(port), '--fixture-port', String(port + 1)], {
    cwd: join(root, 'apps', app),
    env: { ...process.env, GHOST_DATA_DIR: join(work, app), GHOST_HOST_GAP_MS: '0' },
    stdio: 'ignore',
  });
}

async function waitForDashboard(): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`The demo did not start on port ${port}.`);
}

async function stopDemo(demo: ChildProcess): Promise<void> {
  if (demo.exitCode !== null) return;
  const exited = new Promise((r) => demo.once('exit', r));
  demo.kill();
  await exited;
}

async function capture(browser: Browser, app: string, work: string, shoot: (url: string, out: string) => Promise<void>, out: string) {
  const demo = startDemo(app, work);
  try {
    await waitForDashboard();
    await shoot(`http://127.0.0.1:${port}`, out);
    process.stdout.write(`Saved ${out}\n`);
  } finally {
    await stopDemo(demo);
  }
}

const work = await mkdtemp(join(tmpdir(), 'ghost-stills-'));
const browser = await chromium.launch();
try {
  await capture(
    browser,
    'bonus-watch',
    work,
    async (url, out) => {
      const page = await browser.newPage({ viewport, deviceScaleFactor, reducedMotion: 'reduce' });
      await page.goto(url);
      // force: the button pulses until pressed, so it never holds still for Playwright's stability check.
      await page.getByRole('button', { name: 'Let a night pass' }).click({ force: true });
      await page.locator('#ghost-lanternfield-checking[data-state="restless"]').waitFor();
      await page.locator('#feed .feed__item[data-stealth="true"]').waitFor();
      // Let the shriek scene and the toast clear, so the still shows the graveyard at rest.
      await page.locator('body:not([data-shriek])').waitFor();
      await page.locator('#toast[data-show="false"]').waitFor({ state: 'attached', timeout: 10_000 });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: out });
      await page.close();
    },
    join(root, 'docs', 'bonus-crypt.png'),
  );
  await capture(
    browser,
    'listing-watch',
    work,
    async (url, out) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 953 }, deviceScaleFactor, reducedMotion: 'reduce' });
      await page.goto(url);
      // force: the button pulses until pressed, so it never holds still for Playwright's stability check.
      await page.getByRole('button', { name: 'Let a night pass' }).click({ force: true });
      await page.locator('#ghost-larkspur-rentals[data-state="restless"]').waitFor();
      await page.locator('#ghost-larkspur-rentals .reading--match').waitFor();
      await page.locator('#toast[data-show="false"]').waitFor({ state: 'attached', timeout: 10_000 });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: out });
      await page.close();
    },
    join(root, 'docs', 'haunted-listings.png'),
  );
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
}
