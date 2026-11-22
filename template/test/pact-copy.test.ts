import { afterEach, describe, expect, it } from 'vitest';
import { defineApp } from '../src/app';
import { renderAlertMessage } from '../src/alerts/render';
import type { Alert, AlertMessage, AlertSink } from '../src/alerts/types';
import { manualClock } from '../src/clock';
import { disputePack } from '../src/dispute';
import type { FetchOutcome, Fetcher } from '../src/fetcher';
import { normalizeValue } from '../src/normalize';
import { pactNote, pactNoteRepeats, pactNoteToShow, type AlertPact } from '../src/pact';
import { SavePageNowArchiver, type Receipt } from '../src/receipts';
import { Runner } from '../src/runner';
import { seedDemoPacts } from '../src/sealing';
import { MemoryBlobStore } from '../src/store/blob';
import { GhostStore } from '../src/store/ghost-store';
import { startFixtureServer, type FixtureServer } from '../src/testing/fixture-server';
import { renderDetail, renderGhostCard, renderPactNote, readingAge, TURNED_AWAY_PACT_LINE } from '../src/ui/render.js';
import { forDashboard } from '../src/view';
import { defineWatch, rules, shownUrl, WatchDefinitionError } from '../src/watch';
import { failingArchiver, money, savingArchiver, snapshot, text } from './pact-support';

const SEALED = '2026-10-10T14:15:02.000Z';
const DAY = 'Oct 10, 2026';
const NOW = '2026-11-19T10:00:00.000Z';

const BASE = 'Points are awarded 8 weeks after the spend is met. Purchases exclude cash advances.';
const WINDOW_24 = `${BASE} You may not have held a Mossgate card in the past 24 months.`;
const WINDOW_48 = `${BASE} You may not have held a Mossgate card in the past 48 months.`;
const FEE = 'A $12 monthly fee applies.';

describe('pact note wording', () => {
  it('(PACT 12.1) names the field in lower case after "the", and keeps a label like APY as written', () => {
    expect(pactNote('Fine print', text(BASE), text(`${BASE} ${FEE}`), SEALED, 'differs')).toMatch(/the day you applied, the fine print /);
    expect(pactNote('Annual fee', money('$95'), money('$0'), SEALED, 'differs')).toBe(`On ${DAY}, the day you applied, the annual fee was $95; it is now $0 (-$95).`);
    const apy = (raw: string) => normalizeValue(raw, 'percent');
    expect(pactNote('APY', apy('4.10%'), apy('3.90%'), SEALED, 'differs')).toMatch(/the day you applied, the APY was 4\.1/);
    expect(pactNote('Bonus', null, money('$300'), SEALED, 'differs')).toBe(`On ${DAY}, the day you applied, the page did not show the bonus; it now says $300.`);
  });

  it('(PACT 12.2) ends with exactly one full stop, after the closing quote and never inside it', () => {
    const notes = [
      pactNote('Fine print', text(BASE), text(`${BASE} ${FEE}`), SEALED, 'differs'),
      pactNote('Fine print', text(WINDOW_24), text(WINDOW_48), SEALED, 'differs'),
      pactNote('Fine print', text(`${BASE} ${FEE}`), text(BASE), SEALED, 'differs'),
      pactNote('Bonus', text('Up to $300.'), null, SEALED, 'differs'),
      pactNote('Bonus', money('$400'), money('$300'), SEALED, 'differs'),
    ];
    for (const note of notes) {
      expect(note.endsWith('.')).toBe(true);
      expect(note).not.toMatch(/\."\.?$/);
      expect(note).not.toMatch(/\.\.$/);
      expect(note).not.toContain('."');
    }
    expect(notes[0]).toBe(`On ${DAY}, the day you applied, the fine print now says "A $12 monthly fee applies".`);
  });

  it('(PACT 12.3) a reworded sentence quotes only the changed words, not the whole sentence', () => {
    const note = pactNote('Fine print', text(WINDOW_24), text(WINDOW_48), SEALED, 'differs');
    expect(note).toBe(
      `On ${DAY}, the day you applied, the fine print said "…the past 24 months" and now says "…the past 48 months".`,
    );
    expect(note).not.toContain('Mossgate');
    expect(note).not.toContain('Points are awarded');
  });

  it('(PACT 12.4) a wholly new sentence is quoted whole', () => {
    const note = pactNote('Fine print', text(BASE), text(`${BASE} ${FEE}`), SEALED, 'differs');
    expect(note).toContain('now says "A $12 monthly fee applies"');
    expect(note).not.toContain('said "');
  });
});

describe('back-dated reading', () => {
  it('(PACT 12.5) a reading taken at the moment of sealing is "the reading taken when it was sealed", never "just now"', () => {
    expect(readingAge(SEALED, SEALED)).toBe('the reading taken when it was sealed');
    expect(readingAge(SEALED, '2026-10-10T14:15:20.000Z')).not.toContain('just now');
    const html = renderDetail(sealedDetail({ snapshotTakenAt: SEALED }), NOW);
    expect(html).toContain('(the reading taken when it was sealed)');
    expect(html).not.toContain('just now');
  });

  it('(PACT 12.6) an older reading says how old it was when it was sealed', () => {
    expect(readingAge('2026-10-10T11:15:02.000Z', SEALED)).toBe('3 h ago when sealed');
    expect(renderDetail(sealedDetail({ snapshotTakenAt: '2026-10-10T11:15:02.000Z' }), NOW)).toContain('(3 h ago when sealed)');
  });
});

const URL_FETCHED = 'http://127.0.0.1:9/offer';
const URL_SHOWN = 'https://mossgate.example/nightfall-card';
const HASH = 'e'.repeat(64);

const receipt: Receipt = {
  before: { takenAt: '2026-11-18T09:00:00.000Z', sha256: 'b'.repeat(64) },
  after: { takenAt: '2026-11-19T09:30:44.000Z', sha256: 'a'.repeat(64) },
  archiveUrl: null,
  archivedAt: null,
  archivedBy: null,
  note: 'Archiving is off.',
};

const pactRef = (overrides: Partial<AlertPact> = {}): AlertPact => ({
  sealedAt: SEALED,
  sha256: HASH,
  archive: { archiveUrl: null, archivedAt: null, archivedBy: null, note: 'Demo pact.' },
  relation: 'differs',
  promised: text(BASE),
  tone: 'bad',
  note: `On ${DAY}, the day you applied, the fine print now says "A $12 monthly fee applies".`,
  ...overrides,
});

const finePrint = (beforeText: string, afterText: string, extra: Partial<Alert> = {}): Alert => ({
  id: 'mossgate-1',
  watchId: 'mossgate-nightfall',
  watchName: 'Mossgate Nightfall Card',
  url: URL_SHOWN,
  fetchUrl: URL_FETCHED,
  createdAt: '2026-11-19T09:30:44.000Z',
  severity: 'shriek',
  ruleKind: 'stealthEdit',
  ruleLabel: 'fine print changes while the headline stays',
  summary: 'Fine print changed.',
  field: 'finePrint',
  before: text(beforeText),
  after: text(afterText),
  receipt,
  ...extra,
});

const mossgate = defineWatch({
  id: 'mossgate-nightfall',
  name: 'Mossgate Nightfall Card',
  url: URL_FETCHED,
  displayUrl: URL_SHOWN,
  tags: ['card'],
  fields: [{ name: 'finePrint', label: 'Fine print', selector: '.terms', kind: 'text' }],
  rules: [rules.changed('finePrint')],
});

describe('dispute letters quote the old clause', () => {
  it('(PACT 12.7) (PACT 12.8) a reworded sentence is quoted whole, as it read and as it reads now', () => {
    const alert = finePrint(WINDOW_24, WINDOW_48, { pact: pactRef({ promised: text(WINDOW_24) }) });
    const pack = disputePack(alert, mossgate);
    expect(pack?.before).toEqual(['Fine print: "You may not have held a Mossgate card in the past 24 months."']);
    expect(pack?.after).toEqual(['Fine print: "You may not have held a Mossgate card in the past 48 months."']);
    expect(pack?.letter.body).toContain('  Fine print: "You may not have held a Mossgate card in the past 24 months."');
    expect(pack?.letter.body).toContain('  Fine print: "You may not have held a Mossgate card in the past 48 months."');
    expect(pack?.letter.body).not.toContain('did not say');
    const plain = disputePack(finePrint(WINDOW_24, WINDOW_48), mossgate);
    expect(plain?.before).toEqual(pack?.before);
  });

  it('(PACT 12.9) "did not say" is only for a sentence that is wholly new, even next to a reworded one', () => {
    const fresh = disputePack(finePrint(BASE, `${BASE} ${FEE}`), mossgate);
    expect(fresh?.before).toEqual(['Fine print: did not say "A $12 monthly fee applies."']);
    expect(fresh?.after).toEqual(['Fine print: "A $12 monthly fee applies."']);
    const both = disputePack(finePrint(WINDOW_24, `${WINDOW_48} ${FEE}`), mossgate);
    expect(both?.before).toEqual([
      'Fine print: "You may not have held a Mossgate card in the past 24 months."',
      'Fine print: did not say "A $12 monthly fee applies."',
    ]);
    expect(both?.after).toEqual([
      'Fine print: "You may not have held a Mossgate card in the past 48 months."',
      'Fine print: "A $12 monthly fee applies."',
    ]);
  });
});

describe('no repeated line', () => {
  const stealth = 'The points stayed the same while the fine print changed.';
  const repeated = finePrint(BASE, `${BASE} ${FEE}`, { stealth, pact: pactRef({ promised: text(BASE) }) });
  const drifted = finePrint(`${BASE} ${FEE}`, `${BASE} ${FEE} Fees may change.`, { stealth, pact: pactRef({ promised: text(BASE) }) });

  it('(PACT 12.10) a Bait and switch whose note only repeats it shows no pact note on the dashboard row', () => {
    expect(pactNoteRepeats(repeated)).toBe(true);
    expect(pactNoteToShow(repeated)).toBe('');
    const shown = forDashboard(repeated);
    expect(shown.pact?.note).toBe('');
    expect(renderPactNote(shown)).toBe('');
    expect(shown.pact?.sha256).toBe(HASH);
    expect(repeated.pact?.note).not.toBe('');
  });

  it('(PACT 12.11) the dispute letter and the alert email never print the repeated note', () => {
    const note = repeated.pact?.note as string;
    const pack = disputePack(repeated, mossgate);
    expect(pack?.letter.body).not.toContain(note);
    const message = renderAlertMessage({
      appName: 'The Bonus Crypt',
      to: ['bonus.hunter@example.com'],
      watch: { id: mossgate.id, name: mossgate.name, url: shownUrl(mossgate) },
      alerts: [repeated],
      createdAt: repeated.createdAt,
    });
    expect(message.text).not.toContain(note);
    expect(message.html).not.toContain(note);
    expect(message.text.match(/stayed the same/g)).toHaveLength(1);
  });

  it('(PACT 12.12) a Bait and switch whose promised value differs from the night before keeps its note', () => {
    expect(pactNoteRepeats(drifted)).toBe(false);
    expect(pactNoteToShow(drifted)).toBe(drifted.pact?.note);
    expect(renderPactNote(forDashboard(drifted))).toContain('class="pact-note"');
    expect(renderPactNote(forDashboard(drifted))).toContain('A $12 monthly fee applies');
    // Not a bait and switch: the note is kept even when the promised value equals the night before.
    const plain = finePrint(BASE, `${BASE} ${FEE}`, { pact: pactRef({ promised: text(BASE) }) });
    expect(pactNoteToShow(plain)).toBe(plain.pact?.note);
  });
});

describe('display URL', () => {
  const site = (displayUrl?: string) => ({
    id: 'lantern',
    name: 'Lanternfield Everyday Checking',
    url: URL_FETCHED,
    ...(displayUrl ? { displayUrl } : {}),
    intervalMs: 0,
    fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' as const, better: 'higher' as const }],
    rules: [rules.wentUp('bonus', { severity: 'shriek' }), rules.wentDown('bonus', { severity: 'shriek' })],
  });

  it('(PACT 12.13) accepts an http or https display URL and refuses anything else', () => {
    expect(defineWatch(site('https://lanternfield.example/everyday-checking')).displayUrl).toBe('https://lanternfield.example/everyday-checking');
    expect(() => defineWatch(site('ftp://lanternfield.example/x'))).toThrow(WatchDefinitionError);
    expect(() => defineWatch(site('not a url'))).toThrow(/displayUrl/);
    expect(shownUrl(defineWatch(site()))).toBe(URL_FETCHED);
  });

  class Page implements Fetcher {
    html = '<p class="bonus">$400</p>';
    fetched: string[] = [];
    constructor(private readonly clock: { now(): Date }) {}
    async fetchPage(url: string): Promise<FetchOutcome> {
      this.fetched.push(url);
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

  async function shriek() {
    const clock = manualClock('2026-11-18T09:00:00Z');
    const watch = defineWatch(site('https://lanternfield.example/everyday-checking'));
    const app = defineApp({ id: 'a', name: 'Test Crypt', tagline: 't', version: '0.1.0', alertTo: ['t@example.com'], copy: { watchNoun: 'pages', quiet: 'Quiet.', disputes: true }, watches: [watch] });
    const store = new GhostStore(new MemoryBlobStore());
    const fetcher = new Page(clock);
    const sink = new Inbox();
    const archive = savingArchiver('the test archive');
    const runner = new Runner({ app, fetcher, store, sink, clock, archive });
    await runner.check(watch);
    clock.advance(86_400_000);
    fetcher.html = '<p class="bonus">$300</p>';
    await runner.check(watch);
    return { watch, store, fetcher, sink, archive };
  }

  it('(PACT 12.14) the letter, the complaint text and the pack name the display URL, not the fixture', async () => {
    const { watch, sink } = await shriek();
    const alert = sink.messages[0]?.alerts[0] as Alert;
    expect(alert.url).toBe('https://lanternfield.example/everyday-checking');
    const pack = disputePack(alert, watch);
    expect(pack?.letter.body).toContain('https://lanternfield.example/everyday-checking');
    expect(pack?.complaint.whatHappened).toContain('https://lanternfield.example/everyday-checking');
    expect(pack?.evidence[0]).toEqual({ label: 'Page', value: 'https://lanternfield.example/everyday-checking' });
    expect(JSON.stringify(pack)).not.toContain('127.0.0.1:9/offer".');
    // The archive's own copy link names the page it saved, so only the archive link may carry the fixture address.
    const withoutArchiveLink = (value: string | undefined) => (value ?? '').replaceAll('https://archive.test/web/20261118120100/http://127.0.0.1:9/offer', '');
    expect(withoutArchiveLink(pack?.letter.body)).not.toContain('127.0.0.1');
    expect(withoutArchiveLink(pack?.complaint.whatHappened)).not.toContain('127.0.0.1');
    expect(pack?.letter.body).toContain('relying on the terms published at https://lanternfield.example/everyday-checking.');
  });

  it('(PACT 12.15) the alert email shows the display URL in its text and its link', async () => {
    const { sink } = await shriek();
    const message = sink.messages[0] as AlertMessage;
    expect(message.url).toBe('https://lanternfield.example/everyday-checking');
    expect(message.text).toContain('Page: https://lanternfield.example/everyday-checking');
    expect(message.html).toContain('href="https://lanternfield.example/everyday-checking"');
    const rest = (message.text + message.html).replaceAll('https://archive.test/web/20261118120100/http://127.0.0.1:9/offer', '');
    expect(rest).not.toContain('127.0.0.1');
  });

  it('(PACT 12.16) the stone subtitle host and the séance show the display URL, as text rather than a dead link', async () => {
    const { watch } = await shriek();
    const { ghostView } = await import('../src/view');
    const { loadDeps } = await import('../src/config');
    const app = defineApp({ id: 'v', name: 'View Crypt', tagline: 't', version: '0.1.0', alertTo: ['t@example.com'], copy: { watchNoun: 'pages', quiet: 'Quiet.' }, watches: [watch] });
    const deps = await loadDeps(app, { env: { GHOST_STORE: 'memory', GHOST_ALERTS: 'console' }, clock: manualClock(NOW) });
    const view = await ghostView(deps, watch);
    expect(view.url).toBe('https://lanternfield.example/everyday-checking');
    expect(view.subtitle).toBe('lanternfield.example');
    expect(view.urlIsDisplay).toBe(true);
    const html = renderDetail({ ...view, interval: 'at most every 6 h', nextEligibleAt: null, checks: 0, rules: [], fields: [], lists: [], alerts: [], past: null });
    expect(html).toContain('https://lanternfield.example/everyday-checking');
    expect(html).not.toContain('<a href="https://lanternfield.example');
    expect(html).not.toContain('127.0.0.1');
  });

  it('(PACT 12.17) the fetcher, the snapshot hash input and the archiver still use the fetch URL', async () => {
    const { store, fetcher, archive } = await shriek();
    expect(fetcher.fetched).toEqual([URL_FETCHED, URL_FETCHED]);
    expect((await store.latestSnapshot('lantern'))?.url).toBe(URL_FETCHED);
    expect(archive.calls).toEqual([URL_FETCHED]);
  });

  it('(PACT 12.18) the pack adds a "Fetched from" row naming the page actually fetched, only when it differs', async () => {
    const { watch, sink } = await shriek();
    const pack = disputePack(sink.messages[0]?.alerts[0] as Alert, watch);
    expect(pack?.evidence.slice(0, 2)).toEqual([
      { label: 'Page', value: 'https://lanternfield.example/everyday-checking' },
      { label: 'Fetched from', value: URL_FETCHED },
    ]);
    const bare = disputePack({ ...(sink.messages[0]?.alerts[0] as Alert), fetchUrl: undefined } as Alert, watch);
    expect(bare?.evidence.map((row) => row.label)).not.toContain('Fetched from');
  });
});

const turnedAway = (extra: Record<string, unknown> = {}) => ({
  id: 'cinderhollow-members',
  name: 'Cinderhollow Member Offers',
  subtitle: 'Cinderhollow National Bank',
  url: 'https://cinderhollow.example/members/offers',
  urlIsDisplay: true,
  state: 'blocked',
  checking: false,
  unread: 0,
  loudest: null,
  lastAttemptAt: null,
  lastMessage: 'robots.txt asks watchers not to visit this page.',
  ignored: 0,
  readings: [],
  headline: null,
  fickleness: null,
  pact: null,
  canSeal: false,
  ...extra,
});

function sealedDetail(pact: Record<string, unknown>) {
  return {
    ...turnedAway({ state: 'dormant', canSeal: true }),
    interval: 'at most every 6 h',
    nextEligibleAt: null,
    checks: 2,
    rules: [],
    fields: [],
    lists: [],
    alerts: [],
    past: null,
    pact: {
      state: 'sealed',
      sealedAt: SEALED,
      sealedDate: DAY,
      snapshotTakenAt: SEALED,
      sha256: HASH,
      shortHash: '99999999…eeee',
      archive: { archiveUrl: null, archivedAt: null, archivedBy: null, note: 'Demo pact.' },
      seeded: true,
      ...pact,
    },
  };
}

describe('the turned-away stone', () => {
  it('(PACT 12.20) shows no "I applied today" on the stone', () => {
    const html = renderGhostCard(turnedAway());
    expect(html).not.toContain('I applied today');
    expect(html).not.toContain('data-action="pact-seal"');
  });

  it('(PACT 12.21) shows no "Not seen yet" hint on the stone', () => {
    const html = renderGhostCard(turnedAway());
    expect(html).not.toContain('Not seen yet');
    expect(html).not.toContain('pact-why');
  });

  it('(PACT 12.22) shows neither the button nor the hint in the séance', () => {
    const html = renderDetail({ ...turnedAway(), interval: 'at most every 6 h', nextEligibleAt: null, checks: 1, rules: [], fields: [], lists: [], alerts: [], past: null });
    expect(html).not.toContain('I applied today');
    expect(html).not.toContain('Not seen yet');
    expect(html).not.toContain('data-action="pact-seal"');
  });

  it('(PACT 12.23) "Check now" is a quiet secondary button on a turned-away ghost and glows on any other', () => {
    const detail = (state: string) => renderDetail({ ...turnedAway({ state, canSeal: true }), interval: 'x', nextEligibleAt: null, checks: 1, rules: [], fields: [], lists: [], alerts: [], past: null });
    expect(detail('blocked')).toMatch(/class="btn btn--quiet" data-action="check"[^>]*>Check now</);
    expect(detail('dormant')).toMatch(/class="btn btn--glow" data-action="check"[^>]*>Check now</);
  });

  it('(PACT 12.24) says in one plain line that robots.txt asks watchers to stay away, on the stone and in the séance', () => {
    expect(TURNED_AWAY_PACT_LINE).toBe("The site's robots.txt asks watchers to stay away, so the ghost does not visit and cannot seal a pact.");
    expect(renderGhostCard(turnedAway())).toContain(TURNED_AWAY_PACT_LINE.replace("'", '&#39;'));
    const html = renderDetail({ ...turnedAway(), interval: 'x', nextEligibleAt: null, checks: 1, rules: [], fields: [], lists: [], alerts: [], past: null });
    expect(html).toContain(TURNED_AWAY_PACT_LINE.replace("'", '&#39;'));
  });
});

describe('a demo pact with a dated stand-in copy', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  async function fixture(): Promise<FixtureServer> {
    const site = await startFixtureServer({
      name: 'dated',
      versions: 1,
      robots: 'User-agent: *\nDisallow:',
      pages: [{ path: '/offer', title: 'Offer', render: ({ now }) => `<html><body><p class="bonus">$300</p><i>${now.toISOString()}</i></body></html>` }],
    });
    cleanups.push(() => site.close());
    return site;
  }
  const stand = (site: FixtureServer) =>
    new SavePageNowArchiver({ userAgent: 'GhostWatcher/0.1.0 (local-only, no public contact; page-change watcher)', base: `${site.origin}/__wayback`, label: 'the stand-in Wayback Machine', clock: manualClock(NOW) });

  it('(PACT 12.26) the fixture stand-in answers a dated save with a copy captured on the requested date', async () => {
    const site = await fixture();
    const saved = await stand(site).saveAt(`${site.origin}/offer`, new Date('2026-10-10T10:00:00Z'));
    expect(saved.archivedAt).toBe('2026-10-10T10:00:00Z');
    expect(saved.archiveUrl).toBe(`${site.origin}/__wayback/web/20261010100000/${site.origin}/offer`);
    const copy = await fetch(saved.archiveUrl);
    expect(copy.status).toBe(200);
    expect(await copy.text()).toContain('2026-10-10T10:00:00.000Z');
    expect(site.saved.map((c) => c.capturedAt)).toEqual(['2026-10-10T10:00:00Z']);
  });

  it('(PACT 12.26) the real Internet Archive is never asked to back-date a copy', async () => {
    const real = new SavePageNowArchiver({ userAgent: 'GhostWatcher/0.1.0 (local-only, no public contact; page-change watcher)', transport: async () => { throw new Error('no network in tests'); } });
    await expect(real.saveAt('https://lanternfield.example/x', new Date(SEALED))).rejects.toThrow('cannot back-date');
  });

  async function seeded(archive: unknown) {
    const store = new GhostStore(new MemoryBlobStore());
    const clock = manualClock(NOW);
    await store.saveSnapshot(snapshot('2026-11-19T09:00:00.000Z', { bonus: money('$300') }, 'lantern', 'http://127.0.0.1:9/offer'));
    const results = await seedDemoPacts({ store, clock, ...(archive ? { archive: archive as never } : {}) }, [{ id: 'lantern', name: 'Lanternfield' }]);
    const reading = await store.pact('lantern');
    if (reading.status !== 'sealed') throw new Error(`expected a sealed pact, got ${results[0]?.status}`);
    return reading.pact;
  }

  it('(PACT 12.25) seeding saves one copy dated on the pact date and records its link, capture time and label', async () => {
    const site = await fixture();
    const pact = await seeded(stand(site));
    expect(pact.sealedAt).toBe('2026-10-10T10:00:00.000Z');
    expect(pact.archive).toEqual({
      archiveUrl: `${site.origin}/__wayback/web/20261010100000/http://127.0.0.1:9/offer`,
      archivedAt: '2026-10-10T10:00:00Z',
      archivedBy: 'the stand-in Wayback Machine',
    });
    // A seeded pact without a dated archive keeps the old demo note.
    expect((await seeded(undefined)).archive.note).toBe('Demo pact: back-dated for the demo, so no archived copy was made.');
    // An archive that cannot date a copy is not asked at all.
    const plain = savingArchiver();
    expect((await seeded(plain)).archive.note).toBe('Demo pact: back-dated for the demo, so no archived copy was made.');
    expect(plain.calls).toEqual([]);
  });

  it('(PACT 12.27) a stand-in that cannot save the copy still seeds the pact and records why', async () => {
    const failing = { ...failingArchiver('the stand-in Wayback Machine', 'the archive answered HTTP 503'), saveAt: async () => { throw new Error('the archive answered HTTP 503'); } };
    const pact = await seeded(failing);
    expect(pact.seeded).toBe('demo');
    expect(pact.archive).toEqual({ archiveUrl: null, archivedAt: null, archivedBy: null, note: 'Could not reach the stand-in Wayback Machine: the archive answered HTTP 503' });
  });

  it('(PACT 12.28) Exhibit A links the dated copy instead of "none"', async () => {
    const site = await fixture();
    const pact = await seeded(stand(site));
    const alert = finePrint(BASE, `${BASE} ${FEE}`, {
      stealth: 'x',
      pact: pactRef({ sealedAt: pact.sealedAt, sha256: pact.sha256, archive: pact.archive, seeded: 'demo' }),
    });
    const pack = disputePack(alert, mossgate);
    const row = pack?.evidence.find((r) => r.label === 'Exhibit A archived copy');
    expect(row?.value).toBe(pact.archive.archiveUrl);
    expect(row?.value).not.toContain('none');
    expect(pack?.letter.body).toContain(`archived copy held by the stand-in Wayback Machine: ${pact.archive.archiveUrl} (captured Oct 10, 2026)`);
  });
});
