#!/usr/bin/env node
// 交接模式（--brain relay）的另一頭：讓一個 Claude Code 工作階段（或它的子代理）扮演小男生。
//
//   node tests/ai-toddler/relay.mjs next [報告資料夾|latest]
//       等下一題（最多 100 秒），印出：題號、截圖路徑、題目、角色設定檔。測試結束了就印「DONE」。
//   node tests/ai-toddler/relay.mjs answer <報告資料夾|latest> <題號>  <<'EOF'
//   {"see": "...", "think": "...", ...}
//   EOF
//       從 stdin 讀答案（一個 JSON）寫回去，接著等下一題並印出來（每一步只要兩個動作：看截圖、回答）。
//
// 「latest」= 主 repo docs/AI小男生測試/ 底下最新、還在跑的那一個。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [cmd, dirArg = 'latest', id] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function mainRepo() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' })
  return r.status === 0 ? path.dirname(r.stdout.trim()) : root
}
function resolveDir(a) {
  if (a !== 'latest') return path.resolve(a)
  const base = path.join(mainRepo(), 'docs', 'AI小男生測試')
  const ds = fs.existsSync(base)
    ? fs
        .readdirSync(base)
        .map((d) => path.join(base, d))
        .filter((d) => fs.existsSync(path.join(d, 'brain')))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : []
  return ds[0] ?? null
}
const dir = resolveDir(dirArg)
if (!dir) {
  console.log('還沒有在跑的 AI 小男生測試（先開：npm run test:ai-toddler -- --lesson zh --brain relay）')
  process.exit(1)
}
const relay = path.join(dir, 'relay')

async function readStdin() {
  let s = ''
  for await (const c of process.stdin) s += c
  return s
}

async function next(timeoutMs = 100_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (fs.existsSync(path.join(dir, 'run.json'))) {
      console.log(`DONE：測試結束了，報告在 ${path.join(dir, '報告.md')}`)
      return
    }
    const open = (fs.existsSync(relay) ? fs.readdirSync(relay) : [])
      .filter((f) => /^req-.+\.json$/.test(f))
      .filter((f) => !fs.existsSync(path.join(relay, f.replace(/^req-/, 'res-'))))
      .sort()
    if (open.length) {
      const q = JSON.parse(fs.readFileSync(path.join(relay, open[0]), 'utf8'))
      console.log(`題號：${q.id}`)
      console.log(`角色設定／系統提示（第一次先讀）：${q.system}`)
      if (q.image) console.log(`截圖（用 Read 讀）：${q.image}`)
      console.log(`回答：node tests/ai-toddler/relay.mjs answer "${dir}" ${q.id} <<'EOF'\n{…JSON…}\nEOF`)
      console.log('──────── 題目 ────────')
      console.log(q.text)
      return
    }
    await sleep(300)
  }
  console.log('WAIT：100 秒內沒有新題目（App 可能在轉場或測試在收尾），再跑一次 next')
}

if (cmd === 'next') await next()
else if (cmd === 'answer') {
  if (!id) {
    console.log('要題號：relay.mjs answer <資料夾> <題號>')
    process.exit(2)
  }
  const body = (await readStdin()).trim()
  fs.writeFileSync(path.join(relay, `res-${id}.json`), body)
  console.log(`已回答 ${id}\n`)
  await next()
} else {
  console.log('用法：relay.mjs next [資料夾|latest]｜relay.mjs answer <資料夾|latest> <題號> < 答案.json')
  process.exit(2)
}
