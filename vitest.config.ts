import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'client/',
        'temp/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@server': path.resolve(__dirname, './server'),
    },
  },
});
