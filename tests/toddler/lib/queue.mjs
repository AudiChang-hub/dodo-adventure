// 三歲測試的機器層級排隊（T-72）：同一台機器上好幾個 worktree 同時跑三歲測試會互相搶 CPU，時間變長、偶發也變多。
// 用 %TEMP%\dodo-toddler 底下的檔案排隊：
//   lock.json          現在在跑的那一個（pid、worktree、分支、開始時間、指令）
//   queue/<時間>-<pid>.json  排隊中的；最早來的、而且主人還活著的那一個才能拿鎖
// 主人已經結束（pid 不在了）的鎖和排隊號碼會被清掉。目錄可以用 TODDLER_LOCK_DIR 換。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const lockDir = () => process.env.TODDLER_LOCK_DIR || path.join(os.tmpdir(), 'dodo-toddler')
const lockFile = () => path.join(lockDir(), 'lock.json')
const queueDir = () => path.join(lockDir(), 'queue')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** pid 還在不在（Windows 也可以用 signal 0 測） */
export function alive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

const read = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return null
  }
}
const rm = (f) => {
  try {
    fs.unlinkSync(f)
  } catch {
    /* 別人先刪了 */
  }
}

/** 現在的鎖（主人已經結束就清掉，回傳 null） */
export function holder() {
  const h = read(lockFile())
  if (!h) {
    // 寫到一半（剛建立、還沒寫內容）：當作有人，下一輪再看；超過 10 秒還是壞的就是寫的人當掉了，清掉
    let st = null
    try {
      st = fs.statSync(lockFile())
    } catch {
      return null
    }
    if (Date.now() - st.mtimeMs > 10_000) {
      rm(lockFile())
      return null
    }
    return { pid: 0, partial: true }
  }
  if (!alive(h.pid)) {
    rm(lockFile())
    return null
  }
  return h
}

/** 排隊中的（清掉主人已經結束的），依來的順序 */
export function waiting() {
  let fs_ = []
  try {
    fs_ = fs.readdirSync(queueDir()).filter((f) => f.endsWith('.json')).sort()
  } catch {
    return []
  }
  const out = []
  for (const f of fs_) {
    const q = read(path.join(queueDir(), f))
    if (!q || !alive(q.pid)) rm(path.join(queueDir(), f))
    else out.push({ ...q, file: f })
  }
  return out
}

const mins = (t) => ((Date.now() - t) / 60000).toFixed(1)
const who = (h) => `${h.worktree ?? '?'}（${h.branch ?? '?'}，pid ${h.pid}，已經跑 ${mins(h.started)} 分鐘：${h.cmd ?? ''}）`

/**
 * 排隊拿鎖；拿到後回傳 { release, waitedMs, queuedBehind }。
 * 等的時候每 30 秒印一次在等誰。程式結束（含 Ctrl+C）時自動放掉。
 */
export async function acquire(info) {
  fs.mkdirSync(queueDir(), { recursive: true })
  const me = { pid: process.pid, started: Date.now(), ...info }
  const ticket = path.join(queueDir(), `${String(Date.now()).padStart(15, '0')}-${process.pid}.json`)
  fs.writeFileSync(ticket, JSON.stringify(me))
  const leave = () => rm(ticket)
  process.on('exit', leave)
  const t0 = Date.now()
  let lastSay = 0
  let queuedBehind = 0
  for (;;) {
    const h = holder()
    const q = waiting()
    const first = q[0]?.pid === process.pid
    if (!h && first) {
      try {
        // wx：檔案已經存在就失敗（兩個人同時搶，只有一個成功）
        fs.writeFileSync(lockFile(), JSON.stringify({ ...me, started: Date.now() }), { flag: 'wx' })
        break
      } catch {
        /* 別人搶到了 */
      }
    }
    queuedBehind = Math.max(queuedBehind, (h ? 1 : 0) + q.findIndex((x) => x.pid === process.pid))
    if (Date.now() - lastSay > 30_000) {
      lastSay = Date.now()
      const ahead = q.slice(0, Math.max(0, q.findIndex((x) => x.pid === process.pid)))
      console.log(`[排隊] 等其他 worktree 的三歲測試跑完（已經等 ${mins(t0)} 分鐘）`)
      if (h && !h.partial) console.log(`  正在跑：${who(h)}`)
      for (const a of ahead) console.log(`  排在前面：${a.worktree ?? '?'}（${a.branch ?? '?'}，pid ${a.pid}，${a.cmd ?? ''}）`)
      console.log(`  （不想等可以加 --no-lock；鎖在 ${lockFile()}）`)
    }
    await sleep(2000)
  }
  leave()
  const release = () => {
    const h = read(lockFile())
    if (h?.pid === process.pid) rm(lockFile())
  }
  process.on('exit', release)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(sig, () => {
      release()
      process.exit(130)
    })
  return { release, waitedMs: Date.now() - t0, queuedBehind }
}

/** 整台機器現在多忙：取樣 ms 毫秒的 CPU 使用率（0～1） */
export async function cpuBusy(ms = 1500) {
  const snap = () => os.cpus().reduce((a, c) => ({ idle: a.idle + c.times.idle, total: a.total + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }), { idle: 0, total: 0 })
  const a = snap()
  await sleep(ms)
  const b = snap()
  return 1 - (b.idle - a.idle) / Math.max(1, b.total - a.total)
}

/**
 * 預設 workers：一個瀏覽器（Chromium 渲染＋語音計時）大約吃 2 核。
 * 單獨跑（拿到鎖）：可用的核數 ÷ 2，最多 6；沒有排隊（--no-lock）時不知道別人在跑什麼，最多 4。
 * 可用的核數 = 總核數 × (1 − 現在的 CPU 使用率)，所以別的工作階段在打包、跑模擬時會自動少開。
 * 上限 6 不是 8（T-72 實測，16 核）：8 個時 CPU 到 93～100%，第一輪有問題的項目從 3 項變 6 項（多的 3 項都是 1/3 偶發的墨跡）；
 * 4 個時 CPU 平均 29%。見 docs/開發效率/。
 */
export function autoWorkers({ cpus, busy, locked }) {
  const free = cpus * (1 - busy)
  const cap = locked ? 6 : 4
  return Math.max(2, Math.min(cap, Math.floor(free / 2)))
}
