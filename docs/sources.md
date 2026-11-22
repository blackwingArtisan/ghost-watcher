# Sources for the numbers in the README

Every outside number in the README, with where it came from and when it was checked.

## The Bank of America withheld-bonus order

CFPB press release, July 11, 2023:
[CFPB Takes Action Against Bank of America for Illegally Charging Junk Fees, Withholding Credit Card Rewards, and Opening Fake Accounts](https://www.consumerfinance.gov/about-us/newsroom/bank-of-america-for-illegally-charging-junk-fees-withholding-credit-card-rewards-opening-fake-accounts/).

- The bank "illegally withheld promised credit card account bonuses" from "tens of thousands of
  consumers", including people who applied in person or by phone.
- The CFPB ordered $90 million in penalties: $60 million for repeat non-sufficient-funds fees and
  $30 million for the rewards practices and unauthorized accounts. The bank also paid consumers more
  than $100 million, including about $23 million already paid to consumers denied rewards bonuses.
  The OCC separately fined the bank $60 million.

## CFPB complaints about advertised terms

The CFPB's public [Consumer Complaint Database](https://www.consumerfinance.gov/data-research/consumer-complaints/)
has a free JSON API. The counts below were read on 2026-11-18 (database last updated that day).

| Product | Issue › sub-issue | Complaints |
| --- | --- | --- |
| Credit card, and Credit card or prepaid card | Advertising and marketing, including promotional offers › Didn't receive advertised or promotional terms | 11,811 |
| Checking or savings account | Opening an account › Didn't receive terms that were advertised | 10,244 |
| **Total** | | **22,055** |

```sh
API=https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/
curl -s "$API?size=0&issue=Advertising%20and%20marketing%2C%20including%20promotional%20offers%E2%80%A2Didn%27t%20receive%20advertised%20or%20promotional%20terms" | jq .hits.total
curl -s "$API?size=0&issue=Opening%20an%20account%E2%80%A2Didn%27t%20receive%20terms%20that%20were%20advertised" | jq .hits.total
```

The API's search no longer offers a field for complaint narratives, so a count of narratives that
mention the word "bonus" is not available from it. These two sub-issues are the CFPB's own categories
for "the terms I was promised are not the terms I got", which is the case Ghost Watcher's dispute pack
is filed under.

## Consumer market estimate

r/churning has about 678,000 members (below). If 2% of them paid $4 a month ($48 a year) for the
hosted Personal plan, that is 678,000 × 0.02 × $48 = $650,880, about $650,000 a year. It is a rough
sizing from one community, not a forecast; bonus hunters outside r/churning are not counted.

## Bonus hunters and their stake

- r/churning membership, about 678,000: [The Hive Index](https://thehiveindex.com/communities/r-churning/),
  checked 2026-11-18 and again 2026-11-22 (Reddit stopped showing member counts on subreddit pages in 2025).
- "In my experience it's generally OK to open 10 or less bank accounts each year":
  [Doctor of Credit](https://www.doctorofcredit.com/how-many-bank-accounts-can-i-safely-open-within-a-year-for-bank-bonus-purposes/)
  (a 2015 post, re-read 2026-11-22).
  At $200 to $500 a bonus, that is $2,000 to $5,000 a year.
- Payback: the hosted plan is about $4 a month, $48 a year, so one withheld $300 bonus won back
  covers more than six years of it.

## Public data points: proof of the offer gets bonuses paid

Each page was opened and read on 2026-11-22. No people are named.

- **Keep proof of the offer.** Doctor of Credit's guide for a bonus that never posted (2016):
  "You should always take a screenshot of any offers you sign up for. This way you have evidence
  of what the offer was like when you signed up."
  ([Doctor of Credit](https://www.doctorofcredit.com/met-the-requirements-of-a-bank-bonus-and-havent-received-it-heres-what-to-do/))
- **The issuer asked for the screenshot.** On a disputed no-minimum-spend offer (2016), "Citi was
  willing to honor the deal, but only if they were able to provide a screenshot of the offer they
  signed up with."
  ([Doctor of Credit](https://www.doctorofcredit.com/citi-honoring-no-minimum-spend-deals-but-require-screenshot-2/))
- **Bonus match after the offer went up.** When Chase raised the Ink Business Preferred offer from
  100,000 to 120,000 points (July 2024), readers who had applied under the lower offer asked by
  secure message to "increase your offer from 100k to 120k due the offer having been increased to
  120k", and it was matched.
  ([Doctor of Credit](https://www.doctorofcredit.com/chase-is-matching-the-signup-bonus-for-120000-ink-preferred-offer/))
- **Issuers differ.** Doctor of Credit's issuer roundup (2022): "Citi will usually match a signup
  bonus within 90 days"; "Since 2020, Chase no longer matches all credit card bonuses, but they do
  match some"; "Capital One doesn't typically match". For checking accounts, Chase "can change the
  promo code attached to the new account for the first 21 days after opening, provided the bonus has
  not already been credited" (2023).
  ([issuers](https://www.doctorofcredit.com/which-credit-card-issuers-will-match-a-higher-signup-bonus/),
  [Chase checking](https://www.doctorofcredit.com/does-chase-match-a-checking-or-savings-bonus-yes-for-21-days/))

## Comparison-site wedge

- The CFPB's Circular 2024-01, "Preferencing and steering practices by digital intermediaries for
  consumer financial products or services", said "operators of digital comparison-shopping tools can
  violate the prohibition on abusive acts or practices if they distort the shopping experience by
  steering consumers"
  ([CFPB](https://www.consumerfinance.gov/compliance/circulars/consumer-financial-protection-circular-2024-01-preferencing-and-steering-practices-by-digital-intermediaries-for-consumer-financial-products-or-services/)).
  The CFPB withdrew it on May 12, 2025, with other guidance documents
  ([Federal Register 2025-08286](https://www.govinfo.gov/content/pkg/FR-2025-05-12/html/2025-08286.htm)).
  The README cites it only as a sign of how closely regulators have looked at comparison sites, not
  as rules in force.

## Products in the comparison table

Each checked on its own site on 2026-11-22.

- [Open Terms Archive](https://opentermsarchive.org/en/): "publicly records every version of the
  terms of digital services to enable democratic oversight"; free and open source (the engine is
  EUPL-1.2); its collections cover digital services such as social media and generative AI, not bank
  offer pages.
- [Page Vault](https://www.page-vault.com/): "Legally-admissible screen captures, simplified", for
  legal professionals, on annual contracts.
- [WebPreserver](https://www.pagefreezer.com/webpreserver/) by Pagefreezer: "tamper-proof,
  court-defensible captures" with SHA-256 hashes, for investigators and legal teams; no public price.
- Paribus: refunds when prices drop on things you bought
  ([TechCrunch, 2016](https://techcrunch.com/2016/10/06/capital-one-acquires-online-price-tracker-paribus/));
  bought by Capital One in 2016, and paribus.co now redirects to Capital One Shopping.
