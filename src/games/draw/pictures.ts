// 著色頁：每個 region 是一塊可以點擊上色的區域；deco 是不能上色的線條（眼睛、嘴巴）
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
]
