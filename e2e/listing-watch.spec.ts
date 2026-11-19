import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { origin, ports } from './ports';

const DASHBOARD = origin(ports.listingDashboard);
const FIXTURES = origin(ports.listingFixtures);
const OUTBOX = '.ghost-e2e/listing-watch/outbox/outbox.jsonl';

async function outboxSummaries(): Promise<string[]> {
  try {
    return (await readFile(OUTBOX, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => (JSON.parse(line) as { summaries: string[] }).summaries);
  } catch {
    return [];
  }
}

test.describe.configure({ mode: 'serial' });

test('listing-watch: only listings and permits that match the filters raise an alert', async ({ page, request }) => {
  await request.post(`${FIXTURES}/__fixture/reset`);
  await page.goto(DASHBOARD);
  await expect(page.getByRole('heading', { level: 1, name: 'Haunted Listings' })).toBeVisible();

  const rentals = page.locator('#ghost-larkspur-rentals');
  const permits = page.locator('#ghost-hollowmere-permits');

  // Check each ghost on its own from its séance, the way a person would.
  await rentals.locator('.ghost__hit').click();
  await page.locator('#seance').getByRole('button', { name: 'Check now' }).click();
  await expect(page.locator('#toast')).toContainText('First sighting recorded');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Summon every ghost' }).click();
  await expect(page.locator('#toast')).toContainText('4 ghosts visited');
  await expect(rentals).toHaveAttribute('data-state', 'dormant');
  await expect(rentals.locator('.readings')).toContainText('3 on page');

  // New listings and permits appear on the pages.
  await request.post(`${FIXTURES}/__fixture/advance`);
  await page.getByRole('button', { name: 'Summon every ghost' }).click();
  await expect(page.locator('#toast')).toContainText('restless');

  await expect(rentals).toHaveAttribute('data-state', 'restless');
  await expect(permits).toHaveAttribute('data-state', 'restless');
  await expect(page.locator('#ghost-old-mill-lofts')).toHaveAttribute('data-state', 'restless');
  // The house shows which unit lit its window, and the feed has its own name and no bank letters.
  await expect(rentals.locator('.reading--match')).toContainText(/Window lit\s*2 bd \$[\d,]+ (Old Mill|Larkspur Heights)/);
  await expect(page.getByRole('heading', { level: 2, name: 'Knocks at the door' })).toBeVisible();
  await expect(page.locator('#feed [data-action="dispute"]')).toHaveCount(0);

  const summaries = await outboxSummaries();
  // Matches: 2 bd in Old Mill under $2,100, and a price cut that brings a listing into budget.
  expect(summaries).toContain('New listing: 2 bd in Old Mill at 418 Bramble Row, Apt 3 for $1,950/mo.');
  expect(summaries.some((s) => s.startsWith('2 bd in Larkspur Heights at 14 Thornapple Ct, Unit 2') && s.includes('went down from $2,300 to $2,050'))).toBe(true);
  // Non-matches stay quiet: a 1 bd in Old Mill and a 3 bd in Riverside.
  expect(summaries.some((s) => s.includes('9 Cobweb Alley'))).toBe(false);
  expect(summaries.some((s) => s.includes('1220 Lantern St'))).toBe(false);
  // Permits: demolition and new construction match; the electrical permit does not. One alert per permit.
  expect(summaries.filter((s) => s.includes('200 Old Mill Rd'))).toHaveLength(1);
  expect(summaries.some((s) => s.includes('1200 Bramble Row'))).toBe(true);
  expect(summaries.some((s) => s.includes('33 Ember Ct'))).toBe(false);

  // The séance marks the new listing.
  await rentals.locator('.ghost__hit').click();
  const seance = page.locator('#seance');
  await expect(seance.locator('li[data-new="true"]').filter({ hasText: '418 Bramble Row' })).toBeVisible();
  await expect(seance.locator('.log__item').first()).toBeVisible();
  await seance.getByRole('button', { name: /Lay to rest/ }).click();
  await page.keyboard.press('Escape');
  await expect(rentals).toHaveAttribute('data-state', 'dormant');
  await expect(permits).toHaveAttribute('data-state', 'restless');
});

test('listing-watch: a site outage turns the ghost lost without raising a false alert', async ({ page, request }) => {
  await request.post(`${FIXTURES}/__fixture/outage?on=1`);
  await page.goto(DASHBOARD);
  const before = (await outboxSummaries()).length;
  const lofts = page.locator('#ghost-old-mill-lofts');
  await lofts.locator('.ghost__hit').click();
  await page.locator('#seance').getByRole('button', { name: 'Check now' }).click();
  await expect(page.locator('#toast')).toContainText('Lost in the fog');
  await page.keyboard.press('Escape');
  await request.post(`${FIXTURES}/__fixture/outage?on=0`);
  expect((await outboxSummaries()).length).toBe(before);
});
