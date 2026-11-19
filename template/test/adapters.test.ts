import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderAlertMessage } from '../src/alerts/render';
import { SesEmailAlertSink, type SesLike } from '../src/alerts/ses';
import { ConsoleAlertSink, FanOutAlertSink, OutboxAlertSink, toEml } from '../src/alerts/sinks';
import type { Alert, AlertSink } from '../src/alerts/types';
import { ConfigError, loadDeps } from '../src/config';
import { defineApp } from '../src/app';
import { FileBlobStore, MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { S3BlobStore, type S3Like } from '../src/store/s3';
import { defineWatch } from '../src/watch';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ghost-watcher-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const alert = (summary: string, severity: Alert['severity'] = 'moan'): Alert => ({
  id: `a-${summary.length}`,
  watchId: 'lantern',
  watchName: 'Lanternfield <Checking>',
  url: 'https://example.com/offer',
  createdAt: '2026-10-31T12:00:00.000Z',
  severity,
  ruleKind: 'wentUp',
  ruleLabel: 'Bonus goes up',
  summary,
});

const message = () =>
  renderAlertMessage({
    appName: 'The Bonus Crypt',
    to: ['bonus.hunter@example.com'],
    watch: { id: 'lantern', name: 'Lanternfield <Checking>', url: 'https://example.com/offer' },
    alerts: [alert('Bonus went up from $300 to $400 (+$100).', 'shriek'), alert('Deadline moved.')],
    createdAt: '2026-10-31T12:00:00.000Z',
    footer: 'Not financial advice.',
  });

describe('blob stores', () => {
  for (const [name, make] of [
    ['memory', () => new MemoryBlobStore()],
    ['file', () => new FileBlobStore(join(dir, 'store'))],
  ] as const) {
    it(`${name}: put, get, list by prefix, delete`, async () => {
      const store = make();
      await store.put('snapshots/a/latest.json', '{"a":1}');
      await store.put('snapshots/b/latest.json', '{"b":1}');
      await store.put('status/a.json', '{}');
      expect(await store.get('snapshots/a/latest.json')).toBe('{"a":1}');
      expect(await store.get('missing.json')).toBeNull();
      expect(await store.list('snapshots/')).toEqual(['snapshots/a/latest.json', 'snapshots/b/latest.json']);
      await store.delete('status/a.json');
      expect(await store.list('status/')).toEqual([]);
    });
  }

  it('rejects keys that try to escape the store', async () => {
    const store = new FileBlobStore(join(dir, 'store'));
    await expect(store.put('../outside.json', 'x')).rejects.toThrow(/Invalid storage key/);
  });
});

describe('GhostStore', () => {
  it('keeps a bounded snapshot history, newest first', async () => {
    const store = new GhostStore(new MemoryBlobStore(), { historyLimit: 3 });
    for (let i = 1; i <= 5; i += 1) {
      await store.saveSnapshot({ watchId: 'w', url: 'https://example.com', takenAt: `2026-10-0${i}T00:00:00.000Z`, fields: {}, lists: {} });
    }
    const history = await store.history('w', 10);
    expect(history.map((s) => s.takenAt.slice(0, 10))).toEqual(['2026-10-05', '2026-10-04', '2026-10-03']);
    expect((await store.latestSnapshot('w'))?.takenAt).toContain('2026-10-05');
  });

  it('tracks unacknowledged alerts until the ghost is laid to rest', async () => {
    const store = new GhostStore(new MemoryBlobStore());
    await store.appendAlerts('lantern', [alert('one'), alert('three!')]);
    expect(await store.unacknowledged('lantern')).toHaveLength(2);
    await store.acknowledge('lantern', '2026-10-31T12:00:01.000Z');
    expect(await store.unacknowledged('lantern')).toHaveLength(0);
    expect(await store.alerts('lantern')).toHaveLength(2);
  });
});

describe('alert rendering and sinks', () => {
  it('renders a subject, plain text and escaped HTML', () => {
    const m = message();
    expect(m.subject).toBe('[!] Lanternfield <Checking>: 2 changes');
    expect(m.text).toContain('- [Shriek] Bonus went up from $300 to $400 (+$100).');
    expect(m.html).toContain('Lanternfield &lt;Checking&gt;');
    expect(m.html).not.toContain('<Checking>');
    expect(m.html).toContain('Not financial advice.');
  });

  it('the outbox writes an index line, an .eml file and an HTML preview', async () => {
    const outbox = new OutboxAlertSink(join(dir, 'outbox'));
    const receipt = await outbox.deliver(message());
    const files = (await readdir(join(dir, 'outbox'))).sort();
    expect(files).toEqual([`${receipt.reference}.eml`, `${receipt.reference}.html`, 'outbox.jsonl']);
    const [entry] = await outbox.entries();
    expect(entry?.summaries).toHaveLength(2);
    const eml = await readFile(join(dir, 'outbox', `${receipt.reference}.eml`), 'utf8');
    expect(eml).toContain('To: bonus.hunter@example.com');
    expect(eml).toContain('Content-Type: multipart/alternative');
  });

  it('encodes non-ASCII subjects in .eml files', () => {
    const eml = toEml({ ...message(), subject: 'Séance: bonus up' });
    expect(eml).toContain('Subject: =?UTF-8?B?');
  });

  it('fans out to several sinks and survives one failing', async () => {
    const lines: string[] = [];
    const broken: AlertSink = { channel: 'broken', deliver: async () => Promise.reject(new Error('down')) };
    const fan = new FanOutAlertSink([broken, new ConsoleAlertSink((line) => lines.push(line))]);
    expect((await fan.deliver(message())).channel).toBe('broken+console');
    expect(lines.join('\n')).toContain('Bonus went up');
    await expect(new FanOutAlertSink([broken]).deliver(message())).rejects.toThrow('down');
  });

  it('the SES adapter builds a SendEmail request without sending anything real', async () => {
    const sent: unknown[] = [];
    const client: SesLike = { send: (async (command: { input: unknown }) => {
      sent.push(command.input);
      return { MessageId: 'fake-123' };
    }) as unknown as SesLike['send'] };
    const sink = new SesEmailAlertSink({ from: 'Ghost Watcher <alerts@example.com>', client });
    const receipt = await sink.deliver(message());
    expect(receipt).toEqual({ channel: 'ses', reference: 'fake-123' });
    expect(sent[0]).toMatchObject({
      FromEmailAddress: 'Ghost Watcher <alerts@example.com>',
      Destination: { ToAddresses: ['bonus.hunter@example.com'] },
      Content: { Simple: { Subject: { Data: '[!] Lanternfield <Checking>: 2 changes' } } },
    });
    expect(() => sink.buildCommand({ ...message(), to: [] })).toThrow(/recipient/);
  });

  it('the S3 adapter maps keys under a prefix (fake client)', async () => {
    const objects = new Map<string, string>();
    const client: S3Like = {
      send: (async (command: { constructor: { name: string }; input: { Key?: string; Body?: string; Prefix?: string } }) => {
        const name = command.constructor.name;
        if (name === 'PutObjectCommand') objects.set(command.input.Key ?? '', command.input.Body ?? '');
        if (name === 'GetObjectCommand') {
          const body = objects.get(command.input.Key ?? '');
          if (body === undefined) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
          return { Body: { transformToString: async () => body } };
        }
        if (name === 'ListObjectsV2Command') {
          return { Contents: [...objects.keys()].filter((k) => k.startsWith(command.input.Prefix ?? '')).map((Key) => ({ Key })), IsTruncated: false };
        }
        if (name === 'DeleteObjectCommand') objects.delete(command.input.Key ?? '');
        return {};
      }) as unknown as S3Like['send'],
    };
    const store = new S3BlobStore({ bucket: 'ghosts', prefix: 'bonus/', client });
    await store.put('status/a.json', '{}');
    expect([...objects.keys()]).toEqual(['bonus/status/a.json']);
    expect(await store.get('status/a.json')).toBe('{}');
    expect(await store.get('status/b.json')).toBeNull();
    expect(await store.list('status/')).toEqual(['status/a.json']);
    await store.delete('status/a.json');
    expect(objects.size).toBe(0);
  });
});

describe('configuration', () => {
  const app = defineApp({
    id: 'demo',
    name: 'Demo',
    tagline: 'Demo app',
    version: '0.1.0',
    alertTo: ['someone@example.com'],
    copy: { watchNoun: 'pages', quiet: 'Quiet.' },
    watches: [defineWatch({ id: 'w', name: 'W', url: 'https://example.com', fields: [{ name: 'a', selector: 'a', kind: 'text' }], rules: [] })],
  });

  it('defaults to local files and the outbox', async () => {
    const deps = await loadDeps(app, { env: { GHOST_DATA_DIR: dir } });
    expect(deps.describe.alerts).toBe('outbox');
    expect(deps.describe.store).toMatch(/^local files/);
    expect(deps.outbox?.dir).toBe(join(dir, 'outbox'));
    expect(deps.describe.userAgent).toBe('GhostWatcher/0.1.0 (local-only, no public contact; page-change watcher)');
  });

  it('applies interval, recipient and contact overrides', async () => {
    const deps = await loadDeps(app, {
      env: { GHOST_DATA_DIR: dir, GHOST_INTERVAL_MINUTES: '30', GHOST_ALERT_TO: 'a@example.com, b@example.com', GHOST_CONTACT_URL: 'https://stubborn-otter.dev/me', GHOST_STORE: 'memory', GHOST_ALERTS: 'outbox,console' },
    });
    expect(deps.app.watches[0]?.intervalMs).toBe(30 * 60_000);
    expect(deps.app.alertTo).toEqual(['a@example.com', 'b@example.com']);
    expect(deps.describe.userAgent).toContain('+https://stubborn-otter.dev/me');
    expect(deps.describe.alerts).toBe('outbox + console');
  });

  it('explains what cloud adapters need instead of failing later', async () => {
    await expect(loadDeps(app, { env: { GHOST_DATA_DIR: dir, GHOST_STORE: 's3' } })).rejects.toThrow(ConfigError);
    await expect(loadDeps(app, { env: { GHOST_DATA_DIR: dir, GHOST_ALERTS: 'ses' } })).rejects.toThrow(/GHOST_SES_FROM/);
    await expect(loadDeps(app, { env: { GHOST_DATA_DIR: dir, GHOST_ALERTS: 'pigeon' } })).rejects.toThrow(/outbox, console or ses/);
    await expect(loadDeps(app, { env: { GHOST_DATA_DIR: dir, GHOST_INTERVAL_MINUTES: '-5' } })).rejects.toThrow(/non-negative/);
  });

  it('wires the real cloud adapters when selected (constructed, never called)', async () => {
    const deps = await loadDeps(app, {
      env: { GHOST_DATA_DIR: dir, GHOST_STORE: 's3', GHOST_S3_BUCKET: 'example-bucket', GHOST_ALERTS: 'ses', GHOST_SES_FROM: 'alerts@example.com', AWS_REGION: 'us-east-1' },
    });
    expect(deps.describe.store).toBe('s3 (s3://example-bucket/ghost-watcher/demo/)');
    expect(deps.sink.channel).toBe('ses');
    expect(deps.store.blobs).toBeInstanceOf(S3BlobStore);
  });
});
