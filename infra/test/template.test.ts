import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, '..', 'template.yaml'), 'utf8');
const readme = readFileSync(join(here, '..', 'README.md'), 'utf8');

type Node = string | Node[] | { [key: string]: Node };
interface Line {
  indent: number;
  text: string;
}

/** A small reader for the block-style YAML subset the template uses: maps, lists, plain scalars. */
function parse(source: string): Node {
  const lines: Line[] = source
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'))
    .map((l) => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
  const scalar = (value: string): string => value.replace(/^'(.*)'$/, '$1');

  function block(start: number, indent: number): [Node, number] {
    const first = lines[start];
    if (!first) return ['', start];
    return first.text.startsWith('- ') || first.text === '-' ? list(start, indent) : map(start, indent);
  }
  function list(start: number, indent: number): [Node, number] {
    const items: Node[] = [];
    let i = start;
    while (i < lines.length && lines[i]!.indent === indent && lines[i]!.text.startsWith('-')) {
      const rest = lines[i]!.text.slice(1).trim();
      if (rest === '') {
        const [child, next] = block(i + 1, lines[i + 1]!.indent);
        items.push(child);
        i = next;
      } else if (/^[\w.-]+:(\s|$)/.test(rest)) {
        lines[i] = { indent: indent + 2, text: rest };
        const [child, next] = map(i, indent + 2);
        items.push(child);
        i = next;
      } else {
        items.push(scalar(rest));
        i += 1;
      }
    }
    return [items, i];
  }
  function map(start: number, indent: number): [Node, number] {
    const out: { [key: string]: Node } = {};
    let i = start;
    while (i < lines.length && lines[i]!.indent === indent && !lines[i]!.text.startsWith('-')) {
      const match = /^([\w.-]+):(?:\s+(.*))?$/.exec(lines[i]!.text);
      if (!match) throw new Error(`Unreadable line: ${lines[i]!.text}`);
      const key = match[1]!;
      const value = match[2];
      if (value !== undefined && value !== '') {
        out[key] = scalar(value);
        i += 1;
      } else if (i + 1 < lines.length && lines[i + 1]!.indent > indent) {
        const [child, next] = block(i + 1, lines[i + 1]!.indent);
        out[key] = child;
        i = next;
      } else {
        out[key] = '';
        i += 1;
      }
    }
    return [out, i];
  }
  return block(0, 0)[0];
}

const isMap = (n: Node | undefined): n is { [key: string]: Node } => typeof n === 'object' && n !== null && !Array.isArray(n);
const doc = parse(text);
const resources = isMap(doc) && isMap(doc.Resources) ? doc.Resources : {};
const prop = (resource: string, ...path: string[]): Node | undefined => {
  let node: Node | undefined = resources[resource];
  for (const key of ['Properties', ...path]) node = isMap(node) ? node[key] : undefined;
  return node;
};

describe('infra/template.yaml', () => {
  it('(AWS 4.8) reads as a SAM template with the expected resources', () => {
    expect(isMap(doc) && doc.Transform).toBe('AWS::Serverless-2016-10-31');
    expect(Object.keys(resources).sort()).toEqual(
      ['CheckFunction', 'CheckFunctionRole', 'CheckLogGroup', 'DataBucket', 'NightlySchedule', 'PactBucket', 'SchedulerRole'].sort(),
    );
    expect(text).not.toContain('\t');
  });

  it('(AWS 4.1, 4.2) the pact bucket is an Object Lock bucket in compliance mode with versioning', () => {
    expect(prop('PactBucket', 'ObjectLockEnabled')).toBe('true');
    expect(prop('PactBucket', 'ObjectLockConfiguration', 'ObjectLockEnabled')).toBe('Enabled');
    expect(prop('PactBucket', 'ObjectLockConfiguration', 'Rule', 'DefaultRetention', 'Mode')).toBe('COMPLIANCE');
    expect(prop('PactBucket', 'VersioningConfiguration', 'Status')).toBe('Enabled');
  });

  it('(AWS 4.3) both buckets block public access and encrypt', () => {
    for (const bucket of ['PactBucket', 'DataBucket']) {
      const block = prop(bucket, 'PublicAccessBlockConfiguration');
      expect(isMap(block) && Object.values(block)).toEqual(['true', 'true', 'true', 'true']);
      expect(prop(bucket, 'BucketEncryption')).toBeDefined();
    }
  });

  it('(AWS 1.1, 1.2, 1.3, 1.4) the schedule fires once a night, in UTC, with one retry', () => {
    expect(prop('NightlySchedule', 'ScheduleExpression')).toMatch(/^cron\(\d+ \d+ \* \* \? \*\)$/);
    expect(prop('NightlySchedule', 'ScheduleExpressionTimezone')).toBe('UTC');
    expect(prop('NightlySchedule', 'Target', 'Arn')).toBe('!GetAtt CheckFunction.Arn');
    expect(prop('NightlySchedule', 'Target', 'RetryPolicy', 'MaximumRetryAttempts')).toBe('1');
    expect(prop('NightlySchedule', 'FlexibleTimeWindow', 'Mode')).toBe('OFF');
  });

  it('(AWS 4.4) no IAM action is a wildcard', () => {
    const actions = [...text.matchAll(/^\s*(?:- |Action:\s*)([a-z0-9-]+:[A-Za-z0-9*]+)\s*$/gm)].map((m) => m[1]!);
    expect(actions.length).toBeGreaterThanOrEqual(10);
    expect(actions.filter((a) => a.includes('*'))).toEqual([]);
    expect(text).not.toMatch(/Action:\s*'?\*/);
    expect(text).not.toMatch(/-\s*'?\*'?\s*$/m);
  });

  it('(AWS 4.5) the pact bucket grants no delete and no governance bypass', () => {
    const statements = (prop('CheckFunctionRole', 'Policies') as Node[] | undefined) ?? [];
    const policy = (statements[0] as { [k: string]: Node })?.PolicyDocument as { [k: string]: Node };
    const list = policy.Statement as { [k: string]: Node }[];
    const pact = list.filter((s) => String(s.Resource).includes('PactBucket'));
    expect(pact.length).toBe(2);
    const granted = pact.flatMap((s) => s.Action as string[]);
    expect(granted).toContain('s3:PutObjectRetention');
    expect(granted).not.toContain('s3:DeleteObject');
    expect(text).not.toContain('BypassGovernanceRetention');
  });

  it('(AWS 4.6) the function is small and its logs expire', () => {
    expect(prop('CheckFunction', 'Architectures')).toEqual(['arm64']);
    expect(Number(prop('CheckFunction', 'MemorySize'))).toBeLessThanOrEqual(512);
    expect(Number(prop('CheckFunction', 'Timeout'))).toBeLessThanOrEqual(300);
    expect(prop('CheckFunction', 'ReservedConcurrentExecutions')).toBe('1');
    expect(Number(prop('CheckLogGroup', 'RetentionInDays'))).toBeLessThanOrEqual(30);
  });

  it('(AWS 4.7) the webhook parameter is NoEcho and no key or secret is written in the file', () => {
    const params = isMap(doc) && isMap(doc.Parameters) ? doc.Parameters : {};
    expect(isMap(params.WebhookUrl) && params.WebhookUrl.NoEcho).toBe('true');
    expect(text).not.toMatch(/AKIA[0-9A-Z]{12}|aws_secret|https?:\/\/[^\s]*(token|key)=/i);
  });

  it('(AWS 5.1) the README marks the deploy command as not run', () => {
    expect(readme).toMatch(/not deployed, not run/i);
    expect(readme).toMatch(/Deploy command \(NOT RUN\)/);
    expect(readme).toContain('sam deploy');
  });
});
