# Ghost Watcher

**Banks edit the fine print at night. Ghost Watcher keeps the receipts.**

![The Bonus Crypt in 14 seconds: each stone already wears a ribbon from the archive, such as Lanternfield's "Bonus cut $200 in June"; then one night passes, the moon flushes red, two ghosts wake, the stones show $300 struck through beside $400, and Spirit mail fills with a Bait and switch letter](docs/bonus-crypt-night.gif)

**Live demo: [ghost-watcher.pages.dev](https://ghost-watcher.pages.dev/)** (a static recording of the Bonus Crypt; press **Let a night pass**)

- **Seal the pact on the day you apply.** One click keeps the offer page as it read that day: a
  snapshot, its SHA-256 and an archived copy.
- **Wakes only for changes that matter.** 10 alerts where a whole-page watcher sent 77 on the same
  pages, none false, none missed, and a slow drift since the day you applied still raises a flag.
- **Raise the dead writes the letter.** When a bonus is cut or withheld, it drafts the dispute letter
  and CFPB complaint text with what the page promised against what it says now. When the offer goes
  up after you applied, it writes the bonus-match request instead.

It happens to real customers. In July 2023 the CFPB found that Bank of America had
["illegally withheld promised credit card account bonuses"](https://www.consumerfinance.gov/about-us/newsroom/bank-of-america-for-illegally-charging-junk-fees-withholding-credit-card-rewards-opening-fake-accounts/)
from tens of thousands of consumers, part of an order that included $90 million in CFPB penalties.
The CFPB's public complaint database holds **22,055 complaints** filed as "didn't receive advertised
or promotional terms" (credit cards) or "didn't receive terms that were advertised" (opening a
checking or savings account) ([queries](docs/sources.md), checked 2026-11-18).

A typical bonus hunter earns $2,000 to $5,000 a year in bonuses; one withheld $300 bonus pays for
years of the $4-a-month hosted plan. A screenshot proves one moment; a pact also catches every later
change and writes the letter.

[Try it in 60 seconds](#try-it-in-60-seconds) · [Signal, not noise](#signal-not-noise) ·
[Why not what you already use?](#why-not-what-you-already-use) · [Judges' map](JUDGES.md) ·
[Kiro log](KIRO-LOG.md) · [Full details](docs/details.md)

### For judges

Kiroween 2026, **Skeleton Crew**: one template, two apps that look and behave differently (the Bonus
Crypt and Haunted Listings), each a single `app.ts` on the shared skeleton.

| | Where to look |
| --- | --- |
| 60 seconds | `npm install && npm run bonus`, open http://127.0.0.1:3130/?night=1 (the night passes as it loads), then **Raise the dead** on the Bait and switch letter |
| Criteria to evidence | [JUDGES.md](JUDGES.md): each judging criterion mapped to files, commands and numbers |
| Spec | [`.kiro/specs/ghost-watcher-kit/`](.kiro/specs/ghost-watcher-kit/): EARS requirements, design and task list written by Kiro, then reviewed by Kiro against the code. [`.kiro/specs/seal-the-pact/`](.kiro/specs/seal-the-pact/): the headline feature, specced and then built by Kiro |
| Steering and hooks | [`.kiro/steering/`](.kiro/steering/) (always included) and [`.kiro/hooks/`](.kiro/hooks/): tests on save, the full suite on Stop (it caught a stale assertion that Kiro then fixed), and Kiro's `money-guard` agent hook |
| Who wrote what | [KIRO-LOG.md](KIRO-LOG.md#who-wrote-what) |
| Tests | `npm test`: type-check, 353 Vitest tests and 27 Playwright tests, all against `127.0.0.1` |

### Try it in 60 seconds

```sh
npm install
npm run bonus      # open http://127.0.0.1:3130/?night=1
```

Everything runs on your machine against an invented bank site. No accounts, keys or live sites.
Without `?night=1`, click **Let a night pass** (or press <kbd>N</kbd>); **Rewind to calm** starts
over. `npm run listing` opens Haunted Listings on port 3132.

The [live site](https://ghost-watcher.pages.dev/) is a static recording of this demo (`npm run build:static`), so it watches no real
pages; watching real pages needs the Node server (`npm run bonus`).

## What one night looks like (demo data, invented banks)

> Bonus went up from $300 to $400 (+$100).
>
> **Bait and switch:** Bonus points stayed the same while the fine print changed. Fine print now says
> "Bonus not available if you have opened any Mossgate card in the past 48 months."

Before a single night has passed, the **Ghost of Terms Past** reads each page's archived copies: the
Lanternfield bonus was $500 in March and cut to $300 in June. When the first night raises it to $400,
the ghost shrieks; when Mossgate slips an eligibility window under an unchanged headline, the letter
leads with **Bait and switch**. Each of those keeps a **receipt** (the SHA-256 of the page before and
after, plus a permanent copy from the Internet Archive's Save Page Now), and **Raise the dead** turns
the receipt into a dispute pack: a letter to the bank with the old and new terms and their dates, the
archived link and both hashes, and prefilled CFPB complaint text. Bramblewick only reformatted its
page, and its ghost slept straight through it.

**Seal the pact.** On the day you apply, press **I applied today** on the bank's stone in the Bonus
Crypt. The ghost seals that page as your pact: the snapshot, its SHA-256, a permanent copy from the
Internet Archive when archiving is on, and the date. From then on every change is judged against the
pact as well as against last night, so a slow drift in small steps still raises a flag, and the dispute
pack quotes what the page promised the day you applied against what it says now. When the bank
improves its terms after you applied, the pack becomes a **bonus match** letter that asks for the
better terms. Replacing or breaking a pact always asks first. In the demo the pact is back-dated 40
days, so the first night already reads "Oct 10, the day you applied" against "Nov 19, what it says
now" (the date depends on the day you run it), and the demo pact has no archived copy because none
could honestly be dated that far back.

![The Bonus Crypt after one night: four ghosts on tombstones, two glowing with the old values struck through beside the new ones, one asleep after a reformat-only change, one turned away by robots.txt, and Spirit mail with a Bait and switch letter](docs/bonus-crypt.png)

## Who it's for

**Bonus hunters, and the money is in the match.** When an offer goes up after you apply, some
issuers will match it if you ask, but you have to know it changed and show what you signed up for.
In July 2024, when Chase raised a business card offer from 100,000 to 120,000 points, readers who had
applied under the lower offer asked by secure message and were matched
([Doctor of Credit](https://www.doctorofcredit.com/chase-is-matching-the-signup-bonus-for-120000-ink-preferred-offer/)).
Doctor of Credit's issuer roundup says "Citi will usually match a signup bonus within 90 days", and
Chase can switch a new checking account to a better promo code "for the first 21 days after opening"
([roundup](https://www.doctorofcredit.com/which-credit-card-issuers-will-match-a-higher-signup-bonus/),
[checking](https://www.doctorofcredit.com/does-chase-match-a-checking-or-savings-bonus-yes-for-21-days/)).
When a bonus never posts, the same site's advice is to "always take a screenshot of any offers you
sign up for", and in one 2016 case an issuer honored a disputed offer
["only if they were able to provide a screenshot"](https://www.doctorofcredit.com/citi-honoring-no-minimum-spend-deals-but-require-screenshot-2/).
Ghost Watcher does both jobs: it notices the better offer and keeps the proof. (Pages read on
2026-11-22; [sources](docs/sources.md#public-data-points-proof-of-the-offer-gets-bonuses-paid).)

r/churning has roughly 678,000 members
([The Hive Index](https://thehiveindex.com/communities/r-churning/), checked 2026-11-22), and Doctor
of Credit's rule of thumb is that it is
["generally OK to open 10 or less bank accounts each year"](https://www.doctorofcredit.com/how-many-bank-accounts-can-i-safely-open-within-a-year-for-bank-bonus-purposes/).
At $200 to $500 a bonus, a typical hunter earns $2,000 to $5,000 a year in bonuses.

**Same skeleton, other hauntings.** Haunted Listings watches rentals and building permits on a dusk
street where each house names the unit that lit its window, and any page that deserves a ghost is one
`app.ts` away.

![Haunted Listings after one night: gabled houses on a dusk street, each window lit by a match, the Larkspur house naming "2 bd $2,050 Larkspur Heights", Tonight's tally under the street, and the Knocks at the door feed](docs/haunted-listings.png)

## Signal, not noise

It never cries wolf. `npm run noise` replays the same three nights of both fixture sites, checked
every 6 hours, through three watchers that see the exact same responses. Each cell is alerts sent
(false alarms, changes missed); Vitest pins the numbers.

| App | Checked | Changes worth knowing | Whole-page watcher | Selector text watcher | Ghost Watcher |
| --- | --- | --- | --- | --- | --- |
| The Bonus Crypt | 3 pages, 33 visits | 4 | 33 (29 false, 0 missed) | 5 (1 false, 0 missed) | 4 (0 false, 0 missed) |
| Haunted Listings | 4 pages, 44 visits | 6 | 44 (38 false, 0 missed) | 6 (0 false, 0 missed) | 6 (0 false, 0 missed) |
| **Total** | 7 pages, 77 visits | 10 | **77 (67 false, 0 missed)** | **11 (1 false, 0 missed)** | **10 (0 false, 0 missed)** |

The fixture pages are invented, but their noise is typical: timestamps, request ids, rotating promos
and one night where a bank only reformats its offer. `scripts/real-pages.ts` replays a real page's
Wayback Machine history through the same three watchers ([procedure](docs/real-pages.md)).

## Why not what you already use?

| | What it does well | Where Ghost Watcher differs |
| --- | --- | --- |
| [Doctor of Credit](https://www.doctorofcredit.com/) and [r/churning](https://www.reddit.com/r/churning/) | The best place to find offers and readers' data points | They cover popular offers after the fact. Ghost Watcher watches the exact pages you applied to, catches fine-print edits nobody posts, and keeps a dated receipt you can send the bank |
| [changedetection.io](https://github.com/dgtlmoon/changedetection.io) | Open source, self-hosted or $8.99/month hosted; CSS, XPath and JSONPath filters, many notification channels | Its README leaves robots.txt to the user; Ghost Watcher enforces it and identifies itself honestly. Values are typed (money in integer cents, dates in days), so alerts state the change |
| [Visualping](https://visualping.io) and [Distill.io](https://distill.io) | Hosted visual and text monitoring with AI change summaries | Whether a change matters is decided by rules you can read and unit-test, not a model, and receipts and dispute letters are built in |
| [Open Terms Archive](https://opentermsarchive.org/en/) | Open source; publicly records every version of the terms of digital services | It tracks platforms' terms for public oversight, not the offer page you applied to; Ghost Watcher seals your page on your day and turns a change into a letter |
| [Page Vault](https://www.page-vault.com/) and [WebPreserver](https://www.pagefreezer.com/webpreserver/) | Court-ready web captures with hashes, for legal teams and investigators | Paid professional tools for one capture at a time; Ghost Watcher seals the day you apply, keeps watching, and is free to self-host |
| A screenshot | Free and instant | A screenshot proves one moment; a pact also catches every later change and writes the letter |
| Paribus (now part of Capital One Shopping) | Claimed refunds automatically when a price dropped after you bought | Paribus-style claims for bank bonuses, with evidence that holds up: a hashed, archived copy of the terms from the day you applied |

Feature details were checked against each product's own pages on 2026-11-18 and 2026-11-22; the
sources are in [docs/details.md](docs/details.md#what-only-ghost-watcher-does) and
[docs/sources.md](docs/sources.md#products-in-the-comparison-table).

## Built with Kiro

Kiro specced and built the headline feature, **Seal the pact**: it wrote
`.kiro/specs/seal-the-pact/` (91 EARS criteria, 27 tasks) and then all of its code and tests in two
`kiro-cli` sessions (4,526 lines, 120 Vitest and 10 Playwright tests, 52.95 credits), with no line
fixed by hand. Kiro also wrote the spec the skeleton is built against, reviewed it against the code,
built the integer-cents money change, the contact-URL policy and the overridable e2e ports, and wrote
the `money-guard` agent hook. Its hooks run the tests on save and the full suite when an agent turn
ends (which caught a stale assertion Kiro then fixed). The skeleton's first version and the earlier
features were written against Kiro's spec with another AI coding assistant.
[KIRO-LOG.md](KIRO-LOG.md) records every Kiro call, its transcript and who wrote what.

## Beyond Kiroween

- **Free to self-host.** MIT-licensed; runs on one machine with no accounts. S3, SES and webhook
  (ntfy, Discord, Slack) adapters are there for running it unattended.
- **Personal, about $4 a month.** 25 hosted ghosts, phone alerts and a weekly digest, priced under
  general watchers (changedetection.io hosted is $8.99/month; Visualping Personal is $14/month).
  Market math: 678,000 r/churning members × 2% × $48 a year ≈ $650,000 a year, from one community
  ([sources](docs/sources.md#consumer-market-estimate)).
- **Comparison and affiliate sites.** Sites that list bank and card offers must keep every offer
  they show accurate, and regulators have looked hard at them: the CFPB's 2024 circular on
  comparison-shopping tools warned against steering consumers (withdrawn in May 2025;
  [sources](docs/sources.md#comparison-site-wedge)). A Pro plan, about $49 a month, watches every
  offer they list and keeps dated proof of what each page said.
- **Other "the terms changed under me" niches.** Rental listings and their fees (Haunted Listings
  already watches rents), subscription prices, warranty and return terms: any page you rely on is one
  `app.ts` away.
- **Why now.** The FTC's fees rule (in force since 2025-05-12,
  [Federal Register](https://www.govinfo.gov/content/pkg/FR-2025-01-10/html/2024-30293.htm)) makes live-event tickets and
  short-term lodging show the total price up front, but it does not reach bank or card offers, where
  a new fee still arrives as an edit to the fine print.

How to run, test, the architecture and every adapter are in [docs/details.md](docs/details.md).
Notable changes are in [CHANGELOG.md](CHANGELOG.md).

## Disclaimer

The banks, buildings, people and addresses in the fixtures are invented. The Bonus Crypt reports
what a page says. It is not financial or legal advice, and a dispute pack is a starting point you
review and send yourself.

## License

MIT © 2026 Stubborn Otter Software
