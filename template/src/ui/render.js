// Dashboard rendering shared by the server (first paint) and the browser (live updates).
// Plain ES module with no dependencies, so it runs in both places without a build step.

/** @param {unknown} value */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** @param {string | null | undefined} iso @param {string} [nowIso] */
export function ago(iso, nowIso) {
  if (!iso) return 'never';
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (seconds < 0) {
    const ahead = -seconds;
    if (ahead < 60) return 'in under a minute';
    if (ahead < 3600) return `in ${Math.round(ahead / 60)} min`;
    if (ahead < 172800) return `in ${Math.round(ahead / 3600)} h`;
    return `in ${Math.round(ahead / 86400)} days`;
  }
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}

/** "Jun 11, 2026" @param {string} iso */
export function calendarDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** The Ghost of Terms Past: what the ghost would have said, had it been watching. @param {any} past */
export function renderPast(past) {
  if (!past) return '';
  const title = `<h4>Ghost of Terms Past <span class="muted">(from ${esc(past.source)})</span></h4>`;
  if (!past.entries.length) return `<section class="past" data-empty="true">${title}<p class="muted small">${esc(past.note || 'No earlier copies.')}</p></section>`;
  const words = { first: 'Earliest copy', change: 'Changed', now: 'First sighting' };
  const items = past.entries
    .map(
      (/** @type {any} */ e) => `<li class="past__entry" data-kind="${esc(e.kind)}" data-severity="${esc(e.severity || '')}">
  <span class="past__dot" aria-hidden="true"></span>
  <div><p class="past__when"><time datetime="${esc(e.at)}">${esc(calendarDate(e.at))}</time> · ${esc(words[/** @type {keyof typeof words} */ (e.kind)] || e.kind)}${
    e.archiveUrl ? ` · <a href="${esc(e.archiveUrl)}" target="_blank" rel="noopener noreferrer">archived copy</a>` : ''
  }</p>${e.lines.map((/** @type {string} */ line) => `<p class="past__line">${esc(line)}</p>`).join('')}</div>
</li>`,
    )
    .join('');
  return `<section class="past">${title}<p class="muted small">What this ghost would have told you, had it been watching. Read from ${past.captures} archived ${past.captures === 1 ? 'copy' : 'copies'} through the same rules; never sent as alerts.</p><ol class="past__list">${items}</ol></section>`;
}

/** @param {string} iso */
export function clockTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STATE_WORDS = {
  unborn: 'Not yet risen',
  dormant: 'Resting',
  restless: 'Restless',
  blocked: 'Turned away',
  lost: 'Lost in the fog',
};

const SEVERITY_WORDS = { whisper: 'Whisper', moan: 'Moan', shriek: 'Shriek' };

/** The ghost itself. Its face and props follow its state. @param {string} state */
export function ghostSvg(state) {
  const awake = state === 'restless';
  const eyes = state === 'dormant' || state === 'unborn'
    ? '<path class="g-eye-closed" d="M36 60 q8 7 16 0 M68 60 q8 7 16 0" />'
    : state === 'lost'
      ? '<g class="g-eye"><circle cx="44" cy="58" r="5"/><circle cx="76" cy="58" r="5"/></g>'
      : `<g class="g-eye"><ellipse cx="44" cy="58" rx="${awake ? 8 : 6.5}" ry="${awake ? 11 : 9}"/><ellipse cx="76" cy="58" rx="${awake ? 8 : 6.5}" ry="${awake ? 11 : 9}"/><circle class="g-glint" cx="47" cy="53" r="2.4"/><circle class="g-glint" cx="79" cy="53" r="2.4"/></g>`;
  const mouth = awake
    ? '<ellipse class="g-mouth" cx="60" cy="86" rx="8" ry="10"/>'
    : state === 'blocked'
      ? '<path class="g-mouth-line" d="M50 88 q10 -6 20 0"/>'
      : state === 'lost'
        ? '<path class="g-mouth-line" d="M50 88 q5 -4 10 0 q5 4 10 0"/>'
        : '<path class="g-mouth-line" d="M53 84 q7 5 14 0"/>';
  const extras = state === 'dormant'
    ? '<g class="g-zzz"><text x="92" y="30">z</text><text x="102" y="16">z</text></g>'
    : state === 'unborn'
      ? ''
      : state === 'lost'
        ? '<g class="g-zzz"><text x="94" y="26">?</text></g>'
        : '';
  const gate = state === 'blocked'
    ? '<g class="g-gate"><path d="M4 22 H116 M4 132 H116"/><path d="M14 10 V140 M34 10 V140 M54 10 V140 M74 10 V140 M94 10 V140 M114 10 V140"/><path d="M8 10 l6 -8 l6 8 M28 10 l6 -8 l6 8 M48 10 l6 -8 l6 8 M68 10 l6 -8 l6 8 M88 10 l6 -8 l6 8 M108 10 l6 -8 l6 8"/></g>'
    : '';
  return `<svg class="g-svg" viewBox="0 0 120 142" aria-hidden="true" focusable="false">
  <path class="g-body" d="M60 8C30 8 16 33 16 62V116q7-10 14 0t15 0 15 0 15 0 15 0 14 0V62C104 33 90 8 60 8Z"/>
  <path class="g-sheen" d="M38 26c-9 8-13 20-13 33"/>
  <ellipse class="g-cheek" cx="34" cy="76" rx="6" ry="3.4"/><ellipse class="g-cheek" cx="86" cy="76" rx="6" ry="3.4"/>
  ${eyes}${mouth}${extras}${gate}
</svg>`;
}

/** How much noise a ghost slept through. @param {number | undefined} count */
export function ignoredLine(count) {
  if (!count) return '';
  return `Slept through ${count} page change${count === 1 ? '' : 's'} that didn't matter`;
}

/** @param {number | undefined} count */
function ignoredChip(count) {
  return count ? `<p class="ghost__ignored" data-count="${count}">${esc(ignoredLine(count))}</p>` : '';
}

/**
 * One line about a round of visits: how many pages changed, how many woke a ghost, how much was noise.
 * @param {Array<{ status: string; pageMoved?: boolean }>} results
 */
export function noiseSummary(results) {
  const woke = results.filter((r) => r.status === 'changed').length;
  const moved = results.filter((r) => r.status === 'changed' || r.pageMoved).length;
  const ignored = moved - woke;
  if (moved === 0) return '';
  return `${moved} page${moved === 1 ? '' : 's'} changed: ${woke} worth waking for, ${ignored} ignored as noise.`;
}

/** @param {any} ghost @param {string} [nowIso] */
export function renderGhostCard(ghost, nowIso) {
  const readings = (ghost.readings || [])
    .map((/** @type {any} */ r) => `<div class="reading"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`)
    .join('');
  const badge = ghost.unread > 0 ? `<span class="ghost__badge" data-severity="${esc(ghost.loudest)}" aria-label="${ghost.unread} unread">${ghost.unread}</span>` : '';
  const when = ghost.lastAttemptAt ? `Last visit ${esc(ago(ghost.lastAttemptAt, nowIso))}` : 'Never visited';
  return `<article class="ghost" id="ghost-${esc(ghost.id)}" data-ghost="${esc(ghost.id)}" data-state="${esc(ghost.state)}" data-severity="${esc(ghost.loudest || '')}" data-checking="${ghost.checking ? 'true' : 'false'}">
  <button class="ghost__hit" type="button" data-action="open" data-id="${esc(ghost.id)}" aria-label="Open séance for ${esc(ghost.name)}: ${esc(STATE_WORDS[/** @type {keyof typeof STATE_WORDS} */ (ghost.state)] || ghost.state)}${ghost.unread ? `, ${ghost.unread} unread` : ''}"></button>
  <div class="ghost__spirit">
    <div class="ghost__aura"></div>
    <div class="ghost__float">${ghostSvg(ghost.state)}</div>
    <div class="ghost__shadow"></div>
    ${badge}
  </div>
  <div class="ghost__stone">
    <p class="ghost__state"><span class="dot"></span>${esc(STATE_WORDS[/** @type {keyof typeof STATE_WORDS} */ (ghost.state)] || ghost.state)}</p>
    <h3 class="ghost__name">${esc(ghost.name)}</h3>
    <p class="ghost__sub">${esc(ghost.subtitle)}</p>
    <dl class="readings">${readings}</dl>
    <p class="ghost__msg">${esc(ghost.lastMessage)}</p>
    ${ignoredChip(ghost.ignored)}
    <p class="ghost__when">${when}</p>
  </div>
</article>`;
}

/** @param {any} state */
export function renderGraveyard(state) {
  return state.ghosts.map((/** @type {any} */ g) => renderGhostCard(g, state.generatedAt)).join('\n');
}

/** @param {any} state */
export function renderStats(state) {
  const ghosts = state.ghosts;
  const restless = ghosts.filter((/** @type {any} */ g) => g.state === 'restless').length;
  const blocked = ghosts.filter((/** @type {any} */ g) => g.state === 'blocked').length;
  const lost = ghosts.filter((/** @type {any} */ g) => g.state === 'lost').length;
  const last = ghosts.map((/** @type {any} */ g) => g.lastAttemptAt).filter(Boolean).sort().pop();
  const parts = [
    `<span><b>${ghosts.length}</b> ghosts haunting ${esc(state.app.watchNoun)}</span>`,
    `<span class="stat-restless" data-count="${restless}"><b>${restless}</b> restless</span>`,
  ];
  if (blocked) parts.push(`<span><b>${blocked}</b> turned away by robots.txt</span>`);
  if (lost) parts.push(`<span><b>${lost}</b> lost</span>`);
  parts.push(`<span>last séance ${esc(ago(last, state.generatedAt))}</span>`);
  return parts.join('<span class="sep" aria-hidden="true">✦</span>');
}

/** @param {any} state */
export function renderFeed(state) {
  if (!state.feed.length) {
    const quiet = state.app.demo
      ? 'Nothing has stirred yet. Click <b>Let a night pass</b> to see what the ghosts catch.'
      : esc(state.app.quiet);
    return `<li class="feed__empty">${quiet}</li>`;
  }
  return state.feed
    .map((/** @type {any} */ entry) => {
      const a = entry.alert;
      const letter = entry.letter
        ? `<a class="feed__letter" href="/outbox/${encodeURIComponent(entry.letter)}.html" target="_blank" rel="noopener">Read the letter</a>`
        : '';
      return `<li class="feed__item" data-severity="${esc(a.severity)}" data-acknowledged="${entry.acknowledged}">
  <div class="feed__meta"><span class="sev" data-severity="${esc(a.severity)}">${esc(SEVERITY_WORDS[/** @type {keyof typeof SEVERITY_WORDS} */ (a.severity)])}</span><button type="button" class="feed__watch" data-action="open" data-id="${esc(a.watchId)}">${esc(a.watchName)}</button><time datetime="${esc(a.createdAt)}">${esc(ago(a.createdAt, state.generatedAt))}</time></div>
  <p class="feed__summary">${esc(a.summary)}</p>
  ${letter}
</li>`;
    })
    .join('\n');
}

/** @param {any} detail @param {string} [nowIso] */
export function renderDetail(detail, nowIso) {
  const shortFields = detail.fields.filter((/** @type {any} */ f) => !f.long);
  const longFields = detail.fields.filter((/** @type {any} */ f) => f.long);
  const fieldRows = shortFields
    .map(
      (/** @type {any} */ f) => `<tr data-changed="${f.changed}"><th scope="row">${esc(f.label)}</th><td class="now">${esc(f.now)}</td><td class="before">${f.before === null ? '<span class="muted">—</span>' : esc(f.before)}</td></tr>`,
    )
    .join('');
  const table = shortFields.length
    ? `<table class="values"><thead><tr><th scope="col">Watched value</th><th scope="col">Now</th><th scope="col">Before the last change</th></tr></thead><tbody>${fieldRows}</tbody></table>`
    : '';
  const blocks = longFields
    .map((/** @type {any} */ f) => {
      const body = f.segments
        ? f.segments
            .map((/** @type {any} */ s) => (s.type === 'added' ? `<ins>${esc(s.text)}</ins>` : s.type === 'removed' ? `<del>${esc(s.text)}</del>` : esc(s.text)))
            .join(' ')
        : esc(f.now);
      return `<section class="textblock" data-changed="${f.changed}"><h4>${esc(f.label)}${f.changed ? ' <span class="muted">(changes marked)</span>' : ''}</h4><p>${body}</p></section>`;
    })
    .join('');
  const fields = table + blocks;
  const lists = detail.lists
    .map(
      (/** @type {any} */ l) => `<section class="seance__list"><h4>${esc(l.label)} <span class="muted">(${l.count} on page)</span></h4><ul>${l.items
        .slice(0, 12)
        .map((/** @type {any} */ i) => `<li data-new="${i.isNew}">${i.isNew ? '<span class="new-tag">new</span>' : ''}${esc(i.description)}</li>`)
        .join('')}</ul></section>`,
    )
    .join('');
  const rules = detail.rules.map((/** @type {string} */ r) => `<li>${esc(r)}</li>`).join('');
  const alerts = detail.alerts.length
    ? detail.alerts
        .map(
          (/** @type {any} */ a) => `<li class="log__item" data-acknowledged="${a.acknowledged}" data-severity="${esc(a.severity)}"><span class="sev" data-severity="${esc(a.severity)}">${esc(SEVERITY_WORDS[/** @type {keyof typeof SEVERITY_WORDS} */ (a.severity)])}</span><div><p>${esc(a.summary)}</p><p class="muted small">${esc(clockTime(a.createdAt))} · rule: ${esc(a.ruleLabel)}${a.letter ? ` · <a href="/outbox/${encodeURIComponent(a.letter)}.html" target="_blank" rel="noopener">letter</a>` : ''}</p></div></li>`,
        )
        .join('')
    : '<li class="muted">No alerts yet. The ghost has nothing to report.</li>';
  const demo = /demo/.test(detail.interval);
  const next = demo ? 'visits whenever summoned' : detail.nextEligibleAt ? `next scheduled visit ${esc(ago(detail.nextEligibleAt, nowIso))}` : 'first visit on the next round';
  return `<header class="seance__head" data-state="${esc(detail.state)}">
  <div class="seance__ghost">${ghostSvg(detail.state)}</div>
  <div>
    <p class="eyebrow">Séance</p>
    <h2 id="seance-title">${esc(detail.name)}</h2>
    <p class="muted"><a href="${esc(detail.url)}" target="_blank" rel="noopener noreferrer">${esc(detail.url)}</a></p>
    <p class="muted small">${esc(detail.lastMessage)}</p>
    <p class="muted small">Polite schedule: ${esc(detail.interval)} · ${next} · ${detail.checks} visits so far</p>${
      detail.ignored ? `\n    <p class="muted small seance__ignored">${esc(ignoredLine(detail.ignored))}: timestamps, banners and reformatting never wake it.</p>` : ''
    }
  </div>
</header>
<div class="seance__actions">
  <button type="button" class="btn btn--glow" data-action="check" data-id="${esc(detail.id)}">Check now</button>
  <button type="button" class="btn" data-action="ack" data-id="${esc(detail.id)}" ${detail.unread ? '' : 'disabled'}>Lay to rest${detail.unread ? ` (${detail.unread})` : ''}</button>
</div>
${fields}
${renderPast(detail.past)}
${lists}
<section><h4>What makes it stir</h4><ul class="rules">${rules}</ul></section>
<section><h4>Haunting log</h4><ul class="log">${alerts}</ul></section>`;
}

/** Full first paint, rendered on the server. @param {any} state @param {{ css: string; theme: Record<string, string>; demo?: boolean }} assets */
export function renderPage(state, assets) {
  const themeVars = Object.entries(assets.theme)
    .map(([k, v]) => `--${k}:${esc(v)};`)
    .join('');
  const json = JSON.stringify(state).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(state.app.name)}</title>
<meta name="description" content="${esc(state.app.tagline)}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 142"><path fill="#f4f0ff" d="M60 8C30 8 16 33 16 62V116q7-10 14 0t15 0 15 0 15 0 15 0 14 0V62C104 33 90 8 60 8Z"/><ellipse cx="44" cy="58" rx="7" ry="10" fill="#120f22"/><ellipse cx="76" cy="58" rx="7" ry="10" fill="#120f22"/></svg>')}">
<link rel="stylesheet" href="/ui/style.css">
<style>:root{${themeVars}}</style>
</head>
<body>
<div class="sky" aria-hidden="true"><div class="stars"></div><div class="moon"></div><div class="fog fog--far"></div><div class="fog fog--near"></div></div>
<a class="skip" href="#graveyard">Skip to the ghosts</a>
<header class="masthead">
  <div class="masthead__crest" aria-hidden="true">${ghostSvg('restless')}</div>
  <div class="masthead__text">
    <p class="eyebrow">Ghost Watcher · ${esc(state.app.watchNoun)}</p>
    <h1>${esc(state.app.name)}</h1>
    <p class="tagline">${esc(state.app.tagline)}</p>
    <p class="stats" id="stats" aria-live="polite">${renderStats(state)}</p>
  </div>
  <div class="masthead__actions">${
      assets.demo
        ? `
    <button type="button" class="btn btn--glow btn--beckon" data-action="next-night" aria-describedby="night-hint">Let a night pass</button>
    <button type="button" class="btn" data-action="check-all">Summon every ghost</button>
    <p class="night-hint" id="night-hint">Demo: the invented fixture site changes overnight, then every ghost looks again.</p>`
        : `
    <button type="button" class="btn btn--glow" data-action="check-all">Summon every ghost</button>`
    }
  </div>
</header>
<main class="layout">
  <section class="graveyard" id="graveyard" aria-label="Watched pages">${renderGraveyard(state)}</section>
  <aside class="feed" aria-labelledby="feed-title">
    <h2 id="feed-title">Spirit mail</h2>
    <p class="muted small">Every alert, explained in one sentence. Letters are copies of what the outbox sent.</p>
    <ul class="feed__list" id="feed">${renderFeed(state)}</ul>
  </aside>
</main>
<footer class="foot">
  <p>We knock politely: <code>${esc(state.app.userAgent)}</code> · robots.txt honored · ${esc(state.ghosts[0]?.interval ?? '')}</p>
  <p>Snapshots: ${esc(state.app.store)} · Alerts: ${esc(state.app.alerts)} · History: ${esc(state.app.history)}${state.app.disclaimer ? ` · ${esc(state.app.disclaimer)}` : ''}</p>
</footer>
<dialog class="seance" id="seance" aria-labelledby="seance-title"><div class="seance__body" id="seance-body"></div><form method="dialog"><button class="seance__close" aria-label="Close séance">×</button></form></dialog>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script id="initial-state" type="application/json">${json}</script>
<script type="module" src="/ui/app.js"></script>
</body>
</html>`;
}
