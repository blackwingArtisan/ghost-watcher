/** Public API of the Ghost Watcher skeleton. Apps import only from here. */
export * from './watch';
export * from './normalize';
export { extract, type Extraction, type ListItem } from './extract';
export { diff, compareValues, fingerprint, isEmptyDiff, type Diff, type FieldChange, type ListChange, type Snapshot } from './diff';
export { evaluateRules, matchesFilter, describeRule, describeCondition, toneOf, type Finding } from './rules';
export { describeFieldChange, describeItem, sentences, textChange, wordDiff, changedWindow, type WordSegment } from './summary';
export { parseRobots, isAllowed, crawlDelayMs, productToken, type RobotsPolicy } from './robots';
export { PoliteFetcher, buildUserAgent, LOCAL_ONLY_CONTACT, type Fetcher, type FetchOutcome, type PoliteFetcherOptions, type Transport } from './fetcher';
export { systemClock, manualClock, type Clock, type ManualClock } from './clock';
export { MemoryBlobStore, FileBlobStore, type BlobStore } from './store/blob';
export { GhostStore, type WatchStatus } from './store/ghost-store';
export type { Alert, AlertMessage, AlertSink, DeliveryReceipt } from './alerts/types';
export { OutboxAlertSink, ConsoleAlertSink, FanOutAlertSink, toEml, type OutboxEntry } from './alerts/sinks';
export { renderAlertMessage } from './alerts/render';
export { pageText, pageFingerprint, hashText } from './noise';
export {
  WaybackHistorySource,
  WAYBACK_BASE,
  buildPastTimeline,
  cdxQueryUrl,
  describeValues,
  headlineOf,
  parseCdx,
  pastChangeCount,
  waybackTimestampToIso,
  type Fickleness,
  type HistorySource,
  type PastCapture,
  type PastHeadline,
  type PastEntry,
  type PastTimeline,
  type WaybackOptions,
} from './history';
export {
  SavePageNowArchiver,
  needsReceipt,
  serializeJson,
  sha256Hex,
  shortHash,
  snapshotSha256,
  takeReceipt,
  type PageArchiver,
  type Receipt,
  type ReceiptSide,
  type SavePageNowOptions,
} from './receipts';
export {
  disputePack,
  complaintCategory,
  letterDate,
  CFPB_CATEGORIES,
  CFPB_COMPLAINT_URL,
  type ComplaintCategory,
  type DisputePack,
  type EvidenceRow,
} from './dispute';
export { Runner, backoffMs, nextEligibleAt, type CheckResult, type CheckOptions } from './runner';
export { defineApp, DEFAULT_THEME, type GhostApp, type Theme, type AppCopy } from './app';
export { loadDeps, ConfigError, isPlaceholderContact, isReservedHost, visitsThirdParty, type GhostDeps, type Env } from './config';
export { createDashboardServer, listen, type DashboardOptions } from './server';
export { checkRequest, allowedHostSet, parseHostList, hostnameOf, LOOPBACK_HOSTS, type GuardVerdict } from './guard';
export { dashboardState, ghostDetail, ghostView, type DashboardState, type GhostView, type GhostDetail } from './view';
export { runCli, parseFlags, describeResult, type CliOptions } from './cli';
// Cloud adapters (opt-in). Importing them loads the AWS SDK, so they are exported from their own paths
// in `config.ts` and here only as types.
export type { S3BlobStore } from './store/s3';
export type { SesEmailAlertSink } from './alerts/ses';
export { WebhookAlertSink, buildWebhookRequest, compactText, detectWebhookFormat, type WebhookFormat, type WebhookRequest } from './alerts/webhook';
