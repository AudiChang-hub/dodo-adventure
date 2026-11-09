// 故事插畫的一頁（T-119）：照擺法（./layout.ts 的 PageArt）畫場景和角色。960×600，外面的框自己決定大小。
// hop：第幾個角色（cast 的位置）→ 跳的次數；次數變了那個角色跳一下（只跳一次，CSS .sb-hop），其他時候整頁靜止。
import { memo } from 'react'
import { EMOJI } from '../emoji.generated'
import { PAGE_H, PAGE_W, layout, type PageArt, type Placed } from './layout'
import { drawItem } from './library'
import { Scene } from './scenes'
import './storybook.css'

function Body({ id, who, pose }: { id: string | null; who: string; pose: string }) {
  const art = id ? drawItem(id, pose) : null
  if (art) return art
  // 角色庫還沒有的新角色：先畫 Fluent Emoji（200×200 的框）
  const e = EMOJI[who]
  if (!e) return <rect width={200} height={200} rx={30} fill="#EFE6D3" />
  return <svg width={200} height={200} viewBox={`0 0 ${e.w} ${e.h}`} dangerouslySetInnerHTML={{ __html: e.b }} />
}

function One({ p, hop, index }: { p: Placed; hop?: number; index: number }) {
  const single = p.cast.two ? p.w / 1.55 : p.w
  const draw = (dx: number, key: string, delay = 0) => (
    <g key={key} transform={`translate(${p.x + dx} ${p.y})`}>
      <g className={hop ? 'sb-hop' : undefined} key={`h${hop ?? 0}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
        <g transform={`scale(${p.k})${p.cast.flip ? ` translate(${single / p.k} 0) scale(-1 1)` : ''}`}>
          <Body id={p.id} who={p.cast.emoji ?? p.cast.who} pose={p.pose} />
        </g>
      </g>
    </g>
  )
  return (
    <g data-cast={index} data-who={p.cast.who}>
      {p.cast.two ? [draw(p.w - single, 'b', 140), draw(0, 'a')] : draw(0, 'a')}
      {p.rider && (
        <g transform={`translate(${p.rider.x} ${p.rider.y}) scale(${p.rider.k})`}>
          <g className={hop ? 'sb-hop' : undefined} key={`r${hop ?? 0}`}>
            <Body id={p.rider.id} who={p.rider.who} pose="stand" />
          </g>
        </g>
      )}
    </g>
  )
}

export const StoryPage = memo(function StoryPage({ art, hop = {}, width = '100%' }: { art: PageArt; hop?: Record<number, number>; width?: number | string }) {
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
        <One key={`f${i}`} p={p} index={i} hop={hop[i]} />
      ))}
    </svg>
  )
})
