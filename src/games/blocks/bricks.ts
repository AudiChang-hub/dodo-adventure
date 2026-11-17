// 積木蓋蓋看（T-162）的積木：顏色、形狀、模型的文字格式、立體版的換法、支撐、畫的先後。只有純函式，scripts/test-blocks.ts 直接測。
// 一律叫「積木」（blocks）。凸點是一般的圓形，沒有字、沒有商標，外觀不模仿任何品牌的盒裝。

/** 積木的顏色（≥ 8 種；自由蓋用前 10 種） */
export const COLORS = {
  R: { hex: '#E0604E', zh: '紅', en: 'red' },
  O: { hex: '#F0A04B', zh: '橘', en: 'orange' },
  Y: { hex: '#F2C94C', zh: '黃', en: 'yellow' },
  G: { hex: '#5FAE57', zh: '綠', en: 'green' },
  B: { hex: '#4F86C6', zh: '藍', en: 'blue' },
  C: { hex: '#8FCBE8', zh: '淺藍', en: 'sky blue' },
  P: { hex: '#9B7BC8', zh: '紫', en: 'purple' },
  K: { hex: '#F2A2B8', zh: '粉紅', en: 'pink' },
  W: { hex: '#F7F3EA', zh: '白', en: 'white' },
  N: { hex: '#9A6B47', zh: '咖啡', en: 'brown' },
  L: { hex: '#B5D86A', zh: '淺綠', en: 'lime' },
  T: { hex: '#E8CC98', zh: '米', en: 'tan' },
  A: { hex: '#A9ABAE', zh: '灰', en: 'gray' },
  D: { hex: '#4A4540', zh: '黑', en: 'black' },
} as const
export type ColorId = keyof typeof COLORS
export const COLOR_IDS = Object.keys(COLORS) as ColorId[]
/** 自由蓋的托盤：10 種顏色 */
export const FREE_COLORS: ColorId[] = ['R', 'O', 'Y', 'G', 'B', 'C', 'P', 'K', 'W', 'N']

/**
 * 形狀：brick 一般的積木；slopeR ◢（右邊高）、slopeL ◣（左邊高）斜坡；round 圓柱；wheel 輪子；
 * eyeL、eyeR 前面印了一隻眼睛的積木（眼睛在左格／右格，只有 2 格寬的分得出來）
 */
export type Shape = 'brick' | 'slopeR' | 'slopeL' | 'round' | 'wheel' | 'eyeL' | 'eyeR'
export const SHAPES: Shape[] = ['brick', 'slopeR', 'slopeL', 'round', 'wheel', 'eyeL', 'eyeR']
/** 每種形狀最寬幾格 */
export const MAX_W: Record<Shape, number> = { brick: 4, slopeR: 2, slopeL: 2, round: 1, wheel: 1, eyeL: 2, eyeR: 2 }

/** 一塊積木：x 往右、z 往上（第 0 層貼著底板）、y 往後（立體版的前排 0、後排 1）；w 寬、d 深（1 或 2） */
export interface Brick {
  x: number
  z: number
  y: number
  w: number
  d: number
  color: ColorId
  shape: Shape
}

/** 積木的種類（顏色＋形狀＋大小）：托盤裡拿的、放對了沒，都看這個 */
export const kindOf = (b: Pick<Brick, 'color' | 'shape' | 'w' | 'd'>) => `${b.color}.${b.shape}.${b.w}x${b.d}`

/** 大小的說法（家長看的）：1×2、2×4…（深×寬，跟積木店的說法一樣：短邊在前） */
export const sizeOf = (b: Pick<Brick, 'w' | 'd'>) => `${Math.min(b.w, b.d)}×${Math.max(b.w, b.d)}`

// ── 模型的文字格式 ─────────────────────────────────────────
// rows：由上往下，一個字一格；最下面一行是第 0 層。
//   .     空格
//   R、r… 一般的積木（顏色見 COLORS）。同一行連著同一個字母、而且大小寫一樣的算同一塊（最寬 4 格，更長的平均切開）；
//         大小寫換了就是另一塊（RRrr＝兩塊 1×2）
//   @     輪子（黑色）
//   1～9  特別的積木，顏色和形狀寫在 key：'1R/ 2R\ 3Ge 4Yo'（/ ◢、\ ◣、o 圓柱、e 眼睛在左、f 眼睛在右）；
//         同一個數字連著的算同一塊（斜坡最寬 2、眼睛最寬 2、圓柱 1）

const SHAPE_CH: Record<string, Shape> = { '/': 'slopeR', '\\': 'slopeL', o: 'round', e: 'eyeL', f: 'eyeR', b: 'brick' }

/** 一串 n 格平均切成每塊 ≤ max 格（5 → 3＋2、6 → 3＋3、7 → 4＋3） */
export function splitRun(n: number, max: number): number[] {
  const k = Math.ceil(n / max)
  const base = Math.floor(n / k)
  return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0))
}

export function parseKey(key = ''): Record<string, { color: ColorId; shape: Shape }> {
  const out: Record<string, { color: ColorId; shape: Shape }> = {}
  for (const tok of key.split(/\s+/).filter(Boolean)) {
    const [d, c, s] = [tok[0], tok[1], tok.slice(2)]
    if (!/^[1-9]$/.test(d) || !(c in COLORS) || !(s in SHAPE_CH)) throw new Error(`看不懂的 key：${tok}`)
    out[d] = { color: c as ColorId, shape: SHAPE_CH[s] }
  }
  return out
}

/** 把文字格式換成積木（平面的：y 0、d 1） */
export function parseRows(rows: readonly string[], key?: string): Brick[] {
  const legend = parseKey(key)
  const H = rows.length
  const out: Brick[] = []
  rows.forEach((row, r) => {
    const z = H - 1 - r
    let x = 0
    while (x < row.length) {
      const c = row[x]
      if (c === '.' || c === ' ') {
        x++
        continue
      }
      if (c === '@') {
        out.push({ x, z, y: 0, w: 1, d: 1, color: 'D', shape: 'wheel' })
        x++
        continue
      }
      let n = 1
      while (x + n < row.length && row[x + n] === c) n++
      let color: ColorId
      let shape: Shape
      if (/[1-9]/.test(c)) {
        const k = legend[c]
        if (!k) throw new Error(`key 裡沒有 ${c}`)
        color = k.color
        shape = k.shape
      } else {
        const up = c.toUpperCase()
        if (!(up in COLORS)) throw new Error(`看不懂的格子：${c}`)
        color = up as ColorId
        shape = 'brick'
      }
      let at = x
      for (const w of splitRun(n, MAX_W[shape])) {
        // 一格寬的眼睛積木，眼睛在左在右看起來一樣：都算 eyeL（托盤裡不會有兩種看起來一樣的）
        out.push({ x: at, z, y: 0, w, d: 1, color, shape: w === 1 && shape === 'eyeR' ? 'eyeL' : shape })
        at += w
      }
      x += n
    }
  })
  return out
}

// ── 立體版（前後兩排，第 3、4 級） ─────────────────────────────
/**
 * 平面的模型換成前後兩排：一般的積木、斜坡、眼睛積木變成兩排深（1×4 → 2×4、1×1 → 1×2 橫著放）；
 * 輪子、圓柱前後各一個（車子有 4 個輪子）。
 */
export function to3d(flat: readonly Brick[]): Brick[] {
  const out: Brick[] = []
  for (const b of flat) {
    if (b.shape === 'wheel' || b.shape === 'round') {
      out.push({ ...b, y: 0, d: 1 }, { ...b, y: 1, d: 1 })
    } else out.push({ ...b, y: 0, d: 2 })
  }
  return out
}

// ── 支撐、大小、比較 ─────────────────────────────────────────

/** 這塊積木蓋住哪些格子（x、y） */
export const cellsOf = (b: Brick) => {
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < b.w; i++) for (let j = 0; j < b.d; j++) out.push({ x: b.x + i, y: b.y + j })
  return out
}

/** 這一格上面可以疊東西嗎：斜坡只有高的那一格（而且要 2 格寬才有凸點） */
export function holdsAt(b: Brick, x: number): boolean {
  if (b.shape === 'slopeR') return b.w >= 2 && x === b.x + b.w - 1
  if (b.shape === 'slopeL') return b.w >= 2 && x === b.x
  return true
}

/** 凸點在哪幾格（x）：斜坡只有高的那一格；輪子沒有 */
export function studsOf(b: Brick): number[] {
  if (b.shape === 'wheel') return []
  const xs: number[] = []
  for (let i = 0; i < b.w; i++) if (holdsAt(b, b.x + i)) xs.push(b.x + i)
  return xs
}

/**
 * b 有沒有被 others 裡的積木撐住：第 0 層貼著底板；不然下面要有一格撐著它（斜坡只有高的那格撐得住），
 * 或是同一層左右貼著一塊（樹的兩邊、手臂這種往旁邊伸出去的，卡通的積木可以黏在旁邊）。
 */
export function supported(b: Brick, others: readonly Brick[]): boolean {
  if (b.z === 0) return true
  const below = cellsOf(b).some((c) => others.some((o) => o !== b && o.z === b.z - 1 && o.x <= c.x && c.x < o.x + o.w && o.y <= c.y && c.y < o.y + o.d && holdsAt(o, c.x)))
  if (below) return true
  return others.some((o) => o !== b && o.z === b.z && o.y < b.y + b.d && b.y < o.y + o.d && (o.x + o.w === b.x || b.x + b.w === o.x))
}

/**
 * 照「撐得住才放得上去」一塊一塊放，放得完嗎（每塊都要放得上去）。回傳放的順序（放不完：null）。
 * 先放下面的、左邊的（提示、示範、步驟圖都照這個順序）。
 */
export function buildOrder(bs: readonly Brick[]): number[] | null {
  const placed: Brick[] = []
  const order: number[] = []
  const left = bs.map((_, i) => i).sort((a, b) => bs[a].z - bs[b].z || bs[a].y - bs[b].y || bs[a].x - bs[b].x)
  while (left.length) {
    const k = left.findIndex((i) => {
      const b = bs[i]
      if (b.z === 0) return true
      // 旁邊黏著的：旁邊那一塊要已經放好，而且它是被撐住的（不能兩塊互相黏著浮在空中）
      return supported(b, placed)
    })
    if (k < 0) return null
    const [i] = left.splice(k, 1)
    placed.push(bs[i])
    order.push(i)
  }
  return order
}

/** 兩塊有沒有重疊 */
export const overlaps = (a: Brick, b: Brick) => a.z === b.z && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d

/** 模型的寬高（格） */
export function sizeOfModel(bs: readonly Brick[]) {
  return { w: Math.max(0, ...bs.map((b) => b.x + b.w)), h: Math.max(0, ...bs.map((b) => b.z + 1)), d: Math.max(1, ...bs.map((b) => b.y + b.d)) }
}

/**
 * 樣子的指紋（不看顏色）：只換顏色的模型指紋一樣。左右鏡像也算同一個（◢ ↔ ◣、眼睛左右對調）。
 */
export function signature(bs: readonly Brick[]): string {
  const W = sizeOfModel(bs).w
  const one = (list: readonly Brick[]) =>
    list
      .map((b) => `${b.x},${b.z},${b.y},${b.w},${b.d},${b.shape === 'eyeR' ? 'eyeL' : b.shape}`)
      .sort()
      .join(';')
  const mirror = bs.map((b) => ({ ...b, x: W - b.x - b.w, shape: b.shape === 'slopeR' ? 'slopeL' : b.shape === 'slopeL' ? 'slopeR' : b.shape === 'eyeL' ? 'eyeR' : b.shape === 'eyeR' ? 'eyeL' : b.shape }) as Brick)
  const a = one(bs)
  const m = one(mirror)
  return a < m ? a : m
}

// ── 斜看的立體圖：往後一排，畫面往右上挪多少（格） ───────────────
/** 平面版：不挪；立體版：往後一排往右 0.3 格、往上 0.36 格（看得到上面和右邊，斜坡的面也看得到） */
export const DEPTH = { x: 0.3, z: 0.36 }

/**
 * 畫的先後：下面的層先畫；同一層裡，後排、左邊的先畫（右邊、前排的會蓋住它們的側面）。
 * 同一層用「誰貼著誰的右邊、前面」排（拓撲排序）；排不出來的照 x − y。
 */
export function paintOrder<T extends Brick>(bs: readonly T[]): T[] {
  const layers = [...new Set(bs.map((b) => b.z))].sort((a, b) => a - b)
  const out: T[] = []
  for (const z of layers) {
    const L = bs.filter((b) => b.z === z)
    const before = (a: T, b: T) => {
      // a 要比 b 先畫：b 有一格在 a 某一格的右邊、前面或右前
      for (const ca of cellsOf(a))
        for (const cb of cellsOf(b)) {
          if (cb.x === ca.x + 1 && cb.y === ca.y) return true
          if (cb.x === ca.x && cb.y === ca.y - 1) return true
          if (cb.x === ca.x + 1 && cb.y === ca.y - 1) return true
        }
      return false
    }
    const left = [...L].sort((a, b) => a.x - a.y - (b.x - b.y) || a.x - b.x)
    while (left.length) {
      const i = left.findIndex((b) => !left.some((a) => a !== b && before(a, b)))
      out.push(...left.splice(i < 0 ? 0 : i, 1))
    }
  }
  return out
}
