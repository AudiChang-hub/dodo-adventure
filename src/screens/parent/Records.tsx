import { useMemo, useState } from 'react'
import { isQuiz, phaseOf, today, type Attempt, type Phase, type StationId } from '../../lib/db'
import { game } from '../../content/games'
import { download, lastDays, PHASE_NAME, skillLabel, STATION_NAME, toCSV, type ParentData } from './data'

const PAGE = 100

/** 結果欄：只有「自己答」有對錯；教學與一起練只說明發生了什麼 */
function Result({ a }: { a: Attempt }) {
  const p = phaseOf(a)
  if (p === 'teach') return <span className="chip teach">{a.metrics?.retaught ? '答錯後重教' : '新教'}</span>
  if (p === 'guided') return <span className="chip guided">{a.attempts <= 1 ? '跟著點對' : `跟著點，${a.attempts} 次`}</span>
  if (a.metrics?.retaught) return <span className="chip no">錯兩次，重教</span>
  return <span className={`chip ${a.firstTryCorrect ? 'ok' : 'no'}`}>{a.firstTryCorrect ? '一次就對' : a.hintUsed ? '看了提示' : `${a.attempts} 次`}</span>
}

export function Records({ d }: { d: ParentData }) {
  const [station, setStation] = useState<StationId | 'all'>('all')
  const [range, setRange] = useState<'today' | '7' | 'all'>('7')
  const [phase, setPhase] = useState<Phase | 'all'>('all')
  const [onlyMiss, setOnlyMiss] = useState(false)
  const [page, setPage] = useState(1)

  const rows = useMemo(() => {
    const from = range === 'today' ? today() : range === '7' ? lastDays(7)[0] : ''
    return d.attempts.filter(
      (a) =>
        (station === 'all' || a.station === station) &&
        (phase === 'all' || phaseOf(a) === phase) &&
        a.date >= from &&
        // 「沒答對」只對自己答有意義
        (!onlyMiss || (isQuiz(a) && !a.firstTryCorrect)),
    )
  }, [d, station, range, phase, onlyMiss])

  return (
    <>
      <h2>作答紀錄</h2>
      <p className="sub">每一題的完整紀錄。匯出後可以交給 PM 分析，用來調整或新增內容。</p>
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <select value={station} onChange={(e) => setStation(e.target.value as StationId | 'all')} aria-label="站點">
          <option value="all">全部站點</option>
          {(Object.keys(STATION_NAME) as StationId[]).map((s) => (
            <option key={s} value={s}>
              {STATION_NAME[s]}
            </option>
          ))}
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="期間">
          <option value="today">今天</option>
          <option value="7">最近 7 天</option>
          <option value="all">全部</option>
        </select>
        <select value={phase} onChange={(e) => setPhase(e.target.value as Phase | 'all')} aria-label="階段">
          <option value="all">全部階段</option>
          {(Object.keys(PHASE_NAME) as Phase[]).map((p) => (
            <option key={p} value={p}>
              {PHASE_NAME[p]}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 15 }}>
          <input type="checkbox" checked={onlyMiss} onChange={(e) => setOnlyMiss(e.target.checked)} />
          只看第一次沒答對的
        </label>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => download(`dodo-attempts-${today()}.csv`, toCSV(d.attempts), 'text/csv')}>
          匯出 CSV
        </button>
        <button
          className="btn primary"
          onClick={() => download(`dodo-data-${today()}.json`, JSON.stringify({ exported: new Date().toISOString(), attempts: d.attempts, sessions: d.sessions, skills: [...d.skills.entries()] }, null, 1), 'application/json')}
        >
          匯出完整資料
        </button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <p className="empty">這個條件下沒有紀錄。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>時間</th>
                <th>遊戲</th>
                <th>題目</th>
                <th>階段</th>
                <th>點了什麼</th>
                <th>結果</th>
                <th>反應</th>
                <th>難度</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, page * PAGE).map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(a.ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>
                    {STATION_NAME[a.station]}・{game(a.game)?.title ?? a.game}
                  </td>
                  <td>{skillLabel(a.skill)}</td>
                  <td>
                    <span className={`phase ${phaseOf(a)}`}>{PHASE_NAME[phaseOf(a)]}</span>
                  </td>
                  <td style={{ color: 'var(--ink-soft)' }}>{a.taps.length ? a.taps.map((t) => t.pick).join(' → ') : a.metrics ? Object.entries(a.metrics).map(([k, v]) => `${k} ${v}`).join('、') : '—'}</td>
                  <td>
                    <Result a={a} />
                  </td>
                  <td>{(a.responseMs / 1000).toFixed(1)} 秒</td>
                  <td>{a.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > page * PAGE && (
          <button className="btn" style={{ marginTop: 14 }} onClick={() => setPage((p) => p + 1)}>
            再顯示 {PAGE} 筆（共 {rows.length} 筆）
          </button>
        )}
      </div>
    </>
  )
}
