/**
 * Vitest setup: a unit or integration test may only reach this machine. `fetch` to any other host
 * fails at once, naming the host, so a test that forgot its stub or fixture server cannot scrape a
 * live site. (REQ-TEST-02)
 */
const realFetch = globalThis.fetch;

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function assertLoopback(input: unknown): void {
  const text = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url?: string }).url ?? '';
  const host = new URL(text, 'http://127.0.0.1').hostname;
  if (!LOOPBACK_HOSTS.has(host)) throw new Error(`Tests may only fetch from this machine; refused ${host}. Use a fixture server or a stub transport.`);
}

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  assertLoopback(input);
  return realFetch(input, init);
}) as typeof fetch;
