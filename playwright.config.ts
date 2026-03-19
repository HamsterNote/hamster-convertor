import { defineConfig, devices } from '@playwright/test'

const e2ePort = 4173
const localBaseUrl = `http://127.0.0.1:${e2ePort}`
const loopbackNoProxy = '127.0.0.1,localhost'

const appendNoProxyHosts = (value: string | undefined): string => {
  if (value == null || value.trim() === '') {
    return loopbackNoProxy
  }

  const existingHosts = new Set(
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  )

  loopbackNoProxy.split(',').forEach(host => {
    existingHosts.add(host)
  })

  return Array.from(existingHosts).join(',')
}

process.env.NO_PROXY = appendNoProxyHosts(process.env.NO_PROXY)
process.env.no_proxy = appendNoProxyHosts(process.env.no_proxy)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: localBaseUrl,
    trace: 'on-first-retry'
  },
  webServer: process.env.CI
    ? {
        command: `npx vite preview --host 127.0.0.1 --port ${e2ePort} --strictPort`,
        url: localBaseUrl,
        reuseExistingServer: false,
        timeout: 180000
      }
    : {
        command: `npx vite --host 127.0.0.1 --port ${e2ePort} --strictPort`,
        url: localBaseUrl,
        reuseExistingServer: false,
        timeout: 180000
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
})
