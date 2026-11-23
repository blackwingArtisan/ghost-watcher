import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { origin, ports } from './ports';

/**
 * Seal any page, driven through the Bonus Crypt dashboard against the bonus fixture site. The file name
 * sorts after the other seal specs, so the added page does not change what they count. Screenshots are
 * written only when SEAL_SHOTS names a folder.
 */
const BONUS = origin(ports.bonusDashboard);
const FIXTURES = origin(ports.bonusFixtures);
const ARTICLE = `${FIXTURES}/guides/loyalty-terms`;
const SHELL = `${FIXTURES}/guides/app-shell`;
const PRIVATE = `${FIXTURES}/members/hollowmere/offers`;
const NAME = 'Hollowmere welcome bonus terms';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const SHOTS = process.env.SEAL_SHOTS;

test.describe.configure({ mode: 'serial' });

async function shoot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  const original = page.viewportSize();
  for (const width of [390, 1360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true });
  }
  if (original) await page.setViewportSize(original);
}

async function submit(page: Page, url: string): Promise<void> {
  await page.getByLabel('Page address').fill(url);
  await page.getByRole('button', { name: 'I applied today', exact: true }).click();
}

async function expectClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test.beforeAll(async ({ request }) => {
  await request.post(`${FIXTURES}/__fixture/reset`);
});

test.describe('seal any page', () => {
  test('(ANY 2.1, 9.3) the form is on the dashboard and passes the axe scan', async ({ page }) => {
    await page.goto(BONUS);
    await expect(page.getByRole('heading', { name: 'Seal a page' })).toBeVisible();
    await expectClean(page);
    await page.getByLabel('Page address').fill(ARTICLE);
    await shoot(page, 'form');
  });

  test('(ANY 3.1, 3.2, 9.3) a page that renders in the browser is refused in plain words', async ({ page }) => {
    await page.goto(BONUS);
    await submit(page, SHELL);
    const message = page.locator('#seal-page-message');
    await expect(message).toContainText('This page renders in your browser, so there is no text for the ghost to read. It cannot be sealed this way.');
    await expect(page.locator('#graveyard')).not.toContainText('Hollowmere');
    await expectClean(page);
    await shoot(page, 'js-rendered');
  });

  test('(ANY 4.1) a page robots.txt disallows is refused', async ({ page }) => {
    await page.goto(BONUS);
    await submit(page, PRIVATE);
    await expect(page.locator('#seal-page-message')).toContainText('robots.txt');
  });

  test('(ANY 2.3, 2.4, 6.2) sealing an article adds a ghost with a pact, and the ghost is still there after a reload', async ({ page }) => {
    await page.goto(BONUS);
    await submit(page, ARTICLE);
    await expect(page.locator('#seal-page-message')).toContainText(`Sealed: ${NAME}`);
    const seance = page.locator('#seance');
    await expect(seance).toBeVisible();
    await expect(seance.getByRole('heading', { name: NAME })).toBeVisible();
    await expect(seance.locator('.pact[data-pact="sealed"]')).toBeVisible();
    await expectClean(page);
    await shoot(page, 'new-ghost');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('.ghost', { hasText: NAME })).toBeVisible();
  });

  test('(ANY 2.7) pasting the same page again says it is already watched', async ({ page }) => {
    await page.goto(BONUS);
    await submit(page, `${ARTICLE}?utm_source=mail`);
    await expect(page.locator('#seal-page-message')).toContainText('already watched');
  });

  test('(ANY 5.1, 5.2, 5.3) a change in the text shrieks and quotes the changed sentence; noise alone does not', async ({ page, request }) => {
    await page.goto(BONUS);
    await page.locator('.ghost', { hasText: NAME }).locator('.ghost__hit').click();
    const seance = page.locator('#seance');
    await seance.getByRole('button', { name: 'Check now' }).click();
    await expect(page.locator('#feed')).not.toContainText(NAME);
    await request.post(`${FIXTURES}/__fixture/advance`);
    await seance.getByRole('button', { name: 'Check now' }).click();
    const letter = page.locator('#feed .feed__item', { hasText: NAME }).first();
    await expect(letter).toContainText('$3,000');
    await expect(letter).not.toContainText('invented institution');
    await expect(letter.locator('.sev')).toHaveAttribute('data-severity', 'shriek');
  });

  test('(ANY 7.1, 7.2, 7.3) the bookmarklet opens the form with the tab\'s address filled in, and does not submit', async ({ page, context }) => {
    await page.goto(BONUS);
    const href = await page.locator('#seal-page-bookmarklet').getAttribute('href');
    expect(href).toContain('javascript:');
    expect(href).toContain(BONUS);
    const tab = await context.newPage();
    await tab.goto(ARTICLE);
    const [opened] = await Promise.all([context.waitForEvent('page'), tab.evaluate((code) => { new Function(code)(); }, (href ?? '').slice('javascript:'.length))]);
    await opened.waitForLoadState();
    expect(new URL(opened.url()).origin).toBe(BONUS);
    await expect(opened.getByLabel('Page address')).toHaveValue(ARTICLE);
    await expect(opened.getByRole('button', { name: 'I applied today', exact: true })).toBeFocused();
    await expect(opened.locator('#seance')).not.toBeVisible();
  });
});
