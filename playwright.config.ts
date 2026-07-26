import { defineConfig, devices } from '@playwright/test'
import { adminOrigin, adminWebPort, apiOrigin, userOrigin, userWebPort } from './e2e/ports.mjs'

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './runtime/e2e/test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: './runtime/e2e/playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: './runtime/e2e/playwright-report', open: 'never' }]],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node e2e/start-api.mjs',
      url: `${apiOrigin}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @campus-foodie/user-web exec vite --host 127.0.0.1 --port ${userWebPort} --strictPort`,
      url: userOrigin,
      env: {
        VITE_API_BASE_URL: `${apiOrigin}/api/v1`,
        VITE_API_MODE: 'remote',
        VITE_CAMPUS_ID: '00000000-0000-0000-0000-000000000001',
        VITE_AMAP_KEY: '',
        VITE_AMAP_SECURITY_CODE: '',
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @campus-foodie/admin-web exec vite --host 127.0.0.1 --port ${adminWebPort} --strictPort --configLoader runner`,
      url: adminOrigin,
      env: {
        VITE_ADMIN_API_BASE_URL: `${apiOrigin}/admin/api/v1`,
        VITE_API_MODE: 'remote',
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
})
