// 蠟筆筆刷（給畫畫小屋的蠟筆著色用；之後要共用由 PM 整合）。
//
// 長得像蠟筆畫在紙上，而不是平滑的數位線條：
// - 顆粒：筆觸用一張「紙紋」貼圖當顏料（canvas pattern）。貼圖固定貼在畫布上，紙的凹處每一筆都塗不太到，
//   跟真的蠟筆在紙上一樣，同一個位置一直塗才會慢慢填滿、變深。
// - 邊緣不規則：每一小步撒一把順著筆的方向的短線（像蠟筆的紋路），寬度兩側各自慢慢地抖動；越靠邊越淡。
// - 略透明、重疊變深：每一把都只有一半左右的不透明度，來回塗、跟別的筆畫重疊的地方會越來越濃。
// - 筆的壓力：用力畫比較粗、比較濃；手指沒有壓力，用中間值。
// 紙感螢幕更新慢，所以沒有任何動畫或特效：每一個 pointer 事件來了就直接畫上去，下一幀就看得到。
//
// 「不塗出線」：用 canvas 的 clip 把一筆限制在下筆的那一塊。圖上後畫的區域蓋在前面的區域上
// （例如肚子在身體上面），所以一塊區域可以塗的範圍是「自己減掉蓋在它上面的區域」；
// 一連串 clip 會取交集，「減掉」用大方框＋那塊區域的 evenodd 做出補集。

import type { Picture } from './pictures'

export interface CrayonPt {
  x: number
  y: number
  /** 壓力 0–1；手指固定 0.5 */
  p: number
}

/** 3 歲孩子塗得滿的粗細（邏輯座標，畫布是 1000 × 600） */
export const CRAYON_SIZE = 44

// ── 紙紋 ────────────────────────────────────────────────────────
const TILE = 128
let grain: HTMLCanvasElement | null = null

/** 一張可以無縫重複的紙紋（白色＋不透明度）：大顆粒（紙的起伏）＋細顆粒，凹處接近透明 */
function grainTile(): HTMLCanvasElement {
  if (grain) return grain
  const c = document.createElement('canvas')
  c.width = c.height = TILE
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(TILE, TILE)
  const G = 24
  const coarse = Array.from({ length: G * G }, () => Math.random())
  const at = (i: number, j: number) => coarse[((j + G) % G) * G + ((i + G) % G)]
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      // 大顆粒：雙線性內插，邊界繞回去，貼起來沒有接縫
      const gx = (x / TILE) * G
      const gy = (y / TILE) * G
      const i = Math.floor(gx)
      const j = Math.floor(gy)
      const fx = gx - i
      const fy = gy - j
      const big = at(i, j) * (1 - fx) * (1 - fy) + at(i + 1, j) * fx * (1 - fy) + at(i, j + 1) * (1 - fx) * fy + at(i + 1, j + 1) * fx * fy
      const n = 0.55 * big + 0.45 * Math.random()
      const a = Math.max(0, Math.min(1, (n - 0.2) / 0.45))
      const k = (y * TILE + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255
      img.data[k + 3] = Math.round(a * 255)
    }
  ctx.putImageData(img, 0, 0)
  grain = c
  return c
}

const tiles = new Map<string, HTMLCanvasElement>()
/** 某個顏色的紙紋貼圖（每個顏色做一次） */
function colorTile(color: string): HTMLCanvasElement {
  let t = tiles.get(color)
  if (t) return t
  t = document.createElement('canvas')
  t.width = t.height = TILE
  const ctx = t.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, TILE, TILE)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(grainTile(), 0, 0)
  tiles.set(color, t)
  return t
}

const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>()
function patternFor(ctx: CanvasRenderingContext2D, color: string): CanvasPattern {
  let m = patterns.get(ctx)
  if (!m) patterns.set(ctx, (m = new Map()))
  let p = m.get(color)
  if (!p) m.set(color, (p = ctx.createPattern(colorTile(color), 'repeat')!))
  return p
}

// ── 畫布 ────────────────────────────────────────────────────────
/** 把 canvas 設成固定的邏輯座標（w × h），解析度 res 倍；之後版面怎麼縮放都不用重畫 */
export function setupCanvas(c: HTMLCanvasElement, w: number, h: number, res: number) {
  c.width = Math.round(w * res)
  c.height = Math.round(h * res)
  const ctx = c.getContext('2d')!
  ctx.setTransform(res, 0, 0, res, 0, 0)
  return ctx
}

export function clearCanvas(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.restore()
}

// ── 線稿的區域 ──────────────────────────────────────────────────
/** 'bg' 是線稿以外的紙（天空、地上）：也是一塊可以塗的區域 */
export const BG = 'bg'

function parseTransform(t?: string): DOMMatrix {
  const m = new DOMMatrix()
  if (!t) return m
  for (const [, fn, args] of t.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number)
    if (fn === 'translate') m.translateSelf(v[0], v[1] ?? 0)
    else if (fn === 'scale') m.scaleSelf(v[0], v[1] ?? v[0])
  }
  return m
}

interface Area {
  id: string
  path: Path2D
  /** 大方框＋這塊區域：用 evenodd clip 就是「這塊以外」 */
  outside: Path2D
}

/** 著色頁的區域（pictures.ts）換算成畫布座標：判斷下筆在哪一塊、做 clip、算塗了多少 */
export class RegionMap {
  readonly areas: Area[]
  private hit: CanvasRenderingContext2D
  private mask: Uint8Array
  private maskCount: number
  static readonly SAMPLE = 0.2

  constructor(
    pic: Picture,
    readonly w: number,
    readonly h: number,
  ) {
    const m = parseTransform(pic.transform)
    const frame = new Path2D()
    frame.rect(-w, -h, w * 3, h * 3)
    this.areas = pic.regions.map((r) => {
      const path = new Path2D()
      path.addPath(new Path2D(r.d), m)
      const outside = new Path2D(frame)
      outside.addPath(path)
      return { id: r.id, path, outside }
    })
    this.hit = document.createElement('canvas').getContext('2d')!
    // 線稿佔的面積（縮小 5 倍取樣）：拿來算「塗了多少」
    const s = RegionMap.SAMPLE
    const mc = document.createElement('canvas')
    mc.width = Math.round(w * s)
    mc.height = Math.round(h * s)
    const mx = mc.getContext('2d', { willReadFrequently: true })!
    mx.scale(s, s)
    mx.fillStyle = '#000'
    for (const a of this.areas) mx.fill(a.path)
    const d = mx.getImageData(0, 0, mc.width, mc.height).data
    this.mask = new Uint8Array(mc.width * mc.height)
    let n = 0
    for (let i = 0; i < this.mask.length; i++) if (d[i * 4 + 3] > 127) (this.mask[i] = 1), n++
    this.maskCount = Math.max(1, n)
  }

  /** 這一點在哪一塊（後畫的在上面，所以從後面找回來）；都不在就是紙（BG） */
  at(x: number, y: number): string {
    for (let i = this.areas.length - 1; i >= 0; i--) if (this.hit.isPointInPath(this.areas[i].path, x, y)) return this.areas[i].id
    return BG
  }

  area(id: string) {
    return this.areas.find((a) => a.id === id)
  }

  /** 把 ctx 限制在某一塊看得到的範圍裡（呼叫前後要自己 save／restore） */
  clip(ctx: CanvasRenderingContext2D, id: string) {
    const i = this.areas.findIndex((a) => a.id === id)
    if (i >= 0) {
      ctx.clip(this.areas[i].path)
      for (let j = i + 1; j < this.areas.length; j++) ctx.clip(this.areas[j].outside, 'evenodd')
    } else for (const a of this.areas) ctx.clip(a.outside, 'evenodd')
  }

  /**
   * 塗了多少：畫布上有顏色的地方（不管塗在線稿裡面或外面）佔線稿面積的比例，最多 1。
   * 只在一筆結束時算一次（縮小 5 倍讀像素，很便宜）。
   */
  coverage(canvas: HTMLCanvasElement): { any: number; inside: number } {
    const s = RegionMap.SAMPLE
    const c = document.createElement('canvas')
    c.width = Math.round(this.w * s)
    c.height = Math.round(this.h * s)
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(canvas, 0, 0, c.width, c.height)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let any = 0
    let inside = 0
    for (let i = 0; i < this.mask.length; i++)
      if (d[i * 4 + 3] > 40) {
        any++
        if (this.mask[i]) inside++
      }
    return { any: Math.min(1, any / this.maskCount), inside: inside / this.maskCount }
  }

  /** 一塊區域的外框（示範時在這個範圍裡來回塗） */
  private boxes = new Map<string, { x: number; y: number; w: number; h: number } | null>()
  private big: string | null = null

  bounds(id: string): { x: number; y: number; w: number; h: number } | null {
    if (this.boxes.has(id)) return this.boxes.get(id)!
    const a = this.area(id)
    if (!a) return null
    // Path2D 沒有 getBBox：用取樣的方式找（只在示範前算一次）
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    const step = 6
    for (let y = 0; y < this.h; y += step)
      for (let x = 0; x < this.w; x += step)
        if (this.at(x, y) === id) {
          x0 = Math.min(x0, x)
          y0 = Math.min(y0, y)
          x1 = Math.max(x1, x)
          y1 = Math.max(y1, y)
        }
    const box = x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    this.boxes.set(id, box)
    return box
  }

  /** 看得到的面積最大的那一塊（示範塗這一塊：公車的車身、豆豆的身體） */
  biggest(): string {
    if (this.big) return this.big
    const counts = new Map<string, number>()
    const step = 8
    for (let y = 0; y < this.h; y += step)
      for (let x = 0; x < this.w; x += step) {
        const id = this.at(x, y)
        if (id !== BG) counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    this.big = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? this.areas[0]?.id ?? BG
    return this.big
  }
}

// ── 一筆 ────────────────────────────────────────────────────────
export interface CrayonOpts {
  color: string
  /** 橡皮擦：擦掉蠟筆（線稿在另一層，擦不掉） */
  eraser?: boolean
  /** 用筆（有壓力）還是手指 */
  pen?: boolean
  size?: number
  /** 限制在這一塊裡（null：自由塗，可以塗出線外） */
  clip?: ((ctx: CanvasRenderingContext2D) => void) | null
}

/**
 * 一筆蠟筆。建立時就在下筆的地方點一下（一碰就有顏色），之後每來一個點就畫到那個點。
 * 每一小步（粗細的 7%）撒一把短線，所以畫得快慢、事件密不密，筆觸的濃淡都一樣。
 */
export class CrayonStroke {
  readonly pts: CrayonPt[] = []
  private last: CrayonPt
  private carry = 0
  private pr: number
  private dir = { x: 1, y: 0 }
  /** 兩側邊緣各自慢慢抖動的寬度倍數 */
  private edge = [0.92, 0.92]

  constructor(
    private ctx: CanvasRenderingContext2D,
    readonly opts: CrayonOpts,
    first: CrayonPt,
  ) {
    this.pr = first.p
    this.last = first
    this.pts.push(first)
    this.paint(() => {
      if (opts.eraser) this.eraseDab(first)
      else for (let i = 0; i < 3; i++) this.stamp(first.x + (Math.random() - 0.5) * 3, first.y + (Math.random() - 0.5) * 3)
    })
  }

  private get width() {
    const base = this.opts.size ?? CRAYON_SIZE
    // 筆：輕輕畫 0.6 倍、用力畫 1.25 倍；手指固定 0.95 倍
    return this.opts.pen ? base * (0.6 + 0.65 * this.pr) : base * 0.95
  }

  private get alpha() {
    return this.opts.pen ? Math.min(0.95, 0.32 + 0.75 * this.pr) : 0.68
  }

  private paint(fn: () => void) {
    const ctx = this.ctx
    ctx.save()
    if (this.opts.clip) this.opts.clip(ctx)
    if (this.opts.eraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = ctx.fillStyle = '#000'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    } else {
      ctx.strokeStyle = patternFor(ctx, this.opts.color)
      ctx.lineCap = 'butt'
    }
    fn()
    ctx.restore()
  }

  private eraseDab(p: CrayonPt) {
    this.ctx.beginPath()
    this.ctx.arc(p.x, p.y, this.width * 0.62, 0, Math.PI * 2)
    this.ctx.fill()
  }

  /** 在 (x, y) 撒一把順著筆的方向的短線：中間濃、邊緣淡，兩側的寬度各自抖動 */
  private stamp(x: number, y: number) {
    const ctx = this.ctx
    const w = this.width
    const R = w / 2
    const { x: dx, y: dy } = this.dir
    const nx = -dy
    const ny = dx
    for (let s = 0; s < 2; s++) this.edge[s] = Math.max(0.74, Math.min(1.04, this.edge[s] + (Math.random() - 0.5) * 0.09))
    const n = Math.round(w * 0.6)
    const lw = Math.max(1.1, w * 0.045)
    const bands: Path2D[] = [new Path2D(), new Path2D(), new Path2D()]
    for (let k = 0; k < n; k++) {
      const side = Math.random() < 0.5 ? 0 : 1
      const u = Math.random()
      const o = u * R * this.edge[side] * (side ? 1 : -1)
      const len = w * (0.06 + 0.14 * Math.random())
      const along = (Math.random() - 0.5) * w * 0.08
      const cx = x + nx * o + dx * along
      const cy = y + ny * o + dy * along
      const b = bands[u < 0.55 ? 0 : u < 0.85 ? 1 : 2]
      b.moveTo(cx - (dx * len) / 2, cy - (dy * len) / 2)
      b.lineTo(cx + (dx * len) / 2, cy + (dy * len) / 2)
    }
    ctx.lineWidth = lw
    const a = this.alpha
    ;[1, 0.72, 0.42].forEach((f, i) => {
      ctx.globalAlpha = a * f
      ctx.stroke(bands[i])
    })
  }

  /** 畫到下一個點（coalesced events 的每一個點都丟進來） */
  to(p: CrayonPt) {
    this.pts.push(p)
    const ax = this.last.x
    const ay = this.last.y
    const dist = Math.hypot(p.x - ax, p.y - ay)
    if (dist < 0.01) return
    this.pr += (p.p - this.pr) * 0.35
    const ux = (p.x - ax) / dist
    const uy = (p.y - ay) / dist
    // 方向也稍微平滑一下，筆紋才不會在轉彎時亂跳
    const mx = this.dir.x * 0.5 + ux * 0.5
    const my = this.dir.y * 0.5 + uy * 0.5
    const ml = Math.hypot(mx, my) || 1
    this.dir = { x: mx / ml, y: my / ml }
    if (this.opts.eraser) {
      this.paint(() => {
        this.ctx.lineWidth = this.width * 1.24
        this.ctx.beginPath()
        this.ctx.moveTo(ax, ay)
        this.ctx.lineTo(p.x, p.y)
        this.ctx.stroke()
      })
    } else {
      const step = Math.max(1.2, this.width * 0.07)
      this.paint(() => {
        let t = step - this.carry
        while (t <= dist) {
          this.stamp(ax + ux * t, ay + uy * t)
          t += step
        }
        this.carry = dist - (t - step)
      })
    }
    this.last = p
  }
}
