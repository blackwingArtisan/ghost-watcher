/** Time as a port, so politeness rules (intervals, crawl delays, back-off) are testable. */
export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface ManualClock extends Clock {
  advance(ms: number): void;
  set(at: Date | string): void;
  /** Total time spent in `sleep`, so tests can assert that crawl delays were honored. */
  slept: number;
}

/** A clock that only moves when told to. `sleep` advances it instantly. */
export function manualClock(start: Date | string = '2026-10-31T12:00:00Z'): ManualClock {
  let current = new Date(start).getTime();
  const clock: ManualClock = {
    slept: 0,
    now: () => new Date(current),
    sleep: async (ms) => {
      current += ms;
      clock.slept += ms;
    },
    advance: (ms) => {
      current += ms;
    },
    set: (at) => {
      current = new Date(at).getTime();
    },
  };
  return clock;
}
