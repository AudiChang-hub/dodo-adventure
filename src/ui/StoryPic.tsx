import { memo, useId, type ReactElement } from 'react'
import { Emoji } from '../art/Emoji'
import type { Pic } from '../content/story'

// 故事的畫面（content/story 的 Pic）：Fluent Emoji，或 @ 開頭的故事自己的圖；用 + 疊兩張（第二張小小的靠在右下角）。
// 畫風跟 art/Egg.tsx 一樣：紙色、淡墨線、低彩度；靜止不動（畫面靜止時不留循環動畫，MOTION-2）。

const INK = '#2E2A25'
const LINE = '#D9C7A6'
/** 彩虹蛋的七個斑點：紅、橘、黃、綠、藍、靛、紫（紙感螢幕上的低彩度版本） */
export const SPOTS = ['#E8907E', '#EDB07A', '#EED37E', '#9FCB9A', '#8DB8D8', '#8E95C9', '#B79BCB']
const SPOT_AT: [number, number, number][] = [
  [70, 70, 15],
  [128, 66, 12],
  [148, 120, 16],
  [58, 128, 13],
  [104, 112, 11],
  [76, 182, 16],
  [136, 178, 13],
]

/**
 * 彩虹蛋（故事世界 §2.1）：大大的蛋，上面七個彩色斑點。lit 是亮起來的斑點數（每 7 篇亮一個；還沒亮的斑點是淡的）。
 */
export function RainbowEgg({ lit = 7, size = '100%' }: { lit?: number; size?: number | string }) {
  return (
    <svg viewBox="0 0 200 240" width={size} height={size} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <ellipse cx={100} cy={228} rx={66} ry={9} fill="rgba(46,42,37,.1)" />
      <path d="M100 14 C150 14 184 92 184 144 C184 194 148 222 100 222 C52 222 16 194 16 144 C16 92 50 14 100 14 Z" fill="#FFF8EA" stroke={LINE} strokeWidth={4} />
      {SPOT_AT.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={SPOTS[i]} opacity={i < lit ? 1 : 0.35} />
      ))}
      <ellipse cx={64} cy={54} rx={12} ry={20} fill="#fff" opacity={0.75} transform="rotate(-22 64 54)" />
    </svg>
  )
}

/** 軟軟的格子毯（折起一角） */
function Blanket() {
  // 同一個畫面可能有好幾條毯子（路線圖、旁白卡）：花紋的 id 不能重複
  const id = `sp-plaid${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden="true">
      <defs>
        <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#F4D9C6" />
          <rect width="40" height="12" y="14" fill="#E9B9A0" opacity={0.6} />
          <rect width="12" height="40" x="14" fill="#E9B9A0" opacity={0.6} />
        </pattern>
      </defs>
      <ellipse cx={100} cy={182} rx={78} ry={8} fill="rgba(46,42,37,.1)" />
      <path d="M26 46 Q100 30 174 46 L178 164 Q100 180 22 164 Z" fill={`url(#${id})`} stroke={INK} strokeOpacity={0.55} strokeWidth={4} strokeLinejoin="round" />
      {/* 折起來的一角 */}
      <path d="M178 164 L132 170 Q150 140 176 120 Z" fill="#FBEFE4" stroke={INK} strokeOpacity={0.55} strokeWidth={4} strokeLinejoin="round" />
      {[40, 70, 100, 130, 160].map((x) => (
        <path key={x} d={`M${x} 170 v10`} stroke="#E9B9A0" strokeWidth={5} strokeLinecap="round" />
      ))}
    </svg>
  )
}

/** 蛋窩：圓籃子裡鋪著羊毛和毯子，彩虹蛋在裡面，旁邊一隻泰迪熊（第 1 篇講完，客廳角落多的東西） */
function EggNest() {
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
      <div style={{ position: 'absolute', left: '22%', top: '4%', width: '50%' }}>
        <RainbowEgg />
      </div>
      <div style={{ position: 'absolute', left: '6%', top: '44%', width: '82%' }}>
        <Emoji name="basket" />
      </div>
      <div style={{ position: 'absolute', right: '-6%', bottom: '2%', width: '34%' }}>
        <Emoji name="teddy-bear" />
      </div>
    </div>
  )
}

const ART: Record<string, () => ReactElement> = {
  '@rainbow-egg': () => <RainbowEgg />,
  '@blanket': Blanket,
  '@egg-nest': EggNest,
}

function One({ name }: { name: string }) {
  const A = ART[name]
  return A ? <A /> : <Emoji name={name} />
}

/** 一張故事的圖：寬度跟著外面（高度一樣），疊圖的第二張是 42% 大，靠在右下角 */
export const StoryPic = memo(function StoryPic({ pic, className }: { pic: Pic; className?: string }) {
  const [main, extra] = pic.split('+')
  return (
    <span className={`story-pic${className ? ` ${className}` : ''}`}>
      <span className="story-pic-main">
        <One name={main} />
      </span>
      {extra && (
        <span className="story-pic-extra">
          <One name={extra} />
        </span>
      )}
    </span>
  )
})
