/** An app built on the skeleton: a name, a look, and a set of watches. */
import type { PactCopy } from './pact-vocabulary';
import { assertUniqueIds, type Watch } from './watch';

export interface Theme {
  /** Main glow color for restless ghosts and highlights (CSS color). */
  accent: string;
  /** Secondary color for links and quiet highlights. */
  accentSecondary: string;
  /** Background tint for the night sky. */
  sky: string;
  /** The moon's color; tint it to set the mood. */
  moon?: string;
  /** Emoji-free one-word motif engraved under the header crest, e.g. `Crypt`. */
  crest?: string;
  /** What each ghost haunts: a tombstone (default) or a gabled haunted house, for apps about places. */
  motif?: 'stone' | 'house';
}

export interface AppCopy {
  /** Plural noun for watches in this app, e.g. `bonus pages`. */
  watchNoun: string;
  /** Shown when nothing has stirred yet. */
  quiet: string;
  /** Footer line, also appended to alert emails. */
  disclaimer?: string;
  /** What the alert feed is called on the dashboard. Default `Spirit mail`. */
  feedName?: string;
  /**
   * Offer "Raise the dead" dispute packs (a letter to the bank and CFPB complaint text) for changes
   * that kept a receipt. For apps that watch financial offers.
   */
  disputes?: boolean;
  /**
   * Offer "I applied today" on each ghost: seal the current page as a pact, then judge every later
   * change against what the page promised that day. For apps that watch financial offers.
   */
  pacts?: boolean;
  /** The words of the pact (button, chip, notes, letters, authority). Omit it for the bank-offer wording. */
  pactCopy?: PactCopy;
}

export interface GhostApp {
  id: string;
  name: string;
  tagline: string;
  version: string;
  /**
   * Public page describing the watcher, used in the User-Agent so site operators can identify it.
   * Optional: leave it out unless you run the app against real sites. `GHOST_CONTACT_URL` overrides
   * it. An app that only watches loopback or reserved hosts needs none and sends a local-only
   * User-Agent; an app that watches a real host cannot start without a contact URL on a real domain.
   */
  contactUrl?: string;
  theme: Theme;
  copy: AppCopy;
  watches: Watch[];
  /** Default alert recipients (invented addresses in the demos). */
  alertTo: string[];
}

export const DEFAULT_THEME: Theme = {
  accent: '#7ef0d0',
  accentSecondary: '#b9a4ff',
  sky: '#120f22',
  moon: '#f3ecd2',
  crest: 'Watch',
  motif: 'stone',
};

export function defineApp(app: Omit<GhostApp, 'theme'> & { theme?: Partial<Theme> }): GhostApp {
  if (!/^[a-z0-9-]+$/.test(app.id)) throw new Error(`App id "${app.id}" must be lowercase letters, digits and dashes.`);
  assertUniqueIds(app.watches);
  return { ...app, theme: { ...DEFAULT_THEME, ...app.theme } };
}
