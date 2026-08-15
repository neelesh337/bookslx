import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/vi-setup.ts'],
    include: ['tests/**/*.test.ts'],
    // SQLite is single-writer; run test files sequentially.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
});
