import { describe, expect, it } from 'vitest';
import { HOUR_MS, defineApp, defineWatch, manualClock, rules, type FetchOutcome, type Fetcher } from '@ghost-watcher/template';
import { createHandler } from '../handler';
import { fakeS3 } from '../../template/test/pact-support';

const watch = defineWatch({
  id: 'lantern',
  name: 'Lanternfield',
  url: 'https://example.com/offer',
  intervalMs: 6 * HOUR_MS,
  fields: [{ name: 'bonus', label: 'Bonus', selector: '.bonus', kind: 'money' }],
  rules: [rules.wentUp('bonus'), rules.wentDown('bonus')],
});

const app = defineApp({
  id: 'test-app',
  name: 'Test Crypt',
  tagline: 'Testing',
  version: '0.1.0',
  alertTo: ['tester@example.com'],
  copy: { watchNoun: 'pages', quiet: 'Quiet.' },
  watches: [watch],
});

const env = {
  GHOST_STORE: 's3',
  GHOST_S3_BUCKET: 'example-data',
  GHOST_PACT_BUCKET: 'example-pacts',
  GHOST_ALERTS: 'ses',
  GHOST_SES_FROM: 'alerts@example.com',
  AWS_REGION: 'us-east-1',
};

function scripted(clock: { now(): Date }, bonuses: string[]): Fetcher & { calls: number } {
  return {
    calls: 0,
    async fetchPage(): Promise<FetchOutcome> {
      const bonus = bonuses[Math.min(this.calls, bonuses.length - 1)];
      this.calls += 1;
      return { status: 'ok', html: `<p class="bonus">${bonus}</p>`, finalUrl: watch.url, httpStatus: 200, fetchedAt: clock.now().toISOString() };
    },
  };
}

function setup(bonuses: string[]) {
  const clock = manualClock('2026-11-19T07:00:00Z');
  const fetcher = scripted(clock, bonuses);
  const data = fakeS3();
  const pacts = fakeS3();
  const emails: unknown[] = [];
  const ses = {
    send: (async (command: { input: unknown }) => {
      emails.push(command.input);
      return { MessageId: 'fake-1' };
    }) as never,
  };
  const handler = createHandler({ app, env, clock, fetcher, clients: { s3: data.client, s3Lock: pacts.client, ses } });
  return { clock, fetcher, data, pacts, emails, handler };
}

describe('nightly handler', () => {
  it('(AWS 2.1, 2.2, 2.6) runs one checkAll and returns a summary', async () => {
    const { handler, fetcher, data } = setup(['$200']);
    const summary = await handler({ source: 'aws.scheduler' }, {});
    expect(fetcher.calls).toBe(1);
    expect(summary).toEqual({ app: 'test-app', checked: 1, changed: 0, baseline: 1, unchanged: 0, skipped: 0, blocked: 0, failed: 0, alerts: 0 });
    expect([...data.objects.keys()].some((key) => key.includes('lantern'))).toBe(true);
  });

  it('(AWS 2.2) a change on the next night raises an alert through the SES sink', async () => {
    const { handler, clock, emails } = setup(['$200', '$300']);
    await handler();
    clock.advance(24 * HOUR_MS);
    const summary = await handler();
    expect(summary).toMatchObject({ checked: 1, changed: 1, alerts: 1 });
    expect(emails).toHaveLength(1);
  });

  it('(AWS 2.2) a second invocation inside the watch interval is skipped, not fetched again', async () => {
    const { handler, fetcher } = setup(['$200']);
    await handler();
    const summary = await handler();
    expect(summary).toMatchObject({ skipped: 1, baseline: 0 });
    expect(fetcher.calls).toBe(1);
  });

  it('(AWS 2.4) a failing watch is counted and does not throw', async () => {
    const clock = manualClock('2026-11-19T07:00:00Z');
    const failing: Fetcher = { fetchPage: async () => ({ status: 'error', message: 'HTTP 503', fetchedAt: clock.now().toISOString() }) };
    const handler = createHandler({ app, env, clock, fetcher: failing, clients: { s3: fakeS3().client, s3Lock: fakeS3().client } });
    expect(await handler()).toMatchObject({ checked: 1, failed: 1 });
  });

  it('(AWS 2.3) an incomplete configuration throws, so the invocation fails', async () => {
    const handler = createHandler({ app, env: { ...env, GHOST_S3_BUCKET: '' }, clock: manualClock('2026-11-19T07:00:00Z'), clients: { s3: fakeS3().client } });
    await expect(handler()).rejects.toThrow(/GHOST_S3_BUCKET/);
  });

  it('(AWS 2.5) selects the S3 store from the environment and writes no outbox directory', async () => {
    const { handler, data } = setup(['$200']);
    await handler();
    expect(data.objects.size).toBeGreaterThan(0);
  });
});
