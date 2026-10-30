// 讀 docs/故事世界.md（G-0b，家長 2026-10-30 確認語氣）：寫作簡報要放進去的規則段落、系列大綱的每一篇、故事時間的授權表和排法。
// 文件是寫給人看的 Markdown，這裡只照表格的欄位讀，文件改了（加篇、加經典），之後的簡報就跟著改。
// docs/ 不進 git：在 worktree 裡跑時，到主 repo 找（git 的 common dir 旁邊）；也可以用環境變數 STORY_WORLD 指定。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import type { Band } from '../../src/content/growth'

export function findWorldDoc(): string {
  const cands = [process.env.STORY_WORLD, 'docs/故事世界.md']
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    cands.push(join(dirname(common), 'docs', '故事世界.md'))
  } catch {
    // 不在 git 裡就只看目前的資料夾
  }
  const hit = cands.find((p) => p && existsSync(p))
  if (!hit) throw new Error('找不到 docs/故事世界.md（可以用環境變數 STORY_WORLD 指定路徑）')
  return resolve(hit)
}

export interface World {
  path: string
  md: string
  /** 「## 3. 寫作規則」這種段落的全文 */
  section: (heading: string) => string
  /** 系列大綱：第幾篇 → 那一列（欄位名 → 內容） */
  arcs: Map<number, { part: number; cells: Record<string, string> }>
  /** 故事時間：編號 → 那一列 */
  classics: Map<string, ClassicRow>
  /** 小班段第一輪（§5.4）：週 → 編號 */
  firstRound: string[]
}

export interface ClassicRow {
  id: string
  title: string
  /** 授權表的分類標題（伊索寓言、聖經故事…） */
  group: string
  band: Band
  /** 要改的地方 */
  changes: string
  /** 出處（有的表才有） */
  source: string
  /** 整列（欄位名 → 內容） */
  cells: Record<string, string>
}

const BAND_OF: Record<string, Band> = { 小班: 'small', 中班: 'middle', 大班: 'big' }

/** Markdown 表格的一列 → 欄位 */
const cellsOf = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function loadWorld(path = findWorldDoc()): World {
  const md = readFileSync(path, 'utf8')
  const lines = md.split(/\r?\n/)

  const section = (heading: string) => {
    const i = lines.findIndex((l) => /^#{2,4} /.test(l) && l.replace(/^#+\s*/, '').startsWith(heading))
    if (i < 0) return ''
    const level = lines[i].match(/^#+/)![0].length
    let j = i + 1
    while (j < lines.length && !(lines[j].match(/^#+ /) && lines[j].match(/^#+/)![0].length <= level)) j++
    return lines.slice(i, j).join('\n').trim()
  }

  // 系列大綱（§4）：表頭第一欄是「篇」的表
  const arcs = new Map<number, { part: number; cells: Record<string, string> }>()
  let part = 0
  let head: string[] | null = null
  let inOutline = false
  for (const l of lines) {
    if (/^## 4\./.test(l)) inOutline = true
    else if (/^## 5\./.test(l)) inOutline = false
    if (!inOutline) continue
    const p = l.match(/^### 4\.(\d)/)
    if (p) part = Number(p[1])
    if (!l.startsWith('|')) {
      head = null
      continue
    }
    const cs = cellsOf(l)
    if (cs[0] === '篇') head = cs
    else if (head && /^\d+$/.test(cs[0])) arcs.set(Number(cs[0]), { part, cells: Object.fromEntries(head.map((h, k) => [h, (cs[k] ?? '').replace(/\*\*/g, '')])) })
  }

  // 授權表（§5.3）：表頭有「編號」的表；分類取前面最近的粗體標題
  const classics = new Map<string, ClassicRow>()
  let group = ''
  head = null
  let inTable = false
  for (const l of lines) {
    if (/^### 5\.3/.test(l)) inTable = true
    else if (/^### 5\.4/.test(l)) inTable = false
    if (!inTable) continue
    const g = l.match(/^\*\*(.+?)\*\*/)
    if (g) group = g[1]
    if (!l.startsWith('|')) {
      head = null
      continue
    }
    const cs = cellsOf(l)
    if (cs[0] === '編號') head = cs
    else if (head && /^[A-Z]\d\d$/.test(cs[0])) {
      const cells = Object.fromEntries(head.map((h, k) => [h, cs[k] ?? '']))
      classics.set(cs[0], {
        id: cs[0],
        title: cells['故事'] ?? '',
        group,
        band: BAND_OF[(cells['年段'] ?? '').replace(/段$/, '')] ?? 'small',
        changes: cells['要改的地方'] ?? '',
        source: cells['出處'] ?? cells['出處（都是公有領域）'] ?? '',
        cells,
      })
    }
  }

  // 小班段第一輪（§5.4）
  const firstRound: string[] = []
  const r = section('5.4 排法')
  const first = r.slice(r.indexOf('小班段第一輪'))
  for (const l of first.split(/\r?\n/)) {
    const m = l.match(/^\|\s*(\d+)\s*\|\s*([A-Z]\d\d)/)
    if (m) firstRound[Number(m[1]) - 1] = m[2]
  }
  return { path, md, section, arcs, classics, firstRound }
}

/** 故事時間的類別（§5.4 的 8 週輪替） */
export type ClassicKind = 'aesop' | 'asian' | 'other' | 'long'
export const kindOf = (id: string): ClassicKind => (id[0] === 'A' ? 'aesop' : id[0] === 'J' || id[0] === 'P' ? 'asian' : id[0] === 'L' ? 'long' : 'other')

/** 8 週一輪的類別順序（§5.4 的比例：小班 伊索 4、亞洲寓言 2、其他 2；中班 2、2、4；大班 1、1、2、長篇 4） */
export const ROTATION: Record<Band, ClassicKind[]> = {
  small: ['aesop', 'asian', 'aesop', 'other', 'aesop', 'asian', 'aesop', 'other'],
  middle: ['aesop', 'other', 'asian', 'other', 'aesop', 'other', 'asian', 'other'],
  big: ['long', 'aesop', 'long', 'other', 'long', 'asian', 'long', 'other'],
}
/** 「其他輪流」的順序：聖經 → 中國 → 霍加 → 歐洲民間故事 */
export const OTHER_ORDER = ['B', 'C', 'H', 'F']

const rank = (b: Band) => ['small', 'middle', 'big'].indexOf(b)

/**
 * 下一則故事時間（§5.4）：小班段第一輪照文件的表；之後照 8 週的類別比例，從表裡挑還沒講過的、年段到了的（從易到難＝表的順序）。
 * told：講過的、已經寫好的（手寫的示範、審稿佇列裡的）都算。
 */
export function nextClassic(w: World, band: Band, told: readonly string[]): ClassicRow | null {
  const done = new Set(told)
  const ok = (c: ClassicRow) => !done.has(c.id) && rank(c.band) <= rank(band)
  const all = [...w.classics.values()]
  if (band === 'small') {
    const id = w.firstRound.find((x) => x && !done.has(x))
    if (id && w.classics.get(id)) return w.classics.get(id)!
  }
  const slot = ROTATION[band][told.length % 8]
  const order: ClassicKind[] = [slot, ...(['aesop', 'asian', 'other', 'long'] as ClassicKind[]).filter((k) => k !== slot)]
  for (const k of order) {
    let pool = all.filter((c) => kindOf(c.id) === k && ok(c))
    if (!pool.length) continue
    if (k === 'asian') {
      // 本生經、五卷書輪流：講得比較少的那一邊先
      const n = (p: string) => told.filter((x) => x[0] === p).length
      const first = n('J') <= n('P') ? 'J' : 'P'
      pool = [...pool.filter((c) => c.id[0] === first), ...pool.filter((c) => c.id[0] !== first)]
    }
    if (k === 'other') {
      // 聖經 → 中國 → 霍加 → 歐洲民間故事輪流（這一類講過幾則就從第幾個開始；沒有適合年段的就跳到下一類）
      const start = told.filter((x) => kindOf(x) === 'other').length % OTHER_ORDER.length
      const seq = [...OTHER_ORDER.slice(start), ...OTHER_ORDER.slice(0, start)]
      pool = seq.flatMap((p) => pool.filter((c) => c.id[0] === p))
    }
    return pool[0]
  }
  return null
}
