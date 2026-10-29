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
}

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

  private async touch(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', pts: (Pt & { id?: number })[]) {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : pts.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id ?? i, radiusX: 10, radiusY: 10, force: 1 })),
    })
  }

  async tap(p: Pt, label = '') {
    this.act(`tap ${Math.round(p.x)},${Math.round(p.y)} ${label}`)
    await this.touch('touchStart', [p])
    await sleep(50 + this.r.int(60))
    await this.touch('touchEnd', [])
  }

  /** 同一個地方連點 n 下 */
  async spam(p: Pt, n: number, label = '') {
    this.act(`spam x${n} ${Math.round(p.x)},${Math.round(p.y)} ${label}`)
    for (let i = 0; i < n; i++) {
      await this.touch('touchStart', [p])
      await sleep(30 + this.r.int(40))
      await this.touch('touchEnd', [])
      await sleep(40 + this.r.int(60))
    }
  }

  async hold(p: Pt, ms: number, label = '') {
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

  /** 兩根手指：一根按著（例如拖曳中），另一根去點別的地方 */
  async twoFinger(first: Pt[], second: Pt, holdSecondMs = 0) {
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
    fs.writeFileSync(path.join(dir, `${this.viewport}-${slug(name)}.json`), JSON.stringify({ name, seed: this.seed, viewport: this.viewport, findings: this.findings, log: this.log, ...extra }, null, 2))
  }
}

export const outDir = () => path.resolve(process.env.TODDLER_OUT || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../test-results/toddler'))
export const slug = (s: string) => s.replace(/[^\w一-鿿-]+/g, '_').slice(0, 60)
