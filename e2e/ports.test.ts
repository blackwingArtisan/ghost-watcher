import { describe, expect, it } from 'vitest';
import { origin, resolveE2ePorts } from './ports';

describe('e2e port plan', () => {
  it('defaults to base 3134 so nothing changes without GHOST_E2E_PORT', () => {
    expect(resolveE2ePorts(undefined)).toEqual({
      bonusDashboard: 3134,
      bonusFixtures: 3135,
      listingDashboard: 3136,
      listingFixtures: 3137,
      demoDashboard: 3138,
      demoFixtures: 3139,
    });
    expect(resolveE2ePorts('')).toEqual(resolveE2ePorts(undefined));
  });

  it('uses base+0 to base+5 in server order when GHOST_E2E_PORT is set', () => {
    const p = resolveE2ePorts('3840');
    expect(Object.values(p)).toEqual([3840, 3841, 3842, 3843, 3844, 3845]);
    expect(origin(p.demoFixtures)).toBe('http://127.0.0.1:3845');
  });

  it('accepts the lowest and highest allowed base ports', () => {
    expect(resolveE2ePorts('1024').bonusDashboard).toBe(1024);
    expect(resolveE2ePorts('65530').demoFixtures).toBe(65535);
  });

  it('rejects a value that is not an integer between 1024 and 65530 with a clear error', () => {
    for (const bad of ['abc', '3134.5', '1023', '65531', '-3134', '0x1000', '80']) {
      expect(() => resolveE2ePorts(bad), bad).toThrow(/GHOST_E2E_PORT must be an integer between 1024 and 65530/);
    }
  });
});
