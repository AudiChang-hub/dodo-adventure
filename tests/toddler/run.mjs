#!/usr/bin/env node
// 三歲模擬測試：npm run test:toddler -- [遊戲 id／站點／種類／screens／畫面名稱…] [選項]
//
//   npm run test:toddler                       全部遊戲＋全部畫面，1200×800 完整版＋1280×800 精簡版
//   npm run test:toddler -- m-count d-color    只跑這兩個遊戲
//   npm run test:toddler -- math               數字工地的全部遊戲
//   npm run test:toddler -- screens            只跑畫面（首頁、地圖、家長區、冒險…）
//   npm run test:toddler -- parent bedtime     只跑某幾個畫面（home map collection parent back adventure eyebreak bedtime）
//
// 選項：
//   --seed N        換一組亂數（重現報告裡的問題：用報告寫的 seed）
//   --quick         只跑 1200×800
//   --no-build      不重新打包（沿用 dist/）
//   --workers N     同時跑幾個瀏覽器（預設 4）
//   --report PATH   跑完把報告寫到 PATH（截圖放在旁邊的「三歲模擬測試截圖」資料夾）
//
// 結果：test-results/toddler/（findings/*.json、shots/*.png、report.md）
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const pick = []
const env = { ...process.env, TODDLER_OUT: path.join(root, 'test-results/toddler') }
let build = true
let report = null
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--seed') env.TODDLER_SEED = args[++i]
  else if (a === '--quick') env.TODDLER_QUICK = '1'
  else if (a === '--no-build') build = false
  else if (a === '--workers') env.TODDLER_WORKERS = args[++i]
  else if (a === '--report') report = path.resolve(args[++i])
  else pick.push(a)
}
if (pick.length) env.TODDLER_GAMES = pick.join(',')

// Node 24 的 fs.rmSync(recursive) 在中文路徑（善鈞學習APP）上會整個崩掉（exit 127／-1073740791，沒有任何訊息），自己一層層刪
function rmrf(p) {
  let st
  try {
    st = fs.lstatSync(p)
  } catch {
    return
  }
  if (st.isDirectory() && !st.isSymbolicLink()) {
    for (const f of fs.readdirSync(p)) rmrf(path.join(p, f))
    fs.rmdirSync(p)
  } else fs.unlinkSync(p)
}

const run = (cmd, argv) => {
  const r = spawnSync(cmd, argv, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
  return r.status ?? 1
}

if (build) {
  // 舊的 dist 留著時 vite 清資料夾會碰到上面那個 Node 的問題而崩掉：先自己刪
  rmrf(path.join(root, 'dist'))
  if (run('npm', ['run', 'build']) !== 0) process.exit(1)
}
rmrf(env.TODDLER_OUT)
const status = run('npx', ['playwright', 'test', '-c', 'tests/toddler/playwright.config.ts'])
run('node', ['tests/toddler/report.mjs', ...(report ? ['--out', report] : [])])
console.log(`\n報告：${report ?? path.join(env.TODDLER_OUT, 'report.md')}`)
process.exit(status)
