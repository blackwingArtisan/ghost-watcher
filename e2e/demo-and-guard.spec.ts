import { expect, test } from '@playwright/test';

const DEMO = 'http://127.0.0.1:3138';
const DEMO_FIXTURES = 'http://127.0.0.1:3139';

test.describe.configure({ mode: 'serial' });

test('demo mode: the first sighting is already taken, and one click lets a night pass', async ({ page }) => {
  await page.goto(DEMO);
  const lanternfield = page.locator('#ghost-lanternfield-checking');
  // The demo took its baseline at startup, so nobody has to summon the ghosts first.
  await expect(lanternfield).toHaveAttribute('data-state', 'dormant');
  await expect(page.locator('#ghost-cinderhollow-members')).toHaveAttribute('data-state', 'blocked');

  const night = page.getByRole('button', { name: 'Let a night pass' });
  await expect(night).toBeVisible();
  await night.click();
  await expect(page.locator('#toast')).toContainText('Night 1 passes.');
  await expect(page.locator('#toast')).toContainText('restless');
  await expect(lanternfield).toHaveAttribute('data-state', 'restless');
  await expect(page.locator('#feed')).toContainText('Bonus went up from $300 to $400 (+$100).');
  await expect(night).toBeEnabled();

  const state = (await (await page.request.get(`${DEMO_FIXTURES}/__fixture/state`)).json()) as { version: number };
  expect(state.version).toBe(2);
});

test('the dashboard refuses cross-origin writes and unknown hosts', async ({ request }) => {
  const hostile = await request.post(`${DEMO}/api/check-all`, { headers: { Origin: 'http://evil.example' } });
  expect(hostile.status()).toBe(403);
  expect(((await hostile.json()) as { error: string }).error).toMatch(/Cross-origin/);

  const crossSiteNight = await request.post(`${DEMO}/api/demo/next-night`, { headers: { Origin: 'http://evil.example' } });
  expect(crossSiteNight.status()).toBe(403);
  const state = (await (await request.get(`${DEMO_FIXTURES}/__fixture/state`)).json()) as { version: number };
  expect(state.version).toBe(2);

  const sameOrigin = await request.post(`${DEMO}/api/ghosts/lanternfield-checking/acknowledge`, { headers: { Origin: DEMO } });
  expect(sameOrigin.status()).toBe(200);
});

test('serve mode has no demo controls', async ({ page, request }) => {
  await page.goto('http://127.0.0.1:3134');
  await expect(page.getByRole('button', { name: 'Summon every ghost' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Let a night pass' })).toHaveCount(0);
  expect((await request.post('http://127.0.0.1:3134/api/demo/next-night')).status()).toBe(404);
});
