import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Project Pages site lives at https://<owner>.github.io/LGReports/ — only the
// production build needs that subpath; the dev server stays at the root so
// `npm run dev` doesn't force you to type the repo name into every URL.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/LGReports/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    // IndexedDB-heavy UI tests are more reliable when one isolated worker owns
    // the fake database. The generous timeout also covers slower Windows hosts.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
}));
