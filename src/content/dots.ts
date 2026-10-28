// 連點成圖的圖（src/games/draw/DotsGame.tsx；出題規則在 src/games/pick.ts 的 planDots）。
//
// 2026-10-28 家長回饋：「起點又是 1，最後回到 1 很奇怪」→ 起點不是數字，是「家」（豆豆開車出門、繞一圈回家）。
// pts[0] 是家，pts[1..] 依序是 1、2、3…；最後一筆從最後一個數字連回家，形狀就閉合了。
// 所以每張圖用到的數字是 1 到 pts.length - 1，數字永遠是「出門後第幾站」，不會有兩個 1。
//
// 方向：第一筆盡量是「往右」或「往下」（運筆發展順序裡最容易的兩種，見 TraceGame 的 ROADS），順時針繞一圈。
// 座標系是 1000×600（和 DotsGame 的 viewBox 一樣），上下留空間給數字。
// 最上面的點 y 至少 100：字幕膠囊蓋在 viewBox 最上面約 45 的地方，家的圓（半徑 44）不能被蓋到。

export interface DotsPic {
  id: string
  /** 從第幾級開始出現（級數越高點越多） */
  level: number
  /** 閉合後塗上的顏色（低彩度，紙感） */
  fill: string
  /** pts[0] 是家（起點、終點），其餘是 1、2、3… */
  pts: [number, number][]
  /** 閉合變彩色之後才浮出來的小細節（門窗、眼睛、波浪），讓圖案「活起來」 */
  deco?: { d: string; fill?: string; stroke?: string; width?: number; opacity?: number }[]
}

const INK = '#2E2A25'

function star(): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? 104 : 238
    return [Math.round(500 + Math.cos(a) * r), Math.round(338 + Math.sin(a) * r)] as [number, number]
  })
}

const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`
const rect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} H${x} V${y + r} Q${x} ${y} ${x + r} ${y} Z`
/** 白色的一抹反光：形狀變彩色後的「紙上的光」 */
const shine = (d: string) => ({ d, stroke: '#FFFFFF', width: 14, opacity: 0.55 })

export const DOTS_PICS: DotsPic[] = [
  // ── 1 級：數到 2、3。三角形、正方形最容易看懂「繞一圈回家」 ──
  { id: 'triangle', level: 1, fill: '#F1D27C', pts: [[500, 100], [790, 500], [210, 500]], deco: [shine('M440 230 L370 330')] },
  { id: 'square', level: 1, fill: '#A3C4E4', pts: [[310, 120], [690, 120], [690, 500], [310, 500]], deco: [shine('M360 180 V290')] },
  // ── 2 級：數到 3、4 ──
  { id: 'diamond', level: 2, fill: '#BFB2DF', pts: [[500, 100], [770, 320], [500, 540], [230, 320]], deco: [shine('M445 190 L345 272')] },
  {
    id: 'house',
    level: 2,
    fill: '#E99A84',
    pts: [[500, 100], [700, 280], [700, 520], [300, 520], [300, 280]],
    deco: [
      { d: rect(452, 404, 96, 116, 14), fill: '#B9705E', stroke: INK, width: 5 },
      { d: rect(338, 318, 74, 70, 10), fill: '#F6E7B8', stroke: INK, width: 5 },
      { d: rect(588, 318, 74, 70, 10), fill: '#F6E7B8', stroke: INK, width: 5 },
      { d: circ(530, 466, 6), fill: INK },
    ],
  },
  // ── 3 級：數到 5（Sam 會數到 5；這一級以上的圖都在 5 以內，等數字解鎖到 10 才出 4 級） ──
  {
    id: 'boat',
    level: 3,
    fill: '#93BADF',
    pts: [[470, 100], [800, 410], [690, 530], [330, 530], [200, 410], [470, 410]],
    deco: [
      { d: 'M470 100 L470 62 L540 82 Z', fill: '#E99A84', stroke: INK, width: 5 },
      { d: `${circ(400, 470, 16)} ${circ(500, 470, 16)} ${circ(600, 470, 16)}`, fill: '#FBF8F2', stroke: INK, width: 5 },
      { d: 'M170 574 q45 -22 90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0', stroke: '#93BADF', width: 9 },
    ],
  },
  {
    id: 'heart',
    level: 3,
    fill: '#F09DB9',
    pts: [[500, 190], [650, 100], [790, 230], [500, 530], [210, 230], [350, 100]],
    deco: [shine('M300 190 Q320 150 360 140')],
  },
  // ── 4 級：數到 6–9，數字解鎖到 10（adaptive.unlockedNumbers）才會出現 ──
  {
    id: 'fish',
    level: 4,
    fill: '#F0B088',
    // 尾巴接身體的兩個點（2、5）上下拉開 100：比碰到的範圍（HIT 62）的兩倍還寬一點，不會一次碰到兩個
    pts: [[150, 300], [430, 150], [690, 250], [870, 150], [870, 450], [690, 350], [430, 450]],
    deco: [
      { d: circ(290, 272, 16), fill: INK },
      { d: 'M385 222 Q420 300 385 378', stroke: INK, width: 6 },
      { d: `${circ(110, 190, 14)} ${circ(78, 132, 9)}`, stroke: '#93BADF', width: 6 },
    ],
  },
  {
    id: 'star',
    level: 4,
    fill: '#F1D27C',
    pts: star(),
    deco: [
      { d: `${circ(468, 318, 11)} ${circ(532, 318, 11)}`, fill: INK },
      { d: 'M466 356 Q500 384 534 356', stroke: INK, width: 6 },
    ],
  },
]

/** 這張圖用到的數字（1 到 n） */
export const dotsNumbers = (p: DotsPic) => p.pts.length - 1

/**
 * 這一級能出的圖：級數以內、而且最大的數字不超過已經解鎖的數字（不教不考：Sam 會數到 5，就不會出現 6）。
 * 一張都不符合（不會發生，保險）就退回 1 級。
 */
export function dotsPool(lv: number, unlocked: number): DotsPic[] {
  const fit = DOTS_PICS.filter((p) => p.level <= lv && dotsNumbers(p) <= unlocked)
  return fit.length ? fit : DOTS_PICS.filter((p) => p.level === 1)
}
