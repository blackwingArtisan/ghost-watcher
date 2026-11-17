/**
 * Request guard for the dashboard.
 *
 * The dashboard is meant to run on your own machine (or behind one known hostname), so it only
 * answers requests whose Host header names a host it expects. That blocks DNS-rebinding pages from
 * reading or driving a local dashboard. State-changing requests (anything other than GET and HEAD)
 * must also come from the dashboard's own origin: a cross-site Origin or Sec-Fetch-Site header is
 * refused, so another web page cannot make the ghosts go and fetch pages on its behalf.
 */

/** Hostnames that always identify a dashboard running on this machine. */
export const LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

export interface GuardedRequest {
  method?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

export type GuardVerdict = { ok: true } | { ok: false; reason: string };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function header(req: GuardedRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Lower-cased hostname of a Host header value (`127.0.0.1:3130` -> `127.0.0.1`), or null if malformed. */
export function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  try {
    const url = new URL(`http://${hostHeader}`);
    // A Host header is only a host and an optional port; anything else is malformed.
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Builds the set of accepted hostnames: loopback plus any configured extras (bare hostnames). */
export function allowedHostSet(extra: readonly string[] = []): ReadonlySet<string> {
  const hosts = new Set(LOOPBACK_HOSTS);
  for (const entry of extra) {
    const name = hostnameOf(entry.trim());
    if (name) hosts.add(name);
  }
  return hosts;
}

/** Parses a comma-separated host list, such as the `GHOST_ALLOWED_HOSTS` environment variable. */
export function parseHostList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function checkRequest(req: GuardedRequest, allowedHosts: ReadonlySet<string>): GuardVerdict {
  const host = header(req, 'host');
  const hostname = hostnameOf(host);
  if (!hostname || !allowedHosts.has(hostname)) {
    return { ok: false, reason: 'This dashboard does not answer to that Host. Add it to GHOST_ALLOWED_HOSTS if it is yours.' };
  }

  const method = (req.method ?? 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) return { ok: true };

  const fetchSite = header(req, 'sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return { ok: false, reason: 'Cross-site requests may not wake the ghosts.' };
  }
  const origin = header(req, 'origin');
  if (origin !== undefined) {
    let sameOrigin = false;
    try {
      const parsed = new URL(origin);
      // Normalise the Host header the same way the URL parser treats the origin (default ports drop out).
      sameOrigin =
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.host === new URL(`${parsed.protocol}//${host ?? ''}`).host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      return { ok: false, reason: 'Cross-origin requests may not wake the ghosts.' };
    }
  }
  return { ok: true };
}
