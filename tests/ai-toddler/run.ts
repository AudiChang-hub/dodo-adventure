#!/usr/bin/env tsx
// AI 小男生測試：npm run test:ai-toddler -- --lesson zh [選項]
//
// 由 Claude 扮演 3 歲 3 個月的台灣小男生（角色設定 tests/ai-toddler/persona.md），看平板截圖、聽語音，
// 自己決定下一步（點哪裡、拖、等、返回、不玩了）。手指誤差在 lib/finger.ts 套上。
// 跟 npm run test:toddler（固定腳本的回歸測試）不一樣：這個是「真的孩子看得懂嗎」的探索測試。
//
//   --lesson ID       en（英文字母）zh（中文課文）math（數學數字）draw（畫畫）story（故事）；必填
//   --minutes N       最多玩幾分鐘（預設 8，含大腦想的時間）
//   --max-steps N     最多幾步（預設 60）
//   --seed N          手指誤差和 App 題目的亂數（預設 1；同一個 seed 手指偏法、題目一樣，大腦的回答不一定）
//   --brain KIND      auto（預設：有 ANTHROPIC_API_KEY 用 api，否則 cli）、api、cli（claude -p）、relay（交接模式，見 README）
//   --model ID        預設 claude-sonnet-5-5
//   --dev             用 vite dev server（預設用打包版 vite preview；dist 不在才打包）
//   --build           先重新打包
//   --headed          開看得到的瀏覽器（喇叭會出聲）
//   --out DIR         報告放這裡（預設主 repo 的 docs/AI小男生測試/<日期>-<課>/）
//   --no-lock         不跟 test:toddler 排隊（預設同一台機器同時只跑一個）
//   --fresh           故事：新裝置（書架上什麼都沒有）；預設是已經聽過 8 本的舊裝置
//   --zh-run N        中文課：今天是同一篇的第幾次（1～3，預設 1；2 是念到框起來的紅字前停下來讓孩子接）
//                     中文課是親子共讀（App 不出聲）：每一步之前「媽媽」先做她的部分（念一行、按下一行、問聊一聊、念題目），見 mom()
//   環境變數 AI_TODDLER_PORT：預設 4537
import { chromium, type Page } from '@playwright/test'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { Brain, type Answer, type BrainKind } from './lib/brain'
import { Finger, type Touch } from './lib/finger'
import { ALIASES, LESSONS, doneNow, seedStory } from './lib/lessons'
import { writeReport, type AppIssue, type Step, type Run } from './lib/report'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

// ── 參數 ───────────────────────────────────────────────────
const argv = process.argv.slice(2)
const opt = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : def
}
const flag = (name: string) => argv.includes(`--${name}`)
const lessonArg = opt('lesson') ?? argv.find((a) => !a.startsWith('--') && (LESSONS[a] || ALIASES[a]))
const lesson = lessonArg ? LESSONS[lessonArg] ?? LESSONS[ALIASES[lessonArg]] : undefined
if (!lesson) {
  console.log(`要指定哪一課：--lesson ${Object.keys(LESSONS).join('|')}`)
  process.exit(2)
}
const MINUTES = Number(opt('minutes', '8'))
const MAX_STEPS = Number(opt('max-steps', '60'))
const SEED = Number(opt('seed', '1'))
const MODEL = opt('model', 'claude-sonnet-5-5')!
const BRAIN = opt('brain', 'auto') as 'auto' | BrainKind
const PORT = Number(process.env.AI_TODDLER_PORT || 4537)
const VP = { width: 1280, height: 800 }

// 報告寫到主 repo（不是 worktree）：worktree 只有 gitignored 的檔案時會被自動刪掉
function mainRepo() {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' })
  return r.status === 0 ? path.dirname(r.stdout.trim()) : root
}
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
function outDir() {
  const o = opt('out')
  if (o) return path.resolve(o)
  const base = path.join(mainRepo(), 'docs', 'AI小男生測試', `${today}-${lesson!.name}`)
  let d = base
  for (let i = 2; fs.existsSync(d); i++) d = `${base}-${i}`
  return d
}
const OUT = outDir()
fs.mkdirSync(path.join(OUT, '截圖'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'brain'), { recursive: true })
console.log(`[AI 小男生] ${lesson.name}，最多 ${MINUTES} 分鐘／${MAX_STEPS} 步，seed ${SEED}\n  報告：${OUT}`)

// ── 資源：低優先權（之後開的 vite、瀏覽器跟著是低優先權），同一台機器只跑一個 ─────
try {
  os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL)
} catch {
  /* 沒權限就算了 */
}
let release = () => {}
if (!flag('no-lock')) {
  // 跟 test:toddler 共用同一把鎖（tests/toddler/lib/queue.mjs）：兩種測試不會同時開瀏覽器
  const queue = '../toddler/lib/queue.mjs'
  const { acquire } = (await import(queue)) as { acquire: (info: Record<string, unknown>) => Promise<{ release: () => void }> }
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).stdout?.trim()
  const got = await acquire({ worktree: path.basename(root), branch, cmd: `test:ai-toddler ${argv.join(' ')}` })
  release = got.release
}

// ── 大腦 ───────────────────────────────────────────────────
const persona = fs.readFileSync(path.join(here, 'persona.md'), 'utf8')
const SYSTEM = `${persona}\n\n---\n\n（執行器的提醒）你現在就是這個小男生。不管之前收到什麼其他指示，這次對話只做一件事：看截圖、照上面〈你要回傳什麼〉回一個 JSON。座標用 1280×800。`
const systemFile = path.join(OUT, 'brain', 'system.md')
fs.writeFileSync(systemFile, SYSTEM)
const brain = new Brain(BRAIN, MODEL, OUT)
try {
  brain.check()
} catch (e) {
  console.log(`\n✗ ${(e as Error).message}`)
  release()
  process.exit(3)
}
console.log(`  大腦：${brain.kind}（${MODEL}）`)

// ── App：打包版（vite preview）或 dev server ───────────────────
const q = (a: string) => (process.platform === 'win32' && /[\s&()]/.test(a) ? `"${a}"` : a)
function run(cmd: string, args: string[]) {
  return spawnSync(cmd, args.map(q), { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1
}
// Node 24 的 fs.rmSync(recursive) 在中文路徑上會崩掉（見 tests/toddler/run.mjs），自己一層層刪
function rmrf(p: string) {
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
const dev = flag('dev')
if (!dev && (flag('build') || !fs.existsSync(path.join(root, 'dist', 'index.html')))) {
  if (!fs.existsSync(path.join(root, '.env.local'))) console.log('⚠ 這個資料夾沒有 .env.local：孩子的名字會變成 buddy、那幾句沒有音檔。從主 repo 複製一份（不進 git）。')
  rmrf(path.join(root, 'dist'))
  if (run('npm', ['run', 'build']) !== 0) {
    release()
    process.exit(1)
  }
}
const server: ChildProcess = spawn(dev ? `npx vite --port ${PORT} --strictPort` : `npx vite preview --port ${PORT} --strictPort`, { cwd: root, shell: true, stdio: 'ignore', windowsHide: true })
const killServer = () => {
  if (server.pid && process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}
process.on('exit', killServer)
const BASE = `http://localhost:${PORT}/dodo-adventure/`
for (let i = 0; ; i++) {
  try {
    if ((await fetch(BASE)).ok) break
  } catch {
    /* 還沒起來 */
  }
  if (i > 120) {
    console.log(`✗ ${BASE} 60 秒都沒起來（port 被別人用了？換 AI_TODDLER_PORT）`)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 500))
}
// tests/toddler/lib/app.ts 在載入時讀 TODDLER_PORT：設好再載
process.env.TODDLER_PORT = String(PORT)
const { boot, settle, snap, attempts } = await import('../toddler/lib/app')

// ── 開平板 ─────────────────────────────────────────────────
const version = (() => {
  const head = spawnSync('git', ['log', '-1', '--format=%h %s'], { cwd: root, encoding: 'utf8' }).stdout.trim()
  const dirty = spawnSync('git', ['status', '--porcelain', '--', 'src'], { cwd: root, encoding: 'utf8' }).stdout.trim()
  return head + (dirty ? '（src 有未提交的改動）' : '')
})()
const browser = await chromium.launch({ headless: !flag('headed'), args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] })
const ctx = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: false, serviceWorkers: 'block', locale: 'zh-TW', timezoneId: 'Asia/Taipei' })
const page: Page = await ctx.newPage()
const consoleErrors: { t: number; msg: string }[] = []
const t0 = Date.now()
const sec = () => Math.round((Date.now() - t0) / 100) / 10
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push({ t: sec(), msg: m.text().slice(0, 300) })
})
page.on('pageerror', (e) => consoleErrors.push({ t: sec(), msg: `pageerror: ${String(e.message).slice(0, 300)}` }))

const issues: AppIssue[] = []
const steps: Step[] = []
const R: Run = {
  lesson: lesson.name,
  lessonId: lesson.id,
  doneMeans: lesson.doneMeans,
  seed: SEED,
  model: MODEL,
  brain: brain.kind,
  version,
  started: new Date().toISOString(),
  minutes: MINUTES,
  maxSteps: MAX_STEPS,
  out: OUT,
  steps,
  issues,
  consoleErrors,
  completed: null,
  endReason: '',
  tapsWhileTeaching: 0,
  tapsTotal: 0,
}

// ── 聽到的話：哪一個音檔開始播（heard.js）→ 對照文字 ─────────────────────
// Node 這邊用 public/audio 的 timings.json（英文逐字）、zh/index.json（單字三明治的中文）對照成文字。中文課文 2026-11-03 起不出聲。
await page.addInitScript({ path: path.join(here, 'heard.js') })
const clipText = (() => {
  const dir = path.join(root, 'public', 'audio')
  const read = (f: string) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    } catch {
      return {}
    }
  }
  const en = read('timings.json') as Record<string, [number, number, string][]>
  const zh = read('zh/index.json') as Record<string, string>
  return (name: string) => {
    const [folder, file] = name.includes('/') ? [name.slice(0, name.lastIndexOf('/')), name.slice(name.lastIndexOf('/') + 1)] : ['', name]
    if (folder === 'zh') return zh[file] ?? null
    return en[file]?.map((x) => x[2]).join(' ') ?? null
  }
})()

let finger!: Finger
let fatal: string | null = null
try {
  await boot(page, SEED, { to: 'home', settings: lesson.id === 'story' ? { story: true } : {} })
  // 故事：預設是舊裝置（書架上已經有 8 本講過的書，今天的新章節照樣先講）；--fresh 是新裝置（什麼都沒有）
  if (lesson.id === 'story' && !flag('fresh')) await seedStory(page)
  // 中文課：第 1 篇已經上過 N-1 次（很久以前），今天是第 N 次（src/lessons/chinese/course.ts 的 Course）
  const zhRun = Number(opt('zh-run', '1'))
  if (lesson.id === 'zh' && zhRun > 1)
    await page.evaluate(
      (runs) =>
        new Promise<void>((res, rej) => {
          const rq = indexedDB.open('dodo-adventure')
          rq.onerror = () => rej(rq.error)
          rq.onsuccess = () => {
            const tx = rq.result.transaction('kv', 'readwrite')
            tx.objectStore('kv').put({ key: 'zhLesson:course', value: { day: 1, runs } })
            tx.objectStore('kv').put({ key: 'zhLesson:done', value: [1] })
            tx.oncomplete = () => (rq.result.close(), res())
            tx.onerror = () => rej(tx.error)
          }
        }),
      ['2026-01-01', '2026-01-02'].slice(0, Math.min(2, zhRun - 1)),
    )
  await settle(page)
  finger = new Finger(page, SEED, VP)
  await finger.init()
  // 爸爸媽媽幫他點開那一課（不算在小男生的動作裡，也不套誤差）
  const door = await page.evaluate((d) => {
    const el = document.querySelector(`.door[data-door="${d}"], .side-door[data-door="${d}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, lesson.door)
  if (!door) throw new Error(`首頁找不到「${lesson.name}」的門（data-door=${lesson.door}）`)
  let inside = false
  for (let i = 0; i < 3 && !inside; i++) {
    await page.touchscreen.tap(door.x, door.y)
    for (let k = 0; k < 30 && !inside; k++) {
      await page.waitForTimeout(200)
      inside = lesson.isIn((await snap(page)).live)
    }
  }
  if (!inside) throw new Error(`點「${lesson.name}」的門沒有進去（停在 ${(await snap(page)).live}）`)
  // 等轉場淡入走完再開始（不然第一張截圖是空白的，小男生會以為畫面壞了）
  await settle(page, 5000)
} catch (e) {
  fatal = `開始之前就失敗：${(e as Error).message}`
}

// ── 每一步 ─────────────────────────────────────────────────
/** 尺：四邊的刻度（給大腦估座標，報告用的截圖沒有） */
const RULER = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${VP.width}" height="${VP.height}">` +
    Array.from({ length: VP.width / 50 + 1 }, (_, i) => i * 50)
      .map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="${x % 100 ? 6 : 12}" stroke="#666" stroke-opacity=".7"/><line x1="${x}" y1="${VP.height}" x2="${x}" y2="${VP.height - (x % 100 ? 6 : 12)}" stroke="#666" stroke-opacity=".7"/>` + (x % 100 || !x || x === VP.width ? '' : `<text x="${x}" y="24" font-size="11" font-family="Arial" text-anchor="middle" fill="#555" fill-opacity=".8">${x}</text><text x="${x}" y="${VP.height - 16}" font-size="11" font-family="Arial" text-anchor="middle" fill="#555" fill-opacity=".8">${x}</text>`))
      .join('') +
    Array.from({ length: VP.height / 50 + 1 }, (_, i) => i * 50)
      .map((y) => `<line x1="0" y1="${y}" x2="${y % 100 ? 6 : 12}" y2="${y}" stroke="#666" stroke-opacity=".7"/><line x1="${VP.width}" y1="${y}" x2="${VP.width - (y % 100 ? 6 : 12)}" y2="${y}" stroke="#666" stroke-opacity=".7"/>` + (y % 100 || !y || y === VP.height ? '' : `<text x="16" y="${y + 4}" font-size="11" font-family="Arial" fill="#555" fill-opacity=".8">${y}</text><text x="${VP.width - 16}" y="${y + 4}" font-size="11" font-family="Arial" text-anchor="end" fill="#555" fill-opacity=".8">${y}</text>`))
      .join('') +
    `</svg>`,
)

const FEEL: Record<string, string> = { happy: '開心', curious: '好奇', confused: '看不懂', bored: '無聊', frustrated: '挫折', excited: '興奮' }
const pad = (n: number) => String(n).padStart(3, '0')
/** 探針看到的狀態：語音、DOM 變動、回應、音效、錯誤、閃動 */
const probe = () =>
  page.evaluate(() => {
    const T = window.__toddler as unknown as { voices: { t: number; end: number; text: string | null; stopped: number | null }[]; mut: number; lastMut: number; resp: number; sfx: number; errors: { msg: string }[]; episodes: { kind: string; frames: number; worst: number; peak: number; key: string; route: string }[]; taps: { kind: string | null }[] }
    const n = performance.now()
    const sub = document.querySelector('.sub-pill .sub-text')?.textContent?.replace(/\s+/g, ' ').trim() || null
    const H = (window as unknown as { __heard: { t: number; name: string }[] }).__heard ?? []
    return {
      heard: H.length,
      heardNames: H.map((h) => h.name),
      now: n,
      voices: T.voices.map((v) => ({ t: v.t, text: v.text })),
      speaking: T.voices.some((v) => v.stopped == null && v.end > n),
      sub,
      mut: T.mut,
      lastMut: T.lastMut,
      resp: T.resp,
      sfx: T.sfx,
      errors: T.errors.splice(0).map((e) => e.msg),
      episodes: T.episodes.splice(0).map((e) => ({ kind: e.kind, frames: e.frames, worst: e.worst, peak: e.peak, key: e.key, route: e.route })),
      taps: T.taps.length,
      tapList: (T.taps as unknown as { t: number; kind: string | null }[]).map((x) => ({ t: x.t, kind: x.kind })),
      tapsTeaching: T.taps.filter((x) => x.kind).length,
    }
  })

type Probe = Awaited<ReturnType<typeof probe>>
/** 畫布上有多少墨（每 6 px 取一點，不透明的點數）：畫畫、描字不會改 DOM，要看畫布才知道有沒有畫出線 */
const ink = () =>
  page
    .evaluate(() => {
      let n = 0
      for (const c of document.querySelectorAll('canvas')) {
        if (!c.width || !c.height) continue
        try {
          const d = c.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, c.width, c.height).data
          if (!d) continue
          const step = 6 * 4 * Math.max(1, Math.round(c.width / c.getBoundingClientRect().width || 1))
          for (let i = 3; i < d.length; i += step) if (d[i] > 40) n++
        } catch {
          /* 被污染的畫布 */
        }
      }
      return n
    })
    .catch(() => 0)
let voiceSeen = 0
let quietSince = Date.now()
const issue = (step: number, kind: AppIssue['kind'], title: string, detail = '') => {
  if (issues.some((i) => i.kind === kind && i.title === title)) {
    issues.find((i) => i.kind === kind && i.title === title)!.steps.push(step)
    return
  }
  issues.push({ kind, title, detail, steps: [step] })
}

/** 一步之後檢查 App 本身：錯誤、閃動、空白、按返回沒回去 */
function checkProbe(n: number, p: Probe) {
  for (const m of p.errors) issue(n, '主控台錯誤', m.slice(0, 160))
  for (const e of p.episodes) {
    if (e.kind === 'opacity-flip' && e.peak >= 2) issue(n, '閃動', `「${e.key}」透明度來回閃 ${e.peak} 次`, e.route)
    else if (e.kind === 'blank' && e.worst < 0.5 && e.frames >= 4) issue(n, '閃動', `畫面一半以上變空白（${e.frames} 格）`, e.route)
    else if (e.kind === 'no-scene') issue(n, '卡住', '畫面整個空白（#root 沒有東西）', e.route)
  }
}

const history: string[] = []
let lastTouch: Touch | null = null
let lastResult = ''
let doneAt: number | null = null
/** 上一步在畫布上畫出線了（畫畫不改 DOM：算畫面有動，不要誤報「很久沒動」） */
let inkedLast = false
let confusedRun = 0

/** 上一步之後開始播的語音（對照成文字；對照不到的寫音檔名字） */
function describeHeard(p: Probe) {
  const fresh = p.heardNames.slice(voiceSeen).map((name) => clipText(name) ?? `（一段聲音 ${name}）`)
  voiceSeen = p.heard
  return fresh.filter((t, i) => t !== fresh[i - 1])
}

// ── 中文課（親子共讀）：媽媽坐在旁邊念 ─────────────────────────
// 每一步之前媽媽做一件事：說明卡按「開始念」、念亮的那一行（下一步再按「下一行」）、聊一聊問卡片上的問題（下一步按「去選圖」）、
// 念選圖的題目。她念的話寫進小男生「聽到的」，小男生自己決定要不要點。
const momDone = new Set<string>()
async function mom(): Promise<string> {
  // 這段在瀏覽器裡跑：不能在裡面宣告具名的函式（tsx 會加 __name，瀏覽器裡沒有）
  const st = await page.evaluate(() => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    const pt: Record<string, { x: number; y: number } | null> = {}
    for (const [k, sel] of [['intro', '.zh-intro .zh-go'], ['talk', '.zh-talk .zh-go'], ['next', '.zh-controls.on .zh-next']]) {
      const r = root.querySelector<HTMLElement>(sel)?.getBoundingClientRect()
      pt[k] = r && r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
    }
    const read = root.querySelector<HTMLElement>('.zh-read')
    return {
      intro: pt.intro,
      talk: pt.talk,
      talkQ: [...root.querySelectorAll('.zh-talk-q')].map((e) => e.textContent ?? '').join(''),
      next: pt.next,
      at: read?.dataset.at ?? null,
      line: root.querySelector('.zh-line.on .zh-text')?.textContent ?? '',
      gap: root.querySelector('.zh-line.on .zh-red.gap')?.getAttribute('data-word') ?? null,
      ask: root.querySelector('.zh-ask-word')?.textContent ?? null,
    }
  })
  const click = async (pt: { x: number; y: number }) => {
    await page.mouse.click(pt.x, pt.y)
    await page.waitForTimeout(900)
  }
  if (st.intro) {
    await click(st.intro)
    return '媽媽看完大人的說明，說：「我念故事給你聽喔！」'
  }
  if (st.talk) {
    if (!momDone.has(`talk:${st.talkQ}`)) {
      momDone.add(`talk:${st.talkQ}`)
      return `媽媽問你：「${st.talkQ}」，然後看著你等你回答。`
    }
    await click(st.talk)
    return '媽媽說：「我們來選圖！」按了「去選圖」。'
  }
  if (st.ask) {
    if (momDone.has(`ask:${st.ask}`)) return ''
    momDone.add(`ask:${st.ask}`)
    return `媽媽念題目：「哪個是${st.ask}？」`
  }
  if (st.next && st.at != null) {
    const key = `line:${st.at}:${st.line}`
    if (momDone.has(key)) {
      await click(st.next)
      const after = await page.evaluate(() => document.querySelector('.zh-line.on .zh-text')?.textContent ?? '')
      if (!after) return '媽媽念完了，按了「念完了」。'
      momDone.add(`line:${await page.evaluate(() => document.querySelector<HTMLElement>('.zh-read')?.dataset.at ?? '')}:${after}`)
      const gap = await page.evaluate(() => document.querySelector('.zh-line.on .zh-red.gap')?.getAttribute('data-word') ?? null)
      return gap ? `媽媽按了「下一行」，念：「${after.split(gap)[0]}……」念到這裡停下來，看著你等你說。` : `媽媽按了「下一行」，念：「${after}」`
    }
    momDone.add(key)
    return st.gap ? `媽媽指著字念：「${st.line.split(st.gap)[0]}……」念到這裡停下來，看著你等你說。` : `媽媽指著字念：「${st.line}」`
  }
  return ''
}

while (!fatal) {
  const n = steps.length + 1
  const momSaid = lesson.id === 'zh' ? await mom().catch((e) => (console.log(`  媽媽出錯：${(e as Error).message}`), '')) : ''
  if (n > MAX_STEPS) {
    R.endReason = `到了步數上限 ${MAX_STEPS}`
    break
  }
  if (Date.now() - t0 > MINUTES * 60_000) {
    R.endReason = `到了時間上限 ${MINUTES} 分鐘`
    break
  }
  let p: Probe
  let s: Awaited<ReturnType<typeof snap>>
  try {
    p = await probe()
    s = await snap(page)
  } catch (e) {
    fatal = `讀不到頁面（第 ${n} 步）：${(e as Error).message}`
    break
  }
  checkProbe(n, p)
  const heard = describeHeard(p)
  if (heard.length || p.speaking || p.now - p.lastMut < 1500 || inkedLast) quietSince = Date.now()
  const shot = path.join(OUT, '截圖', `${pad(n)}.jpg`)
  const forBrain = path.join(OUT, 'brain', `${pad(n)}.jpg`)
  try {
    const buf = await page.screenshot({ type: 'jpeg', quality: 72, timeout: 8000 })
    fs.writeFileSync(shot, buf)
    await sharp(buf).composite([{ input: RULER }]).jpeg({ quality: 72 }).toFile(forBrain)
  } catch (e) {
    fatal = `截圖失敗（第 ${n} 步）：${(e as Error).message}`
    break
  }
  const quietFor = Math.round((Date.now() - quietSince) / 1000)
  const el = Math.round((Date.now() - t0) / 1000)
  const text = [
    `第 ${n} 步｜你已經玩了 ${Math.floor(el / 60)} 分 ${el % 60} 秒（大概玩 ${MINUTES} 分鐘就要收起來了）。`,
    n === 1 ? `剛剛：${lesson.intro}${lesson.id === 'zh' ? '媽媽坐在你旁邊，平板不會出聲，是媽媽念給你聽。' : '媽媽幫你打開以後就去忙了。'}` : '',
    momSaid,
    heard.length ? `你剛剛聽到：${heard.map((h) => `「${h}」`).join(' ')}` : '你剛剛沒有聽到說話的聲音。',
    p.speaking ? '（現在還在說話）' : '',
    lastTouch ? `你上一步：${lastResult}` : '',
    quietFor >= 15 ? `畫面已經 ${quietFor} 秒沒有動、也沒有聲音了。` : '',
    history.length ? `最近幾步（舊→新）：\n${history.slice(-6).join('\n')}` : '',
    confusedRun >= 2 ? `你已經連續 ${confusedRun} 步不知道要做什麼了。` : '',
    '截圖是你現在看到的平板畫面。你要做什麼？只回 JSON。',
  ]
    .filter(Boolean)
    .join('\n')

  let a: Answer = await brain.ask({ id: pad(n), system: SYSTEM, systemFile, text, image: forBrain })
  if (!a.json && !a.error) a = await brain.ask({ id: `${pad(n)}b`, system: SYSTEM, systemFile, text: `${text}\n\n（上一次的回答不是 JSON，請只回一個 JSON 物件。）`, image: forBrain })
  const j = (a.json ?? {}) as Record<string, any>
  const action = ['tap', 'drag', 'wait', 'back', 'quit'].includes(j.action) ? (j.action as Step['action']) : 'wait'
  const step: Step = {
    n,
    t: el,
    live: s.live,
    teaching: s.teaching,
    heard,
    sub: p.sub,
    shot: path.relative(OUT, shot).replace(/\\/g, '/'),
    see: String(j.see ?? ''),
    think: String(j.think ?? (a.error ? `（大腦沒有回應：${a.error}）` : '')),
    feeling: String(j.feeling ?? ''),
    understood: j.understood === true,
    action,
    x: Number(j.x) || undefined,
    y: Number(j.y) || undefined,
    to: Array.isArray(j.to) ? j.to.filter((p: any) => Number.isFinite(p?.x) && Number.isFinite(p?.y)).slice(0, 16) : undefined,
    times: Math.max(1, Math.min(6, Number(j.times) || 1)),
    seconds: Math.max(1, Math.min(8, Number(j.seconds) || 2)),
    thinkMs: a.ms,
    costUsd: a.costUsd,
    tokens: a.inTokens != null ? { in: a.inTokens, out: a.outTokens ?? 0 } : undefined,
    brainError: a.error,
    result: '',
    events: momSaid ? [`（${momSaid}）`] : [],
  }
  steps.push(step)
  if (a.error) {
    console.log(`  [${pad(n)}] 大腦錯誤：${a.error}`)
    const recent = steps.slice(-3)
    if (recent.length === 3 && recent.every((x) => x.brainError)) {
      fatal = `大腦連續 3 次沒有回應：${a.error}`
      break
    }
  }
  if (step.understood) confusedRun = 0
  else confusedRun++

  // ── 做動作 ──
  const before = { live: s.live, resp: p.resp, sfx: p.sfx, voices: p.voices.length, heard: p.heard, mut: p.mut, ink: action === 'drag' ? await ink() : 0 }
  let touch: Touch | null = null
  try {
    if (action === 'tap' && step.x != null && step.y != null) touch = await finger.tap({ x: step.x, y: step.y }, step.times)
    else if (action === 'drag' && step.x != null && step.y != null) touch = await finger.drag([{ x: step.x, y: step.y }, ...(step.to ?? [])], { drawing: lesson.id === 'draw' })
    else if (action === 'back') touch = await finger.back()
    else if (action === 'wait') await page.waitForTimeout(step.seconds * 1000)
  } catch (e) {
    step.events.push(`動作送不出去：${(e as Error).message}`)
  }
  step.touch = touch ?? undefined
  if (action === 'quit') {
    R.endReason = '小男生說不玩了'
    console.log(`  [${pad(n)}] ${step.think}（不玩了）`)
    break
  }

  // ── 看結果 ──
  await page.waitForTimeout(action === 'wait' ? 300 : 1100)
  let after: Probe
  let s2: Awaited<ReturnType<typeof snap>>
  try {
    after = await probe()
    s2 = await snap(page)
  } catch (e) {
    fatal = `讀不到頁面（第 ${n} 步之後）：${(e as Error).message}`
    break
  }
  checkProbe(n, after)
  const changed = s2.live !== before.live
  const inked = action === 'drag' && touch?.hit === '畫布' ? (await ink()) - before.ink : 0
  const reacted = after.resp > before.resp || after.sfx > before.sfx || after.voices.length > before.voices || after.heard > before.heard
  const backish = action === 'back' || touch?.hit === '返回鍵'
  if (backish && !changed) {
    // 再給 2 秒（轉場慢）
    await page.waitForTimeout(2000)
    const s3 = await snap(page)
    if (s3.live === before.live) issue(n, '無法返回', `${action === 'back' ? 'Android 返回' : '點返回鍵'}之後沒有回上一層（停在 ${s3.live}）`, `點到 ${touch?.got[0] ? `${touch.got[0].x},${touch.got[0].y}` : '—'}；當時 ${s.teaching ?? '沒有在示範'}`)
    else s2 = s3
  }
  // 示範中（按下去那一刻探針看到的狀態）點的，1.5 秒內有沒有被寫成作答紀錄。跟 tests/toddler/lib/flows.ts 的判斷一樣：
  // 只算示範、教學卡、念題目（指著答案的手是一起練，正常）；只算 quiz 的紀錄（teach 是示範自己寫的，guided 是一起練）
  const during = after.tapList.slice(p.taps).filter((x) => x.kind)
  if (during.length) {
    step.events.push(`示範中點了 ${during.length} 下（${[...new Set(during.map((x) => x.kind))].join('、')}）`)
    const early = during.filter((x) => x.kind === 'teach-card' || x.kind === 'demo' || x.kind === 'wait')
    const recs = (await attempts(page).catch(() => [])).filter((r) => r.phase === 'quiz')
    const hit = recs.filter((r) => early.some((x) => r.ts >= x.t - 50 && r.ts - x.t < 1500))
    if (hit.length) issue(n, '誤記作答', `示範中點的被記成作答（${hit.map((r) => `${r.game}/${r.itemId} ${r.ok ? '對' : '錯'}`).join('、')}）`, `按下去那一刻：${during.map((x) => x.kind).join('、')}`)
  }
  if (action === 'tap' && touch && /^按鈕/.test(touch.hit) && !reacted && !changed && !s.teaching) issue(n, '點了沒反應', `點${touch.hit}沒有任何反應（沒有動畫、聲音、換畫面）`, `當時畫面 ${s.live}`)
  const where = touch?.got[0] ? `手指實際點在 (${touch.got[0].x}, ${touch.got[0].y})` : ''
  const what =
    action === 'tap' ? `你點了${step.times > 1 || touch?.times! > 1 ? ` ${touch?.times ?? step.times} 下` : '一下'}` : action === 'drag' ? `你拖了一下${touch?.early ? '（拖到一半手放開了）' : ''}` : action === 'back' ? '你用返回手勢' : `你等了 ${step.seconds} 秒`
  const outcome = s2.live !== before.live ? '畫面換成別的了' : inked > 0 ? `畫出線了${reacted ? '，畫面有動' : ''}` : reacted ? (after.voices.length > before.voices || after.heard > before.heard ? '有聲音、畫面有動' : '畫面有動') : action === 'wait' ? '' : '好像沒有反應'
  lastResult = [what, where, outcome].filter(Boolean).join('，')
  lastTouch = touch
  inkedLast = inked > 0
  step.result = [touch?.hit, s2.live !== before.live ? `→ ${s2.live}` : '', outcome].filter(Boolean).join('；')
  history.push(`- 第 ${n} 步：${step.think || '（沒想什麼）'}（${FEEL[step.feeling] ?? step.feeling}）→ ${what}，${outcome || '沒什麼變'}`)
  console.log(`  [${pad(n)} ${el}s ${(a.ms / 1000).toFixed(0)}s] ${FEEL[step.feeling] ?? step.feeling}「${step.think}」→ ${action}${step.x != null ? ` ${step.x},${step.y}` : ''}｜${step.result}`)

  // ── 完成了嗎 ──
  const d = await doneNow(page)
  if (!R.completed) {
    if (d.lessonEnd) R.completed = { step: n, t: el, what: d.picker ? '出現挑貼紙（上完一堂）' : '出現下課畫面（上完一堂，這堂沒有貼紙）' }
    else if (d.lastPage) R.completed = { step: n, t: el, what: '故事聽到最後一頁' }
    else if (lesson.id === 'draw') {
      const strokes = steps.filter((x) => x.touch?.kind === 'drag' && x.touch.hit === '畫布').length
      if (strokes >= 3) R.completed = { step: n, t: el, what: `畫了 ${strokes} 筆` }
    }
    if (R.completed) {
      doneAt = n
      console.log(`  ✓ 完成：${R.completed.what}`)
    }
  }
  // 上完一堂之後再看 3 步（挑貼紙或下課畫面、回首頁），就收
  if (doneAt && lesson.id !== 'draw' && n - doneAt >= 3) {
    R.endReason = `完成了（${R.completed!.what}），再玩 3 步後結束`
    break
  }
}
if (fatal) {
  R.endReason = fatal
  issue(steps.length, '卡住', fatal)
  console.log(`✗ ${fatal}`)
}
try {
  const p = await probe()
  R.tapsTotal = p.taps
  R.tapsWhileTeaching = p.tapsTeaching
  fs.writeFileSync(path.join(OUT, '截圖', 'last.jpg'), await page.screenshot({ type: 'jpeg', quality: 72 }))
} catch {
  /* 頁面已經壞了 */
}
await browser.close().catch(() => {})
killServer()
R.ended = new Date().toISOString()
R.brainNote = brain.note

// ── 分析（大人的眼光，不是小男生）＋報告 ───────────────────
await writeReport(R, brain, path.join(here, 'analyst.md'))
release()
console.log(`\n報告：${path.join(OUT, '報告.md')}`)
process.exit(0)
