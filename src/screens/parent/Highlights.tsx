import { useMemo } from 'react'
import { today } from '../../lib/db'
import { CARD_BONUS_MAX, CARD_GOAL, isSelfFix, type Milestone, type Why } from '../../lib/achievements'
import { game } from '../../content/games'
import { stickerFor } from '../../content/stickers'
import { artOf } from '../../content/sticker-art'
import { ArtSticker, StarShape } from '../../ui/StickerArt'
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

/** 這張貼紙的 5 顆星怎麼來的 */
function whyText(w: Why): string {
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
 * 下面是「貼紙怎麼拿」：規則、現在的貼紙卡、最近拿到的貼紙和拿到的原因。雲端資料在手機上看也一樣。
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
            <b>每玩完一關，貼紙卡多 1 顆星。</b>要真的有作答、玩到最後；中途按返回離開的那一關不算。
          </li>
          <li>
            <b>那一關有特別的事，再多 1 顆：</b>學會新東西、錯了自己改對、升級，各 1 顆（一關最多多 {CARD_BONUS_MAX} 顆，所以一關 1–{1 + CARD_BONUS_MAX} 顆）。
          </li>
          <li>
            <b>集滿 {CARD_GOAL} 顆星，換一張貼紙。</b>
            {'那一關的回顧結束後，會跳出 6 張隨機的貼紙讓他自己挑一張，貼進「我的朋友」旁邊的貼紙本。同一個圖案換了外框、配色、花紋就是新的一張，可以一直選喜歡的。'}
          </li>
          <li>
            <b>不想選也沒關係。</b>挑選畫面有「再看別的」和「等一下再選」；沒挑的貼紙會留在貼紙本和今日冒險的回顧裡，點那張發光的卡片就能再挑。
          </li>
        </ol>
        <p className="stk-pace">一天的冒險約 4 站，通常可以拿到 1–2 張。每關回顧時孩子會看到卡片上的星星飛進去，並聽到「再幾顆星就有貼紙」。</p>
        {card && (
          <div className="stk-now">
            <span className="stk-now-label">現在的貼紙卡</span>
            <span className="stk-now-stars" aria-label={`${card.stars} / ${card.goal} 顆星`}>
              {Array.from({ length: card.goal }, (_, i) => (
                <span key={i}>
                  <StarShape on={i < card.stars} />
                </span>
              ))}
            </span>
            <span className="stk-now-text">
              {card.stars} / {card.goal} 顆{card.pending > 0 ? `，另外有 ${card.pending} 張集滿了還沒挑` : ''}
            </span>
          </div>
        )}
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
