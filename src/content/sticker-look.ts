// 隨機生成的貼紙外觀（2026-10-28 家長：「希望可以隨機繪圖，相同樣式但配色不同也算是新的，或是背景不同」）。
//
// 一張貼紙 = 主角（Fluent Emoji，sticker-art.ts）＋ 一個種子（seed）。外觀完全由 (主角, seed) 決定：
//   外框形狀 × 背景色票 × 背景花紋（含角度）× 亮面 × 閃粉 × 主角的輕微旋轉、大小、左右翻轉。
// 存檔、同步只存 { art, seed }，重畫一定一模一樣（貼紙本、雲端、重新載入都不會變樣）。
//
// 重要：SHAPES、PALETTES、PATTERNS 只能「往後加」，不能改順序、刪除或改數值；lookOf 取亂數的順序也不能改，
// 否則孩子已經貼在本子裡的貼紙會變樣。要加新的維度，就在 lookOf 最後面再多取亂數。
//
// 主角不重新上色：Fluent Emoji 的陰影和五官是分開的色塊，色相旋轉後膚色、眼睛會變髒（實測），只變外框、背景與擺放。
// 撞色排除：主角面積大的顏色（sticker-tones.generated.ts）跟背景太接近（CIE ΔE 太小）的色票不會被抽到。
import { EMOJI } from '../art/emoji.generated'
import { BOXES, TONES } from './sticker-tones.generated'

// ── 外框形狀（viewBox 0 0 120 120，中心 60,60）──────────────────────
const C = 60
const R = 45
/** 白色割線邊的寬度（描在外框路徑上，一半在外面） */
const EDGE = 9

const f1 = (n: number) => Math.round(n * 10) / 10
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z`
/** 以中心為原點的極座標曲線 */
const polar = (r: (t: number) => number, n = 180, cy = C) =>
  poly(Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2
    return [C + Math.cos(t) * r(t), cy + Math.sin(t) * r(t)]
  }))

/** 雲朵：幾個圓的聯集，從中心往外打射線取最遠的交點 */
function cloud() {
  const circles: [number, number, number][] = [
    [60, 74, 30],
    [33, 70, 20],
    [87, 70, 20],
    [44, 50, 21],
    [73, 46, 25],
  ]
  const cy = 62
  return polar(
    (t) => {
      const dx = Math.cos(t)
      const dy = Math.sin(t)
      let best = 0
      for (const [x, y, r] of circles) {
        const ox = C - x
        const oy = cy - y
        const b = ox * dx + oy * dy
        const c = ox * ox + oy * oy - r * r
        const d = b * b - c
        if (d >= 0) best = Math.max(best, -b + Math.sqrt(d))
      }
      return best
    },
    200,
    cy,
  )
}

function heart() {
  const pts: [number, number][] = []
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * Math.PI * 2
    pts.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))])
  }
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const k = Math.min(96 / (x1 - x0), 88 / (y1 - y0))
  return poly(pts.map(([x, y]) => [C + (x - (x0 + x1) / 2) * k, C + 2 + (y - (y0 + y1) / 2) * k]))
}

function star(points: number, inner: number) {
  const pts: [number, number][] = []
  for (let i = 0; i < points * 2; i++) {
    const t = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? R * inner : R * 1.08
    pts.push([C + Math.cos(t) * r, C + 3 + Math.sin(t) * r])
  }
  return poly(pts)
}

export interface ShapeDef {
  id: string
  d: string
  /** 主角的大小（佔 120 的比例）與中心的上下位移：星形、愛心的可用空間比較小 */
  k: number
  dy: number
  /** 閃粉可以放的半徑（佔 R） */
  ring: number
}

export const SHAPES: ShapeDef[] = [
  { id: 'circle', d: polar(() => R), k: 0.6, dy: 0, ring: 0.8 },
  { id: 'scallop', d: polar((t) => R * (0.95 + 0.05 * Math.cos(16 * t)), 192), k: 0.58, dy: 0, ring: 0.76 },
  { id: 'flower', d: polar((t) => R * (0.87 + 0.13 * Math.cos(6 * t))), k: 0.54, dy: 0, ring: 0.72 },
  { id: 'star', d: star(5, 0.64), k: 0.46, dy: 5, ring: 0.66 },
  { id: 'heart', d: heart(), k: 0.47, dy: -1, ring: 0.66 },
  { id: 'cloud', d: cloud(), k: 0.54, dy: 6, ring: 0.7 },
  { id: 'squircle', d: polar((t) => (R * 0.97) / Math.pow(Math.abs(Math.cos(t)) ** 4 + Math.abs(Math.sin(t)) ** 4, 1 / 4)), k: 0.62, dy: 0, ring: 0.84 },
  // 六角形：頂點留尖的，白邊的圓角接合會把角磨圓
  { id: 'hexagon', d: polar(() => R * 1.04, 6), k: 0.58, dy: 0, ring: 0.74 },
]

// ── 背景色票：紙感螢幕上的柔和色（不螢光、不高飽和），pat 是同色系深一階的花紋色 ───────
export interface Palette {
  id: string
  bg: string
  pat: string
}
export const PALETTES: Palette[] = [
  { id: 'mint', bg: '#DDEFE3', pat: '#C3E2CD' },
  { id: 'apricot', bg: '#FBE3D2', pat: '#F2CBB0' },
  { id: 'sky', bg: '#DAE7F4', pat: '#C0D5EB' },
  { id: 'butter', bg: '#F8EDC6', pat: '#EDDB9E' },
  { id: 'lilac', bg: '#E7E1F3', pat: '#D2C8E9' },
  { id: 'blush', bg: '#F6DEE3', pat: '#EBC4CC' },
  { id: 'sage', bg: '#E1E9D2', pat: '#CAD7B4' },
  { id: 'seafoam', bg: '#D6EDEA', pat: '#BADFDA' },
  { id: 'sand', bg: '#EFE6D5', pat: '#DFD1B7' },
  { id: 'periwinkle', bg: '#DDE0F4', pat: '#C5CAEB' },
  // 中間調：給白色、淺色的主角（雪人、雪花、雲）有足夠的對比
  { id: 'dusk', bg: '#B9CBE3', pat: '#A6BBD9' },
  { id: 'teal', bg: '#B3D6CE', pat: '#9FCAC0' },
  { id: 'clay', bg: '#EBC3AE', pat: '#E0B099' },
  { id: 'heather', bg: '#CFC3E3', pat: '#BFB1DA' },
]

// ── 背景花紋 ───────────────────────────────────────────────────
export const PATTERNS = ['plain', 'dots', 'stripes', 'stars', 'waves', 'plus', 'rings'] as const
export type PatternId = (typeof PATTERNS)[number]

function patternDef(id: PatternId, color: string, rot: number, pid: string): string {
  const open = (w: number, h: number) => `<pattern id="${pid}" width="${w}" height="${h}" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot})">`
  switch (id) {
    case 'dots':
      return `${open(13, 13)}<circle cx="3.2" cy="3.2" r="2.1" fill="${color}"/><circle cx="9.7" cy="9.7" r="2.1" fill="${color}"/></pattern>`
    case 'stripes':
      return `${open(11, 11)}<rect width="4.6" height="11" fill="${color}"/></pattern>`
    case 'stars':
      return `${open(22, 22)}<path d="M6 1.6l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z" fill="${color}"/><path d="M17 12.6l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z" fill="${color}"/></pattern>`
    case 'waves':
      return `${open(24, 10)}<path d="M0 5 Q6 0.8 12 5 T24 5" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/></pattern>`
    case 'plus':
      return `${open(16, 16)}<path d="M4 1.6v4.8M1.6 4h4.8M12 9.6v4.8M9.6 12h4.8" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/></pattern>`
    case 'rings':
      return `${open(18, 18)}<circle cx="9" cy="9" r="4" fill="none" stroke="${color}" stroke-width="2"/></pattern>`
    default:
      return ''
  }
}

// ── 亂數與顏色 ─────────────────────────────────────────────────
/** 固定的亂數（mulberry32）：同一個種子永遠同一串 */
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const strHash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function lab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)]
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const dE = (a: string, b: string) => {
  const [p, q] = [lab(a), lab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/** 撞色規則：主角佔 15% 以上的每一個顏色，跟背景的 ΔE 都要夠大；主角整體也要跟背景分得開 */
const MIN_DE_TONE = 15
const MIN_DE_MEAN = 21
export function paletteOk(art: string, p: Palette): boolean {
  const tones = TONES[art] ?? []
  if (!tones.length) return true
  let sum = 0
  let w = 0
  for (const [hex, share] of tones) {
    const d = dE(hex, p.bg)
    if (share >= 0.15 && d < MIN_DE_TONE) return false
    sum += d * share
    w += share
  }
  return sum / w >= MIN_DE_MEAN
}

// ── 一張貼紙的外觀 ─────────────────────────────────────────────
export interface Look {
  shape: ShapeDef
  palette: Palette
  pattern: PatternId
  patRot: number
  gloss: boolean
  sparkles: { x: number; y: number; s: number }[]
  rot: number
  scale: number
  flip: boolean
}

const cache = new Map<string, Look>()

/** (主角, 種子) → 外觀。取亂數的順序是存檔格式的一部分，不能改（見檔案開頭） */
export function lookOf(art: string, seed: number): Look {
  const key = `${art}:${seed}`
  const hit = cache.get(key)
  if (hit) return hit
  const r = prng(seed ^ strHash(art))
  const shape = SHAPES[Math.floor(r() * SHAPES.length)]
  // 色票：抽到撞色的就再抽（最多 16 次），還是不行就用跟主角差最多的那一個
  let palette: Palette | null = null
  for (let i = 0; i < 16 && !palette; i++) {
    const p = PALETTES[Math.floor(r() * PALETTES.length)]
    if (paletteOk(art, p)) palette = p
  }
  palette ??= [...PALETTES].sort((a, b) => score(art, b) - score(art, a))[0]
  const pattern = PATTERNS[Math.floor(r() * PATTERNS.length)]
  const patRot = [0, 45, -30, 90][Math.floor(r() * 4)]
  const gloss = r() < 0.6
  // 閃粉要克制：約 3 成的貼紙有 2–3 顆，放在主角外圍的一圈上；花紋是小星星的就不放
  const nSpark = r() < 0.32 && pattern !== 'stars' ? 2 + Math.floor(r() * 2) : 0
  const base = r() * Math.PI * 2
  const sparkles = Array.from({ length: nSpark }, (_, i) => {
    const t = base + i * ((Math.PI * 2) / 3) + (r() - 0.5) * 0.6
    const rr = R * shape.ring * (0.92 + r() * 0.12)
    return { x: f1(C + Math.cos(t) * rr), y: f1(C + shape.dy * 0.5 + Math.sin(t) * rr), s: f1(2.6 + r() * 1.8) }
  })
  const rot = f1((r() - 0.5) * 16)
  const scale = f1(0.94 + r() * 0.1)
  const flip = r() < 0.3
  const look = { shape, palette, pattern, patRot, gloss, sparkles, rot, scale, flip }
  cache.set(key, look)
  return look
}
const score = (art: string, p: Palette) => Math.min(...(TONES[art] ?? [['#888888', 1]]).map(([hex]) => dE(hex, p.bg)))

/** 新的種子（32 位元整數） */
export const newSeed = () => (Math.random() * 4294967296) >>> 0

const svgCache = new Map<string, string>()

/**
 * 畫成 SVG 字串（App 用 dangerouslySetInnerHTML，scripts 用 sharp 轉成圖片，兩邊同一份）。
 * ghost：蓋著的貼紙（還沒集滿的卡片上那一張）：一樣的外框，紙色、主角只剩淡淡的剪影。
 */
export function stickerSvg(art: string, seed: number, ghost = false): string {
  const key = `${art}:${seed}:${ghost ? 1 : 0}`
  const hit = svgCache.get(key)
  if (hit) return hit
  const e = EMOJI[art]
  const L = lookOf(art, seed)
  const id = `k${(strHash(key) % 1e8).toString(36)}`
  const d = L.shape.d
  // 主角照實際畫到的範圍縮放、置中（有的圖示填滿整格、有的只佔一半）；長的（車子）和圓的（臉）看起來差不多大
  const [bx, by, bw, bh] = BOXES[art] ?? [0.5, 0.5, 0.86, 0.86]
  const dim = Math.max(bw, bh) * 0.8 + Math.sqrt(bw * bh) * 0.2
  const size = 120 * L.shape.k * L.scale * 0.86
  const s = Math.round((size / (e.w * dim)) * 1000) / 1000
  const subject = (filter: string) =>
    `<g filter="url(#${id}${filter})" transform="translate(${C} ${C + L.shape.dy}) rotate(${L.rot}) scale(${L.flip ? -s : s} ${s}) translate(${f1(-bx * e.w)} ${f1(-by * e.h)})">${e.b}</g>`
  const shadow = `<path d="${d}" transform="translate(0 2.6)" fill="rgba(46,42,37,.11)" stroke="rgba(46,42,37,.11)" stroke-width="${EDGE}" stroke-linejoin="round"/>`
  let out: string
  if (ghost) {
    out =
      `<defs><filter id="${id}f" x="-10%" y="-10%" width="120%" height="120%"><feColorMatrix type="matrix" values="0 0 0 0 0.72 0 0 0 0 0.67 0 0 0 0 0.60 0 0 0 1 0"/></filter></defs>` +
      shadow +
      `<path d="${d}" fill="#EDE6D9" stroke="#F8F4EC" stroke-width="${EDGE}" stroke-linejoin="round"/>` +
      `<path d="${d}" fill="none" stroke="rgba(46,42,37,.16)" stroke-width="1.6" stroke-dasharray="3 4" stroke-linecap="round" transform="translate(${C} ${C}) scale(.9) translate(${-C} ${-C})"/>` +
      subject('f')
  } else {
    const pat = patternDef(L.pattern, L.palette.pat, L.patRot, `${id}p`)
    const sparkle = (x: number, y: number, k: number) =>
      `<path d="M${x} ${f1(y - k)}Q${f1(x + k * 0.18)} ${f1(y - k * 0.18)} ${f1(x + k)} ${y}Q${f1(x + k * 0.18)} ${f1(y + k * 0.18)} ${x} ${f1(y + k)}Q${f1(x - k * 0.18)} ${f1(y + k * 0.18)} ${f1(x - k)} ${y}Q${f1(x - k * 0.18)} ${f1(y - k * 0.18)} ${x} ${f1(y - k)}Z" fill="#FFFDF8" opacity=".92"/>`
    out =
      `<defs><clipPath id="${id}c"><path d="${d}"/></clipPath>${pat}` +
      // 主角自己也有一圈細細的白邊和一點點影子：像真的貼紙一樣「浮」在底上
      `<filter id="${id}o" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius=".9" result="m"/><feFlood flood-color="#FFFDF8"/><feComposite in2="m" operator="in" result="w"/><feDropShadow in="w" dx="0" dy=".5" stdDeviation=".45" flood-color="#2E2A25" flood-opacity=".16" result="ws"/><feMerge><feMergeNode in="ws"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
      shadow +
      `<path d="${d}" fill="#FFFDF8" stroke="#FFFDF8" stroke-width="${EDGE}" stroke-linejoin="round"/>` +
      `<g clip-path="url(#${id}c)"><rect width="120" height="120" fill="${L.palette.bg}"/>${pat ? `<rect width="120" height="120" fill="url(#${id}p)"/>` : ''}` +
      (L.gloss ? `<path d="M${C - R * 0.74} ${C - R * 0.12}A${R * 0.78} ${R * 0.78} 0 0 1 ${C - R * 0.12} ${C - R * 0.74}" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="4.2" stroke-linecap="round"/>` : '') +
      `</g>` +
      `<path d="${d}" fill="none" stroke="rgba(46,42,37,.07)" stroke-width="1"/>` +
      L.sparkles.map((p) => sparkle(p.x, p.y, p.s)).join('') +
      subject('o')
  }
  out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true" style="display:block;overflow:visible">${out}</svg>`
  svgCache.set(key, out)
  return out
}

/** 參數空間（家長區、回報用）：主角 × 形狀 × 色票 × 花紋 × 花紋角度 × 亮面 × 閃粉（有/無）× 翻轉，旋轉與大小另外連續變化 */
export const LOOK_SPACE = { shapes: SHAPES.length, palettes: PALETTES.length, patterns: PATTERNS.length, patRots: 4, gloss: 2, sparkle: 2, flip: 2 }
