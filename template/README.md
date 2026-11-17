# @ghost-watcher/template

The skeleton both apps are built on. An app is one file of watch definitions. The template
supplies polite fetching, extraction, the semantic diff, rules, plain-English summaries, alerts,
storage, the haunted dashboard and the CLI.

Apps import only from `@ghost-watcher/template`, plus `@ghost-watcher/template/testing` for the
fixture site server.

## Build an app in four steps

### 1. Describe the pages

```ts
// apps/price-watch/src/app.ts
import { HOUR_MS, defineApp, defineWatch, rules, where, type Env } from '@ghost-watcher/template';

export function buildApp(env: Env = process.env) {
  const site = env.SHOP_SITE_ORIGIN ?? 'http://127.0.0.1:3139';
  return defineApp({
    id: 'price-watch',
    name: 'The Haunted Till',
    tagline: 'Ghosts that watch a shop for price drops.',
    version: '0.1.0',
    contactUrl: 'https://example.com/price-watch', // sent in the User-Agent
    alertTo: ['shopper@example.com'],
    copy: { watchNoun: 'shop pages', quiet: 'Nothing has stirred yet.' },
    theme: { accent: '#ffb86b', crest: 'Till' },
    watches: [
      defineWatch({
        id: 'lantern-sale',
        name: 'Brass lantern',
        url: `${site}/products/brass-lantern`,
        intervalMs: 6 * HOUR_MS,
        fields: [
          { name: 'price', label: 'Price', selector: '[itemprop="price"]', kind: 'money' },
          { name: 'stock', label: 'Stock', selector: '.stock', kind: 'text' },
        ],
        rules: [
          rules.wentDown('price', { severity: 'shriek' }),
          rules.appeared('stock', { matching: 'back in stock' }),
        ],
      }),
      defineWatch({
        id: 'clearance',
        name: 'Clearance shelf',
        url: `${site}/clearance`,
        lists: [
          {
            name: 'items',
            label: 'item',
            itemSelector: 'li.product',
            identity: ['sku'],
            describe: '{title} for {price}',
            fields: {
              sku: { selector: ':self', attribute: 'data-sku', kind: 'text' },
              title: { selector: 'h3', kind: 'text' },
              price: { selector: '.price', kind: 'money' },
            },
          },
        ],
        rules: [rules.newItem('items', [where.atMost('price', 40)], { severity: 'moan' })],
      }),
    ],
  });
}
```

`defineWatch` validates the definition up front: ids, URLs, selectors that rules refer to, list
identity fields and regex patterns. A typo fails at startup, not at 3 a.m.

### 2. Give it a command line

```ts
// apps/price-watch/src/main.ts
import { runCli } from '@ghost-watcher/template';
import { buildApp } from './app';

await runCli(process.argv.slice(2), { buildApp, defaultPort: 3138, siteOriginVar: 'SHOP_SITE_ORIGIN' });
```

This gives you `check [--force] [--watch <id>] [--json]`, `serve [--port <n>] [--fresh]` and
`list`. Pass `startFixtures` and `defaultFixturePort` as well to get `demo`, which starts your
fixture site, records a baseline for every watch, and serves the dashboard against it with a
**Let a night pass** button that moves the fixture site to its next version and checks again.

### 3. Build a fixture site

```ts
import type { FixtureSite } from '@ghost-watcher/template/testing';

export const shopSite: FixtureSite = {
  name: 'Haunted Till fixtures',
  versions: 2,
  robots: 'User-agent: *\nDisallow: /account/\nCrawl-delay: 0.2',
  pages: [
    {
      path: '/products/brass-lantern',
      title: 'Brass lantern',
      render: ({ version, now }) => `<p itemprop="price">${version === 1 ? '$49' : '$39'}</p>
        <p class="stock">In stock</p><footer>Rendered ${now.toISOString()}</footer>`,
    },
  ],
};
```

`startFixtureServer(site, { port })` serves numbered versions of each page and exposes
`POST /__fixture/advance`, `POST /__fixture/reset`, `POST /__fixture/outage` and
`GET /__fixture/log`. The log lists every request and its User-Agent, so tests can prove a
disallowed path was never requested.

### 4. Test it

Unit-test the watches by extracting two fixture versions and evaluating the rules. Then drive the
real CLI or dashboard against `startFixtureServer`. Both apps in `apps/` follow this pattern; see
their `test/` folders and the root `e2e/` folder.

## Modules

| Module | Responsibility |
| --- | --- |
| `watch.ts` | `defineWatch`, the `rules` and `where` builders, validation |
| `normalize.ts` | Whitespace, money, number, percent, date and URL normalizers, and canonical keys |
| `extract.ts` | HTML to watched values with cheerio: fields, lists, attributes, `pattern` captures |
| `diff.ts` | Semantic diff of two snapshots: field changes with deltas, and list items added, removed or changed by identity |
| `rules.ts` | Evaluates rules against a diff, applies filters, and dedupes to the most specific and loudest finding |
| `summary.ts` | One-sentence explanations, sentence-level pairing for long text, word-level diff |
| `robots.ts` | RFC 9309 robots.txt parsing and matching |
| `fetcher.ts` | `PoliteFetcher`: robots.txt cache, honest User-Agent, per-host lock, Crawl-delay, timeouts, size cap |
| `runner.ts` | The check pipeline, interval gate, back-off and single-flight checks |
| `store/` | `BlobStore` port (memory, file, S3) and `GhostStore` (snapshots, status, alerts, acknowledgements) |
| `alerts/` | `AlertSink` port (outbox, console, fan-out, SES) and the email renderer |
| `config.ts` | Environment-driven adapter selection (`loadDeps`); refuses a placeholder contact URL for real sites |
| `guard.ts` | Dashboard request guard: loopback or `GHOST_ALLOWED_HOSTS` Host only, same-origin POSTs only |
| `server.ts`, `view.ts`, `ui/` | The dashboard: JSON API, view model, shared renderer, client script and theme |
| `cli.ts` | `check`, `serve`, `demo`, `list` |

## Rules reference

| Rule | Fires when |
| --- | --- |
| `rules.wentUp(field, { minDelta? })` | A numeric, money, percent or date value increases |
| `rules.wentDown(field, { minDelta? })` | It decreases |
| `rules.changed(field)` | The normalized value changes. It is skipped when a more specific rule already fired for the same field |
| `rules.appeared(field, { matching? })` | The region appears, or a sentence matching the phrase is new |
| `rules.disappeared(field, { matching? })` | The region vanishes, or a sentence matching the phrase is gone |
| `rules.newItem(list, filters?)` | A list item with a new identity matches every filter |
| `rules.itemRemoved(list, filters?)` | A list item is gone |
| `rules.itemChanged(list, field, { direction? })` | A field of an existing item changes, optionally only `up` or `down` |

Filters: `where.eq`, `neq`, `lt`, `atMost`, `gt`, `atLeast`, `oneOf`, `contains`.
Text filters ignore case; numeric filters compare normalized numbers.

Every rule takes `severity` (`whisper`, `moan` or `shriek`) and an optional `label`. No rule fires
on the first check of a watch.
