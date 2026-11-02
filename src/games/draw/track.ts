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
  constructor(d: string, step: number, private tol: number) {
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
   * - 描到一半抬筆（或被手掌打斷），又從起點（綠點）下筆 → 'again'：這一筆從頭再描，進度和偏離紀錄歸零；
   * - 一筆還沒開始、按在起點附近（snap 範圍內，見 SNAP_MM）→ 'snap'：吸到起點，這一筆的點都平移到起點那邊再比對；
   * - 其他地方 → null：這一下不推進度（線照樣畫得出來，放開後淡掉）。
   * snap 是 0（預設）就沒有吸附，跟以前一樣。
   * 以前只有接著描才算，孩子從綠點重新來過一直描不動，會以為壞掉（L-MA 三歲測試）。
   */
  penDown(p: P2, snap = 0): 'go' | 'again' | 'snap' | null {
    this.shift = { x: 0, y: 0 }
    this.lastDev = 0
    if (this.near(p)) return 'go'
    if (this.progress > 0 && dist(p, this.samples[0]) < this.tol * 1.2) {
      this.progress = 0
      this.devSum = 0
      this.devN = 0
      this.off = 0
      return 'again'
    }
    // 一筆還沒開始：起點附近（snap，跟路徑同一個座標系）按下去就吸到起點（AI #3）
    if (snap > 0 && this.progress === 0 && dist(p, this.samples[0]) < snap) {
      this.shift = { x: this.samples[0].x - p.x, y: this.samples[0].y - p.y }
      return 'snap'
    }
    return null
  }

  feed(raw: P2): boolean {
    const p = { x: raw.x + this.shift.x, y: raw.y + this.shift.y }
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
    this.devSum += bestD
    this.devN++
    this.lastDev = bestD
    if (bestD > this.tol * 0.6) this.off++
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
