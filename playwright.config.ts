import { defineConfig } from '@playwright/test'

const previewPort = Number(process.env.PLAYWRIGHT_PORT || '4173')
const previewUrl = `http://127.0.0.1:${previewPort}`

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
    baseURL: previewUrl,
    // CI/remote environments preinstall Chromium outside the version-pinned
    // cache; prefer it when present so `playwright install` is never needed.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  /**
   * Three viewports, because for one session there was only 1280x800 — and the
   * `wideDesk` breakpoint the rails and focus columns hang off is 1400px. Every
   * desk change made on 2026-09-17 was shipped on a suite that had never once
   * rendered it. "252/252 passing" was true and irrelevant.
   *
   * The two desk projects run only the `*-desk.spec.ts` files, which read their
   * width from `page.viewportSize()` and never call `setViewportSize` — a spec
   * that sets its own size makes the project's width a lie.
   */
  projects: [
    {
      name: 'default',
      use: { viewport: { width: 1280, height: 800 } },
      testIgnore: /-desk\.spec\.ts$/,
    },
    { name: 'desk-1440', use: { viewport: { width: 1440, height: 900 } }, testMatch: /-desk\.spec\.ts$/ },
    { name: 'desk-1920', use: { viewport: { width: 1920, height: 1080 } }, testMatch: /-desk\.spec\.ts$/ },
  ],
  webServer: {
    command: `npm run preview -- --port ${previewPort} --strictPort --host 127.0.0.1`,
    url: previewUrl,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
