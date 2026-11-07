
import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(frontendDir, '..')

export default defineConfig({
  testDir: './e2e',

  fullyParallel: false,
  workers: 1,

  timeout: 30000,

  reporter: [
    ['list'],
    ['html', {
      outputFolder: 'playwright-report',
      open: 'never',
    }],
  ],

  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  webServer: [
    {
      command: 'node scripts/playwright-server.js',
      cwd: projectDir,
      url: 'http://127.0.0.1:3000/api/public/info',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      cwd: frontendDir,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
})
