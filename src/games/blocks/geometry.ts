// 積木蓋蓋看（T-162）的版面：參考圖、底板、托盤每一塊的位置和大小。只有純函式，scripts/test-blocks.ts 測平板橫向、手機直式都放得下。
// 平板橫向（1200×786，作答區約 1200×640）：左邊參考圖（像盒子上的圖）、中間底板、右邊托盤。手機直式：參考圖在上、底板在中間、托盤在下。
import { DEPTH, type Brick } from './bricks'

export type Box = { x: number; y: number; w: number; h: number }
/** 托盤的一格：中心（積木正面的中心）、可以點的範圍 */
export type Cell = { x: number; y: number; w: number; h: number }

/** 主要可以點的東西 ≥ 這麼大（TOUCH-1：2 公分，約 90 CSS px） */
export const TOUCH = 92

/** 一塊積木畫出來多寬多高（格；含立體版的側面和凸點） */
export function brickExtent(b: Pick<Brick, 'w' | 'd'>, deep: boolean) {
  return { w: b.w + (deep ? b.d * DEPTH.x : 0), h: 1.22 + (deep ? b.d * DEPTH.z : 0) }
}

export interface BoardGeo {
  /** 整個作答區 */
  w: number
  h: number
  portrait: boolean
  ref: Box
  board: Box
  tray: Box
  /** 一格幾 px（底板上） */
  u: number
  /** 底板左邊、地面（第 0 層的底）在作答區裡的 px */
  ox: number
  gy: number
  cols: number
  rows: number
  depth: number
}

/**
 * 底板：cols 格寬（模型左右各留 1 格）、rows 層高（模型高＋1 層空的）、立體版 depth 排深。
 * 一格最大 96 px（太大的積木三歲反而對不準），最小不限（手機直式會小，只要求不跑版）。
 */
export function boardGeo(w: number, h: number, cols: number, rows: number, depth: number, deep: boolean): BoardGeo | null {
  if (w < 120 || h < 120) return null
  const portrait = h > w * 1.05
  const gap = Math.max(12, Math.min(w, h) * 0.025)
  let ref: Box
  let board: Box
  let tray: Box
  if (!portrait) {
    const rw = w * 0.24
    const tw = w * 0.3
    ref = { x: gap, y: gap, w: rw, h: Math.min(h * 0.5, rw * 1.05) }
    tray = { x: w - tw - gap * 0.5, y: gap * 0.5, w: tw, h: h - gap }
    board = { x: ref.x + rw + gap, y: gap, w: tray.x - (ref.x + rw + gap) - gap, h: h - 2 * gap }
  } else {
    ref = { x: gap, y: gap, w: w * 0.42, h: h * 0.17 }
    board = { x: gap, y: ref.y + ref.h + gap * 0.5, w: w - 2 * gap, h: h * 0.34 }
    tray = { x: gap * 0.5, y: board.y + board.h + gap, w: w - gap, h: h - (board.y + board.h + gap) - gap * 0.5 }
  }
  const dx = deep ? depth * DEPTH.x : 0
  const dz = deep ? depth * DEPTH.z : 0
  const needW = cols + dx
  const needH = rows + 0.35 + 0.25 + dz
  const u = Math.min(96, board.w / needW, board.h / needH)
  const ox = board.x + (board.w - needW * u) / 2
  const gy = board.y + board.h - (board.h - needH * u) / 2 - 0.35 * u
  return { w, h, portrait, ref, board, tray, u, ox, gy, cols, rows, depth }
}

/** 世界座標（底板的格：x 從底板最左邊算）→ 作答區的 px */
export function toPx(g: Pick<BoardGeo, 'ox' | 'gy' | 'u'>, deep: boolean, x: number, z: number, y: number) {
  const k = deep ? DEPTH : { x: 0, z: 0 }
  return { x: g.ox + (x + y * k.x) * g.u, y: g.gy - (z + y * k.z) * g.u }
}

/**
 * 托盤：一塊一塊由左到右、由上到下排（不排成一直線，看起來是倒在桌上的），每一格至少 TOUCH 見方。
 * 積木一律用同一個比例畫（大小才比得出來）；從底板的 0.8 倍開始，放不下就縮小。回傳每一格和比例。
 * 平板一定放得下；手機直式（只要求不跑版）真的放不下時，格子才縮到比 TOUCH 小。
 */
export function trayLayout(box: Box, items: readonly Pick<Brick, 'w' | 'd'>[], u: number, deep: boolean): { cells: Cell[]; ut: number } {
  for (const min of [TOUCH, 80, 68, 56, 44]) {
    const r = tryTray(box, items, u, deep, min)
    if (r) return r
  }
  return tryTray(box, items, u, deep, 30, 4) ?? { cells: items.map(() => ({ x: box.x + 15, y: box.y + 15, w: 30, h: 30 })), ut: 4 }
}

function tryTray(box: Box, items: readonly Pick<Brick, 'w' | 'd'>[], u: number, deep: boolean, min: number, floor = 14): { cells: Cell[]; ut: number } | null {
  const pad = min >= TOUCH ? 14 : 8
  for (let ut = Math.min(u * 0.8, 64); ut >= floor; ut *= 0.92) {
    const cells: Cell[] = []
    let x = box.x
    let y = box.y
    let rowH = 0
    let ok = true
    for (const b of items) {
      const e = brickExtent(b, deep)
      const cw = Math.max(min, e.w * ut + pad * 2)
      const ch = Math.max(min, e.h * ut + pad * 2)
      if (x + cw > box.x + box.w + 0.5) {
        x = box.x
        y += rowH
        rowH = 0
      }
      if (cw > box.w + 0.5) ok = false
      cells.push({ x: x + cw / 2, y: y + ch / 2, w: cw, h: ch })
      x += cw
      rowH = Math.max(rowH, ch)
    }
    if (ok && y + rowH <= box.y + box.h + 0.5) {
      // 每一排置中、整個托盤上下置中
      const off = (box.h - (y + rowH - box.y)) / 2
      const rows = new Map<number, Cell[]>()
      for (const c of cells) rows.set(Math.round(c.y - c.h / 2), [...(rows.get(Math.round(c.y - c.h / 2)) ?? []), c])
      for (const r of rows.values()) {
        const right = Math.max(...r.map((c) => c.x + c.w / 2))
        const shift = (box.x + box.w - right) / 2
        for (const c of r) c.x += shift
      }
      for (const c of cells) c.y += off
      return { cells, ut }
    }
  }
  return null
}

export interface FreeGeo {
  w: number
  h: number
  portrait: boolean
  board: Box
  u: number
  ox: number
  gy: number
  /** 顏色、形狀的格子（中心＋大小，都 ≥ TOUCH） */
  colors: Cell[]
  shapes: Cell[]
  /** 完成（綠勾勾）、清空（垃圾桶） */
  check: Cell
  clear: Cell
}

/**
 * 自由蓋的版面：平板橫向左邊底板（cols×rows）、底板右上角兩個鍵（完成、清空）、最右邊工具欄（上面 nColors 個顏色 5×2，下面 nShapes 種積木 3×3）。
 * 手機直式：底板在上、鍵在底板下面、工具欄在最下面。
 */
export function freeGeo(w: number, h: number, cols: number, rows: number, nColors: number, nShapes: number): FreeGeo | null {
  if (w < 120 || h < 120) return null
  const portrait = h > w * 1.05
  const gap = Math.max(12, Math.min(w, h) * 0.022)
  const btn = TOUCH + 6
  let board: Box
  let panel: Box
  let check: Cell
  let clear: Cell
  if (!portrait) {
    const pw = Math.min(w * 0.4, 500)
    panel = { x: w - pw - gap * 0.5, y: gap * 0.5, w: pw, h: h - gap }
    const bw = panel.x - gap * 2 - btn - gap
    board = { x: gap, y: gap, w: bw, h: h - 2 * gap }
    check = { x: board.x + bw + gap + btn / 2, y: board.y + btn / 2 + gap, w: btn, h: btn }
    clear = { x: check.x, y: check.y + btn + gap * 1.5, w: btn, h: btn }
  } else {
    board = { x: gap, y: gap, w: w - 2 * gap, h: h * 0.3 }
    check = { x: w - gap - btn / 2, y: board.y + board.h + gap + btn / 2, w: btn, h: btn }
    clear = { x: check.x - btn - gap, y: check.y, w: btn, h: btn }
    panel = { x: gap * 0.5, y: check.y + btn / 2 + gap, w: w - gap, h: h - (check.y + btn / 2 + gap) - gap * 0.5 }
  }
  const needH = rows + 0.35 + 0.25
  const u = Math.min(72, board.w / cols, board.h / needH)
  const ox = board.x + (board.w - cols * u) / 2
  const gy = board.y + board.h - (board.h - needH * u) / 2 - 0.35 * u
  // 工具欄：顏色 5 欄、形狀 3 欄，格子一樣寬；平板橫向都 ≥ TOUCH，手機直式放不下就縮（只要求不跑版）
  const cc = 5
  const sc = 3
  const crow = Math.ceil(nColors / cc)
  const srow = Math.ceil(nShapes / sc)
  const cw = Math.min(panel.w / cc, 104, (panel.h - gap) / (crow + srow))
  const sw = Math.min(panel.w / sc, 170)
  const sh = Math.max(Math.min(cw, TOUCH), Math.min((panel.h - crow * cw - gap) / srow, 130))
  const used = crow * cw + gap + srow * sh
  const y0 = panel.y + Math.max(0, (panel.h - used) / 2)
  const cx0 = panel.x + (panel.w - cc * cw) / 2
  const sx0 = panel.x + (panel.w - sc * sw) / 2
  const colors = Array.from({ length: nColors }, (_, i) => ({ x: cx0 + (i % cc) * cw + cw / 2, y: y0 + Math.floor(i / cc) * cw + cw / 2, w: cw, h: cw }))
  const shapes = Array.from({ length: nShapes }, (_, i) => ({ x: sx0 + (i % sc) * sw + sw / 2, y: y0 + crow * cw + gap + Math.floor(i / sc) * sh + sh / 2, w: sw, h: sh }))
  return { w, h, portrait, board, u, ox, gy, colors, shapes, check, clear }
}
