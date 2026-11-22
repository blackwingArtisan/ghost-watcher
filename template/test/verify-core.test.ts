import { describe, expect, it } from 'vitest';
import { snapshotSha256 } from '../src/receipts';
import { serializeJson, sha256Hex } from '../src/receipts';
import { compareHashes, copyAddress, fetchBytes, isSha256, readVerifyQuery, sealedDate, sha256OfBytes } from '../src/ui/verify-core.js';
import { money, snapshot } from './pact-support';

const HELLO = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const bytesOf = (text: string) => new TextEncoder().encode(text);

describe('the verify helper', () => {
  it('(PACT 16.1) returns the SHA-256 of bytes as 64 lowercase hex characters', async () => {
    const hash = await sha256OfBytes(bytesOf('hello'));
    expect(hash).toBe(HELLO);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256OfBytes(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('(PACT 16.2) gives the same digest as snapshotSha256 for the stored bytes of a snapshot', async () => {
    const shot = snapshot('2026-10-10T10:00:00.000Z', { bonus: money('$300') });
    const stored = serializeJson(shot);
    expect(await sha256OfBytes(bytesOf(stored))).toBe(snapshotSha256(shot));
    expect(await sha256OfBytes(bytesOf(stored))).toBe(sha256Hex(stored));
  });

  it('(PACT 16.3) compares hashes ignoring letter case and surrounding whitespace', () => {
    expect(compareHashes(` ${HELLO.toUpperCase()}\n`, HELLO)).toEqual({ status: 'match' });
    expect(compareHashes(HELLO, HELLO.replace(/.$/, '0'))).toEqual({ status: 'mismatch' });
  });

  it('(PACT 16.4) reports an expected hash that is not 64 hex characters as invalid without comparing', () => {
    for (const bad of ['', 'abc', HELLO.slice(1), `${HELLO}0`, HELLO.replace(/^./, 'g')]) {
      expect(isSha256(bad)).toBe(false);
      expect(compareHashes(bad, bad)).toEqual({ status: 'invalid' });
    }
  });

  it('(PACT 16.5) reads copy, sha256 and sealed from a query string and gives null for the absent ones', () => {
    const copy = '/api/ghosts/lantern/pact/snapshot';
    const query = `?copy=${encodeURIComponent(copy)}&sha256=${HELLO}&sealed=2026-10-10T10%3A00%3A00.000Z`;
    expect(readVerifyQuery(query)).toEqual({ copy, sha256: HELLO, sealed: '2026-10-10T10:00:00.000Z' });
    expect(readVerifyQuery('')).toEqual({ copy: null, sha256: null, sealed: null });
    expect(readVerifyQuery('?copy=&sha256=%20')).toEqual({ copy: null, sha256: null, sealed: null });
  });

  it('(PACT 16.6) formats the sealed time as Mon D, YYYY in UTC', () => {
    expect(sealedDate('2026-10-10T10:00:00.000Z')).toBe('Oct 10, 2026');
    expect(sealedDate('2026-12-31T23:59:59.000Z')).toBe('Dec 31, 2026');
    expect(sealedDate('2026-01-01T00:30:00+05:00')).toBe('Dec 31, 2025');
    expect(sealedDate('not a time')).toBeNull();
    expect(sealedDate(null)).toBeNull();
  });

  it('(PACT 16.7) refuses an address that is not http or https, and resolves a relative one against the page', async () => {
    expect(copyAddress('/api/x', 'http://127.0.0.1:3130/verify?a=1')).toBe('http://127.0.0.1:3130/api/x');
    for (const bad of ['javascript:alert(1)', 'data:text/plain,hi', 'file:///etc/passwd', 'ftp://example.com/a']) {
      expect(copyAddress(bad, 'http://127.0.0.1:3130/verify')).toBeNull();
      let called = false;
      const result = await fetchBytes(async () => {
        called = true;
        throw new Error('must not be called');
      }, bad, 'http://127.0.0.1:3130/verify');
      expect(result.status).toBe('refused');
      expect(called).toBe(false);
    }
  });

  it('(PACT 16.8) reports a fetch that throws as unreachable, never as a match or a mismatch', async () => {
    const result = await fetchBytes(async () => {
      throw new TypeError('Failed to fetch');
    }, 'https://archive.example.com/copy', 'http://127.0.0.1:3130/verify');
    expect(result).toEqual({ status: 'unreachable', reason: 'Failed to fetch' });
    const refused = await fetchBytes(async () => ({ ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) }), 'https://archive.example.com/copy', 'http://127.0.0.1:3130/verify');
    expect(refused).toEqual({ status: 'http', code: 503 });
    const good = await fetchBytes(async () => ({ ok: true, status: 200, arrayBuffer: async () => bytesOf('hello').buffer as ArrayBuffer }), 'https://archive.example.com/copy', 'http://127.0.0.1:3130/verify');
    expect(good.status).toBe('ok');
  });
});
