import { describe, expect, it } from 'vitest';
import type { Alert } from '../src/alerts/types';
import { disputePack } from '../src/dispute';
import type { AlertPact } from '../src/pact';
import type { Receipt } from '../src/receipts';
import { defineWatch, rules } from '../src/watch';
import { money, text } from './pact-support';

const URL = 'https://www.lanternfield.example/everyday-checking';
const OFFER = 'Lanternfield Everyday Checking';
const EXHIBIT_HASH = 'e'.repeat(64);
const BEFORE_HASH = 'b'.repeat(64);
const AFTER_HASH = 'a'.repeat(64);
const ARCHIVE_THEN = `https://web.archive.org/web/20261010141502/${URL}`;
const ARCHIVE_NOW = `https://web.archive.org/web/20261119093044/${URL}`;

const watch = defineWatch({
  id: 'lanternfield-checking',
  name: OFFER,
  url: URL,
  fields: [
    { name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money', better: 'higher' },
    { name: 'fee', label: 'Annual fee', selector: '.fee', kind: 'money', better: 'lower' },
    { name: 'deposit', label: 'Minimum deposit', selector: '.deposit', kind: 'money', better: 'lower' },
    { name: 'terms', label: 'Fine print', selector: '.terms', kind: 'text' },
  ],
  rules: [rules.wentUp('bonus'), rules.wentDown('bonus'), rules.wentDown('fee'), rules.wentDown('deposit'), rules.stealthEdit('terms', ['bonus'])],
});

const receipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  before: { takenAt: '2026-11-18T09:00:00.000Z', sha256: BEFORE_HASH },
  after: { takenAt: '2026-11-19T09:30:44.000Z', sha256: AFTER_HASH },
  archiveUrl: ARCHIVE_NOW,
  archivedAt: '2026-11-19T09:30:44.000Z',
  archivedBy: 'the Internet Archive',
  ...overrides,
});

const pactRef = (overrides: Partial<AlertPact> = {}): AlertPact => ({
  sealedAt: '2026-10-10T14:15:02.000Z',
  sha256: EXHIBIT_HASH,
  archive: { archiveUrl: ARCHIVE_THEN, archivedAt: '2026-10-10T14:15:02.000Z', archivedBy: 'the Internet Archive' },
  relation: 'differs',
  promised: money('$400'),
  tone: 'bad',
  note: 'unused here',
  ...overrides,
});

const alert = (overrides: Partial<Alert> = {}): Alert => ({
  id: 'lanternfield-checking-20261119093044-1',
  watchId: 'lanternfield-checking',
  watchName: OFFER,
  url: URL,
  createdAt: '2026-11-19T09:30:44.000Z',
  severity: 'shriek',
  ruleKind: 'wentDown',
  ruleLabel: 'Bonus goes down',
  summary: 'Bonus went down from $400 to $300 (-$100).',
  field: 'bonus',
  before: money('$400'),
  after: money('$300'),
  receipt: receipt(),
  ...overrides,
});

const DISPUTE_LETTER = `[Your name]
[Your address]

To: ${OFFER} customer care
Re: ${OFFER}, account ending [Last 4 digits of the account]

I applied for ${OFFER} on Oct 10, 2026, relying on the terms published at ${URL}.
Those terms have since changed. I sealed a record of the page on the day I applied and recorded it again after the change.

What the page promised on Oct 10, 2026, the day I applied:
  Bonus: $400

What the page says on Nov 19, 2026:
  Bonus: $300

Records of both versions:
  - Exhibit A, the page on Oct 10, 2026: archived copy held by the Internet Archive: ${ARCHIVE_THEN} (captured Oct 10, 2026)
  - Exhibit A SHA-256: ${EXHIBIT_HASH}
  - An archived copy of the page after the change, held by the Internet Archive: ${ARCHIVE_NOW} (captured Nov 19, 2026)
  - SHA-256 of my record of the page on Nov 19, 2026: ${AFTER_HASH}

Please honor the terms that were published on the day I applied, including any sign-up bonus they promised, and confirm in writing within 30 days. If we cannot resolve this, I will file a complaint with the Consumer Financial Protection Bureau and include these records.

Sincerely,
[Your name]`;

const MATCH_LETTER = `[Your name]
[Your address]

To: ${OFFER} customer care
Re: ${OFFER}, account ending [Last 4 digits of the account]

I applied for ${OFFER} on Oct 10, 2026, relying on the terms published at ${URL}.
Since then the page has improved its terms. I sealed a record of the page on the day I applied and recorded it again after the improvement.

What the page promised on Oct 10, 2026, the day I applied:
  Bonus: $300

What the page says on Nov 19, 2026:
  Bonus: $400

Records of both versions:
  - Exhibit A, the page on Oct 10, 2026: archived copy held by the Internet Archive: ${ARCHIVE_THEN} (captured Oct 10, 2026)
  - Exhibit A SHA-256: ${EXHIBIT_HASH}
  - An archived copy of the page after the change, held by the Internet Archive: ${ARCHIVE_NOW} (captured Nov 19, 2026)
  - SHA-256 of my record of the page on Nov 19, 2026: ${AFTER_HASH}

Since I applied as a customer, I would like my account to receive the improved terms now on offer. Please let me know in writing within 30 days whether you will match them.

Thank you,
[Your name]`;

const matchAlert = (overrides: Partial<Alert> = {}): Alert =>
  alert({
    ruleKind: 'wentUp',
    ruleLabel: 'Bonus goes up',
    summary: 'Bonus went up from $300 to $400 (+$100).',
    before: money('$400'),
    after: money('$400'),
    pact: pactRef({ promised: money('$300'), tone: 'good' }),
    ...overrides,
  });

describe('a dispute pack for an alert judged against a pact', () => {
  const pack = disputePack(alert({ pact: pactRef() }), watch);

  it('(PACT 6.1) (PACT 6.2) fills the application date and drops only that blank', () => {
    expect(pack?.letter.body).not.toContain('[Date you applied]');
    expect(pack?.complaint.whatHappened).not.toContain('[Date you applied]');
    expect(pack?.complaint.whatHappened).toContain('I applied for Lanternfield Everyday Checking on Oct 10, 2026 under the terms');
    expect(pack?.blanks).toEqual(['[Your name]', '[Your address]', '[Last 4 digits of the account]']);
  });

  it('(PACT 6.3) quotes the promised value against the value now', () => {
    expect(pack?.before).toEqual(['Bonus: $400']);
    expect(pack?.after).toEqual(['Bonus: $300']);
    expect(pack?.letter.body).toContain('What the page promised on Oct 10, 2026, the day I applied:\n  Bonus: $400');
    expect(pack?.letter.body).toContain('What the page says on Nov 19, 2026:\n  Bonus: $300');
    expect(pack?.complaint.whatHappened).toContain('On Oct 10, 2026, the day I applied, the page promised Bonus: $400.');
  });

  it('(PACT 6.3) quotes the promised value even when the night before held a different one', () => {
    const drifted = disputePack(alert({ before: money('$350'), pact: pactRef() }), watch);
    expect(drifted?.before).toEqual(['Bonus: $400']);
  });

  it('(PACT 6.4) dates the columns from the sealed date and the alert date', () => {
    expect(pack?.beforeDate).toBe('Oct 10, 2026');
    expect(pack?.afterDate).toBe('Nov 19, 2026');
  });

  it('(PACT 6.5) lists Exhibit A with the archive link, the SHA-256 and a shasum command', () => {
    expect(pack?.pact).toEqual({
      variant: 'dispute',
      relation: 'differs',
      appliedDate: 'Oct 10, 2026',
      sha256: EXHIBIT_HASH,
      archiveUrl: ARCHIVE_THEN,
      archivedBy: 'the Internet Archive',
      note: null,
      seeded: false,
      checkCommand: `shasum -a 256 .ghost-data/store/pacts/lanternfield-checking/${EXHIBIT_HASH}.json`,
    });
    expect(pack?.evidence).toEqual([
      { label: 'Page', value: URL },
      { label: 'Exhibit A: the page on Oct 10, 2026', value: 'Bonus: $400' },
      { label: 'Exhibit A archived copy', value: ARCHIVE_THEN },
      { label: 'Exhibit A SHA-256', value: EXHIBIT_HASH },
      { label: 'Check Exhibit A', value: `shasum -a 256 .ghost-data/store/pacts/lanternfield-checking/${EXHIBIT_HASH}.json` },
      { label: 'Now (Nov 19, 2026)', value: 'Bonus: $300' },
      { label: 'Archived copy now', value: ARCHIVE_NOW },
      { label: 'SHA-256 now', value: AFTER_HASH },
      { label: 'Check the hashes', value: 'shasum -a 256 .ghost-data/store/snapshots/lanternfield-checking/history/*.json' },
    ]);
  });

  it('(PACT 6.6) says so in Exhibit A when the pact has no archived copy, and gives the note', () => {
    const note = 'Could not reach the Internet Archive: timed out';
    const bare = disputePack(alert({ pact: pactRef({ archive: { archiveUrl: null, archivedAt: null, archivedBy: null, note } }) }), watch);
    expect(bare?.evidence.find((row) => row.label === 'Exhibit A archived copy')?.value).toBe(`none: ${note}`);
    expect(bare?.pact).toMatchObject({ archiveUrl: null, note });
    expect(bare?.letter.body).toContain(`Exhibit A, the page on Oct 10, 2026: no public archived copy was made (${note})`);
    expect(bare?.complaint.whatHappened).not.toContain('archived copy of the page on the day I applied');
  });

  it('(PACT 6.6) a pact with no note at all still reads plainly', () => {
    const bare = disputePack(alert({ pact: pactRef({ archive: { archiveUrl: null, archivedAt: null, archivedBy: null } }) }), watch);
    expect(bare?.evidence.find((row) => row.label === 'Exhibit A archived copy')?.value).toBe('none: archiving was off');
  });

  it('(PACT 6.1) a seeded demo pact is marked, and its pack never claims an archived copy', () => {
    const note = 'Demo pact: back-dated for the demo, so no archived copy was made.';
    const seeded = disputePack(alert({ pact: pactRef({ seeded: 'demo', archive: { archiveUrl: null, archivedAt: null, archivedBy: null, note } }) }), watch);
    expect(seeded?.pact).toMatchObject({ seeded: true, archiveUrl: null, note });
    expect(seeded?.evidence.find((row) => row.label === 'Exhibit A archived copy')?.value).toBe(`none: ${note}`);
  });

  it('(PACT 6.1) (PACT 6.9) the same alert gives the same pack, word for word', () => {
    const again = disputePack(alert({ pact: pactRef() }), watch);
    expect(JSON.stringify(again)).toBe(JSON.stringify(pack));
    expect(disputePack(matchAlert(), watch)).toEqual(disputePack(matchAlert(), watch));
  });

  it('(PACT 6.1) a pact reference with no receipt gives no pack, as before', () => {
    const { receipt: _dropped, ...quiet } = alert({ pact: pactRef() });
    expect(disputePack(quiet, watch)).toBeNull();
  });
});

describe('the restored case', () => {
  const restored = alert({
    ruleKind: 'wentUp',
    ruleLabel: 'Bonus goes up',
    before: money('$300'),
    after: money('$400'),
    pact: pactRef({ relation: 'restored', tone: undefined }),
  });
  const { pact: _ref, ...plain } = restored;
  const withPact = disputePack(restored, watch);
  const without = disputePack(plain, watch);

  it('(PACT 6.7) fills only the application date and keeps the rest as without a pact', () => {
    expect(withPact?.letter.body).toBe((without?.letter.body ?? '').replace('[Date you applied]', 'Oct 10, 2026'));
    expect(withPact?.complaint.whatHappened).toBe((without?.complaint.whatHappened ?? '').replace('[Date you applied]', 'Oct 10, 2026'));
    expect(withPact?.blanks).toEqual(['[Your name]', '[Your address]', '[Last 4 digits of the account]']);
    expect(withPact?.before).toEqual(without?.before);
    expect(withPact?.after).toEqual(without?.after);
    expect(withPact?.beforeDate).toBe('Nov 18, 2026');
    expect(withPact?.letter.subject).toBe(without?.letter.subject);
    expect(withPact?.kind).toBe(without?.kind);
  });

  it('(PACT 6.5) (PACT 6.7) still lists Exhibit A, after the rows it has without a pact', () => {
    expect(withPact?.pact).toMatchObject({ relation: 'restored', variant: 'dispute', appliedDate: 'Oct 10, 2026' });
    expect(withPact?.evidence.slice(0, without?.evidence.length)).toEqual(without?.evidence);
    expect(withPact?.evidence.map((row) => row.label).slice(-4)).toEqual(['Exhibit A: the page on Oct 10, 2026', 'Exhibit A archived copy', 'Exhibit A SHA-256', 'Check Exhibit A']);
  });
});

describe('a pack for an alert with no pact reference', () => {
  it('(PACT 6.8) is exactly what the build without this feature produced', () => {
    const body = `[Your name]
[Your address]

To: ${OFFER} customer care
Re: ${OFFER}, account ending [Last 4 digits of the account]

I applied for ${OFFER} on [Date you applied], relying on the terms published at ${URL}.
Those terms have since changed. I recorded the page before and after the change.

What the page said on Nov 18, 2026:
  Bonus: $400

What the page said on Nov 19, 2026:
  Bonus: $300

Records of both versions:
  - An archived copy of the page after the change, held by the Internet Archive: ${ARCHIVE_NOW} (captured Nov 19, 2026)
  - SHA-256 of my record of the page on Nov 18, 2026: ${BEFORE_HASH}
  - SHA-256 of my record of the page on Nov 19, 2026: ${AFTER_HASH}

Please honor the terms that were published on the day I applied, including any sign-up bonus they promised, and confirm in writing within 30 days. If we cannot resolve this, I will file a complaint with the Consumer Financial Protection Bureau and include these records.

Sincerely,
[Your name]`;
    const golden = {
      alertId: 'lanternfield-checking-20261119093044-1',
      watchId: 'lanternfield-checking',
      watchName: OFFER,
      url: URL,
      kind: 'Shriek',
      before: ['Bonus: $400'],
      after: ['Bonus: $300'],
      beforeDate: 'Nov 18, 2026',
      afterDate: 'Nov 19, 2026',
      letter: { subject: `Request to honor the advertised terms of ${OFFER}`, body },
      evidence: [
        { label: 'Page', value: URL },
        { label: 'Before (Nov 18, 2026)', value: 'Bonus: $400' },
        { label: 'After (Nov 19, 2026)', value: 'Bonus: $300' },
        { label: 'Archived copy', value: ARCHIVE_NOW },
        { label: 'SHA-256 before', value: BEFORE_HASH },
        { label: 'SHA-256 after', value: AFTER_HASH },
        { label: 'Check the hashes', value: 'shasum -a 256 .ghost-data/store/snapshots/lanternfield-checking/history/*.json' },
      ],
      complaint: {
        product: 'Checking or savings account',
        issue: 'Opening an account',
        subIssue: "Didn't receive terms that were advertised",
        url: 'https://www.consumerfinance.gov/complaint/',
        whatHappened: `I applied for ${OFFER} on [Date you applied] under the terms on the bank's page (${URL}). The bank later changed those terms. On Nov 18, 2026 the page said Bonus: $400. On Nov 19, 2026 it said Bonus: $300. A public archived copy of the changed page: ${ARCHIVE_NOW}. I kept records of both versions (SHA-256 ${BEFORE_HASH} and ${AFTER_HASH}) and can provide them.`,
        desiredResolution: `Honor the terms of ${OFFER} that were published on the day I applied, including any promised sign-up bonus.`,
      },
      blanks: ['[Your name]', '[Your address]', '[Date you applied]', '[Last 4 digits of the account]'],
    };
    const pack = disputePack(alert(), watch);
    expect(pack).toEqual(golden);
    expect(pack).not.toHaveProperty('pact');
    expect(JSON.stringify(pack)).toBe(JSON.stringify(golden));
  });
});

describe('the two letters', () => {
  it('(PACT 7.2) (PACT 6.1) the dispute letter reads word for word as designed, with the invented names', () => {
    const pack = disputePack(alert({ pact: pactRef() }), watch);
    expect(pack?.letter.body).toBe(DISPUTE_LETTER);
    expect(pack?.letter.subject).toBe(`Request to honor the advertised terms of ${OFFER}`);
    expect(pack?.pact?.variant).toBe('dispute');
  });

  it('(PACT 7.1) (PACT 7.3) (PACT 7.4) the match letter reads word for word as designed', () => {
    const pack = disputePack(matchAlert(), watch);
    expect(pack?.pact?.variant).toBe('match');
    expect(pack?.letter.subject).toBe(`Request to match the improved terms of ${OFFER}`);
    expect(pack?.letter.body).toBe(MATCH_LETTER);
    expect(pack?.letter.body).toContain('within 30 days');
    expect(pack?.letter.body).toContain('Oct 10, 2026');
    expect(pack?.letter.body).toContain(`Exhibit A SHA-256: ${EXHIBIT_HASH}`);
  });

  it('(PACT 7.5) the match letter and complaint never mention a CFPB complaint', () => {
    const pack = disputePack(matchAlert(), watch);
    expect(pack?.letter.body).not.toMatch(/CFPB|Consumer Financial|complaint/i);
    expect(pack?.complaint.whatHappened).toContain('The bank later improved those terms but has not applied them to my application.');
    expect(pack?.complaint.desiredResolution).toBe(`Apply the improved terms of ${OFFER} now on offer to my application.`);
    expect(pack?.kind).toBe('Better terms');
  });

  it('(PACT 7.1) (PACT 7.2) the variant follows the tone: good gives the match letter, bad or no tone the dispute letter', () => {
    expect(disputePack(matchAlert(), watch)?.pact?.variant).toBe('match');
    expect(disputePack(matchAlert({ pact: pactRef({ promised: money('$300'), tone: 'bad' }) }), watch)?.pact?.variant).toBe('dispute');
    const { tone: _tone, ...untoned } = pactRef({ promised: money('$300') });
    expect(disputePack(matchAlert({ pact: untoned }), watch)?.pact?.variant).toBe('dispute');
  });

  it('(PACT 7.2) a bait and switch gets the dispute letter, with the stealth line, even when its tone says good', () => {
    const stealth = 'Bonus stayed the same while the fine print changed.';
    const pack = disputePack(
      alert({
        field: 'terms',
        ruleKind: 'stealthEdit',
        before: text('Open within 30 days.'),
        after: text('Open within 30 days. A $12 monthly fee applies.'),
        stealth,
        pact: pactRef({ promised: text('Open within 30 days.'), tone: 'good' }),
      }),
      watch,
    );
    expect(pack?.pact?.variant).toBe('dispute');
    expect(pack?.kind).toBe('Bait and switch');
    expect(pack?.letter.subject).toBe(`Request to honor the advertised terms of ${OFFER}`);
    expect(pack?.letter.body).toContain(`The headline offer did not change, but the terms did. ${stealth}`);
    expect(pack?.letter.body).toContain('Consumer Financial Protection Bureau');
    expect(pack?.before).toEqual(['Fine print: did not say "A $12 monthly fee applies."']);
    expect(pack?.after).toEqual(['Fine print: "A $12 monthly fee applies."']);
  });

  it('(PACT 7.6) a lower annual fee after the pact gives the match letter', () => {
    const pack = disputePack(
      alert({
        field: 'fee',
        ruleKind: 'wentDown',
        before: money('$95'),
        after: money('$0'),
        pact: pactRef({ promised: money('$95'), tone: 'good' }),
      }),
      watch,
    );
    expect(pack?.pact?.variant).toBe('match');
    expect(pack?.before).toEqual(['Annual fee: $95']);
    expect(pack?.after).toEqual(['Annual fee: $0']);
    expect(pack?.letter.body).toContain('What the page promised on Oct 10, 2026, the day I applied:\n  Annual fee: $95');
    expect(pack?.letter.body).toContain('What the page says on Nov 19, 2026:\n  Annual fee: $0');
  });

  it('(PACT 7.6) a lower minimum deposit after the pact gives the match letter', () => {
    const pack = disputePack(
      alert({ field: 'deposit', ruleKind: 'wentDown', before: money('$500'), after: money('$250'), pact: pactRef({ promised: money('$500'), tone: 'good' }) }),
      watch,
    );
    expect(pack?.pact?.variant).toBe('match');
    expect(pack?.letter.subject).toBe(`Request to match the improved terms of ${OFFER}`);
  });

  it('(PACT 6.1) the pact is optional on the type: a pack without alert.pact has no pact member', () => {
    expect(disputePack(alert(), watch)).not.toHaveProperty('pact');
  });
});
