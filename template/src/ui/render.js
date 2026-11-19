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
  const title = `<h3>Ghost of Terms Past <span class="muted">(from ${esc(past.source)})</span></h3>`;
  if (!past.entries.length) return `<section class="past" data-empty="true">${title}<p class="muted small">${esc(past.note || 'No earlier copies.')}</p></section>`;
  const words = { first: 'Earliest copy', change: 'Changed', now: 'First sighting' };
  const items = past.entries
    .map(
      (/** @type {any} */ e) => `<li class="past__entry" data-kind="${esc(e.kind)}" data-severity="${esc(e.severity || '')}" data-tone="${esc(e.tone || 'neutral')}">
  <span class="past__dot" aria-hidden="true"></span>
  <div><p class="past__when"><time datetime="${esc(e.at)}">${esc(calendarDate(e.at))}</time> · ${esc(words[/** @type {keyof typeof words} */ (e.kind)] || e.kind)}${
    e.archiveUrl ? ` · <a href="${esc(e.archiveUrl)}" target="_blank" rel="noopener noreferrer">archived copy</a>` : ''
  }</p>${e.lines.map((/** @type {string} */ line) => `<p class="past__line">${esc(line)}</p>`).join('')}</div>
</li>`,
    )
    .join('');
  const fickle = past.fickleness
    ? `<p class="past__fickle" data-label="${esc(past.fickleness.label)}"><span class="past__score">${esc(past.fickleness.perYear)}</span> changes a year · ${esc(past.fickleness.text)}</p>`
    : '';
  return `<section class="past">${title}${fickle}<p class="muted small">What this ghost would have told you, had it been watching. Read from ${past.captures} archived ${past.captures === 1 ? 'copy' : 'copies'} through the same rules; never sent as alerts.</p><ol class="past__list">${items}</ol></section>`;
}

/** "3f2a9c1b…d41e" @param {string} hex */
export function shortHash(hex) {
  return hex && hex.length > 16 ? `${hex.slice(0, 8)}…${hex.slice(-4)}` : String(hex || '');
}

/**
 * The receipt a ghost kept for a shriek or a bait and switch: a link to the archived copy and the
 * hashes of the snapshots before and after. @param {any} receipt
 */
export function renderReceipt(receipt) {
  if (!receipt) return '';
  const link = receipt.archiveUrl
    ? `<a href="${esc(receipt.archiveUrl)}" target="_blank" rel="noopener noreferrer">archived copy</a>`
    : `<span title="${esc(receipt.note || '')}">hashes only</span>`;
  return `<p class="receipt"><span class="receipt__tag">Receipt</span> ${link} · sha256 <code title="before: ${esc(receipt.before.sha256)}">${esc(shortHash(receipt.before.sha256))}</code> → <code title="after: ${esc(receipt.after.sha256)}">${esc(shortHash(receipt.after.sha256))}</code></p>`;
}

/** The bonus match variant: the page improved on what it promised the day you applied. @param {any} alert */
export function isMatch(alert) {
  const p = alert && alert.pact;
  return Boolean(p && p.relation === 'differs' && p.tone === 'good' && !alert.stealth);
}

/** One plain sentence about the change against the pact. @param {any} alert */
export function renderPactNote(alert) {
  if (!alert || !alert.pact || !alert.pact.note) return '';
  return `<p class="pact-note" data-relation="${esc(alert.pact.relation)}"><span class="pact-note__tag">Pact</span> ${esc(alert.pact.note)}</p>`;
}

/**
 * "Raise the dead": shown on every change that kept a receipt. It opens the dispute pack, or the
 * bonus match letter when the terms improved after the reader applied.
 * @param {any} alert
 */
export function renderRaiseButton(alert) {
  if (!alert || !alert.receipt) return '';
  const match = isMatch(alert);
  const label = match ? 'Ask for the match' : 'Raise the dead';
  const aria = match ? `Ask for the match: bonus match letter for ${alert.watchName}` : `Raise the dead: dispute pack for ${alert.watchName}`;
  return `<button type="button" class="btn btn--small btn--raise" data-action="dispute" data-id="${esc(alert.watchId)}" data-alert="${esc(alert.id)}" aria-label="${esc(aria)}">${label}</button>`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 10 '26" @param {string} iso */
export function compactDay(iso) {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} '${String(d.getUTCFullYear()).slice(-2)}`;
}

/** The pact line (or the "I applied today" button) on a stone. Apps without pacts have no `pact` key. @param {any} ghost */
export function renderStonePact(ghost) {
  const p = ghost.pact;
  if (p === undefined) return '';
  if (p && p.state === 'sealed') {
    return `<p class="ghost__pact" data-pact="sealed" title="Sealed ${esc(p.sealedDate)} · SHA-256 ${esc(p.sha256)}"><span class="ghost__pact-tag">Pact sealed</span> <time datetime="${esc(p.sealedAt)}">${esc(compactDay(p.sealedAt))}</time> · <code>${esc(p.shortHash)}</code>${p.seeded ? ' <span class="pact-demo">demo</span>' : ''}</p>`;
  }
  if (p && p.state === 'corrupt') {
    return '<p class="ghost__pact" data-pact="corrupt"><span class="ghost__pact-tag ghost__pact-tag--warn">Pact unreadable</span> Open the séance to fix it.</p>';
  }
  const why = ghost.canSeal ? '' : `<span class="ghost__pact-why" id="pact-why-${esc(ghost.id)}">Not seen yet. Summon the ghost first.</span>`;
  return `<div class="ghost__pact" data-pact="none"><button type="button" class="btn btn--small btn--seal" data-action="pact-seal" data-id="${esc(ghost.id)}" aria-label="I applied today: seal the pact for ${esc(ghost.name)}"${
    ghost.canSeal ? '' : ` disabled aria-describedby="pact-why-${esc(ghost.id)}"`
  }>I applied today</button>${why}</div>`;
}

/**
 * The pact section of the séance, with its confirmation step.
 * @param {any} detail @param {'replace' | 'break' | null} [confirm]
 */
export function renderPactSection(detail, confirm = null) {
  const p = detail.pact;
  if (p === undefined) return '';
  const name = esc(detail.name);
  const id = esc(detail.id);
  const seal = (/** @type {string} */ label) =>
    `<button type="button" class="btn btn--small btn--seal" data-action="pact-seal" data-id="${id}" aria-label="${esc(label)}: seal the pact for ${name}"${detail.canSeal ? '' : ' disabled'}>${esc(label)}</button>`;
  if (!p) {
    return `<section class="pact" data-pact="none" aria-labelledby="pact-title"><h3 id="pact-title">The pact</h3><p class="muted small">No pact yet. Seal one on the day you apply.</p><div class="pact__actions">${seal('I applied today')}</div>${
      detail.canSeal ? '' : '<p class="muted small">Not seen yet. Summon the ghost first.</p>'
    }</section>`;
  }
  if (p.state === 'corrupt') {
    return `<section class="pact" data-pact="corrupt" aria-labelledby="pact-title"><h3 id="pact-title">The pact <span class="pact__warn">unreadable</span></h3><p class="small">The pact cannot be read: ${esc(p.reason)}. Checks go on without it.</p><div class="pact__actions">${seal('Seal again')}<button type="button" class="btn btn--small" data-action="pact-ask-break" data-id="${id}" aria-label="Break the pact for ${name}">Break the pact</button></div>${renderPactConfirm(detail, confirm)}</section>`;
  }
  const archive = p.archive || {};
  const copy = archive.archiveUrl && /^https?:\/\//i.test(archive.archiveUrl)
    ? `<a href="${esc(archive.archiveUrl)}" target="_blank" rel="noopener noreferrer">archived copy</a>${archive.archivedBy ? ` held by ${esc(archive.archivedBy)}` : ''}`
    : `hashes only${archive.note ? ` <span class="muted">(${esc(archive.note)})</span>` : ''}`;
  return `<section class="pact" data-pact="sealed" aria-labelledby="pact-title"><h3 id="pact-title">The pact${p.seeded ? ' <span class="pact-demo">demo pact</span>' : ''}</h3>
<dl class="pact__facts">
<div><dt>Sealed</dt><dd><time datetime="${esc(p.sealedAt)}">${esc(p.sealedDate)}</time> · ${esc(clockTime(p.sealedAt))}</dd></div>
<div><dt>Reading sealed</dt><dd>the page as the ghost saw it on <time datetime="${esc(p.snapshotTakenAt)}">${esc(clockTime(p.snapshotTakenAt))}</time> (${esc(ago(p.snapshotTakenAt, p.sealedAt))} when sealed)</dd></div>
<div><dt>SHA-256</dt><dd><code class="pact__hash">${esc(p.sha256)}</code></dd></div>
<div><dt>Copy</dt><dd>${copy}</dd></div>
</dl>
<p class="muted small">Check it yourself: <code>shasum -a 256 .ghost-data/store/pacts/${esc(detail.id)}/${esc(p.sha256)}.json</code></p>
<div class="pact__actions"><button type="button" class="btn btn--small" data-action="pact-ask-replace" data-id="${id}" aria-label="Seal again: replace the pact for ${name}">Seal again</button><button type="button" class="btn btn--small" data-action="pact-ask-break" data-id="${id}" aria-label="Break the pact for ${name}">Break the pact</button></div>${renderPactConfirm(detail, confirm)}</section>`;
}

/** @param {any} detail @param {'replace' | 'break' | null} confirm */
function renderPactConfirm(detail, confirm) {
  if (!confirm) return '';
  const p = detail.pact;
  const when = p && p.sealedDate ? ` sealed ${esc(p.sealedDate)}` : '';
  const id = esc(detail.id);
  const text =
    confirm === 'replace'
      ? `<b>Replace the pact${when}?</b> The old one is deleted.`
      : `<b>Break the pact${when}?</b> Its record and snapshot are deleted. Alerts already raised keep their own copy.`;
  const yes = confirm === 'replace' ? 'Yes, replace' : 'Yes, break';
  return `<div class="pact__confirm" role="group" aria-labelledby="pact-confirm-text" data-confirm="${esc(confirm)}"><p id="pact-confirm-text">${text}</p><button type="button" class="btn btn--small btn--raise" data-action="pact-confirm-${esc(confirm)}" data-id="${id}">${yes}</button> <button type="button" class="btn btn--small" data-action="pact-cancel" data-id="${id}">Keep it</button></div>`;
}

/**
 * The dispute pack: a letter to the bank, the evidence, and prefilled CFPB complaint text.
 * @param {any} pack
 */
export function renderDispute(pack) {
  const lines = (/** @type {string[]} */ list) => list.map((line) => `<li>${esc(line)}</li>`).join('');
  const evidence = pack.evidence
    .map((/** @type {any} */ row) => `<tr><th scope="row">${esc(row.label)}</th><td><code>${esc(row.value)}</code></td></tr>`)
    .join('');
  const c = pack.complaint;
  const pact = pack.pact;
  const match = Boolean(pact && pact.variant === 'match');
  const promised = Boolean(pact && pact.relation === 'differs');
  const title = match ? 'Bonus match' : 'Dispute pack';
  const intro = match
    ? `The bank improved its terms after you applied. Ask it for the better terms. Fill in the bracketed blanks (${esc(pack.blanks.join(', '))}), then send it yourself. Nothing here is sent for you.`
    : `Show the bank its own terms from the day you applied. Fill in the bracketed blanks (${esc(pack.blanks.join(', '))}), then send it yourself. Nothing here is sent for you.`;
  const beforeHead = promised ? `${esc(pack.beforeDate)}, the day you applied: what the page promised` : `${esc(pack.beforeDate)}: what the page said`;
  const complaint = match
    ? ''
    : `
<section class="dispute__block">
  <h3>3. If the bank says no: a CFPB complaint</h3>
  <p class="muted small">At <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">consumerfinance.gov/complaint</a> choose <b>${esc(c.product)}</b>, then <b>${esc(c.issue)}</b>, then <b>${esc(c.subIssue)}</b>.</p>
  <label for="dispute-cfpb">What happened</label>
  <textarea class="dispute__text" id="dispute-cfpb" readonly rows="7">${esc(c.whatHappened)}</textarea>
  <button type="button" class="btn btn--small" data-action="copy" data-target="dispute-cfpb">Copy the complaint text</button>
  <p class="muted small">Fair resolution: <span class="dispute__resolution">${esc(c.desiredResolution)}</span></p>
</section>`;
  return `<header class="dispute__head"${pact ? ` data-variant="${match ? 'match' : 'dispute'}"` : ''}>
  <div class="seance__ghost">${ghostSvg('restless')}</div>
  <div>
    <p class="eyebrow">Raise the dead · ${esc(pack.kind)}</p>
    <h2 id="seance-title">${title}: ${esc(pack.watchName)}</h2>
    <p class="muted small">${intro}</p>
  </div>
</header>
<div class="seance__actions">
  <button type="button" class="btn" data-action="open" data-id="${esc(pack.watchId)}">Back to the séance</button>
</div>
<section class="dispute__terms">
  <div class="dispute__side" data-side="before"><h3>${beforeHead}</h3><ul>${lines(pack.before)}</ul></div>
  <div class="dispute__side" data-side="after"><h3>${esc(pack.afterDate)}: what it says now</h3><ul>${lines(pack.after)}</ul></div>
</section>
<section class="dispute__block">
  <h3>1. Letter to the bank</h3>
  <p class="muted small">Subject: <span class="dispute__subject">${esc(pack.letter.subject)}</span></p>
  <label for="dispute-letter">Letter to the bank</label>
  <textarea class="dispute__text" id="dispute-letter" readonly rows="14">${esc(pack.letter.body)}</textarea>
  <button type="button" class="btn btn--small" data-action="copy" data-target="dispute-letter">Copy the letter</button>
</section>
<section class="dispute__block">
  <h3>2. Evidence</h3>
  <table class="values dispute__evidence"><tbody>${evidence}</tbody></table>
</section>${complaint}`;
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
    .map((/** @type {any} */ r) =>
      r.match
        ? `<div class="reading reading--match"${r.tone ? ` data-tone="${esc(r.tone)}"` : ''}><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`
        : r.before !== undefined
        ? `<div class="reading" data-changed="true" data-tone="${esc(r.tone || 'neutral')}"><dt>${esc(r.label)}</dt><dd><del aria-label="was ${esc(r.before)}">${esc(r.before)}</del> <ins aria-label="now ${esc(r.value)}"${r.value === 'gone' ? ' data-gone="true"' : ''}>${esc(r.value)}</ins></dd></div>`
        : `<div class="reading"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`,
    )
    .join('');
  const ribbon = ghost.headline
    ? `<p class="ghost__ribbon" data-tone="${esc(ghost.headline.tone)}" title="Found by the Ghost of Terms Past in archived copies"><span class="ghost__ribbon-tag">From the archive</span> ${esc(ghost.headline.text)}</p>`
    : '';
  const fickle =
    ghost.fickleness && ghost.fickleness.changes > 0
      ? `<p class="ghost__fickle" data-label="${esc(ghost.fickleness.label)}">${esc(ghost.fickleness.text)}</p>`
      : '';
  const crack =
    ghost.state === 'restless' && ghost.loudest === 'shriek'
      ? '<svg class="ghost__crack" viewBox="0 0 60 90" aria-hidden="true" focusable="false"><path d="M34 0 L26 18 L36 30 L22 48 L31 60 L20 90"/><path d="M26 18 L14 24 M22 48 L10 52 M31 60 L42 70"/></svg>'
      : '';
  const badge =
    ghost.unread > 0
      ? `<span class="ghost__badge" data-severity="${esc(ghost.loudest)}" role="img" aria-label="${ghost.unread} unread ${ghost.unread === 1 ? 'change' : 'changes'}">${ghost.unread}</span>`
      : '';
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
    ${crack}${ribbon}
    <p class="ghost__state"><span class="dot"></span>${esc(STATE_WORDS[/** @type {keyof typeof STATE_WORDS} */ (ghost.state)] || ghost.state)}</p>
    <h2 class="ghost__name">${esc(ghost.name)}</h2>
    <p class="ghost__sub">${esc(ghost.subtitle)}</p>
    <dl class="readings">${readings}</dl>
    <p class="ghost__msg">${esc(ghost.lastMessage)}</p>
    ${fickle}${ignoredChip(ghost.ignored)}
    ${renderStonePact(ghost)}
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

/**
 * Tonight's tally, under the graveyard: letters sent, page changes slept through, doors respected.
 * @param {any} state
 */
export function renderTally(state) {
  const letters = state.feed.length;
  const ignored = state.ghosts.reduce((sum, /** @type {any} */ g) => sum + (g.ignored || 0), 0);
  const doors = state.ghosts.filter((/** @type {any} */ g) => g.state === 'blocked').length;
  const plural = (/** @type {number} */ n, /** @type {string} */ one, /** @type {string} */ many) => `<b>${n}</b> ${n === 1 ? one : many}`;
  return `<span class="tally__title">Tonight's tally</span><span>${plural(letters, 'letter sent', 'letters sent')}</span><span>${plural(ignored, 'page change slept through', 'page changes slept through')}</span><span>${plural(doors, 'door respected', 'doors respected')} (robots.txt)</span>`;
}

/**
 * Letters from the Ghost of Terms Past: changes found in archived copies before the ghost arrived.
 * Dimmed, and never counted as alerts. @param {any} state
 */
export function renderArchiveLetters(state) {
  return (state.archive || [])
    .map(
      (/** @type {any} */ letter) => `<li class="feed__item feed__item--archive" data-archive="true" data-tone="${esc(letter.tone || 'neutral')}">
  <div class="feed__meta"><span class="sev sev--archive">Archive</span><button type="button" class="feed__watch" data-action="open" data-id="${esc(letter.watchId)}">${esc(letter.watchName)}</button><time datetime="${esc(letter.at)}">${esc(calendarDate(letter.at))}</time></div>
  ${letter.lines.map((/** @type {string} */ line) => `<p class="feed__summary">${esc(line)}</p>`).join('')}
  ${letter.archiveUrl ? `<a class="feed__letter" href="${esc(letter.archiveUrl)}" target="_blank" rel="noopener noreferrer">Archived copy</a>` : ''}
</li>`,
    )
    .join('\n');
}

/** @param {any} state */
export function renderFeed(state) {
  const archive = renderArchiveLetters(state);
  if (!state.feed.length) {
    const quiet = state.app.demo
      ? 'Nothing has stirred yet. Click <b>Let a night pass</b> to see what the ghosts catch.'
      : esc(state.app.quiet);
    return `<li class="feed__empty">${quiet}</li>${archive ? `\n${archive}` : ''}`;
  }
  return `${renderLiveLetters(state)}${archive ? `\n${archive}` : ''}`;
}

/** @param {any} state */
function renderLiveLetters(state) {
  return state.feed
    .map((/** @type {any} */ entry) => {
      const a = entry.alert;
      const letter = entry.letter
        ? `<a class="feed__letter" href="/outbox/${encodeURIComponent(entry.letter)}.html" target="_blank" rel="noopener">Read the letter</a>`
        : '';
      const stealth = a.stealth
        ? `<p class="stealth"><span class="stealth__tag">Bait and switch</span> ${esc(a.stealth)}</p>`
        : '';
      return `<li class="feed__item" data-severity="${esc(a.severity)}" data-tone="${esc(a.tone || 'neutral')}" data-acknowledged="${entry.acknowledged}"${a.stealth ? ' data-stealth="true"' : ''}>
  <div class="feed__meta"><span class="sev" data-severity="${esc(a.severity)}">${esc(SEVERITY_WORDS[/** @type {keyof typeof SEVERITY_WORDS} */ (a.severity)])}</span><button type="button" class="feed__watch" data-action="open" data-id="${esc(a.watchId)}">${esc(a.watchName)}</button><time datetime="${esc(a.createdAt)}">${esc(ago(a.createdAt, state.generatedAt))}</time></div>
  ${stealth}<p class="feed__summary">${esc(a.summary)}</p>
  ${renderPactNote(a)}${renderReceipt(a.receipt)}<div class="feed__actions">${letter}${state.app.disputes ? renderRaiseButton(a) : ''}</div>
</li>`;
    })
    .join('\n');
}

/** @param {any} detail @param {string} [nowIso] @param {{ disputes?: boolean; confirm?: 'replace' | 'break' | null }} [options] */
export function renderDetail(detail, nowIso, options = {}) {
  const shortFields = detail.fields.filter((/** @type {any} */ f) => !f.long);
  const longFields = detail.fields.filter((/** @type {any} */ f) => f.long);
  const sealed = Boolean(detail.pact && detail.pact.state === 'sealed');
  const fieldRows = shortFields
    .map(
      (/** @type {any} */ f) => `<tr data-changed="${f.changed}"${sealed && f.pact !== undefined && f.pact !== f.now ? ' data-pact-differs="true"' : ''}><th scope="row">${esc(f.label)}</th><td class="now">${esc(f.now)}</td><td class="before">${f.before === null ? '<span class="muted">—</span>' : f.changed ? esc(f.before) : '<span class="muted">unchanged</span>'}</td>${
        sealed ? `<td class="pact-value">${f.pact === undefined || f.pact === null ? '<span class="muted">—</span>' : esc(f.pact)}</td>` : ''
      }</tr>`,
    )
    .join('');
  const table = shortFields.length
    ? `<table class="values"><thead><tr><th scope="col">Watched value</th><th scope="col">Now</th><th scope="col">Before the last change</th>${sealed ? '<th scope="col">The day you applied</th>' : ''}</tr></thead><tbody>${fieldRows}</tbody></table>`
    : '';
  const blocks = longFields
    .map((/** @type {any} */ f) => {
      const body = f.segments
        ? f.segments
            .map((/** @type {any} */ s) => (s.type === 'added' ? `<ins>${esc(s.text)}</ins>` : s.type === 'removed' ? `<del>${esc(s.text)}</del>` : esc(s.text)))
            .join(' ')
        : esc(f.now);
      return `<section class="textblock" data-changed="${f.changed}"><h3>${esc(f.label)}${f.changed ? ' <span class="muted">(changes marked)</span>' : ''}</h3><p>${body}</p></section>`;
    })
    .join('');
  const fields = table + blocks;
  const lists = detail.lists
    .map(
      (/** @type {any} */ l) => `<section class="seance__list"><h3>${esc(l.label)} <span class="muted">(${l.count} on page)</span></h3><ul>${l.items
        .slice(0, 12)
        .map((/** @type {any} */ i) => `<li data-new="${i.isNew}">${i.isNew ? '<span class="new-tag">new</span>' : ''}${esc(i.description)}</li>`)
        .join('')}</ul></section>`,
    )
    .join('');
  const rules = detail.rules.map((/** @type {string} */ r) => `<li>${esc(r)}</li>`).join('');
  const alerts = detail.alerts.length
    ? detail.alerts
        .map(
          (/** @type {any} */ a) => `<li class="log__item" data-acknowledged="${a.acknowledged}" data-severity="${esc(a.severity)}"><span class="sev" data-severity="${esc(a.severity)}">${esc(SEVERITY_WORDS[/** @type {keyof typeof SEVERITY_WORDS} */ (a.severity)])}</span><div>${a.stealth ? `<p class="stealth"><span class="stealth__tag">Bait and switch</span> ${esc(a.stealth)}</p>` : ''}<p>${esc(a.summary)}</p>${renderPactNote(a)}${renderReceipt(a.receipt)}${options.disputes ? renderRaiseButton({ ...a, watchId: detail.id, watchName: detail.name }) : ''}<p class="muted small">${esc(clockTime(a.createdAt))} · rule: ${esc(a.ruleLabel)}${a.letter ? ` · <a href="/outbox/${encodeURIComponent(a.letter)}.html" target="_blank" rel="noopener">letter</a>` : ''}</p></div></li>`,
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
${renderPactSection(detail, options.confirm || null)}
${renderPast(detail.past)}
${lists}
<section><h3>What makes it stir</h3><ul class="rules">${rules}</ul></section>
<section><h3>Haunting log</h3><ul class="log">${alerts}</ul></section>`;
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
<body data-motif="${esc(state.app.motif || 'stone')}">
<div class="sky" aria-hidden="true"><div class="stars"></div><div class="moon"></div><div class="lightning"></div><div class="fog fog--far"></div><div class="fog fog--near"></div></div>
<a class="skip" href="#graveyard">Skip to the ghosts</a>
<header class="masthead">
  <div class="masthead__crest" aria-hidden="true">${ghostSvg('restless')}<span class="masthead__crest-word">${esc(state.app.crest || 'Watch')}</span></div>
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
    <button type="button" class="btn btn--rewind" data-action="rewind"${state.app.night ? '' : ' hidden'}>Rewind to calm</button>
    <p class="night-hint" id="night-hint">Demo: the invented fixture site changes overnight, then every ghost looks again. Press <kbd>N</kbd>.</p>`
        : `
    <button type="button" class="btn btn--glow" data-action="check-all">Summon every ghost</button>`
    }
  </div>
</header>
<a class="feed-pill" href="#feed-title" id="feed-pill">${esc(state.app.feedName || 'Spirit mail')} <span id="feed-pill-count">${state.feed.filter((/** @type {any} */ e) => !e.acknowledged).length}</span></a>
<main class="layout">
  <div class="crypt">
    <section class="graveyard" id="graveyard" aria-label="Watched pages">${renderGraveyard(state)}</section>
    <p class="tally" id="tally">${renderTally(state)}</p>
  </div>
  <aside class="feed" aria-labelledby="feed-title">
    <h2 id="feed-title">${esc(state.app.feedName || 'Spirit mail')}</h2>
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
