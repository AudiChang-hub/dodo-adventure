// 拼圖的圖切開後每一片有沒有東西（T-159，家長 2026-11-16：拼圖要到 3×3，每一片都要看得出東西，不能整片只有天空或草地）。
// 只有純函式：用故事插畫的擺法（layout）算每個角色、東西的框，加上場景本身畫好的東西（城市的大樓、派對的彩旗…），
// 看 3×3 的每一格被蓋住多少。3×3 每一格都有東西，2×2、3×2 的每一片一定也有（每一片都整個包住 3×3 的某一格）。
// scripts/test-puzzle-maze.ts 檢查圖庫每一張；縮圖總覽另外用畫出來的像素再看一次。
import { PAGE_H, PAGE_W, layout, type Cast, type PageArt, type SceneId, type Slot } from '../../art/storybook/layout'

type Rect = [x: number, y: number, w: number, h: number]

/** 場景本身畫好、看得出是什麼的東西（scenes.tsx 的座標，取大概的框） */
const MARKS: Partial<Record<SceneId, Rect[]>> = {
  city: [[30, 180, 130, 240], [170, 120, 110, 300], [700, 150, 120, 270], [830, 100, 110, 320]],
  market: [[30, 140, 384, 84], [550, 140, 384, 84], [30, 330, 380, 40], [550, 330, 380, 40]],
  party: [[0, 40, 960, 90]],
  home: [[80, 100, 180, 180], [720, 110, 150, 110]],
  bedroom: [[600, 50, 300, 230]],
  site: [[520, 85, 340, 70], [750, 85, 20, 315]],
  farm: [[40, 240, 160, 180], [600, 400, 360, 70]],
  rain: [[70, 10, 240, 110], [654, 14, 236, 110]],
  zoo: [[20, 364, 200, 90], [762, 352, 200, 100]],
  valley: [[0, 320, 120, 150], [840, 320, 120, 150]],
}

/** 一格至少要被蓋住這麼多（格子面積的比例）才算有東西 */
export const MIN_COVER = 0.15

const inter = (a: Rect, b: Rect) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]))

/** 每一格被蓋住的比例（左上第 0 格，往右、往下數；角色、東西的框加上場景的東西，同一格最多算到 1） */
export function cellCover(art: PageArt, cols: number, rows: number): number[] {
  const boxes: Rect[] = [...layout(art).flatMap((p): Rect[] => [[p.x, p.y, p.w, p.h], ...(p.rider ? [[p.rider.x, p.rider.y, p.rider.w, p.rider.h] as Rect] : [])]), ...(MARKS[art.scene] ?? [])]
  const cw = PAGE_W / cols
  const ch = PAGE_H / rows
  return Array.from({ length: cols * rows }, (_, i) => {
    const cell: Rect = [(i % cols) * cw, Math.floor(i / cols) * ch, cw, ch]
    return Math.min(1, boxes.reduce((s, b) => s + inter(cell, b), 0) / (cw * ch))
  })
}

/** 3×3 切開後空著的格子（沒有東西的格子編號） */
export const emptyCells = (art: PageArt, cols = 3, rows = 3) =>
  cellCover(art, cols, rows)
    .map((v, i) => (v >= MIN_COVER ? -1 : i))
    .filter((i) => i >= 0)

const COL: Slot[] = ['L', 'C', 'R']

/**
 * 最上面一排沒有東西的那幾欄，在天上補一樣（畫在角色後面，不算角色數）：太陽、彩虹、雨雲（風箏線條太細，切開看不出來，只在房間牆上掛）。
 * 地上的角色最高只到畫面的 1/3 以下，最上面一排一定要靠天上的東西或場景本身（大樓、彩旗、窗戶）。
 * 室內：客廳牆上的彩虹貼紙、房間牆上掛的風箏。seed 讓每一張補的不一樣。
 */
export function withSky(art: PageArt, seed = 0): PageArt {
  const top = cellCover(art, 3, 3).slice(0, 3)
  const need = [0, 1, 2].filter((c) => top[c] < MIN_COVER)
  if (!need.length) return art
  const used = new Set(art.cast.map((c) => c.who))
  const opts: Record<number, string[]> =
    art.scene === 'rain'
      ? { 0: ['raincloud'], 1: ['raincloud'], 2: ['raincloud'] }
      : art.scene === 'home'
        ? { 0: ['rainbow'], 1: ['rainbow'], 2: ['rainbow'] }
        : art.scene === 'bedroom'
          ? { 0: ['kite'], 1: ['kite'], 2: ['moon'] }
          : { 0: ['rainbow', 'sun', 'raincloud'], 1: ['sun', 'rainbow', 'raincloud'], 2: ['sun', 'rainbow', 'raincloud'] }
  const back: Cast[] = []
  for (const c of need) {
    const list = opts[c]
    let who = list[(seed + c) % list.length]
    // 同一張不要兩個太陽、兩道彩虹
    for (let k = 0; k < list.length && (who === 'sun' || who === 'rainbow') && used.has(who); k++) who = list[(seed + c + k + 1) % list.length]
    used.add(who)
    // 風箏線條細、雨雲顏色淡，畫大一點（L）才看得出來
    back.push({ who, at: COL[c], size: who === 'kite' || who === 'raincloud' ? 'L' : 'M', ...(who === 'sun' && seed % 2 ? { pose: 'face' } : {}) })
  }
  return { ...art, back: [...(art.back ?? []), ...back] }
}

/** 每一張圖補天上東西用的種子（照 id 算，圖庫順序變了也一樣） */
export const seedOf = (id: string) => [...id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7) % 1000
