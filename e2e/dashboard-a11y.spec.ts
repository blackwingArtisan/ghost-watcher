import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Checks that hold for every app built on the skeleton: the dashboard fits a phone, works from the
 * keyboard alone, and stops moving for people who ask for reduced motion. These tests only look;
 * they never trigger a check, so they leave the other specs' state alone.
 */
const DASHBOARDS = [
  { app: 'bonus-watch', url: 'http://127.0.0.1:3134', title: 'The Bonus Crypt' },
  { app: 'listing-watch', url: 'http://127.0.0.1:3136', title: 'Haunted Listings' },
];

for (const { app, url, title } of DASHBOARDS) {
  test(`${app}: fits a phone screen without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    await expect(page.getByRole('button', { name: 'Summon every ghost' })).toBeInViewport();
  });

  test(`${app}: a séance opens and closes from the keyboard`, async ({ page }) => {
    await page.goto(url);
    let focusedGhost = false;
    for (let presses = 0; presses < 12 && !focusedGhost; presses += 1) {
      await page.keyboard.press('Tab');
      focusedGhost = await page.evaluate(() => document.activeElement?.classList.contains('ghost__hit') ?? false);
    }
    expect(focusedGhost).toBe(true);
    const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
    expect(label).toMatch(/^Open séance for /);

    await page.keyboard.press('Enter');
    const seance = page.locator('#seance');
    await expect(seance).toBeVisible();
    await expect(seance.getByRole('button', { name: 'Check now' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(seance).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.classList.contains('ghost__hit') ?? false)).toBe(true);
  });

  test(`${app}: reduced motion stills every animation`, async ({ page }) => {
    const countMoving = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('*')].filter((el) => {
          const style = getComputedStyle(el);
          return style.animationName !== 'none' && style.animationName !== '';
        }).length,
      );
    await page.goto(url);
    expect(await countMoving()).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await countMoving()).toBe(0);
  });
}

for (const { app, url } of DASHBOARDS) {
  test(`${app}: axe finds no WCAG 2.1 A or AA violations on the graveyard or the séance`, async ({ page }) => {
    // Colors are measured at rest: a drawer caught mid-fade would blend into its background.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url);
    await expect(page.locator('.ghost').first()).toBeVisible();
    const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const summarize = (violations: Awaited<ReturnType<typeof scan>>['violations']) =>
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

    expect(summarize((await scan()).violations)).toEqual([]);
    await page.locator('.ghost__hit').first().click();
    await expect(page.locator('#seance')).toBeVisible();
    expect(summarize((await scan()).violations)).toEqual([]);
  });
}
