import { useEffect, useState } from 'react'
import { today } from '../../lib/db'
import { ZH_TEXTS, clipRows, hasClip, pieces, zhReady, type ZhText } from './data'
import { doneDays, pickToday, pickedToday, scheduled } from './progress'
import './parent-picker.css'

/**
 * 家長區「中文課文」：孩子端只看得到今天那一篇；以前沒上過的，家長在這裡挑「今天上這篇」。
 * 挑了只在今天有效（明天回到照日期）。每一篇也看得到課文、紅字、聲音好了幾句。
 */
export function ZhParent() {
  const [done, setDone] = useState<Set<number> | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [ready, setReady] = useState<Set<string> | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const t0 = today()
  const sched = scheduled(t0)

  const load = () => {
    void Promise.all([doneDays(), pickedToday(), zhReady()]).then(([d, p, r]) => {
      setDone(d)
      setPick(p)
      setReady(r)
    })
  }
  useEffect(load, [])

  const choose = async (day: number | null) => {
    await pickToday(day)
    load()
  }

  if (!done || !ready) return <p className="empty">讀取中…</p>
  // 今天以前（含今天）的篇；還沒開始上課（2026-11-02 以前）時只有第 1 篇
  const past = ZH_TEXTS.filter((t) => t.date <= t0 || t.day === sched.day).reverse()
  const now = ZH_TEXTS.find((t) => t.day === (pick ?? sched.day))!
  const notDone = past.filter((t) => !done.has(t.day)).length

  return (
    <>
      <h2>中文課文</h2>
      <p className="sub">
        孩子端照日期一天一篇（2026-11-02 起，共 180 篇）。以前沒上過的，按「今天上這篇」就換成那一篇，只在今天有效。
      </p>
      <div className="card zh-now">
        <div>
          <div className="zh-now-label">今天孩子端上</div>
          <div className="zh-now-title">
            第 {now.day} 天〈{now.title}〉
            <small>{pick != null ? '家長挑的' : '照日期'}</small>
          </div>
        </div>
        {pick != null && (
          <button type="button" className="zh-btn ghost" onClick={() => void choose(null)}>
            改回照日期
          </button>
        )}
      </div>
      <h3>
        到今天為止 {past.length} 篇・上過 {past.length - notDone} 篇・沒上過 {notDone} 篇
      </h3>
      <ul className="zh-list">
        {past.map((t) => (
          <Row
            key={t.day}
            t={t}
            done={done.has(t.day)}
            now={t.day === now.day}
            ready={ready}
            open={open === t.day}
            onOpen={() => setOpen((o) => (o === t.day ? null : t.day))}
            onPick={() => void choose(t.day === sched.day ? null : t.day)}
          />
        ))}
      </ul>
    </>
  )
}

function Row({ t, done, now, ready, open, onOpen, onPick }: { t: ZhText; done: boolean; now: boolean; ready: Set<string>; open: boolean; onOpen: () => void; onPick: () => void }) {
  const rows = clipRows(t)
  const ok = rows.filter((r) => hasClip(ready, r.kind, r.text)).length
  return (
    <li className={`zh-row${now ? ' now' : ''}`}>
      <button type="button" className="zh-row-head" onClick={onOpen} aria-expanded={open}>
        <span className="zh-day">第 {t.day} 天</span>
        <span className="zh-date">{t.date.slice(5).replace('-', '/')}</span>
        <span className="zh-name">{t.title}</span>
        <span className="zh-cat">{t.category}</span>
        <span className={`zh-voice${ok === rows.length ? ' full' : ''}`}>聲音 {ok}/{rows.length}</span>
        <span className={`zh-state${done ? ' done' : ''}`}>{done ? '上過' : '沒上過'}</span>
      </button>
      {!now && (
        <button type="button" className="zh-btn" onClick={onPick}>
          今天上這篇
        </button>
      )}
      {now && <span className="zh-today">今天這篇</span>}
      {open && (
        <div className="zh-detail">
          {t.lines.map((l, i) => (
            <p key={i}>{pieces(l).map((p, j) => (p.red ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}</p>
          ))}
          <p className="zh-tip">{t.parentTip}</p>
        </div>
      )}
    </li>
  )
}
