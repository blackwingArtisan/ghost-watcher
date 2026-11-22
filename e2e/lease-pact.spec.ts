import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { origin, ports } from './ports';

/**
 * The lease pact, driven through the Haunted Listings demo (pacts back-dated 30 days, fixtures that
 * raise the rent and add a $45 monthly amenity fee on night 1). The file runs after the other
 * specs that touch the listing dashboards, and uses only the listing demo servers.
 */
const DEMO = origin(ports.listingDemoDashboard);
const LEASE = 'larkspur-flats-5b';
const LEASE_NAME = 'Larkspur Flats, Unit 5B';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const SHOTS = 'test-results/lease-pact';
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1360', width: 1360, height: 900 },
];

test.describe.configure({ mode: 'serial' });

async function violations(page: Page, include?: string): Promise<string[]> {
  const builder = new AxeBuilder({ page }).withTags(WCAG);
  const scan = await (include ? builder.include(include) : builder).analyze();
  return scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('(LEASE 5.1, 5.4, 5.5, 3.3, 3.4, 3.5, 2.1) the street shows the sealed lease mark and the séance the lease pact', async ({ page }) => {
  await page.request.post(`${DEMO}/api/demo/rewind`);
  for (const view of VIEWPORTS) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.goto(DEMO);
    const house = page.locator(`#ghost-${LEASE}`);
    const mark = house.locator('.ghost__pact[data-pact="sealed"]');
    await expect(mark).toContainText('Lease sealed');
    await expect(mark).toContainText('demo');
    // Only the listing's own page can be signed; the search, permits and other houses carry no pact.
    await expect(page.locator('.ghost__pact')).toHaveCount(1);
    await page.screenshot({ path: `${SHOTS}/street-${view.name}.png`, fullPage: true });

    await house.locator('.ghost__hit').click();
    const seance = page.locator('#seance');
    await expect(seance.getByRole('heading', { name: 'The lease pact' })).toBeVisible();
    await expect(seance.locator('.pact')).toContainText('demo pact');
    await expect(seance.locator('.values thead')).toContainText('The day you signed');
    await expect(seance.locator('.values tbody tr').first().locator('td.pact-value')).toHaveText(/\S/);
    await seance.screenshot({ path: `${SHOTS}/seance-${view.name}.png` });
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('(LEASE 4.1, 4.2, 6.1 to 6.8, 7.6) night 1 raises the rent and fee alerts, and Raise the dead writes to the landlord', async ({ page }) => {
  await page.goto(DEMO);
  await page.request.post(`${DEMO}/api/demo/next-night`);
  for (const view of VIEWPORTS) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.goto(DEMO);
    const fee = page.locator('#feed .feed__item').filter({ hasText: '$45 monthly amenity fee' }).first();
    await expect(fee).toContainText('the day you signed the lease');
    await expect(page.locator(`#ghost-${LEASE} .ghost__pact`)).toContainText('Lease sealed');
    await expect(page.locator('#feed .feed__item').filter({ hasText: 'the rent was $2,050; it is now $2,125' }).first()).toBeVisible();

    await fee.getByRole('button', { name: /^Raise the dead/ }).click();
    const seance = page.locator('#seance');
    await expect(seance.getByRole('heading', { name: `Lease letter: ${LEASE_NAME}` })).toBeVisible();
    await expect(seance.locator('.dispute__subject')).toHaveText(`Request to honor the advertised terms of ${LEASE_NAME}`);
    const letter = await seance.locator('#dispute-letter').inputValue();
    expect(letter).toContain('To: The landlord or property manager');
    expect(letter).toContain('the day I signed the lease:');
    expect(letter).toContain('A $45 monthly amenity fee applies to every unit.');
    expect(letter).not.toMatch(/bank|bonus|CFPB|Consumer Financial/i);
    await expect(seance.locator('.dispute__evidence')).toContainText('Advertised SHA-256');
    await expect(seance.getByRole('heading', { name: '3. If the landlord does not answer' })).toBeVisible();
    await expect(seance.getByText(/CFPB|consumerfinance/)).toHaveCount(0);
    await expect(seance.getByText('local housing authority or your state attorney general')).toBeVisible();
    await seance.screenshot({ path: `${SHOTS}/letter-${view.name}.png` });
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('(LEASE 3.1, 3.6, 1.1) "I signed the lease" seals the listing after the pact is broken, behind the confirm step', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.goto(DEMO);
  await page.locator(`#ghost-${LEASE} .ghost__hit`).click();
  const seance = page.locator('#seance');
  await seance.getByRole('button', { name: `Break the pact for ${LEASE_NAME}` }).click();
  await expect(seance.getByRole('group')).toContainText('Break the pact sealed');
  await seance.getByRole('button', { name: 'Yes, break' }).click();
  await page.keyboard.press('Escape');

  const seal = page.locator(`#ghost-${LEASE}`).getByRole('button', { name: `I signed the lease: seal the pact for ${LEASE_NAME}` });
  await expect(seal).toBeEnabled();
  expect(await violations(page)).toEqual([]);
  await seal.click();
  await expect(page.locator('#toast')).toContainText(`Pact sealed for ${LEASE_NAME}.`);
  const mark = page.locator(`#ghost-${LEASE} .ghost__pact[data-pact="sealed"]`);
  await expect(mark).toContainText('Lease sealed');
  await expect(mark).not.toContainText('demo');
});
