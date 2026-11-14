import { useEffect, useMemo, useState } from 'react'
import { getKV, setKV, today } from '../../lib/db'
import { lessonRuns } from '../../lib/lesson-log'
import { OBSERVE, OBSERVE_DAYS, OBSERVE_NEED, readiness, type LessonRun, type Observation } from '../../lib/readiness'
import type { ParentData } from './data'
import { afterChecks, useChecks } from '../../lib/parent-check'
import { FRESH_DAYS, STAGE4_SUBJECTS, subjectView, type GateRow, type SubjectView } from './stage4-registry'
import './next.css'

/** 家長每月勾的觀察（最新的在最後；只存在這台裝置） */
export const OBSERVE_KEY = 'parent.observe'

/**
 * 下一步準備度（總覽最上面）：全球幼教指引 NEXT-1～6 每一條一行，做到了打勾、沒做到寫還差什麼，最後一行是建議。
 * 下面是家長每月勾一次的觀察清單（NEXT-5：App 量不到的口語、說故事、輪流…）。
 */
export function NextStep({ d }: { d: ParentData }) {
  const [runs, setRuns] = useState<LessonRun[]>([])
  const [log, setLog] = useState<Observation[]>([])
  useEffect(() => {
    void Promise.all([lessonRuns(), getKV<Observation[]>(OBSERVE_KEY, [])]).then(([r, o]) => {
      setRuns(r)
      setLog(o)
    })
  }, [])
  const last = log[log.length - 1] ?? null
  const t = today()
  // 家長按過「還不會」的概念：只看那之後的作答（T-109，真的學會了嗎？）
  const checks = useChecks()
  const attempts = useMemo(() => afterChecks(d.attempts, checks), [d.attempts, checks])
  const r = useMemo(() => readiness({ attempts, runs, observation: last, today: t }), [attempts, runs, last, t])

  const save = async (o: Observation) => {
    const next = [...log.filter((x) => x.date !== o.date), o].slice(-24)
    await setKV(OBSERVE_KEY, next)
    setLog(next)
  }

  return (
    <div className={`card ready-card${r.ready ? ' is-ready' : ''}`}>
      <h3>下一步準備度</h3>
      <p className="sub next-sub">什麼時候可以開始 4 歲的內容：每一條都做到，才建議往下走。熟練的意思是三選一以上、第一次就答對，最近 10 題至少對 8 題，分在 3 天以上，而且隔兩天再考還記得（用猜的過不了）。</p>
      <ul className="next-list">
        {r.items.map((x) => (
          <li key={x.id} className={x.ok ? 'is-ok' : x.id === 'NEXT-6' ? 'is-warn' : 'is-todo'}>
            <span className="next-mark" aria-hidden="true">
              {x.ok ? '✓' : x.id === 'NEXT-6' ? '!' : '○'}
            </span>
            <span className="next-area">{x.area}</span>
            <span className="next-detail">{x.detail}</span>
          </li>
        ))}
      </ul>
      <p className={`next-advice${r.ready ? ' is-ready' : ''}`}>{r.advice}</p>
      {d.source === 'cloud' && <p className="note">作答紀錄看的是雲端；上課紀錄、家長觀察只存在這台裝置。</p>}
      <Stage4 d={d} />
      <ObserveForm last={last} onSave={save} />
    </div>
  )
}

/** 每月一次的觀察：8 項做得到的打勾，另外一項「覺得他有壓力」是警訊（NEXT-6） */
function ObserveForm({ last, onSave }: { last: Observation | null; onSave: (o: Observation) => Promise<void> }) {
  const t = today()
  const daysSince = last ? Math.round((Date.parse(t) - Date.parse(last.date)) / 86_400_000) : null
  const due = daysSince == null || daysSince >= OBSERVE_DAYS
  const [checks, setChecks] = useState<string[]>(last?.checks ?? [])
  const [stress, setStress] = useState(last?.stress ?? false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setChecks(last?.checks ?? [])
    setStress(last?.stress ?? false)
  }, [last])
  const toggle = (id: string) => {
    setSaved(false)
    setChecks((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }
  return (
    <details className="next-observe" open={due}>
      <summary>
        家長觀察（每月勾一次）
        <small>{last ? `上次 ${last.date}，${checks.length} 項做得到${due ? '；該再勾一次了' : ''}` : '還沒勾過'}</small>
      </summary>
      <p className="sub">平常看到他做得到的打勾（App 量不到的部分）。至少 {OBSERVE_NEED} 項做得到，才算這一條做到。</p>
      <div className="next-checks">
        {OBSERVE.map((o) => (
          <label key={o.id} className={checks.includes(o.id) ? 'is-on' : undefined}>
            <input type="checkbox" checked={checks.includes(o.id)} onChange={() => toggle(o.id)} />
            {o.text}
          </label>
        ))}
      </div>
      <label className={`next-stress${stress ? ' is-on' : ''}`}>
        <input
          type="checkbox"
          checked={stress}
          onChange={(e) => {
            setSaved(false)
            setStress(e.target.checked)
          }}
        />
        我覺得他最近玩的時候有壓力（勾了就先不要往下走）
      </label>
      <div className="next-save">
        <button
          className="btn"
          onClick={() => {
            void onSave({ date: t, checks, stress }).then(() => setSaved(true))
          }}
        >
          存下來（{t}）
        </button>
        {saved && <span className="next-saved">存好了</span>}
      </div>
    </details>
  )
}

/** 每科存的東西：門（kvKey）、暫停（pauseKey） */
type Stored = Record<string, { kv: unknown; paused: boolean }>

/**
 * 4 歲的內容（T-150 P，設計稿第六節）：每科每道門一行（開了沒、哪天開的、每堂出多少、目前級數、還差什麼），
 * 每科一個「暫停 4 歲內容」開關（kv 的 stage4.paused.<科>，存 true 就暫停）。三科的門從 ./stage4-registry.ts 讀。
 */
function Stage4({ d }: { d: ParentData }) {
  const [stored, setStored] = useState<Stored | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all(
      STAGE4_SUBJECTS.map(async (s) => {
        const [kv, paused] = await Promise.all([getKV<unknown>(s.kvKey, {}), getKV<boolean | null>(s.pauseKey, null)])
        return [s.id, { kv, paused: paused === true }] as const
      }),
    ).then((xs) => {
      if (live) setStored(Object.fromEntries(xs))
    })
    return () => {
      live = false
    }
  }, [])
  const t = today()
  const views = useMemo(
    () => (stored ? STAGE4_SUBJECTS.map((s) => subjectView(s, d.attempts, stored[s.id]?.kv, stored[s.id]?.paused ?? false, t)) : []),
    [stored, d.attempts, t],
  )
  const setPaused = async (v: SubjectView, on: boolean) => {
    const id = v.subject.id
    setBusy(id)
    setStored((x) => x && { ...x, [id]: { ...x[id], paused: on } })
    try {
      await setKV(v.subject.pauseKey, on)
    } catch {
      setStored((x) => x && { ...x, [id]: { ...x[id], paused: !on } })
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="stage4" aria-labelledby="stage4-title">
      <h4 id="stage4-title">4 歲的內容</h4>
      <p className="sub stage4-sub">
        每個能力熟練了，下次進那一課就自動開一道門（同一科一天最多開一道）。開了不會再關；答不好時，內容自己退一級。剛開的頭 {FRESH_DAYS} 天每堂最多 1 個 4 歲回合，之後每堂最多一半。
      </p>
      {!stored ? (
        <p className="sub">讀取中…</p>
      ) : (
        <div className="stage4-subjects">
          {views.map((v) => (
            <div key={v.subject.id} className={`stage4-subject${v.paused ? ' is-paused' : ''}${v.ready ? '' : ' is-none'}`} data-subject={v.subject.id}>
              <div className="stage4-head">
                <h5>{v.subject.name}</h5>
                <label className={`stage4-pause${v.paused ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={v.paused}
                    disabled={busy === v.subject.id}
                    aria-describedby={`stage4-pause-${v.subject.id}`}
                    onChange={(e) => void setPaused(v, e.target.checked)}
                  />
                  暫停{v.subject.name}的 4 歲內容
                </label>
              </div>
              <p className="stage4-pause-note" id={`stage4-pause-${v.subject.id}`}>
                {v.paused ? '暫停中：' : '打勾就暫停：'}
                {v.subject.name}課照 3 歲的上，還沒開的門也不會開；已經開的門會記著，取消暫停就接著用。
              </p>
              {v.ready ? (
                <ul className="stage4-list">
                  {v.rows.map((r) => (
                    <GateLine key={r.id} r={r} />
                  ))}
                </ul>
              ) : (
                <p className="stage4-none">尚未提供：{v.subject.name}的 4 歲內容還在做，好了會自動出現在這裡。</p>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="note">門和暫停都只存在這台裝置；「重置學習進度」會把門和暫停一起清掉。</p>
    </section>
  )
}

function GateLine({ r }: { r: GateRow }) {
  return (
    <li className={`is-${r.state}`} data-gate={r.id}>
      <span className="next-mark" aria-hidden="true">
        {r.state === 'open' ? '✓' : r.state === 'paused' ? 'Ⅱ' : '○'}
      </span>
      <span className="stage4-label">{r.label}</span>
      <span className="stage4-detail">
        <span className="stage4-status">
          {r.status}
          {r.dose && `：${r.dose}`}
          {r.level && `；${r.level}`}
        </span>
        {r.need && <span className="stage4-need">{r.need}</span>}
      </span>
    </li>
  )
}
