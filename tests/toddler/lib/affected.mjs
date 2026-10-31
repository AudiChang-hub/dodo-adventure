// 只跑受影響的三歲測試（T-72）：npm run test:toddler -- --changed [基準 ref，預設 main]
//
// 依 git diff（基準...HEAD、加上還沒提交的改動和新檔）找出改到哪些檔，再照下面的對照表決定要跑哪幾項。
// 原則：寧可多跑也不要漏跑。看不懂的檔、共用的檔一律退回跑完整版。
//
//   node tests/toddler/lib/affected.mjs [基準 ref]     只印對照結果，不跑測試（檢查對照表用）
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

// ── 對照表 ────────────────────────────────────────────────

/**
 * 共用的檔：改到就跑完整版。
 * src/ui、src/lib、樣式、App、Scenes（ui）、遊戲引擎（src/games 最上層不是某個遊戲的檔）、
 * 每一項測試都會經過的首頁、地圖、站點，以及遊戲清單（content/games.ts、PlayGame）。
 */
export const CORE = [
  [/^src\/(ui|lib|styles|art)\//, 'ui／lib／樣式／圖：每個畫面都用'],
  [/^src\/(App|main)\.tsx$|^src\/globals\.d\.ts$/, 'App 入口'],
  // 遊戲元件本身（ChoiceGame、CountGame…，PlayGame 的 BY_KIND 列的）不算，見 affected() 的 kindFiles
  [/^src\/games\/[^/]+$/, '遊戲引擎（Shell、PlayGame、Teach、Demo、idle…）'],
  [/^src\/screens\/(Home|MapScreen|StationScreen)\.tsx$|^src\/screens\/screens\.css$/, '首頁、地圖、站點：每一項測試都從這裡進出'],
  [/^src\/content\/(games|registry)\.ts$/, '遊戲清單與出題'],
  [/^(index\.html|vite\.config\.ts|package(-lock)?\.json|tsconfig[^/]*\.json)$/, '打包設定'],
  [/^public\//, '音檔、圖示（缺音檔每一項都會報）'],
  [/^tests\/toddler\/(lib\/|probe\.js|playwright\.config\.ts|run\.mjs)/, '三歲測試的共用程式'],
]

/** 不影響三歲測試的檔（不跑） */
export const NONE = [
  [/^docs\//, '文件'],
  [/^scripts\//, '離線腳本（產生的內容會改到 src，會被上面的規則抓到）'],
  [/^tests\/(review|unit)\//, '其他測試'],
  [/^tests\/toddler\/(report\.mjs|report-method\.md|tsconfig\.json)$/, '只影響報告'],
  [/^(README\.md|firestore\.rules|\.gitignore|\.claude\/)/, '說明、雲端規則'],
]

/**
 * 每一項畫面測試會用到的畫面檔（src/screens 底下，不含上面 CORE 的首頁、地圖、站點）和遊戲。
 * games: 'any' 是玩今日冒險排到的遊戲（App 依日期、seed 排，事先不知道是哪一個）：任何遊戲改了都要跑。
 * token 是傳給 TODDLER_GAMES 的名稱（screens.spec 的 want()、story／cheer／nav-spam 各自的 want()）。
 */
export const SCREEN_TESTS = [
  { token: 'home', spec: 'screens', files: ['src/screens/HomeFriends.tsx', 'src/screens/Adventure.tsx', 'src/screens/Route.tsx'], games: [] },
  { token: 'map', spec: 'screens', files: [], games: [] },
  { token: 'collection', spec: 'screens', files: ['src/screens/Collection.tsx', 'src/screens/Stickers.tsx'], games: [] },
  { token: 'parent', spec: 'screens', files: ['src/screens/parent/Parent.tsx'], games: [] },
  // back 同時跑「返回鍵在孩子畫面」和「今日冒險每一段都能返回」
  { token: 'back', spec: 'screens', files: ['src/screens/Adventure.tsx', 'src/screens/Route.tsx'], games: 'any' },
  { token: 'adventure', spec: 'screens', files: ['src/screens/Adventure.tsx', 'src/screens/Route.tsx', 'src/screens/DayRecap.tsx', 'src/screens/OutingAsk.tsx'], games: 'any' },
  // 護眼休息（ui/EyeBreak，共用）、睡覺畫面：在地圖上等它出現，不進遊戲
  { token: 'eyebreak', spec: 'screens', files: [], games: [] },
  { token: 'bedtime', spec: 'screens', files: ['src/screens/Bedtime.tsx'], games: [] },
  { token: 'motion', spec: 'screens', files: [], games: ['m-match'] },
  { token: 'settings', spec: 'screens', files: [], games: [] },
  { token: 'layers', spec: 'screens', files: ['src/screens/Collection.tsx'], games: ['m-match'] },
  { token: 'story', spec: 'story', files: ['src/screens/Adventure.tsx', 'src/screens/Route.tsx', 'src/screens/StoryBook.tsx', 'src/screens/MagicHouse.tsx', 'src/content/story/'], games: ['p-color', 'm-match'] },
  // 慶祝中點返回（m-match、z-find）、換畫面連點（每站點一項）：選了那個遊戲就會跟著跑（各 spec 的 want()）
  { token: 'cheer', spec: 'cheer', files: [], games: [] },
  { token: 'nav-spam', spec: 'nav-spam', files: [], games: [] },
]

/** 測試檔本身改了：跑那個檔的全部 */
const SPEC_TOKENS = {
  'games.spec.ts': 'GAMES',
  'screens.spec.ts': SCREEN_TESTS.filter((t) => t.spec === 'screens').map((t) => t.token),
  'story.spec.ts': ['story'],
  'cheer.spec.ts': ['cheer'],
  'nav-spam.spec.ts': ['nav-spam'],
}

// ── 讀程式 ────────────────────────────────────────────────

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/')

/** tests/toddler/catalog.ts 的 GAMES（id、站點、種類） */
export function catalog(text = read('tests/toddler/catalog.ts')) {
  const out = []
  for (const m of text.matchAll(/\{[^{}]*\bid:\s*'([^']+)'[^{}]*\}/g)) {
    const station = /station:\s*'([^']+)'/.exec(m[0])?.[1]
    const kind = /kind:\s*'([^']+)'/.exec(m[0])?.[1]
    if (station && kind) out.push({ id: m[1], station, kind, line: m[0] })
  }
  return out
}

/** src/games/PlayGame.tsx 的 BY_KIND：種類 → 元件檔 */
export function kindEntries() {
  const src = read('src/games/PlayGame.tsx')
  const imp = new Map()
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.[^']+)'/g))
    for (const name of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()))
      imp.set(name, resolve(path.join(ROOT, 'src/games'), m[2]))
  const out = new Map()
  const block = /BY_KIND[^{]*\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? ''
  for (const m of block.matchAll(/^\s*([\w-]+|'[^']+')\s*:\s*(\w+)/gm)) {
    const f = imp.get(m[2])
    if (f) out.set(m[1].replace(/'/g, ''), rel(f))
  }
  return out
}

const EXT = ['', '.ts', '.tsx', '.js', '.mjs', '.css', '.json', '/index.ts', '/index.tsx']
function resolve(dir, spec) {
  const base = path.resolve(dir, spec)
  for (const e of EXT) {
    const f = base + e
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f
  }
  return null
}

/** src 底下每個檔 import 了哪些檔（相對路徑的 import、export from、import()、CSS @import） */
export function importGraph() {
  const g = new Map()
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(tsx?|css|json|mjs|js)$/.test(e.name)) {
        const text = fs.readFileSync(p, 'utf8')
        const deps = new Set()
        const re = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|@import\s+(?:url\()?['"](\.[^'"]+)['"]/g
        for (const m of text.matchAll(re)) {
          const f = resolve(path.dirname(p), m[1] ?? m[2] ?? m[3] ?? m[4])
          if (f) deps.add(rel(f))
        }
        g.set(rel(p), deps)
      }
    }
  }
  walk(path.join(ROOT, 'src'))
  return g
}

/** 從 starts 出發順著 import 走到的檔；走到 stop 裡的檔就不再往下（但那個檔本身算走到） */
function reach(g, starts, stop = () => false) {
  const seen = new Set()
  const todo = [...starts]
  while (todo.length) {
    const f = todo.pop()
    if (seen.has(f)) continue
    seen.add(f)
    if (stop(f) && !starts.includes(f)) continue
    for (const d of g.get(f) ?? []) todo.push(d)
  }
  return seen
}

const git = (args) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}：${r.stderr.trim()}`)
  return r.stdout
}

/** 跟基準比改了哪些檔：基準...HEAD 的提交，加上還沒提交（含暫存）的改動、還沒加進 git 的新檔 */
export function changedFiles(base) {
  const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean)
  const files = new Set([
    ...lines(git(['diff', '--name-only', `${base}...HEAD`])),
    ...lines(git(['diff', '--name-only', 'HEAD'])),
    ...lines(git(['ls-files', '--others', '--exclude-standard'])),
  ])
  return [...files].sort()
}

// ── 對照 ──────────────────────────────────────────────────

/**
 * 回傳 { full, tokens, rows }：
 * full = 要跑完整版；tokens = 傳給 TODDLER_GAMES 的名稱；rows = 每個檔的判斷（印成表）
 */
export function affected(base = 'main', files = changedFiles(base)) {
  const games = catalog()
  const kinds = kindEntries()
  const g = importGraph()
  const rows = []
  const tokens = new Set()
  const gameIds = new Set()
  let full = false

  // 每個遊戲的入口（種類的元件檔）；catalog 裡找不到元件的種類：那個遊戲一律跑
  const entryOf = new Map(games.map((x) => [x.id, kinds.get(x.kind) ?? null]))
  for (const x of games) if (!entryOf.get(x.id)) gameIds.add(x.id), rows.push({ file: '（catalog）', rule: `PlayGame 找不到種類 ${x.kind} 的元件`, effect: x.id })

  // 入口：遊戲元件、畫面測試列的畫面檔。從共用檔出發順著 import 走（遇到入口就停）走得到的檔，也算共用
  const screenFiles = [...new Set(SCREEN_TESTS.flatMap((t) => t.files.filter((f) => !f.endsWith('/'))))]
  const entries = new Set([...kinds.values(), ...screenFiles])
  const kindFiles = new Set(kinds.values())
  const isCore = (f) => !kindFiles.has(f) && CORE.find(([re]) => re.test(f))
  const coreFiles = [...g.keys()].filter(isCore)
  const coreReach = reach(g, coreFiles, (f) => entries.has(f))
  const reachOf = new Map()
  const reachFrom = (f) => {
    // 走到別的入口、共用檔就停：經過共用檔才走得到的，前面 coreReach 已經判成完整版；遊戲經過 PlayGame 才走得到的，由 games 欄位決定
    if (!reachOf.has(f)) reachOf.set(f, reach(g, [f], (x) => (entries.has(x) || !!isCore(x)) && x !== f))
    return reachOf.get(f)
  }

  const addGame = (id) => gameIds.add(id)
  for (const f of files) {
    const core = isCore(f)
    if (core) {
      full = true
      rows.push({ file: f, rule: core[1], effect: '完整版' })
      continue
    }
    const none = NONE.find(([re]) => re.test(f))
    if (none) {
      rows.push({ file: f, rule: none[1], effect: '不用跑' })
      continue
    }
    const spec = /^tests\/toddler\/([\w-]+\.spec\.ts)$/.exec(f)?.[1]
    if (spec) {
      const t = SPEC_TOKENS[spec]
      if (!t) {
        full = true
        rows.push({ file: f, rule: '新的測試檔', effect: '完整版' })
      } else if (t === 'GAMES') {
        games.forEach((x) => addGame(x.id))
        rows.push({ file: f, rule: '遊戲測試檔', effect: '全部遊戲' })
      } else {
        t.forEach((x) => tokens.add(x))
        rows.push({ file: f, rule: '測試檔', effect: t.join(' ') })
      }
      continue
    }
    if (f === 'tests/toddler/catalog.ts') {
      // 只改了 GAMES 裡某幾行（新增、改名）：跑那幾個遊戲；改到別的（站點、DRAWING、selected）跑完整版
      let diff = ''
      try {
        diff = git(['diff', '-U0', base, '--', f])
      } catch {
        /* 新檔 */
      }
      const changed = diff.split('\n').filter((l) => /^[+-](?![+-])/.test(l))
      const ids = changed.map((l) => /\bid:\s*'([^']+)'/.exec(l)?.[1])
      if (!diff || ids.some((x) => !x)) {
        full = true
        rows.push({ file: f, rule: 'catalog 改到 GAMES 以外的地方', effect: '完整版' })
      } else {
        const live = ids.filter((id) => games.some((x) => x.id === id))
        live.forEach(addGame)
        rows.push({ file: f, rule: 'catalog 只改了 GAMES 的這幾行', effect: live.join(' ') || '（刪掉的遊戲，不用跑）' })
      }
      continue
    }
    if (!f.startsWith('src/')) {
      full = true
      rows.push({ file: f, rule: '對照表沒有列到的檔', effect: '完整版' })
      continue
    }
    if (!g.has(f)) {
      // 刪掉的檔、圖片：不知道誰用它
      full = true
      rows.push({ file: f, rule: fs.existsSync(path.join(ROOT, f)) ? 'src 裡不是程式的檔' : '刪掉的檔', effect: '完整版' })
      continue
    }
    if (coreReach.has(f) && !entries.has(f)) {
      full = true
      rows.push({ file: f, rule: '共用的檔用到它（ui、lib、App… 會 import）', effect: '完整版' })
      continue
    }
    const hitGames = games.filter((x) => entryOf.get(x.id) && reachFrom(entryOf.get(x.id)).has(f)).map((x) => x.id)
    const hitScreens = SCREEN_TESTS.filter((t) => t.files.some((sf) => (sf.endsWith('/') ? f.startsWith(sf) : reachFrom(sf).has(f)))).map((t) => t.token)
    if (!hitGames.length && !hitScreens.length) {
      full = true
      rows.push({ file: f, rule: '沒有任何入口用到它（看不出影響誰）', effect: '完整版' })
      continue
    }
    hitGames.forEach(addGame)
    hitScreens.forEach((t) => tokens.add(t))
    rows.push({ file: f, rule: '順著 import 找到的入口', effect: [...hitGames, ...hitScreens].join(' ') })
  }

  // 遊戲改了：用到那個遊戲的畫面測試、玩今日冒險（不知道排到哪個遊戲）的畫面測試也要跑
  if (gameIds.size)
    for (const t of SCREEN_TESTS) {
      const why = t.games === 'any' ? '玩今日冒險排到的遊戲' : t.games.filter((id) => gameIds.has(id)).join('、')
      if (why && !tokens.has(t.token)) {
        tokens.add(t.token)
        rows.push({ file: '（遊戲有改）', rule: `${t.token} 會${t.games === 'any' ? why : `玩 ${why}`}`, effect: t.token })
      }
    }
  if (gameIds.size) {
    const sts = [...new Set(games.filter((x) => gameIds.has(x.id)).map((x) => x.station))]
    const ch = ['m-match', 'z-find'].filter((id) => gameIds.has(id))
    rows.push({ file: '（遊戲有改）', rule: 'nav-spam.spec、cheer.spec 依選到的遊戲自動帶上（各自的 want()）', effect: `換畫面連點 ${sts.join(' ')}${ch.length ? `；慶祝中點返回 ${ch.join(' ')}` : ''}` })
  }
  gameIds.forEach((id) => tokens.add(id))
  return { base, files, full, tokens: full ? [] : [...tokens], rows }
}

export function table(a) {
  const esc = (s) => String(s).replace(/\|/g, '｜')
  const L = [`| 改到的檔 | 規則 | 要跑 |`, `|---|---|---|`]
  for (const r of a.rows) L.push(`| ${esc(r.file)} | ${esc(r.rule)} | ${esc(r.effect)} |`)
  return L.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] ?? 'main'
  const a = affected(base)
  console.log(`基準 ${base}，改了 ${a.files.length} 個檔\n`)
  console.log(table(a))
  console.log(`\n${a.full ? '→ 跑完整版' : a.tokens.length ? `→ 只跑：${a.tokens.join(' ')}` : '→ 沒有影響三歲測試的改動'}`)
}
