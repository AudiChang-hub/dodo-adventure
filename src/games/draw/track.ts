export interface P2 {
  x: number
  y: number
}

/** 沿著 SVG 路徑每隔 step 取一個點 */
export function samplePath(d: string, step: number): P2[] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  el.setAttribute('d', d)
  const len = el.getTotalLength()
  const n = Math.max(2, Math.ceil(len / step))
  return Array.from({ length: n + 1 }, (_, i) => {
    const p = el.getPointAtLength((len * i) / n)
    return { x: p.x, y: p.y }
  })
}

const dist = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * 描字起點的吸附範圍（AI #3）：3 歲手指點下去平均偏 4.5 mm（Vatavu 2015），偶爾偏很多；
 * AI 小男生測試裡偏過約 23 mm（數學描 1，點了完全沒反應，以為壞了）。一筆還沒開始時，起點 25 mm 內按下去就吸到起點。
 * 「接著描」本來的範圍（near）在英文課約 16 mm，吸附只補它外面那一圈，不會讓亂點變成描字。
 */
export const SNAP_MM = 25
/** TCL NXTPAPER 11 Plus 橫向：1280 css px 約 24.6 cm（換算吸附範圍用） */
export const PX_PER_MM = 5.2

/**
 * 描太久就帶著描完（T-95）：輪到孩子描之後這麼久還沒描完，筆把剩下的描完、照樣慶祝，往下一段走。
 * 準則 FB-2、NAV-5「孩子掙扎一段時間之後，可以直接帶他往下走」，EN-6、MA-9「描著玩、描不好沒關係」；
 * 全球幼教指引 HOW-9 一個活動 3～5 分鐘。45 秒是設計值：盲測裡描 1 個字母 1 分半就說「好久喔」離開。
 * 帶著描完的那一次記成沒有自己描好（hintUsed），不影響明天上什麼。
 */
export const HELP_MS = 45_000

/**
 * 描線進度：筆只能「往前推」進度，而且要在路徑附近才算。
 * 同時記錄每個筆點離路徑多遠，作為運筆穩定度的指標。
 */
export class PathTracker {
  samples: P2[]
  progress = 0
  private devSum = 0
  private devN = 0
  private off = 0
  /** 吸附到起點時，手指和起點差多少：之後這一筆的每一點都平移這麼多再比對（孩子照著自己按下去的地方畫，線一樣會前進） */
  private shift: P2 = { x: 0, y: 0 }
  /** 最近一點離路徑多遠（偏掉的提醒用） */
  lastDev = 0
  /** 這一筆上一個筆點（平移後）：手指移得快、兩個點跳很遠時，中間補點再比對（T-95：快速一劃推不動進度） */
  private last: P2 | null = null
  constructor(d: string, private step: number, private tol: number) {
    this.samples = samplePath(d, step)
  }

  get done() {
    return this.progress >= this.samples.length - 2
  }

  get ratio() {
    return this.progress / (this.samples.length - 1)
  }

  /** 下筆時，必須落在目前進度附近才開始 */
  near(p: P2): boolean {
    const lo = Math.max(0, this.progress - 4)
    const hi = Math.min(this.samples.length - 1, this.progress + 6)
    for (let i = lo; i <= hi; i++) if (dist(p, this.samples[i]) < this.tol * 1.2) return true
    return false
  }

  /**
   * 描字的下筆（描字遊戲、英文課描字母、數學課寫數字共用）：
   * - 在目前進度附近 → 'go'：接著描；
   * - 描到一半抬筆，又從起點下筆 → 'again'：進度不歸零（準則 DRAW-2：放開再畫不會重來），沿著描好的部分走回接續點就接著往前；
   * - 描到一半抬筆，在接續點附近（snap 範圍內）下筆 → 'snap'：吸到接續點；
   * - 一筆還沒開始、按在起點附近（snap 範圍內，見 SNAP_MM）→ 'snap'：吸到起點，這一筆的點都平移到起點那邊再比對；
   * - 其他地方 → null：這一下不推進度（線照樣畫得出來，放開後淡掉）。
   * snap 是 0（預設）就沒有吸附，跟以前一樣。
   * 以前只有接著描才算，孩子從綠點重新來過一直描不動，會以為壞掉（L-MA 三歲測試）。
   */
  penDown(p: P2, snap = 0): 'go' | 'again' | 'snap' | null {
    this.shift = { x: 0, y: 0 }
    this.lastDev = 0
    this.last = p
    if (this.near(p)) return 'go'
    if (this.progress > 0 && dist(p, this.samples[0]) < this.tol * 1.2) return 'again'
    // 描到一半：接續點附近按下去就吸到接續點（T-95，盲測：孩子不知道斷在哪裡，每次從頭畫）
    const tip = this.samples[this.progress]
    if (snap > 0 && this.progress > 0 && dist(p, tip) < snap) {
      this.shift = { x: tip.x - p.x, y: tip.y - p.y }
      this.last = tip
      return 'snap'
    }
    // 一筆還沒開始：起點附近（snap，跟路徑同一個座標系）按下去就吸到起點（AI #3）
    if (snap > 0 && this.progress === 0 && dist(p, this.samples[0]) < snap) {
      this.shift = { x: this.samples[0].x - p.x, y: this.samples[0].y - p.y }
      this.last = this.samples[0]
      return 'snap'
    }
    return null
  }

  feed(raw: P2): boolean {
    const p = { x: raw.x + this.shift.x, y: raw.y + this.shift.y }
    const from = this.last ?? p
    this.last = p
    // 兩點之間補點：每段不超過一個取樣間距
    const n = Math.max(1, Math.ceil(dist(from, p) / this.step))
    let moved = false
    for (let i = 1; i <= n; i++) moved = this.feedOne({ x: from.x + ((p.x - from.x) * i) / n, y: from.y + ((p.y - from.y) * i) / n }, i === n) || moved
    return moved
  }

  /** 一個筆點：只能往前推進度；離路徑多遠也算描好的那一段（沿著描好的部分走回來不算偏離） */
  private feedOne(p: P2, count: boolean): boolean {
    const lo = Math.max(0, this.progress - 6)
    const hi = Math.min(this.samples.length - 1, this.progress + 14)
    let best = -1
    let bestD = Infinity
    for (let i = lo; i <= hi; i++) {
      const d = dist(p, this.samples[i])
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    let dev = bestD
    for (let i = 0; i < lo; i++) dev = Math.min(dev, dist(p, this.samples[i]))
    if (count) {
      this.devSum += dev
      this.devN++
      this.lastDev = dev
      if (dev > this.tol * 0.6) this.off++
    }
    if (bestD < this.tol && best > this.progress) {
      this.progress = best
      return true
    }
    return false
  }

  metrics() {
    return {
      meanDev: this.devN ? Math.round((this.devSum / this.devN) * 10) / 10 : 0,
      offRatio: this.devN ? Math.round((this.off / this.devN) * 100) / 100 : 0,
      points: this.devN,
    }
  }
}
