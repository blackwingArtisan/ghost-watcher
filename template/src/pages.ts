/**
 * Added pages: a reader pastes a public address and presses "I applied today". The page becomes a ghost
 * that watches its whole readable text, and its first reading is sealed as a pact. Sealing fetches the
 * page once through the `Fetcher` (robots.txt, rate limit, honest User-Agent); that one reading is the
 * baseline. A page that only renders in a browser is refused: there is no headless browser here.
 *
 * Records of added pages live in the blob store (`pages/added.json`), so they survive a restart.
 */
import { createHash } from 'node:crypto';
import { visitsThirdParty, type GhostDeps } from './config';
import type { PactRecord } from './pact';
import { MIN_READABLE_CHARS, READABLE_SELECTOR, pageTitle, readableText } from './readable';
import { sealPact } from './sealing';
import { serializeJson } from './receipts';
import type { BlobStore } from './store/blob';
import { defineWatch, rules, type Watch } from './watch';

export const ADDED_PAGES_KEY = 'pages/added.json';
export const MAX_ADDED_PAGES = 30;
/** Tag every added page carries. */
export const ADDED_TAG = 'added';

export interface AddedPage {
  id: string;
  url: string;
  name: string;
  addedAt: string;
}

export type SealPageRefusal =
  | 'bad-url'
  | 'page-exists'
  | 'too-many'
  | 'needs-contact'
  | 'blocked'
  | 'fetch-failed'
  | 'js-rendered'
  | 'busy';

export type SealPageResult =
  | { status: 'sealed'; watch: Watch; pact: PactRecord }
  | { status: 'refused'; code: SealPageRefusal; message: string; ghostId?: string };

export const JS_RENDERED_MESSAGE =
  'This page renders in your browser, so there is no text for the ghost to read. It cannot be sealed this way.';

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|msclkid$|_ga$)/i;

/** The address as the watcher keeps it: no fragment, no tracking parameters. Null when it is not a public http(s) address. */
export function normalizePageUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  return url.href;
}

/** `page-` and the first 10 hex characters of the SHA-256 of the normalised address. */
export function pageIdFor(url: string): string {
  return `page-${createHash('sha256').update(url).digest('hex').slice(0, 10)}`;
}

/** The ghost for an added page: its whole readable text, and a shriek when that text changes. */
export function pageWatch(page: AddedPage): Watch {
  return defineWatch({
    id: page.id,
    name: page.name,
    subtitle: new URL(page.url).host,
    url: page.url,
    tags: [ADDED_TAG],
    fields: [{ name: 'text', label: 'Page text', selector: READABLE_SELECTOR, kind: 'text' }],
    rules: [rules.changed('text', { severity: 'shriek', label: 'Page text changed' })],
  });
}

function nameFor(title: string, url: string): string {
  const parsed = new URL(url);
  const base = title || `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  return base.length > 60 ? `${base.slice(0, 59).trimEnd()}…` : base;
}

/** The stored added pages. A missing or unreadable list is no pages. */
export async function loadAddedPages(blobs: BlobStore): Promise<AddedPage[]> {
  try {
    const text = await blobs.get(ADDED_PAGES_KEY);
    if (text === null) return [];
    const parsed: unknown = JSON.parse(text);
    const pages = (parsed as { pages?: unknown } | null)?.pages;
    if (!Array.isArray(pages)) return [];
    return pages.filter(
      (p): p is AddedPage =>
        typeof p === 'object' && p !== null && ['id', 'url', 'name', 'addedAt'].every((k) => typeof (p as Record<string, unknown>)[k] === 'string') &&
        /^[a-z0-9][a-z0-9-]{0,62}$/.test((p as AddedPage).id) && normalizePageUrl((p as AddedPage).url) !== null,
    );
  } catch {
    return [];
  }
}

async function saveAddedPages(blobs: BlobStore, pages: AddedPage[]): Promise<void> {
  await blobs.put(ADDED_PAGES_KEY, serializeJson({ version: 1, pages }));
}

const pending = new Set<string>();

type SealPageDeps = Pick<GhostDeps, 'app' | 'fetcher' | 'store' | 'runner' | 'clock' | 'archive'>;

const refuse = (code: SealPageRefusal, message: string, ghostId?: string): SealPageResult => ({
  status: 'refused',
  code,
  message,
  ...(ghostId ? { ghostId } : {}),
});

/** Fetches a public page once, and when it is readable, adds it as a ghost and seals it as a pact. */
export async function sealAnyPage(deps: SealPageDeps, rawUrl: string): Promise<SealPageResult> {
  const url = normalizePageUrl(rawUrl);
  if (url === null) return refuse('bad-url', 'That is not a public web address. Paste a full address that starts with http:// or https://.');
  const id = pageIdFor(url);
  const known = deps.app.watches.find((w) => w.id === id || w.url === url);
  if (known) return refuse('page-exists', `${known.name} is already watched. Open it and press "Seal again" to seal it anew.`, known.id);
  const added = deps.app.watches.filter((w) => w.tags.includes(ADDED_TAG)).length;
  if (added >= MAX_ADDED_PAGES) return refuse('too-many', `${MAX_ADDED_PAGES} pages were already added. Lay one to rest before adding another.`);
  if (visitsThirdParty(url) && !deps.app.contactUrl) {
    return refuse('needs-contact', 'This page is on a real website, so the watcher must identify itself first. Set GHOST_CONTACT_URL to a page you control, then start the dashboard again.');
  }
  if (pending.has(id)) return refuse('busy', 'That page is being sealed right now.');
  pending.add(id);
  try {
    const outcome = await deps.fetcher.fetchPage(url);
    if (outcome.status === 'blocked') return refuse('blocked', `This site's robots.txt asks watchers not to visit this page, so the ghost will not. (${outcome.robotsUrl})`);
    if (outcome.status === 'error') return refuse('fetch-failed', `The page could not be read: ${outcome.message}`);
    if (readableText(outcome.html).length < MIN_READABLE_CHARS) return refuse('js-rendered', JS_RENDERED_MESSAGE);

    const page: AddedPage = { id, url, name: nameFor(pageTitle(outcome.html), url), addedAt: outcome.fetchedAt };
    const watch = pageWatch(page);
    deps.app.watches.push(watch);
    try {
      const checked = await deps.runner.check(watch, { force: true, outcome });
      if (checked.status !== 'baseline') {
        throw new Error(checked.status === 'error' ? checked.message : 'The first reading was not recorded.');
      }
      const sealed = await sealPact({ store: deps.store, clock: deps.clock, ...(deps.archive ? { archive: deps.archive } : {}) }, watch);
      if (sealed.status !== 'sealed') throw new Error('The first reading could not be sealed.');
      const stored = await loadAddedPages(deps.store.blobs);
      await saveAddedPages(deps.store.blobs, [...stored.filter((p) => p.id !== id), page]);
      const { snapshot: _body, ...record } = sealed.pact;
      return { status: 'sealed', watch, pact: record };
    } catch (error) {
      const index = deps.app.watches.indexOf(watch);
      if (index >= 0) deps.app.watches.splice(index, 1);
      await deps.store.deletePact(id).catch(() => false);
      return refuse('fetch-failed', `The page could not be sealed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } finally {
    pending.delete(id);
  }
}
