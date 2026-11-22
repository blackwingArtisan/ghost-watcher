/** The weekly digest: one plain-text summary of every bonus clock and every change in the last seven days. Pure. */
import type { Alert } from './alerts/types';
import type { ClockView } from './bonus-clock';
import { letterDate } from './summary';

export interface DigestItem {
  name: string;
  clock: ClockView | null;
  alerts: Alert[];
}

const WEEK_MS = 7 * 86_400_000;

export function buildWeeklyDigest(input: { appName: string; now: string; items: DigestItem[] }): { subject: string; text: string } {
  const since = Date.parse(input.now) - WEEK_MS;
  const clocks = input.items.filter((item) => item.clock).map((item) => `- ${item.name}: ${item.clock?.line}`);
  const changes = input.items.flatMap((item) =>
    item.alerts.filter((a) => Date.parse(a.createdAt) > since && Date.parse(a.createdAt) <= Date.parse(input.now)).map((a) => `- ${item.name}: ${a.summary}`),
  );
  const text = [
    `${input.appName}: your week to ${letterDate(input.now)}`,
    '',
    'Bonus clocks',
    ...(clocks.length ? clocks : ['No bonus clocks are running.']),
    '',
    'Changes this week',
    ...(changes.length ? changes : ['No changes this week.']),
    '',
  ].join('\n');
  return { subject: `${input.appName}: weekly digest, ${letterDate(input.now)}`, text };
}
