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
 * 描線進度：筆只能「往前推」進度，而且要在路徑附近才算。
 * 同時記錄每個筆點離路徑多遠，作為運筆穩定度的指標。
 */
export class PathTracker {
  samples: P2[]
  progress = 0
  private devSum = 0
  private devN = 0
  private off = 0
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

  feed(p: P2): boolean {
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
