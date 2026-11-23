/** Pages and a fixture site for the seal-any-page tests. Every name is invented; every request stays on 127.0.0.1. */
import type { FixtureSite } from '../src/testing/fixture-server';

export interface ArticleOptions {
  version: number;
  requestNumber: number;
  now?: Date;
  /** Extra whitespace between blocks, to prove that formatting never counts. */
  spaced?: boolean;
}

export function articlePage({ version, requestNumber, now = new Date('2026-11-19T10:00:00Z'), spaced = false }: ArticleOptions): string {
  const later = version >= 2;
  const gap = spaced ? '\n\n   ' : '\n';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Hollowmere: terms</title>
<script>window.__session = "${requestNumber}";</script></head>
<body>
<div id="cookie-banner">We use cookies. <button>Accept</button> Request ${requestNumber}.</div>
<nav><a href="/">Home</a> <a href="/">Sign in</a></nav>
<div class="ad-slot">Sponsored: offer number ${requestNumber}.</div>
<main><article>${gap}<h1>Hollowmere welcome bonus terms</h1>${gap}<time datetime="${now.toISOString()}">${now.toUTCString()}</time>
<p>Open a Hollowmere Everyday account and earn a ${spaced ? '$ 200.00' : '$200'} welcome bonus. The offer is for new members only.</p>${gap}
<p>Receive direct deposits totaling ${later ? '$3,000' : '$2,000'} within 60 days of opening the account to qualify.</p>
<ul>${gap}<li>Keep a balance of at least $500 for 90 days.</li>${gap}<li>The bonus is paid within 30 days after you qualify.</li>${later ? '<li>Accounts closed within 180 days forfeit the bonus.</li>' : ''}</ul>
<p>Hollowmere is an invented institution for software demos, not a real credit union.</p>
</article></main>
<footer>Page generated ${now.toISOString()} · request id ${requestNumber.toString(16).padStart(6, '0')}</footer>
</body></html>`;
}

export const SHELL_PAGE = `<!doctype html><html><head><title>Hollowmere app</title></head>
<body><div id="root"></div><noscript>Please enable JavaScript.</noscript><script>document.getElementById('root').textContent='Offers load here';</script></body></html>`;

/** `/article` (two versions), `/shell` (renders in the browser) and `/private/terms` (robots.txt disallows it). */
export const articleSite: FixtureSite = {
  name: 'seal-any-page',
  versions: 2,
  robots: 'User-agent: *\nDisallow: /private/\n',
  pages: [
    { path: '/article', title: 'Article', render: (ctx) => articlePage({ version: ctx.version, requestNumber: ctx.requestNumber, now: ctx.now }) },
    { path: '/shell', title: 'Shell', render: () => SHELL_PAGE },
    { path: '/private/terms', title: 'Private', render: (ctx) => articlePage({ version: ctx.version, requestNumber: ctx.requestNumber }) },
  ],
};
