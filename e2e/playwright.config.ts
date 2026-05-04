import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'https://localhost';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,        // serialize against a shared dev DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL,
    // Self-signed cert in dev — accept it.
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // E2E_BASE_URL points at an already-running stack (`docker compose up`).
  // Wiring `webServer` here would re-launch the stack per run; we'd rather
  // bring it up once and keep it warm.
});
