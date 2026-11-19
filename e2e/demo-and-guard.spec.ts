import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { origin, ports } from './ports';

const DEMO = origin(ports.demoDashboard);
const DEMO_FIXTURES = origin(ports.demoFixtures);
const BONUS_DASHBOARD = origin(ports.bonusDashboard);

test.describe.configure({ mode: 'serial' });

test('demo mode: the first sighting is already taken, and one key press lets a night pass', async ({ page }) => {
  await page.goto(DEMO);
  const lanternfield = page.locator('#ghost-lanternfield-checking');
  // The demo took its baseline at startup, so nobody has to summon the ghosts first.
  await expect(lanternfield).toHaveAttribute('data-state', 'dormant');
  await expect(page.locator('#ghost-cinderhollow-members')).toHaveAttribute('data-state', 'blocked');

  // The Ghost of Terms Past filled the séance from archived copies at the first sighting.
  await expect(lanternfield.locator('.ghost__msg')).toHaveText('First sighting recorded. The Ghost of Terms Past found 2 earlier changes.');
  // Before anything happens, the stone already carries the worst past change and a fickleness score.
  await expect(lanternfield.locator('.ghost__ribbon')).toContainText(/From the archive\s*Bonus cut \$200 in June/);
  await expect(lanternfield.locator('.ghost__ribbon')).toHaveAttribute('data-tone', 'bad');
  await expect(lanternfield.locator('.ghost__fickle')).toHaveText(/^Fickle: changed 2 times in \d+ months, 1 for the worse\.$/);
  // Spirit mail is not empty either: the archive's letters wait below the prompt, dimmed.
  const fromArchive = page.locator('#feed .feed__item--archive');
  await expect(fromArchive.filter({ hasText: 'Lanternfield' })).toContainText('Bonus went down from $500 to $300 (-$200).');
  await lanternfield.locator('.ghost__hit').click();
  const past = page.locator('#seance .past');
  await expect(past.getByRole('heading', { name: /Ghost of Terms Past/ })).toBeVisible();
  await expect(past.locator('.past__entry')).toHaveCount(3);
  await expect(past.locator('.past__fickle')).toContainText('changes a year');
  await expect(past.locator('.past__entry[data-kind="change"]')).toHaveAttribute('data-tone', 'bad');
  await expect(past.locator('.past__entry[data-kind="change"]')).toContainText('Jun 11, 2026');
  await expect(past.locator('.past__entry[data-kind="change"]')).toContainText('Bonus went down from $500 to $300 (-$200).');
  const archived = await past.locator('.past__entry[data-kind="first"] a').getAttribute('href');
  expect(archived).toMatch(/\/__wayback\/web\/20260304151209\//);
  expect(await (await page.request.get(archived as string)).text()).toContain('$500 bonus');
  await page.keyboard.press('Escape');

  // The first thing to click is the glowing button, and the empty feed says so.
  const night = page.getByRole('button', { name: 'Let a night pass' });
  await expect(night).toBeVisible();
  await expect(night).toHaveClass(/btn--glow/);
  await expect(page.getByRole('button', { name: 'Summon every ghost' })).not.toHaveClass(/btn--glow/);
  await expect(page.locator('#feed .feed__empty')).toContainText('Click Let a night pass');
  await expect(page.locator('#night-hint kbd')).toHaveText('N');
  // N lets the night pass, the same as the button.
  await page.keyboard.press('n');
  await expect(page.locator('#toast')).toContainText('Night 1 passes.');
  await expect(page.locator('#toast')).toContainText('3 pages changed: 2 worth waking for, 1 ignored as noise.');
  await expect(page.locator('#toast')).toContainText('2 newly restless.');
  await expect(lanternfield).toHaveAttribute('data-state', 'restless');
  // A shriek gets its scene (red moon, lightning) and leaves a crack in the stone.
  await expect(lanternfield.locator('.ghost__crack')).toHaveCount(1);
  await expect(page.locator('#ghost-bramblewick-savings .ghost__crack')).toHaveCount(0);
  // Bramblewick's page was only reformatted: its ghost slept through it, and the stone says so.
  await expect(page.locator('#ghost-bramblewick-savings .ghost__ignored')).toHaveText("Slept through 1 page change that didn't matter");
  await expect(lanternfield.locator('.ghost__ignored')).toHaveCount(0);
  await expect(page.locator('#feed')).toContainText('Bonus went up from $300 to $400 (+$100).');
  // Mossgate kept its 60,000 points but slipped an eligibility window into the fine print.
  const baitAndSwitch = page.locator('#feed .feed__item[data-stealth="true"]');
  await expect(baitAndSwitch).toHaveCount(1);
  await expect(baitAndSwitch).toContainText('Bait and switch Bonus points stayed the same while the fine print changed.');
  await expect(baitAndSwitch).toContainText('Mossgate Nightfall Card');
  // The ghost kept a receipt: an archived copy of the changed page and the hashes of both snapshots.
  const receipt = baitAndSwitch.locator('.receipt');
  await expect(receipt).toContainText(/sha256 [0-9a-f]{8}…[0-9a-f]{4} → [0-9a-f]{8}…[0-9a-f]{4}/);
  const copy = await receipt.getByRole('link', { name: 'archived copy' }).getAttribute('href');
  expect(copy).toMatch(new RegExp(`\\/__wayback\/web\\/\\d{14}\\/http:\\/\\/127\\.0\\.0\\.1:${ports.demoFixtures}\\/mossgate\\/nightfall-card$`));
  expect(await (await page.request.get(copy as string)).text()).toContain('past 48 months');
  // The stone shows the change itself: the old value struck through, the new one beside it.
  const bonusReading = lanternfield.locator('.reading[data-changed="true"]').filter({ hasText: 'Bonus' });
  await expect(bonusReading.locator('del')).toHaveText('$300');
  await expect(bonusReading.locator('ins')).toHaveText('$400');
  // A bigger bonus is good news; the stone colors it that way.
  await expect(bonusReading).toHaveAttribute('data-tone', 'good');
  await expect(page.locator('#feed-pill-count')).toHaveText(/^\d+$/);
  await expect(page.locator('#ghost-bramblewick-savings .reading[data-changed="true"]')).toHaveCount(0);
  // Every state a night can leave behind (restless, struck values, a bait and switch) passes axe.
  // Colors are measured at rest, with every transition stilled.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await expect(night).toBeEnabled();

  // Raise the dead: the bait and switch becomes a dispute pack with the letter and CFPB text.
  await baitAndSwitch.getByRole('button', { name: /^Raise the dead/ }).click();
  const seance = page.locator('#seance');
  await expect(seance.getByRole('heading', { name: 'Dispute pack: Mossgate Nightfall Card' })).toBeVisible();
  await expect(seance.locator('#dispute-letter')).toHaveValue(/Fine print: "Bonus not available if you have opened any Mossgate card in the past 48 months\."/);
  await expect(seance.locator('#dispute-letter')).toHaveValue(/SHA-256 of my record of the page on .+: [0-9a-f]{64}/);
  await expect(seance.locator('#dispute-cfpb')).toHaveValue(/The headline offer stayed the same/);
  await expect(seance).toContainText("Didn't receive advertised or promotional terms");
  const packScan = await new AxeBuilder({ page }).include('#seance').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(packScan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await page.keyboard.press('Escape');

  const state = (await (await page.request.get(`${DEMO_FIXTURES}/__fixture/state`)).json()) as { version: number };
  expect(state.version).toBe(2);
});

test('demo mode: ?night=1 opens on the night itself, and Rewind to calm goes back to the first sighting', async ({ page }) => {
  await page.goto(DEMO);
  const lanternfield = page.locator('#ghost-lanternfield-checking');
  const rewind = page.getByRole('button', { name: 'Rewind to calm' });
  // The first test left a night behind, so the dashboard offers to rewind it.
  await expect(rewind).toBeVisible();
  await rewind.click();
  await expect(page.locator('#toast')).toContainText('Rewound to the first sighting.');
  await expect(lanternfield).toHaveAttribute('data-state', 'dormant');
  await expect(rewind).toBeHidden();
  await expect(page.locator('#tally')).toContainText("Tonight's tally");
  await expect(page.locator('#tally')).toContainText('0 letters sent');
  const state = (await (await page.request.get(`${DEMO_FIXTURES}/__fixture/state`)).json()) as { version: number };
  expect(state.version).toBe(1);

  await page.goto(`${DEMO}/?night=1`);
  await expect(page.locator('#toast')).toContainText('Night 1 passes.');
  await expect(lanternfield).toHaveAttribute('data-state', 'restless');
  await expect(lanternfield.locator('.reading[data-changed="true"] del').first()).toHaveText('$300');
  await expect(rewind).toBeVisible();
  // Spirit mail leads the night with its loudest letter: the bait and switch.
  await expect(page.locator('#feed .feed__item').first()).toHaveAttribute('data-stealth', 'true');
  await expect(page.locator('#tally')).toContainText('1 page change slept through');
  await expect(page.locator('#tally')).toContainText('1 door respected (robots.txt)');
  // A second load of the same link does not pass another night.
  await page.goto(`${DEMO}/?night=1`);
  await expect(lanternfield).toHaveAttribute('data-state', 'restless');
  expect(((await (await page.request.get(`${DEMO_FIXTURES}/__fixture/state`)).json()) as { version: number }).version).toBe(2);
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
  await page.goto(BONUS_DASHBOARD);
  await expect(page.getByRole('button', { name: 'Summon every ghost' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Let a night pass' })).toHaveCount(0);
  expect((await request.post(`${BONUS_DASHBOARD}/api/demo/next-night`)).status()).toBe(404);
  await expect(page.getByRole('button', { name: 'Rewind to calm' })).toHaveCount(0);
  expect((await request.post(`${BONUS_DASHBOARD}/api/demo/rewind`)).status()).toBe(404);
});
