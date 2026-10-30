import { defineConfig } from '@playwright/test'
import { PORT } from './lib/app'

// 三歲模擬測試：對打包版（vite preview）跑，觸控平板橫向。
// 由 tests/toddler/run.mjs 啟動（npm run test:toddler），參數見那個檔案。
const quick = process.env.TODDLER_QUICK === '1'

export default defineConfig({
  testDir: '.',
  testMatch: /(games|screens|story)\.spec\.ts/,
  outputDir: '../../test-results/toddler/pw',
  timeout: 15 * 60_000,
  fullyParallel: true,
  workers: Number(process.env.TODDLER_WORKERS || 4),
  retries: 0,
  reporter: [['list']],
  use: {
    hasTouch: true,
    isMobile: false,
    serviceWorkers: 'block',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    actionTimeout: 10_000,
    launchOptions: { args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'] },
  },
  projects: [
    { name: 'tab1200', use: { viewport: { width: 1200, height: 800 } } },
    // 第二個尺寸跑精簡版（不發呆 70 秒），抓版面差異造成的問題
    ...(quick ? [] : [{ name: 'tab1280', use: { viewport: { width: 1280, height: 800 } }, metadata: { lite: true } }]),
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/dodo-adventure/`,
    reuseExistingServer: false,
    timeout: 60_000,
    cwd: '../..',
  },
})
