import { defineConfig } from '@playwright/test'
import { PORT } from './lib/app'

// T-108 搶點的定點檢查（只給這次開發用）
export default defineConfig({
  testDir: '.',
  testMatch: /t108-check\.spec\.ts/,
  outputDir: '../../test-results/t108/pw',
  timeout: 5 * 60_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    hasTouch: true,
    isMobile: false,
    serviceWorkers: 'block',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'] },
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/dodo-adventure/`,
    reuseExistingServer: false,
    timeout: 60_000,
    cwd: '../..',
  },
})
