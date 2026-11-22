import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { origin, ports } from './ports';

/**
 * The sealing ceremony, driven through the real demo dashboard. Bramblewick is the stone the demo
 * leaves unsealed, and `?fresh-pact=1` clears it again before each test, so every test presses
 * "I applied today" on a fresh stone.
 */
const DEMO = origin(ports.demoDashboard);
const BRAMBLE = 'bramblewick-savings';
const STONE = `#ghost-${BRAMBLE}`;
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe.configure({ mode: 'serial' });

async function freshStone(page: Page): Promise<void> {
  await page.goto(`${DEMO}/?fresh-pact=1`);
  await expect(page.locator(`${STONE} .ghost__pact[data-pact="none"]`)).toBeVisible();
}

const seal = (page: Page) => page.locator(STONE).getByRole('button', { name: /^I applied today/ });

async function sealedHash(page: Page): Promise<string> {
  const body = (await (await page.request.get(`${DEMO}/api/ghosts/${BRAMBLE}/pact`)).json()) as { pact: { sha256: string } };
  return body.pact.sha256;
}

async function violations(page: Page, include: string) {
  const scan = await new AxeBuilder({ page }).include(include).withTags(WCAG).analyze();
  return scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('(PACT 13.1, 13.2, 13.4, 13.5, 13.6) pressing "I applied today" on the unsealed stone stamps a wax seal and types the hash', async ({ page }) => {
  await freshStone(page);
  await expect(page.locator(`${STONE} .seal-ceremony`)).toHaveCount(0);
  await seal(page).click();

  const ceremony = page.locator(`${STONE} .seal-ceremony`);
  await expect(ceremony.locator('svg.wax')).toBeVisible();
  const hash = await sealedHash(page);
  // The hash types out over about a second, but a screen reader has all of it from the live region.
  await expect(ceremony.locator('[aria-live="polite"]')).toHaveText(`Pact sealed. SHA-256 ${hash}`);
  await expect(ceremony.locator('.seal-ceremony__typed')).toHaveText(hash, { timeout: 5000 });
  await expect(ceremony).toHaveAttribute('data-playing', 'false');
  await expect(page.locator(`${STONE} .ghost__pact[data-pact="sealed"] .ghost__pact-tag--wax`)).toContainText('Pact sealed');
});

test('(PACT 13.7) after a reload the wax badge stays and the ceremony does not play again', async ({ page }) => {
  await freshStone(page);
  await seal(page).click();
  await expect(page.locator(`${STONE} .seal-ceremony`)).toBeVisible();
  await page.goto(DEMO);
  await expect(page.locator(`${STONE} .ghost__pact[data-pact="sealed"] .ghost__pact-tag--wax`)).toContainText('Pact sealed');
  await expect(page.locator(`${STONE} .seal-ceremony`)).toHaveCount(0);
});

test('(PACT 13.14) the fresh-pact flag clears a sealed stone again on load', async ({ page }) => {
  await freshStone(page);
  await seal(page).click();
  await expect(page.locator(`${STONE} .ghost__pact[data-pact="sealed"]`)).toBeVisible();
  await freshStone(page);
  await expect(seal(page)).toBeVisible();
});

test('(PACT 13.8) with reduced motion the seal and the whole hash appear at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await freshStone(page);
  await seal(page).click();
  const ceremony = page.locator(`${STONE} .seal-ceremony`);
  await expect(ceremony).toBeVisible();
  const hash = await sealedHash(page);
  // No typing: the first time the block exists, it already holds the whole hash.
  await expect(ceremony.locator('.seal-ceremony__typed')).toHaveText(hash, { timeout: 300 });
  await expect(ceremony).toHaveAttribute('data-playing', 'false');
  const animation = await ceremony.locator('.seal-ceremony__seal').evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
});

test('(PACT 13.11) the stone passes axe while the ceremony plays and after it ends', async ({ page }) => {
  await freshStone(page);
  await seal(page).click();
  await expect(page.locator(`${STONE} .seal-ceremony`)).toBeVisible();
  expect(await violations(page, STONE)).toEqual([]);
  await expect(page.locator(`${STONE} .seal-ceremony`)).toHaveAttribute('data-playing', 'false', { timeout: 5000 });
  expect(await violations(page, STONE)).toEqual([]);
  expect(await violations(page, '#graveyard')).toEqual([]);
});

for (const width of [360, 390, 1360]) {
  test(`(PACT 13.9, 13.10) at ${width} px the seal covers no value or button and nothing scrolls sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await freshStone(page);
    await seal(page).click();
    const ceremony = page.locator(`${STONE} .seal-ceremony`);
    await expect(ceremony).toHaveAttribute('data-playing', 'false', { timeout: 5000 });
    await ceremony.scrollIntoViewIfNeeded();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const box = await ceremony.boundingBox();
    if (!box) throw new Error('the ceremony has no box');
    const others = await page.locator(`${STONE} .readings, ${STONE} .ghost__pact, ${STONE} .ghost__msg, ${STONE} button:not(.ghost__hit), ${STONE} .ghost__name`).all();
    for (const other of others) {
      const o = await other.boundingBox();
      if (!o || o.height === 0) continue;
      const apart = box.y >= o.y + o.height - 0.5 || box.y + box.height <= o.y + 0.5 || box.x >= o.x + o.width || box.x + box.width <= o.x;
      expect(apart, `${await other.evaluate((el) => el.className || el.tagName)} overlaps the ceremony`).toBe(true);
    }
    const stone = await page.locator(`${STONE} .ghost__stone`).boundingBox();
    if (!stone) throw new Error('the stone has no box');
    expect(box.x).toBeGreaterThanOrEqual(stone.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(stone.x + stone.width + 0.5);

    await page.locator(STONE).screenshot({ path: `test-results/ceremony/stone-${width}.png` });
    await page.screenshot({ path: `test-results/ceremony/page-${width}.png` });
  });
}

test.afterAll(async ({ browser }) => {
  // Leave the demo's stone unsealed, as the demo starts.
  const page = await browser.newPage();
  await freshStone(page);
  await page.close();
});
