import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { origin, ports } from './ports';

/**
 * The ghost testifies: the verify page, driven against the demo dashboard (bonus-watch), whose
 * pacts are back-dated and sealed. The page recomputes the SHA-256 in the browser with crypto.subtle.
 * The file name sorts after seal-the-pact.spec.ts, so each test starts from a rewound demo.
 */
const DEMO = origin(ports.demoDashboard);
const DEMO_FIXTURES = origin(ports.demoFixtures);
const MOSSGATE = 'mossgate-nightfall';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const SNAPSHOT = `/api/ghosts/${MOSSGATE}/pact/snapshot`;

interface PactBody {
  pact: { sealedAt: string; sha256: string } | null;
}

const letterDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

async function rewound(page: Page): Promise<{ sealedAt: string; sha256: string }> {
  await page.goto(DEMO);
  const rewind = page.getByRole('button', { name: 'Rewind to calm' });
  if (await rewind.isVisible()) {
    await rewind.click();
    await expect(rewind).toBeHidden();
  }
  const body = (await (await page.request.get(`${DEMO}/api/ghosts/${MOSSGATE}/pact`)).json()) as PactBody;
  if (!body.pact) throw new Error('the demo should seed a pact for Mossgate');
  return body.pact;
}

const verifyPath = (copy: string, sha256: string, sealedAt: string) =>
  `${DEMO}/verify?${new URLSearchParams({ copy, sha256, sealed: sealedAt }).toString()}`;

test.describe.configure({ mode: 'serial' });

test.describe('the ghost testifies', () => {
  test('(PACT 16.12, 16.14, 16.19, 16.20) "Verify it" in the dispute pack opens the page, which matches the sealed pact', async ({ page, context }) => {
    const pact = await rewound(page);
    await page.getByRole('button', { name: 'Let a night pass' }).click();
    await page.locator('#feed .feed__item[data-stealth="true"]').getByRole('button', { name: /^Raise the dead/ }).click();
    const link = page.locator('#seance').getByRole('link', { name: 'Verify it' });
    await expect(link).toBeVisible();
    const [verify] = await Promise.all([context.waitForEvent('page'), link.click()]);
    const result = verify.getByRole('status');
    await expect(result).toContainText(`Matches the pact sealed ${letterDate(pact.sealedAt)}`);
    await expect(result).toHaveAttribute('data-state', 'match');
    await expect(result.locator('code')).toHaveCount(2);
    await expect(result.locator('code').nth(0)).toHaveText(pact.sha256);
    await expect(result.locator('code').nth(1)).toHaveText(pact.sha256);
  });

  test('(PACT 16.9, 16.13, 16.14) a hash that is not the pact\'s shows "Does not match" with both hashes', async ({ page }) => {
    const pact = await rewound(page);
    const wrong = `${pact.sha256.slice(0, 63)}${pact.sha256.endsWith('0') ? '1' : '0'}`;
    const response = await page.goto(verifyPath(SNAPSHOT, wrong, pact.sealedAt));
    expect(response?.status()).toBe(200);
    const result = page.getByRole('status');
    await expect(result).toContainText('Does not match');
    await expect(result).not.toContainText('Matches the pact');
    await expect(result).toHaveAttribute('data-state', 'mismatch');
    await expect(result.locator('code').nth(0)).toHaveText(wrong);
    await expect(result.locator('code').nth(1)).toHaveText(pact.sha256);
  });

  test('(PACT 16.16, 16.17) a copy the browser may not read (CORS) says so and points at the file upload', async ({ page }) => {
    const pact = await rewound(page);
    await page.goto(verifyPath(`${DEMO_FIXTURES}/robots.txt`, pact.sha256, pact.sealedAt));
    const result = page.getByRole('status');
    await expect(result).toContainText('Your browser could not fetch the saved copy');
    await expect(result).toContainText('file upload');
    await expect(result).not.toContainText('Does not match');
    await expect(result).not.toContainText('Matches the pact');
  });

  test('(PACT 16.11, 16.15) a chosen snapshot file is hashed in the browser: the stored file matches, another file does not', async ({ page }) => {
    const pact = await rewound(page);
    const stored = await (await page.request.get(`${DEMO}${SNAPSHOT}`)).body();
    await page.goto(`${DEMO}/verify?${new URLSearchParams({ sha256: pact.sha256, sealed: pact.sealedAt }).toString()}`);
    const result = page.getByRole('status');
    await expect(result).toHaveAttribute('data-state', 'idle');
    await page.getByLabel('Or a snapshot file from this device').setInputFiles({ name: 'snapshot.json', mimeType: 'application/json', buffer: stored });
    await expect(result).toContainText(`Matches the pact sealed ${letterDate(pact.sealedAt)}`);
    await page.getByLabel('Or a snapshot file from this device').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{}\n') });
    await expect(result).toContainText('Does not match');
  });

  test('(PACT 16.4, 16.17, 16.18) at 390 px the page does not scroll sideways, and an axe scan finds nothing', async ({ page }) => {
    const pact = await rewound(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(verifyPath(SNAPSHOT, pact.sha256, pact.sealedAt));
    await expect(page.getByRole('status')).toContainText('Matches the pact');
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    const scan = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.goto(`${DEMO}/verify?sha256=abc`);
    await page.getByRole('button', { name: 'Check the hash' }).click();
    await expect(page.getByRole('status')).toContainText('The expected hash is not valid');
  });

  // Screenshots for a human to look at; Playwright empties test-results, so they go to a folder named by
  // VERIFY_SHOTS (for example .verify-shots). Without it the test is skipped.
  test('(PACT 16.18) screenshots of the match and the mismatch at 390 px and 1360 px', async ({ page }) => {
    const dir = process.env.VERIFY_SHOTS;
    test.skip(!dir, 'set VERIFY_SHOTS to a folder to write the screenshots');
    const pact = await rewound(page);
    const wrong = `${pact.sha256.slice(0, 63)}${pact.sha256.endsWith('0') ? '1' : '0'}`;
    await mkdir(dir as string, { recursive: true });
    for (const [name, width, height] of [['390', 390, 844], ['1360', 1360, 900]] as const) {
      await page.setViewportSize({ width, height });
      for (const [kind, sha] of [['match', pact.sha256], ['mismatch', wrong]] as const) {
        await page.goto(verifyPath(SNAPSHOT, sha, pact.sealedAt));
        await expect(page.getByRole('status')).toHaveAttribute('data-state', kind);
        await page.screenshot({ path: `${dir}/verify-${kind}-${name}.png`, fullPage: true });
      }
    }
  });
});
