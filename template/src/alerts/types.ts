import type { ListItem } from '../extract';
import type { MaybeValue } from '../normalize';
import type { Receipt } from '../receipts';
import type { RuleKind, Severity, Tone } from '../watch';

/** One explained change on one watch. */
export interface Alert {
  id: string;
  watchId: string;
  watchName: string;
  url: string;
  createdAt: string;
  severity: Severity;
  ruleKind: RuleKind;
  ruleLabel: string;
  summary: string;
  field?: string;
  list?: string;
  before?: MaybeValue;
  after?: MaybeValue;
  item?: ListItem;
  /** Set for a stealth edit: why it looks like a bait and switch. */
  stealth?: string;
  /** Good or bad news for the reader, when the change has a clear direction. */
  tone?: Exclude<Tone, 'neutral'>;
  /** Proof of the change, kept for shrieks and bait and switches: snapshot hashes and an archived copy. */
  receipt?: Receipt;
}

/** Everything one check run found on one watch, rendered for delivery. */
export interface AlertMessage {
  watchId: string;
  watchName: string;
  url: string;
  appName: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  alerts: Alert[];
  createdAt: string;
}

export interface DeliveryReceipt {
  channel: string;
  /** Where the message went: a file path for the outbox, a message id for email. */
  reference: string;
}

/** The alert delivery port. */
export interface AlertSink {
  readonly channel: string;
  deliver(message: AlertMessage): Promise<DeliveryReceipt>;
}
