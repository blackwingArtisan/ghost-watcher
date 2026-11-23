import { describe, expect, it } from 'vitest';
import { manualClock } from '../src/clock';
import { loadDeps } from '../src/config';
import { defineApp } from '../src/app';
import { PactLockError, PactRoutingBlobStore, S3ObjectLockBlobStore } from '../src/store/s3-lock';
import type { S3Like } from '../src/store/s3';
import { fakeS3 } from './pact-support';

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
    await store.put('pacts/lantern/pact.json', '{}');
    const put = s3.sent.find((c) => c.name === 'PutObjectCommand');
    expect(put?.input).toMatchObject({ Bucket: 'example-pacts', Key: 'ghost/pacts/lantern/pact.json', ObjectLockMode: 'COMPLIANCE' });
  });

  it('(AWS 3.2) the retain-until date is the injected clock plus the retention days', async () => {
    const { store, s3 } = lockStore(30);
    await store.put('pacts/lantern/pact.json', '{}');
    const put = s3.sent.find((c) => c.name === 'PutObjectCommand');
    expect((put?.input.ObjectLockRetainUntilDate as Date).toISOString()).toBe('2026-12-19T03:00:00.000Z');
  });

  it('(AWS 3.3) overwriting a pact is refused and sends no second PutObject', async () => {
    const { store, s3 } = lockStore();
    await store.put('pacts/lantern/pact.json', '{"a":1}');
    await expect(store.put('pacts/lantern/pact.json', '{"a":2}')).rejects.toThrow(PactLockError);
    expect(s3.sent.filter((c) => c.name === 'PutObjectCommand')).toHaveLength(1);
    expect(await store.get('pacts/lantern/pact.json')).toBe('{"a":1}');
  });

  it('(AWS 3.4) every pact write asks the service not to replace an existing object', async () => {
    const { store, s3 } = lockStore();
    await store.put('pacts/lantern/pact.json', '{}');
    expect(s3.sent.find((c) => c.name === 'PutObjectCommand')?.input.IfNoneMatch).toBe('*');
  });

  it('(AWS 3.5) deleting a pact is refused and sends no DeleteObject', async () => {
    const { store, s3 } = lockStore();
    await store.put('pacts/lantern/pact.json', '{}');
    await expect(store.delete('pacts/lantern/pact.json')).rejects.toThrow(PactLockError);
    expect(s3.sent.some((c) => c.name === 'DeleteObjectCommand')).toBe(false);
  });

  it('(AWS 3.6) keys outside pacts/ go to the ordinary store with no lock parameters', async () => {
    const plain = recordingS3();
    const lock = lockStore();
    const { S3BlobStore } = await import('../src/store/s3');
    const routed = new PactRoutingBlobStore(new S3BlobStore({ bucket: 'example-data', client: plain.client }), lock.store);
    await routed.put('status/lantern.json', '{}');
    await routed.put('pacts/lantern/pact.json', '{}');
    const plainPut = plain.sent.find((c) => c.name === 'PutObjectCommand');
    expect(plainPut?.input.ObjectLockMode).toBeUndefined();
    expect(plainPut?.input.Key).toBe('status/lantern.json');
    expect(lock.s3.sent.filter((c) => c.name === 'PutObjectCommand')).toHaveLength(1);
    expect(await routed.list('')).toEqual(['pacts/lantern/pact.json', 'status/lantern.json']);
  });

  it('(AWS 3.7) the client factory runs on first use, not at construction', async () => {
    const { store, built } = lockStore();
    expect(built()).toBe(0);
    await store.get('pacts/lantern/pact.json');
    await store.get('pacts/lantern/pact.json');
    expect(built()).toBe(1);
  });

  it('(AWS 3.9) a retention of zero or a fraction is refused', () => {
    for (const retentionDays of [0, 1.5, -2]) {
      expect(() => new S3ObjectLockBlobStore({ bucket: 'b', retentionDays, clock })).toThrow(/whole number of days/);
    }
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
    await deps.store.blobs.put('pacts/lantern/pact.json', '{}');
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
