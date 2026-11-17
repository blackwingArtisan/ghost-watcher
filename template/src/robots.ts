/**
 * robots.txt parsing and matching (RFC 9309): the most specific user-agent group applies, the longest
 * matching rule wins, and Allow wins a tie. Supports `*` and `$` in paths and the common `Crawl-delay`
 * extension.
 */

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds?: number;
}

export interface RobotsPolicy {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export function parseRobots(text: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (key === 'disallow' && value === '') continue;
      current.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelaySeconds = seconds;
    }
  }
  return { groups, sitemaps };
}

/** The product token of a User-Agent string: `GhostWatcher/0.1 (+https://...)` -> `ghostwatcher`. */
export function productToken(userAgent: string): string {
  return (userAgent.split(/[\s/]/)[0] ?? '').toLowerCase();
}

export function groupFor(policy: RobotsPolicy, userAgent: string): RobotsGroup | undefined {
  const token = productToken(userAgent);
  const specific = policy.groups.filter((group) => group.agents.some((agent) => agent !== '*' && token.startsWith(agent)));
  if (specific.length > 0) {
    // Several groups can name the same agent; RFC 9309 says to combine them.
    return {
      agents: specific.flatMap((g) => g.agents),
      rules: specific.flatMap((g) => g.rules),
      crawlDelaySeconds: specific.find((g) => g.crawlDelaySeconds !== undefined)?.crawlDelaySeconds,
    };
  }
  const wildcard = policy.groups.filter((group) => group.agents.includes('*'));
  if (wildcard.length === 0) return undefined;
  return {
    agents: ['*'],
    rules: wildcard.flatMap((g) => g.rules),
    crawlDelaySeconds: wildcard.find((g) => g.crawlDelaySeconds !== undefined)?.crawlDelaySeconds,
  };
}

function patternToRegExp(path: string): RegExp {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Decides whether `userAgent` may fetch `pathAndQuery` (e.g. `/offers?x=1`). */
export function isAllowed(policy: RobotsPolicy, userAgent: string, pathAndQuery: string): boolean {
  const group = groupFor(policy, userAgent);
  if (!group) return true;
  const target = safeDecode(pathAndQuery || '/');
  let best: RobotsRule | undefined;
  for (const rule of group.rules) {
    if (!patternToRegExp(safeDecode(rule.path)).test(target)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

export function crawlDelayMs(policy: RobotsPolicy, userAgent: string): number {
  const seconds = groupFor(policy, userAgent)?.crawlDelaySeconds;
  return seconds === undefined ? 0 : Math.round(seconds * 1000);
}

/** A policy that allows everything (used when robots.txt is missing: 4xx means "no restrictions"). */
export const ALLOW_ALL: RobotsPolicy = { groups: [], sitemaps: [] };
/** A policy that forbids everything (used when robots.txt is unreachable: 5xx means "stay away"). */
export const DISALLOW_ALL: RobotsPolicy = {
  groups: [{ agents: ['*'], rules: [{ allow: false, path: '/' }] }],
  sitemaps: [],
};
