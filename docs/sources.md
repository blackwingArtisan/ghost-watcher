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

## Bank count for the Pro market estimate

FDIC press release for the third quarter of 2025 (released 2025-11-24): "The total number of
FDIC-insured institutions declined by 42 during the third quarter to 4,379."
([FDIC](https://fdic.gov/news/press-releases/2025/fdic-insured-institutions-reported-return-assets-127-percent-and-net)).
The estimate in the README is 2% of 4,379, about 88 banks, at $49 a month: 88 × $49 × 12 = $51,744
a year. It is a rough sizing, not a forecast.

## Bonus hunters and their stake

- r/churning membership, about 678,000: [The Hive Index](https://thehiveindex.com/communities/r-churning/),
  checked 2026-11-18 (Reddit stopped showing member counts on subreddit pages in 2025).
- "Generally OK to open 10 or less bank accounts each year":
  [Doctor of Credit](https://www.doctorofcredit.com/how-many-bank-accounts-can-i-safely-open-within-a-year-for-bank-bonus-purposes/).
  At $200 to $500 a bonus, that is $2,000 to $5,000 a year.
- The illustrative "Maya" scenario in the README is invented and labelled as such. Its payback math:
  $4 a month is $96 over two years, so one caught $100 change every two years covers it.
