import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['template/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'e2e/**/*.test.ts', 'scripts/**/*.test.ts', 'real-pages/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./test-setup/loopback-only.ts'],
    testTimeout: 30_000,
  },
});
