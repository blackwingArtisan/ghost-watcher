---
inclusion: fileMatch
fileMatchPattern: ["**/pact*.ts", "**/sealing.ts", "**/dispute.ts", "**/pact*.test.ts", "**/sealing*.test.ts", "**/dispute*.test.ts"]
---

# Pact rules

Loaded when pact, sealing or dispute code, or one of their tests, is open.

- A pact is the reading on the day you applied. It holds that one snapshot, its hash and the date it was sealed, and nothing later.
- Never overwrite or break a readable pact without the confirm step: `confirmReplace` on the API, "Keep it" or "Yes, replace" on the page.
- Hash the exact stored bytes. The SHA-256 is over the document the store holds, so `shasum -a 256` on the file reproduces it.
- A letter quotes only what changed, and names both dates: the day the reader applied and the day of the page now.
- Money is integer cents. Compare and subtract `amountMinor`; format to text only for display.
- No clock reads in pact, sealing or dispute code. Dates come from the injected `Clock` or from stored ISO strings.
- A note or letter says each thing once: drop a pact note that only repeats the Bait and switch line.
