// Dashboard client: keeps the graveyard live, opens séances, and sends "check now" and "lay to rest".
import { noiseSummary, renderDetail, renderFeed, renderGraveyard, renderStats } from './render.js';

const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
const initial = document.getElementById('initial-state');
let state = JSON.parse(initial ? initial.textContent || '{}' : '{}');
/** @type {string | null} */
let openId = null;
let busy = 0;

const dialog = /** @type {HTMLDialogElement} */ ($('#seance'));

function paint() {
  $('#graveyard').innerHTML = renderGraveyard(state);
  $('#feed').innerHTML = renderFeed(state);
  $('#stats').innerHTML = renderStats(state);
  document.body.dataset.restless = String(state.ghosts.some((/** @type {any} */ g) => g.state === 'restless'));
}

/** @param {string} text */
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.dataset.show = 'true';
  clearTimeout(Number(el.dataset.timer || 0));
  el.dataset.timer = String(setTimeout(() => (el.dataset.show = 'false'), 4200));
}

/** @param {string} url @param {RequestInit} [init] */
async function api(url, init) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, ...init });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

async function refresh() {
  state = await api('/api/state');
  paint();
  if (openId && dialog.open) await openSeance(openId, false);
}

/** @param {string} id @param {boolean} [show] */
async function openSeance(id, show = true) {
  openId = id;
  const detail = await api(`/api/ghosts/${encodeURIComponent(id)}`);
  $('#seance-body').innerHTML = renderDetail(detail, state.generatedAt);
  if (show && !dialog.open) dialog.showModal();
}

/** @param {any} result */
function describeResult(result) {
  switch (result.status) {
    case 'changed':
      return `${result.alerts.length} change${result.alerts.length === 1 ? '' : 's'} found. The ghost is restless.`;
    case 'unchanged':
      return 'Nothing the rules care about has changed.';
    case 'baseline':
      return 'First sighting recorded.';
    case 'blocked':
      return 'robots.txt asked us not to visit, so we did not.';
    case 'skipped':
      return `Resting until ${new Date(result.nextEligibleAt).toLocaleTimeString()} to stay polite.`;
    case 'error':
      return `Lost in the fog: ${result.message}`;
    default:
      return 'Done.';
  }
}

/** @param {() => Promise<void>} task */
async function withBusy(task) {
  busy += 1;
  document.body.dataset.busy = 'true';
  try {
    await task();
  } catch (error) {
    toast(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    busy -= 1;
    if (busy === 0) document.body.dataset.busy = 'false';
  }
}

document.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest('[data-action]') : null);
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id || '';
  if (action === 'open') {
    void withBusy(() => openSeance(id));
  } else if (action === 'check') {
    const card = document.getElementById(`ghost-${id}`);
    if (card) card.dataset.checking = 'true';
    target.setAttribute('disabled', '');
    void withBusy(async () => {
      const { result } = await api(`/api/ghosts/${encodeURIComponent(id)}/check`, { method: 'POST' });
      toast(describeResult(result));
      await refresh();
    });
  } else if (action === 'ack') {
    void withBusy(async () => {
      await api(`/api/ghosts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' });
      toast('Laid to rest. The ghost settles down.');
      await refresh();
    });
  } else if (action === 'next-night') {
    target.classList.remove('btn--beckon');
    target.setAttribute('disabled', '');
    document.body.dataset.night = 'true';
    document.querySelectorAll('.ghost').forEach((card) => ((/** @type {HTMLElement} */ (card)).dataset.checking = 'true'));
    void withBusy(async () => {
      try {
        const night = await api('/api/demo/next-night', { method: 'POST' });
        if (!night.moved) {
          toast('The fixture site has no more nights to show. Restart the demo to begin again.');
        } else {
          const changed = night.results.filter((/** @type {any} */ r) => r.status === 'changed').length;
          const noise = noiseSummary(night.results);
          toast(
            `Night ${night.version - 1} passes. ${noise ? `${noise} ` : ''}${changed ? `${changed} ghost${changed === 1 ? '' : 's'} restless.` : 'All quiet.'}`,
          );
        }
        await refresh();
      } finally {
        target.removeAttribute('disabled');
        setTimeout(() => (document.body.dataset.night = 'false'), 900);
      }
    });
  } else if (action === 'check-all') {
    target.setAttribute('disabled', '');
    document.querySelectorAll('.ghost').forEach((card) => ((/** @type {HTMLElement} */ (card)).dataset.checking = 'true'));
    void withBusy(async () => {
      const { results } = await api('/api/check-all', { method: 'POST' });
      const changed = results.filter((/** @type {any} */ r) => r.status === 'changed').length;
      const blocked = results.filter((/** @type {any} */ r) => r.status === 'blocked').length;
      const noise = noiseSummary(results);
      toast(
        `${results.length} ghosts visited. ${noise ? `${noise} ` : ''}${changed ? `${changed} restless.` : 'All quiet.'}${blocked ? ` ${blocked} turned away by robots.txt.` : ''}`,
      );
      await refresh();
      target.removeAttribute('disabled');
    });
  }
});

dialog.addEventListener('close', () => {
  openId = null;
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

setInterval(() => {
  if (busy === 0 && document.visibilityState === 'visible') void refresh().catch(() => undefined);
}, 15000);

document.body.dataset.ready = 'true';
paint();
