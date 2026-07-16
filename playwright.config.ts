import { defineConfig } from '@playwright/test'

/**
 * E2E for the Growth tab (acquisition command deck). Runs against the
 * production build via `vite preview`; all /api/* calls are mocked in the
 * specs so tests are deterministic and never touch live sends or budgets.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 800 },
    // CI/remote environments preinstall Chromium outside the version-pinned
    // cache; prefer it when present so `playwright install` is never needed.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
