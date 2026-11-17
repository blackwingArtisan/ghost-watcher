/** Public API of the Ghost Watcher skeleton. Apps import only from here. */
export * from './watch';
export * from './normalize';
export { extract, type Extraction, type ListItem } from './extract';
export { diff, compareValues, fingerprint, isEmptyDiff, type Diff, type FieldChange, type ListChange, type Snapshot } from './diff';
export { evaluateRules, matchesFilter, describeRule, describeCondition, type Finding } from './rules';
export { describeFieldChange, describeItem, sentences, textChange, wordDiff, changedWindow, type WordSegment } from './summary';
export { parseRobots, isAllowed, crawlDelayMs, productToken, type RobotsPolicy } from './robots';
export { PoliteFetcher, buildUserAgent, type Fetcher, type FetchOutcome, type PoliteFetcherOptions, type Transport } from './fetcher';
export { systemClock, manualClock, type Clock, type ManualClock } from './clock';
export { MemoryBlobStore, FileBlobStore, type BlobStore } from './store/blob';
export { GhostStore, type WatchStatus } from './store/ghost-store';
export type { Alert, AlertMessage, AlertSink, DeliveryReceipt } from './alerts/types';
export { OutboxAlertSink, ConsoleAlertSink, FanOutAlertSink, toEml, type OutboxEntry } from './alerts/sinks';
export { renderAlertMessage } from './alerts/render';
export { Runner, backoffMs, nextEligibleAt, type CheckResult, type CheckOptions } from './runner';
export { defineApp, DEFAULT_THEME, type GhostApp, type Theme, type AppCopy } from './app';
export { loadDeps, ConfigError, type GhostDeps, type Env } from './config';
export { createDashboardServer, listen } from './server';
export { dashboardState, ghostDetail, ghostView, type DashboardState, type GhostView, type GhostDetail } from './view';
export { runCli, parseFlags, describeResult, type CliOptions } from './cli';
// Cloud adapters (opt-in). Importing them loads the AWS SDK, so they are exported from their own paths
// in `config.ts` and here only as types.
export type { S3BlobStore } from './store/s3';
export type { SesEmailAlertSink } from './alerts/ses';
