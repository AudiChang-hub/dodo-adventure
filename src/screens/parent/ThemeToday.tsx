import { useEffect, useState, type CSSProperties } from 'react'
import { Emoji } from '../../art/Emoji'
import { getKV, today, type Attempt } from '../../lib/db'
import { game } from '../../content/games'
import { theme as themeDef, type ThemeDef } from '../../content/themes'
import { track, trackOf, type TrackId } from '../../content/tracks'
import type { Plan } from '../../lib/plan'
import { stopIcon } from '../Route'
import { skillLabel, type ParentData } from './data'

interface Stop {
  game: string
  track: TrackId | null
  done: boolean
  /** 今天這一站實際出現的內容（幾個技能） */
  saw: string[]
}

/** 今天這個遊戲出現過的內容：照第一次出現的順序，最多 3 個 */
function sawIn(rows: Attempt[], g: string): string[] {
  const out: string[] = []
  for (const a of [...rows].sort((x, y) => x.ts - y.ts)) {
    if (a.game !== g || a.skill.startsWith('coplay:')) continue
    const l = skillLabel(a.skill)
    if (!out.includes(l)) out.push(l)
  }
  return out.slice(0, 3)
}

/**
 * 今天的冒險故事（主題式冒險，2026-10-28 起）：孩子端只看到故事，這裡給爸爸看每一站其實練了哪條主線。
 * 這台裝置有今天排好的冒險就照它列（還沒玩的站也看得到）；用雲端資料看時，從今天作答紀錄上的主題推回來。
 */
export function ThemeTodayCard({ d }: { d: ParentData }) {
  const t = today()
  const rows = d.attempts.filter((a) => a.date === t)
  const [plan, setPlan] = useState<Plan | null>(null)
  useEffect(() => {
    if (d.source !== 'local') return
    let alive = true
    void getKV<Plan | null>(`plan:${t}`, null).then((p) => alive && setPlan(p))
    return () => {
      alive = false
    }
  }, [d.source, t])

  let th: ThemeDef | null = themeDef(plan?.theme)
  let stops: Stop[] = []
  if (th && plan) {
    stops = plan.items.map((i) => ({ game: i.game, track: i.track ?? trackOf(i.game), done: i.done, saw: sawIn(rows, game(i.game)?.id ?? i.game) }))
  } else {
    // 雲端：今天帶著主題的作答，依遊戲第一次出現的順序就是走過的站
    const themed = rows.filter((a) => a.theme).sort((x, y) => x.ts - y.ts)
    th = themeDef(themed[0]?.theme)
    const games = [...new Set(themed.filter((a) => a.theme === th?.id).map((a) => a.game))]
    stops = games.map((g) => ({ game: g, track: trackOf(g), done: true, saw: sawIn(rows, g) }))
  }
  if (!th) return null

  const per = new Map<TrackId, number>()
  for (const s of stops) if (s.track) per.set(s.track, (per.get(s.track) ?? 0) + 1)

  return (
    <div className="card theme-today" style={{ '--tint': th.tint, '--deep': th.deep } as CSSProperties}>
      <div className="tt-head">
        <span className="tt-icon">
          <Emoji name={th.icon} />
        </span>
        <div>
          <h3>
            今天的冒險故事：{th.zh}
            <small>{th.title}</small>
          </h3>
          <p className="sub">孩子只看到故事，不分科目；每一站其實練的是下面這條主線。</p>
        </div>
      </div>
      {stops.length ? (
        <ol className="tt-stops">
          {stops.map((s, i) => {
            const tr = s.track ? track(s.track) : null
            return (
              <li key={`${s.game}-${i}`} className={s.done ? 'done' : undefined}>
                <span className="tt-pic">
                  <Emoji name={stopIcon(th!, i)} />
                </span>
                <span className="tt-game">
                  <b>{game(s.game)?.title ?? s.game}</b>
                  <small>{s.saw.length ? s.saw.join('、') : s.done ? '' : '還沒玩到'}</small>
                </span>
                {tr && (
                  <span className="tt-track" style={{ '--trk': tr.color } as CSSProperties}>
                    {tr.name}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="empty">今天還沒開始冒險。</p>
      )}
      <p className="tt-dad">
        <b>陪玩</b>
        {th.dad}
      </p>
      {per.size > 0 && <p className="note">今天各主線的站數：{[...per].map(([k, n]) => `${track(k).name} ${n}`).join('、')}。排課照四條主線的需要排，主題只決定故事和題目裡出現的東西。</p>}
    </div>
  )
}
