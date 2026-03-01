import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,        // 2 min for container tests
    hookTimeout: 120_000,        // 2 min for beforeAll container startup
  },
});
