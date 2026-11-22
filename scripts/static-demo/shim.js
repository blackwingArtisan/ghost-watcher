// Loaded before the dashboard script on the static site: answers `/api/*` from the recording.
import { createReplay } from './replay.js';

const blobs = new Map();
/** @param {string} id */
const load = (id) => {
  if (!blobs.has(id)) blobs.set(id, fetch(`/replay/${id}.json`).then((r) => r.json()));
  return blobs.get(id);
};

const replay = fetch('/replay/manifest.json')
  .then((r) => r.json())
  .then((manifest) => createReplay(manifest, load));

const realFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
  const snapshot = /^\/api\/ghosts\/([a-z0-9-]+)\/pact\/snapshot$/.exec(url.pathname);
  if (snapshot) {
    // The recorded pact names the current hash; the build saved that snapshot's exact bytes under it.
    const { body } = await (await replay).handle('GET', `/api/ghosts/${snapshot[1]}/pact`);
    const sha256 = body && body.pact && body.pact.sha256;
    return sha256 ? realFetch(`/pact-files/${snapshot[1]}/${sha256}.json`) : new Response('{"error":"No readable pact"}', { status: 404 });
  }
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const { status, body } = await (await replay).handle(method, url.pathname);
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
