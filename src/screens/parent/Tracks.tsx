import { useMemo } from 'react'
import { today, type Skill } from '../../lib/db'
import { isDueAt, loadCheck } from '../../lib/engine'
import { conceptIntros, loadSpans, radarScores, shiftDate, trackNeeds, RADAR_W, NEW_PER_WEEK, STARTER_NEW, type RadarAxis, type TrackNeed } from '../../lib/tracks'
import { CURRICULUM, TRACKS, conceptLabel, track, type TrackId } from '../../content/tracks'
import { THEME_LABEL } from '../../content/vocab'
import { themeEnds, useSettings, weekTheme } from '../../lib/settings'
import { playDayIndex } from './EngineCards'
import type { ParentData } from './data'
import './tracks.css'

/**
 * 四條能力主線（PRD §5.10）：雷達圖、每條線的說明、這幾天多排哪一條、每週新概念額度，以及課綱對照。
 * 全部從作答紀錄算（lib/tracks.ts），本機或雲端資料都一樣。
 */

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`

// ── 雷達圖 ───────────────────────────────────────────────────
// 四軸的方向：語言在上、數與規律在右、思考在下、動手在左（順時針，和下面的清單同一個順序）
const W = 440
const H = 352
const CX = W / 2
const CY = H / 2
const R = 124
const ANGLE: Record<TrackId, number> = { lang: -90, num: 0, think: 90, hand: 180 }

const at = (t: TrackId, v: number): [number, number] => {
  const a = (ANGLE[t] * Math.PI) / 180
  return [CX + Math.cos(a) * R * v, CY + Math.sin(a) * R * v]
}
const poly = (vals: Record<TrackId, number>) =>
  TRACKS.map((t) => at(t.id, vals[t.id] / 100))
    .map((p) => p.map((x) => x.toFixed(1)).join(','))
    .join(' ')

function Radar({ now, prev }: { now: RadarAxis[]; prev: RadarAxis[] | null }) {
  const v = (rows: RadarAxis[]) => Object.fromEntries(rows.map((r) => [r.track, r.score])) as Record<TrackId, number>
  const cur = v(now)
  const label = `能力雷達圖：${now.map((r) => `${track(r.track).name} ${r.score} 分`).join('，')}${prev ? `；上週 ${prev.map((r) => `${track(r.track).name} ${r.score}`).join('，')}` : ''}`
  return (
    <svg className="radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {/* 底圖：25、50、75、100 分的四圈 */}
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} className={k === 1 ? 'ring outer' : 'ring'} points={poly({ lang: k * 100, num: k * 100, think: k * 100, hand: k * 100 })} />
      ))}
      {TRACKS.map((t) => {
        const [x, y] = at(t.id, 1)
        return <line key={t.id} className="axis" x1={CX} y1={CY} x2={x} y2={y} />
      })}
      <text className="tick" x={CX + 4} y={CY - R * 0.5 + 4}>
        50
      </text>
      <text className="tick" x={CX + 4} y={CY - R + 12}>
        100
      </text>
      {prev && <polygon className="prev" points={poly(v(prev))} />}
      <polygon className="now" points={poly(cur)} />
      {now.every((r) => r.score === 0) && (
        <text className="empty-note" x={CX} y={CY + 5} textAnchor="middle">
          玩幾天之後就會長出形狀
        </text>
      )}
      {TRACKS.map((t) => {
        const [x, y] = at(t.id, cur[t.id] / 100)
        return <circle key={t.id} className="dot" cx={x} cy={y} r={5.5} style={{ fill: t.color }} />
      })}
      {/* 軸名與分數：上下置中，左右靠外 */}
      {TRACKS.map((t) => {
        const [x, y] = at(t.id, 1)
        const side = ANGLE[t.id] === 0 ? 'start' : ANGLE[t.id] === 180 ? 'end' : 'middle'
        const dx = side === 'start' ? 14 : side === 'end' ? -14 : 0
        const dy = ANGLE[t.id] === -90 ? -34 : ANGLE[t.id] === 90 ? 24 : -6
        return (
          <g key={t.id} className="axis-label" textAnchor={side}>
            <text x={x + dx} y={y + dy}>
              {t.name}
            </text>
            <text className="score" x={x + dx} y={y + dy + 22} style={{ fill: t.color }}>
              {cur[t.id]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 說明文字 ─────────────────────────────────────────────────
function reasonText(n: TrackNeed): string {
  switch (n.reason) {
    case 'never':
      return '還沒有玩過，先排進來認識'
    case 'gap':
      return `已經 ${n.missed} 個有玩的日子沒有排到`
    case 'mastery':
      return `最近練的內容平均熟練度最低（${Math.round(n.mastery * 100)}%），多練幾次`
    case 'share':
      return `最近 7 天只占全部題數的 ${Math.round(n.share * 100)}%，補一點`
    case 'review':
      return `有 ${n.due.length} 個已熟的內容今天到期，安排複習`
    default:
      return '四條線目前很平均，照輪流排'
  }
}

function budgetText(n: TrackNeed, paused: boolean): string {
  const b = n.budget
  const names = b.used.map(conceptLabel).join('、')
  if (paused) return `新概念暫停中（負擔控制）${names ? `；這週已教：${names}` : ''}`
  const head = b.starter ? `剛開始的頭一週：新概念 ${b.used.length}/${b.limit}` : `本週新概念 ${b.used.length}/${b.limit}`
  return `${head}${names ? `：${names}` : ''}${b.left ? '' : '，其餘都是複習'}`
}

export function TrackCard({ d }: { d: ParentData }) {
  const s = useSettings()
  const t = today()
  const lastWeek = shiftDate(t, -7)
  const m = useMemo(() => {
    const now = radarScores(d.attempts, t)
    const hasPrev = d.attempts.some((a) => a.date <= lastWeek)
    const prev = hasPrev ? radarScores(d.attempts, lastWeek) : null
    const day = playDayIndex(d)
    const skills = d.skills as unknown as Map<string, Skill>
    const needs = trackNeeds({
      attempts: d.attempts,
      date: t,
      boxOf: (k) => skills.get(k)?.box ?? 0,
      intros: conceptIntros(d.attempts),
      isDue: (k) => {
        const x = skills.get(k)
        return !!x && isDueAt(x, day)
      },
    })
    return { now, prev, needs, spans: loadSpans(d.attempts, t), paused: loadCheck(d.attempts, t).overloaded }
  }, [d, t, lastWeek])

  const top = m.needs[0]
  const fresh = m.needs.every((n) => n.reason === 'never')
  const extra = top && !fresh && top.reason !== 'even' ? top.track : null
  const theme = d.source === 'local' ? weekTheme(s) : null
  const span = m.spans[m.spans.length - 1]

  return (
    <div className="card tracks-card">
      <h3>
        四條能力主線
        <small>實線是這週，虛線是上週（7 天前）</small>
      </h3>
      <div className="tracks">
        <Radar now={m.now} prev={m.prev} />
        <ul className="trk-list">
          {TRACKS.map((tr) => {
            const r = m.now.find((x) => x.track === tr.id)!
            const p = m.prev?.find((x) => x.track === tr.id)
            const n = m.needs.find((x) => x.track === tr.id)!
            const delta = p ? r.score - p.score : null
            return (
              <li key={tr.id} style={{ ['--trk' as string]: tr.color }}>
                <div className="trk-head">
                  <b>{tr.name}</b>
                  <span className="trk-score">{r.score}</span>
                  {delta != null && <span className={`trk-delta${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}`}>{delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '持平'}</span>}
                  {extra === tr.id && <span className="chip teach">這幾天多排</span>}
                </div>
                <p className="trk-line">
                  {r.quiz14 || n.known
                    ? `接觸過 ${n.known}/${n.total} 個概念・熟練 ${Math.round(r.mastery * 100)}%・第一次就答對 ${r.accuracy == null ? '—' : `${Math.round(r.accuracy * 100)}%`}`
                    : '還沒有玩過這條線的遊戲'}
                </p>
                <p className="trk-what">{tr.what}</p>
                <p className="trk-budget">{budgetText(n, m.paused)}</p>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="trk-plan">
        <p>
          <b>{extra ? `這幾天多排「${track(extra).name}」` : '這幾天照輪流排'}</b>
          {fresh ? '：還沒有作答資料，四條線先各排一次。' : top && `：${reasonText(top)}。`}
          每天的冒險依這四條線的作答資料排：落後的多排一格，上一個有玩的日子沒排到的線今天一定排，每天的站數和時間不變。
        </p>
        {theme && (
          <p>
            <b>本週主題：{THEME_LABEL[theme]}</b>（到 {md(shiftDate(themeEnds(s)!, -1))}）——動物村會多出這一類的英文詞，每天的冒險故事也優先挑相關的主題（例如動物 → 農場、動物園）。
          </p>
        )}
        {span && (
          <p>
            <b>負擔控制</b>：{md(span.from)} 啟動（每個遊戲降一級、暫停新概念）
            {span.to ? `，${md(span.to)} 第一次就答對回到 6 成以上，已自動恢復。` : '，目前還在減輕中。'}
          </p>
        )}
      </div>
      <p className="note">
        分數 0–100 = 熟練 {RADAR_W.mastery * 100}%（最近 4 週練過的內容，3 格以上算熟）＋ 涵蓋 {RADAR_W.coverage * 100}%（3–6 歲範圍內的概念接觸過幾成）＋
        第一次就答對 {RADAR_W.accuracy * 100}%（最近 14 天，只算自己答）。不是考試分數，重點是四條線有沒有平衡。
        每條線一週最多教 {NEW_PER_WEEK} 個新概念（剛開始玩的頭一週 {STARTER_NEW} 個），例如一個字母音、一個數字、一個詞彙主題；其餘都是複習。
      </p>
    </div>
  )
}

// ── 課綱對照 ─────────────────────────────────────────────────
const AGE = { 小班: '3–4 歲', 中班: '4–5 歲', 大班: '5–6 歲' } as const

export function CurriculumCard() {
  return (
    <div className="card curriculum">
      <h3>
        課綱對照
        <small>幼兒園教保活動課程大綱</small>
      </h3>
      <p className="sub">
        每條線對照課綱小班、中班、大班的學習方向，確認 App 沒有跑在學校前面：App 大致在小班到中班之間。指標是大意整理，不是官方條文，所以不列指標代碼。
      </p>
      {TRACKS.map((tr) => {
        const c = CURRICULUM[tr.id]
        return (
          <details key={tr.id} style={{ ['--trk' as string]: tr.color }}>
            <summary>
              <b>{tr.name}</b>
              <span>{c.domain}</span>
            </summary>
            <dl>
              {c.levels.map((l) => (
                <div key={l.age}>
                  <dt>
                    {l.age}
                    <small>{AGE[l.age]}</small>
                  </dt>
                  <dd>{l.text}</dd>
                </div>
              ))}
              <div className="app">
                <dt>App</dt>
                <dd>{c.app}</dd>
              </div>
            </dl>
          </details>
        )
      })}
    </div>
  )
}
