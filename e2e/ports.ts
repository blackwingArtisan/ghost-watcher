/**
 * Port plan for the Playwright run. GHOST_E2E_PORT is the base port (default 3134); the eight
 * servers take base+0 to base+7. playwright.config.ts and every spec import this module, so no
 * port number is written anywhere else.
 */
export const DEFAULT_E2E_PORT = 3134;
export const MIN_E2E_PORT = 1024;
export const MAX_E2E_PORT = 65528;

export interface E2ePorts {
  bonusDashboard: number;
  bonusFixtures: number;
  listingDashboard: number;
  listingFixtures: number;
  demoDashboard: number;
  demoFixtures: number;
  /** Haunted Listings in demo mode (lease pact). */
  listingDemoDashboard: number;
  listingDemoFixtures: number;
}

export function resolveE2ePorts(raw: string | undefined): E2ePorts {
  let base = DEFAULT_E2E_PORT;
  if (raw !== undefined && raw.trim() !== '') {
    const text = raw.trim();
    base = Number(text);
    if (!/^\d+$/.test(text) || !Number.isInteger(base) || base < MIN_E2E_PORT || base > MAX_E2E_PORT) {
      throw new Error(
        `GHOST_E2E_PORT must be an integer between ${MIN_E2E_PORT} and ${MAX_E2E_PORT} (got "${raw}"). ` +
          'The eight e2e servers use that port and the seven after it.',
      );
    }
  }
  return {
    bonusDashboard: base,
    bonusFixtures: base + 1,
    listingDashboard: base + 2,
    listingFixtures: base + 3,
    demoDashboard: base + 4,
    demoFixtures: base + 5,
    listingDemoDashboard: base + 6,
    listingDemoFixtures: base + 7,
  };
}

export const ports = resolveE2ePorts(process.env.GHOST_E2E_PORT);

export const origin = (port: number): string => `http://127.0.0.1:${port}`;
