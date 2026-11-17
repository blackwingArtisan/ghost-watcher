/** Local alert sinks: the outbox (default) and the console. */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AlertMessage, AlertSink, DeliveryReceipt } from './types';

export interface OutboxEntry {
  file: string;
  watchId: string;
  watchName: string;
  subject: string;
  to: string[];
  createdAt: string;
  alertIds: string[];
  summaries: string[];
}

/**
 * Writes every message to a local outbox folder: `outbox.jsonl` (one line per message), plus an
 * `.eml` file you can open in any mail client and an `.html` preview the dashboard links to.
 */
export class OutboxAlertSink implements AlertSink {
  readonly channel = 'outbox';
  private counter = 0;

  constructor(readonly dir: string) {}

  async deliver(message: AlertMessage): Promise<DeliveryReceipt> {
    await mkdir(this.dir, { recursive: true });
    this.counter += 1;
    const base = `${message.createdAt.replace(/[:.]/g, '-')}-${message.watchId}-${this.counter}`;
    await writeFile(join(this.dir, `${base}.eml`), toEml(message), 'utf8');
    await writeFile(join(this.dir, `${base}.html`), message.html, 'utf8');
    const entry: OutboxEntry = {
      file: base,
      watchId: message.watchId,
      watchName: message.watchName,
      subject: message.subject,
      to: message.to,
      createdAt: message.createdAt,
      alertIds: message.alerts.map((a) => a.id),
      summaries: message.alerts.map((a) => a.summary),
    };
    await appendFile(join(this.dir, 'outbox.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
    return { channel: this.channel, reference: base };
  }

  /** Reads the outbox index, newest first. */
  async entries(): Promise<OutboxEntry[]> {
    try {
      const body = await readFile(join(this.dir, 'outbox.jsonl'), 'utf8');
      return body
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as OutboxEntry)
        .reverse();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}

export class ConsoleAlertSink implements AlertSink {
  readonly channel = 'console';

  constructor(private readonly write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)) {}

  async deliver(message: AlertMessage): Promise<DeliveryReceipt> {
    this.write(`\n👻 ${message.subject}\n${message.text}\n`);
    return { channel: this.channel, reference: message.alerts[0]?.id ?? 'console' };
  }
}

/** Delivers to several sinks (for example the outbox and email). Fails only if every sink fails. */
export class FanOutAlertSink implements AlertSink {
  readonly channel: string;

  constructor(private readonly sinks: AlertSink[]) {
    this.channel = sinks.map((sink) => sink.channel).join('+');
  }

  async deliver(message: AlertMessage): Promise<DeliveryReceipt> {
    const results = await Promise.allSettled(this.sinks.map((sink) => sink.deliver(message)));
    const ok = results.filter((r): r is PromiseFulfilledResult<DeliveryReceipt> => r.status === 'fulfilled');
    if (ok.length === 0) {
      const first = results[0];
      throw first && first.status === 'rejected' ? first.reason : new Error('No alert sink delivered the message.');
    }
    return { channel: this.channel, reference: ok.map((r) => r.value.reference).join(',') };
  }
}

function encodeHeader(value: string): string {
  // RFC 2047 encoded-word for any non-ASCII subject.
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export function toEml(message: AlertMessage, from = 'Ghost Watcher <ghosts@example.com>'): string {
  const boundary = `ghost-${message.watchId}-${message.createdAt.replace(/\D/g, '')}`;
  return [
    `From: ${from}`,
    `To: ${message.to.join(', ')}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date(message.createdAt).toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(message.text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(message.html, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
