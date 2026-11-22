import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { defineApp, type GhostApp } from '../src/app';
import type { AlertMessage, AlertSink } from '../src/alerts/types';
import { manualClock } from '../src/clock';
import { loadDeps } from '../src/config';
import { assertLoopback } from '../../test-setup/loopback-only';
import type { FetchOutcome, Fetcher } from '../src/fetcher';
import { Runner } from '../src/runner';
import { FileBlobStore, MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { runCli } from '../src/cli';
import { dashboardState } from '../src/view';
import { renderGhostCard, renderPage } from '../src/ui/render.js';
import { HOUR_MS, WatchDefinitionError, defineWatch, rules } from '../src/watch';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = '2026-10-31T00:00:00Z';

const watchOf = (id: string, url = 'http://127.0.0.1:9/offer') =>
  defineWatch({
    id,
    name: `Watch ${id}`,
    url,
    intervalMs: 6 * HOUR_MS,
    fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' }],
    rules: [rules.wentUp('bonus')],
  });

const appOf = (watches = [watchOf('lantern')]): GhostApp =>
  defineApp({
    id: 'closeout',
    name: 'Closeout Crypt',
    tagline: 'Testing',
    version: '0.1.0',
    alertTo: ['tester@example.com'],
    copy: { watchNoun: 'pages', quiet: 'Quiet.' },
    watches,
  });

class PageFetcher implements Fetcher {
  calls = 0;
  /** When set, the fetch waits for it before it answers. */
  gate: Promise<void> | undefined;
  constructor(private readonly html: string, private readonly clock: { now(): Date }) {}
  async fetchPage(url: string): Promise<FetchOutcome> {
    this.calls += 1;
    if (this.gate) await this.gate;
    return { status: 'ok', html: this.html, finalUrl: url, httpStatus: 200, fetchedAt: this.clock.now().toISOString() } as FetchOutcome;
  }
}

class QuietSink implements AlertSink {
  readonly channel = 'quiet';
  async deliver(_message: AlertMessage) {
    return { channel: this.channel, reference: '1' };
  }
}

/** Every file under `dir` (skipping dependency and output folders) whose name matches `pattern`. */
async function filesUnder(dir: string, pattern: RegExp): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (['node_modules', 'dist', '.ghost-data', '.ghost-e2e', 'test-results'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(path, pattern)));
    else if (pattern.test(entry.name)) found.push(path);
  }
  return found;
}

const importsOf = (source: string): string[] =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);

describe('closing the skeleton spec', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  it('(REQ-WATCH-01.4) defineApp rejects two watches with the same id and names the duplicate', () => {
    expect(() => appOf([watchOf('lantern'), watchOf('moss'), watchOf('lantern')])).toThrow(WatchDefinitionError);
    expect(() => appOf([watchOf('lantern'), watchOf('lantern')])).toThrow('Duplicate watch id "lantern"');
    expect(appOf([watchOf('lantern'), watchOf('moss')]).watches).toHaveLength(2);
  });

  it('(REQ-WATCH-05.4, REQ-BONUS-06, REQ-LISTING-06) app sources and tests import template code only from the package name', async () => {
    const apps = (await readdir(join(root, 'apps'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(apps.sort()).toEqual(['bonus-watch', 'listing-watch']);
    const allowed = new Set(['@ghost-watcher/template', '@ghost-watcher/template/testing']);
    let checked = 0;
    for (const app of apps) {
      const appDir = join(root, 'apps', app);
      for (const file of await filesUnder(appDir, /\.(ts|js|mjs)$/)) {
        checked += 1;
        for (const spec of importsOf(await readFile(file, 'utf8'))) {
          const where = `${relative(root, file)} imports "${spec}"`;
          if (spec.includes('ghost-watcher/template')) expect(allowed.has(spec), where).toBe(true);
          if (spec.startsWith('.')) {
            const target = resolve(dirname(file), spec);
            expect(target === appDir || target.startsWith(appDir + sep), `${where} (a relative import that leaves the app)`).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(8);
  });

  it('(REQ-TEST-02, REQ-TEST-06) no test constructs a real cloud client, and fetch refuses every host but this machine', async () => {
    const files = [
      ...(await filesUnder(join(root, 'template', 'test'), /\.ts$/)),
      ...(await filesUnder(join(root, 'apps'), /\.test\.ts$/)),
      ...(await filesUnder(join(root, 'e2e'), /\.ts$/)),
      ...(await filesUnder(join(root, 'scripts'), /\.test\.ts$/)),
    ];
    expect(files.length).toBeGreaterThan(30);
    const self = fileURLToPath(import.meta.url);
    const offenders: string[] = [];
    for (const file of files) {
      if (file === self) continue;
      const source = await readFile(file, 'utf8');
      if (/new\s+(S3Client|SESv2Client)\s*\(/.test(source)) offenders.push(`${relative(root, file)} constructs a real AWS client`);
    }
    expect(offenders).toEqual([]);

    // The setup file (vitest.config.ts) wraps fetch; a live host is refused before any socket opens.
    await expect(fetch('https://www.lanternfield-bank.com/offer')).rejects.toThrow(/refused www\.lanternfield-bank\.com/);
    await expect(fetch(new URL('https://web.archive.org/web/2026/'))).rejects.toThrow(/refused web\.archive\.org/);
    await expect(fetch(new Request('https://ntfy.sh/topic'))).rejects.toThrow(/refused ntfy\.sh/);
    expect(() => assertLoopback('http://127.0.0.1:3131/robots.txt')).not.toThrow();
    expect(() => assertLoopback('http://localhost:3131/')).not.toThrow();
  });

  it('(REQ-STORE-04.2) a stored snapshot holds the watched values and no raw HTML', async () => {
    const clock = manualClock(NOW);
    const html =
      '<html><head><script>track()</script><style>p{}</style></head><body><div class="ad">Buy now</div><p class="bonus"><b>$300</b> bonus</p><footer>Generated at 12:00</footer></body></html>';
    const store = new GhostStore(new MemoryBlobStore());
    const runner = new Runner({ app: appOf(), fetcher: new PageFetcher(html, clock), store, sink: new QuietSink(), clock });
    const watch = runner.watch('lantern') as ReturnType<typeof watchOf>;
    await runner.check(watch);
    const snapshot = await store.latestSnapshot('lantern');
    expect(snapshot).not.toBeNull();
    const stored = await (store.blobs as MemoryBlobStore).list('');
    expect(stored.length).toBeGreaterThan(0);
    for (const key of stored) {
      const text = (await store.blobs.get(key)) ?? '';
      expect(text, key).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(text, key).not.toContain('track()');
      expect(text, key).not.toContain('Buy now');
      expect(text, key).not.toContain('Generated at');
    }
    expect(JSON.stringify(snapshot)).toContain('30000');
  });

  it('(REQ-FETCH-03.5, REQ-DASH-04.2) a new Runner and GhostStore over the same files still honor the interval and keep the acknowledgment', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghost-restart-'));
    dirs.push(dir);
    const clock = manualClock(NOW);
    const html = '<p class="bonus">$300</p>';
    const first = new PageFetcher(html, clock);
    const store1 = new GhostStore(new FileBlobStore(dir));
    const runner1 = new Runner({ app: appOf(), fetcher: first, store: store1, sink: new QuietSink(), clock });
    const watch = runner1.watch('lantern') as ReturnType<typeof watchOf>;
    expect((await runner1.check(watch)).status).toBe('baseline');
    await store1.acknowledge('lantern', clock.now().toISOString());

    // "Restart": nothing is shared with the first process but the folder.
    const second = new PageFetcher(html, clock);
    const store2 = new GhostStore(new FileBlobStore(dir));
    const runner2 = new Runner({ app: appOf(), fetcher: second, store: store2, sink: new QuietSink(), clock });
    const result = await runner2.check(watch);
    expect(result).toMatchObject({ status: 'skipped', reason: 'interval' });
    expect(second.calls).toBe(0);
    expect((await store2.status('lantern')).acknowledgedAt).toBe(clock.now().toISOString());
    expect(await store2.unacknowledged('lantern')).toEqual([]);
  });

  it('(REQ-DASH-05.4) a ghost card is "checking" while its check runs, and quiet again after', async () => {
    const clock = manualClock(NOW);
    const fetcher = new PageFetcher('<p class="bonus">$300</p>', clock);
    let release: () => void = () => undefined;
    fetcher.gate = new Promise<void>((resolveGate) => (release = resolveGate));
    const deps = await loadDeps(appOf(), { env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console', GHOST_HOST_GAP_MS: '0' }, clock, fetcher });
    const before = await dashboardState(deps);
    expect(before.ghosts[0]?.checking).toBe(false);
    expect(renderGhostCard(before.ghosts[0] as object)).toContain('data-checking="false"');

    const pending = deps.runner.check(deps.app.watches[0] as ReturnType<typeof watchOf>, { force: true });
    const during = await dashboardState(deps);
    expect(during.ghosts[0]?.checking).toBe(true);
    expect(renderGhostCard(during.ghosts[0] as object)).toContain('data-checking="true"');

    release();
    await pending;
    const after = await dashboardState(deps);
    expect(after.ghosts[0]?.checking).toBe(false);
    expect(renderGhostCard(after.ghosts[0] as object)).toContain('data-checking="false"');
  });

  it('(REQ-DASH-07.1) the dashboard text colors keep 4.5:1 contrast against the sky of every app palette', async () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return ((hi as number) + 0.05) / ((lo as number) + 0.05);
    };
    const css = await readFile(join(root, 'template', 'src', 'ui', 'style.css'), 'utf8');
    const cssVar = (name: string) => (new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]) as string;
    const palettes: Array<{ name: string; accent: string; accent2: string; sky: string }> = [];
    const fallback = appOf().theme;
    palettes.push({ name: 'default', accent: fallback.accent, accent2: fallback.accentSecondary, sky: fallback.sky });
    for (const app of ['bonus-watch', 'listing-watch']) {
      const source = await readFile(join(root, 'apps', app, 'src', 'app.ts'), 'utf8');
      const hex = (key: string) => (new RegExp(`${key}:\\s*'(#[0-9a-fA-F]{6})'`).exec(source)?.[1]) as string;
      palettes.push({ name: app, accent: hex('accent'), accent2: hex('accentSecondary'), sky: hex('sky') });
    }
    expect(palettes).toHaveLength(3);
    for (const palette of palettes) {
      expect(palette.sky, palette.name).toMatch(/^#[0-9a-f]{6}$/i);
      const texts: Record<string, string> = {
        '--ink': cssVar('ink'),
        '--ink-dim': cssVar('ink-dim'),
        '--ink-faint': cssVar('ink-faint'),
        accent: palette.accent,
        'accent-2': palette.accent2,
      };
      for (const [label, color] of Object.entries(texts)) {
        expect(color, `${palette.name} ${label}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(ratio(color, palette.sky), `${palette.name}: ${label} on the sky`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('(REQ-FETCH-02.6) the serve startup output and the dashboard footer show the User-Agent, with the local-only token', async () => {
    const lines: string[] = [];
    let announced: () => void = () => undefined;
    const started = new Promise<void>((resolveStart) => (announced = resolveStart));
    const run = runCli(['serve'], {
      buildApp: () => appOf(),
      defaultPort: 0,
      env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console', GHOST_TICK_SECONDS: '0', GHOST_HOST_GAP_MS: '0' },
      out: (line) => {
        lines.push(line);
        if (line.startsWith('Snapshots:')) announced();
      },
    });
    await started;
    process.emit('SIGTERM');
    expect(await run).toBe(0);
    const expected = 'GhostWatcher/0.1.0 (local-only, no public contact; page-change watcher)';
    expect(lines).toContain(`User-Agent: ${expected}`);

    const deps = await loadDeps(appOf(), { env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' }, clock: manualClock(NOW) });
    const state = await dashboardState(deps);
    expect(state.app.userAgent).toBe(expected);
    expect(renderPage(state, { css: '/ui/style.css', theme: {} })).toContain(`<code>${expected}</code>`);
  });
});
