import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'app/**/*.test.ts',
      'components/**/*.test.ts',
      'components/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**', '**/.next/**'],
    setupFiles: ['./lib/json-render/test-setup.ts'],
  },
});
