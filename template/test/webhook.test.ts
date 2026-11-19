import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { defineApp } from '../src/app';
import { renderAlertMessage } from '../src/alerts/render';
import type { Alert } from '../src/alerts/types';
import { WebhookAlertSink, buildWebhookRequest, compactText, detectWebhookFormat } from '../src/alerts/webhook';
import { ConfigError, loadDeps } from '../src/config';
import { defineWatch, rules } from '../src/watch';

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: 'lantern-1',
  watchId: 'lantern',
  watchName: 'Lanternfield Checking',
  url: 'https://bank.example.com/offer',
  createdAt: '2026-11-18T12:00:00.000Z',
  severity: 'shriek',
  ruleKind: 'wentUp',
  ruleLabel: 'Bonus goes up',
  summary: 'Bonus went up from $300 to $400 (+$100).',
  ...over,
});

const message = (alerts: Alert[] = [alert()]) =>
  renderAlertMessage({
    appName: 'The Bonus Crypt',
    to: ['bonus.hunter@example.com'],
    watch: { id: 'lantern', name: 'Lanternfield Checking', url: 'https://bank.example.com/offer' },
    alerts,
    createdAt: '2026-11-18T12:00:00.000Z',
  });

describe('webhook payloads', () => {
  it('detects the format from well-known webhook URLs', () => {
    expect(detectWebhookFormat('https://ntfy.sh/crypt-alerts')).toBe('ntfy');
    expect(detectWebhookFormat('https://discord.com/api/webhooks/123/token')).toBe('discord');
    expect(detectWebhookFormat('https://hooks.slack.com/services/T0/B0/x')).toBe('slack');
    expect(detectWebhookFormat('https://hooks.example.org/ghosts')).toBe('json');
    expect(detectWebhookFormat('https://discord.com/channels/1')).toBe('json');
  });

  it('keeps the phone text short: one line per alert, bait and switch first, then the page', () => {
    expect(compactText(message())).toBe('Bonus went up from $300 to $400 (+$100).\nhttps://bank.example.com/offer');
    const two = message([alert(), alert({ id: '2', severity: 'moan', summary: 'Fine print now says "A fee applies."', stealth: 'Bonus stayed the same while the fine print changed.' })]);
    expect(compactText(two)).toBe(
      '- Bonus went up from $300 to $400 (+$100).\n- Bait and switch: Bonus stayed the same while the fine print changed. Fine print now says "A fee applies."\nhttps://bank.example.com/offer',
    );
  });

  it('publishes to ntfy as JSON at the server root, with the topic in the body', () => {
    const request = buildWebhookRequest(message(), 'https://ntfy.sh/crypt-alerts');
    expect(request.url).toBe('https://ntfy.sh/');
    expect(JSON.parse(request.body)).toEqual({
      topic: 'crypt-alerts',
      title: '[!] Lanternfield Checking: Bonus went up from $300 to $400 (+$100).',
      message: 'Bonus went up from $300 to $400 (+$100).\nhttps://bank.example.com/offer',
      tags: ['ghost'],
      priority: 4,
      click: 'https://bank.example.com/offer',
    });
    const selfHosted = buildWebhookRequest(message([alert({ severity: 'whisper', stealth: 'x' })]), 'https://push.example.org/ntfy/ghosts', 'ntfy');
    expect(selfHosted.url).toBe('https://push.example.org/ntfy');
    expect(JSON.parse(selfHosted.body)).toMatchObject({ topic: 'ghosts', priority: 2, tags: ['ghost', 'warning'] });
    expect(() => buildWebhookRequest(message(), 'https://ntfy.sh/', 'ntfy')).toThrow(/topic/);
  });

  it('posts Discord content under 2000 characters with mentions disabled', () => {
    const many = message(Array.from({ length: 60 }, (_, i) => alert({ id: String(i), summary: `Change ${i}: ${'x'.repeat(60)}` })));
    const body = JSON.parse(buildWebhookRequest(many, 'https://discord.com/api/webhooks/1/t').body);
    expect(body.content.length).toBeLessThanOrEqual(2000);
    expect(body.content.startsWith('**[!] Lanternfield Checking: 60 changes**\n')).toBe(true);
    expect(body).toMatchObject({ username: 'The Bonus Crypt', allowed_mentions: { parse: [] } });
  });

  it('posts Slack text, and plain JSON without the HTML body', () => {
    expect(JSON.parse(buildWebhookRequest(message(), 'https://hooks.slack.com/services/T/B/x').body)).toEqual({
      text: '*[!] Lanternfield Checking: Bonus went up from $300 to $400 (+$100).*\nBonus went up from $300 to $400 (+$100).\nhttps://bank.example.com/offer',
    });
    const json = JSON.parse(buildWebhookRequest(message(), 'https://hooks.example.org/ghosts').body);
    expect(json).toMatchObject({ watchId: 'lantern', subject: '[!] Lanternfield Checking: Bonus went up from $300 to $400 (+$100).' });
    expect(json.html).toBeUndefined();
    expect(json.alerts[0].summary).toBe('Bonus went up from $300 to $400 (+$100).');
  });
});

describe('WebhookAlertSink over real HTTP', () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
    server = undefined;
  });

  async function listen(reply: (req: IncomingMessage, body: string) => { status: number; body: string }) {
    const seen: Array<{ path: string; type: string | undefined; body: string }> = [];
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        seen.push({ path: req.url ?? '', type: req.headers['content-type'], body });
        const answer = reply(req, body);
        res.writeHead(answer.status, { 'Content-Type': 'application/json' }).end(answer.body);
      });
    });
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
  }

  it('delivers an ntfy message and keeps the published id as the receipt, never the URL', async () => {
    const { origin, seen } = await listen(() => ({ status: 200, body: '{"id":"sPs71M8A2T","topic":"crypt"}' }));
    const sink = new WebhookAlertSink({ url: `${origin}/crypt`, format: 'ntfy' });
    expect(await sink.deliver(message())).toEqual({ channel: 'webhook', reference: 'ntfy:sPs71M8A2T' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toBe('/');
    expect(seen[0]?.type).toBe('application/json');
    expect(JSON.parse(seen[0]?.body ?? '{}')).toMatchObject({ topic: 'crypt', priority: 4 });
  });

  it('turns an error status into a failed delivery', async () => {
    const { origin } = await listen(() => ({ status: 403, body: 'forbidden' }));
    await expect(new WebhookAlertSink({ url: `${origin}/hook` }).deliver(message())).rejects.toThrow('The json webhook answered HTTP 403.');
  });
});

describe('webhook configuration', () => {
  const app = defineApp({
    id: 'hook-app',
    name: 'Hook Crypt',
    tagline: 'Testing',
    version: '0.1.0',
    alertTo: ['tester@example.com'],
    copy: { watchNoun: 'pages', quiet: 'Quiet.' },
    watches: [defineWatch({ id: 'w', name: 'W', url: 'http://127.0.0.1:9/', fields: [{ name: 'a', selector: 'p', kind: 'text' }], rules: [rules.changed('a')] })],
  });
  const env = { GHOST_STORE: 'memory' };

  it('needs a URL, https for remote hosts, and a known format', async () => {
    await expect(loadDeps(app, { env: { ...env, GHOST_ALERTS: 'webhook' } })).rejects.toThrow(/GHOST_WEBHOOK_URL/);
    await expect(loadDeps(app, { env: { ...env, GHOST_ALERTS: 'webhook', GHOST_WEBHOOK_URL: 'not a url' } })).rejects.toThrow(ConfigError);
    await expect(loadDeps(app, { env: { ...env, GHOST_ALERTS: 'webhook', GHOST_WEBHOOK_URL: 'http://ntfy.sh/crypt' } })).rejects.toThrow(/https/);
    await expect(
      loadDeps(app, { env: { ...env, GHOST_ALERTS: 'webhook', GHOST_WEBHOOK_URL: 'https://ntfy.sh/crypt', GHOST_WEBHOOK_FORMAT: 'pager' } }),
    ).rejects.toThrow(/ntfy, discord, slack, json/);
  });

  it('shows only the format, never the secret URL, and fans out with the outbox', async () => {
    const secret = 'https://discord.com/api/webhooks/123/secret-token';
    const deps = await loadDeps(app, { env: { ...env, GHOST_ALERTS: 'outbox,webhook', GHOST_WEBHOOK_URL: secret } });
    expect(deps.describe.alerts).toBe('outbox + webhook (discord)');
    expect(JSON.stringify(deps.describe)).not.toContain('secret-token');
    const local = await loadDeps(app, { env: { ...env, GHOST_ALERTS: 'webhook', GHOST_WEBHOOK_URL: 'http://127.0.0.1:9/hook' } });
    expect(local.describe.alerts).toBe('webhook (json)');
  });
});
