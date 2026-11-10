// 故事插畫的一頁（T-119）：照擺法（./layout.ts 的 PageArt）畫場景和角色。960×600，外面的框自己決定大小。
// hop：第幾個角色（cast 的位置）→ 跳的次數；次數變了那個角色跳一下（只跳一次，CSS .sb-hop），其他時候整頁靜止。
// motion（T-127 會動的繪本）：這一句要動的那一個角色（一句只有一個）。用位移和換姿勢，不縮放、不彈跳（MOTION-1、2，紙感螢幕）：
//   go 是 null 時停在開始的位置（走進來的在畫面外、第 2 天探出頭；換姿勢的還是舊的姿勢），go 有值就在 go 毫秒後慢慢做完、停住。
// fresh：同一頁裡新出現、但不是這一句主角的東西：淡淡地出現（不走路）。
import { memo, type CSSProperties } from 'react'
import { EMOJI } from '../emoji.generated'
import { PAGE_H, PAGE_W, layout, type PageArt, type Placed } from './layout'
import { drawItem } from './library'
import { ITEMS } from './meta'
import { Scene } from './scenes'
import type { ActKind } from '../../content/story/flow'
import './storybook.css'

/** 這一句要動的那一個（content/story/flow.ts 的 Act，加上從哪裡開始、什麼時候開始） */
export interface PageMotion {
  cast: number
  kind: ActKind
  /** 從哪裡開始（相對最後的位置，頁面座標） */
  dx: number
  dy: number
  fromPose?: string
  /** 幾毫秒後開始動；null：還沒開始（停在開始的位置） */
  go: number | null
  /** 換一句就換一個（同一個角色連兩句都動時，動畫要重來） */
  id: string
}

function Body({ id, who, pose }: { id: string | null; who: string; pose: string }) {
  const art = id ? drawItem(id, pose) : null
  if (art) return art
  // 角色庫還沒有的新角色：先畫 Fluent Emoji（200×200 的框）
  const e = EMOJI[who]
  if (!e) return <rect width={200} height={200} rx={30} fill="#EFE6D3" />
  return <svg width={200} height={200} viewBox={`0 0 ${e.w} ${e.h}`} dangerouslySetInnerHTML={{ __html: e.b }} />
}

/** 睡著時頭上慢慢浮起來的 Z（三個，一個接一個，浮到位置就停） */
function Zzz({ p, go }: { p: Placed; go: number | null }) {
  const x = p.x + p.w * (p.cast.flip ? 0.2 : 0.72)
  const y = p.y + Math.max(10, p.h * 0.1)
  return (
    <g className={`sb-zzz${go == null ? ' sb-hold' : ''}`} style={{ '--go': `${go ?? 0}ms` } as CSSProperties} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <text
          key={i}
          x={x + i * 26}
          y={y - i * 34}
          fontSize={30 + i * 8}
          fontFamily="Fredoka, sans-serif"
          fontWeight={600}
          fill="#6F86B8"
          style={{ '--i': i } as CSSProperties}
        >
          Z
        </text>
      ))}
    </g>
  )
}

function One({ p, hop, index, motion, fresh }: { p: Placed; hop?: number; index: number; motion?: PageMotion; fresh?: boolean }) {
  const single = p.cast.two ? p.w / 1.55 : p.w
  const body = (pose: string) => (
    <g transform={`scale(${p.k})${p.cast.flip ? ` translate(${single / p.k} 0) scale(-1 1)` : ''}`}>
      <Body id={p.id} who={p.cast.emoji ?? p.cast.who} pose={pose} />
    </g>
  )
  // 門打開：畫打開的門（角色庫有 open 這個姿勢的話）
  const pose = motion?.kind === 'open' && p.id && ITEMS[p.id]?.poses.open ? 'open' : p.pose
  // 換姿勢、睡著、門打開：先畫新的姿勢，舊的蓋在上面慢慢淡掉
  const swap = motion && (motion.kind === 'pose' || motion.kind === 'sleep' || motion.kind === 'open') && motion.fromPose && motion.fromPose !== pose
  const draw = (dx: number, key: string, delay = 0) => (
    <g key={key} transform={`translate(${p.x + dx} ${p.y})`}>
      <g className={hop ? 'sb-hop' : undefined} key={`h${hop ?? 0}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
        {body(pose)}
        {swap && (
          <g className={`sb-old${motion!.go == null ? ' sb-hold' : ''}`} style={{ '--go': `${motion!.go ?? 0}ms` } as CSSProperties}>
            {body(motion!.fromPose!)}
          </g>
        )}
      </g>
    </g>
  )
  const moves = motion && (motion.kind === 'enter' || motion.kind === 'move' || motion.kind === 'jump')
  const inner = (
    <>
      {p.cast.two ? [draw(p.w - single, 'b', 140), draw(0, 'a')] : draw(0, 'a')}
      {p.rider && (
        <g transform={`translate(${p.rider.x} ${p.rider.y}) scale(${p.rider.k})`}>
          <g className={hop ? 'sb-hop' : undefined} key={`r${hop ?? 0}`}>
            <Body id={p.rider.id} who={p.rider.who} pose="stand" />
          </g>
        </g>
      )}
    </>
  )
  return (
    <g data-cast={index} data-who={p.cast.who} data-act={motion?.kind} className={fresh ? 'sb-fresh' : undefined}>
      {moves ? (
        <g
          key={motion!.id}
          className={`sb-move sb-${motion!.kind}${motion!.go == null ? ' sb-hold' : ''}`}
          style={{ '--dx': `${motion!.dx}px`, '--dy': `${motion!.dy}px`, '--go': `${motion!.go ?? 0}ms` } as CSSProperties}
        >
          {inner}
        </g>
      ) : (
        <g key={motion?.id ?? 'still'}>{inner}</g>
      )}
      {motion?.kind === 'sleep' && <Zzz key={`z${motion.id}`} p={p} go={motion.go} />}
    </g>
  )
}

export const StoryPage = memo(function StoryPage({
  art,
  hop = {},
  width = '100%',
  motion,
  fresh,
}: {
  art: PageArt
  hop?: Record<number, number>
  width?: number | string
  motion?: PageMotion | null
  fresh?: readonly number[]
}) {
  const ps = layout(art)
  const backs = ps.filter((p) => p.back)
  const fronts = ps.filter((p) => !p.back)
  return (
    <svg className="sb-page" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} width={width} style={{ display: 'block' }} aria-hidden="true">
      <Scene id={art.scene} />
      {backs.map((p, i) => (
        <One key={`b${i}`} p={p} index={-1 - i} />
      ))}
      {fronts.map((p, i) => (
        <One key={`f${i}:${p.cast.who}`} p={p} index={i} hop={hop[i]} motion={motion?.cast === i ? motion : undefined} fresh={fresh?.includes(i)} />
      ))}
    </svg>
  )
})
