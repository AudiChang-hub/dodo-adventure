import { useEffect, useMemo, useState } from 'react'
import { getKV, phaseOf, type Attempt } from '../../lib/db'
import { mastery, recentRate, type Mastery } from '../../lib/readiness'
import { listenLine, listenStats, type ListenLesson, type ListenRow } from '../../lib/listen-report'
import { HEARD_MIN_RIGHT, HEARD_WINDOW } from '../../lib/heard'
import type { ParentData } from './data'
import './next.css'

/** 三堂課教的範圍：英文 A→Z、數學 1～10 */
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1)

type State = 'ok' | 'learning' | 'none'
const stateOf = (m: Mastery): State => (m.ok ? 'ok' : m.recent ? 'learning' : 'none')

/** 一格：熟練打勾；練習中寫最近幾題對幾題；還沒開始是淡的。滑過去（長按）看還差什麼 */
function Cell({ label, m }: { label: string; m: Mastery }) {
  const s = stateOf(m)
  return (
    <div className={`mcell is-${s}`} title={s === 'ok' ? '熟練了' : s === 'learning' ? `還差：${m.need}` : '還沒開始'}>
      <b>{label}</b>
      <small>{s === 'ok' ? '✓' : s === 'learning' ? `${m.right}/${m.recent}` : '·'}</small>
    </div>
  )
}

/** 一排 1～10、A～Z 的格子 */
function Row({ title, cells }: { title: string; cells: { label: string; m: Mastery }[] }) {
  const ok = cells.filter((c) => c.m.ok).length
  return (
    <div className="mrow">
      <p className="mrow-title">
        {title}
        <small>
          熟練 {ok}/{cells.length}
        </small>
      </p>
      <div className="mcells">
        {cells.map((c) => (
          <Cell key={c.label} {...c} />
        ))}
      </div>
    </div>
  )
}

const pct = (r: { n: number; right: number }) => (r.n ? `${Math.round((100 * r.right) / r.n)}%` : '—')

/** 聽完才答看幾天 */
const LISTEN_DAYS = 14
/** 先列幾種題目，其他的收在「還有幾種」 */
const LISTEN_ROWS = 6

/** 一種題目：名字、聽完才答／沒聽完就點的長條、那一句中文 */
function ListenItem({ r }: { r: ListenRow }) {
  const n = r.heard + r.guessed
  const w = (x: number) => `${(100 * x) / Math.max(1, n)}%`
  return (
    <li>
      <span className="listen-bar" aria-hidden="true">
        <i className="is-right" style={{ width: w(r.right) }} />
        <i className="is-wrong" style={{ width: w(r.heard - r.right) }} />
        <i className="is-guess" style={{ width: w(r.guessed) }} />
      </span>
      <span className="listen-text">{listenLine(r)}</span>
    </li>
  )
}

/**
 * 聽完才答（T-109，家長：孩子常常沒聽波波說完就點，看起來都是用猜的）：
 * 波波／豆豆念完題目的關鍵字（Big S 的「S」、More 的「More」）才點的叫「聽完才答」，看得出他是不是真的聽懂；
 * 還沒念完就點的是猜的，不計入熟練、也不算錯。
 */
function Listen({ A, lesson }: { A: readonly Attempt[]; lesson: ListenLesson }) {
  const st = useMemo(() => listenStats(A, lesson, LISTEN_DAYS), [A, lesson])
  if (!st.total)
    return (
      <div className="listen">
        <p className="listen-head">
          聽完才答 <small>最近 {LISTEN_DAYS} 天還沒有紀錄（這次更新之後才開始記）</small>
        </p>
      </div>
    )
  const head = st.rows.slice(0, LISTEN_ROWS)
  const rest = st.rows.slice(LISTEN_ROWS)
  return (
    <div className="listen">
      <p className="listen-head">
        聽完才答 <b>{Math.round((100 * st.heard) / st.total)}%</b>
        <small>
          最近 {LISTEN_DAYS} 天 {st.total} 題：聽完才答 {st.heard} 題
          {st.heard ? `，對 ${st.right} 題（${Math.round((100 * st.right) / st.heard)}%）` : ''}；沒聽完就點 {st.guessed} 題
          {st.guessed ? `（猜對 ${st.guessedRight} 題）` : ''}
        </small>
      </p>
      <ul className="listen-list">
        {head.map((r) => (
          <ListenItem key={r.label} r={r} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="listen-more">
          <summary>還有 {rest.length} 種題目</summary>
          <ul className="listen-list">
            {rest.map((r) => (
              <ListenItem key={r.label} r={r} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** 這幾題有沒有描過（描字不是選擇題，只看有沒有自己描完） */
const traced = (attempts: readonly Attempt[], skill: string) => attempts.some((a) => a.skill === skill && phaseOf(a) === 'quiz')

/**
 * 學習進度：三堂課各一張卡（現況對照 A2）。熟練的算法跟「下一步準備度」一樣（lib/readiness.ts）：
 * 三選一以上、第一次就答對，最近 10 題至少對 8 題、分在 3 天以上、隔兩天再考還記得。
 */
export function Progress({ d }: { d: ParentData }) {
  const A = d.attempts
  const m = useMemo(() => {
    const cache = new Map<string, Mastery>()
    return (skill: string) => cache.get(skill) ?? (cache.set(skill, mastery(A, skill)), cache.get(skill)!)
  }, [A])
  const [zhDone, setZhDone] = useState<number | null>(null)
  useEffect(() => {
    void getKV<number[]>('zhLesson:done', []).then((x) => setZhDone(x.length))
  }, [])

  const words = recentRate(A, (a) => a.skill.startsWith('phonics:'), 20)
  const zh = recentRate(A, (a) => a.skill.startsWith('zhtext:'), 20)
  // 中文：最近答錯（第一次沒選對）的詞，新的在前、不重複
  const zhWrong = [...new Set(A.filter((a) => a.skill.startsWith('zhtext:') && phaseOf(a) !== 'teach' && !a.firstTryCorrect).sort((x, y) => y.ts - x.ts).map((a) => a.skill.slice(7)))].slice(0, 6)
  const writtenL = LETTERS.filter((L) => traced(A, `write:${L}`) || traced(A, `write:${L.toLowerCase()}`))
  const writtenN = NUMBERS.filter((n) => traced(A, `glyph:${n}`))

  return (
    <>
      <h2>學習進度</h2>
      <p className="sub">
        三堂課學到哪裡。<span className="mlegend is-ok">✓ 熟練</span>
        <span className="mlegend is-learning">8/10 練習中（最近幾題對幾題）</span>
        <span className="mlegend is-none">· 還沒開始</span>
        熟練要三選一以上、第一次就答對，最近 10 題至少對 8 題、分在 3 天以上、隔兩天再考還記得。滑過格子（手機長按）看還差什麼。
      </p>
      <p className="sub listen-legend">
        <span className="mlegend is-right">聽完才答、對</span>
        <span className="mlegend is-wrong">聽完才答、錯</span>
        <span className="mlegend is-guess">沒聽完就點</span>
        「沒聽完就點」是波波還沒說完題目的關鍵字（Big S 的「S」、More 的「More」）就點了，算猜的：不計入熟練，也不算錯。
        孩子端的熟練只看聽完才答的，最近 {HEARD_WINDOW} 次要對 {HEARD_MIN_RIGHT} 次以上（2 選 1 用猜的做到的機會不到 2 成）。
      </p>

      <div className="card">
        <h3>英文字母</h3>
        <Row title="認大寫" cells={LETTERS.map((L) => ({ label: L, m: m(`letter:${L}`) }))} />
        <Row title="認小寫" cells={LETTERS.map((L) => ({ label: L.toLowerCase(), m: m(`letter:${L.toLowerCase()}`) }))} />
        <p className="mline">
          「哪個是 A 開頭」的單字選圖：最近 {words.n} 題第一次就對 <b>{pct(words)}</b>
        </p>
        <p className="mline">描過的字母：{writtenL.length ? writtenL.join(' ') : <span className="empty">還沒有</span>}</p>
        <Listen A={A} lesson="english" />
      </div>

      <div className="card">
        <h3>數學數字</h3>
        <Row title="有幾個（數數）" cells={NUMBERS.map((n) => ({ label: String(n), m: m(`count:${n}`) }))} />
        <Row title="找數字" cells={NUMBERS.map((n) => ({ label: String(n), m: m(`num:${n}`) }))} />
        <Row title="拿給波波" cells={NUMBERS.map((n) => ({ label: String(n), m: m(`give:${n}`) }))} />
        <Row
          title="比多少（只有兩邊可以選，要 10 題對 9 題）"
          cells={[
            { label: '多', m: m('compare:more') },
            { label: '少', m: m('compare:less') },
          ]}
        />
        <p className="mline">寫過的數字：{writtenN.length ? writtenN.join(' ') : <span className="empty">還沒有</span>}</p>
        <Listen A={A} lesson="math" />
      </div>

      <div className="card">
        <h3>中文課文</h3>
        <p className="mline">
          上過 <b>{zhDone ?? '…'}</b> 篇（哪幾篇、今天上哪一篇在「中文課文」分頁）
        </p>
        <p className="mline">
          紅字選圖：最近 {zh.n} 題第一次就對 <b>{pct(zh)}</b>
        </p>
        <p className="mline">最近答錯的詞：{zhWrong.length ? zhWrong.join('、') : <span className="empty">沒有</span>}</p>
      </div>
    </>
  )
}
