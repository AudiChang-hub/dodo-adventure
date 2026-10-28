import { isQuiz, phaseOf, today, type Attempt, type StationId } from '../../lib/db'
import { game } from '../../content/games'
import { lastDays, minutesByDay, pct, skillLabel, STATION_NAME, type ParentData } from './data'
import { isDueAt, isScored } from '../../lib/engine'
import { LoadAlert, playDayIndex } from './EngineCards'
import { CurriculumCard, TrackCard } from './Tracks'

/**
 * 今天新教了什麼：今天的教學紀錄（不含答錯後的重教），每個技能一筆，
 * 並附上教完之後第一次自己答的結果，家長可以看出「教了有沒有學會」。
 */
function taughtToday(todayA: Attempt[]) {
  const seen = new Set<string>()
  const out: { skill: string; game: string; then: 'ok' | 'no' | null }[] = []
  // todayA 是新到舊，倒過來才是教學發生的順序
  for (const a of [...todayA].reverse()) {
    if (phaseOf(a) !== 'teach' || a.metrics?.retaught || seen.has(a.skill)) continue
    seen.add(a.skill)
    const after = todayA.filter((q) => q.skill === a.skill && isQuiz(q) && q.ts > a.ts).sort((x, y) => x.ts - y.ts)[0]
    out.push({ skill: a.skill, game: a.game, then: after ? (after.firstTryCorrect ? 'ok' : 'no') : null })
  }
  return out
}

function Bars({ days, values, max, fmt }: { days: string[]; values: number[]; max: number; fmt: (v: number) => string }) {
  const h = 120
  const w = 560
  const bw = w / days.length
  return (
    <svg viewBox={`0 0 ${w} ${h + 40}`} width="100%" role="img" aria-label="最近 7 天每天的遊玩分鐘數">
      {values.map((v, i) => {
        const bh = max ? (v / max) * h : 0
        return (
          <g key={days[i]}>
            <rect x={i * bw + bw * 0.22} y={h - bh} width={bw * 0.56} height={Math.max(2, bh)} rx={6} fill={days[i] === today() ? '#D38A5E' : '#F0B088'} />
            <text x={i * bw + bw / 2} y={h - bh - 8} textAnchor="middle" fontSize={13} fill="#6B645A">
              {v ? fmt(v) : ''}
            </text>
            <text x={i * bw + bw / 2} y={h + 24} textAnchor="middle" fontSize={13} fill="#6B645A">
              {days[i].slice(5).replace('-', '/')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function Overview({ d }: { d: ParentData }) {
  const t = today()
  const todayAll = d.attempts.filter((a) => a.date === t)
  const taught = taughtToday(todayAll)
  const retaught = todayAll.filter((a) => phaseOf(a) === 'teach' && a.metrics?.retaught).length
  // 答題數、答對率只算「自己答」；教學卡與一起練不計分
  const quizzes = d.attempts.filter(isQuiz)
  const todayA = todayAll.filter(isQuiz)
  // 第一次答對率排除程度校準的探測題（故意出難的）與 Sam 教豆豆，和負擔控制同一套算法
  const todayScored = todayAll.filter(isScored)
  const day = playDayIndex(d)
  const dueN = [...d.skills.values()].filter((s) => isDueAt(s as { box: number; due?: number }, day)).length
  const mins = minutesByDay(d.sessions)
  const days = lastDays(7)
  const week = quizzes.filter((a) => a.date >= days[0])

  const byStation = (Object.keys(STATION_NAME) as StationId[]).map((s) => {
    const rows = week.filter((a) => a.station === s)
    return { s, n: rows.length, ok: rows.filter((a) => a.firstTryCorrect).length, ms: rows.length ? Math.round(rows.reduce((x, a) => x + a.responseMs, 0) / rows.length / 100) / 10 : 0 }
  })

  // 需要多練習：最近出現 3 次以上、第一次答對率最低的技能
  const stats = new Map<string, { n: number; ok: number }>()
  for (const a of quizzes.slice(0, 600)) {
    const s = stats.get(a.skill) ?? { n: 0, ok: 0 }
    s.n++
    if (a.firstTryCorrect) s.ok++
    stats.set(a.skill, s)
  }
  const weak = [...stats.entries()].filter(([, s]) => s.n >= 3).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).slice(0, 6)
  const strong = [...d.skills.entries()].filter(([, s]) => s.box >= 4).map(([k]) => k).slice(0, 12)

  return (
    <>
      <h2>總覽</h2>
      <p className="sub">{d.source === 'cloud' ? '資料來源：雲端' : '資料來源：這台裝置'}</p>
      <LoadAlert d={d} />
      {/* 五張數字卡：平板橫向一排放得下，手機自動換行 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div className="card stat">
          <div className="label">今天玩了</div>
          <div className="value">
            {Math.round(mins.get(t) ?? 0)}
            <small>分鐘</small>
          </div>
        </div>
        <div className="card stat">
          <div className="label">今天自己答</div>
          <div className="value">
            {todayA.length}
            <small>題</small>
          </div>
        </div>
        <div className="card stat">
          <div className="label">今天第一次就答對</div>
          <div className="value">
            {pct(todayScored.filter((a) => a.firstTryCorrect).length, todayScored.length)}
            <small>%</small>
          </div>
        </div>
        <div className="card stat">
          <div className="label">今天到期複習</div>
          <div className="value">
            {dueN}
            <small>個</small>
          </div>
        </div>
        <div className="card stat">
          <div className="label">累計答題</div>
          <div className="value">
            {quizzes.length}
            <small>題</small>
          </div>
        </div>
      </div>

      <TrackCard d={d} />

      <div className="card">
        <h3>
          今天新教了 {taught.length ? `${taught.length} 個` : ''}
          {retaught > 0 && <small style={{ marginLeft: 10, fontWeight: 400, color: 'var(--ink-soft)', fontSize: 13 }}>另外有 {retaught} 次答錯兩次、重教了一遍</small>}
        </h3>
        {taught.length ? (
          <ul className="taught" style={{ margin: 0, padding: 0 }}>
            {taught.map((x) => (
              <li key={x.skill}>
                {skillLabel(x.skill)}
                <small>{game(x.game)?.title ?? x.game}</small>
                {x.then && <span className={`then${x.then === 'no' ? ' no' : ''}`}>{x.then === 'ok' ? '教完自己答對' : '教完還在練'}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">今天還沒有遇到新的內容。新的字母、數字、詞彙第一次出現時，會先教再考，教過的會列在這裡。</p>
        )}
      </div>

      <div className="card">
        <h3>最近 7 天的遊玩時間（分鐘）</h3>
        <Bars days={days} values={days.map((x) => mins.get(x) ?? 0)} max={Math.max(20, ...days.map((x) => mins.get(x) ?? 0))} fmt={(v) => String(Math.round(v))} />
      </div>

      <div className="card">
        <h3>最近 7 天各站點</h3>
        <table>
          <thead>
            <tr>
              <th>站點</th>
              <th>題數</th>
              <th>第一次就答對</th>
              <th>平均反應時間</th>
            </tr>
          </thead>
          <tbody>
            {byStation.map((r) => (
              <tr key={r.s}>
                <td>{STATION_NAME[r.s]}</td>
                <td>{r.n}</td>
                <td>{r.n ? `${pct(r.ok, r.n)}%` : '—'}</td>
                <td>{r.n ? `${r.ms} 秒` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="card">
          <h3>需要多練習</h3>
          {weak.length ? (
            <table>
              <tbody>
                {weak.map(([k, s]) => (
                  <tr key={k}>
                    <td>{skillLabel(k)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {s.ok}/{s.n} 第一次就對
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">再多玩幾次就會出現。</p>
          )}
        </div>
        <div className="card">
          <h3>已經很熟了</h3>
          {strong.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {strong.map((k) => (
                <span key={k} className="chip ok">
                  {skillLabel(k)}
                </span>
              ))}
            </div>
          ) : (
            <p className="empty">連續答對幾次之後就會出現在這裡。</p>
          )}
        </div>
      </div>

      <CurriculumCard />
    </>
  )
}
