import { useEffect, useMemo, useState } from 'react'
import { getKV, phaseOf, type Attempt } from '../../lib/db'
import { mastery, recentRate, type Mastery } from '../../lib/readiness'
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

      <div className="card">
        <h3>英文字母</h3>
        <Row title="認大寫" cells={LETTERS.map((L) => ({ label: L, m: m(`letter:${L}`) }))} />
        <Row title="認小寫" cells={LETTERS.map((L) => ({ label: L.toLowerCase(), m: m(`letter:${L.toLowerCase()}`) }))} />
        <p className="mline">
          「哪個是 A 開頭」的單字選圖：最近 {words.n} 題第一次就對 <b>{pct(words)}</b>
        </p>
        <p className="mline">描過的字母：{writtenL.length ? writtenL.join(' ') : <span className="empty">還沒有</span>}</p>
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
