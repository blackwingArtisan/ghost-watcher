---
inclusion: always
---

# Product: Ghost Watcher

Ghost Watcher is a reusable skeleton for one job: **watch a web page and tell me when the part I care
about changes.** Each watch is a ghost that lurks on a page. When the watched values change in a way a
rule cares about, the ghost glows and an alert lands in the outbox.

## Who it is for

- People who track terms that change quietly: bank and card sign-up bonuses, rental listings, city
  building permits, price pages, policy pages.
- Developers who want to build a focused watcher for their own niche without rebuilding fetching,
  politeness, snapshot storage, diffing, rules and alerts each time.

## The skeleton and its two apps (Skeleton Crew)

- `/template` is the skeleton: watch definitions, a polite fetcher, a snapshot store, a semantic diff,
  rules, alert sinks, a check runner, a CLI and a ghostly dashboard. It is documented so others can
  build on it.
- `/apps/bonus-watch` watches bank and card sign-up bonus pages: bonus amount, minimum deposit,
  deadline and fine print.
- `/apps/listing-watch` watches apartment listings and city building-permit pages and alerts on new
  entries that match the user's filters (price, beds, neighborhood, permit type).

Both apps must be built only from the template's public API. If an app needs something the template
lacks, add it to the template in a generic form.

## Product principles

1. **Signal, not noise.** Alert on meaning, not markup. Whitespace, date formats, tracking parameters,
   ad slots and "page generated at" stamps never cause an alert. Only the watched values do.
2. **A good neighbor.** Respect robots.txt, never check a page more than once per configured interval
   (default 6 hours), identify honestly in the User-Agent with a contact URL, and back off on errors.
3. **Explain every alert.** Each alert says what changed, from what to what, and which rule fired, in
   one plain sentence a non-developer understands.
4. **Free by default.** Everything runs locally with no accounts. Paid services (email, cloud storage)
   sit behind adapters and are opt-in by environment variable.
5. **Spooky but legible.** The haunted theme carries the delight; the data stays readable and
   accessible (contrast, keyboard use, reduced motion).

## Non-goals

- No headless-browser scraping of logged-in or JavaScript-only pages.
- No bypassing paywalls, logins, CAPTCHAs or robots.txt.
- No financial advice; bonus-watch reports what a page says, nothing more.
