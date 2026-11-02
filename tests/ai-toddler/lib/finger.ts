import type { CDPSession, Page } from '@playwright/test'
import { rng } from '../../toddler/lib/toddler'

export interface Pt {
  x: number
  y: number
}

/** 這一下手指實際做了什麼（報告、下一步給小男生看「剛剛點到哪裡」用） */
export interface Touch {
  kind: 'tap' | 'drag' | 'back'
  /** 小男生想點的地方 */
  want: Pt[]
  /** 套上誤差之後真的送出去的點 */
  got: Pt[]
  times: number
  /** 拖到一半就放手 */
  early?: boolean
  /** 自己多點了一下（沒說要連點） */
  extraTap?: boolean
  holdMs: number
  /** 按下去那一點底下是什麼（給報告看：點到返回鍵、點到畫布、點到空白） */
  hit: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 三歲孩子的手指：用 CDP 送觸控（跟 tests/toddler 一樣），座標套上誤差。
 *
 * 誤差（依據見 persona.md〈依據〉）：
 * - 偏移：每一軸常態分布 σ = 16 px（TCL NXTPAPER 11 Plus 橫向 1280 css px 約 24.6 cm，1 mm ≈ 5.2 px；
 *   Vatavu 2015 的 3 歲平均偏移約 4.5 mm ≈ 23 px，兩軸合起來的平均距離 ≈ 1.25σ）；10% 機率手滑偏很多（σ × 2.5）。
 * - 沒說要連點時，8% 機率多點一下（急、興奮）。
 * - 拖曳：20% 機率拖到 40～80% 就放手；路徑每一點再抖 ±6 px。
 * - 按下去的時間 60～180 ms，5% 機率按久一點（0.6 秒）。
 */
export class Finger {
  readonly r: ReturnType<typeof rng>
  private cdp!: CDPSession
  constructor(
    readonly page: Page,
    seed: number,
    readonly vp = { width: 1280, height: 800 },
  ) {
    this.r = rng(seed)
  }

  async init() {
    this.cdp = await this.page.context().newCDPSession(this.page)
  }

  private gauss() {
    // Box–Muller
    const u = Math.max(1e-9, this.r.next())
    const v = this.r.next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  private clamp(p: Pt): Pt {
    return { x: Math.max(1, Math.min(this.vp.width - 1, Math.round(p.x))), y: Math.max(1, Math.min(this.vp.height - 1, Math.round(p.y))) }
  }

  /** 手指點下去會偏開多少 */
  wobble(p: Pt, sigma = 16): Pt {
    const s = this.r.next() < 0.1 ? sigma * 2.5 : sigma
    return this.clamp({ x: p.x + this.gauss() * s, y: p.y + this.gauss() * s })
  }

  private async touch(type: 'touchStart' | 'touchMove' | 'touchEnd', p?: Pt) {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 0, radiusX: 11, radiusY: 11, force: 1 }] : [],
    })
  }

  /** 那一點底下是什麼：返回鍵、家長角落、畫布、按鈕（aria-label）、或空白 */
  hitAt(p: Pt) {
    return this.page
      .evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        if (!el) return '（畫面外）'
        if (el.closest('[data-back]')) return '返回鍵'
        if (el.closest('.parent-corner')) return '家長角落'
        if (el.tagName === 'CANVAS') return '畫布'
        const b = el.closest('button, [role=button], .door, .side-door, .book-card')
        if (b) return `按鈕「${b.getAttribute('aria-label') || (b as HTMLElement).dataset.door || b.textContent?.trim().slice(0, 12) || (b.getAttribute('class') ?? '').split(' ')[0]}」`
        // SVG 的 className 是 SVGAnimatedString，用 getAttribute 才拿得到字
        const cls = (el.getAttribute('class') ?? '').split(' ')[0]
        return cls ? `空白處（${cls}）` : `空白處（${el.tagName.toLowerCase()}）`
      }, p)
      .catch(() => '（讀不到）')
  }

  async tap(want: Pt, times = 1): Promise<Touch> {
    const extraTap = times === 1 && this.r.next() < 0.08
    const n = Math.max(1, Math.min(6, times + (extraTap ? 1 : 0)))
    const got = this.wobble(want)
    const hit = await this.hitAt(got)
    const long = this.r.next() < 0.05
    let holdMs = 0
    for (let i = 0; i < n; i++) {
      // 連點時每一下也會偏一點點
      const p = i ? this.clamp({ x: got.x + this.gauss() * 5, y: got.y + this.gauss() * 5 }) : got
      const hold = long && i === 0 ? 600 : 60 + this.r.int(120)
      holdMs = Math.max(holdMs, hold)
      await this.touch('touchStart', p)
      await sleep(hold)
      await this.touch('touchEnd')
      if (i < n - 1) await sleep(70 + this.r.int(120))
    }
    return { kind: 'tap', want: [want], got: [got], times: n, extraTap, holdMs, hit }
  }

  /** 沿著 pts 拖；三歲常常拖到一半就放手 */
  async drag(want: Pt[], opts: { drawing?: boolean } = {}): Promise<Touch> {
    if (want.length < 2) return this.tap(want[0] ?? { x: this.vp.width / 2, y: this.vp.height / 2 })
    const start = this.wobble(want[0])
    const dx = start.x - want[0].x
    const dy = start.y - want[0].y
    let pts = want.map((p, i) => (i ? this.clamp({ x: p.x + dx + this.gauss() * 6, y: p.y + dy + this.gauss() * 6 }) : start))
    const early = this.r.next() < (opts.drawing ? 0.12 : 0.2)
    if (early) {
      // 沿著整條路徑的 40～80% 處放手
      const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
      const total = seg.reduce((a, b) => a + b, 0)
      let left = total * (0.4 + this.r.next() * 0.4)
      const cut: Pt[] = [pts[0]]
      for (let i = 0; i < seg.length; i++) {
        if (left >= seg[i]) {
          cut.push(pts[i + 1])
          left -= seg[i]
        } else {
          const f = seg[i] ? left / seg[i] : 0
          cut.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f })
          break
        }
      }
      pts = cut
    }
    const hit = await this.hitAt(pts[0])
    await this.touch('touchStart', pts[0])
    await sleep(40)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 12))
      for (let k = 1; k <= n; k++) {
        await this.touch('touchMove', { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
        await sleep(14 + this.r.int(10))
      }
    }
    await this.touch('touchEnd')
    return { kind: 'drag', want, got: pts.map((p) => this.clamp(p)), times: 1, early, holdMs: 0, hit }
  }

  /** Android 的返回手勢（App 收到的是瀏覽器的上一頁） */
  async back(): Promise<Touch> {
    await this.page.evaluate(() => history.back())
    return { kind: 'back', want: [], got: [], times: 1, holdMs: 0, hit: 'Android 返回' }
  }
}
