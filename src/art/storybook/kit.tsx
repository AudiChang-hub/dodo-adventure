// 故事插畫共用的小零件：外框、眼睛、臉頰、嘴巴、Zzz（T-119）。畫風跟三隻恐龍（art/Dino.tsx）同一套：
// 淡色平塗、外框是同色系深一階的粗線、圓角；不用漸層、不用細紋理（紙感螢幕，準則 DISPLAY-1、2）。

export const INK = '#2E2A25'
export const CHEEK = '#F2A9A0'
export const MOUTH = '#7A3E3A'
export const TONGUE = '#E9908C'
/** 角色的外框粗細（自己的座標） */
export const W = 5

export const line = (stroke: string, w = W) => ({ stroke, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const })

/** 眼睛：圓點加一個小亮點；shut 閉眼（睡覺）；happy 笑彎的眼睛 */
export function Eye({ x, y, r = 6, shut, happy }: { x: number; y: number; r?: number; shut?: boolean; happy?: boolean }) {
  if (shut) return <path d={`M${x - r * 1.3} ${y} Q${x} ${y + r * 1.4} ${x + r * 1.3} ${y}`} fill="none" {...line(INK, 4)} />
  if (happy) return <path d={`M${x - r * 1.3} ${y + 2} Q${x} ${y - r * 1.6} ${x + r * 1.3} ${y + 2}`} fill="none" {...line(INK, 4.5)} />
  return (
    <g>
      <ellipse cx={x} cy={y} rx={r * 0.85} ry={r * 1.15} fill={INK} />
      <circle cx={x + r * 0.3} cy={y - r * 0.45} r={r * 0.33} fill="#fff" />
    </g>
  )
}

export const Cheek = ({ x, y, r = 9 }: { x: number; y: number; r?: number }) => <ellipse cx={x} cy={y} rx={r} ry={r * 0.6} fill={CHEEK} opacity={0.85} />

/** 微笑 */
export const Smile = ({ x, y, w = 10 }: { x: number; y: number; w?: number }) => <path d={`M${x - w} ${y} Q${x} ${y + w * 0.8} ${x + w} ${y}`} fill="none" {...line(INK, 3.5)} />

/** 張開嘴笑（開心、叫） */
export function Open({ x, y, w = 11 }: { x: number; y: number; w?: number }) {
  return (
    <g>
      <path d={`M${x - w} ${y} Q${x} ${y + w * 1.9} ${x + w} ${y} Z`} fill={MOUTH} {...line(MOUTH, 3)} />
      <ellipse cx={x} cy={y + w * 0.7} rx={w * 0.5} ry={w * 0.25} fill={TONGUE} />
    </g>
  )
}

/** 睡覺的 Zzz（圓圓的 Fredoka） */
export function Zzz({ x, y, k = 1 }: { x: number; y: number; k?: number }) {
  return (
    <g fill="#8E95C9" fontFamily="Fredoka, sans-serif" fontWeight={600} transform={`translate(${x} ${y}) scale(${k})`}>
      <text x={0} y={0} fontSize={30}>
        z
      </text>
      <text x={22} y={-26} fontSize={40}>
        z
      </text>
      <text x={50} y={-62} fontSize={52}>
        Z
      </text>
    </g>
  )
}

/** 幾個圓疊成一團、只描最外面一圈（樹冠、雲、羊毛）：先畫有框的圓，再蓋一層沒框的 */
export function Blob({ c, fill, stroke, w = W }: { c: [number, number, number][]; fill: string; stroke: string; w?: number }) {
  return (
    <g>
      {c.map(([x, y, r], i) => (
        <circle key={`o${i}`} cx={x} cy={y} r={r} fill={fill} {...line(stroke, w)} />
      ))}
      {c.map(([x, y, r], i) => (
        <circle key={`i${i}`} cx={x} cy={y} r={Math.max(1, r - w / 2 - 0.5)} fill={fill} />
      ))}
    </g>
  )
}
