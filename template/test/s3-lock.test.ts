import { describe, expect, it } from 'vitest';
import { manualClock } from '../src/clock';
import { loadDeps } from '../src/config';
import { defineApp } from '../src/app';
import { PactLockError, PactRoutingBlobStore, S3ObjectLockBlobStore } from '../src/store/s3-lock';
import type { S3Like } from '../src/store/s3';
import { PACT_VERSION, type PactRecord } from '../src/pact';
import { snapshotSha256 } from '../src/receipts';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { fakeS3, money, snapshot, text } from './pact-support';

type Sent = { name: string; input: Record<string, unknown> };

/** A fake S3 client that records each command and keeps put objects in memory. */
function recordingS3() {
  const sent: Sent[] = [];
  const inner = fakeS3();
  const client: S3Like = {
    send: (async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      return inner.client.send(command as never);
    }) as unknown as S3Like['send'],
  };
  return { client, sent, objects: inner.objects };
}

const clock = manualClock('2026-11-19T03:00:00Z');
/** A hash-named pact snapshot document, the kind of key the locked bucket holds. */
const SNAP = `pacts/lantern/${'a'.repeat(64)}.json`;

function lockStore(retentionDays = 365) {
  const s3 = recordingS3();
  let built = 0;
  const store = new S3ObjectLockBlobStore({
    bucket: 'example-pacts',
    prefix: 'ghost/',
    retentionDays,
    clock,
    clientFactory: () => {
      built += 1;
      return s3.client;
    },
  });
  return { store, s3, built: () => built };
}

describe('S3ObjectLockBlobStore', () => {
  it('(AWS 3.1) a pact write carries COMPLIANCE mode', async () => {
    const { store, s3 } = lockStore();
    await store.put(SNAP, '{}');
    const put = s3.sent.find((c) => c.name === 'PutObjectCommand');
    expect(put?.input).toMatchObject({ Bucket: 'example-pacts', Key: `ghost/${SNAP}`, ObjectLockMode: 'COMPLIANCE' });
  });

  it('(AWS 3.2) the retain-until date is the injected clock plus the retention days', async () => {
    const { store, s3 } = lockStore(30);
    await store.put(SNAP, '{}');
    const put = s3.sent.find((c) => c.name === 'PutObjectCommand');
    expect((put?.input.ObjectLockRetainUntilDate as Date).toISOString()).toBe('2026-12-19T03:00:00.000Z');
  });

  it('(AWS 3.3) overwriting a sealed snapshot with other bytes is refused and sends no second PutObject', async () => {
    const { store, s3 } = lockStore();
    await store.put(SNAP, '{"a":1}');
    await expect(store.put(SNAP, '{"a":2}')).rejects.toThrow(PactLockError);
    await store.put(SNAP, '{"a":1}');
    expect(s3.sent.filter((c) => c.name === 'PutObjectCommand')).toHaveLength(1);
    expect(await store.get(SNAP)).toBe('{"a":1}');
  });

  it('(AWS 3.4) every pact write asks the service not to replace an existing object', async () => {
    const { store, s3 } = lockStore();
    await store.put(SNAP, '{}');
    expect(s3.sent.find((c) => c.name === 'PutObjectCommand')?.input.IfNoneMatch).toBe('*');
  });

  it('(AWS 3.5) a delete of a sealed snapshot sends no DeleteObject and leaves it readable', async () => {
    const { store, s3 } = lockStore();
    await store.put(SNAP, '{}');
    await store.delete(SNAP);
    expect(s3.sent.some((c) => c.name === 'DeleteObjectCommand')).toBe(false);
    expect(await store.get(SNAP)).toBe('{}');
  });

  it('(AWS 3.6) the pact record and keys outside pacts/ go to the ordinary store with no lock parameters', async () => {
    const plain = recordingS3();
    const lock = lockStore();
    const { S3BlobStore } = await import('../src/store/s3');
    const routed = new PactRoutingBlobStore(new S3BlobStore({ bucket: 'example-data', client: plain.client }), lock.store);
    await routed.put('status/lantern.json', '{}');
    await routed.put('pacts/lantern/pact.json', '{}');
    await routed.put(SNAP, '{}');
    const plainPuts = plain.sent.filter((c) => c.name === 'PutObjectCommand');
    expect(plainPuts.map((c) => c.input.Key)).toEqual(['status/lantern.json', 'pacts/lantern/pact.json']);
    expect(plainPuts.every((c) => c.input.ObjectLockMode === undefined)).toBe(true);
    expect(lock.s3.sent.filter((c) => c.name === 'PutObjectCommand').map((c) => c.input.Key)).toEqual([`ghost/${SNAP}`]);
    expect(await routed.list('')).toEqual([SNAP, 'pacts/lantern/pact.json', 'status/lantern.json'].sort());
  });

  it('(AWS 3.7) the client factory runs on first use, not at construction', async () => {
    const { store, built } = lockStore();
    expect(built()).toBe(0);
    await store.get(SNAP);
    await store.get(SNAP);
    expect(built()).toBe(1);
  });

  it('(AWS 3.9) a retention of zero or a fraction is refused', () => {
    for (const retentionDays of [0, 1.5, -2]) {
      expect(() => new S3ObjectLockBlobStore({ bucket: 'b', retentionDays, clock })).toThrow(/whole number of days/);
    }
  });
});

describe('GhostStore on the locked bucket', () => {
  function recordFor(snap: ReturnType<typeof snapshot>, sealedAt: string): PactRecord {
    return {
      version: PACT_VERSION,
      watchId: 'lantern',
      watchName: 'Lanternfield Everyday Checking',
      url: snap.url,
      sealedAt,
      snapshotTakenAt: snap.takenAt,
      sha256: snapshotSha256(snap),
      archive: { archiveUrl: null, archivedAt: null, archivedBy: null, note: 'Archiving is off; the snapshot hash is the pact.' },
    };
  }

  it('(AWS 3.10) sealing, the posted mark, a replacement and a broken pact all work, and every sealed snapshot stays locked', async () => {
    const lock = lockStore();
    const store = new GhostStore(new PactRoutingBlobStore(new MemoryBlobStore(), lock.store));
    const first = snapshot('2026-10-10T09:00:00.000Z', { bonus: money('$400'), terms: text('Open within 30 days.') });
    const firstRecord = recordFor(first, '2026-10-10T14:15:02.000Z');
    await store.savePact(firstRecord, first);
    expect(await store.markBonusPosted('lantern', '2026-11-01T12:00:00.000Z')).toMatchObject({ bonusPostedAt: '2026-11-01T12:00:00.000Z' });

    const later = snapshot('2026-11-19T09:00:00.000Z', { bonus: money('$300'), terms: text('Open within 30 days.') });
    await store.savePact(recordFor(later, '2026-11-19T10:00:00.000Z'), later);
    const reading = await store.pact('lantern');
    expect(reading.status === 'sealed' && reading.pact.sha256).toBe(snapshotSha256(later));

    expect(await store.deletePact('lantern')).toBe(true);
    expect(await store.pactRecord('lantern')).toMatchObject({ status: 'none' });

    const lockedKeys = lock.s3.sent.filter((c) => c.name === 'PutObjectCommand').map((c) => c.input.Key);
    expect(lockedKeys).toEqual([`ghost/pacts/lantern/${firstRecord.sha256}.json`, `ghost/pacts/lantern/${snapshotSha256(later)}.json`]);
    expect(lock.s3.sent.some((c) => c.name === 'DeleteObjectCommand')).toBe(false);
    expect(await lock.store.get(`pacts/lantern/${firstRecord.sha256}.json`)).not.toBeNull();
  });
});

describe('loadDeps with a pact bucket', () => {
  const app = defineApp({
    id: 'test-app',
    name: 'Test Crypt',
    tagline: 'Testing',
    version: '0.1.0',
    alertTo: ['tester@example.com'],
    copy: { watchNoun: 'pages', quiet: 'Quiet.' },
    watches: [],
  });

  it('(AWS 3.8) routes pacts to the locked bucket through the injected client', async () => {
    const data = recordingS3();
    const locked = recordingS3();
    const deps = await loadDeps(app, {
      clock,
      env: { GHOST_STORE: 's3', GHOST_S3_BUCKET: 'example-data', GHOST_PACT_BUCKET: 'example-pacts', GHOST_PACT_RETENTION_DAYS: '10', GHOST_DATA_DIR: '/tmp/ghost-lock-test' },
      clients: { s3: data.client, s3Lock: locked.client },
    });
    await deps.store.blobs.put(SNAP, '{}');
    const put = locked.sent.find((c) => c.name === 'PutObjectCommand');
    expect(put?.input).toMatchObject({ Bucket: 'example-pacts', ObjectLockMode: 'COMPLIANCE' });
    expect((put?.input.ObjectLockRetainUntilDate as Date).toISOString()).toBe('2026-11-29T03:00:00.000Z');
    expect(data.sent.some((c) => c.name === 'PutObjectCommand')).toBe(false);
    expect(deps.describe.store).toContain('locked');
  });

  it('(AWS 3.9) a bad retention in the environment is a configuration error', async () => {
    await expect(
      loadDeps(app, { clock, env: { GHOST_STORE: 's3', GHOST_S3_BUCKET: 'd', GHOST_PACT_BUCKET: 'p', GHOST_PACT_RETENTION_DAYS: '0', GHOST_DATA_DIR: '/tmp/ghost-lock-test' }, clients: { s3: recordingS3().client } }),
    ).rejects.toThrow(/whole number of days/);
  });
});
