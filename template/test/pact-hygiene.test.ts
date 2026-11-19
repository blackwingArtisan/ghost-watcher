import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (name: string) => readFile(join(src, name), 'utf8');

/** Drops comments so a sentence that mentions `Date.now()` is not mistaken for a call. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('source hygiene for the pact code', () => {
  for (const file of ['pact.ts', 'sealing.ts', 'dispute.ts']) {
    it(`(PACT 8.6) ${file} reads no clock of its own: no Date.now( and no new Date()`, async () => {
      const source = code(await read(file));
      expect(source).not.toContain('Date.now(');
      expect(source).not.toContain('new Date()');
      expect(source).not.toContain('Math.random');
    });
  }

  it('(PACT 5.8) pact.ts never turns cents into dollars or rounds a product', async () => {
    const source = code(await read('pact.ts'));
    expect(source).not.toMatch(/\/\s*100\b/);
    expect(source).not.toMatch(/\*\s*100\b/);
    expect(source).not.toContain('Math.round');
  });
});

describe('the public API', () => {
  it('(PACT 11.4) exports what an app needs to seal, break and compare a pact', () => {
    for (const name of ['sealPact', 'breakPact', 'comparePact', 'pactNote', 'pactVariant', 'DEMO_PACT_AGE_DAYS', 'PACT_VERSION'] as const) {
      expect(api[name], name).toBeDefined();
    }
    expect(api.DEMO_PACT_AGE_DAYS).toBe(40);
  });
});
