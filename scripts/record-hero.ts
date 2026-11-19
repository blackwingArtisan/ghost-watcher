/**
 * Records the README hero GIF: the Bonus Crypt in demo mode, the Ghost of Terms Past timeline, one
 * night passing, the change on the stone and the bait-and-switch letter.
 *
 *   npx tsx scripts/record-hero.ts [out.gif]     (needs ffmpeg on PATH)
 *
 * The demo runs on HERO_PORT (default 3140) with its fixture site on the next port, against a
 * throwaway data folder. Nothing leaves the machine.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const out = resolve(process.argv[2] ?? join(root, 'docs', 'bonus-crypt-night.gif'));
const port = Number(process.env.HERO_PORT ?? 3140);
const size = { width: 1440, height: 900 };

const work = await mkdtemp(join(tmpdir(), 'ghost-hero-'));
const demo = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts', 'demo', '--port', String(port), '--fixture-port', String(port + 1)], {
  cwd: join(root, 'apps', 'bonus-watch'),
  env: { ...process.env, GHOST_DATA_DIR: join(work, 'data'), GHOST_HOST_GAP_MS: '0' },
  stdio: 'ignore',
});

async function waitForDashboard(): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`The demo did not start on port ${port}.`);
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

try {
  await waitForDashboard();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: work, size } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}`);
  await pause(page, 1800);

  // The Ghost of Terms Past, before any night has passed.
  await page.locator('#ghost-lanternfield-checking .ghost__hit').click();
  await page.locator('#seance .past').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await pause(page, 3200);
  await page.keyboard.press('Escape');
  await pause(page, 700);

  // One night passes.
  // force: the button pulses until pressed, so it never holds still for Playwright's stability check.
  await page.getByRole('button', { name: 'Let a night pass' }).click({ force: true });
  await page.locator('#ghost-lanternfield-checking[data-state="restless"]').waitFor();
  await pause(page, 3000);
  await page.locator('#feed .feed__item[data-stealth="true"]').hover();
  await pause(page, 2600);

  await context.close();
  await browser.close();

  const video = (await readdir(work)).find((name) => name.endsWith('.webm'));
  if (!video) throw new Error('Playwright did not save a video.');
  const ffmpeg = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      join(work, video),
      '-vf',
      'fps=8,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
      '-loop',
      '0',
      out,
    ],
    { stdio: 'inherit' },
  );
  if (ffmpeg.status !== 0) throw new Error('ffmpeg could not convert the video.');
  process.stdout.write(`Saved ${out}\n`);
} finally {
  demo.kill();
  await rm(work, { recursive: true, force: true });
}
