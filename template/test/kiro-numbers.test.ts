import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const block = (text: string) => /<!-- kiro-numbers:start -->[\s\S]*?<!-- kiro-numbers:end -->/.exec(text)?.[0];

/** Requirements, numbered acceptance criteria and top-level tasks in one `.kiro/specs/<name>/` spec. */
function specCounts(name: string) {
  const sections = read(`.kiro/specs/${name}/requirements.md`).split(/^### Requirement \d+.*$/m).slice(1);
  const criteria = sections
    .map((section) => section.split(/^#{1,3} /m)[0] ?? '')
    .reduce((n, section) => n + (section.match(/^\d+(\.\d+)?\.? \S/gm) ?? []).length, 0);
  const tasks = (read(`.kiro/specs/${name}/tasks.md`).match(/^- \[[ x]\] \d+\./gm) ?? []).length;
  return { requirements: sections.length, criteria, tasks };
}

describe('the Kiro numbers', () => {
  it('are one block, quoted word for word by the README, JUDGES and the Kiro log', () => {
    const log = block(read('KIRO-LOG.md'));
    expect(log).toContain('`kiro-cli` calls');
    expect(block(read('README.md'))).toBe(log);
    expect(block(read('JUDGES.md'))).toBe(log);
  });

  it('quote the seal-the-pact spec as it stands in the README and JUDGES', () => {
    const { requirements, criteria, tasks } = specCounts('seal-the-pact');
    expect(read('README.md')).toContain(`(${requirements} requirements, ${criteria} EARS criteria and ${tasks} tasks)`);
    expect(read('JUDGES.md').replace(/\s+/g, ' ')).toContain(
      `${requirements} requirements, ${criteria} EARS criteria and ${tasks} tasks;`,
    );
  });

  it('quote the lease-pact and seal-any-page specs as they stand in the Kiro log', () => {
    const log = read('KIRO-LOG.md');
    for (const name of ['lease-pact', 'seal-any-page']) {
      const { requirements, criteria, tasks } = specCounts(name);
      expect(log).toContain(`${requirements} requirements, ${criteria} criteria, ${tasks} tasks`);
    }
  });
});
