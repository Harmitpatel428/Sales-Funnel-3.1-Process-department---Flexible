import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.test.{ts,tsx}', '!build/**'],
    exclude: ['node_modules', 'dist', 'build/sales-funnel/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/api/**', 'lib/middleware/**'],
      exclude: [
        'node_modules/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/mocks/**',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
