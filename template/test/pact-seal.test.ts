import { describe, expect, it } from 'vitest';
import { manualClock } from '../src/clock';
import { snapshotSha256 } from '../src/receipts';
import { breakPact, sealPact } from '../src/sealing';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { failingArchiver, failingPuts, money, savingArchiver, snapshot } from './pact-support';

const watch = { id: 'lantern', name: 'Lanternfield Everyday Checking' };
const PACT_KEY = 'pacts/lantern/pact.json';

async function setup(options: { archive?: ReturnType<typeof savingArchiver>; withSnapshot?: boolean } = {}) {
  const clock = manualClock('2026-10-10T14:15:02.000Z');
  const inner = new MemoryBlobStore();
  const blobs = failingPuts(inner, (key) => key === PACT_KEY);
  const store = new GhostStore(blobs);
  const first = snapshot('2026-10-10T09:00:00.000Z', { bonus: money('$400') });
  if (options.withSnapshot !== false) await store.saveSnapshot(first);
  const deps = { store, clock, ...(options.archive ? { archive: options.archive } : {}) };
  return { clock, blobs, store, deps, first };
}

describe('sealPact', () => {
  it('(PACT 1.1) (PACT 1.2) (PACT 1.3) (PACT 1.8) seals the latest snapshot unchanged, with its hash, the clock time and its age', async () => {
    const { deps, store, first } = await setup();
    const result = await sealPact(deps, watch);
    expect(result.status).toBe('sealed');
    if (result.status !== 'sealed') return;
    expect(result.replaced).toBe(false);
    expect(result.pact.snapshot).toEqual(first);
    expect(result.pact.sha256).toBe(snapshotSha256(first));
    expect(result.pact.sealedAt).toBe('2026-10-10T14:15:02.000Z');
    expect(result.pact.snapshotTakenAt).toBe('2026-10-10T09:00:00.000Z');
    expect(result.pact).toMatchObject({ watchId: 'lantern', watchName: watch.name, url: first.url });
    expect(await store.pact('lantern')).toEqual({ status: 'sealed', pact: result.pact });
  });

  it('(PACT 1.2) takes the sealed time from the clock, not from the machine', async () => {
    const { deps, clock } = await setup();
    clock.set('2031-02-03T04:05:06.000Z');
    const result = await sealPact(deps, watch);
    expect(result.status === 'sealed' && result.pact.sealedAt).toBe('2031-02-03T04:05:06.000Z');
  });

  it('(PACT 1.4) asks the archiver once for the watch URL and records its answer and label', async () => {
    const archive = savingArchiver('the stand-in Wayback Machine');
    const { deps, first } = await setup({ archive });
    const result = await sealPact(deps, watch);
    expect(archive.calls).toEqual([first.url]);
    expect(result.status === 'sealed' && result.pact.archive).toEqual({
      archiveUrl: `https://archive.test/web/20261118120100/${first.url}`,
      archivedAt: '2026-11-18T12:01:00Z',
      archivedBy: 'the stand-in Wayback Machine',
    });
  });

  it('(PACT 1.5) with no archiver seals with the hash only and says so', async () => {
    const { deps } = await setup();
    const result = await sealPact(deps, watch);
    expect(result.status === 'sealed' && result.pact.archive).toEqual({
      archiveUrl: null,
      archivedAt: null,
      archivedBy: null,
      note: 'Archiving is off; the snapshot hash is the pact.',
    });
  });

  it('(PACT 1.6) an archiver that fails still seals the pact, with a note', async () => {
    const archive = failingArchiver('the Internet Archive', 'the archive asked us to slow down (HTTP 429)');
    const { deps, store } = await setup({ archive });
    const result = await sealPact(deps, watch);
    expect(archive.calls).toHaveLength(1);
    expect(result.status).toBe('sealed');
    expect(result.status === 'sealed' && result.pact.archive).toEqual({
      archiveUrl: null,
      archivedAt: null,
      archivedBy: null,
      note: 'Could not reach the Internet Archive: the archive asked us to slow down (HTTP 429)',
    });
    expect((await store.pact('lantern')).status).toBe('sealed');
  });

  it('(PACT 1.7) with no stored snapshot, refuses, stores nothing and never calls the archiver', async () => {
    const archive = savingArchiver();
    const { deps, blobs } = await setup({ archive, withSnapshot: false });
    expect(await sealPact(deps, watch)).toEqual({ status: 'no-snapshot' });
    expect(await blobs.list('pacts/')).toEqual([]);
    expect(archive.calls).toEqual([]);
  });

  it('(PACT 1.9) sealing reads the store and the archiver only: there is no fetcher to call', async () => {
    const { deps } = await setup({ archive: savingArchiver() });
    expect(Object.keys(deps).sort()).toEqual(['archive', 'clock', 'store']);
    expect((await sealPact(deps, watch)).status).toBe('sealed');
  });

  it('(PACT 1.4) the archiver is called exactly once per seal, and not at all when the seal is refused', async () => {
    const archive = savingArchiver();
    const { deps } = await setup({ archive });
    await sealPact(deps, watch);
    expect(archive.calls).toHaveLength(1);
    expect((await sealPact(deps, watch)).status).toBe('exists');
    expect(archive.calls).toHaveLength(1);
    await sealPact(deps, watch, { confirmReplace: true });
    expect(archive.calls).toHaveLength(2);
  });
});

describe('one pact per watch', () => {
  it('(PACT 2.1) (PACT 2.2) a second seal without confirmation changes nothing and reports the current pact', async () => {
    const { deps, store, clock } = await setup();
    const sealed = await sealPact(deps, watch);
    const before = (await store.pactRecord('lantern')) as { status: 'sealed'; record: object };
    clock.advance(86_400_000);

    const again = await sealPact(deps, watch);
    expect(again.status).toBe('exists');
    expect(sealed.status === 'sealed' && again.status === 'exists' && [again.pact.sealedAt, again.pact.sha256]).toEqual(
      sealed.status === 'sealed' ? [sealed.pact.sealedAt, sealed.pact.sha256] : [],
    );
    expect(await store.pactRecord('lantern')).toEqual(before);
  });

  it('(PACT 2.2) only confirmReplace: true counts as confirmation', async () => {
    const { deps } = await setup();
    await sealPact(deps, watch);
    expect((await sealPact(deps, watch, { confirmReplace: false })).status).toBe('exists');
    expect((await sealPact(deps, watch, {})).status).toBe('exists');
  });

  it('(PACT 2.3) confirmed replacement stores the new pact and deletes the old snapshot document', async () => {
    const { deps, store, blobs, clock } = await setup();
    const first = await sealPact(deps, watch);
    clock.advance(86_400_000);
    await store.saveSnapshot(snapshot('2026-10-11T09:00:00.000Z', { bonus: money('$300') }));

    const second = await sealPact(deps, watch, { confirmReplace: true });
    expect(second.status === 'sealed' && second.replaced).toBe(true);
    expect(second.status === 'sealed' && second.pact.sealedAt).toBe('2026-10-11T14:15:02.000Z');
    expect(second.status === 'sealed' && second.pact.snapshot.fields.bonus).toEqual(money('$300'));
    const keys = await blobs.list('pacts/lantern/');
    expect(keys).toHaveLength(2);
    expect(first.status === 'sealed' && keys.some((key) => key.includes(first.pact.sha256))).toBe(false);
  });

  it('(PACT 2.4) when the replacement cannot be written, the old pact stays readable', async () => {
    const { deps, store, blobs, clock } = await setup();
    const first = await sealPact(deps, watch);
    clock.advance(86_400_000);
    await store.saveSnapshot(snapshot('2026-10-11T09:00:00.000Z', { bonus: money('$300') }));

    blobs.armed = true;
    await expect(sealPact(deps, watch, { confirmReplace: true })).rejects.toThrow(/disk full/);
    blobs.armed = false;

    const reading = await store.pact('lantern');
    expect(reading.status).toBe('sealed');
    expect(first.status === 'sealed' && reading.status === 'sealed' && reading.pact.sha256).toBe(first.status === 'sealed' ? first.pact.sha256 : '');
    expect(reading.status === 'sealed' && reading.pact.snapshot.fields.bonus).toEqual(money('$400'));
  });

  it('(PACT 2.5) breaking removes the record and its snapshot', async () => {
    const { deps, blobs, store } = await setup();
    await sealPact(deps, watch);
    expect(await breakPact(deps, 'lantern')).toEqual({ removed: true });
    expect(await blobs.list('pacts/')).toEqual([]);
    expect(await store.pact('lantern')).toEqual({ status: 'none' });
  });

  it('(PACT 2.6) breaking a watch with no pact succeeds and says nothing was removed', async () => {
    const { deps } = await setup();
    expect(await breakPact(deps, 'lantern')).toEqual({ removed: false });
  });

  it('(PACT 2.7) replacing or breaking leaves the pact reference stored on an alert unchanged', async () => {
    const { deps, store } = await setup();
    const first = await sealPact(deps, watch);
    if (first.status !== 'sealed') throw new Error('expected a seal');
    const pact = {
      sealedAt: first.pact.sealedAt,
      sha256: first.pact.sha256,
      archive: first.pact.archive,
      relation: 'differs' as const,
      promised: money('$400'),
      note: 'kept',
    };
    await store.appendAlerts('lantern', [
      {
        id: 'a1',
        watchId: 'lantern',
        watchName: watch.name,
        url: first.pact.url,
        createdAt: '2026-10-12T00:00:00.000Z',
        severity: 'shriek',
        ruleKind: 'wentDown',
        ruleLabel: 'Bonus goes down',
        summary: 's',
        pact,
      },
    ]);
    const stored = JSON.stringify(await store.alerts('lantern'));
    await sealPact(deps, watch, { confirmReplace: true });
    expect(JSON.stringify(await store.alerts('lantern'))).toBe(stored);
    await breakPact(deps, 'lantern');
    expect(JSON.stringify(await store.alerts('lantern'))).toBe(stored);
  });
});

describe('a corrupt pact', () => {
  it('(PACT 4.5) is replaced by a seal without confirmation', async () => {
    const { deps, blobs, store } = await setup();
    await blobs.put(PACT_KEY, '{ not json');
    const result = await sealPact(deps, watch);
    expect(result.status).toBe('sealed');
    expect(result.status === 'sealed' && result.replaced).toBe(false);
    expect((await store.pact('lantern')).status).toBe('sealed');
  });

  it('(PACT 4.5) a pact whose snapshot document vanished is replaced without confirmation', async () => {
    const { deps, blobs, store } = await setup();
    const first = await sealPact(deps, watch);
    if (first.status !== 'sealed') throw new Error('expected a seal');
    await blobs.delete(`pacts/lantern/${first.pact.sha256}.json`);
    expect((await store.pact('lantern')).status).toBe('corrupt');
    expect((await sealPact(deps, watch)).status).toBe('sealed');
    expect((await store.pact('lantern')).status).toBe('sealed');
  });

  it('(PACT 4.6) is broken, removing every document under the pact path', async () => {
    const { deps, blobs, store } = await setup();
    await sealPact(deps, watch);
    await blobs.put(PACT_KEY, '{ not json');
    await blobs.put('pacts/lantern/leftover.json', '{}');
    expect(await breakPact(deps, 'lantern')).toEqual({ removed: true });
    expect(await blobs.list('pacts/lantern/')).toEqual([]);
    expect(await store.pact('lantern')).toEqual({ status: 'none' });
  });
});
