#!/usr/bin/env node
// 一鍵驗收（T-72）：npm run verify [-- --with-toddler [三歲測試的參數…]]
//
// 把合併前要跑的那一串檢查能平行的就平行跑，最後印一張表（每項 通過／失敗、關鍵數字、花了幾秒），任何一項失敗就以 1 結束。
// 只做檢查、不產生東西：音檔用 gen_audio.py --check（不連線、不寫檔），成長模擬的結果寫到暫存資料夾，不動 docs/。
//
//   npm run verify                              型別、單元測試、模擬、故事檢查、音檔檢查
//   npm run verify -- --with-toddler            接著跑三歲測試（完整版）
//   npm run verify -- --with-toddler --changed  接著只跑受影響的三歲測試（--changed 之後的參數都交給 tests/toddler/run.mjs）
//   npm run verify -- --only tsc,sim-teach      只跑某幾項（id 見下面 CHECKS）
//
// 每一項的完整輸出在 test-results/verify/<id>.log；表格另存 test-results/verify/verify.md。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const ti = args.indexOf('--with-toddler')
const toddlerArgs = ti >= 0 ? args.slice(ti + 1) : null
const own = ti >= 0 ? args.slice(0, ti) : args
const only = own.includes('--only') ? own[own.indexOf('--only') + 1].split(',') : null
const logDir = path.join(root, 'test-results', 'verify')
const tmp = path.join(os.tmpdir(), `dodo-verify-${process.pid}`)

const num = (re, s) => re.exec(s)?.[1]
// Windows 經過 shell 跑（npx 是 .cmd）：有空格的參數要加引號
const q = (a) => (process.platform === 'win32' && /[\s&()]/.test(a) ? `"${a}"` : a)
const oks = (s) => (s.match(/^ok \d+/gm) ?? []).length
/** 單元測試：每一條 ok、最後 ALL PASS */
const unit = (s) => ({ ok: /ALL PASS/.test(s), key: `${oks(s)} 項 ok${/ALL PASS/.test(s) ? '' : `，${(s.match(/^not ok|^FAIL|✗/gm) ?? []).length} 項失敗`}` })

/**
 * 每一項：cmd（陣列，第一個是程式）、check(輸出, exit code) → { ok, key }（key 是表上的關鍵數字）。
 * exit code 不是 0 一律算失敗；check 再看輸出裡的關鍵數字。
 */
const CHECKS = [
  { id: 'tsc', name: '型別檢查（src）', cmd: ['npx', 'tsc', '-p', 'tsconfig.json'], check: (s) => ({ ok: true, key: `${(s.match(/error TS\d+/g) ?? []).length} 個錯誤` }) },
  { id: 'tsc-toddler', name: '型別檢查（三歲測試）', cmd: ['npx', 'tsc', '-p', 'tests/toddler/tsconfig.json'], check: (s) => ({ ok: true, key: `${(s.match(/error TS\d+/g) ?? []).length} 個錯誤` }) },
  { id: 'test-growth', name: '單元：成長系統', cmd: ['npx', 'tsx', 'scripts/test-growth.ts'], check: unit },
  { id: 'test-ladder', name: '單元：支線與階梯', cmd: ['npx', 'tsx', 'scripts/test-ladder.ts'], check: unit },
  { id: 'test-reset-cloud', name: '單元：重置的雲端刪除', cmd: ['npx', 'tsx', 'scripts/test-reset-cloud.ts'], check: unit },
  {
    id: 'sim-teach',
    name: '不教不考（sim-teach）',
    cmd: ['npx', 'tsx', 'scripts/sim-teach.ts'],
    check: (s) => {
      const n = num(/沒教就考 (\d+) 題/, s)
      return { ok: n === '0', key: n == null ? '找不到「沒教就考 N 題」' : `沒教就考 ${n} 題` }
    },
  },
  { id: 'sim-tracks', name: '主線排課（sim-tracks）', cmd: ['npx', 'tsx', 'scripts/sim-tracks.ts'], check: (s) => ({ ok: true, key: (/自己答題數：\s*(.+)/.exec(s)?.[1] ?? '').trim() }) },
  {
    id: 'sim-themes',
    name: '主題冒險（sim-themes）',
    cmd: ['npx', 'tsx', 'scripts/sim-themes.ts'],
    check: (s) => {
      const n = num(/與 planDay 不同的天數 (\d+)/, s)
      return { ok: n === '0', key: `排課不同 ${n ?? '?'} 天、主題 6 天內重複 ${num(/6 天內重複的主題：(\d+)/, s) ?? '?'} 次` }
    },
  },
  {
    id: 'sim-growth',
    name: '成長模擬（sim-growth）',
    // 結果寫到暫存資料夾（預設會寫 docs/成長模擬）
    cmd: ['npx', 'tsx', 'scripts/sim-growth.ts', `--out=${path.join(tmp, '成長模擬')}`],
    check: (s) => {
      const v = [...s.matchAll(/違規 (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0)
      const pass = /斷言：全部通過/.test(s)
      return { ok: pass && v === 0, key: `${pass ? '斷言全部通過' : '斷言沒有全部通過'}、違規 ${v}` }
    },
  },
  {
    id: 'check-story-builtin',
    name: '故事檢查（--builtin）',
    cmd: ['npx', 'tsx', 'scripts/check-story.ts', '--builtin'],
    check: (s) => ({ ok: /全部合格/.test(s), key: `${(s.match(/^✓/gm) ?? []).length} 份合格${/全部合格/.test(s) ? '' : `，${(s.match(/^✗/gm) ?? []).length} 份不合格`}` }),
  },
  {
    id: 'check-story-fixtures',
    name: '故事檢查（--fixtures）',
    cmd: ['npx', 'tsx', 'scripts/check-story.ts', '--fixtures'],
    check: (s) => ({ ok: /全部合格/.test(s), key: `壞劇本擋下 ${(s.match(/^✓ 擋下/gm) ?? []).length}/${num(/故意寫壞的劇本（(\d+) 份/, s) ?? '?'}、示範 ${(s.match(/^✓ 手寫/gm) ?? []).length} 份合格` }),
  },
  { id: 'check-story-themes', name: '故事資料（check-story-themes）', cmd: ['npx', 'tsx', 'scripts/check-story-themes.ts'], check: (s) => ({ ok: /全部通過/.test(s), key: (/^(通用章節：[^（]*)/m.exec(s)?.[1] ?? '').trim() }) },
  {
    id: 'audio',
    name: '音檔（npm run audio 的檢查模式）',
    // extract-phrases --check 把清單印到 stdout、gen_audio.py --check 從 stdin 讀：兩邊都不寫檔
    cmd: ['node', 'scripts/verify.mjs', '--audio-check'],
    check: (s) => {
      const m = /missing (\d+), untimed (\d+), stale (\d+)/.exec(s)
      // worktree 沒有 .env.local：孩子的名字變成預設的 buddy，台詞跟音檔對不上（從主 repo 複製一份，不進 git）
      const env = fs.existsSync(path.join(root, '.env.local')) ? '' : '；這個資料夾沒有 .env.local，名字變成 buddy，從主 repo 複製一份'
      return { ok: !!m && m[1] === '0' && m[2] === '0', key: m ? `缺 ${m[1]}、沒時間軸 ${m[2]}（多出來的舊檔 ${m[3]}）${m[1] !== '0' ? env : ''}` : '沒有結果' }
    },
  },
]

// 音檔檢查：兩個程式接起來（Windows 的 shell 管線不好處理中文輸出，自己接）
if (args.includes('--audio-check')) {
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' }
  const ex = spawn('npx', ['tsx', 'scripts/extract-phrases.ts', '--check'], { cwd: root, env, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'inherit'] })
  const py = spawn('python', ['scripts/gen_audio.py', '--check', '--lines', '-'], { cwd: root, env, stdio: ['pipe', 'inherit', 'inherit'] })
  ex.stdout.pipe(py.stdin)
  const [a, b] = await Promise.all([new Promise((r) => ex.on('exit', r)), new Promise((r) => py.on('exit', r))])
  process.exit(a || b ? 1 : 0)
}

fs.mkdirSync(logDir, { recursive: true })
fs.mkdirSync(tmp, { recursive: true })

function runOne(c) {
  return new Promise((res) => {
    const t = Date.now()
    const p = spawn(c.cmd[0], c.cmd.slice(1).map(q), { cwd: root, env: { ...process.env, PYTHONIOENCODING: 'utf-8', FORCE_COLOR: '0' }, shell: process.platform === 'win32' })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('exit', (code) => {
      const sec = Math.round((Date.now() - t) / 1000)
      fs.writeFileSync(path.join(logDir, `${c.id}.log`), out)
      let r
      try {
        r = c.check(out, code)
      } catch (e) {
        r = { ok: false, key: `看不懂輸出：${e.message}` }
      }
      const ok = code === 0 && r.ok
      console.log(`${ok ? '✓' : '✗'} ${c.name}（${sec} 秒）${r.key ? `：${r.key}` : ''}`)
      res({ ...c, ok, code, key: r.key + (code !== 0 && r.ok ? `（exit ${code}）` : ''), sec, out })
    })
  })
}

const t0 = Date.now()
const todo = CHECKS.filter((c) => !only || only.includes(c.id))
// 全部一起跑：最久的是成長模擬（3～4 分鐘），其他都在半分鐘內；同時跑的數量留一半 CPU 給別的工作階段
const limit = Math.max(4, Math.floor((os.availableParallelism?.() ?? os.cpus().length) * 0.75))
console.log(`驗收：${todo.length} 項，最多 ${limit} 項同時跑…\n`)
const results = []
const queue = [...todo]
await Promise.all(
  Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) results.push(await runOne(queue.shift()))
  }),
)
results.sort((a, b) => todo.findIndex((c) => c.id === a.id) - todo.findIndex((c) => c.id === b.id))
const checkSec = Math.round((Date.now() - t0) / 1000)

// 三歲測試（--with-toddler）：排在最後、獨占 CPU（自己也會排隊）
if (toddlerArgs) {
  const t = Date.now()
  const out = path.join(root, 'test-results', 'toddler')
  const outArg = toddlerArgs.includes('--out-dir') ? path.resolve(toddlerArgs[toddlerArgs.indexOf('--out-dir') + 1]) : out
  console.log(`\n三歲測試：npm run test:toddler -- ${toddlerArgs.join(' ')}\n`)
  const code = await new Promise((res) => {
    const p = spawn('node', ['tests/toddler/run.mjs', ...toddlerArgs].map(q), { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
    p.on('exit', (c) => res(c ?? 1))
  })
  let key = ''
  try {
    const rep = fs.readFileSync(path.join(outArg, 'report.md'), 'utf8')
    const n = /問題共 \*\*(\d+)\*\* 種/.exec(rep)?.[1]
    const rp = /每次都重現 \| \*\*(\d+)\*\*/.exec(rep)?.[1]
    const fl = /偶發 \| \*\*(\d+)\*\*/.exec(rep)?.[1]
    key = `問題 ${n ?? 0} 種${rp != null ? `（每次都重現 ${rp}、偶發 ${fl}）` : ''}；報告 ${path.relative(root, path.join(outArg, 'report.md'))}`
  } catch {
    key = code === 0 ? '' : '沒有報告'
  }
  results.push({ id: 'toddler', name: '三歲模擬測試', ok: code === 0, code, key, sec: Math.round((Date.now() - t) / 1000) })
}

// ── 表 ────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok)
const L = ['| 項目 | 結果 | 關鍵數字 | 秒 |', '|---|:-:|---|--:|']
for (const r of results) L.push(`| ${r.name} | ${r.ok ? '通過' : '**失敗**'} | ${String(r.key ?? '').replace(/\|/g, '｜')} | ${r.sec} |`)
const total = Math.round((Date.now() - t0) / 1000)
L.push('', `${failed.length ? `**${failed.length} 項失敗**` : '全部通過'}。檢查 ${checkSec} 秒（平行跑；一項一項跑要 ${results.filter((r) => r.id !== 'toddler').reduce((a, r) => a + r.sec, 0)} 秒）${toddlerArgs ? `、加三歲測試共 ${total} 秒` : ''}。完整輸出在 test-results/verify/。`)
const table = L.join('\n')
fs.writeFileSync(path.join(logDir, 'verify.md'), `# 驗收結果\n\n${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n\n${table}\n`)
console.log(`\n${table}\n`)
for (const r of failed.filter((r) => r.out)) console.log(`── ${r.name} 的最後幾行（完整：test-results/verify/${r.id}.log）\n${r.out.trim().split('\n').slice(-12).join('\n')}\n`)
// 暫存資料夾（成長模擬的結果）：不用留
try {
  for (const f of fs.readdirSync(tmp, { recursive: true }).reverse()) {
    const p = path.join(tmp, f)
    fs.statSync(p).isDirectory() ? fs.rmdirSync(p) : fs.unlinkSync(p)
  }
  fs.rmdirSync(tmp)
} catch {
  /* 留著也沒關係 */
}
process.exit(failed.length ? 1 : 0)
