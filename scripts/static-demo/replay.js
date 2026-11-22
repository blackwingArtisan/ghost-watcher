// Replays a recorded demo dashboard with no server, for static hosting.
//
// `scripts/static-demo/build.ts` drives the real demo server through every path a visitor can take
// (each night, and laying any restless ghost to rest) and records what each API route answered at
// every stop. This module answers the dashboard's API calls from that recording, so the page in the
// browser behaves as it does against `npm run bonus`, without fetching any page itself.

/**
 * @typedef {{ status: number; answer: string; routes: Record<string, string> }} RecordedSeal
 * @typedef {{ routes: Record<string, string>; next?: string; acks?: Record<string, string>; seals?: Record<string, RecordedSeal> }} ReplayNode
 * @typedef {{ root: string; nodes: Record<string, ReplayNode> }} ReplayManifest
 * @typedef {{ status: number; body: unknown }} ReplayResponse
 */

/** What a visitor sees when they try something the recording cannot show. */
export const READ_ONLY_MESSAGE =
  'This live demo replays a recorded night, so pacts cannot be sealed or broken here. Run it locally to try that: npm install && npm run bonus.';

/**
 * Builds the API handler for one recording.
 * @param {ReplayManifest} manifest
 * @param {(blob: string) => Promise<unknown>} load reads one recorded response body by its id
 */
export function createReplay(manifest, load) {
  let at = manifest.root;
  /** Ghosts sealed during this visit, oldest first: their reads come from the recording made after the seal. @type {string[]} */
  let sealed = [];

  /** @param {string} route */
  const recorded = async (route) => {
    const node = manifest.nodes[at];
    const afterSeal = [...sealed].reverse().map((id) => node?.seals?.[id]?.routes[route]).find((id) => id !== undefined);
    const blob = afterSeal ?? node?.routes[route];
    return blob === undefined ? undefined : load(blob);
  };

  /** @param {number} status @param {unknown} body @returns {ReplayResponse} */
  const reply = (status, body) => ({ status, body });

  return {
    /** The recording's current stop, for tests. */
    get position() {
      return at;
    },

    /**
     * Answers one API request.
     * @param {string} method
     * @param {string} path
     * @returns {Promise<ReplayResponse>}
     */
    async handle(method, path) {
      const node = manifest.nodes[at];
      if (!node) return reply(500, { error: 'The recording is incomplete' });

      if (method === 'POST' && path === '/api/demo/rewind') {
        at = manifest.root;
        sealed = [];
        return reply(200, { night: 0 });
      }
      if (method === 'POST' && path === '/api/demo/next-night') {
        if (!node.next) {
          const state = /** @type {any} */ (await recorded('GET /api/state'));
          return reply(200, { version: (state?.app?.night ?? 0) + 1, moved: false, results: [] });
        }
        at = node.next;
        return reply(200, await recorded('arrival'));
      }
      // The flag that clears a pact needs the live server; the recording starts with the stone unsealed.
      if (method === 'POST' && path === '/api/demo/fresh-pact') return reply(200, { state: 'none', removed: false });
      if (method === 'POST' && path === '/api/check-all') return reply(200, await recorded('POST /api/check-all'));

      const ghost = /^\/api\/ghosts\/([a-z0-9-]+)(?:\/(check|acknowledge|pact))?$/.exec(path);
      if (ghost) {
        const id = ghost[1] ?? '';
        const action = ghost[2];
        if (method === 'POST' && action === 'check') {
          const all = /** @type {any} */ (await recorded('POST /api/check-all'));
          const result = all?.results?.find((/** @type {any} */ r) => r.watchId === id);
          return result ? reply(200, { result }) : reply(404, { error: 'No such ghost' });
        }
        if (method === 'POST' && action === 'acknowledge') {
          const target = node.acks?.[id];
          if (target) at = target;
          const state = /** @type {any} */ (await recorded('GET /api/state'));
          return reply(200, { acknowledgedAt: state?.generatedAt ?? null });
        }
        const seal = node.seals?.[id];
        if (action === 'pact' && method === 'POST' && seal && !sealed.includes(id)) {
          sealed = [...sealed, id];
          return reply(seal.status, await load(seal.answer));
        }
        if (action === 'pact' && method !== 'GET') return reply(409, { code: 'read-only', error: READ_ONLY_MESSAGE });
      }

      if (method === 'GET') {
        const body = await recorded(`GET ${path}`);
        if (body !== undefined) return reply(200, body);
      }
      return reply(404, { error: 'Not found' });
    },
  };
}
