import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { origin, ports } from './ports';

/** Slow drift and the bonus clock, through the real bonus demo. Fernwick's bonus is cut $500 a night. */
const DEMO = origin(ports.demoDashboard);
const FERN = '#ghost-fernwick-premier';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe.configure({ mode: 'serial' });

const post = (page: Page, path: string) => page.request.post(`${DEMO}${path}`, { headers: { Origin: DEMO }, data: {} });

async function atNight(page: Page, nights: number): Promise<void> {
  await post(page, '/api/demo/rewind');
  for (let i = 0; i < nights; i += 1) await post(page, '/api/demo/next-night');
  await page.goto(DEMO);
  await expect(page.locator(FERN)).toBeVisible();
}

test('(PACT 14.10, 14.7) the drift shrieks on night 3 and not before, with a letter', async ({ page }) => {
  await atNight(page, 2);
  await expect(page.locator(FERN)).not.toHaveAttribute('data-state', 'restless');
  expect(((await (await page.request.get(`${DEMO}/api/ghosts/fernwick-premier`)).json()) as { alerts: unknown[] }).alerts).toHaveLength(0);

  await atNight(page, 3);
  await expect(page.locator(FERN)).toHaveAttribute('data-state', 'restless');
  const detail = (await (await page.request.get(`${DEMO}/api/ghosts/fernwick-premier`)).json()) as { alerts: Array<{ summary: string; letter?: string }> };
  expect(detail.alerts).toHaveLength(1);
  expect(detail.alerts[0]?.summary).toBe('Drifted since you applied: $5,000 → $3,500 over 3 nights');
  await page.screenshot({ path: 'test-results/drift-clock/drift-night3-1360.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: 'test-results/drift-clock/drift-night3-390.png', fullPage: true });
});

test('(PACT 15.6, 15.7, 15.8, 15.10, 15.11) a past-due bonus says so, offers the letter, and "Bonus posted" stops the clock', async ({ page }) => {
  await atNight(page, 0);
  const clock = page.locator(`${FERN} .ghost__clock`);
  await expect(clock).toHaveAttribute('data-clock', 'due');
  await expect(clock).toContainText('Bonus due, not posted');
  await clock.locator('summary', { hasText: 'Raise the dead' }).click();
  await expect(clock.locator('pre')).toContainText('within 15 days after the deposit');
  await expect(clock.locator('pre')).toContainText('deposit new funds');
  for (const [width, name] of [[1360, '1360'], [390, '390']] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `test-results/drift-clock/clock-${name}.png`, fullPage: true });
  }
  const scan = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

  await clock.getByRole('button', { name: /^Bonus posted/ }).click();
  await expect(clock).toHaveAttribute('data-clock', 'posted');
  await expect(clock).toContainText('Bonus posted');
  await expect(clock.getByRole('button', { name: /^Bonus posted/ })).toHaveCount(0);
});
