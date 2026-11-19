/** Renders one check run's alerts as an email (plain text and HTML). Pure. */
import type { Receipt } from '../receipts';
import type { Alert, AlertMessage } from './types';

const SEVERITY_WORD: Record<Alert['severity'], string> = {
  whisper: 'Whisper',
  moan: 'Moan',
  shriek: 'Shriek',
};

const SEVERITY_COLOR: Record<Alert['severity'], string> = {
  whisper: '#7f8aa3',
  moan: '#c9a227',
  shriek: '#d9534f',
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderOptions {
  appName: string;
  to: string[];
  watch: { id: string; name: string; url: string };
  alerts: Alert[];
  createdAt: string;
  /** Optional line at the bottom of every email, e.g. a disclaimer. */
  footer?: string;
}

/** The receipt lines of a letter: where the archived copy is, and the hashes of both snapshots. */
export function receiptLines(receipt: Receipt): string[] {
  return [
    receipt.archiveUrl
      ? `Archived copy: ${receipt.archiveUrl} (${receipt.archivedBy ?? 'archive'}${receipt.archivedAt ? `, saved ${receipt.archivedAt}` : ', requested just now'})`
      : `Archived copy: none. ${receipt.note ?? ''}`.trim(),
    `Before: sha256 ${receipt.before.sha256} (snapshot of ${receipt.before.takenAt})`,
    `After:  sha256 ${receipt.after.sha256} (snapshot of ${receipt.after.takenAt})`,
  ];
}

function receiptHtml(receipt: Receipt): string {
  const mono = 'font:12px/1.5 ui-monospace,Menlo,monospace;color:#d8cff5;word-break:break-all';
  const link = receipt.archiveUrl
    ? `<a href="${escapeHtml(receipt.archiveUrl)}" style="color:#b9a4ff">Archived copy of the page</a> <span style="color:#9a93b8">(${escapeHtml(receipt.archivedBy ?? 'archive')})</span>`
    : `<span style="color:#9a93b8">${escapeHtml(receipt.note ?? 'No archived copy.')}</span>`;
  return `<tr><td style="padding:6px 22px 4px"><div style="border:1px dashed #4a3f78;border-radius:10px;padding:12px 14px">
<div style="font:700 11px/1.4 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#e8c66a;margin-bottom:6px">The ghost kept a receipt</div>
<div style="font:13px/1.5 system-ui,sans-serif;color:#ece6ff;margin-bottom:6px">${link}</div>
<div style="${mono}">before sha256 ${escapeHtml(receipt.before.sha256)}<br>after&nbsp; sha256 ${escapeHtml(receipt.after.sha256)}</div>
</div></td></tr>`;
}

export function renderAlertMessage(options: RenderOptions): AlertMessage {
  const { appName, watch, alerts, createdAt } = options;
  const count = alerts.length;
  const loudest = alerts.some((a) => a.severity === 'shriek') ? 'shriek' : alerts.some((a) => a.severity === 'moan') ? 'moan' : 'whisper';
  const stealthy = alerts.some((a) => a.stealth);
  const receipt = alerts.find((a) => a.receipt)?.receipt;
  const subject = `${loudest === 'shriek' ? '[!] ' : ''}${stealthy ? 'Bait and switch on ' : ''}${watch.name}: ${count === 1 ? alerts[0]?.summary ?? 'a change' : `${count} changes`}`.slice(0, 180);

  const text = [
    `${appName}: your ghost saw something on ${watch.name}.`,
    '',
    ...alerts.map((a) => `- [${SEVERITY_WORD[a.severity]}] ${a.stealth ? `BAIT AND SWITCH: ${a.stealth} ` : ''}${a.summary}\n  Rule: ${a.ruleLabel}`),
    ...(receipt ? ['', 'The ghost kept a receipt:', ...receiptLines(receipt).map((line) => `  ${line}`)] : []),
    '',
    `Page: ${watch.url}`,
    `Checked: ${createdAt}`,
    ...(options.footer ? ['', options.footer] : []),
  ].join('\n');

  const rows = alerts
    .map(
      (a) => `<tr>
  <td style="padding:10px 12px;vertical-align:top;width:76px"><span style="display:inline-block;padding:2px 8px;border-radius:999px;font:600 11px/18px system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#0d0b14;background:${SEVERITY_COLOR[a.severity]}">${SEVERITY_WORD[a.severity]}</span></td>
  <td style="padding:10px 12px;font:15px/1.5 Georgia,serif;color:#ece6ff">${a.stealth ? `<div style="font:700 11px/1.4 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#ff8f87;margin-bottom:4px">Bait and switch</div><div style="font:13px/1.4 system-ui,sans-serif;color:#d8cff5;margin-bottom:4px">${escapeHtml(a.stealth)}</div>` : ''}${escapeHtml(a.summary)}<div style="font:12px/1.4 ui-monospace,Menlo,monospace;color:#9a93b8;margin-top:4px">Rule: ${escapeHtml(a.ruleLabel)}</div></td>
</tr>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#0d0b14;padding:24px 12px">
<table role="presentation" style="max-width:620px;margin:0 auto;background:#17132a;border:1px solid #2e2650;border-radius:14px;border-collapse:separate;width:100%">
<tr><td style="padding:22px 22px 6px;font:700 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:#9a93b8">${escapeHtml(appName)}</td></tr>
<tr><td style="padding:4px 22px 14px;font:600 22px/1.3 Georgia,serif;color:#f4f0ff">Your ghost saw something on ${escapeHtml(watch.name)}</td></tr>
<tr><td style="padding:0 10px"><table role="presentation" style="width:100%;border-collapse:collapse">${rows}</table></td></tr>
${receipt ? receiptHtml(receipt) : ''}
<tr><td style="padding:16px 22px 6px;font:13px/1.5 system-ui,sans-serif;color:#b8b0d8"><a href="${escapeHtml(watch.url)}" style="color:#b9a4ff">Open the page</a> &middot; checked ${escapeHtml(createdAt)}</td></tr>
${options.footer ? `<tr><td style="padding:6px 22px 20px;font:12px/1.5 system-ui,sans-serif;color:#7f789c">${escapeHtml(options.footer)}</td></tr>` : '<tr><td style="padding:0 0 14px"></td></tr>'}
</table></body></html>
`;

  return {
    watchId: watch.id,
    watchName: watch.name,
    url: watch.url,
    appName,
    to: options.to,
    subject,
    text,
    html,
    alerts,
    createdAt,
  };
}
