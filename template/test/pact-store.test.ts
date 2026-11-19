import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PACT_VERSION, type PactRecord } from '../src/pact';
import { serializeJson, sha256Hex, snapshotSha256 } from '../src/receipts';
import { FileBlobStore, MemoryBlobStore, type BlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { S3BlobStore } from '../src/store/s3';
import { fakeS3, money, snapshot, text } from './pact-support';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ghost-pact-store-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sealed = snapshot('2026-10-10T09:00:00.000Z', { bonus: money('$400'), terms: text('Open within 30 days.') });

function recordFor(snap = sealed, overrides: Partial<PactRecord> = {}): PactRecord {
  return {
    version: PACT_VERSION,
    watchId: 'lantern',
    watchName: 'Lanternfield Everyday Checking',
    url: snap.url,
    sealedAt: '2026-10-10T14:15:02.000Z',
    snapshotTakenAt: snap.takenAt,
    sha256: snapshotSha256(snap),
    archive: { archiveUrl: null, archivedAt: null, archivedBy: null, note: 'Archiving is off; the snapshot hash is the pact.' },
    ...overrides,
  };
}

const PACT_KEY = 'pacts/lantern/pact.json';

describe('pact storage round trip', () => {
  it('(PACT 3.1) (PACT 3.2) keeps pact.json and a hash-named snapshot document on a memory store', async () => {
    const blobs = new MemoryBlobStore();
    const store = new GhostStore(blobs);
    const record = recordFor();
    await store.savePact(record, sealed);

    expect(await blobs.list('pacts/')).toEqual([PACT_KEY, `pacts/lantern/${record.sha256}.json`].sort());
    const document = (await blobs.get(`pacts/lantern/${record.sha256}.json`)) as string;
    expect(document).toBe(serializeJson(sealed));
    expect(createHash('sha256').update(document, 'utf8').digest('hex')).toBe(record.sha256);

    const reading = await store.pact('lantern');
    expect(reading).toEqual({ status: 'sealed', pact: { ...record, snapshot: sealed } });
    expect(await store.pactRecord('lantern')).toEqual({ status: 'sealed', record });
  });

  it('(PACT 3.2) (PACT 3.3) the file on disk hashes to the record, and a new GhostStore reads back an identical pact', async () => {
    const root = join(dir, 'store');
    const record = recordFor();
    await new GhostStore(new FileBlobStore(root)).savePact(record, sealed);

    const file = await readFile(join(root, 'pacts', 'lantern', `${record.sha256}.json`), 'utf8');
    expect(sha256Hex(file)).toBe(record.sha256);
    expect(await readdir(join(root, 'pacts', 'lantern'))).toHaveLength(2);

    const reopened = new GhostStore(new FileBlobStore(root));
    expect(await reopened.pact('lantern')).toEqual({ status: 'sealed', pact: { ...record, snapshot: sealed } });
  });

  it('(PACT 3.4) reads back an identical pact through S3BlobStore with a fake client', async () => {
    const { client, objects } = fakeS3();
    const record = recordFor();
    await new GhostStore(new S3BlobStore({ bucket: 'ghosts', prefix: 'bonus/', client })).savePact(record, sealed);
    expect([...objects.keys()].sort()).toEqual([`bonus/${PACT_KEY}`, `bonus/pacts/lantern/${record.sha256}.json`].sort());

    const reopened = new GhostStore(new S3BlobStore({ bucket: 'ghosts', prefix: 'bonus/', client }));
    expect(await reopened.pact('lantern')).toEqual({ status: 'sealed', pact: { ...record, snapshot: sealed } });
  });

  it('(PACT 2.4) (PACT 2.5) a replacement leaves one snapshot document, and a delete removes them all', async () => {
    const blobs = new MemoryBlobStore();
    const store = new GhostStore(blobs);
    await store.savePact(recordFor(), sealed);
    const later = snapshot('2026-11-19T09:00:00.000Z', { bonus: money('$300'), terms: text('Open within 30 days.') });
    const replacement = recordFor(later, { sealedAt: '2026-11-19T10:00:00.000Z' });
    await store.savePact(replacement, later);

    expect(await blobs.list('pacts/lantern/')).toEqual([PACT_KEY, `pacts/lantern/${replacement.sha256}.json`].sort());
    expect(await store.deletePact('lantern')).toBe(true);
    expect(await blobs.list('pacts/')).toEqual([]);
    expect(await store.deletePact('lantern')).toBe(false);
    expect(await store.pact('lantern')).toEqual({ status: 'none' });
  });

  it('(PACT 3.1) refuses to save a record whose hash is not the snapshot hash', async () => {
    const store = new GhostStore(new MemoryBlobStore());
    await expect(store.savePact(recordFor(sealed, { sha256: 'a'.repeat(64) }), sealed)).rejects.toThrow(/does not match/);
  });

  it('(PACT 3.1) keeps one watch pact apart from another whose id starts the same way', async () => {
    const store = new GhostStore(new MemoryBlobStore());
    const other = snapshot('2026-10-10T09:00:00.000Z', { bonus: money('$100') }, 'lantern-plus');
    await store.savePact(recordFor(), sealed);
    await store.savePact(recordFor(other, { watchId: 'lantern-plus' }), other);
    await store.deletePact('lantern');
    expect((await store.pact('lantern-plus')).status).toBe('sealed');
  });
});

describe('pact and the rest of the store', () => {
  it('(PACT 3.5) history pruning keeps the pact snapshot', async () => {
    const blobs = new MemoryBlobStore();
    const store = new GhostStore(blobs, { historyLimit: 2 });
    const record = recordFor();
    await store.savePact(record, sealed);
    for (let day = 1; day <= 6; day += 1) {
      await store.saveSnapshot(snapshot(`2026-10-1${day}T09:00:00.000Z`, { bonus: money(`$${300 + day}`) }));
    }
    expect(await blobs.list('snapshots/lantern/history/')).toHaveLength(2);
    expect((await store.pact('lantern')).status).toBe('sealed');
  });

  it('(PACT 3.6) clear removes every pact', async () => {
    const blobs = new MemoryBlobStore();
    const store = new GhostStore(blobs);
    await store.savePact(recordFor(), sealed);
    const other = snapshot('2026-10-10T09:00:00.000Z', { bonus: money('$100') }, 'mossgate');
    await store.savePact(recordFor(other, { watchId: 'mossgate' }), other);
    await store.clear();
    expect(await blobs.list('pacts/')).toEqual([]);
    expect(await store.pact('lantern')).toEqual({ status: 'none' });
  });

  it('(PACT 3.7) upgrades a legacy decimal money value after checking the hash on the stored bytes', async () => {
    const blobs = new MemoryBlobStore();
    const store = new GhostStore(blobs);
    const legacy = {
      watchId: 'lantern',
      url: 'http://127.0.0.1:9/offer',
      takenAt: '2026-10-10T09:00:00.000Z',
      fields: { fee: { kind: 'money', value: 4.35, currency: 'USD', display: '$4.35' } },
      lists: {},
    };
    const bytes = serializeJson(legacy);
    const record = recordFor(sealed, { sha256: sha256Hex(bytes) });
    await blobs.put(PACT_KEY, serializeJson(record));
    await blobs.put(`pacts/lantern/${record.sha256}.json`, bytes);

    const reading = await store.pact('lantern');
    expect(reading.status).toBe('sealed');
    if (reading.status === 'sealed') {
      expect(reading.pact.snapshot.fields.fee).toEqual({ kind: 'money', amountMinor: 435, currency: 'USD', display: '$4.35' });
      expect(reading.pact.sha256).toBe(sha256Hex(bytes));
    }
  });
});

describe('a corrupt or unreadable pact', () => {
  async function stored(): Promise<{ blobs: BlobStore; store: GhostStore; record: PactRecord }> {
    const blobs = new MemoryBlobStore();
    const store = new GhostStore(blobs);
    const record = recordFor();
    await store.savePact(record, sealed);
    return { blobs, store, record };
  }

  it('(PACT 4.1) pact.json that is not JSON is corrupt with a reason, and nothing throws', async () => {
    const { blobs, store } = await stored();
    await blobs.put(PACT_KEY, '{ not json');
    for (const reading of [await store.pact('lantern'), await store.pactRecord('lantern')]) {
      expect(reading).toMatchObject({ status: 'corrupt', reason: expect.stringContaining('not valid JSON') });
    }
  });

  it('(PACT 4.1) pact.json missing a required field is corrupt', async () => {
    const { blobs, store, record } = await stored();
    const { sealedAt: _omitted, ...incomplete } = record;
    await blobs.put(PACT_KEY, serializeJson(incomplete));
    expect(await store.pact('lantern')).toEqual({ status: 'corrupt', reason: 'the pact record lacks "sealedAt"' });
    await blobs.put(PACT_KEY, serializeJson({ ...record, archive: { archiveUrl: 7 } }));
    expect((await store.pact('lantern')).status).toBe('corrupt');
    await blobs.put(PACT_KEY, serializeJson({ ...record, sha256: '../../etc/passwd' }));
    expect((await store.pact('lantern')).status).toBe('corrupt');
    await blobs.put(PACT_KEY, serializeJson({ ...record, watchId: 'someone-else' }));
    expect((await store.pact('lantern')).status).toBe('corrupt');
  });

  it('(PACT 4.2) a missing snapshot document is corrupt, though the record still reads', async () => {
    const { blobs, store, record } = await stored();
    await blobs.delete(`pacts/lantern/${record.sha256}.json`);
    expect(await store.pact('lantern')).toEqual({ status: 'corrupt', reason: 'the pact snapshot is missing' });
    expect((await store.pactRecord('lantern')).status).toBe('sealed');
  });

  it('(PACT 4.3) one flipped byte in the snapshot document is corrupt', async () => {
    const { blobs, store, record } = await stored();
    const key = `pacts/lantern/${record.sha256}.json`;
    const original = (await blobs.get(key)) as string;
    await blobs.put(key, original.replace('$400', '$401'));
    expect(await store.pact('lantern')).toEqual({ status: 'corrupt', reason: 'the pact snapshot does not match its SHA-256' });
  });

  it('(PACT 4.1) a snapshot document with the right hash but the wrong shape is corrupt', async () => {
    const { blobs, store, record } = await stored();
    const bytes = serializeJson({ hello: 'world' });
    await blobs.put(`pacts/lantern/${sha256Hex(bytes)}.json`, bytes);
    await blobs.put(PACT_KEY, serializeJson({ ...record, sha256: sha256Hex(bytes) }));
    expect(await store.pact('lantern')).toEqual({ status: 'corrupt', reason: 'the pact snapshot has the wrong shape' });
  });

  it('(PACT 4.6) deletePact removes every document under the pact path, readable or not', async () => {
    const { blobs, store } = await stored();
    await blobs.put(PACT_KEY, '{ not json');
    await blobs.put('pacts/lantern/orphan.json', '{}');
    expect(await store.deletePact('lantern')).toBe(true);
    expect(await blobs.list('pacts/lantern/')).toEqual([]);
  });
});
