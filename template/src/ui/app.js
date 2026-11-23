// Dashboard client: keeps the graveyard live, opens séances, and sends "check now" and "lay to rest".
import { noiseSummary, renderDetail, renderDispute, renderFeed, renderGraveyard, renderSealCeremony, bookmarkletHref, sealPrefill, renderStats, renderTally, shortHash } from './render.js';

/**
 * @typedef {import('./render.js').FeedEntry} FeedEntry
 * @typedef {import('./render.js').GhostView} GhostView
 * @typedef {import('./render.js').AlertView} AlertView
 * @typedef {import('./render.js').CheckResultView} CheckResultView
 */


const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
const initial = document.getElementById('initial-state');
let state = JSON.parse(initial ? initial.textContent || '{}' : '{}');
/** @type {string | null} */
let openId = null;
let busy = 0;
/** The pact confirmation open in the séance: which ghost, which question, and the button that asked. @type {{ id: string; kind: 'replace' | 'break'; opener: string } | null} */
let pendingConfirm = null;

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
  if (pill) pill.textContent = String(state.feed.filter((/** @type {FeedEntry} */ e) => !e.acknowledged).length);
  document.body.dataset.restless = String(state.ghosts.some((/** @type {GhostView} */ g) => g.state === 'restless'));
}

/** @param {string} text */
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  delete el.dataset.error;
  el.dataset.show = 'true';
  clearTimeout(Number(el.dataset.timer || 0));
  el.dataset.timer = String(setTimeout(() => (el.dataset.show = 'false'), 4200));
}

/**
 * A themed error with a Retry button that runs the failed action again. It stays until answered.
 * @param {string} text @param {() => Promise<void>} retry
 */
function errorToast(text, retry) {
  const el = $('#toast');
  clearTimeout(Number(el.dataset.timer || 0));
  el.dataset.error = 'true';
  el.innerHTML = '';
  const message = document.createElement('span');
  message.textContent = text;
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'btn btn--small toast__retry';
  again.textContent = 'Retry';
  again.addEventListener('click', () => {
    el.dataset.show = 'false';
    void withBusy(retry);
  });
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'toast__dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => (el.dataset.show = 'false'));
  el.append(message, again, dismiss);
  el.dataset.show = 'true';
}

/** Clears every "visiting..." flag, so a failed or finished round never leaves a ghost stuck. */
function settleGhosts() {
  document.querySelectorAll('.ghost[data-checking="true"]').forEach((card) => ((/** @type {HTMLElement} */ (card)).dataset.checking = 'false'));
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
 * @param {CheckResultView[]} results
 */
function riseAfterNight(results) {
  for (const result of results) {
    if (result.status !== 'changed') continue;
    const card = document.getElementById(`ghost-${result.watchId}`);
    if (card) card.dataset.rising = 'true';
  }
  showNightBanner(results);
  // A shriek gets its own scene: the moon flushes red, lightning flashes, and the ghost shakes.
  const shrieked = results.some((r) => r.status === 'changed' && (r.alerts || []).some((/** @type {AlertView} */ a) => a.severity === 'shriek'));
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

/**
 * Small screens stack Spirit mail under the stones, so after a night the loudest catch gets a banner
 * that jumps to the letters. Wide screens show the letters beside the stones and hide it (style.css).
 * @param {CheckResultView[]} results
 */
function showNightBanner(results) {
  const banner = document.getElementById('night-banner');
  if (!banner) return;
  const alerts = results.flatMap((r) => (r.status === 'changed' ? r.alerts || [] : []));
  const stealth = alerts.find((/** @type {AlertView} */ a) => a.stealth);
  const shriek = alerts.find((/** @type {AlertView} */ a) => a.severity === 'shriek');
  if (!stealth && !shriek) {
    banner.hidden = true;
    return;
  }
  banner.textContent = stealth ? `Bait and switch caught at ${stealth.watchName}: read the letter` : `${shriek.watchName} changed overnight: read the letter`;
  banner.hidden = false;
}

async function refresh() {
  state = await api('/api/state');
  paint();
  // An open confirmation is left alone, so a poll never takes the question away from the reader.
  if (openId && dialog.open && !pendingConfirm) await openSeance(openId, false);
}

/** @param {string} id @param {boolean} [show] */
async function openSeance(id, show = true) {
  openId = id;
  const detail = await api(`/api/ghosts/${encodeURIComponent(id)}`);
  const confirm = pendingConfirm && pendingConfirm.id === id ? pendingConfirm.kind : null;
  $('#seance-body').innerHTML = renderDetail(detail, state.generatedAt, { disputes: state.app.disputes, confirm, pactCopy: state.app.pactCopy });
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

/** @param {string} id */
function ghostName(id) {
  const ghost = (state.ghosts || []).find((/** @type {GhostView} */ g) => g.id === id);
  return ghost ? ghost.name : id;
}

/**
 * Calls a pact route and returns the status and body, so a 409 can be explained rather than thrown.
 * @param {string} id @param {'POST' | 'DELETE'} method @param {object} [body]
 */
async function pactRequest(id, method, body) {
  const response = await fetch(`/api/ghosts/${encodeURIComponent(id)}/pact`, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

/** @param {string} selector */
function focusSoon(selector) {
  requestAnimationFrame(() => /** @type {HTMLElement | null} */ (document.querySelector(selector))?.focus());
}

/**
 * Plays the sealing ceremony under a stone's pact line: the seal stamps down (CSS), then the hash types
 * out over about a second. Reduced motion gets the final state at once. @param {string} id @param {string} sha256
 */
function playCeremony(id, sha256) {
  const line = document.querySelector(`#ghost-${CSS.escape(id)} .ghost__pact[data-pact="sealed"]`);
  if (!line) return;
  line.parentElement?.querySelector('.seal-ceremony')?.remove();
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  line.insertAdjacentHTML('afterend', renderSealCeremony(sha256, { final: still }));
  const block = /** @type {HTMLElement | null} */ (line.nextElementSibling);
  if (!block || still) return;
  const live = /** @type {HTMLElement} */ (block.querySelector('[data-seal-live]'));
  const typed = /** @type {HTMLElement} */ (block.querySelector('.seal-ceremony__typed'));
  requestAnimationFrame(() => (live.textContent = `Pact sealed. SHA-256 ${sha256}`));
  const STAMP_MS = 600;
  const TYPE_MS = 1000;
  const started = performance.now();
  const timer = setInterval(() => {
    const shown = Math.min(sha256.length, Math.floor(((performance.now() - started - STAMP_MS) / TYPE_MS) * sha256.length));
    typed.textContent = sha256.slice(0, Math.max(0, shown));
    if (shown >= sha256.length) {
      clearInterval(timer);
      block.dataset.playing = 'false';
    }
  }, 30);
}

/** Seals the pact, then explains the outcome in a toast. @param {string} id @param {boolean} confirmReplace */
async function sealPact(id, confirmReplace) {
  const name = ghostName(id);
  const { status, data } = await pactRequest(id, 'POST', confirmReplace ? { confirmReplace: true } : {});
  if (status === 201) {
    const hash = shortHash(data.pact.sha256);
    const hashOnly = !data.archive.saved && /^Could not reach/.test(data.archive.note || '');
    toast(
      hashOnly
        ? `Pact sealed for ${name} with its hash only. The archive could not be reached.`
        : `Pact sealed for ${name}. Hash ${hash}.`,
    );
  } else if (status === 409 && data.code === 'no-snapshot') {
    toast('Nothing to seal yet. Summon the ghost for a first look.');
  } else if (status === 409 && data.code === 'pact-exists') {
    toast('A pact already exists. Open the séance to replace it.');
  } else if (data.code === 'read-only') {
    // The static demo replays a recording and cannot seal anything; it says so instead.
    toast(data.error);
    return;
  } else {
    throw new Error(`${status} ${data.error || 'The pact could not be sealed'}`);
  }
  await refresh();
  if (status === 201) playCeremony(id, data.pact.sha256);
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

/** @param {CheckResultView} result */
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
    const reason = error instanceof Error ? error.message : String(error);
    errorToast(`The ghosts could not reach the dashboard (${reason.slice(0, 80)}).`, task);
  } finally {
    busy -= 1;
    if (busy === 0) {
      document.body.dataset.busy = 'false';
      settleGhosts();
    }
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
  } else if (action === 'pact-seal') {
    const inSeance = Boolean(target.closest('#seance'));
    void withBusy(async () => {
      await sealPact(id, false);
      focusSoon(inSeance ? '#seance [data-action="pact-ask-replace"]' : `#ghost-${CSS.escape(id)} .ghost__hit`);
    });
  } else if (action === 'bonus-posted') {
    void withBusy(async () => {
      await api(`/api/ghosts/${encodeURIComponent(id)}/bonus-posted`, { method: 'POST' });
      toast(`Bonus marked as posted for ${ghostName(id)}.`);
      await refresh();
    });
  } else if (action === 'pact-ask-replace' || action === 'pact-ask-break') {
    pendingConfirm = { id, kind: action === 'pact-ask-replace' ? 'replace' : 'break', opener: String(action) };
    void withBusy(async () => {
      await openSeance(id, false);
      focusSoon('#seance [data-action="pact-cancel"]');
    });
  } else if (action === 'pact-cancel') {
    const opener = pendingConfirm ? pendingConfirm.opener : '';
    pendingConfirm = null;
    void withBusy(async () => {
      await openSeance(id, false);
      focusSoon(`#seance [data-action="${opener}"]`);
    });
  } else if (action === 'pact-confirm-replace') {
    pendingConfirm = null;
    void withBusy(async () => {
      await sealPact(id, true);
      focusSoon('#seance [data-action="pact-ask-replace"]');
    });
  } else if (action === 'pact-confirm-break') {
    pendingConfirm = null;
    void withBusy(async () => {
      const { status, data } = await pactRequest(id, 'DELETE');
      if (data.code === 'read-only') return toast(data.error);
      if (status !== 200) throw new Error(`${status} ${data.error || 'The pact could not be broken'}`);
      toast(`Pact broken for ${ghostName(id)}.`);
      await refresh();
      focusSoon('#seance [data-action="pact-seal"]');
    });
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
          const changed = night.results.filter((/** @type {CheckResultView} */ r) => r.status === 'changed').length;
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
        const banner = document.getElementById('night-banner');
        if (banner) banner.hidden = true;
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
      const changed = results.filter((/** @type {CheckResultView} */ r) => r.status === 'changed').length;
      const blocked = results.filter((/** @type {CheckResultView} */ r) => r.status === 'blocked').length;
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
  pendingConfirm = null;
});
// Escape answers an open pact question ("Keep it") before it closes the séance.
dialog.addEventListener('cancel', (event) => {
  if (!pendingConfirm) return;
  event.preventDefault();
  /** @type {HTMLElement | null} */ (document.querySelector('#seance [data-action="pact-cancel"]'))?.click();
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
  /** @type {Map<Element, boolean>} */
  const inView = new Map();
  const watchFirstTitle = () => {
    const title = document.querySelector('.ghost .ghost__name');
    const letters = document.getElementById('feed');
    if (!title) return;
    inView.clear();
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) inView.set(e.target, e.isIntersecting);
      pill.dataset.hidden = String([...inView.values()].some(Boolean));
    });
    observer.observe(title);
    if (letters) observer.observe(letters);
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

// `?fresh-pact=<ghost id>` (or `=1` for the demo's unsealed ghost) clears that ghost's pact on load, in
// demo mode only, so "I applied today" can be pressed and the ceremony seen every time.
const freshPact = new URLSearchParams(location.search).get('fresh-pact');
if (state.app.demo && freshPact) {
  const id = freshPact === '1' ? state.app.freshPact : freshPact;
  if (id) {
    void withBusy(async () => {
      const response = await fetch('/api/demo/fresh-pact', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (response.ok) await refresh();
    }).catch(() => undefined);
  }
}

// Seal a page: paste an address, press "I applied today". The bookmarklet opens this page with `?seal=<address>`.
const sealForm = /** @type {HTMLFormElement | null} */ (document.getElementById('seal-page-form'));
if (sealForm) {
  const input = /** @type {HTMLInputElement} */ ($('#seal-page-url'));
  const button = /** @type {HTMLButtonElement} */ ($('#seal-page-button'));
  const message = $('#seal-page-message');
  const bookmarklet = document.getElementById('seal-page-bookmarklet');
  if (bookmarklet) bookmarklet.setAttribute('href', bookmarkletHref(location.origin));
  const prefill = sealPrefill(new URLSearchParams(location.search).get('seal'));
  if (prefill) {
    input.value = prefill;
    button.focus();
    message.textContent = 'Address filled in from the page you were on. Press "I applied today" to seal it.';
  }
  sealForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = input.value.trim();
    if (!url) {
      message.dataset.kind = 'refused';
      message.textContent = 'Paste the address of the page first.';
      input.focus();
      return;
    }
    button.disabled = true;
    delete message.dataset.kind;
    message.textContent = 'The ghost is looking at the page...';
    void (async () => {
      try {
        const response = await fetch('/api/pages', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          message.dataset.kind = 'sealed';
          message.textContent = `Sealed: ${data.name}. The ghost will tell you when its words change.${data.archive && data.archive.note ? ` ${data.archive.note}` : ''}`;
          input.value = '';
          await refresh();
          await openSeance(data.ghostId);
        } else {
          message.dataset.kind = 'refused';
          message.dataset.code = data.code || '';
          message.textContent = data.error || `The page could not be sealed (${response.status}).`;
          if (data.code === 'page-exists' && data.ghostId) await openSeance(data.ghostId);
        }
      } catch (error) {
        message.dataset.kind = 'refused';
        message.textContent = `The dashboard could not be reached (${(error instanceof Error ? error.message : String(error)).slice(0, 80)}).`;
      } finally {
        button.disabled = false;
      }
    })();
  });
}
