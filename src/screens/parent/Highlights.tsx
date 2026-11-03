import { useMemo } from 'react'
import { today } from '../../lib/db'
import { isSelfFix, type Milestone, type Why } from '../../lib/achievements'
import { game } from '../../content/games'
import { stickerFor } from '../../content/stickers'
import { artOf } from '../../content/sticker-art'
import { ArtSticker } from '../../ui/StickerArt'
import { lastDays, skillLabel, type ParentData } from './data'
import './highlights.css'

type StickerMs = Extract<Milestone, { kind: 'sticker' }>

/** 一天的里程碑整理成幾行中文：學會的東西併成一行、升級一個遊戲一行、修好程式只寫當天最多的那次、挑的貼紙併成一行 */
function describe(ms: Milestone[]): string[] {
  const out: string[] = []
  const learned = ms.flatMap((m) => (m.kind === 'master' ? [stickerFor(m.skill)?.zh ?? skillLabel(m.skill)] : []))
  if (learned.length) out.push(`學會：${learned.join('、')}`)
  for (const m of ms) if (m.kind === 'level') out.push(`升級：${game(m.game)?.title ?? m.game} 第 ${m.from} → ${m.to} 級`)
  const fix = Math.max(0, ...ms.map((m) => (m.kind === 'fixes' ? m.n : 0)))
  if (fix) out.push(`程式車庫累計自己修好 ${fix} 個程式`)
  const picked = ms.flatMap((m) => (m.kind === 'sticker' ? [artOf(m.art)?.zh ?? m.art] : []))
  if (picked.length) out.push(`挑了貼紙：${picked.join('、')}`)
  return out
}

/** 這張貼紙怎麼來的：上完一堂課跳出來的（只有 round 1），或以前集滿貼紙卡的 5 顆星 */
function whyText(w: Why): string {
  if (w.round === 1 && !w.learn && !w.fix && !w.level) return '上完一堂課'
  return [w.round && `玩完 ${w.round} 關`, w.learn && `學會新東西 ${w.learn} 次`, w.fix && `自己改對 ${w.fix} 次`, w.level && `升級 ${w.level} 次`].filter(Boolean).join('、')
}

const dayName = (d: string) => {
  if (d === today()) return '今天'
  if (d === lastDays(2)[0]) return '昨天'
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

/** 最近幾張貼紙 */
const RECENT = 12

/**
 * 今日亮點（成就感強化）：最近 7 天孩子學會、升級的東西、挑的貼紙，和「錯了自己改對」的次數。
 * 下面是「貼紙怎麼拿」：規則（上完一堂不定時跳出，A7）、還沒挑的張數、最近拿到的貼紙和拿到的原因。雲端資料在手機上看也一樣。
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
  const stickers = useMemo(
    () =>
      d.milestones
        .filter((m): m is StickerMs => m.kind === 'sticker')
        .sort((a, b) => b.ts - a.ts)
        .slice(0, RECENT),
    [d],
  )
  const card = d.card

  return (
    <>
      <h2>今日亮點</h2>
      <p className="sub">孩子這一週學會、升級的東西和挑的貼紙。可以拿來當面誇他：說出他做了什麼，比說「好聰明」更有用。</p>
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

      <h2>貼紙怎麼拿</h2>
      <div className="card stk-rules">
        <ol>
          <li>
            <b>上完一堂課，有時候會跳出貼紙。</b>平均每 3～4 堂一次，間隔不固定、事先不說；不會連著兩堂都有，也不會連著 5 堂都沒有。中途按返回離開的那一堂不算。
          </li>
          <li>
            <b>為什麼不是每堂都給：</b>研究發現，事先知道「做完就有」的獎品，會讓孩子之後比較不想自己主動去做；不固定的小驚喜、說出他做了什麼的讚美，沒有這個問題（全球幼教指引 HOW-7）。
          </li>
          <li>
            <b>沒有貼紙的那堂</b>照樣有恐龍的稱讚和再見，畫面上是開心的恐龍和一顆回首頁的房子。請不要跟他說「上完課就有貼紙」。
          </li>
          <li>
            <b>不想選也沒關係。</b>挑選畫面有「再看別的」和「等一下再選」；沒挑的那張留到下一次跳出貼紙時再挑。
          </li>
        </ol>
        {card && card.pending > 0 && <p className="stk-pace">現在有 {card.pending} 張還沒挑。</p>}
      </div>

      <h2>最近拿到的貼紙</h2>
      {stickers.length === 0 ? (
        <p className="empty">還沒有挑過貼紙。</p>
      ) : (
        <div className="stk-recent">
          {stickers.map((m) => (
            <div key={m.id} className="card stk-item">
              <span className="stk-pic">
                <ArtSticker art={m.art} seed={m.seed} />
              </span>
              <span className="stk-meta">
                <b>{artOf(m.art)?.zh ?? m.art}</b>
                <small>{dayName(m.date)}</small>
                <span>{whyText(m.why)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
