import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const DASHBOARD = 'http://127.0.0.1:3134';
const FIXTURES = 'http://127.0.0.1:3135';
const OUTBOX = '.ghost-e2e/bonus-watch/outbox/outbox.jsonl';

interface OutboxLine {
  watchId: string;
  summaries: string[];
}

async function readOutbox(): Promise<OutboxLine[]> {
  try {
    return (await readFile(OUTBOX, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as OutboxLine);
  } catch {
    return [];
  }
}

test.describe.configure({ mode: 'serial' });

test('bonus-watch: a bonus change makes the ghost glow and lands in the outbox', async ({ page, request }) => {
  await request.post(`${FIXTURES}/__fixture/reset`);

  await page.goto(DASHBOARD);
  await expect(page.getByRole('heading', { level: 1, name: 'The Bonus Crypt' })).toBeVisible();
  const lanternfield = page.locator('#ghost-lanternfield-checking');
  await expect(lanternfield).toHaveAttribute('data-state', 'unborn');

  // First visit: every ghost records a baseline, and robots.txt turns one away.
  await page.getByRole('button', { name: 'Summon every ghost' }).click();
  await expect(page.locator('#toast')).toContainText('4 ghosts visited');
  await expect(lanternfield).toHaveAttribute('data-state', 'dormant');
  await expect(page.locator('#ghost-cinderhollow-members')).toHaveAttribute('data-state', 'blocked');
  expect(await readOutbox()).toHaveLength(0);

  // The bank changes its terms.
  await request.post(`${FIXTURES}/__fixture/advance`);
  await page.getByRole('button', { name: 'Summon every ghost' }).click();
  await expect(page.locator('#toast')).toContainText('restless');

  await expect(lanternfield).toHaveAttribute('data-state', 'restless');
  await expect(lanternfield).toHaveAttribute('data-severity', 'shriek');
  await expect(lanternfield.locator('.ghost__badge')).toHaveText('4');
  await expect(lanternfield.locator('.readings')).toContainText('$400');
  // A page that only changed its formatting stays asleep.
  await expect(page.locator('#ghost-bramblewick-savings')).toHaveAttribute('data-state', 'dormant');
  await expect(page.locator('#feed')).toContainText('Bonus went up from $300 to $400 (+$100).');

  // The alert reached the outbox as a letter.
  const outbox = await readOutbox();
  const letter = outbox.find((line) => line.watchId === 'lanternfield-checking');
  expect(letter?.summaries).toContain('Bonus went up from $300 to $400 (+$100).');
  expect(letter?.summaries).toContain('Deadline moved from Jan 15, 2027 to Feb 28, 2027 (44 days later).');
  expect(outbox.some((line) => line.watchId === 'mossgate-nightfall')).toBe(true);
  expect(outbox.some((line) => line.watchId === 'bramblewick-savings')).toBe(false);

  // The séance shows before and after, and laying the ghost to rest calms it.
  await lanternfield.locator('.ghost__hit').click();
  const seance = page.locator('#seance');
  await expect(seance).toBeVisible();
  await expect(seance.locator('tr[data-changed="true"]').first()).toContainText('$400');
  await expect(seance.locator('tr[data-changed="true"]').first()).toContainText('$300');
  await seance.getByRole('button', { name: /Lay to rest/ }).click();
  await expect(page.locator('#toast')).toContainText('Laid to rest');
  await page.keyboard.press('Escape');
  await expect(lanternfield).toHaveAttribute('data-state', 'dormant');

  // The letter preview is served from the outbox.
  const previewLink = page.locator('#feed a.feed__letter').first();
  const href = await previewLink.getAttribute('href');
  expect(href).toMatch(/^\/outbox\/.+\.html$/);
  const preview = await request.get(`${DASHBOARD}${href}`);
  expect(await preview.text()).toContain('Your ghost saw something');

  // Politeness: the disallowed members page was never requested, and every request said who we are.
  const log = (await (await request.get(`${FIXTURES}/__fixture/log`)).json()) as Array<{ path: string; userAgent: string }>;
  expect(log.some((entry) => entry.path.startsWith('/members/'))).toBe(false);
  expect(log.length).toBeGreaterThan(0);
  for (const entry of log) expect(entry.userAgent).toBe('GhostWatcher/0.1.0 (local-only, no public contact; page-change watcher)');
});
