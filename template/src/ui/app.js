// Dashboard client: keeps the graveyard live, opens séances, and sends "check now" and "lay to rest".
import { noiseSummary, renderDetail, renderDispute, renderFeed, renderGraveyard, renderStats, renderTally } from './render.js';

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
  const tally = document.getElementById('tally');
  if (tally) tally.innerHTML = renderTally(state);
  const rewind = document.querySelector('[data-action="rewind"]');
  if (rewind) /** @type {HTMLButtonElement} */ (rewind).hidden = !state.app.night;
  const pill = document.getElementById('feed-pill-count');
  if (pill) pill.textContent = String(state.feed.filter((/** @type {any} */ e) => !e.acknowledged).length);
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

/**
 * One-shot entrance after a night: ghosts whose page changed rise out of their stones, and Spirit
 * mail deals its letters in one by one. Reduced motion stills both (see style.css).
 * @param {any[]} results
 */
function riseAfterNight(results) {
  for (const result of results) {
    if (result.status !== 'changed') continue;
    const card = document.getElementById(`ghost-${result.watchId}`);
    if (card) card.dataset.rising = 'true';
  }
  // A shriek gets its own scene: the moon flushes red, lightning flashes, and the ghost shakes.
  const shrieked = results.some((r) => r.status === 'changed' && (r.alerts || []).some((/** @type {any} */ a) => a.severity === 'shriek'));
  if (shrieked) {
    document.body.dataset.shriek = 'true';
    setTimeout(() => delete document.body.dataset.shriek, 1800);
  }
  const feed = $('#feed');
  feed.dataset.arriving = 'true';
  setTimeout(() => {
    delete feed.dataset.arriving;
    document.querySelectorAll('.ghost[data-rising]').forEach((card) => delete (/** @type {HTMLElement} */ (card)).dataset.rising);
  }, 2600);
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
  $('#seance-body').innerHTML = renderDetail(detail, state.generatedAt, { disputes: state.app.disputes });
  if (show && !dialog.open) dialog.showModal();
}

/** "Raise the dead": shows the dispute pack for one change in the séance drawer. @param {string} id @param {string} alertId */
async function openDispute(id, alertId) {
  openId = null;
  const pack = await api(`/api/ghosts/${encodeURIComponent(id)}/alerts/${encodeURIComponent(alertId)}/dispute`);
  $('#seance-body').innerHTML = renderDispute(pack);
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

/** @param {string} targetId */
async function copyText(targetId) {
  const field = /** @type {HTMLTextAreaElement | null} */ (document.getElementById(targetId));
  if (!field) return;
  try {
    await navigator.clipboard.writeText(field.value);
    toast('Copied. Fill in the bracketed blanks before you send it.');
  } catch {
    field.focus();
    field.select();
    toast('Selected. Press Ctrl+C or Cmd+C to copy.');
  }
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
  } else if (action === 'dispute') {
    void withBusy(() => openDispute(id, target.dataset.alert || ''));
  } else if (action === 'copy') {
    void copyText(target.dataset.target || '');
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
            `Night ${night.version - 1} passes. ${noise ? `${noise} ` : ''}${changed ? `${changed} newly restless.` : 'All quiet.'}`,
          );
        }
        await refresh();
        if (night.moved) riseAfterNight(night.results);
      } finally {
        target.removeAttribute('disabled');
        setTimeout(() => (document.body.dataset.night = 'false'), 900);
      }
    });
  } else if (action === 'rewind') {
    target.setAttribute('disabled', '');
    void withBusy(async () => {
      try {
        await api('/api/demo/rewind', { method: 'POST' });
        await refresh();
        toast('Rewound to the first sighting. Press N to let the night pass again.');
        const night = /** @type {HTMLElement | null} */ (document.querySelector('[data-action="next-night"]'));
        night?.focus();
      } finally {
        target.removeAttribute('disabled');
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
        `${results.length} ghosts visited. ${noise ? `${noise} ` : ''}${changed ? `${changed} newly restless.` : 'All quiet.'}${blocked ? ` ${blocked} turned away by robots.txt.` : ''}`,
      );
      await refresh();
      riseAfterNight(results);
      target.removeAttribute('disabled');
    });
  }
});

// N lets a night pass in demo mode, so a presenter never has to hunt for the button.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'n' && event.key !== 'N') return;
  if (event.metaKey || event.ctrlKey || event.altKey || dialog.open) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  const button = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-action="next-night"]'));
  if (button && !button.disabled) button.click();
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

// Phones: the Spirit mail pill stays out of the way while the first stone's name is on screen.
const pill = document.getElementById('feed-pill');
if (pill && 'IntersectionObserver' in window) {
  const watchFirstTitle = () => {
    const title = document.querySelector('.ghost .ghost__name');
    if (!title) return;
    const observer = new IntersectionObserver((entries) => {
      pill.dataset.hidden = String(entries.some((e) => e.isIntersecting));
    });
    observer.observe(title);
    return observer;
  };
  let observer = watchFirstTitle();
  new MutationObserver(() => {
    observer?.disconnect();
    observer = watchFirstTitle();
  }).observe($('#graveyard'), { childList: true });
}

document.body.dataset.ready = 'true';
paint();

// `?night=1` opens on the night itself: the first sighting is already taken, so one night passes
// on load and "Rewind to calm" goes back to the start.
if (state.app.demo && !state.app.night && new URLSearchParams(location.search).get('night') === '1') {
  const night = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-action="next-night"]'));
  if (night && !night.disabled) night.click();
}
