/**
 * Amazon SES (v2) email adapter. Opt-in with `GHOST_ALERTS=ses`; never constructed by tests or by the
 * default configuration. The client is injectable so the request shape can be verified with a fake.
 */
import { SESv2Client, SendEmailCommand, type SESv2ClientConfig } from '@aws-sdk/client-sesv2';
import type { AlertMessage, AlertSink, DeliveryReceipt } from './types';

export interface SesLike {
  send: SESv2Client['send'];
}

export interface SesEmailAlertSinkOptions {
  /** A verified SES identity, e.g. `Ghost Watcher <alerts@example.com>`. */
  from: string;
  /** Optional configuration set for delivery and bounce tracking. */
  configurationSetName?: string;
  client?: SesLike;
  clientConfig?: SESv2ClientConfig;
}

export class SesEmailAlertSink implements AlertSink {
  readonly channel = 'ses';
  private readonly client: SesLike;

  constructor(private readonly options: SesEmailAlertSinkOptions) {
    if (!options.from) throw new Error('SesEmailAlertSink needs a sender (set GHOST_SES_FROM).');
    this.client = options.client ?? new SESv2Client(options.clientConfig ?? {});
  }

  /** Builds the SendEmail request. Exposed so it can be tested without sending anything. */
  buildCommand(message: AlertMessage): SendEmailCommand {
    if (message.to.length === 0) throw new Error('An alert email needs at least one recipient (set GHOST_ALERT_TO).');
    return new SendEmailCommand({
      FromEmailAddress: this.options.from,
      Destination: { ToAddresses: message.to },
      ConfigurationSetName: this.options.configurationSetName,
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: message.text, Charset: 'UTF-8' },
            Html: { Data: message.html, Charset: 'UTF-8' },
          },
        },
      },
      EmailTags: [
        { Name: 'app', Value: message.appName.replace(/[^A-Za-z0-9_-]/g, '-') },
        { Name: 'watch', Value: message.watchId },
      ],
    });
  }

  async deliver(message: AlertMessage): Promise<DeliveryReceipt> {
    const result = await this.client.send(this.buildCommand(message));
    return { channel: this.channel, reference: result.MessageId ?? 'unknown' };
  }
}
