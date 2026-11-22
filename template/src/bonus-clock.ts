/**
 * The bonus clock: an offer's requirement window and posting window, counted from the pact date.
 * Pure functions of stored ISO strings and the injected clock's `now`; nothing here reads a clock.
 */
import { letterDate } from './summary';

export interface BonusClock {
  /** What the reader must do, e.g. `spend $4,000`. */
  requirement: string;
  requirementDays: number;
  /** The window as the offer words it, e.g. `3 months`. */
  requirementLabel: string;
  postingDays: number;
  /** The posting window as the offer words it, e.g. `8 weeks after the requirement is met`. */
  postingLabel: string;
}

export type ClockState = 'counting' | 'posting' | 'due' | 'posted';

export interface ClockView {
  state: ClockState;
  /** The line the stone shows. */
  line: string;
  requirement: string;
  requirementDate: string;
  postingDate: string;
  /** Days left to the next milestone; 0 once due or posted. */
  daysLeft: number;
  postedAt?: string;
  /** The letter behind "Raise the dead", only while the bonus is due and not posted. */
  letter?: { subject: string; body: string };
}

const DAY_MS = 86_400_000;

const addDays = (iso: string, days: number): string => new Date(Date.parse(iso) + days * DAY_MS).toISOString();
const daysUntil = (day: string, now: string): number => Math.ceil((Date.parse(day) - Date.parse(now)) / DAY_MS);
const days = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;

/** Where the clock stands `now`, for a pact sealed at `sealedAt` (PACT 15.2 to 15.6, 15.11). */
export function bonusClockView(clock: BonusClock, sealedAt: string, postedAt: string | undefined, now: string): ClockView {
  const requirementDay = addDays(sealedAt, clock.requirementDays);
  const postingDay = addDays(requirementDay, clock.postingDays);
  const base = { requirement: clock.requirement, requirementDate: letterDate(requirementDay), postingDate: letterDate(postingDay) };
  if (postedAt) return { ...base, state: 'posted', line: 'Bonus posted', daysLeft: 0, postedAt };
  const toPosting = daysUntil(postingDay, now);
  if (Date.parse(now) > Date.parse(postingDay)) return { ...base, state: 'due', line: 'Bonus due, not posted', daysLeft: 0 };
  if (Date.parse(now) > Date.parse(requirementDay)) {
    return { ...base, state: 'posting', line: `Bonus due in ${days(toPosting)} (${base.postingDate})`, daysLeft: toPosting };
  }
  const left = daysUntil(requirementDay, now);
  return { ...base, state: 'counting', line: `${days(left)} left to ${clock.requirement}`, daysLeft: left };
}

/** The letter behind "Raise the dead" on a due clock: the requirement, the pact date and the posting window (PACT 15.8). */
export function bonusClockLetter(offer: string, url: string, clock: BonusClock, sealedAt: string, view: ClockView): { subject: string; body: string } {
  return {
    subject: `Bonus not posted: ${offer}`,
    body: [
      'To whom it may concern,',
      '',
      `I applied for ${offer} (${url}) on ${letterDate(sealedAt)}. The offer asked me to ${clock.requirement} within ${clock.requirementLabel}, and said the bonus posts ${clock.postingLabel}.`,
      `By that timetable the bonus was due by ${view.postingDate}. It has not posted.`,
      '',
      'Please post the bonus or tell me in writing why it has not posted.',
    ].join('\n'),
  };
}
