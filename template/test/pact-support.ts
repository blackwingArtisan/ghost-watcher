/** Shared fakes for the pact tests. Nothing here touches the network. */
import type { Snapshot } from '../src/diff';
import { normalizeValue, type MaybeValue } from '../src/normalize';
import type { PageArchiver } from '../src/receipts';
import type { BlobStore } from '../src/store/blob';
import type { S3Like } from '../src/store/s3';

export const money = (raw: string): MaybeValue => normalizeValue(raw, 'money');
export const text = (raw: string): MaybeValue => normalizeValue(raw, 'text');

export function snapshot(takenAt: string, fields: Record<string, MaybeValue>, watchId = 'lantern', url = 'http://127.0.0.1:9/offer'): Snapshot {
  return { watchId, url, takenAt, fields, lists: {} };
}

/** An archiver that saves, and records every url it was asked for. */
export function savingArchiver(label = 'a test archive'): PageArchiver & { calls: string[] } {
  const calls: string[] = [];
  return {
    label,
    calls,
    save: async (url) => {
      calls.push(url);
      return { archiveUrl: `https://archive.test/web/20261118120100/${url}`, archivedAt: '2026-11-18T12:01:00Z' };
    },
  };
}

/** An archiver that always fails. */
export function failingArchiver(label = 'a test archive', reason = 'timed out'): PageArchiver & { calls: string[] } {
  const calls: string[] = [];
  return {
    label,
    calls,
    save: async (url) => {
      calls.push(url);
      throw new Error(reason);
    },
  };
}

/** Wraps a blob store and fails every `put` whose key matches. */
export function failingPuts(inner: BlobStore, matches: (key: string) => boolean): BlobStore & { armed: boolean } {
  const wrapper = {
    armed: false,
    get: (key: string) => inner.get(key),
    list: (prefix: string) => inner.list(prefix),
    delete: (key: string) => inner.delete(key),
    put: async (key: string, body: string) => {
      if (wrapper.armed && matches(key)) throw new Error(`disk full writing ${key}`);
      return inner.put(key, body);
    },
  };
  return wrapper;
}

/** A fake S3 client over a Map, the pattern `adapters.test.ts` uses. */
export function fakeS3(objects = new Map<string, string>()): { client: S3Like; objects: Map<string, string> } {
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
  return { client, objects };
}
