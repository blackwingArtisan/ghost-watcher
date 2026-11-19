/**
 * Replays real pages from the Wayback Machine through Ghost Watcher and two plain watchers, and
 * prints each page's history: the noise table on real pages instead of fixture nights.
 *
 *   GHOST_CONTACT_URL=<a page about this watcher> npx tsx scripts/real-pages.ts <app module> [--limit 12]
 *   npx tsx scripts/real-pages.ts <app module> --archive http://127.0.0.1:3131/__wayback   (a local stand-in)
 *
 * The app module exports `buildApp(env)` (like `apps/*\/src/app.ts`) or a default `GhostApp`. Only the
 * archive is contacted, one request at a time with a one-second gap; the pages themselves are not
 * fetched. The real Wayback Machine needs a contact URL a person can visit, the same rule the watcher
 * follows for live sites. See docs/real-pages.md.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  WaybackHistorySource,
  WAYBACK_BASE,
  buildPastTimeline,
  buildUserAgent,
  extract,
  isPlaceholderContact,
  visitsThirdParty,
  type GhostApp,
} from '@ghost-watcher/template';
import { archiveReplayTable, replayArchive, type ArchiveReplayReport } from '@ghost-watcher/template/testing';

function usage(message: string): never {
  process.stderr.write(`${message}\nUsage: npx tsx scripts/real-pages.ts <app module> [--limit <copies>] [--archive <base URL>]\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
const modulePath = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!modulePath) usage('Name an app module.');
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const limit = Number(flag('--limit') ?? 12);
if (!Number.isInteger(limit) || limit < 2) usage('--limit must be a whole number of copies, 2 or more.');
const base = (flag('--archive') ?? WAYBACK_BASE).replace(/\/$/, '');

const loaded = (await import(pathToFileURL(resolve(modulePath)).href)) as { buildApp?: (env: NodeJS.ProcessEnv) => GhostApp; default?: GhostApp };
const app = loaded.buildApp ? loaded.buildApp(process.env) : loaded.default;
if (!app?.watches) usage(`${modulePath} exports neither buildApp() nor a default app.`);

const contact = process.env.GHOST_CONTACT_URL;
let userAgent: string;
if (visitsThirdParty(base)) {
  if (!contact || isPlaceholderContact(contact)) {
    usage('Set GHOST_CONTACT_URL to a real page about this watcher before asking the Wayback Machine for copies.');
  }
  userAgent = buildUserAgent({ version: app.version, contactUrl: contact });
} else {
  userAgent = buildUserAgent({ version: app.version, localOnly: true });
}

const source = new WaybackHistorySource({
  userAgent,
  base,
  limit,
  ...(visitsThirdParty(base) ? {} : { label: 'the stand-in Wayback Machine', gapMs: 0 }),
});

const reports: ArchiveReplayReport[] = [];
const notes: string[] = [];
for (const watch of app.watches) {
  process.stderr.write(`Reading archived copies of ${watch.url} ...\n`);
  let captures;
  try {
    captures = await source.captures(watch.url);
  } catch (error) {
    notes.push(`- ${watch.name}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  const report = replayArchive(watch, captures);
  reports.push(report);
  const newest = captures[captures.length - 1];
  if (!newest) {
    notes.push(`- ${watch.name}: ${source.label} has no copies of this page.`);
    continue;
  }
  // The newest copy plays "today", so the history reads the same way the séance would show it.
  const timeline = buildPastTimeline(watch, captures.slice(0, -1), { takenAt: newest.capturedAt, ...extract(newest.html, watch) }, source.label, newest.capturedAt);
  notes.push(
    `- ${watch.name}: ${timeline.fickleness?.text ?? 'no history'}${timeline.headline ? ` Ribbon: "${timeline.headline.text}".` : ''}`,
    ...report.said.map((line) => `  - ${line}`),
  );
}

process.stdout.write(
  `Archive replay: ${app.name}, up to ${limit} copies a page (one a month) from ${source.label}.\n` +
    'Each cell counts alerts over the steps between consecutive copies.\n\n' +
    `${archiveReplayTable(reports)}\n\n${notes.join('\n')}\n`,
);
