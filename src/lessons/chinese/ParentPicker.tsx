import { useEffect, useState } from 'react'
import { ZH_TEXTS, pieces, talkFor, type ZhText } from './data'
import { RUNS_PER_TEXT } from './course'
import { doneDays, pickToday, timesByDay, todayRun } from './progress'
import './parent-picker.css'

/**
 * 家長區「中文課文」：一天兩篇，一舊一新（T-136，家長 2026-11-11 定案；排課在 course.ts）。
 * 今天的新篇、舊篇（3 次前上的）、結尾小複習的篇在最上面；按「今天上這篇」那一篇就當今天的新篇，上完回到原本排到的那篇。
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
  const old = run.old == null ? null : ZH_TEXTS.find((t) => t.day === run.old)
  const review = run.review.map((d) => ZH_TEXTS.find((t) => t.day === d)!)

  return (
    <>
      <h2>中文課文</h2>
      <p className="sub">
        中文課是親子共讀：App 不出聲，由你一行一行念給他聽。一天兩篇，一舊一新：先複習 3 次前上的那篇（短版：念一次、問一題、找一樣的字，他累了可以跳過），
        再上新的一篇（念課文、聊一聊、選圖、找一樣的字），最後從前 1 次、前 7 次上的各問一題。每上一次就換新的一篇，照上過幾次走，沒上課的日子不會跳篇（共 180 篇）。
        按「今天上這篇」那一篇就當今天的新篇，上完再回到原本排到的那篇。
      </p>
      <div className="card zh-now">
        <div>
          <div className="zh-now-label">今天的新篇</div>
          <div className="zh-now-title">
            第 {now.day} 篇〈{now.title}〉
            <small>{run.picked ? '家長挑的' : '照順序'}</small>
          </div>
          <div className="zh-now-more">
            先複習的舊篇：{old ? `第 ${old.day} 篇〈${old.title}〉（3 次前上的）` : '還沒有（前 3 次沒有舊篇）'}
            <br />
            最後的小複習：{review.length ? review.map((t) => `第 ${t.day} 篇〈${t.title}〉`).join('、') : '還沒有'}
          </div>
        </div>
        {run.picked && (
          <button type="button" className="zh-btn ghost" onClick={() => void choose(null)}>
            改回原本那篇
          </button>
        )}
      </div>
      <h3>
        上過 {done.size} 篇
      </h3>
      <ul className="zh-list">
        {list.map((t) => (
          <Row
            key={t.day}
            t={t}
            times={times.get(t.day) ?? 0}
            now={t.day === now.day ? 'new' : t.day === old?.day ? 'old' : null}
            open={open === t.day}
            onOpen={() => setOpen((o) => (o === t.day ? null : t.day))}
            onPick={() => void choose(t.day)}
          />
        ))}
      </ul>
    </>
  )
}

function Row({ t, times, now, open, onOpen, onPick }: { t: ZhText; times: number; now: 'new' | 'old' | null; open: boolean; onOpen: () => void; onPick: () => void }) {
  const tk = talkFor(t)
  return (
    <li className={`zh-row${now ? ' now' : ''}`}>
      <button type="button" className="zh-row-head" onClick={onOpen} aria-expanded={open}>
        <span className="zh-day">第 {t.day} 篇</span>
        <span className="zh-name">{t.title}</span>
        <span className="zh-cat">{t.category}</span>
        <span className={`zh-state${times >= RUNS_PER_TEXT ? ' done' : times ? ' some' : ''}`}>{times ? `上過 ${times} 次` : '沒上過'}</span>
      </button>
      {now !== 'new' && (
        <button type="button" className="zh-btn" onClick={onPick}>
          今天上這篇
        </button>
      )}
      {now === 'new' && <span className="zh-today">今天的新篇</span>}
      {now === 'old' && <span className="zh-today">今天先複習</span>}
      {open && (
        <div className="zh-detail">
          {t.lines.map((l, i) => (
            <p key={i}>{pieces(l).map((p, j) => (p.red ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}</p>
          ))}
          <p className="zh-ask-q">
            聊一聊：{tk.q}（答不出來時：「{tk.a}」）
          </p>
          <p className="zh-tip">{t.parentTip}</p>
        </div>
      )}
    </li>
  )
}
