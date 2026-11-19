/**
 * Webhook alert adapter: posts each alert message to a push service, so a phone buzzes when a ghost
 * shrieks. Opt-in with `GHOST_ALERTS=webhook` and `GHOST_WEBHOOK_URL`.
 *
 *   ntfy     JSON publish to the server root: { topic, title, message, tags, priority, click }
 *   discord  Execute Webhook: { content (at most 2000 characters), allowed_mentions: { parse: [] } }
 *   slack    Incoming webhook: { text }
 *   json     The alert message itself, without the HTML body, for your own endpoint
 *
 * The format is detected from the URL (ntfy.sh, discord.com/api/webhooks, hooks.slack.com) or set
 * with `GHOST_WEBHOOK_FORMAT`. Webhook URLs often carry a secret token, so the URL is never logged
 * or returned in a receipt.
 */
import type { Alert, AlertMessage, AlertSink, DeliveryReceipt } from './types';

export type WebhookFormat = 'ntfy' | 'discord' | 'slack' | 'json';
export const WEBHOOK_FORMATS: readonly WebhookFormat[] = ['ntfy', 'discord', 'slack', 'json'];

export type PostTransport = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface WebhookRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Picks the payload format from well-known webhook hosts; anything else gets plain JSON. */
export function detectWebhookFormat(url: string): WebhookFormat {
  const { hostname, pathname } = new URL(url);
  if (hostname === 'ntfy.sh') return 'ntfy';
  if ((hostname === 'discord.com' || hostname === 'discordapp.com' || hostname.endsWith('.discord.com')) && pathname.startsWith('/api/webhooks/')) return 'discord';
  if (hostname === 'hooks.slack.com') return 'slack';
  return 'json';
}

function alertLine(alert: Alert): string {
  return `${alert.stealth ? `Bait and switch: ${alert.stealth} ` : ''}${alert.summary}`;
}

/** The short form a phone notification can show: one line per alert, then the page. */
export function compactText(message: AlertMessage): string {
  const lines = message.alerts.map((a) => (message.alerts.length === 1 ? alertLine(a) : `- ${alertLine(a)}`));
  const archived = message.alerts.find((a) => a.receipt?.archiveUrl)?.receipt?.archiveUrl;
  return [...lines, message.url, ...(archived ? [`Receipt: ${archived}`] : [])].join('\n');
}

const NTFY_PRIORITY: Record<Alert['severity'], number> = { whisper: 2, moan: 3, shriek: 4 };

function loudest(message: AlertMessage): Alert['severity'] {
  if (message.alerts.some((a) => a.severity === 'shriek')) return 'shriek';
  return message.alerts.some((a) => a.severity === 'moan') ? 'moan' : 'whisper';
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Builds the HTTP request for one alert message. Pure, so every format is testable without a network. */
export function buildWebhookRequest(message: AlertMessage, url: string, format: WebhookFormat = detectWebhookFormat(url)): WebhookRequest {
  const headers = { 'Content-Type': 'application/json' };
  switch (format) {
    case 'ntfy': {
      // ntfy takes JSON at the server root and the topic in the body; the URL names the topic.
      const target = new URL(url);
      const segments = target.pathname.split('/').filter(Boolean);
      const topic = segments.pop();
      if (!topic) throw new Error('An ntfy webhook URL must end with the topic, e.g. https://ntfy.sh/my-ghosts.');
      target.pathname = `/${segments.join('/')}`;
      const severity = loudest(message);
      return {
        url: target.toString(),
        headers,
        body: JSON.stringify({
          topic,
          title: truncate(message.subject, 250),
          message: compactText(message),
          tags: ['ghost', ...(message.alerts.some((a) => a.stealth) ? ['warning'] : [])],
          priority: NTFY_PRIORITY[severity],
          click: message.url,
        }),
      };
    }
    case 'discord':
      return {
        url,
        headers,
        body: JSON.stringify({
          username: truncate(message.appName, 80),
          content: truncate(`**${message.subject}**\n${compactText(message)}`, 2000),
          allowed_mentions: { parse: [] },
        }),
      };
    case 'slack':
      return { url, headers, body: JSON.stringify({ text: `*${message.subject}*\n${compactText(message)}` }) };
    case 'json': {
      const { html: _html, ...rest } = message;
      return { url, headers, body: JSON.stringify(rest) };
    }
  }
}

export interface WebhookAlertSinkOptions {
  url: string;
  format?: WebhookFormat;
  timeoutMs?: number;
  transport?: PostTransport;
}

export class WebhookAlertSink implements AlertSink {
  readonly channel = 'webhook';
  readonly format: WebhookFormat;
  private readonly transport: PostTransport;

  constructor(private readonly options: WebhookAlertSinkOptions) {
    new URL(options.url);
    this.format = options.format ?? detectWebhookFormat(options.url);
    this.transport = options.transport ?? (globalThis.fetch as unknown as PostTransport);
  }

  async deliver(message: AlertMessage): Promise<DeliveryReceipt> {
    const request = buildWebhookRequest(message, this.options.url, this.format);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    try {
      const response = await this.transport(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: controller.signal });
      const body = await response.text().catch(() => '');
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`The ${this.format} webhook answered HTTP ${response.status}.`);
      }
      return { channel: this.channel, reference: `${this.format}:${receiptId(body) ?? response.status}` };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** ntfy answers with the published message, including its id; other services answer `ok` or nothing. */
function receiptId(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { id?: unknown };
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}
