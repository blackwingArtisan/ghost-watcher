import { describe, expect, it } from 'vitest';
import type { Alert } from '../src/alerts/types';
import { renderTally } from '../src/ui/render.js';
import { ROUND_GAP_MS, letterRank, sortFeed, type FeedEntry } from '../src/view';

const entry = (id: string, createdAt: string, severity: Alert['severity'], stealth?: string): FeedEntry => ({
  alert: { id, watchId: id, watchName: id, url: 'http://127.0.0.1:9/', createdAt, severity, ruleKind: 'changed', ruleLabel: 'x', summary: id, ...(stealth ? { stealth } : {}) },
  acknowledged: false,
  letter: null,
});

describe('Spirit mail order', () => {
  it('ranks a bait and switch above a shriek, a shriek above a moan, and a moan above a whisper', () => {
    expect(letterRank({ severity: 'moan', stealth: 'x' })).toBeGreaterThan(letterRank({ severity: 'shriek' }));
    expect(letterRank({ severity: 'shriek' })).toBeGreaterThan(letterRank({ severity: 'moan' }));
    expect(letterRank({ severity: 'moan' })).toBeGreaterThan(letterRank({ severity: 'whisper' }));
  });

  it('puts the newest night first and the loudest letter first within each night', () => {
    const night1 = Date.parse('2026-11-01T03:00:00Z');
    const at = (base: number, seconds: number) => new Date(base + seconds * 1000).toISOString();
    const night2 = night1 + 6 * 3_600_000;
    const feed = [
      entry('old-shriek', at(night1, 1), 'shriek'),
      entry('old-whisper', at(night1, 2), 'whisper'),
      entry('new-moan', at(night2, 3), 'moan'),
      entry('new-stealth', at(night2, 1), 'shriek', 'Bonus stayed the same while the fine print changed.'),
      entry('new-shriek', at(night2, 2), 'shriek'),
    ];
    expect(sortFeed(feed).map((e) => e.alert.id)).toEqual(['new-stealth', 'new-shriek', 'new-moan', 'old-shriek', 'old-whisper']);
  });

  it('keeps letters more than a round apart in time order', () => {
    const base = Date.parse('2026-11-01T03:00:00Z');
    const feed = [entry('whisper-later', new Date(base + ROUND_GAP_MS + 1000).toISOString(), 'whisper'), entry('shriek-earlier', new Date(base).toISOString(), 'shriek')];
    expect(sortFeed(feed).map((e) => e.alert.id)).toEqual(['whisper-later', 'shriek-earlier']);
  });
});

describe("Tonight's tally", () => {
  it('counts letters sent, page changes slept through and doors respected', () => {
    const html = renderTally({
      feed: [entry('a', '2026-11-01T03:00:00Z', 'shriek'), entry('b', '2026-11-01T03:00:01Z', 'moan')],
      ghosts: [{ ignored: 3, state: 'dormant' }, { ignored: 1, state: 'restless' }, { ignored: 0, state: 'blocked' }],
    });
    expect(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).toBe(
      "Tonight's tally 2 letters sent 4 page changes slept through 1 door respected (robots.txt)",
    );
  });
});
