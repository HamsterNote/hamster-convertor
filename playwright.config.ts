import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5073',
    trace: 'on-first-retry'
  },
  webServer: process.env.CI
    ? {
        command: 'yarn preview',
        url: 'http://localhost:5073',
        reuseExistingServer: true,
        timeout: 180000
      }
    : {
        command: 'yarn dev',
        url: 'http://localhost:5073',
        reuseExistingServer: true,
        timeout: 180000
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
})
