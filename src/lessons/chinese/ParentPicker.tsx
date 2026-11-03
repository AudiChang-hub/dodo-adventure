import { useEffect, useState } from 'react'
import { ZH_TEXTS, pieces, talkOf, type ZhText } from './data'
import { RUNS_PER_TEXT } from './course'
import { doneDays, pickToday, timesByDay, todayRun } from './progress'
import './parent-picker.css'

/**
 * 家長區「中文課文」：每篇連上 3 次（第 1 次聽、第 2 次停下來讓他接、第 3 次跟著說），上滿 3 次才換下一篇。
 * 今天上第幾篇・第幾次在最上面；按「今天上這篇」換成那一篇（從第 1 次開始），那篇上滿 3 次再回到原本那篇。
 * 中文課是親子共讀（2026-11-03：App 不出聲，大人念）。每一篇看得到課文、紅字、聊一聊的問題、上過幾次。
 */
export function ZhParent() {
  const [done, setDone] = useState<Set<number> | null>(null)
  const [times, setTimes] = useState<Map<number, number>>(new Map())
  const [run, setRun] = useState<Awaited<ReturnType<typeof todayRun>> | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const load = () => {
    void Promise.all([doneDays(), timesByDay(), todayRun()]).then(([d, n, r]) => {
      setDone(d)
      setTimes(n)
      setRun(r)
    })
  }
  useEffect(load, [])

  const choose = async (day: number | null) => {
    await pickToday(day)
    load()
  }

  if (!done || !run) return <p className="empty">讀取中…</p>
  // 上到的地方為止（今天這篇、上過的篇裡最後面的），新的在上面
  const upTo = Math.max(run.day, ...done)
  const list = ZH_TEXTS.filter((t) => t.day <= upTo).reverse()
  const now = ZH_TEXTS.find((t) => t.day === run.day)!

  return (
    <>
      <h2>中文課文</h2>
      <p className="sub">
        中文課是親子共讀：App 不出聲，由你一行一行念給他聽。每篇連上 {RUNS_PER_TEXT} 次才換下一篇：第 1 次聽、第 2 次念到框起來的紅字前停一下讓他接、第 3 次讓他跟著說；每次念完照卡片聊一聊，再讓他選圖。照上過幾次走，沒上課的日子不會跳篇（共 180 篇）。
        按「今天上這篇」就換成那一篇、從第 1 次開始，那篇上完 {RUNS_PER_TEXT} 次再回到原本那篇。
      </p>
      <div className="card zh-now">
        <div>
          <div className="zh-now-label">今天孩子端上</div>
          <div className="zh-now-title">
            第 {now.day} 篇・第 {run.n} 次〈{now.title}〉
            <small>{run.picked ? '家長挑的' : '照順序'}</small>
          </div>
        </div>
        {run.picked && (
          <button type="button" className="zh-btn ghost" onClick={() => void choose(null)}>
            改回原本那篇
          </button>
        )}
      </div>
      <h3>
        上過 {done.size} 篇・上滿 {RUNS_PER_TEXT} 次的 {[...times.values()].filter((n) => n >= RUNS_PER_TEXT).length} 篇
      </h3>
      <ul className="zh-list">
        {list.map((t) => (
          <Row
            key={t.day}
            t={t}
            times={times.get(t.day) ?? 0}
            now={t.day === now.day ? run.n : 0}
            open={open === t.day}
            onOpen={() => setOpen((o) => (o === t.day ? null : t.day))}
            onPick={() => void choose(t.day)}
          />
        ))}
      </ul>
    </>
  )
}

function Row({ t, times, now, open, onOpen, onPick }: { t: ZhText; times: number; now: number; open: boolean; onOpen: () => void; onPick: () => void }) {
  const tk = talkOf(t.parentTip)
  return (
    <li className={`zh-row${now ? ' now' : ''}`}>
      <button type="button" className="zh-row-head" onClick={onOpen} aria-expanded={open}>
        <span className="zh-day">第 {t.day} 篇</span>
        <span className="zh-name">{t.title}</span>
        <span className="zh-cat">{t.category}</span>
        <span className={`zh-state${times >= RUNS_PER_TEXT ? ' done' : times ? ' some' : ''}`}>{times ? `上過 ${times} 次` : '沒上過'}</span>
      </button>
      {!now && (
        <button type="button" className="zh-btn" onClick={onPick}>
          今天上這篇
        </button>
      )}
      {!!now && <span className="zh-today">今天這篇・第 {now} 次</span>}
      {open && (
        <div className="zh-detail">
          {t.lines.map((l, i) => (
            <p key={i}>{pieces(l).map((p, j) => (p.red ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}</p>
          ))}
          {tk.questions.map((q, i) => (
            <p key={i} className="zh-ask-q">
              聊一聊：{q}
            </p>
          ))}
          <p className="zh-tip">{t.parentTip}</p>
        </div>
      )}
    </li>
  )
}
