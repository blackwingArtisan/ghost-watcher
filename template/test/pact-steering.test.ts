import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..');
const steering = readFileSync(resolve(root, '.kiro/steering/pact.md'), 'utf8');
const agent = JSON.parse(readFileSync(resolve(root, '.kiro/agents/pact-keeper.json'), 'utf8')) as Record<string, unknown>;

/** A small glob matcher for the patterns used in steering: `**`, `*` and literal text. */
function matches(pattern: string, path: string): boolean {
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?');
  return new RegExp(`^${source}$`).test(path);
}

describe('pact steering and the pact-keeper agent', () => {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(steering)?.[1] ?? '';
  const patterns = JSON.parse(/^fileMatchPattern:\s*(.+)$/m.exec(front)?.[1] ?? '[]') as string[];

  it('(PACT 12.29) pact.md is included only for pact, sealing and dispute code and their tests', () => {
    expect(front).toMatch(/^inclusion: fileMatch$/m);
    const hit = (path: string) => patterns.some((pattern) => matches(pattern, path));
    for (const path of [
      'template/src/pact.ts',
      'template/src/sealing.ts',
      'template/src/dispute.ts',
      'template/test/pact-copy.test.ts',
      'template/test/pact-seal.test.ts',
      'template/test/pact-support.ts',
      'apps/bonus-watch/test/pact.test.ts',
      'apps/bonus-watch/test/dispute.test.ts',
    ]) {
      expect(hit(path), path).toBe(true);
    }
    for (const path of ['template/src/runner.ts', 'template/src/view.ts', 'template/test/rules.test.ts']) expect(hit(path), path).toBe(false);
  });

  it('(PACT 12.30) pact.md holds five to eight bullets', () => {
    const bullets = steering.split('\n').filter((line) => line.startsWith('- '));
    expect(bullets.length).toBeGreaterThanOrEqual(5);
    expect(bullets.length).toBeLessThanOrEqual(8);
  });

  it('(PACT 12.31) the agent preloads pact.md, testing.md, tech.md and structure.md', () => {
    expect(agent.resources).toEqual([
      'file://.kiro/steering/pact.md',
      'file://.kiro/steering/testing.md',
      'file://.kiro/steering/tech.md',
      'file://.kiro/steering/structure.md',
    ]);
    for (const resource of agent.resources as string[]) expect(() => readFileSync(resolve(root, resource.replace('file://', '')))).not.toThrow();
  });

  it('(PACT 12.32) the agent allows fs_read, fs_write and the shell tool, and has a one-paragraph prompt', () => {
    expect(agent.name).toBe('pact-keeper');
    // kiro-cli 3.5 rewrites an agent file to its newer format when it loads it ("read", "write",
    // "shell" plus a kiroUpgrade stamp), so both spellings of the same three tools are accepted.
    const same = (names: string[]) => [...names].map((n) => ({ read: 'fs_read', write: 'fs_write', shell: 'execute_bash' })[n] ?? n).sort();
    for (const key of ['tools', 'allowedTools']) expect(same(agent[key] as string[])).toEqual(['execute_bash', 'fs_read', 'fs_write']);
    expect(typeof agent.prompt).toBe('string');
    expect(agent.prompt as string).not.toContain('\n');
  });
});
