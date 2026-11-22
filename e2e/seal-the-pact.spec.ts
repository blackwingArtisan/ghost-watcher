import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { origin, ports } from './ports';

/**
 * Seal the pact, driven through the real dashboards. Part 1 and part 3 use the bonus-watch dashboard
 * in serve mode; part 2 uses the demo dashboard, whose pacts are back-dated 40 days. The file name
 * sorts after the other specs, so it runs last and leaves its pacts broken.
 */
const BONUS = origin(ports.bonusDashboard);
const DEMO = origin(ports.demoDashboard);
const LANTERN = 'lanternfield-checking';
const LANTERN_NAME = 'Lanternfield Everyday Checking';
const SHORT_HASH = /[0-9a-f]{8}…[0-9a-f]{4}/;
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe.configure({ mode: 'serial' });

interface PactBody {
  state: 'none' | 'sealed' | 'corrupt';
  pact: { sealedAt: string; sealedDate: string; sha256: string; shortHash: string; seeded: boolean } | null;
}

const letterDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const compactDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} '${String(d.getUTCFullYear()).slice(-2)}`;
};

/** `2026-10-10T10:00:00.000Z` to `20261010100000`, the stamp the stand-in archive puts in a copy's address. */
function sealedStamp(iso: string): string {
  return iso.replace(/\.\d+Z$/, 'Z').replace(/[-:TZ]/g, '').slice(0, 14);
}

async function readPact(page: Page, base: string, id = LANTERN): Promise<PactBody> {
  return (await (await page.request.get(`${base}/api/ghosts/${id}/pact`)).json()) as PactBody;
}

async function violations(page: Page, include: string): Promise<string[]> {
  const scan = await new AxeBuilder({ page }).include(include).withTags(WCAG).analyze();
  return scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test.describe('part 1: the bonus dashboard', () => {
  test('(PACT 1.1, 1.3, 10.1, 10.3, 10.5, 10.9, 10.10) "I applied today" seals the stone and the séance shows the pact', async ({ page }) => {
    // A ghost needs a snapshot first, and a clean start makes the test repeatable.
    await page.request.delete(`${BONUS}/api/ghosts/${LANTERN}/pact`);
    await page.request.post(`${BONUS}/api/ghosts/${LANTERN}/check`);
    await page.goto(BONUS);
    const stone = page.locator(`#ghost-${LANTERN}`);
    const seal = stone.getByRole('button', { name: `I applied today: seal the pact for ${LANTERN_NAME}` });
    await expect(seal).toBeEnabled();
    await expect(stone.locator('.ghost__pact')).toHaveCount(1);

    await seal.click();
    await expect(page.locator('#toast')).toContainText(`Pact sealed for ${LANTERN_NAME}. Hash`);
    await expect(page.locator('#toast')).toContainText(SHORT_HASH);

    const pact = await readPact(page, BONUS);
    expect(pact.state).toBe('sealed');
    const sealed = pact.pact;
    if (!sealed) throw new Error('expected a pact');
    const chip = stone.locator('.ghost__pact[data-pact="sealed"]');
    await expect(chip).toContainText('Pact sealed');
    await expect(chip).toContainText(compactDate(sealed.sealedAt));
    await expect(chip).toContainText(sealed.shortHash);
    await expect(chip).not.toContainText('demo');
    await expect(seal).toHaveCount(0);
    // The toast named the same short hash the API reports.
    await expect(page.locator('#toast')).toContainText(sealed.shortHash);

    await stone.locator('.ghost__hit').click();
    const seance = page.locator('#seance');
    await expect(seance.getByRole('heading', { name: 'The pact' })).toBeVisible();
    await expect(seance.locator('.pact')).toContainText(letterDate(sealed.sealedAt));
    await expect(seance.locator('.pact__hash')).toHaveText(sealed.sha256);
    await expect(seance.locator('.pact')).toContainText('hashes only');
    await expect(seance.locator('.values thead')).toContainText('The day you applied');
    await expect(seance.locator('.values tbody tr').first().locator('td.pact-value')).toHaveText(/\S/);
    await page.keyboard.press('Escape');
  });

  test('(PACT 2.2, 2.3, 10.7, 10.8) "Seal again" asks first: "Keep it" changes nothing and "Yes, replace" does', async ({ page }) => {
    await page.goto(BONUS);
    const before = (await readPact(page, BONUS)).pact;
    if (!before) throw new Error('part 1 should have sealed a pact');
    // The server refuses a bare second seal, whatever the page does.
    const bare = await page.request.post(`${BONUS}/api/ghosts/${LANTERN}/pact`, { data: {} });
    expect(bare.status()).toBe(409);
    expect(((await bare.json()) as { code: string }).code).toBe('pact-exists');

    await page.locator(`#ghost-${LANTERN} .ghost__hit`).click();
    const seance = page.locator('#seance');
    const again = seance.getByRole('button', { name: `Seal again: replace the pact for ${LANTERN_NAME}` });
    await again.click();
    const confirm = seance.getByRole('group');
    await expect(confirm).toContainText(`Replace the pact sealed ${before.sealedDate}?`);
    await expect(seance.getByRole('button', { name: 'Keep it' })).toBeFocused();
    await seance.getByRole('button', { name: 'Keep it' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(again).toBeFocused();
    expect((await readPact(page, BONUS)).pact?.sealedAt).toBe(before.sealedAt);

    // Escape answers the question before it closes the séance.
    await again.click();
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(seance).toBeVisible();
    await expect(again).toBeFocused();

    await again.click();
    await seance.getByRole('button', { name: 'Yes, replace' }).click();
    await expect(page.locator('#toast')).toContainText(`Pact sealed for ${LANTERN_NAME}. Hash`);
    await expect(confirm).toHaveCount(0);
    await expect.poll(async () => (await readPact(page, BONUS)).pact?.sealedAt).not.toBe(before.sealedAt);
    await expect(again).toBeFocused();
    await page.keyboard.press('Escape');
  });

  test('(PACT 2.5, 10.1, 10.7) "Break the pact" asks first, then the button comes back', async ({ page }) => {
    await page.goto(BONUS);
    await page.locator(`#ghost-${LANTERN} .ghost__hit`).click();
    const seance = page.locator('#seance');
    await seance.getByRole('button', { name: `Break the pact for ${LANTERN_NAME}` }).click();
    await expect(seance.getByRole('group')).toContainText('Break the pact sealed');
    await seance.getByRole('button', { name: 'Keep it' }).click();
    expect((await readPact(page, BONUS)).state).toBe('sealed');

    await seance.getByRole('button', { name: `Break the pact for ${LANTERN_NAME}` }).click();
    await seance.getByRole('button', { name: 'Yes, break' }).click();
    await expect(page.locator('#toast')).toContainText(`Pact broken for ${LANTERN_NAME}.`);
    await expect(seance.locator('.pact')).toContainText('No pact yet. Seal one on the day you apply.');
    await expect(seance.locator('.values thead')).not.toContainText('The day you applied');
    expect((await readPact(page, BONUS)).state).toBe('none');
    await page.keyboard.press('Escape');
    await expect(page.locator(`#ghost-${LANTERN}`).getByRole('button', { name: /^I applied today/ })).toBeEnabled();
  });

  test('(PACT 1.7, 12.20, 12.21, 12.24) a ghost that was turned away has no seal button or hint, and says why in one line', async ({ page }) => {
    await page.goto(BONUS);
    const blocked = page.locator('#ghost-cinderhollow-members');
    await expect(blocked.getByRole('button', { name: /^I applied today/ })).toHaveCount(0);
    await expect(blocked).not.toContainText('Not seen yet');
    await expect(blocked).toContainText("The site's robots.txt asks watchers to stay away, so the ghost does not visit and cannot seal a pact.");
    const refused = await page.request.post(`${BONUS}/api/ghosts/cinderhollow-members/pact`, { data: {} });
    expect(refused.status()).toBe(409);
    expect(((await refused.json()) as { code: string }).code).toBe('no-snapshot');
    expect((await readPact(page, BONUS, 'cinderhollow-members')).state).toBe('none');
  });
});

test.describe('part 2: the demo dashboard', () => {
  test('(PACT 8.1, 8.2, 12.5, 12.25, 10.3) after a rewind every stone with a reading is already sealed, tagged "demo"', async ({ page }) => {
    await page.goto(DEMO);
    const rewind = page.getByRole('button', { name: 'Rewind to calm' });
    if (await rewind.isVisible()) {
      await rewind.click();
      await expect(page.locator('#toast')).toContainText('Rewound to the first sighting.');
    }
    const stone = page.locator(`#ghost-${LANTERN}`);
    await expect(stone.locator('.ghost__pact[data-pact="sealed"]')).toContainText('Pact sealed');
    await expect(stone.locator('.ghost__pact .pact-demo')).toHaveText('demo');
    const pact = (await readPact(page, DEMO)).pact;
    if (!pact) throw new Error('the demo should seed a pact');
    expect(pact.seeded).toBe(true);
    const state = (await (await page.request.get(`${DEMO}/api/state`)).json()) as { generatedAt: string };
    // Seeded 40 days before now, not on the day the demo started.
    const days = (Date.parse(state.generatedAt) - Date.parse(pact.sealedAt)) / 86_400_000;
    expect(days).toBeGreaterThan(39.99);
    expect(days).toBeLessThan(40.1);
    await expect(stone.locator('.ghost__pact')).toContainText(compactDate(pact.sealedAt));
    // The ghost that robots.txt turned away has no reading, so nothing was sealed for it.
    await expect(page.locator('#ghost-cinderhollow-members').getByRole('button', { name: /^I applied today/ })).toHaveCount(0);

    await stone.locator('.ghost__hit').click();
    await expect(page.locator('#seance .pact')).toContainText('demo pact');
    await expect(page.locator('#seance .pact')).toContainText('(the reading taken when it was sealed)');
    await expect(page.locator('#seance .pact')).not.toContainText('just now');
    const copy = page.locator('#seance .pact').getByRole('link', { name: 'archived copy' });
    await expect(copy).toHaveAttribute('href', new RegExp(`/__wayback/web/${sealedStamp(pact.sealedAt)}/`));
    await expect(page.locator('#seance .pact')).not.toContainText('no archived copy was made');
    await page.keyboard.press('Escape');
  });

  test('(PACT 6.1, 6.3, 6.4, 6.5, 7.1, 7.3, 8.5, 10.11, 10.13) night 1: "Ask for the match" opens a bonus match dated from the seed, 40 days apart', async ({ page }) => {
    await page.goto(DEMO);
    const sealedAt = (await readPact(page, DEMO)).pact?.sealedAt;
    if (!sealedAt) throw new Error('the demo should seed a pact');
    await page.keyboard.press('n');
    await expect(page.locator('#toast')).toContainText('Night 1 passes.');

    const state = (await (await page.request.get(`${DEMO}/api/state`)).json()) as {
      feed: Array<{ alert: { watchId: string; field?: string; createdAt: string; pact?: { note: string } } }>;
    };
    const bonus = state.feed.find((e) => e.alert.watchId === LANTERN && e.alert.field === 'bonus')?.alert;
    if (!bonus?.pact) throw new Error('expected a Lanternfield bonus alert with a pact reference');
    const applied = letterDate(sealedAt);
    const now = letterDate(bonus.createdAt);
    expect(Math.round((Date.parse(bonus.createdAt) - Date.parse(sealedAt)) / 86_400_000)).toBe(40);

    // Spirit mail carries the pact note and the match button.
    await expect(page.locator('#feed')).toContainText(bonus.pact.note);
    await page.getByRole('button', { name: `Ask for the match: bonus match letter for ${LANTERN_NAME}` }).click();
    const seance = page.locator('#seance');
    await expect(seance.getByRole('heading', { name: `Bonus match: ${LANTERN_NAME}` })).toBeVisible();
    await expect(seance.locator('[data-side="before"] h3')).toHaveText(`${applied}, the day you applied: what the page promised`);
    await expect(seance.locator('[data-side="after"] h3')).toHaveText(`${now}: what it says now`);
    await expect(seance.locator('[data-side="before"]')).toContainText('Bonus: $300');
    await expect(seance.locator('[data-side="after"]')).toContainText('Bonus: $400');
    await expect(seance.locator('.dispute__subject')).toHaveText(`Request to match the improved terms of ${LANTERN_NAME}`);
    const letter = seance.locator('#dispute-letter');
    await expect(letter).toHaveValue(new RegExp(`I applied for ${LANTERN_NAME} on ${applied}`));
    expect(await letter.inputValue()).not.toContain('[Date you applied]');
    await expect(seance).not.toContainText('CFPB');
    await expect(seance.locator('.dispute__evidence')).toContainText('Exhibit A SHA-256');
    await seance.getByRole('button', { name: 'Back to the séance' }).click();
    await expect(seance.getByRole('heading', { name: 'The pact' })).toBeVisible();
    await expect(seance.locator('tr[data-pact-differs="true"]').filter({ hasText: 'Bonus' })).toContainText('$300');
    await page.keyboard.press('Escape');
  });

  test('(PACT 6.1, 6.5, 7.2, 10.11, 10.13) Mossgate gets the dispute variant with Exhibit A', async ({ page }) => {
    await page.goto(DEMO);
    const sealedAt = (await readPact(page, DEMO, 'mossgate-nightfall')).pact?.sealedAt;
    if (!sealedAt) throw new Error('the demo should seed a pact for Mossgate');
    const item = page.locator('#feed .feed__item[data-stealth="true"]');
    // The note only repeats the Bait and switch line on night 1, so the row does not carry it (PACT 12.10).
    await expect(item.locator('.stealth')).toBeVisible();
    await expect(item.locator('.pact-note')).toHaveCount(0);
    await item.getByRole('button', { name: /^Raise the dead/ }).click();
    const seance = page.locator('#seance');
    await expect(seance.getByRole('heading', { name: 'Dispute pack: Mossgate Nightfall Card' })).toBeVisible();
    await expect(seance.locator('[data-side="before"] h3')).toContainText(`${letterDate(sealedAt)}, the day you applied: what the page promised`);
    await expect(seance.locator('#dispute-letter')).toHaveValue(new RegExp(`on ${letterDate(sealedAt)}, relying on the terms`));
    expect(await seance.locator('#dispute-letter').inputValue()).not.toContain('[Date you applied]');
    await expect(seance.locator('.dispute__evidence')).toContainText('Exhibit A');
    await expect(seance.getByText('3. If the bank says no: a CFPB complaint')).toBeVisible();
    await expect(seance.locator('.dispute__head p.muted')).not.toContainText('[Date you applied]');
    await page.keyboard.press('Escape');
  });

  test('(PACT 8.4, 10.3) rewinding clears the night and seals the pacts again, dated from the new now', async ({ page }) => {
    await page.goto(DEMO);
    const first = (await readPact(page, DEMO)).pact;
    if (!first) throw new Error('expected the seeded pact');
    await page.getByRole('button', { name: 'Rewind to calm' }).click();
    await expect(page.locator('#toast')).toContainText('Rewound to the first sighting.');
    await expect(page.locator('#feed .feed__empty')).toBeVisible();
    const again = (await readPact(page, DEMO)).pact;
    expect(again?.seeded).toBe(true);
    expect(again?.sealedAt).not.toBe(first.sealedAt);
    await expect(page.locator(`#ghost-${LANTERN} .ghost__pact`)).toContainText('Pact sealed');
    await expect(page.locator(`#ghost-${LANTERN} .pact-demo`)).toBeVisible();
  });
});

test.describe('part 3: keyboard and accessibility', () => {
  test('(PACT 10.8, 10.12) Tab and Enter seal a stone, and the stone and séance pass axe with the pact section open', async ({ page }) => {
    await page.request.delete(`${BONUS}/api/ghosts/${LANTERN}/pact`);
    await page.goto(BONUS);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let reached = false;
    for (let presses = 0; presses < 40 && !reached; presses += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(
        (name) => document.activeElement?.getAttribute('aria-label') === `I applied today: seal the pact for ${name}`,
        LANTERN_NAME,
      );
    }
    expect(reached).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast')).toContainText(`Pact sealed for ${LANTERN_NAME}. Hash`);
    await expect(page.locator(`#ghost-${LANTERN} .ghost__pact[data-pact="sealed"]`)).toBeVisible();
    // The button is gone, so focus lands on the stone's own control instead of falling to the page.
    await expect(page.locator(`#ghost-${LANTERN} .ghost__hit`)).toBeFocused();

    expect(await violations(page, '#graveyard')).toEqual([]);
    await page.keyboard.press('Enter');
    const seance = page.locator('#seance');
    await expect(seance.getByRole('heading', { name: 'The pact' })).toBeVisible();
    expect(await violations(page, '#seance')).toEqual([]);

    // The confirmation takes focus and gives it back to the button that asked.
    const again = seance.getByRole('button', { name: `Seal again: replace the pact for ${LANTERN_NAME}` });
    await again.focus();
    await page.keyboard.press('Enter');
    await expect(seance.getByRole('button', { name: 'Keep it' })).toBeFocused();
    expect(await violations(page, '#seance')).toEqual([]);
    await page.keyboard.press('Enter');
    await expect(again).toBeFocused();

    const breakButton = seance.getByRole('button', { name: `Break the pact for ${LANTERN_NAME}` });
    await breakButton.focus();
    await page.keyboard.press('Enter');
    await expect(seance.getByRole('button', { name: 'Keep it' })).toBeFocused();
    // "Yes, break" comes just before "Keep it" in reading order.
    await page.keyboard.press('Shift+Tab');
    await expect(seance.getByRole('button', { name: 'Yes, break' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#toast')).toContainText(`Pact broken for ${LANTERN_NAME}.`);
    await expect(seance.getByRole('button', { name: /^I applied today/ })).toBeFocused();
    await page.keyboard.press('Escape');
    expect((await readPact(page, BONUS)).state).toBe('none');
  });

  test('(PACT 10.12) the demo dashboard with a seeded pact and a pack open passes axe', async ({ page }) => {
    await page.goto(DEMO);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await violations(page, '#graveyard')).toEqual([]);
    await page.locator(`#ghost-${LANTERN} .ghost__hit`).click();
    await expect(page.locator('#seance').getByRole('heading', { name: 'The pact' })).toBeVisible();
    expect(await violations(page, '#seance')).toEqual([]);
  });
});
