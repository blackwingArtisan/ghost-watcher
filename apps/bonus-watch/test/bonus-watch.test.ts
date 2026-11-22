import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diff, evaluateRules, extract, loadDeps, type Watch } from '@ghost-watcher/template';
import { startFixtureServer, type FixtureServer } from '@ghost-watcher/template/testing';
import { bonusSite } from '../fixtures/site';
import { buildApp } from '../src/app';

const app = buildApp({ BONUS_SITE_ORIGIN: 'https://bank.example.com' });

function pageFor(watch: Watch, version: number, requestNumber = version): string {
  const path = new URL(watch.url).pathname;
  const page = bonusSite.pages.find((p) => p.path === path);
  if (!page) throw new Error(`No fixture for ${path}`);
  return page.render({ version, requestNumber, now: new Date(Date.UTC(2026, 9, 31, requestNumber)) });
}

function summaries(watchId: string, from: number, to: number): string[] {
  const watch = app.watches.find((w) => w.id === watchId);
  if (!watch) throw new Error(watchId);
  const before = extract(pageFor(watch, from, 1), watch);
  const after = extract(pageFor(watch, to, 7), watch);
  return evaluateRules(watch, diff(before, after)).map((f) => `${f.severity}: ${f.summary}`);
}

describe('bonus-watch watches against its fixture pages', () => {
  it('defines five valid watches built only from the template API', () => {
    expect(app.watches.map((w) => w.id)).toEqual(['lanternfield-checking', 'bramblewick-savings', 'mossgate-nightfall', 'fernwick-premier', 'cinderhollow-members']);
    expect(app.copy.disclaimer).toMatch(/Not financial advice/);
  });

  it('reads every watched value on the baseline pages', () => {
    const watch = app.watches[0] as Watch;
    const values = extract(pageFor(watch, 1), watch).fields;
    expect(values.bonus).toMatchObject({ amountMinor: 30000 });
    expect(values.minDeposit).toMatchObject({ amountMinor: 500000 });
    expect(values.deadline).toMatchObject({ iso: '2027-01-15' });
    expect(values.finePrint).toMatchObject({ kind: 'text' });
  });

  it('page noise alone (timestamps, rotating promos, request ids) never alerts', () => {
    for (const watch of app.watches) {
      const a = extract(pageFor(watch, 1, 1), watch);
      const b = extract(pageFor(watch, 1, 2), watch);
      expect(evaluateRules(watch, diff(a, b))).toEqual([]);
    }
  });

  it('Lanternfield v1 -> v2: bonus up, deposit down, deadline later', () => {
    expect(summaries('lanternfield-checking', 1, 2)).toEqual([
      'shriek: Bonus went up from $300 to $400 (+$100).',
      'moan: Min. deposit went down from $5,000 to $2,500 (-$2,500).',
      'moan: Deadline moved from Jan 15, 2027 to Feb 28, 2027 (44 days later).',
      'whisper: Fine print changed: "…deposits totaling $5,000 or more…" became "…deposits totaling $2,500 or more…"',
    ]);
  });

  it('Lanternfield v2 -> v3: a monthly fee clause shrieks', () => {
    expect(summaries('lanternfield-checking', 2, 3)).toEqual([
      'shriek: Fine print now says "A $12 monthly service fee applies unless you keep a $1,500 daily balance."',
    ]);
  });

  it('Bramblewick v1 -> v2 only reformats, so the ghost sleeps through it', () => {
    expect(summaries('bramblewick-savings', 1, 2)).toEqual([]);
  });

  it('Bramblewick v2 -> v3: the offer ends', () => {
    const found = summaries('bramblewick-savings', 2, 3);
    expect(found[0]).toBe('shriek: Bonus disappeared (it was "$250").');
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('Mossgate v1 -> v2: annual fee and eligibility window', () => {
    expect(summaries('mossgate-nightfall', 1, 2)).toEqual([
      'moan: Annual fee went up from $0 to $95 (+$95).',
      'shriek: Fine print now says "Bonus not available if you have opened any Mossgate card in the past 48 months."',
    ]);
  });
});

describe('bonus-watch: stealth edits', () => {
  const stealth = (watchId: string, from: number, to: number) => {
    const watch = app.watches.find((w) => w.id === watchId) as Watch;
    return evaluateRules(watch, diff(extract(pageFor(watch, from, 1), watch), extract(pageFor(watch, to, 7), watch)))
      .filter((f) => f.stealth)
      .map((f) => `${f.stealth} ${f.summary}`);
  };

  it('flags fine print that changes under an unchanged headline as a bait and switch', () => {
    expect(stealth('lanternfield-checking', 2, 3)).toEqual([
      'Bonus stayed the same while the fine print changed. Fine print now says "A $12 monthly service fee applies unless you keep a $1,500 daily balance."',
    ]);
    expect(stealth('mossgate-nightfall', 1, 2)).toEqual([
      'Bonus points stayed the same while the fine print changed. Fine print now says "Bonus not available if you have opened any Mossgate card in the past 48 months."',
    ]);
  });

  it('does not flag a night when the headline changed in the open', () => {
    expect(stealth('lanternfield-checking', 1, 2)).toEqual([]);
    expect(stealth('bramblewick-savings', 2, 3)).toEqual([]);
  });
});

describe('bonus-watch contact URL', () => {
  const LOCAL_ONLY_UA = 'GhostWatcher/0.1.0 (local-only, no public contact; page-change watcher)';
  const memory = { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' };

  it('ships without a contact URL, so no example.com page is presented as a contact', () => {
    expect(buildApp({}).contactUrl).toBeUndefined();
  });

  it('starts on its local fixture site with the local-only User-Agent', async () => {
    const deps = await loadDeps(buildApp({}), { env: memory });
    expect(deps.describe.userAgent).toBe(LOCAL_ONLY_UA);
    expect(deps.describe.userAgent).not.toContain('example');
  });

  it('refuses a real host until GHOST_CONTACT_URL names a real page', async () => {
    const live = buildApp({ BONUS_SITE_ORIGIN: 'https://pages.lanternfield-bank.com' });
    await expect(loadDeps(live, { env: memory })).rejects.toThrow(/GHOST_CONTACT_URL/);
    const env = { ...memory, GHOST_CONTACT_URL: 'https://stubborn-otter.dev/ghost-watcher' };
    expect((await loadDeps(live, { env })).describe.userAgent).toContain('+https://stubborn-otter.dev/ghost-watcher;');
  });
});

describe('bonus-watch CLI end to end (fixture site on 127.0.0.1)', () => {
  let fixtures: FixtureServer;
  let dataDir: string;
  const appDir = resolve(import.meta.dirname, '..');

  beforeAll(async () => {
    fixtures = await startFixtureServer(bonusSite, { port: 0 });
    dataDir = await mkdtemp(join(tmpdir(), 'bonus-cli-'));
  });
  afterAll(async () => {
    await fixtures.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  function cli(...args: string[]): Promise<{ code: number; out: string }> {
    return new Promise((done, fail) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts', ...args], {
        cwd: appDir,
        env: { ...process.env, BONUS_SITE_ORIGIN: fixtures.origin, GHOST_DATA_DIR: dataDir, GHOST_HOST_GAP_MS: '0' },
      });
      let out = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.stderr.on('data', (chunk) => (out += chunk));
      child.on('error', fail);
      child.on('close', (code) => done({ code: code ?? 1, out }));
    });
  }

  it('check records a baseline, respects the interval, and reports changes into the outbox', async () => {
    const first = await cli('check');
    expect(first.code).toBe(0);
    expect(first.out).toContain('Lanternfield Everyday Checking: first sighting recorded');
    expect(first.out).toContain('robots.txt says no');

    const polite = await cli('check');
    expect(polite.out).toContain('resting until');

    fixtures.advance();
    const second = await cli('check', '--force');
    expect(second.out).toContain('Bonus went up from $300 to $400 (+$100).');
    expect(second.out).toContain('delivered via outbox');

    const outbox = await readFile(join(dataDir, 'outbox', 'outbox.jsonl'), 'utf8');
    expect(outbox).toContain('lanternfield-checking');
    expect(fixtures.log.some((entry) => entry.path.startsWith('/members/'))).toBe(false);
  });
});
