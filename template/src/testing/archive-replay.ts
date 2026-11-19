/**
 * Archive replay: the noise measurement on real pages. Each archived copy of a page is treated as one
 * visit, oldest first, and three watchers judge every step between two copies:
 *
 *   - a whole-page watcher, which alerts when the page's visible text changed at all;
 *   - a selector text watcher, which alerts when the raw text of the watched elements changed;
 *   - Ghost Watcher, which alerts when the watch's rules fire on the typed diff.
 *
 * Unlike the fixture nights there is no answer key, so the report counts alerts and lists what Ghost
 * Watcher said, for a person to judge. Copies come from any `HistorySource` (the Wayback Machine, or
 * a stand-in in tests).
 */
import { diff } from '../diff';
import { extract } from '../extract';
import type { PastCapture } from '../history';
import { pageFingerprint } from '../noise';
import { evaluateRules } from '../rules';
import type { Watch } from '../watch';
import { selectorText } from './noise-ratio';

export interface ArchiveReplayReport {
  watchId: string;
  name: string;
  /** Archived copies the replay could read. */
  captures: number;
  /** Steps between two consecutive copies: `captures - 1`, or 0. */
  steps: number;
  firstAt: string | null;
  lastAt: string | null;
  wholePage: number;
  selectorText: number;
  ghostWatcher: number;
  /** What Ghost Watcher would have said, one line per step that fired: `2026-06-11: Bonus went down ...`. */
  said: string[];
}

export function replayArchive(watch: Watch, captures: readonly PastCapture[]): ArchiveReplayReport {
  const ordered = [...captures].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const report: ArchiveReplayReport = {
    watchId: watch.id,
    name: watch.name,
    captures: ordered.length,
    steps: Math.max(0, ordered.length - 1),
    firstAt: ordered[0]?.capturedAt ?? null,
    lastAt: ordered[ordered.length - 1]?.capturedAt ?? null,
    wholePage: 0,
    selectorText: 0,
    ghostWatcher: 0,
    said: [],
  };
  let previous: { fingerprint: string; selector: string; extraction: ReturnType<typeof extract> } | null = null;
  for (const capture of ordered) {
    const current = { fingerprint: pageFingerprint(capture.html), selector: selectorText(capture.html, watch), extraction: extract(capture.html, watch) };
    if (previous) {
      if (current.fingerprint !== previous.fingerprint) report.wholePage += 1;
      if (current.selector !== previous.selector) report.selectorText += 1;
      const findings = evaluateRules(watch, diff(previous.extraction, current.extraction));
      if (findings.length > 0) {
        report.ghostWatcher += 1;
        report.said.push(`${capture.capturedAt.slice(0, 10)}: ${findings.map((f) => f.summary).join(' ')}`);
      }
    }
    previous = current;
  }
  return report;
}

/** A Markdown table of replay reports, with a total row when there are several. */
export function archiveReplayTable(reports: readonly ArchiveReplayReport[]): string {
  const span = (r: ArchiveReplayReport) => (r.firstAt && r.lastAt ? `${r.firstAt.slice(0, 10)} to ${r.lastAt.slice(0, 10)}` : 'none');
  const rows = reports.map((r) => `| ${r.name} | ${r.captures} copies, ${span(r)} | ${r.wholePage} | ${r.selectorText} | ${r.ghostWatcher} |`);
  if (reports.length > 1) {
    const total = (pick: (r: ArchiveReplayReport) => number) => reports.reduce((n, r) => n + pick(r), 0);
    rows.push(
      `| **Total** | ${total((r) => r.captures)} copies | **${total((r) => r.wholePage)}** | **${total((r) => r.selectorText)}** | **${total((r) => r.ghostWatcher)}** |`,
    );
  }
  return [
    '| Page | Archived copies replayed | Whole-page watcher | Selector text watcher | Ghost Watcher |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}
