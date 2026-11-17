// 積木蓋蓋看的圖示（T-162）：遊戲角選單、選照圖蓋／自由蓋、「再蓋一個」用。自己畫的 SVG，跟遊戲角同一套粗線條。
import { parseRows, to3d, type Brick } from './bricks'
import { BrickSet, INK, Plate, boxOf } from './BrickArt'

/** 一組積木畫成一張圖（立體），外面留一點邊 */
function Pic({ bricks, plate, cols }: { bricks: Brick[]; plate?: boolean; cols?: number }) {
  const all = plate ? [...bricks, { x: 0, z: -0.32, y: 0, w: cols ?? 1, d: 2, color: 'G' as const, shape: 'brick' as const }] : bricks
  const b = boxOf(all, 'deep', 0.25)
  return (
    <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} width="100%" height="100%" aria-hidden="true">
      {plate && <Plate cols={cols ?? 1} rows={2} v="deep" />}
      <BrickSet bricks={bricks} v="deep" />
    </svg>
  )
}

const HOUSE = to3d(parseRows(['.12.', '.YB.', 'RRRR'], '1R/ 2R\\')).map((b) => ({ ...b, x: b.x + 1 }))

/** 選單：底板上蓋了一半的小房子，旁邊一塊藍色積木正要放上去 */
export function BlocksPickArt() {
  const loose: Brick = { x: 6.2, z: 1.6, y: 0, w: 2, d: 2, color: 'B', shape: 'brick' }
  return <Pic bricks={[...HOUSE, loose]} plate cols={6} />
}

const CAR = parseRows(['.BB.', 'RRRR', '@..@'])

/** 照圖蓋：左邊一張圖卡（平面的車子），右邊照著蓋好的車子 */
export function CopyArt() {
  const card = boxOf(CAR, 'flat', 0.3)
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <g transform="translate(14 40)">
        <rect x={0} y={0} width={96} height={86} rx={10} fill="#FBF8F2" stroke={INK} strokeWidth={4} />
        <svg x={8} y={10} width={80} height={66} viewBox={`${card.x} ${card.y} ${card.w} ${card.h}`}>
          <BrickSet bricks={CAR} v="flat" />
        </svg>
      </g>
      <path d="M118 84 L134 84 M128 76 L136 84 L128 92" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <svg x={138} y={46} width={96} height={110}>
        <Pic bricks={to3d(CAR)} />
      </svg>
    </svg>
  )
}

const PILE: Brick[] = [
  { x: 0, z: 0, y: 0, w: 2, d: 2, color: 'R', shape: 'brick' },
  { x: 2.4, z: 0, y: 0, w: 1, d: 2, color: 'Y', shape: 'brick' },
  { x: 3.8, z: 0, y: 0, w: 4, d: 2, color: 'G', shape: 'brick' },
  { x: 0.6, z: 1, y: 0, w: 1, d: 1, color: 'K', shape: 'round' },
  { x: 4.6, z: 1, y: 0, w: 2, d: 2, color: 'B', shape: 'slopeR' },
  { x: 1.6, z: 1.2, y: 1, w: 2, d: 1, color: 'P', shape: 'brick' },
  { x: 6.6, z: 1, y: 0, w: 1, d: 2, color: 'O', shape: 'brick' },
]

/** 自由蓋：一堆各種顏色、各種形狀的積木 */
export function FreeArt() {
  return <Pic bricks={PILE} />
}

