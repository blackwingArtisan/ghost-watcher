import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = basename(fileURLToPath(import.meta.url));

/** Drops comments but keeps every newline, so a reported line number is the real one. */
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');

const CLASSES = ['PoliteFetcher', 'Runner'] as const;

/**
 * Finds `new PoliteFetcher({ ... })` and `new Runner({ ... })` calls whose options object has no
 * `clock` of its own, or hands over `systemClock`. Returns one message per call, with its line.
 * Only the object's own top level counts: a `clock` passed to a nested call does not.
 */
function clocklessCalls(source: string): Array<{ line: number; message: string }> {
  const text = code(source);
  const found: Array<{ line: number; message: string }> = [];
  const start = new RegExp(`new\\s+(${CLASSES.join('|')})\\s*\\(\\s*\\{`, 'g');
  for (let match = start.exec(text); match; match = start.exec(text)) {
    const open = match.index + match[0].length - 1; // the "{"
    let depth = 0;
    let quote = '';
    let top = ''; // the object's own text: nested brackets and strings blanked out
    let end = open;
    for (let i = open; i < text.length; i += 1) {
      const ch = text[i] as string;
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = '';
        top += ' ';
      } else if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
        top += ' ';
      } else if ('{[('.includes(ch)) {
        depth += 1;
        top += ' ';
      } else if ('}])'.includes(ch)) {
        depth -= 1;
        top += ' ';
        if (depth === 0) {
          end = i;
          break;
        }
      } else top += depth === 1 ? ch : ' ';
    }
    const line = text.slice(0, match.index).split('\n').length;
    const body = text.slice(open, end + 1);
    const name = match[1] as string;
    if (/\bsystemClock\b/.test(body)) found.push({ line, message: `new ${name}({ ... }) passes systemClock` });
    else if (!/(^|[\s,])clock\s*(:|,|$)/.test(top.trim())) {
      found.push({ line, message: `new ${name}({ ... }) has no clock option` });
    }
  }
  return found;
}

async function testFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await testFiles(path)));
    else if (entry.name.endsWith('.test.ts')) files.push(path);
  }
  return files;
}

async function allTestFiles(): Promise<string[]> {
  const apps = (await readdir(join(root, 'apps'), { withFileTypes: true })).filter((e) => e.isDirectory());
  const dirs = [join(root, 'template', 'test'), ...apps.map((a) => join(root, 'apps', a.name, 'test')), join(root, 'e2e'), join(root, 'scripts')];
  return (await Promise.all(dirs.map(testFiles))).flat().filter((file) => basename(file) !== SELF);
}

describe('test clock hygiene', () => {
  it('(PACT 8.6, 11.2) every PoliteFetcher and Runner in a test gets the test clock, never systemClock', async () => {
    const files = await allTestFiles();
    expect(files.length).toBeGreaterThan(20);
    const problems: string[] = [];
    for (const file of files) {
      for (const hit of clocklessCalls(await readFile(file, 'utf8'))) {
        problems.push(`${relative(root, file)}:${hit.line} ${hit.message}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('(PACT 8.6) the detector flags a missing clock and systemClock, and accepts a clock option', () => {
    const missing = 'const a = 1;\nconst f = new PoliteFetcher({ userAgent, minHostGapMs: 0 });\n';
    expect(clocklessCalls(missing)).toEqual([{ line: 2, message: 'new PoliteFetcher({ ... }) has no clock option' }]);
    const real = 'new Runner({\n  app,\n  clock: systemClock,\n});';
    expect(clocklessCalls(real)).toEqual([{ line: 1, message: 'new Runner({ ... }) passes systemClock' }]);
    expect(clocklessCalls('new Runner({ app, fetcher, store, sink, clock });')).toEqual([]);
    expect(clocklessCalls('new PoliteFetcher({ userAgent, clock: manualClock(), minHostGapMs: 0 });')).toEqual([]);
    expect(clocklessCalls('new PoliteFetcher({\n  userAgent,\n  clock,\n});')).toEqual([]);
  });

  it('(PACT 8.6) a clock handed to a nested call does not count, and a commented-out call is ignored', () => {
    expect(clocklessCalls('new Runner({ app, fetcher: new OneFetcher(page, clock), store });')).toHaveLength(1);
    expect(clocklessCalls('// new Runner({ app })\n/* new PoliteFetcher({ userAgent }) */')).toEqual([]);
  });
});
