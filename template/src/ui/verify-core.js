// The verify page's pure helpers. They run in the browser and under Vitest, and use only
// `crypto.subtle` and `fetch`, both injected or global, so nothing here touches the network by itself.

/**
 * @typedef {{ copy: string | null; sha256: string | null; sealed: string | null }} VerifyQuery
 * @typedef {{ status: 'invalid' } | { status: 'match' } | { status: 'mismatch' }} HashComparison
 * @typedef {{ status: 'ok'; bytes: Uint8Array } | { status: 'refused'; reason: string } | { status: 'unreachable'; reason: string } | { status: 'http'; code: number }} CopyFetch
 * @typedef {(input: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>} FetchLike
 */

const HEX64 = /^[0-9a-f]{64}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @param {unknown} text */
export function normalizeHash(text) {
  return String(text ?? '').trim().toLowerCase();
}

/** True for 64 hexadecimal characters, in either case, with or without surrounding space. @param {unknown} text */
export function isSha256(text) {
  return HEX64.test(normalizeHash(text));
}

/** SHA-256 of bytes as 64 lowercase hex characters. @param {BufferSource} bytes */
export async function sha256OfBytes(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {string} expected @param {string} computed @returns {HashComparison} */
export function compareHashes(expected, computed) {
  if (!isSha256(expected)) return { status: 'invalid' };
  return { status: normalizeHash(expected) === normalizeHash(computed) ? 'match' : 'mismatch' };
}

/** @param {string} search a query string, with or without the leading `?` @returns {VerifyQuery} */
export function readVerifyQuery(search) {
  const params = new URLSearchParams(search);
  const read = (/** @type {string} */ name) => {
    const value = params.get(name);
    return value === null || value.trim() === '' ? null : value.trim();
  };
  return { copy: read('copy'), sha256: read('sha256'), sealed: read('sealed') };
}

/** `2026-10-10T10:00:00.000Z` to `Oct 10, 2026` in UTC; null for anything that is not a time. @param {string | null} iso */
export function sealedDate(iso) {
  if (!iso) return null;
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return null;
  return `${MONTHS[time.getUTCMonth()]} ${time.getUTCDate()}, ${time.getUTCFullYear()}`;
}

/**
 * The address to fetch, or null when it is not an http or https address. A relative address resolves
 * against `base` (the page), which is how the dispute pack names the dashboard's own copy.
 * @param {string} copy @param {string} base
 */
export function copyAddress(copy, base) {
  try {
    const url = new URL(copy, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Fetches the bytes of a copy. A network or CORS failure is `unreachable`, never a mismatch.
 * @param {FetchLike} fetchFn @param {string} copy @param {string} base @returns {Promise<CopyFetch>}
 */
export async function fetchBytes(fetchFn, copy, base) {
  const address = copyAddress(copy, base);
  if (!address) return { status: 'refused', reason: 'Only http and https addresses can be checked.' };
  try {
    const response = await fetchFn(address, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) return { status: 'http', code: response.status };
    return { status: 'ok', bytes: new Uint8Array(await response.arrayBuffer()) };
  } catch (error) {
    return { status: 'unreachable', reason: error instanceof Error ? error.message : String(error) };
  }
}
