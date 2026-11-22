import { describe, expect, it } from 'vitest';
import { defineApp } from '../src/app';
import type { AlertMessage, AlertSink } from '../src/alerts/types';
import { manualClock } from '../src/clock';
import { diff, isEmptyDiff } from '../src/diff';
import { extract, type Extraction } from '../src/extract';
import type { FetchOutcome, Fetcher } from '../src/fetcher';
import { comparePact, pactNote, pactVariant, PACT_VERSION, type Pact } from '../src/pact';
import { snapshotSha256 } from '../src/receipts';
import { evaluateRules } from '../src/rules';
import { Runner } from '../src/runner';
import { sealPact } from '../src/sealing';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { defineWatch, rules } from '../src/watch';
import { failingArchiver, money, savingArchiver, snapshot, text } from './pact-support';

const SEALED = '2026-10-10T14:15:02.000Z';
const DAY = 'Oct 10, 2026';

const watch = defineWatch({
  id: 'lantern',
  name: 'Lanternfield Everyday Checking',
  url: 'http://127.0.0.1:9/offer',
  intervalMs: 0,
  fields: [
    { name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money', better: 'higher' },
    { name: 'fee', label: 'Annual fee', selector: '.fee', kind: 'money', better: 'lower' },
    { name: 'deadline', label: 'Deadline', selector: '.deadline', kind: 'date' },
    { name: 'link', label: 'Offer link', selector: '.link', attribute: 'href', kind: 'url' },
    { name: 'terms', label: 'Fine print', selector: '.terms', kind: 'text' },
  ],
  rules: [
    rules.wentUp('bonus', { minDelta: 50, severity: 'shriek' }),
    rules.wentDown('bonus', { minDelta: 50, severity: 'shriek' }),
    rules.disappeared('bonus'),
    rules.wentUp('fee'),
    rules.wentDown('fee'),
    rules.changed('deadline'),
    rules.changed('link'),
    rules.stealthEdit('terms', ['bonus']),
    rules.appeared('terms', { matching: 'monthly fee' }),
  ],
});

const TERMS = 'Open the account within 30 days. Keep a balance of $500 for 90 days.';
const TERMS_FEE = `${TERMS} A $12 monthly fee applies.`;

const page = (v: { bonus?: string; fee?: string; deadline?: string; link?: string; terms?: string }) =>
  `<html><body>
    <p class="bonus">${v.bonus ?? '$400'}</p><p class="fee">${v.fee ?? '$0'}</p>
    <p class="deadline">${v.deadline ?? 'June 5, 2026'}</p><a class="link" href="${v.link ?? 'https://bank.example.com/offer'}">Apply</a>
    <p class="terms">${v.terms ?? TERMS}</p><footer>Page generated at 12:00</footer>
  </body></html>`;

const read = (html: string): Extraction => extract(html, watch);

function pactOf(html: string, overrides: Partial<Pact> = {}): Pact {
  const taken = { watchId: 'lantern', url: watch.url, takenAt: '2026-10-10T09:00:00.000Z', ...read(html) };
  return {
    version: PACT_VERSION,
    watchId: 'lantern',
    watchName: watch.name,
    url: watch.url,
    sealedAt: SEALED,
    snapshotTakenAt: taken.takenAt,
    sha256: snapshotSha256(taken),
    archive: { archiveUrl: 'https://archive.test/web/20261010141502/x', archivedAt: SEALED, archivedBy: 'a test archive' },
    snapshot: taken,
    ...overrides,
  };
}

/** One night: the previous page against tonight's, judged against the pact. */
function night(pact: Pact, previous: string, tonight: string) {
  const current = read(tonight);
  const nightly = diff(read(previous), current);
  const findings = evaluateRules(watch, nightly);
  return { findings, judged: comparePact(watch, pact, current, nightly, findings), nightly };
}

describe('comparing a night with the pact', () => {
  it('(PACT 5.1) (PACT 5.2) attaches the pact reference to a finding about a field that differs from the promise', () => {
    const { judged } = night(pactOf(page({ bonus: '$400' })), page({ bonus: '$400' }), page({ bonus: '$300' }));
    expect(judged).toHaveLength(1);
    expect(judged[0]).toMatchObject({
      ruleKind: 'wentDown',
      summary: 'Bonus went down from $400 to $300 (-$100).',
      pact: {
        sealedAt: SEALED,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        relation: 'differs',
        promised: { kind: 'money', amountMinor: 40000, currency: 'USD', display: '$400' },
        tone: 'bad',
        note: `On ${DAY}, the day you applied, the bonus was $400; it is now $300 (-$100).`,
      },
    });
  });

  it('(PACT 5.3) a step too small for the rule, whose total since the pact meets it, raises "Since you applied on <date>:"', () => {
    const pact = pactOf(page({ bonus: '$300' }));
    const quiet = night(pact, page({ bonus: '$340' }), page({ bonus: '$380' }));
    expect(quiet.findings).toEqual([]);
    expect(quiet.judged).toHaveLength(1);
    expect(quiet.judged[0]).toMatchObject({
      ruleKind: 'wentUp',
      severity: 'shriek',
      summary: `Since you applied on ${DAY}: Bonus went up from $300 to $380 (+$80).`,
      pact: { relation: 'differs', tone: 'good', promised: { amountMinor: 30000 } },
    });
  });

  it('(PACT 5.4) steps of $10 against minDelta 50 fire on the fifth night, not before', () => {
    const pact = pactOf(page({ bonus: '$300' }));
    const results = [];
    for (let step = 1; step <= 5; step += 1) {
      results.push(night(pact, page({ bonus: `$${300 + (step - 1) * 10}` }), page({ bonus: `$${300 + step * 10}` })));
    }
    expect(results.map((r) => r.findings.length)).toEqual([0, 0, 0, 0, 0]);
    expect(results.map((r) => r.judged.length)).toEqual([0, 0, 0, 0, 1]);
    expect(results[4]?.judged[0]?.summary).toBe(`Since you applied on ${DAY}: Bonus went up from $300 to $350 (+$50).`);
  });

  it('(PACT 5.5) a field back at its promised value is marked restored, with no extra finding', () => {
    const { judged, findings } = night(pactOf(page({ bonus: '$400' })), page({ bonus: '$300' }), page({ bonus: '$400' }));
    expect(findings).toHaveLength(1);
    expect(judged).toHaveLength(1);
    expect(judged[0]).toMatchObject({
      ruleKind: 'wentUp',
      summary: findings[0]?.summary,
      pact: { relation: 'restored', promised: { amountMinor: 40000 }, note: `The page is back to what it said on ${DAY}, the day you applied (Bonus: $400).` },
    });
    expect(judged[0]?.pact?.tone).toBeUndefined();
  });

  it('(PACT 5.6) with no watched field changed tonight there is no pact finding, even though the page differs from the pact', () => {
    const pact = pactOf(page({ bonus: '$400' }));
    const current = read(page({ bonus: '$300' }));
    const nightly = diff(current, current);
    expect(comparePact(watch, pact, current, nightly, [])).toEqual([]);
    expect(comparePact(watch, pact, current, diff(undefined, current), [])).toEqual([]);
    const { judged } = night(pact, page({ bonus: '$300' }), page({ bonus: '$300' }));
    expect(judged).toEqual([]);
  });

  it('(PACT 5.6) a field that differs from the pact but did not move tonight raises nothing', () => {
    const pact = pactOf(page({ bonus: '$400', fee: '$0' }));
    const { judged } = night(pact, page({ bonus: '$300', fee: '$0' }), page({ bonus: '$300', fee: '$95' }));
    expect(judged.map((f) => f.field)).toEqual(['fee']);
  });

  it('(PACT 5.7) a field changed since the pact while the headline did not is marked as a bait and switch', () => {
    // Tonight the bonus came back to its promised value and the fine print gained a fee clause in the same visit.
    const pact = pactOf(page({ bonus: '$400' }));
    const { findings, judged } = night(pact, page({ bonus: '$350' }), page({ bonus: '$400', terms: TERMS_FEE }));
    expect(findings.find((f) => f.field === 'terms')?.stealth).toBeUndefined();
    const terms = judged.filter((f) => f.field === 'terms');
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({
      severity: 'shriek',
      tone: 'bad',
      stealth: 'Bonus stayed the same while the fine print changed.',
      pact: { relation: 'differs', tone: 'bad' },
    });
    expect(terms[0]?.summary).toMatch(new RegExp(`^Since you applied on ${DAY}: `));
    expect(judged.find((f) => f.field === 'bonus')?.pact?.relation).toBe('restored');
  });

  it('(PACT 5.7) (PACT 7.2) a stealth edit alone is judged against the pact as a bait and switch', () => {
    const { judged } = night(pactOf(page({})), page({}), page({ terms: TERMS_FEE }));
    expect(judged).toHaveLength(1);
    expect(judged[0]).toMatchObject({ stealth: expect.any(String), pact: { relation: 'differs', tone: 'bad' } });
    expect(pactVariant({ pact: judged[0]?.pact, ...(judged[0]?.stealth ? { stealth: judged[0].stealth } : {}) })).toBe('dispute');
  });

  it('(PACT 5.8) money is compared and subtracted in integer cents', () => {
    const small = defineWatch({ ...watch, rules: [rules.wentUp('bonus')] });
    const taken = { watchId: 'lantern', url: watch.url, takenAt: '2026-10-10T09:00:00.000Z', ...extract(page({ bonus: '$0.10' }), small) };
    const pact = { ...pactOf(page({})), snapshot: taken, sha256: snapshotSha256(taken) };
    const current = extract(page({ bonus: '$0.30' }), small);
    const nightly = diff(extract(page({ bonus: '$0.20' }), small), current);
    const out = comparePact(small, pact, current, nightly, evaluateRules(small, nightly));
    expect(out[0]?.pact).toMatchObject({
      promised: { kind: 'money', amountMinor: 10 },
      note: `On ${DAY}, the day you applied, the bonus was $0.10; it is now $0.30 (+$0.20).`,
    });
    expect(Number.isInteger(diff(taken, current).fields[0]?.delta)).toBe(true);
    expect(diff(taken, current).fields[0]?.delta).toBe(20);
  });

  it('(PACT 5.9) whitespace, date format and tracking parameters raise no pact finding', () => {
    const pact = pactOf(page({ bonus: '$400', deadline: 'June 5, 2026', link: 'https://bank.example.com/offer?utm_source=mail' }));
    const noisy = page({
      bonus: '  $400.00 \n',
      deadline: '2026-06-05',
      link: 'https://BANK.example.com/offer?utm_campaign=x&gclid=9',
      terms: `  ${TERMS.replace('. ', '.\n   ')}  `,
    });
    expect(isEmptyDiff(diff(pact.snapshot, read(noisy)))).toBe(true);
    // The bonus moved away and came back, so tonight has a change, and the noise still adds nothing.
    const { judged } = night(pact, page({ bonus: '$350' }), noisy);
    expect(judged.map((f) => [f.field, f.pact?.relation])).toEqual([['bonus', 'restored']]);
  });

  it('(PACT 5.10) tone follows the field "better" direction against the promised value', () => {
    const bonusUp = night(pactOf(page({ bonus: '$300' })), page({ bonus: '$300' }), page({ bonus: '$400' }));
    expect(bonusUp.judged[0]?.pact).toMatchObject({ relation: 'differs', tone: 'good' });
    const bonusDown = night(pactOf(page({ bonus: '$400' })), page({ bonus: '$400' }), page({ bonus: '$300' }));
    expect(bonusDown.judged[0]?.pact?.tone).toBe('bad');
    const feeDown = night(pactOf(page({ fee: '$95' })), page({ fee: '$95' }), page({ fee: '$0' }));
    expect(feeDown.judged[0]?.pact).toMatchObject({ relation: 'differs', tone: 'good', note: `On ${DAY}, the day you applied, the annual fee was $95; it is now $0 (-$95).` });
    const feeUp = night(pactOf(page({ fee: '$0' })), page({ fee: '$0' }), page({ fee: '$95' }));
    expect(feeUp.judged[0]?.pact?.tone).toBe('bad');
  });

  it('(PACT 5.10) the tone is measured against the pact, not against last night', () => {
    // Promised $400. Last night $300 (bad). Tonight $350 is up on last night but still below the promise.
    const { findings, judged } = night(pactOf(page({ bonus: '$400' })), page({ bonus: '$300' }), page({ bonus: '$350' }));
    expect(findings[0]?.tone).toBe('good');
    expect(judged[0]?.pact?.tone).toBe('bad');
  });

  it('(PACT 5.2) says so when the pact did not show the field, and when the page no longer does', () => {
    expect(pactNote('Bonus', null, money('$300'), SEALED, 'differs')).toBe(`On ${DAY}, the day you applied, the page did not show the bonus; it now says $300.`);
    expect(pactNote('Bonus', money('$400'), null, SEALED, 'differs')).toBe(`On ${DAY}, the day you applied, the bonus was $400; the page no longer shows it.`);
    expect(pactNote('Fine print', text(TERMS), text(TERMS_FEE), SEALED, 'differs')).toBe(
      `On ${DAY}, the day you applied, the fine print now says "A $12 monthly fee applies".`,
    );
    const gone = night(pactOf(page({ bonus: '$400' })), page({ bonus: '$400' }), page({ bonus: '$400' }).replace('<p class="bonus">$400</p>', ''));
    expect(gone.judged[0]?.pact).toMatchObject({ relation: 'differs', tone: 'bad', promised: { amountMinor: 40000 } });
  });

  it('(PACT 5.2) list findings pass through untouched', () => {
    const listed = defineWatch({
      id: 'lantern',
      name: 'Lanternfield',
      url: watch.url,
      intervalMs: 0,
      fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money', better: 'higher' }],
      lists: [{ name: 'perks', label: 'perk', itemSelector: '.perk', fields: { name: { selector: ':self', kind: 'text' } }, identity: ['name'] }],
      rules: [rules.wentDown('bonus'), rules.newItem('perks')],
    });
    const html = (bonus: string, perks: string[]) => `<p class="bonus">${bonus}</p>${perks.map((p) => `<li class="perk">${p}</li>`).join('')}`;
    const pact = pactOf(page({}));
    pact.snapshot = { ...pact.snapshot, ...extract(html('$400', ['Lounge']), listed) };
    const current = extract(html('$300', ['Lounge', 'Lift pass']), listed);
    const nightly = diff(extract(html('$400', ['Lounge']), listed), current);
    const findings = evaluateRules(listed, nightly);
    const listFinding = findings.find((f) => f.list);
    const judged = comparePact(listed, pact, current, nightly, findings);
    expect(judged.find((f) => f.list)).toBe(listFinding);
    expect(judged.find((f) => f.field === 'bonus')?.pact?.relation).toBe('differs');
    expect(judged.filter((f) => f.list).every((f) => f.pact === undefined)).toBe(true);
  });

  it('(PACT 5.12) with no change tonight, or no pact reference to add, the findings come back unchanged', () => {
    const pact = pactOf(page({}));
    const current = read(page({}));
    const findings = evaluateRules(watch, diff(read(page({ bonus: '$300' })), current));
    const nightly = diff(read(page({ bonus: '$300' })), current);
    expect(comparePact(watch, pact, current, diff(current, current), findings)).toBe(findings);
    expect(comparePact(watch, pact, current, { ...nightly, firstRun: true }, findings)).toBe(findings);
  });
});

describe('pactVariant', () => {
  const pact = (overrides: object) => ({ sealedAt: SEALED, sha256: 'a'.repeat(64), archive: { archiveUrl: null, archivedAt: null, archivedBy: null }, relation: 'differs' as const, promised: null, note: '', ...overrides });
  it('(PACT 7.1) is match only for better terms with no bait and switch', () => {
    expect(pactVariant({ pact: pact({ tone: 'good' }) })).toBe('match');
  });
  it('(PACT 7.2) is dispute for bad tone, no tone, a bait and switch, a restored pact or no pact', () => {
    expect(pactVariant({ pact: pact({ tone: 'bad' }) })).toBe('dispute');
    expect(pactVariant({ pact: pact({}) })).toBe('dispute');
    expect(pactVariant({ pact: pact({ tone: 'good' }), stealth: 'The bonus stayed the same.' })).toBe('dispute');
    expect(pactVariant({ pact: pact({ tone: 'good', relation: 'restored' }) })).toBe('dispute');
    expect(pactVariant({})).toBe('dispute');
  });
});

describe('the runner judges every changed night against the pact', () => {
  class Page implements Fetcher {
    html = page({ bonus: '$300' });
    constructor(private readonly clock: { now(): Date }) {}
    async fetchPage(url: string): Promise<FetchOutcome> {
      return { status: 'ok', html: this.html, finalUrl: url, httpStatus: 200, fetchedAt: this.clock.now().toISOString() };
    }
  }
  class Inbox implements AlertSink {
    readonly channel = 'inbox';
    messages: AlertMessage[] = [];
    async deliver(message: AlertMessage) {
      this.messages.push(message);
      return { channel: this.channel, reference: String(this.messages.length) };
    }
  }

  async function setup(archive?: ReturnType<typeof savingArchiver>, seal = true) {
    const clock = manualClock('2026-10-10T12:00:00Z');
    const blobs = new MemoryBlobStore();
    const store = new GhostStore(blobs);
    const fetcher = new Page(clock);
    const sink = new Inbox();
    const app = defineApp({
      id: 'pact-app',
      name: 'Pact Crypt',
      tagline: 'Testing',
      version: '0.1.0',
      alertTo: ['tester@example.com'],
      copy: { watchNoun: 'pages', quiet: 'Quiet.', pacts: true },
      watches: [watch],
    });
    const runner = new Runner({ app, fetcher, store, sink, clock, ...(archive ? { archive } : {}) });
    await runner.check(watch);
    clock.advance(3_600_000);
    const sealed = seal ? await sealPact({ store, clock }, watch) : undefined;
    return { clock, blobs, store, fetcher, sink, runner, sealed };
  }

  it('(PACT 5.3) (PACT 5.4) three nights of small drift raise an alert on the night the total crosses the rule, and the alert names the pact', async () => {
    const { clock, fetcher, runner, sink, sealed } = await setup();
    if (sealed?.status !== 'sealed') throw new Error('expected a pact');
    const outcomes: string[] = [];
    for (const bonus of ['$320', '$340', '$360']) {
      clock.advance(86_400_000);
      fetcher.html = page({ bonus });
      outcomes.push((await runner.check(watch)).status);
    }
    expect(outcomes).toEqual(['unchanged', 'unchanged', 'changed']);
    const alert = sink.messages[0]?.alerts[0];
    expect(sink.messages).toHaveLength(1);
    expect(alert?.summary).toBe("Drifted since you applied: $300 → $360 over 3 nights"); // (PACT 14.2) replaces the 5.3 wording with stored readings
    expect(alert?.pact).toMatchObject({ sealedAt: sealed.pact.sealedAt, sha256: sealed.pact.sha256, relation: 'differs', tone: 'good', promised: { amountMinor: 30000 } });
    expect(alert?.pact?.archive).toEqual(sealed.pact.archive);
  });

  it('(PACT 5.11) a pact finding that is a shriek keeps a receipt exactly as before', async () => {
    const archive = savingArchiver();
    const { clock, fetcher, runner, sink } = await setup(archive);
    clock.advance(86_400_000);
    fetcher.html = page({ bonus: '$200' });
    await runner.check(watch);
    const alert = sink.messages[0]?.alerts[0];
    expect(alert?.pact?.relation).toBe('differs');
    expect(alert?.receipt?.archiveUrl).toContain('https://archive.test/');
    expect(archive.calls).toHaveLength(1);
  });

  it('(PACT 5.11) a pact bait and switch keeps a receipt even though tonight alone showed none', async () => {
    const archive = failingArchiver('a test archive', 'timed out');
    const { clock, fetcher, runner, sink } = await setup(archive);
    clock.advance(86_400_000);
    fetcher.html = page({ bonus: '$350' });
    await runner.check(watch);
    clock.advance(86_400_000);
    fetcher.html = page({ bonus: '$300', terms: TERMS_FEE });
    await runner.check(watch);
    const terms = sink.messages[1]?.alerts.find((a) => a.field === 'terms');
    expect(terms?.stealth).toBeDefined();
    expect(terms?.pact?.relation).toBe('differs');
    expect(terms?.receipt?.note).toBe('Could not reach a test archive: timed out');
  });

  it('(PACT 4.4) a corrupt pact leaves the check green and the alerts exactly as they are without a pact', async () => {
    const bad = await setup();
    await bad.blobs.put('pacts/lantern/pact.json', '{ not json');
    const none = await setup(undefined, false);
    for (const rig of [bad, none]) {
      rig.clock.advance(86_400_000);
      rig.fetcher.html = page({ bonus: '$200' });
    }
    const [a, b] = [await bad.runner.check(watch), await none.runner.check(watch)];
    expect(a.status).toBe('changed');
    expect(b.status).toBe('changed');
    expect(bad.sink.messages[0]?.alerts).toEqual(none.sink.messages[0]?.alerts);
    expect(bad.sink.messages[0]?.alerts.some((alert) => 'pact' in alert)).toBe(false);
  });

  it('(PACT 4.4) a pact whose snapshot document was damaged also leaves the check green', async () => {
    const { clock, fetcher, runner, sink, blobs, sealed } = await setup();
    if (sealed?.status !== 'sealed') throw new Error('expected a pact');
    await blobs.put(`pacts/lantern/${sealed.pact.sha256}.json`, '{}');
    clock.advance(86_400_000);
    fetcher.html = page({ bonus: '$200' });
    expect((await runner.check(watch)).status).toBe('changed');
    expect(sink.messages[0]?.alerts[0]?.pact).toBeUndefined();
  });

  it('(PACT 5.12) with no pact the alerts are exactly what evaluateRules finds', async () => {
    const { clock, fetcher, runner, sink } = await setup(undefined, false);
    const before = read(fetcher.html);
    clock.advance(86_400_000);
    fetcher.html = page({ bonus: '$200', fee: '$95' });
    await runner.check(watch);
    const expected = evaluateRules(watch, diff(before, read(fetcher.html)));
    const alerts = sink.messages[0]?.alerts ?? [];
    expect(alerts.map((a) => a.summary)).toEqual(expected.map((f) => f.summary));
    expect(alerts.every((a) => !('pact' in a))).toBe(true);
  });

  it('(PACT 5.6) a night with nothing watched changed neither alerts nor reads a pact finding', async () => {
    const { clock, fetcher, runner, sink } = await setup();
    clock.advance(86_400_000);
    fetcher.html = page({ bonus: '$300' }).replace('12:00', '18:45');
    expect((await runner.check(watch)).status).toBe('unchanged');
    expect(sink.messages).toEqual([]);
  });
});
