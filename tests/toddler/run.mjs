#!/usr/bin/env node
// 三歲模擬測試：npm run test:toddler -- [遊戲 id／站點／種類／screens／畫面名稱…] [選項]
//
//   npm run test:toddler                       全部遊戲＋全部畫面，1200×800 完整版＋1280×800 精簡版
//   npm run test:toddler -- d-free             只跑自由畫畫
//   npm run test:toddler -- home-doors lesson-math  只跑首頁三大門和數學課
//   npm run test:toddler -- screens            只跑畫面（家長區、護眼休息、睡覺、減少動態、來回換畫面…）
//   npm run test:toddler -- parent bedtime     只跑某幾個畫面（parent eyebreak bedtime motion settings layers）
//   npm run test:toddler -- --changed          只跑跟 main 比改到的部分（對照表見 tests/toddler/lib/affected.mjs）
//
// 選項：
//   --seed N          換一組亂數（重現報告裡的問題：用報告寫的 seed）
//   --quick           只跑 1200×800
//   --no-build        不重新打包（沿用 dist/）
//   --changed [REF]   只跑受影響的遊戲和畫面（跟 REF 比，預設 main；改到共用檔就跑完整版）
//   --no-rerun        有問題的項目不自動重跑（預設同一個 seed 再跑 2 次，報告標「3/3 重現」或「1/3 偶發」）
//   --workers N       同時跑幾個瀏覽器（預設依 CPU 數和現在多忙自動決定，單獨跑最多 6 個）
//   --no-lock         不排隊（預設同一台機器同時只跑一個三歲測試，其他的排隊；鎖在 %TEMP%\dodo-toddler）
//   --report PATH     跑完把報告寫到 PATH（截圖放在旁邊的「三歲模擬測試截圖」資料夾）
//   --out-dir DIR     結果放這裡（預設 test-results/toddler，每次跑會先清空）
//   環境變數 TODDLER_PORT：vite preview 的 port（預設 4527；同時有別的工作階段在跑時換一個）
//
// 結果：test-results/toddler/（findings/*.json、shots/*.png、rerun-2／rerun-3／、run.json、report.md）
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquire, autoWorkers, cpuBusy } from './lib/queue.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const pick = []
const env = { ...process.env, TODDLER_OUT: path.join(root, 'test-results/toddler') }
let build = true
let report = null
let changed = null
let rerun = true
let lock = true
let workers = null
const isRef = (s) => !!s && !s.startsWith('--') && spawnSync('git', ['rev-parse', '--verify', '--quiet', `${s}^{commit}`], { cwd: root }).status === 0
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--seed') env.TODDLER_SEED = args[++i]
  else if (a === '--quick') env.TODDLER_QUICK = '1'
  else if (a === '--no-build') build = false
  else if (a === '--workers') workers = Number(args[++i])
  else if (a === '--report') report = path.resolve(args[++i])
  else if (a === '--out-dir') env.TODDLER_OUT = path.resolve(args[++i])
  else if (a === '--no-rerun') rerun = false
  else if (a === '--no-lock') lock = false
  else if (a.startsWith('--changed=')) changed = a.slice(10)
  else if (a === '--changed') changed = isRef(args[i + 1]) ? args[++i] : 'main'
  else pick.push(a)
}
const OUT = env.TODDLER_OUT
// worktree 沒有 .env.local（不進 git）：打包出來孩子的名字是預設的 buddy，那幾句台詞找不到音檔，每一項都會報「音檔缺漏」
if (!fs.existsSync(path.join(root, '.env.local'))) console.log('⚠ 這個資料夾沒有 .env.local：孩子的名字會變成 buddy、那幾句沒有音檔（每一項都會報音檔缺漏）。從主 repo 複製一份（不進 git）。')
const t0 = Date.now()
const timing = { started: new Date(t0).toISOString(), args, phases: {} }
const phase = async (name, fn) => {
  const t = Date.now()
  const r = await fn()
  timing.phases[name] = Math.round((Date.now() - t) / 1000)
  return r
}

// 報告寫上測的是哪一版
try {
  const head = spawnSync('git', ['log', '-1', '--format=%h %s'], { cwd: root }).stdout.toString().trim()
  const dirty = spawnSync('git', ['status', '--porcelain', '--', 'src'], { cwd: root }).stdout.toString().trim()
  env.TODDLER_VERSION ??= head + (dirty ? '（src 有未提交的改動）' : '')
} catch {
  /* 沒有 git */
}

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

// 用非同步的 spawn：等子程式時 Ctrl+C 也能放掉排隊的鎖。
// Windows 要經過 shell（npm、npx 是 .cmd），有空格的參數（C:\Git\Side Project\…）要加引號，不然會被切斷
const q = (a) => (process.platform === 'win32' && /[\s&()]/.test(a) ? `"${a}"` : a)
const run = (cmd, argv, extra = {}) =>
  new Promise((res) => {
    const p = spawn(cmd, argv.map(q), { cwd: root, env: { ...env, ...extra }, stdio: 'inherit', shell: process.platform === 'win32' })
    p.on('exit', (code) => res(code ?? 1))
    p.on('error', () => res(1))
  })

// ── --changed：只跑受影響的 ───────────────────────────────
let affectedInfo = null
if (changed) {
  const { affected, table } = await import('./lib/affected.mjs')
  affectedInfo = affected(changed)
  console.log(`\n[--changed] 跟 ${changed} 比，改了 ${affectedInfo.files.length} 個檔：\n\n${table(affectedInfo)}\n`)
  if (affectedInfo.full) console.log('→ 改到共用的檔，跑完整版\n')
  else if (!affectedInfo.tokens.length) {
    console.log('→ 沒有影響三歲測試的改動，不用跑')
    process.exit(0)
  } else {
    console.log(`→ 只跑：${affectedInfo.tokens.join(' ')}\n`)
    pick.push(...affectedInfo.tokens)
  }
}
if (pick.length) env.TODDLER_GAMES = [...new Set(pick)].join(',')

if (build) {
  // 舊的 dist 留著時 vite 清資料夾會碰到上面那個 Node 的問題而崩掉：先自己刪
  rmrf(path.join(root, 'dist'))
  if ((await phase('build', () => run('npm', ['run', 'build']))) !== 0) process.exit(1)
}

// ── 排隊：同一台機器同時只跑一個 ─────────────────────────
let release = () => {}
if (lock) {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root }).stdout?.toString().trim()
  const got = await phase('queue', () => acquire({ worktree: path.basename(root), branch, cmd: `test:toddler ${args.join(' ')}`.trim() }))
  release = got.release
  if (got.waitedMs > 5000) console.log(`[排隊] 輪到了（等了 ${(got.waitedMs / 60000).toFixed(1)} 分鐘）`)
}
const cpus = os.availableParallelism?.() ?? os.cpus().length
if (!workers) {
  const busy = await cpuBusy()
  workers = autoWorkers({ cpus, busy, locked: lock })
  timing.workersWhy = `${cpus} 核，現在 CPU ${Math.round(busy * 100)}%，${lock ? '已排到隊（單獨跑）' : '沒有排隊（--no-lock）'}`
} else timing.workersWhy = '--workers 指定'
timing.workers = workers
console.log(`[三歲測試] ${workers} 個瀏覽器同時跑（${timing.workersWhy}）`)
env.TODDLER_WORKERS = String(workers)

// ── 第一輪 ────────────────────────────────────────────────
rmrf(OUT)
fs.mkdirSync(OUT, { recursive: true })
const pw = (out, extra) => run('npx', ['playwright', 'test', '-c', 'tests/toddler/playwright.config.ts'], { TODDLER_OUT: out, TODDLER_JSON: path.join(out, 'results.json'), ...extra })
const status = await phase('attempt1', () => pw(OUT, { TODDLER_ATTEMPT: '1' }))

// ── 有問題的項目用同一個 seed 再跑 2 次 ────────────────────
const { problemTests } = await import('./lib/rerun.mjs')
const bad = problemTests(OUT)
timing.problemTests = bad.length
if (bad.length && rerun) {
  const list = path.join(OUT, 'rerun-tests.json')
  fs.writeFileSync(list, JSON.stringify(bad, null, 2))
  console.log(`\n[重跑] ${bad.length} 項有問題，用同一個 seed 再跑 2 次，判斷是每次都會發生還是偶發：\n${bad.map((t) => `  ${t.project} ${t.title}`).join('\n')}\n`)
  for (const n of [2, 3]) await phase(`attempt${n}`, () => pw(path.join(OUT, `rerun-${n}`), { TODDLER_ATTEMPT: String(n), TODDLER_RERUN: list }))
} else if (bad.length) console.log(`\n[重跑] ${bad.length} 項有問題；--no-rerun，不重跑`)
release()

timing.ended = new Date().toISOString()
timing.total = Math.round((Date.now() - t0) / 1000)
timing.status = status
if (affectedInfo) timing.affected = affectedInfo
fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(timing, null, 2))
await run('node', ['tests/toddler/report.mjs', ...(report ? ['--out', report] : [])])
console.log(`\n報告：${report ?? path.join(OUT, 'report.md')}（${(timing.total / 60).toFixed(1)} 分鐘）`)
// 第一輪有任何問題就不算通過（重跑沒重現的偶發也一樣，報告裡分開列）
process.exit(status)
