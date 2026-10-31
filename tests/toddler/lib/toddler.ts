import type { CDPSession, Page, TestInfo } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 嚴重程度（報告用的分類） */
export type Severity = '卡死' | '無法返回' | '誤記作答' | '閃動縮放' | '困惑' | '小問題'

export interface Finding {
  where: string
  behavior: string
  severity: Severity
  title: string
  detail: string
  seed: number
  viewport: string
  actions: string[]
  shot?: string
  at: number
}

export interface Pt {
  x: number
  y: number
  /** 故意按導覽（返回鍵、家長角落）：不經過 navGuard。homeButton() 回傳的點、pressBack 都會帶 */
  nav?: boolean
}

/**
 * 亂點不能「剛好」按到導覽（T-72）：
 * 點下去的那一刻畫面上是什麼要看機器多快，同一個 seed 有時剛好按到左上角的返回、有時不會，結果不能重現。
 * 所以一般的亂點、連點、拖、手掌一律避開導覽；「想返回、回家」改成測試裡用 seed 決定、一定會發生的步驟（pressBack／holdHome）。
 *
 * 避開的方法有兩層：
 * 1. 固定的區域（跟畫面無關，所以跟機器快慢無關）：左上角返回鍵、右上角家長角落。
 * 2. 按下去之前再看一次那一點底下是不是導覽（冒險結尾的「回首頁」大按鈕不在角落）。
 * 被移開的點往畫面中間挪，動作紀錄會寫「（避開導覽）」。
 */
export const NAV_ZONES = (vp: { width: number; height: number }) => [
  // 返回鍵：.stage-top 左上 26,11 起 92×92（ui.css），冒險、故事書、地圖、站點同一顆；留 20px 手指半徑
  { name: '返回鍵', x0: 0, y0: 0, x1: 140, y1: 126 },
  // 家長角落：右上 96×96（ui.css .parent-corner）
  { name: '家長角落', x0: vp.width - 116, y0: 0, x1: vp.width, y1: 116 },
]
export const NAV_SELECTOR = '[data-back], .parent-corner, .go-btn[aria-label="回首頁"]'

/** 固定 seed 的亂數（mulberry32）：同一個 seed 每次做一樣的動作 */
export function rng(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
    range: (a: number, b: number) => a + next() * (b - a),
  }
}

export function hashSeed(...parts: (string | number)[]) {
  let h = 2166136261
  for (const c of parts.join('|')) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 一個三歲的小孩：用觸控（CDP 的 touch 事件，和平板一樣產生 pointer／touch／click）操作畫面，
 * 每個動作都記下來；發現問題時存截圖和最近的動作。
 */
export class Toddler {
  readonly log: string[] = []
  readonly findings: Finding[] = []
  readonly r: ReturnType<typeof rng>
  private cdp!: CDPSession
  private t0 = Date.now()
  where = ''
  behavior = ''

  constructor(
    readonly page: Page,
    readonly info: TestInfo,
    readonly seed: number,
    readonly viewport: string,
  ) {
    this.r = rng(seed)
  }

  async init() {
    this.cdp = await this.page.context().newCDPSession(this.page)
  }

  act(s: string) {
    const t = ((Date.now() - this.t0) / 1000).toFixed(1)
    this.log.push(`[${t}s] ${this.where}/${this.behavior}: ${s}`)
  }

  /** 亂點被移開幾次（固定區域、按下前看到導覽），報告的導覽覆蓋用 */
  readonly guarded = { zone: 0, live: 0 }

  /** 把亂點移出導覽（見 NAV_ZONES）；p.nav 的點原樣回傳 */
  private async navGuard<T extends Pt>(pts: T[]): Promise<T[]> {
    if (pts.every((p) => p.nav)) return pts
    const vp = this.page.viewportSize() ?? { width: 1200, height: 800 }
    const zones = NAV_ZONES(vp)
    let moved = false
    const out = pts.map((p) => {
      if (p.nav) return p
      const z = zones.find((z) => p.x >= z.x0 && p.x < z.x1 && p.y >= z.y0 && p.y < z.y1)
      if (!z) return p
      moved = true
      this.guarded.zone++
      // 往下挪出區域（保留 x，邊緣亂點還是在邊緣）；y 帶一點原本的位置，不會每次都點在同一條線上
      return { ...p, y: z.y1 + 4 + (Math.abs(Math.round(p.y)) % 24) }
    })
    // 按下去的那一刻那一點底下是導覽（角落以外的「回首頁」）：往畫面中間挪
    const fixed = await this.page
      .evaluate(
        ({ pts, sel }) =>
          pts.map((p) => {
            if (p.nav) return null
            let { x, y } = p
            const cx = innerWidth / 2
            const cy = innerHeight / 2
            for (let i = 0; i < 12; i++) {
              const el = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, x)), Math.max(0, Math.min(innerHeight - 1, y)))
              if (!el?.closest(sel)) return i ? { x, y } : null
              const d = Math.hypot(cx - x, cy - y) || 1
              x += ((cx - x) / d) * 40
              y += ((cy - y) / d) * 40
            }
            return { x, y }
          }),
        { pts: out.map((p) => ({ x: p.x, y: p.y, nav: !!p.nav })), sel: NAV_SELECTOR },
      )
      .catch(() => out.map(() => null))
    const res = out.map((p, i) => {
      const f = fixed[i]
      if (!f) return p
      moved = true
      this.guarded.live++
      return { ...p, x: f.x, y: f.y }
    })
    if (moved) this.act(`（避開導覽：${pts.map((p, i) => (p.x !== res[i].x || p.y !== res[i].y ? `${Math.round(p.x)},${Math.round(p.y)}→${Math.round(res[i].x)},${Math.round(res[i].y)}` : '')).filter(Boolean).join(' ')}）`)
    return res
  }

  private async touch(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', pts: (Pt & { id?: number })[]) {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : pts.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id ?? i, radiusX: 10, radiusY: 10, force: 1 })),
    })
  }

  async tap(p: Pt, label = '') {
    ;[p] = await this.navGuard([p])
    this.act(`tap ${Math.round(p.x)},${Math.round(p.y)} ${label}`)
    await this.touch('touchStart', [p])
    await sleep(50 + this.r.int(60))
    await this.touch('touchEnd', [])
  }

  /** 同一個地方連點 n 下 */
  async spam(p: Pt, n: number, label = '') {
    ;[p] = await this.navGuard([p])
    this.act(`spam x${n} ${Math.round(p.x)},${Math.round(p.y)} ${label}`)
    for (let i = 0; i < n; i++) {
      await this.touch('touchStart', [p])
      await sleep(30 + this.r.int(40))
      await this.touch('touchEnd', [])
      await sleep(40 + this.r.int(60))
    }
  }

  async hold(p: Pt, ms: number, label = '') {
    ;[p] = await this.navGuard([p])
    this.act(`hold ${ms}ms ${Math.round(p.x)},${Math.round(p.y)} ${label}`)
    await this.touch('touchStart', [p])
    const end = Date.now() + ms
    // 手指會微微抖動
    while (Date.now() < end) {
      await sleep(100)
      await this.touch('touchMove', [{ x: p.x + this.r.range(-2, 2), y: p.y + this.r.range(-2, 2) }])
    }
    await this.touch('touchEnd', [])
  }

  /** 沿著路徑拖；cancel=true 時最後送 touchcancel（手指滑出螢幕、被系統手勢搶走） */
  async drag(pts: Pt[], opts: { cancel?: boolean; stepMs?: number; label?: string } = {}) {
    const { cancel = false, stepMs = 16, label = '' } = opts
    pts = await this.navGuard(pts)
    this.act(`${cancel ? 'drag→cancel' : 'drag'} ${pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' → ')} ${label}`)
    await this.touch('touchStart', [pts[0]])
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 14))
      for (let k = 1; k <= n; k++) {
        await this.touch('touchMove', [{ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }])
        await sleep(stepMs)
      }
    }
    await this.touch(cancel ? 'touchCancel' : 'touchEnd', [])
  }

  /** 手掌壓在畫面上：兩三個手指同時按下，再一起移動、放開 */
  async palm(pts: Pt[], ms = 500) {
    pts = await this.navGuard(pts)
    this.act(`palm ${pts.length} fingers ${pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}`)
    const ps = pts.map((p, i) => ({ ...p, id: i }))
    await this.touch('touchStart', ps.slice(0, 1))
    await sleep(20)
    await this.touch('touchStart', ps)
    const end = Date.now() + ms
    while (Date.now() < end) {
      await sleep(60)
      await this.touch(
        'touchMove',
        ps.map((p) => ({ ...p, x: p.x + this.r.range(-12, 12), y: p.y + this.r.range(-12, 12) })),
      )
    }
    await this.touch('touchEnd', [])
  }

  /** 兩根手指：一根按著（例如拖曳中），另一根去點別的地方（holdHome 用：第二根是故意按返回鍵，不經過 navGuard） */
  async twoFinger(first: Pt[], second: Pt, holdSecondMs = 0) {
    first = await this.navGuard(first)
    this.act(`two-finger drag ${first.length} pts + tap ${Math.round(second.x)},${Math.round(second.y)} hold ${holdSecondMs}`)
    await this.touch('touchStart', [{ ...first[0], id: 0 }])
    for (const p of first.slice(1)) {
      await this.touch('touchMove', [{ ...p, id: 0 }])
      await sleep(20)
    }
    const last = first[first.length - 1]
    await this.touch('touchStart', [{ ...last, id: 0 }, { ...second, id: 1 }])
    const end = Date.now() + holdSecondMs
    while (Date.now() < end) {
      await sleep(100)
      await this.touch('touchMove', [{ ...last, id: 0 }, { ...second, id: 1 }])
    }
    await this.touch('touchEnd', [])
  }

  async wait(ms: number, why = '') {
    if (why) this.act(`wait ${ms}ms ${why}`)
    await sleep(ms)
  }

  /** 記一筆問題：截圖、最近 25 個動作 */
  async report(severity: Severity, title: string, detail: string, opts: { shot?: boolean } = {}) {
    const f: Finding = { where: this.where, behavior: this.behavior, severity, title, detail, seed: this.seed, viewport: this.viewport, actions: this.log.slice(-25), at: Date.now() - this.t0 }
    if (opts.shot !== false) {
      const dir = path.join(outDir(), 'shots')
      fs.mkdirSync(dir, { recursive: true })
      const name = `${this.viewport}-${slug(this.where)}-${this.findings.length + 1}.png`
      try {
        await this.page.screenshot({ path: path.join(dir, name), timeout: 5000 })
        f.shot = name
      } catch {
        /* 頁面關掉了 */
      }
    }
    this.findings.push(f)
    this.act(`⚠ ${severity}: ${title}`)
  }

  save(name: string, extra: Record<string, unknown> = {}) {
    const dir = path.join(outDir(), 'findings')
    fs.mkdirSync(dir, { recursive: true })
    // test：哪一個測試（run.mjs 重跑同一項、report.mjs 對照三次用）；attempt：第幾次（1 是第一輪，2、3 是自動重跑）
    const test = { title: this.info.title, file: path.basename(this.info.file), line: this.info.line, project: this.info.project.name }
    const attempt = Number(process.env.TODDLER_ATTEMPT || 1)
    fs.writeFileSync(path.join(dir, `${this.viewport}-${slug(name)}.json`), JSON.stringify({ name, seed: this.seed, viewport: this.viewport, test, attempt, guarded: this.guarded, findings: this.findings, log: this.log, ...extra }, null, 2))
  }
}

export const outDir = () => path.resolve(process.env.TODDLER_OUT || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../test-results/toddler'))
export const slug = (s: string) => s.replace(/[^\w一-鿿-]+/g, '_').slice(0, 60)
