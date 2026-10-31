import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
import { PORT } from './lib/app'

// 三歲模擬測試：對打包版（vite preview）跑，觸控平板橫向。
// 由 tests/toddler/run.mjs 啟動（npm run test:toddler），參數見那個檔案。
const quick = process.env.TODDLER_QUICK === '1'

// 自動重跑（run.mjs，T-72）：TODDLER_RERUN 是第一輪有問題的項目清單 [{ project, title }]，每個尺寸只跑自己那幾項
const rerun: { project: string; title: string }[] | null = process.env.TODDLER_RERUN ? JSON.parse(fs.readFileSync(process.env.TODDLER_RERUN, 'utf8')) : null
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Playwright 拿「describe 標題 測試標題」來比：標題在最後 */
const only = (project: string) => {
  if (!rerun) return {}
  const ts = rerun.filter((t) => t.project === project).map((t) => esc(t.title))
  return { grep: ts.length ? new RegExp(`(^| )(${ts.join('|')})$`) : /^$a/ }
}
const sizes = [
  { name: 'tab1200', use: { viewport: { width: 1200, height: 800 } } },
  // 第二個尺寸跑精簡版（不發呆 70 秒），抓版面差異造成的問題
  ...(quick ? [] : [{ name: 'tab1280', use: { viewport: { width: 1280, height: 800 } }, metadata: { lite: true } }]),
]

export default defineConfig({
  testDir: '.',
  testMatch: /(games|screens|story|cheer|nav-spam|home)\.spec\.ts/,
  outputDir: '../../test-results/toddler/pw',
  timeout: 15 * 60_000,
  fullyParallel: true,
  // run.mjs 依 CPU 數和是否排到隊決定（tests/toddler/lib/queue.mjs 的 autoWorkers）；直接跑 playwright 時 4 個
  workers: Number(process.env.TODDLER_WORKERS || 4),
  retries: 0,
  // json：run.mjs 判斷哪幾項要重跑、report.mjs 列出沒寫 findings 就失敗（逾時、當掉）的項目
  reporter: process.env.TODDLER_JSON ? [['list'], ['json', { outputFile: process.env.TODDLER_JSON }]] : [['list']],
  use: {
    hasTouch: true,
    isMobile: false,
    serviceWorkers: 'block',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    actionTimeout: 10_000,
    launchOptions: { args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling'] },
  },
  projects: sizes.map((p) => ({ ...p, ...only(p.name) })),
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/dodo-adventure/`,
    reuseExistingServer: false,
    timeout: 60_000,
    cwd: '../..',
  },
})
