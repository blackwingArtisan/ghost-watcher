# Design: Seal Any Page

Builds on `.kiro/specs/seal-the-pact/design.md`; `sealPact`, `GhostStore.pact`, the comparison and the
dispute pack are reused unchanged.

## 1. Pieces

| Piece | File | Notes |
|---|---|---|
| Readable extraction | `template/src/readable.ts` | Pure. `readableText(html)`, `MIN_READABLE_CHARS`, `READABLE_SELECTOR = ':readable'`. |
| Field source | `template/src/extract.ts` | `readRaw` calls `readableText` when a field's selector is `:readable`. A generic addition: any app may watch a page's readable text. |
| Added pages | `template/src/pages.ts` | `AddedPage`, `pageWatch`, `pageIdFor`, `sealAnyPage`, `loadAddedPages`. `bookmarkletHref` and `sealPrefill` live in `ui/render.js`. Records live in blob `pages/added.json`. |
| Prefetched outcome | `template/src/runner.ts` | `CheckOptions.outcome`: the runner uses an outcome already fetched instead of fetching again, so sealing makes one request. |
| Route | `template/src/server.ts` | `POST /api/pages` `{ "url": "..." }`. |
| Startup | `template/src/config.ts` | `loadDeps` copies the watch list and appends stored added pages. |
| UI | `ui/render.js`, `ui/app.js`, `ui/style.css` | Form section above the graveyard; bookmarklet link; `?seal=` prefill. |
| Static demo | `scripts/static-demo/replay.js` | `POST /api/pages` answers `read-only`. |
| Fixtures | `apps/bonus-watch/fixtures/site.ts` | `/guides/loyalty-terms` (article with noise, 2 versions) and `/guides/app-shell` (JS-rendered). Robots refusal reuses `/members/cinderhollow/offers`. |

## 2. Readable extraction (ANY 1)

```
$ = cheerio.load(html)
$('script, style, noscript, template, nav, header, footer, aside, form, iframe, svg, time, [datetime], [hidden], [aria-hidden=true], [role=navigation|banner|contentinfo|dialog], [class|id ~ cookie|consent|gdpr|timestamp|generated|request-id|session|trace|advert|sponsor|promo]').remove()
root = first of main, [role=main], article, body
for each h1..h6, p, li, blockquote in root, skipping any that contain another of those: text, whitespace collapsed
drop lines that are only "Page generated ...", "Last updated ...", "Request id ...", or a bare date or id
```

The cheerio calls, checked in the cheerio docs through context7:
`$('li').remove();` ("Removes each element in the selection and all of its children from the
document") and `$('body').text();` ("Renders the text content of a Cheerio object").

Lines join with a single space, with a full stop added to a heading or list item that lacks one, so the
existing `sentences()` splitter in `summary.ts` yields one sentence per line. `normalizeValue` text
normalisation (whitespace, smart punctuation) applies; money like "$ 200.00" is rewritten to the
canonical `$200` by a pass in `readableText` that uses the existing money parser
(`parseMoney`), never floats.

The one-page threshold is 200 characters: a JS shell has a title and "Enable JavaScript" at most.

## 3. The added-page flow (ANY 2 to 6)

`sealAnyPage(deps, input)` returns a discriminated union: `sealed | refused` with a `code`.

1. Parse and check the URL (`bad-url`), reject a duplicate (`page-exists`) and the limit (`too-many`).
2. If `visitsThirdParty(url)` and `deps.app.contactUrl` is unset: `needs-contact`.
3. `deps.fetcher.fetchPage(url)` once. `blocked` becomes `blocked`; `error` becomes `fetch-failed`.
4. `readableText(html)`; shorter than `MIN_READABLE_CHARS`: `js-rendered`. Nothing is stored yet.
5. Build the watch with `pageWatch`: one field `text` (`:readable`, kind `text`), one rule
   `changed('text', { severity: 'shriek', label: 'Page text changed' })`, tags `['added']`, default interval.
6. Push the watch to `deps.app.watches`, then `runner.check(watch, { force: true, outcome })` writes the baseline
   from the outcome already fetched, then `sealPact`, then the record is written to `pages/added.json`.
   If any step throws, the watch is removed and the pact deleted, so a refusal leaves no ghost and no record.

`pactEnabledFor` already accepts the watch unless the app's `pactCopy.watchTags` excludes it; bonus-watch has
none. Apps that limit pacts by tag add the `added` tag to the list.

The `Runner` change is one optional field and no new fetch path: `run()` uses `options.outcome ?? await fetcher.fetchPage(...)`.

## 4. Persistence (ANY 6)

`pages/added.json` is `{ version: 1, pages: AddedPage[] }`. `loadDeps` copies `baseApp.watches`, so the app
object a test passes in is never mutated, then appends `pageWatch(record)` for each stored page. A bad file
reads as no pages. Snapshots, alerts and pacts are already per watch id in the store.

## 5. UI (ANY 2, 3, 7, 8, 9)

A `<section class="seal-page" aria-labelledby="seal-page-title">` holds a `<form>`: a labelled URL input,
the "I applied today" button, a `role=status` message, and the "Seal this page" bookmarklet link with a
short how-to. `app.js` posts to `/api/pages`, writes the refusal or success sentence into the message,
refreshes the state and opens the new séance. The bookmarklet is
`javascript:(()=>{window.open('<origin>/?seal='+encodeURIComponent(location.href),'_blank')})()`
built by `bookmarkletHref(origin)` in `render.js`. The link is set from `location.origin` when the page
loads. On load `?seal=` fills the field (http or https only) and focuses the button.

## 6. Test plan

See the traceability table in `tasks.md`. Vitest: `template/test/readable.test.ts`, `template/test/seal-any-page.test.ts`
(fixture sites on 127.0.0.1, `manualClock`). Playwright: `e2e/seal-any-page.spec.ts`, plus screenshots to
`SEAL_SHOTS`. Replay: `scripts/static-demo/replay.test.ts`.
