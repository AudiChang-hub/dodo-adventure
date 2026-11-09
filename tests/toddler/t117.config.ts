import { defineConfig } from '@playwright/test'
import { PORT } from './lib/app'

// T-117 找一樣的字的定點檢查：示範、點錯並排再退回、搶點、三種尺寸的排版（只給這次開發用）
export default defineConfig({
  testDir: '.',
  testMatch: /t117-check\.spec\.ts/,
  outputDir: '../../test-results/t117/pw',
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
    command: `npx vite preview --port ${PORT} --strictPort --outDir ${process.env.T117_DIST ?? 'test-results/t117/dist'}`,
    url: `http://localhost:${PORT}/dodo-adventure/`,
    reuseExistingServer: false,
    timeout: 60_000,
    cwd: '../..',
  },
})
