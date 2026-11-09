import { defineConfig } from '@playwright/test'
import { PORT } from './lib/app'

// T-118 盤點：孩子沒點、畫面卻自己換掉的地方（只量、不改程式）
export default defineConfig({
  testDir: '.',
  testMatch: /t118-probe\.spec\.ts/,
  outputDir: '../../test-results/t118/pw',
  timeout: 5 * 60_000,
  workers: 4,
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
    command: `npx vite preview --port ${PORT} --strictPort --outDir ${process.env.T118_DIST ?? 'test-results/t118/dist'}`,
    url: `http://localhost:${PORT}/dodo-adventure/`,
    reuseExistingServer: false,
    timeout: 60_000,
    cwd: '../..',
  },
})
