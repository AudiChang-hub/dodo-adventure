import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { ShapeSvg } from '../../ui/Visual'
import { vocab } from '../../content/vocab'
import { theme as themeDef, type ThemeDef } from '../../content/themes'
import { findable, TRACK_ZH, type ThinkKind } from '../../content/outing'
import { today } from '../../lib/db'
import type { ShapeId } from '../../content/park'
import { addDays, buildCard, cardText, loadRecall, loadTicks, setTick, shortDate, weekOf, type Mission, type MissionIcon, type RecallEntry, type Ticks } from '../../lib/outing'
import type { ParentData } from './data'
import './outing.css'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const dayLabel = (d: string) => `${shortDate(d)}（${WEEKDAY[new Date(`${d}T12:00`).getDay()]}）`

/** 思考題的小圖：線條畫，跟作答紀錄的階段標記一樣不只靠顏色 */
function ThinkGlyph({ kind }: { kind: ThinkKind }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true">
      {kind === 'seq' && (
        // 捷運路線：走過的站塗滿，下一站空心
        <>
          <path d="M5 20 H35" {...s} />
          <circle cx={8} cy={20} r={3.6} fill="currentColor" />
          <circle cx={20} cy={20} r={3.6} fill="currentColor" />
          <circle cx={32} cy={20} r={4.4} fill="var(--card)" stroke="currentColor" strokeWidth={2.4} />
          <path d="M28 10 L32 6 L36 10" {...s} />
        </>
      )}
      {kind === 'dir' && (
        <>
          <path d="M20 6 V34 M6 20 H34" {...s} />
          <path d="M15.5 10.5 L20 6 L24.5 10.5 M29.5 15.5 L34 20 L29.5 24.5 M24.5 29.5 L20 34 L15.5 29.5 M10.5 24.5 L6 20 L10.5 15.5" {...s} />
        </>
      )}
      {kind === 'cond' && (
        <>
          <rect x={12.5} y={4} width={15} height={32} rx={6} {...s} />
          <circle cx={20} cy={12} r={3.6} fill="currentColor" />
          <circle cx={20} cy={20} r={3.2} {...s} strokeWidth={2} />
          <circle cx={20} cy={28} r={3.2} {...s} strokeWidth={2} />
        </>
      )}
      {kind === 'loop' && (
        // 樓梯：每一階上面一個點，一階數一個
        <>
          <path d="M4 35 H12 V27 H20 V19 H28 V11 H36" {...s} />
          <circle cx={8} cy={30} r={2.3} fill="currentColor" />
          <circle cx={16} cy={22} r={2.3} fill="currentColor" />
          <circle cx={24} cy={14} r={2.3} fill="currentColor" />
          <circle cx={32} cy={6} r={2.3} fill="none" stroke="currentColor" strokeWidth={1.6} />
        </>
      )}
      {kind === 'pattern' && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={6 + i * 8} y={8} width={4.6} height={24} rx={1.6} fill={i % 2 ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth={1.8} />
          ))}
        </>
      )}
    </svg>
  )
}

function Icon({ icon }: { icon: MissionIcon }) {
  if (icon.t === 'emoji') return <Emoji name={icon.name} />
  if (icon.t === 'think') return <ThinkGlyph kind={icon.kind} />
  if (icon.t === 'shape') return <ShapeSvg shape={icon.id as ShapeId} hex="#CBBFAA" />
  if (icon.t === 'color')
    return (
      // 一滴顏料：顏色本身就是題目，旁邊的字寫著顏色名稱
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true">
        <path d="M20 4 C27 13 32 19 32 25 A12 12 0 0 1 8 25 C8 19 13 13 20 4 Z" fill={icon.hex} stroke="rgba(46,42,37,0.22)" strokeWidth={1.6} />
        <ellipse cx={15} cy={24} rx={2.6} ry={4} fill="rgba(255,255,255,0.45)" />
      </svg>
    )
  if (icon.t === 'num') return <span className="glyph num">{icon.n}</span>
  return <span className="glyph">{icon.s}</span>
}

function Stop({ m, i, at, onToggle }: { m: Mission; i: number; at?: number; onToggle: () => void }) {
  const done = !!at
  return (
    <motion.li className={`stop t-${m.track}${done ? ' is-done' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      <button className="stop-mark" aria-pressed={done} aria-label={done ? `取消完成：${m.title}` : `標記完成：${m.title}`} onClick={onToggle}>
        <span className="stop-num" aria-hidden="true">
          {i + 1}
        </span>
        <AnimatePresence>
          {done && (
            <motion.svg key="ok" viewBox="0 0 40 40" className="stop-ok" aria-hidden="true" initial={{ scale: 1.6, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 20 }}>
              <circle cx={20} cy={20} r={19} fill="currentColor" />
              <path d="M11.5 20.5 L17.5 26.5 L28.5 14" fill="none" stroke="#FBF8F2" strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          )}
        </AnimatePresence>
      </button>
      <div className="stop-body">
        <div className="stop-head">
          <span className="stop-icon">
            <Icon icon={m.icon} />
          </span>
          <div>
            <div className="stop-meta">
              <span className="stop-concept">{m.concept}</span>
              <span className="stop-where">{m.where.join('・')}</span>
            </div>
            <h4>{m.title}</h4>
          </div>
        </div>
        <p className="stop-say" lang="en">
          {m.en}
        </p>
        <p className="stop-dad">{m.dad}</p>
        <p className="stop-note">
          {m.note}
          {done && <span className="stop-when">{dayLabel(today(new Date(at)))}完成</span>}
        </p>
      </div>
    </motion.li>
  )
}

/** 卡片右上角的小路線：虛線小路走到終點的旗子，走過幾站就塗滿幾格 */
function RouteMark({ n, done }: { n: number; done: number }) {
  const xs = Array.from({ length: n }, (_, i) => 14 + (i * 132) / Math.max(1, n - 1))
  return (
    <svg className="ticket-route" viewBox="0 0 176 44" aria-label={`完成 ${done} / ${n}`} role="img">
      <path d={`M${xs[0]} 30 H${xs[n - 1] ?? 146}`} stroke="#d9cfbd" strokeWidth={3} strokeDasharray="2 6" strokeLinecap="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={30} r={i < done ? 6 : 5} fill={i < done ? 'var(--dodo-deep)' : 'var(--card)'} stroke={i < done ? 'var(--dodo-deep)' : '#c9bda8'} strokeWidth={2.4} />
      ))}
      <g transform={`translate(${(xs[n - 1] ?? 146) + 8} 30)`}>
        <path d="M0 0 V-24" stroke="var(--ink)" strokeWidth={2.4} strokeLinecap="round" />
        <path d="M1 -24 L17 -19 L1 -14 Z" fill={done >= n && n ? 'var(--coral)' : 'var(--card)'} stroke={done >= n && n ? 'var(--coral)' : '#b9ae9c'} strokeWidth={2} strokeLinejoin="round" />
      </g>
    </svg>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 非 https 或舊瀏覽器：用隱藏的文字框複製
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/**
 * 出門任務卡（PRD §5.11）：依這週在 App 學的東西產生，手機開 #parent 也好看。
 * 爸爸出門時一題一題勾；勾選存在這台裝置（kv），不上傳。
 * 卡片本身可以直接截圖或列印成一張（列印時只印卡片）。
 */
export function Outing({ d }: { d: ParentData }) {
  const week = weekOf()
  const [ticks, setTicks] = useState<Ticks | null>(null)
  const [recall, setRecall] = useState<RecallEntry[]>([])
  // 這次打開後勾過的任務都留在卡上：取消勾選不會讓那一題突然消失
  const [keep, setKeep] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadTicks().then((t) => {
      setTicks(t)
      setKeep(Object.keys(t[week] ?? {}))
    })
    loadRecall().then(setRecall)
  }, [week])

  const card = useMemo(() => buildCard(d.attempts, week, keep), [d, week, keep])
  const wt = ticks?.[week] ?? {}
  const doneN = card.missions.filter((m) => wt[m.id]).length
  const words = card.learned.filter((l) => l.kind !== 'dir').slice(0, 6)
  const head = words.slice(0, 3)
  const recent = recall.filter((r) => r.date >= addDays(week, -2)).slice(-3).reverse()

  const toggle = async (id: string) => {
    if (!keep.includes(id)) setKeep((k) => [...k, id])
    setTicks(await setTick(week, id, !wt[id]))
  }

  const copy = async () => {
    if (await copyText(cardText(card, wt))) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    }
  }

  return (
    <div className="outing">
      <h2>出門任務卡</h2>
      <p className="sub">假日出門順便玩：走路、等車、排隊的空檔玩 1–2 分鐘，不用道具。依這週在 App 學的內容自動產生，每週一換一張。</p>

      <div className="outing-layout">
        <article className="ticket" aria-label="本週出門任務卡">
          <header className="ticket-top">
            <div className="ticket-row">
              <span className="ticket-brand">豆豆冒險・出門任務卡</span>
              <span className="ticket-date">
                {shortDate(week)} – {shortDate(addDays(week, 6))}
              </span>
            </div>
            {head.length ? (
              <p className="ticket-title">
                這週學了{' '}
                {head.map((w, i) => (
                  <span key={w.kind + w.id}>
                    <em lang="en">{w.en}</em>
                    {i < head.length - 1 ? '、' : ''}
                  </span>
                ))}
              </p>
            ) : (
              <p className="ticket-title quiet">這週先玩固定題型</p>
            )}
            {words.length > 0 ? (
              <ul className="ticket-words">
                {words.map((w) => (
                  <li key={w.kind + w.id}>
                    <b lang="en">{w.en}</b>
                    {w.zh}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ticket-empty">
                這週還沒有在 App 裡學到東西。平日玩過之後，這張卡會自動換成學過的字。
                {d.source === 'local' && !d.attempts.length && ' 在手機上看？到「設定與同步」登入後，把資料來源切換成雲端。'}
              </p>
            )}
            {card.themes.length > 0 && (
              <p className="ticket-themes">
                這週的冒險故事：
                {card.themes
                  .map(themeDef)
                  .filter((t): t is ThemeDef => !!t)
                  .map((t) => t.zh)
                  .join('、')}
                。出門時可以接著玩：{themeDef(card.themes[card.themes.length - 1])?.dad}
              </p>
            )}
            <div className="ticket-progress">
              <RouteMark n={card.missions.length} done={doneN} />
              <span>
                完成 <b>{doneN}</b> / {card.missions.length}
              </span>
            </div>
          </header>

          <div className="ticket-perf" aria-hidden="true" />

          <ol className="ticket-stops">
            {card.missions.map((m, i) => (
              <Stop key={m.id} m={m} i={i} at={wt[m.id]} onToggle={() => toggle(m.id)} />
            ))}
          </ol>

          <footer className="ticket-foot">
            {recent.length > 0 && (
              <ul className="ticket-recall">
                {recent.map((r) => (
                  <li key={r.ts}>
                    <span className="recall-pic">{r.pick ? <Emoji name={vocab(r.pick).icon} /> : null}</span>
                    <span>
                      {dayLabel(r.date)}回到 App，豆豆問 <i lang="en">Did you see {findable(r.ids[0])?.art ?? 'a'} {vocab(r.ids[0]).en}?</i>
                      {r.pick ? (
                        <>
                          {' '}
                          → 他點了 <b lang="en">{vocab(r.pick).en}</b>
                        </>
                      ) : (
                        '　他沒有點（沒關係）'
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p>一次玩一題就好。他答不出來，你先示範一次；英文說一句就夠，其他用中文聊。</p>
          </footer>
        </article>

        <aside className="outing-aside">
          <div className="outing-tools">
            <button className="btn primary" onClick={copy}>
              {copied ? '已複製' : '複製成文字'}
            </button>
            <button className="btn" onClick={() => window.print()}>
              列印／存成 PDF
            </button>
          </div>
          <dl className="outing-legend">
            {(['lang', 'math', 'think'] as const).map((t) => (
              <div key={t} className={`t-${t}`}>
                <dt>{TRACK_ZH[t]}</dt>
                <dd>{t === 'lang' ? '找這週學的英文字、顏色、字母音' : t === 'math' ? '數數、形狀' : '順序、方向、條件、重複、規律：寫程式的基本功'}</dd>
              </div>
            ))}
          </dl>
          <p className="outing-fine">
            點左邊的圓圈標記完成。勾選只存在這台裝置；在平板上勾，回到 App 時豆豆會問他今天看到了什麼。
          </p>
        </aside>
      </div>
    </div>
  )
}
