// 著色頁（蠟筆著色 ColoringGame）：每個 region 是一塊區域，「幫忙不塗出線」時筆觸會被 clip 在下筆的那一塊裡
// （後面的 region 蓋在前面的上面，例如肚子在身體上）；deco 是線稿上的其他線條（眼睛、嘴巴），永遠在最上層
export interface Region {
  id: string
  d: string
}

export interface Picture {
  id: string
  title: string
  transform?: string
  regions: Region[]
  deco: string[]
  /** 塗成墨色的 deco（眼睛）；其餘 deco 只有線條 */
  ink?: number[]
}

const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`
const rect = (x: number, y: number, w: number, h: number, r = 0) =>
  `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`

export const PICTURES: Picture[] = [
  {
    id: 'dodo',
    title: '豆豆',
    transform: 'translate(240 30) scale(2.3)',
    regions: [
      { id: 'spikes', d: [[58, 120], [76, 106], [96, 98], [116, 46], [134, 36]].map(([x, y]) => `M${x} ${y + 6} l9 -17 l11 15 Z`).join(' ') },
      { id: 'tail', d: 'M80 150 C52 152 24 140 6 116 C30 128 54 130 82 126 Z' },
      { id: 'leg1', d: ell(92, 190, 20, 15) },
      { id: 'leg2', d: ell(138, 192, 19, 14) },
      { id: 'body', d: ell(114, 148, 56, 46) },
      { id: 'belly', d: ell(132, 158, 29, 31) },
      { id: 'head', d: ell(152, 82, 60, 48) },
      { id: 'cheek', d: ell(184, 98, 10, 6) },
    ],
    deco: [ell(168, 70, 8, 10), 'M175 102 Q188 114 201 100'],
    ink: [0],
  },
  {
    id: 'car',
    title: '小汽車',
    transform: 'translate(120 60) scale(2.2)',
    regions: [
      { id: 'sun', d: ell(310, 40, 30, 30) },
      { id: 'roof', d: 'M110 110 Q120 60 170 60 L240 60 Q280 60 296 110 Z' },
      { id: 'win1', d: 'M128 106 Q136 74 168 74 L196 74 L196 106 Z' },
      { id: 'win2', d: 'M210 74 L238 74 Q266 74 278 106 L210 106 Z' },
      { id: 'body', d: 'M40 150 Q40 110 80 110 L300 110 Q340 110 340 150 L340 176 Q340 190 326 190 L54 190 Q40 190 40 176 Z' },
      { id: 'light', d: ell(326, 140, 10, 10) },
      { id: 'wheel1', d: ell(110, 192, 30, 30) },
      { id: 'wheel2', d: ell(270, 192, 30, 30) },
    ],
    deco: [ell(110, 192, 11, 11), ell(270, 192, 11, 11)],
  },
  {
    id: 'house',
    title: '房子',
    transform: 'translate(190 20) scale(2.35)',
    regions: [
      { id: 'sun', d: ell(40, 40, 30, 30) },
      { id: 'chimney', d: rect(220, 30, 30, 60, 4) },
      { id: 'roof', d: 'M60 120 L170 30 L280 120 Z' },
      { id: 'wall', d: rect(80, 120, 180, 120, 6) },
      { id: 'door', d: rect(150, 170, 44, 70, 10) },
      { id: 'win1', d: rect(96, 140, 40, 40, 6) },
      { id: 'win2', d: rect(208, 140, 40, 40, 6) },
      { id: 'grass', d: 'M0 240 Q170 220 340 240 L340 252 L0 252 Z' },
    ],
    deco: [],
  },
  {
    id: 'balloons',
    title: '氣球',
    transform: 'translate(230 10) scale(2.3)',
    regions: [
      { id: 'cloud', d: 'M220 70 a22 22 0 0 1 40 -10 a26 26 0 0 1 46 14 a18 18 0 0 1 0 34 L226 108 a20 20 0 0 1 -6 -38 Z' },
      { id: 'b1', d: ell(70, 90, 40, 50) },
      { id: 'b2', d: ell(150, 70, 42, 52) },
      { id: 'b3', d: ell(220, 150, 38, 48) },
      { id: 'gift', d: rect(110, 210, 70, 44, 6) },
    ],
    deco: ['M70 140 Q80 180 130 210', 'M150 122 Q140 170 145 210', 'M220 198 Q200 210 170 212', 'M145 210 L145 254', 'M110 232 L180 232'],
  },
  // ── 主題式冒險（content/themes.ts）的著色頁：公車旅行、消防救援、海洋、下雨天 ──
  {
    id: 'bus',
    title: '公車',
    transform: 'translate(120 70) scale(2.2)',
    regions: [
      { id: 'body', d: rect(30, 60, 300, 130, 20) },
      { id: 'stripe', d: rect(30, 140, 300, 18) },
      { id: 'win1', d: rect(50, 78, 50, 46, 8) },
      { id: 'win2', d: rect(110, 78, 50, 46, 8) },
      { id: 'win3', d: rect(170, 78, 50, 46, 8) },
      { id: 'door', d: rect(236, 78, 40, 100, 8) },
      { id: 'front', d: rect(286, 78, 30, 46, 8) },
      { id: 'light', d: ell(318, 168, 8, 8) },
      { id: 'wheel1', d: ell(95, 192, 26, 26) },
      { id: 'wheel2', d: ell(262, 192, 26, 26) },
    ],
    deco: [ell(95, 192, 9, 9), ell(262, 192, 9, 9), 'M256 92 V164'],
  },
  {
    id: 'firetruck',
    title: '消防車',
    transform: 'translate(120 64) scale(2.2)',
    regions: [
      { id: 'tank', d: rect(30, 112, 228, 78, 10) },
      { id: 'cab', d: 'M248 92 L298 92 Q326 92 334 128 L340 176 Q340 190 326 190 L248 190 Z' },
      { id: 'win', d: 'M262 104 L294 104 Q314 106 320 134 L262 134 Z' },
      { id: 'ladder', d: rect(46, 82, 190, 18, 6) },
      { id: 'box', d: rect(60, 130, 74, 40, 6) },
      { id: 'siren', d: ell(276, 80, 15, 11) },
      { id: 'wheel1', d: ell(90, 192, 26, 26) },
      { id: 'wheel2', d: ell(286, 192, 26, 26) },
    ],
    deco: [ell(90, 192, 9, 9), ell(286, 192, 9, 9), 'M84 82 V100 M122 82 V100 M160 82 V100 M198 82 V100', 'M60 150 H134'],
  },
  {
    id: 'fish',
    title: '小魚',
    transform: 'translate(150 30) scale(2.15)',
    regions: [
      { id: 'tail', d: 'M262 130 L340 76 Q326 130 340 184 Z' },
      { id: 'top', d: 'M128 70 Q168 18 214 68 Z' },
      { id: 'low', d: 'M150 188 Q172 226 204 190 Z' },
      { id: 'body', d: ell(170, 130, 108, 68) },
      { id: 'stripe', d: 'M190 64 Q222 130 190 196 L172 196 Q202 130 172 64 Z' },
      { id: 'bubble1', d: ell(52, 58, 15, 15) },
      { id: 'bubble2', d: ell(30, 104, 9, 9) },
      { id: 'weed', d: 'M318 250 Q300 214 318 186 Q340 214 334 250 Z' },
    ],
    deco: [ell(110, 116, 9, 10), 'M88 150 Q100 160 114 152'],
    ink: [0],
  },
  {
    id: 'umbrella',
    title: '雨傘',
    transform: 'translate(150 24) scale(2.15)',
    regions: [
      { id: 'left', d: 'M30 150 Q36 42 170 40 Q114 68 104 150 Z' },
      { id: 'mid', d: 'M104 150 Q114 68 170 40 Q226 68 236 150 Z' },
      { id: 'right', d: 'M236 150 Q226 68 170 40 Q304 42 310 150 Z' },
      { id: 'drop1', d: 'M40 186 Q52 204 40 214 Q28 204 40 186 Z' },
      { id: 'drop2', d: 'M300 186 Q312 204 300 214 Q288 204 300 186 Z' },
      { id: 'drop3', d: 'M268 224 Q280 242 268 252 Q256 242 268 224 Z' },
      { id: 'drop4', d: 'M70 226 Q82 244 70 254 Q58 244 70 226 Z' },
    ],
    deco: ['M170 150 V232 Q170 252 150 252 Q132 252 132 236', 'M170 40 V24'],
  },
]
