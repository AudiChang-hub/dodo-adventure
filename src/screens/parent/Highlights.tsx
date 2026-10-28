import { useMemo } from 'react'
import { today } from '../../lib/db'
import { isSelfFix, type Milestone } from '../../lib/achievements'
import { game } from '../../content/games'
import { stickerFor } from '../../content/stickers'
import { lastDays, skillLabel, type ParentData } from './data'
import './highlights.css'

/** 一天的里程碑整理成幾行中文：學會的東西併成一行、升級一個遊戲一行、修好程式只寫當天最多的那次 */
function describe(ms: Milestone[]): string[] {
  const out: string[] = []
  const learned = ms.flatMap((m) => (m.kind === 'master' ? [stickerFor(m.skill)?.zh ?? skillLabel(m.skill)] : []))
  if (learned.length) out.push(`學會：${learned.join('、')}`)
  for (const m of ms) if (m.kind === 'level') out.push(`升級：${game(m.game)?.title ?? m.game} 第 ${m.from} → ${m.to} 級`)
  const fix = Math.max(0, ...ms.map((m) => (m.kind === 'fixes' ? m.n : 0)))
  if (fix) out.push(`程式車庫累計自己修好 ${fix} 個程式`)
  return out
}

const dayName = (d: string) => {
  if (d === today()) return '今天'
  if (d === lastDays(2)[0]) return '昨天'
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

/**
 * 今日亮點（成就感強化）：最近 7 天孩子拿到的貼紙、升級，和「錯了自己改對」的次數。
 * 自己改正的次數從作答紀錄算，雲端資料在手機上看也一樣。
 */
export function Highlights({ d }: { d: ParentData }) {
  const days = useMemo(() => {
    const week = lastDays(7)
    const fixes = new Map<string, number>()
    for (const a of d.attempts) if (a.date >= week[0] && isSelfFix(a)) fixes.set(a.date, (fixes.get(a.date) ?? 0) + 1)
    return [...week]
      .reverse()
      .map((date) => ({ date, ms: d.milestones.filter((m) => m.date === date).sort((a, b) => a.ts - b.ts), fixes: fixes.get(date) ?? 0 }))
      .filter((x) => x.ms.length || x.fixes)
  }, [d])

  return (
    <>
      <h2>今日亮點</h2>
      <p className="sub">孩子這一週學會、升級的東西（每一個都會變成貼紙，收在「我的朋友」旁邊的貼紙本裡）。可以拿來當面誇他：說出他做了什麼，比說「好聰明」更有用。</p>
      {days.length === 0 ? (
        <p className="empty">這一週還沒有新的亮點。</p>
      ) : (
        <div className="card highlights">
          {days.map((x) => (
            <div key={x.date} className="hl-day">
              <b>{dayName(x.date)}</b>
              <ul>
                {describe(x.ms).map((t) => (
                  <li key={t}>{t}</li>
                ))}
                {x.fixes > 0 && <li className="hl-fix">錯了之後自己改對 {x.fixes} 次</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
