import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diff, evaluateRules, extract, type Watch } from '@ghost-watcher/template';
import { startFixtureServer, type FixtureServer } from '@ghost-watcher/template/testing';
import { listingSite } from '../fixtures/site';
import { FILTERS, buildApp } from '../src/app';

const app = buildApp({ LISTING_SITE_ORIGIN: 'https://hollowmere.example.com' });

function pageFor(watch: Watch, version: number, requestNumber = version): string {
  const path = new URL(watch.url).pathname;
  const page = listingSite.pages.find((p) => p.path === path);
  if (!page) throw new Error(`No fixture for ${path}`);
  return page.render({ version, requestNumber, now: new Date(Date.UTC(2026, 10, 1, requestNumber)) });
}

function findings(watchId: string, from: number, to: number) {
  const watch = app.watches.find((w) => w.id === watchId);
  if (!watch) throw new Error(watchId);
  return evaluateRules(watch, diff(extract(pageFor(watch, from, 1), watch), extract(pageFor(watch, to, 5), watch)));
}

describe('listing-watch watches against its fixture pages', () => {
  it('defines list watches for rentals and permits', () => {
    expect(app.watches.map((w) => w.id)).toEqual(['larkspur-rentals', 'vale-availability', 'hollowmere-permits', 'old-mill-lofts']);
    expect(app.watches[0]?.subtitle).toBe('2+ bd under $2,100 in Old Mill or Larkspur Heights');
  });

  it('extracts listings with ids, numbers, money and tracking-free links', () => {
    const watch = app.watches[0] as Watch;
    const items = extract(pageFor(watch, 1), watch).lists.listings ?? [];
    expect(items).toHaveLength(3);
    expect(items[0]?.values).toMatchObject({
      id: { text: 'LR-2041' },
      beds: { value: 2 },
      price: { value: 2300 },
      link: { href: 'https://hollowmere.example.com/rentals/listing/LR-2041?sid=1' },
    });
  });

  it('noise and reordering never alert', () => {
    for (const watch of app.watches) {
      const a = extract(pageFor(watch, 1, 1), watch);
      const b = extract(pageFor(watch, 1, 2), watch);
      expect(evaluateRules(watch, diff(a, b))).toEqual([]);
    }
  });

  it('rentals v1 -> v2: one matching new listing and a price cut into budget; non-matches stay quiet', () => {
    const found = findings('larkspur-rentals', 1, 2);
    expect(found.map((f) => f.summary)).toEqual([
      'New listing: 2 bd in Old Mill at 418 Bramble Row, Apt 3 for $1,950/mo.',
      '2 bd in Larkspur Heights at 14 Thornapple Ct, Unit 2 for $2,050/mo: Rent went down from $2,300 to $2,050 (-$250).',
    ]);
    expect(found[0]?.severity).toBe('shriek');
  });

  it('rentals v2 -> v3: the next match', () => {
    expect(findings('larkspur-rentals', 2, 3).map((f) => f.summary)).toEqual(['New listing: 2 bd in Larkspur Heights at 57 Mossgrove Pl for $2,075/mo.']);
  });

  it('Vale: a cheap new studio shrieks, a rented unit whispers', () => {
    expect(findings('vale-availability', 1, 2).map((f) => `${f.severity}: ${f.summary}`)).toEqual([
      'shriek: New unit: unit 4D, Studio, $1,725/mo, available Jan 1, 2027.',
      'whisper: Unit gone: unit 2C, 1 bed / 1 bath, $1,690/mo, available Dec 1, 2026.',
    ]);
  });

  it('permits: tracked types alert once each, big projects shriek, others stay quiet', () => {
    const found = findings('hollowmere-permits', 1, 2);
    expect(found.map((f) => `${f.severity}: ${f.summary}`)).toEqual([
      'moan: New permit: Demolition at 1200 Bramble Row ($45,000): Demolish detached garage.',
      'shriek: New permit: New Construction at 200 Old Mill Rd ($2,400,000): Four-story mixed-use building, 36 units.',
    ]);
    expect(FILTERS.permitTypes).not.toContain('Electrical');
  });

  it('Old Mill Lofts: leasing opens', () => {
    expect(findings('old-mill-lofts', 1, 2).map((f) => f.summary)).toEqual(['Leasing now says "Now leasing: 12 units available for January move-in."']);
  });
});

describe('listing-watch CLI end to end (fixture site on 127.0.0.1)', () => {
  let fixtures: FixtureServer;
  let dataDir: string;
  const appDir = resolve(import.meta.dirname, '..');

  beforeAll(async () => {
    fixtures = await startFixtureServer(listingSite, { port: 0 });
    dataDir = await mkdtemp(join(tmpdir(), 'listing-cli-'));
  });
  afterAll(async () => {
    await fixtures.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  function cli(...args: string[]): Promise<{ code: number; out: string }> {
    return new Promise((done, fail) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts', ...args], {
        cwd: appDir,
        env: { ...process.env, LISTING_SITE_ORIGIN: fixtures.origin, GHOST_DATA_DIR: dataDir, GHOST_HOST_GAP_MS: '0' },
      });
      let out = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.stderr.on('data', (chunk) => (out += chunk));
      child.on('error', fail);
      child.on('close', (code) => done({ code: code ?? 1, out }));
    });
  }

  it('list, check, change, check --json', async () => {
    const listed = await cli('list');
    expect(listed.out.split('\n').filter(Boolean)).toHaveLength(4);

    expect((await cli('check')).code).toBe(0);
    fixtures.advance();
    const result = await cli('check', '--force', '--json');
    const parsed = JSON.parse(result.out) as Array<{ watchId: string; status: string }>;
    expect(parsed.map((r) => r.status)).toEqual(['changed', 'changed', 'changed', 'changed']);

    const outbox = await readFile(join(dataDir, 'outbox', 'outbox.jsonl'), 'utf8');
    expect(outbox.trim().split('\n')).toHaveLength(4);
    expect(outbox).toContain('418 Bramble Row');
    expect(outbox).not.toContain('33 Ember Ct');
  });
});
