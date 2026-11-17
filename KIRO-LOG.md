# Kiro log

This file records every call made to Kiro (`kiro-cli`) while building Ghost Watcher: what was asked,
which files Kiro produced, and what went wrong. Two calls were made in total. Neither used
`--trust-all-tools`; each call was given an explicit list of trusted tools.

## Before the calls

The three steering files in `.kiro/steering/` (`product.md`, `tech.md`, `structure.md`) were written
first, with `inclusion: always` front matter, so that Kiro would plan against the same product,
stack and folder layout the code later followed.

## Call 1: spec generation (no files written)

**Command**

```sh
kiro-cli chat --no-interactive --trust-tools=fs_read,fs_write "<prompt below>" </dev/null
```

**Prompt**

> Read the steering files in .kiro/steering (product.md, tech.md, structure.md). Then write a Kiro
> spec for the Ghost Watcher skeleton and its two apps into .kiro/specs/ghost-watcher-kit/:
> (1) requirements.md with user stories and acceptance criteria in EARS notation (WHEN/IF/WHILE ...
> THE SYSTEM SHALL ...), numbered, covering watch definitions, polite fetching (robots.txt, per-URL
> minimum interval, honest User-Agent), snapshot storage, semantic diff with normalization
> (whitespace, money, dates), rules (value went up/down, changed, text appeared/disappeared, new list
> item matching a filter), alerts (local outbox default, Amazon SES adapter opt-in), the ghost
> dashboard (each watch is a ghost that glows on change, acknowledge, check now), the bonus-watch app
> and the listing-watch app, and fixture-based testing. (2) design.md with architecture, a mermaid
> diagram, the adapter interfaces in TypeScript, data models, the check-run sequence, error handling
> and testing strategy. (3) tasks.md as a numbered checklist of implementation tasks (- [ ] format)
> that each reference requirement numbers. Follow the steering files exactly. Only write those three
> files; do not create any other files.

**Result:** Kiro read the steering files and drafted all three documents, but every write was refused:

```
tool permission approval is not supported in non-interactive mode. Use --trust-all-tools to auto-approve.
```

The session defaulted to the older engine, whose write tool is not named `fs_write`, so the trust
list did not cover it. One response-stream error also appeared:
`Internal error (code -32603): ... The request was throttled by the service`.
Run time was about 5 minutes. No files were produced, and no credit figures were printed.

## Call 2: spec generation (three files written)

**Command**

```sh
kiro-cli chat --v3 --no-interactive --trust-workspace \
  --trust-tools=read_file,list_directory,file_search,grep_search,fs_write,fs_append,str_replace \
  "<prompt below>" </dev/null
```

**Prompt:** the same as call 1, with two extra sentences at the end:
"Use the fs_write tool to create each file. Only write those three files; do not create any other
files and do not run shell commands."

**Result:** Kiro read the steering files and wrote the three spec files in parallel:

| File | Size | Contents |
| --- | --- | --- |
| `.kiro/specs/ghost-watcher-kit/requirements.md` | 741 lines | Requirement groups `REQ-WATCH`, `REQ-FETCH`, `REQ-STORE`, `REQ-DIFF`, `REQ-RULES`, `REQ-ALERTS`, `REQ-DASH`, `REQ-BONUS`, `REQ-LISTING`, `REQ-TEST`, `REQ-NF`, each with a user story and EARS acceptance criteria |
| `.kiro/specs/ghost-watcher-kit/design.md` | 508 lines | Architecture, two mermaid diagrams (check-run pipeline, components and ports), TypeScript adapter interfaces, data models, the check-run sequence, error handling, adapter selection and testing strategy |
| `.kiro/specs/ghost-watcher-kit/tasks.md` | 19 sections | A `- [ ]` checklist where every task cites the requirements it satisfies |

Kiro also raised two design decisions on its own, and the code follows both:

1. The per-URL minimum interval belongs in the runner, using the stored snapshot so it survives
   restarts. Host-level politeness (robots.txt cache, User-Agent, timeouts, the per-host lock and
   Crawl-delay) belongs in the fetcher.
2. "Check now" may bypass the per-URL interval as an explicit user action, but it still honors
   robots.txt and the per-host lock.

The run took about 9.5 minutes. Along the way the service throttled the session several times
(HTTP 429 `ThrottlingException`, reason `CREDIT_CONSUMPTION_RATE_EXCEEDED`, retry after 300 s). The
CLI waited and retried, and the run finished successfully. Request IDs from the throttled responses:
`ba0e8cb0-9937-48b7-aeb8-6ac151ef4e38`, `ffa91d5f-3e0b-4b34-b463-f3369c9183c4`,
`77a148bc-6619-4436-950f-1a52c196c803`. The CLI did not print any credit usage figures.

## Hand edits after Kiro

- **REQ-DIFF-09, criterion 2.** Kiro's draft let some rules (`appeared`, `newItem`) fire on the first
  check. During implementation this was changed so the first run records a baseline and fires no
  rules. Otherwise, adding a listings page would alert on every listing already on it. The
  requirement text was edited to match, and `template/test/rules.test.ts` covers it.
- **tasks.md.** Every task was checked off once `npm test` passed. An "Implementation notes"
  section at the end records where names or shapes differ from the task wording (for example,
  `PoliteFetcher` for `HttpFetcher`, and five ghost states instead of three).
- **structure.md steering.** The app folders were updated to match what was built: watches and
  theme live in `src/app.ts`, there is a `test/` folder in each app, and the Playwright specs are
  in the root `e2e/`.

## Hooks

`.kiro/hooks/` holds two agent hooks used while building:

- `test-on-save.json`: on `PostFileSave` of any `.ts` or `.js` file, runs
  `npm run typecheck && npm run test:unit`.
- `full-suite-on-stop.json`: on `Stop`, runs `npm test` (type-check, unit and end-to-end).

Both files follow the hook schema in the Kiro documentation (https://kiro.dev/docs/hooks/, checked
2026-11-16): one JSON file per hook group in `.kiro/hooks/`, with `"version": "v1"`, a `hooks`
array, PascalCase `trigger` names (`PostFileSave`, `Stop`), an optional `matcher` regular
expression against the file path, and an `action` of type `command`. This is the format that Kiro
IDE 1.0 and Kiro CLI V3 load automatically. The older IDE 0.x `*.kiro.hook` files with `when` and
`then` keys are superseded by it. The commands themselves were run by hand during the build (they
are the same `npm` scripts the test suite uses).

## Changes after review

A review of a clean clone raised three points, handled by hand without further Kiro calls:

- **Cross-origin writes.** The dashboard now refuses requests whose Host header is not loopback or
  listed in `GHOST_ALLOWED_HOSTS`, and refuses POSTs with a cross-site `Origin` or
  `Sec-Fetch-Site`. Added as REQ-DASH-SEC-01 and task 20.1 in the spec.
- **Placeholder contact URL.** The watcher refuses to start when a watch points at a real
  third-party site while the contact URL is still on a documentation-only domain. Added as
  REQ-FETCH-SEC-01 and task 20.2.
- **First impression.** `demo` mode now takes the baseline at startup and adds a **Let a night
  pass** button, so the first click already shows a change. Added as REQ-DEMO-01 and task 20.3.
