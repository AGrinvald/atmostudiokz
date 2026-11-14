import { defineConfig, devices } from '@playwright/test'
import { TEST_DATABASE_URL } from './test/integration/db'

const PORT = 3100

// E2E tests run a dev server against the separate test database (requires `npm run db:up`).
export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/integration/global-setup.ts',
  // Tests reset the shared database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx nuxt dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    // NUXT_IGNORE_LOCK lets this run alongside a regular `npm run dev` on port 3000.
    env: { DATABASE_URL: TEST_DATABASE_URL, NUXT_IGNORE_LOCK: '1' },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
