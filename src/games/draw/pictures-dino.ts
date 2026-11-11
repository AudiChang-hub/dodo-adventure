// 著色本的恐龍（T-138，家長 2026-11-11：「像恐龍就來個 50 隻」）。
// 10 種恐龍（暴龍、腕龍、三角龍、劍龍、甲龍、翼龍、副櫛龍、棘龍、迅猛龍、腫頭龍），每一種有自己的身體形狀，
// 再配 5 種場景（太陽和雲、椰子樹、恐龍蛋、火山、花）、有的戴帽子或領結，合起來 50 張，每張的組合都不一樣。
// 線稿都是自己用簡單的形狀畫的，區塊大、三歲塗得了。
// 座標：恐龍站在 x 0～340、地面 y 245 的框裡（面向右邊）；場景放在左右兩邊（x -110～-5、345～450）。
import { egg, ell, rect, type Picture, type Region } from './shapes'

interface Dino {
  id: string
  title: string
  regions: Region[]
  deco: string[]
  /** deco 裡塗成墨色的（眼睛） */
  ink: number[]
  /** 頭頂的位置：戴帽子、領結的地方 */
  hat: { x: number; y: number }
  bow: { x: number; y: number }
}

const leg = (id: string, x: number, y: number, w = 30, h = 52) => ({ id, d: rect(x, y, w, h, 12) })

const SPECIES: Dino[] = [
  {
    id: 'trex',
    title: '暴龍',
    regions: [
      { id: 'tail', d: 'M120 140 C80 145 40 170 6 208 C48 196 92 186 128 180 Z' },
      leg('legA', 128, 175, 34, 68),
      { id: 'body', d: ell(170, 150, 64, 50) },
      { id: 'belly', d: ell(188, 166, 34, 28) },
      leg('legB', 182, 180, 38, 64),
      { id: 'arm', d: 'M220 140 Q250 140 250 160 Q240 166 226 156 Z' },
      { id: 'neck', d: 'M196 96 L236 96 L232 132 L192 136 Z' },
      { id: 'head', d: 'M196 72 Q206 36 256 38 L298 46 Q320 54 318 80 L316 98 Q300 108 270 104 L238 108 Q206 112 198 96 Z' },
    ],
    deco: [ell(256, 62, 7, 8), 'M262 104 l6 9 l6 -9 l6 9 l6 -9', 'M304 62 l6 2'],
    ink: [0],
    hat: { x: 248, y: 40 },
    bow: { x: 214, y: 118 },
  },
  {
    id: 'long',
    title: '腕龍',
    regions: [
      { id: 'tail', d: 'M84 160 C46 166 18 190 4 220 C40 208 72 198 96 190 Z' },
      leg('legA', 100, 186, 30, 58),
      leg('legC', 186, 186, 30, 58),
      { id: 'body', d: ell(150, 168, 82, 48) },
      leg('legB', 124, 192, 32, 54),
      leg('legD', 210, 190, 32, 56),
      { id: 'neck', d: 'M186 150 C206 110 222 64 246 36 L272 48 C252 76 238 120 226 162 Z' },
      { id: 'head', d: ell(268, 38, 32, 20) },
    ],
    deco: [ell(278, 32, 5, 6), 'M276 48 Q286 52 296 46'],
    ink: [0],
    hat: { x: 262, y: 20 },
    bow: { x: 232, y: 96 },
  },
  {
    id: 'trike',
    title: '三角龍',
    regions: [
      { id: 'tail', d: 'M90 160 C54 160 28 176 10 198 C46 192 72 188 98 184 Z' },
      leg('legA', 100, 190, 32, 54),
      leg('legC', 190, 190, 32, 54),
      { id: 'body', d: ell(160, 166, 80, 50) },
      leg('legB', 124, 194, 34, 50),
      leg('legD', 214, 192, 34, 52),
      { id: 'frill', d: ell(244, 124, 46, 58) },
      { id: 'head', d: 'M230 132 Q252 110 292 124 L322 150 Q320 172 296 174 L252 172 Q228 162 230 132 Z' },
      { id: 'horn1', d: 'M246 118 L254 64 L264 118 Z' },
      { id: 'horn2', d: 'M268 120 L288 70 L284 124 Z' },
      { id: 'horn3', d: 'M300 136 L318 114 L312 142 Z' },
    ],
    deco: [ell(274, 142, 6, 7), 'M296 164 Q306 168 314 162'],
    ink: [0],
    hat: { x: 244, y: 70 },
    bow: { x: 224, y: 176 },
  },
  {
    id: 'stego',
    title: '劍龍',
    regions: [
      ...[96, 130, 164, 198].map((x, i) => ({ id: `plate${i}`, d: `M${x - 20} ${142 - (i === 1 || i === 2 ? 6 : 0)} L${x} ${96 - (i === 1 || i === 2 ? 14 : 0)} L${x + 20} ${142 - (i === 1 || i === 2 ? 6 : 0)} Z` })),
      { id: 'tail', d: 'M84 170 C52 172 26 182 6 198 C40 200 72 196 96 192 Z' },
      { id: 'spike1', d: 'M26 186 L14 160 L38 182 Z' },
      { id: 'spike2', d: 'M44 182 L40 154 L58 180 Z' },
      leg('legA', 100, 190, 30, 54),
      leg('legC', 186, 190, 30, 54),
      { id: 'body', d: ell(152, 172, 84, 46) },
      leg('legB', 124, 194, 32, 50),
      leg('legD', 210, 194, 32, 50),
      { id: 'neck', d: 'M222 160 L252 166 L248 192 L222 194 Z' },
      { id: 'head', d: ell(262, 180, 30, 20) },
    ],
    deco: [ell(270, 174, 5, 6), 'M272 190 Q280 194 288 188'],
    ink: [0],
    hat: { x: 260, y: 162 },
    bow: { x: 236, y: 196 },
  },
  {
    id: 'anky',
    title: '甲龍',
    regions: [
      { id: 'tail', d: 'M84 186 C60 184 44 186 34 190 L34 204 C48 202 66 200 86 200 Z' },
      { id: 'club', d: ell(26, 197, 20, 15) },
      leg('legA', 100, 196, 34, 48),
      leg('legC', 200, 196, 34, 48),
      { id: 'body', d: 'M74 206 C78 112 254 104 264 206 Z' },
      { id: 'spot1', d: ell(120, 160, 20, 16) },
      { id: 'spot2', d: ell(168, 142, 22, 18) },
      { id: 'spot3', d: ell(218, 162, 20, 16) },
      { id: 'spot4', d: ell(168, 186, 18, 13) },
      leg('legB', 128, 200, 34, 44),
      leg('legD', 226, 200, 34, 44),
      { id: 'head', d: 'M250 166 Q290 154 306 178 Q304 202 274 204 L250 202 Z' },
    ],
    deco: [ell(282, 176, 5, 6), 'M290 194 Q298 198 304 192'],
    ink: [0],
    hat: { x: 278, y: 158 },
    bow: { x: 250, y: 208 },
  },
  {
    id: 'ptero',
    title: '翼龍',
    regions: [
      { id: 'wingL', d: 'M168 118 C120 62 60 48 14 70 C58 92 102 122 160 146 Z' },
      { id: 'wingR', d: 'M192 118 C240 62 300 48 346 70 C302 92 258 122 200 146 Z' },
      { id: 'body', d: ell(180, 140, 24, 44) },
      { id: 'crest', d: 'M174 74 L132 54 L178 84 Z' },
      { id: 'head', d: 'M168 86 Q176 60 200 68 L256 78 L202 94 Q178 102 168 86 Z' },
      { id: 'foot1', d: ell(168, 186, 9, 7) },
      { id: 'foot2', d: ell(192, 186, 9, 7) },
    ],
    deco: [ell(190, 78, 5, 6), 'M120 120 Q150 126 168 132', 'M240 120 Q210 126 192 132'],
    ink: [0],
    hat: { x: 186, y: 62 },
    bow: { x: 180, y: 104 },
  },
  {
    id: 'para',
    title: '副櫛龍',
    regions: [
      { id: 'tail', d: 'M110 150 C70 152 36 172 8 202 C46 192 86 184 118 178 Z' },
      leg('legA', 124, 176, 34, 68),
      { id: 'body', d: ell(166, 156, 66, 48) },
      { id: 'belly', d: ell(182, 172, 32, 24) },
      leg('legB', 178, 182, 36, 62),
      { id: 'arm', d: 'M214 150 Q238 156 236 176 Q226 178 214 166 Z' },
      { id: 'neck', d: 'M200 100 L232 104 L226 140 L194 140 Z' },
      { id: 'crest', d: 'M232 84 C214 54 184 38 156 34 L162 48 C190 52 210 66 226 96 Z' },
      { id: 'head', d: 'M212 98 Q218 72 252 76 L284 86 Q298 96 284 106 L250 112 Q218 116 212 98 Z' },
    ],
    deco: [ell(244, 88, 6, 7), 'M268 104 Q276 108 284 102'],
    ink: [0],
    hat: { x: 246, y: 72 },
    bow: { x: 214, y: 128 },
  },
  {
    id: 'spino',
    title: '棘龍',
    regions: [
      { id: 'sail', d: 'M104 146 C110 62 206 44 232 136 Z' },
      { id: 'tail', d: 'M112 160 C74 166 40 186 6 214 C48 204 88 194 122 186 Z' },
      leg('legA', 126, 178, 34, 66),
      { id: 'body', d: ell(170, 158, 70, 44) },
      { id: 'belly', d: ell(188, 172, 32, 22) },
      leg('legB', 182, 182, 36, 62),
      { id: 'arm', d: 'M220 150 Q246 154 244 172 Q234 176 222 164 Z' },
      { id: 'neck', d: 'M206 112 L238 112 L234 146 L204 148 Z' },
      { id: 'head', d: 'M214 116 Q232 94 290 98 L334 108 Q336 124 304 124 L244 132 Q218 134 214 116 Z' },
    ],
    deco: [ell(250, 108, 6, 7), 'M296 124 l5 7 l5 -7 l5 7 l5 -7'],
    ink: [0],
    hat: { x: 248, y: 96 },
    bow: { x: 218, y: 140 },
  },
  {
    id: 'raptor',
    title: '迅猛龍',
    regions: [
      { id: 'tail', d: 'M134 128 C92 112 50 104 8 108 C44 128 90 146 134 152 Z' },
      { id: 'legA', d: 'M146 150 L134 208 L122 240 L150 244 L156 210 L170 160 Z' },
      { id: 'body', d: ell(172, 142, 52, 32) },
      { id: 'legB', d: 'M176 156 L176 212 L170 244 L200 244 L198 210 L200 160 Z' },
      { id: 'arm', d: 'M206 140 Q232 144 236 162 L226 166 Q214 156 202 154 Z' },
      { id: 'neck', d: 'M200 98 L226 102 L218 136 L194 134 Z' },
      { id: 'head', d: 'M206 92 Q226 74 264 86 L284 98 Q282 110 256 110 L222 114 Q204 110 206 92 Z' },
      { id: 'feather', d: 'M210 86 L190 70 L200 92 Z' },
    ],
    deco: [ell(238, 92, 5, 6), 'M256 110 l4 6 l4 -6 l4 6', 'M120 238 l-8 6 M142 244 l-4 8'],
    ink: [0],
    hat: { x: 236, y: 78 },
    bow: { x: 208, y: 122 },
  },
  {
    id: 'pachy',
    title: '腫頭龍',
    regions: [
      { id: 'tail', d: 'M112 156 C72 158 38 176 8 204 C46 194 88 186 120 180 Z' },
      leg('legA', 126, 178, 34, 66),
      { id: 'body', d: ell(166, 158, 64, 48) },
      { id: 'belly', d: ell(184, 174, 30, 24) },
      leg('legB', 180, 182, 36, 62),
      { id: 'arm', d: 'M214 152 Q240 156 238 174 Q228 178 216 166 Z' },
      { id: 'neck', d: 'M200 112 L232 114 L226 146 L196 146 Z' },
      { id: 'head', d: 'M210 112 Q212 84 244 84 Q280 86 286 110 L282 126 Q260 136 232 132 Q210 128 210 112 Z' },
      { id: 'dome', d: 'M214 102 C214 56 280 56 282 104 Q248 92 214 102 Z' },
    ],
    deco: [ell(254, 110, 6, 7), 'M262 124 Q272 128 280 120', 'M218 66 l-6 -6 M234 58 l-2 -8 M254 56 l2 -8 M272 62 l6 -6'],
    ink: [0],
    hat: { x: 248, y: 62 },
    bow: { x: 214, y: 140 },
  },
]

const GROUND = 'M-110 248 H455'

interface Scene {
  id: string
  regions: Region[]
  deco: string[]
}

const SCENES: Scene[] = [
  {
    id: 'sun',
    regions: [
      { id: 'sun', d: ell(-60, 44, 32, 32) },
      { id: 'cloud', d: 'M362 50 a18 18 0 0 1 32 -8 a22 22 0 0 1 38 12 a15 15 0 0 1 0 28 L368 82 a16 16 0 0 1 -6 -32 Z' },
    ],
    deco: [GROUND, 'M-60 0 V-8 M-104 44 H-112 M-60 88 V96 M-16 44 H-8'],
  },
  {
    id: 'palm',
    regions: [
      { id: 'trunk', d: 'M-66 248 C-68 200 -62 150 -54 112 L-40 114 C-46 152 -50 200 -46 248 Z' },
      { id: 'leaf1', d: 'M-48 110 C-82 86 -104 96 -112 122 C-94 108 -72 108 -48 118 Z' },
      { id: 'leaf2', d: 'M-48 110 C-20 80 10 84 20 104 C0 94 -22 98 -44 118 Z' },
      { id: 'leaf3', d: 'M-48 108 C-66 70 -56 48 -34 40 C-44 62 -44 84 -42 108 Z' },
      { id: 'coco', d: ell(-40, 124, 9, 9) },
    ],
    deco: [GROUND],
  },
  {
    id: 'eggs',
    regions: [
      { id: 'nest', d: 'M350 248 C350 222 450 222 452 248 Z' },
      { id: 'egg1', d: egg(384, 214, 22, 30) },
      { id: 'egg2', d: egg(424, 222, 18, 24) },
    ],
    deco: [GROUND, 'M368 210 l8 -6 l6 8 l8 -8', 'M418 220 l6 -5 l6 6'],
  },
  {
    id: 'volcano',
    regions: [
      { id: 'smoke1', d: ell(-62, 100, 24, 16) },
      { id: 'smoke2', d: ell(-40, 72, 18, 13) },
      { id: 'volcano', d: 'M-112 248 L-80 140 L-44 140 L-8 248 Z' },
      { id: 'lava', d: 'M-80 140 Q-62 112 -44 140 L-50 162 Q-62 152 -70 166 Z' },
    ],
    deco: [GROUND],
  },
  {
    id: 'flowers',
    regions: [
      { id: 'bush', d: 'M348 248 C344 214 378 206 394 224 C408 204 446 208 450 248 Z' },
      ...[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2
        return { id: `petal${i}`, d: ell(Math.round(404 + Math.cos(a) * 16), Math.round(170 + Math.sin(a) * 16), 11, 11) }
      }),
      { id: 'center', d: ell(404, 170, 10, 10) },
    ],
    deco: [GROUND, 'M404 182 V210'],
  },
]

/** 頭上戴的：生日帽、皇冠；脖子上：領結 */
const hatAt = (p: { x: number; y: number }): Region => ({ id: 'hat', d: `M${p.x - 18} ${p.y + 4} L${p.x} ${p.y - 36} L${p.x + 18} ${p.y + 4} Z` })
const crownAt = (p: { x: number; y: number }): Region => ({ id: 'crown', d: `M${p.x - 20} ${p.y + 4} L${p.x - 22} ${p.y - 22} L${p.x - 10} ${p.y - 8} L${p.x} ${p.y - 26} L${p.x + 10} ${p.y - 8} L${p.x + 22} ${p.y - 22} L${p.x + 20} ${p.y + 4} Z` })
const bowAt = (p: { x: number; y: number }): Region[] => [
  { id: 'bowL', d: `M${p.x} ${p.y} L${p.x - 22} ${p.y - 14} L${p.x - 22} ${p.y + 14} Z` },
  { id: 'bowR', d: `M${p.x} ${p.y} L${p.x + 22} ${p.y - 14} L${p.x + 22} ${p.y + 14} Z` },
  { id: 'knot', d: ell(p.x, p.y, 7, 7) },
]

/** 每一種恐龍配哪幾個場景、戴什麼（5 張都不一樣） */
const WEAR: ('' | 'hat' | 'crown' | 'bow')[] = ['', 'hat', '', 'crown', 'bow']

function make(d: Dino, s: Scene, wear: (typeof WEAR)[number]): Picture {
  const extra: Region[] = wear === 'hat' ? [hatAt(d.hat)] : wear === 'crown' ? [crownAt(d.hat)] : wear === 'bow' ? bowAt(d.bow) : []
  const off = s.deco.length
  return {
    id: `dino-${d.id}-${s.id}`,
    cat: 'dino',
    title: d.title,
    transform: 'translate(200 80) scale(1.75)',
    // 場景在最後面，恐龍蓋在上面；戴的東西在最上面
    regions: [...s.regions, ...d.regions, ...extra],
    deco: [...s.deco, ...d.deco],
    ink: d.ink.map((i) => i + off),
  }
}

/** 10 種 × 5 個場景：每一種恐龍的場景順序錯開，同一頁相鄰的不會長得一樣 */
export const DINOS: Picture[] = SCENES.flatMap((_, k) => SPECIES.map((d, i) => make(d, SCENES[(i + k) % SCENES.length], WEAR[(i * 2 + k) % WEAR.length])))
