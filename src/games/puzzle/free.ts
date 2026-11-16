// 拼圖自己的構圖（T-159 第二版，PM 2026-11-16 退件：組合圖每張都是「天上三樣＋地上三樣排一排」，一成不變）。
// 故事插畫的擺法（storybook/layout）只有左中右五個位置、一條地平線、三種大小；拼圖要有大主角、近大遠小、斜坡、倒影、室內、夜空、水底，
// 所以這裡另外一套「自由擺」：每一樣自己給位置和高度，背景由幾種地面＋一組背景零件（山、樓、雲、星星、窗戶、家具…）組成。
// 角色、東西還是畫故事插畫的角色庫（library.tsx）和專案已經在用的 Fluent Emoji。只有資料和算框的純函式，畫在 ./FreeArt.tsx。
import { ITEMS, poseOf } from '../../art/storybook/meta'

export const FW = 960
export const FH = 600

/** 天空（室內是牆的顏色，水底是海水） */
export type Sky = 'day' | 'dusk' | 'night' | 'water'

/** 一樣角色或東西：x 是中間、y 是腳底（東西的底），h 是畫出來多高 */
export interface FreeItem {
  who: string
  x: number
  y: number
  h: number
  /** 面向左 */
  flip?: boolean
  pose?: string
  /** 傾斜幾度（斜坡上滾的、溜的） */
  rot?: number
}

/** 背景零件 */
export type Deco =
  | { t: 'cloud'; x: number; y: number; k: number }
  | { t: 'mountain'; x: number; w: number; h: number; base: number; snow?: boolean; fill?: string }
  | { t: 'hill'; x: number; w: number; h: number; base: number; fill: string }
  | { t: 'star'; x: number; y: number; r: number }
  | { t: 'building'; x: number; w: number; top: number; base: number; fill: string }
  | { t: 'window'; x: number; y: number; w: number; h: number; view: 'day' | 'night' }
  | { t: 'shelf'; x: number; y: number; w: number }
  | { t: 'frame'; x: number; y: number; w: number; h: number }
  | { t: 'rug'; x: number; y: number; w: number; fill: string }
  | { t: 'lamp'; x: number; base: number }
  | { t: 'fence'; x0: number; x1: number; base: number }
  | { t: 'seaweed'; x: number; base: number; h: number }
  | { t: 'bubble'; x: number; y: number; r: number }
  | { t: 'flower'; x: number; base: number; fill: string }
  | { t: 'path'; x0: number; x1: number; y: number }

/** 地面：平地、斜坡（左高右低）、湖（y 以下是水，倒影畫在水裡）、室內地板、水底的沙、雪地 */
export type Ground =
  | { t: 'flat'; y: number; fill: string; stroke: string }
  | { t: 'slope'; y0: number; y1: number; fill: string; stroke: string }
  | { t: 'lake'; y: number }
  | { t: 'floor'; y: number; wall: string; floor: string }
  | { t: 'seabed'; y: number }
  | { t: 'snow'; y: number }

export interface FreeArt {
  /** 版型（主題）：新的一張不跟上一張同一個版型 */
  kind: string
  sky: Sky
  ground: Ground
  deco: Deco[]
  items: FreeItem[]
  /** 這幾個 item 在湖面下畫倒影（ground 要是 lake，腳底要在湖岸上） */
  mirror?: number[]
}

/** 斜坡上某個 x 的地面高度 */
export const slopeY = (g: { y0: number; y1: number }, x: number) => g.y0 + ((g.y1 - g.y0) * x) / FW

/** 一樣東西的寬高（角色庫照它的姿勢大小，Fluent Emoji 是 200×200 的框） */
export function itemBox(it: FreeItem) {
  const id = ITEMS[it.who] ? it.who : null
  const box = id ? poseOf(id, it.pose)!.box : { w: 200, h: 200 }
  const k = it.h / box.h
  return { id, k, w: box.w * k, h: it.h, x: it.x - (box.w * k) / 2, y: it.y - it.h }
}

type Rect = [x: number, y: number, w: number, h: number]

/** 背景零件大概的框（算每一格有沒有東西用；name 是「這是什麼」，比一格跟另一格是不是一樣） */
export function decoBoxes(d: Deco): { r: Rect; name: string }[] {
  switch (d.t) {
    case 'cloud':
      return [{ r: [d.x - 26 * d.k, d.y - 38 * d.k, 118 * d.k, 80 * d.k], name: 'cloud' }]
    case 'mountain':
      return [{ r: [d.x - d.w / 2, d.base - d.h, d.w, d.h], name: 'mountain' }]
    case 'hill':
      return [{ r: [d.x - d.w / 2, d.base - d.h, d.w, d.h], name: 'hill' }]
    case 'star':
      return [{ r: [d.x - d.r, d.y - d.r, d.r * 2, d.r * 2], name: 'star' }]
    case 'building':
      return [{ r: [d.x - d.w / 2, d.top, d.w, d.base - d.top], name: 'building' }]
    case 'window':
      return [{ r: [d.x - d.w / 2, d.y, d.w, d.h], name: 'window' }]
    case 'shelf':
      return [{ r: [d.x - d.w / 2, d.y - 70, d.w, 86], name: 'shelf' }]
    case 'frame':
      return [{ r: [d.x - d.w / 2, d.y, d.w, d.h], name: 'frame' }]
    case 'rug':
      return [{ r: [d.x - d.w / 2, d.y - 24, d.w, 48], name: 'rug' }]
    case 'lamp':
      return [{ r: [d.x - 50, d.base - 300, 100, 300], name: 'lamp' }]
    case 'fence':
      return [{ r: [d.x0, d.base - 70, d.x1 - d.x0, 70], name: 'fence' }]
    case 'seaweed':
      return [{ r: [d.x - 30, d.base - d.h, 60, d.h], name: 'seaweed' }]
    case 'bubble':
      return [{ r: [d.x - d.r, d.y - d.r, d.r * 2, d.r * 2], name: 'bubble' }]
    case 'flower':
      return [{ r: [d.x - 22, d.base - 70, 44, 70], name: 'flower' }]
    case 'path':
      return [{ r: [d.x0, d.y - 30, d.x1 - d.x0, 60], name: 'path' }]
  }
}

/** 每一樣東西的框（倒影也算一樣：「水裡的鴨子」） */
export function freeBoxes(a: FreeArt): { r: Rect; name: string }[] {
  const out: { r: Rect; name: string }[] = a.deco.flatMap(decoBoxes)
  a.items.forEach((it, i) => {
    const b = itemBox(it)
    out.push({ r: [b.x, b.y, b.w, b.h], name: it.who })
    if (a.mirror?.includes(i) && a.ground.t === 'lake') out.push({ r: [b.x, it.y, b.w, Math.min(b.h, FH - it.y)], name: `${it.who}~` })
  })
  return out
}

const inter = (a: Rect, b: Rect) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]))

/** 一格裡至少佔這麼多才算「這格有它」 */
const SEEN = 0.06

/**
 * 切成 cols×rows，每一格：被蓋住多少（同一格最多算 1）、這格看得到哪些東西（佔格子 ≥ 6%，由大到小）。
 * 一格看得到的東西 = 這一片上「可以辨認的內容」；兩格看得到的一模一樣（例如都只有雲），就是兩片幾乎一樣。
 */
export function freeCells(a: FreeArt, cols: number, rows: number) {
  const boxes = freeBoxes(a)
  const cw = FW / cols
  const ch = FH / rows
  return Array.from({ length: cols * rows }, (_, i) => {
    const cell: Rect = [(i % cols) * cw, Math.floor(i / cols) * ch, cw, ch]
    const by = new Map<string, number>()
    let cover = 0
    for (const b of boxes) {
      const v = inter(cell, b.r) / (cw * ch)
      cover += v
      if (v > 0) by.set(b.name, (by.get(b.name) ?? 0) + v)
    }
    const seen = [...by.entries()].filter(([, v]) => v >= SEEN).sort((x, y) => y[1] - x[1]).map(([n]) => n)
    return { cover: Math.min(1, cover), seen }
  })
}
