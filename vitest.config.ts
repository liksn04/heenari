import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    coverage: {
      include: [
        'src/heenari/auth/access.ts',
        'src/heenari/AppShell.tsx',
        'src/heenari/Login.tsx',
        'src/heenari/pages.tsx',
      ],
      exclude: ['src/heenari/**/*.test.{ts,tsx}'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
