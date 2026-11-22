import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const block = (text: string) => /<!-- kiro-numbers:start -->[\s\S]*?<!-- kiro-numbers:end -->/.exec(text)?.[0];

describe('the Kiro numbers', () => {
  it('are one block, quoted word for word by the README, JUDGES and the Kiro log', () => {
    const log = block(read('KIRO-LOG.md'));
    expect(log).toContain('`kiro-cli` calls');
    expect(block(read('README.md'))).toBe(log);
    expect(block(read('JUDGES.md'))).toBe(log);
  });
});
