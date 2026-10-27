import { today, type GameLevel, type Skill } from '../../lib/db'
import {
  HINT_DELAY_START,
  LOAD_LOW,
  REVIEW_DAYS,
  SLOW_FACTOR,
  dayIndexOf,
  fluencyTrend,
  isDueAt,
  loadCheck,
  overdueBy,
  protegeStats,
  replayHintDelay,
} from '../../lib/engine'
import { PROBE_START } from '../../lib/placement'
import { pct, skillLabel, type ParentData } from './data'
import './engine.css'

/** 家長區的技能資料其實是完整的 Skill（本機或雲端都一樣），型別只宣告了幾個欄位 */
const skillsOf = (d: ParentData) => [...d.skills.values()] as unknown as Skill[]

export const playDayIndex = (d: ParentData) => dayIndexOf(new Set(d.attempts.map((a) => a.date)), today())

function daysAgo(ts: number) {
  const days = Math.round((new Date(today()).getTime() - new Date(today(new Date(ts))).getTime()) / 86_400_000)
  return days <= 0 ? '今天' : days === 1 ? '昨天' : `${days} 天前`
}

// ── 負擔控制提醒（總覽）─────────────────────────────────────
export function LoadAlert({ d }: { d: ParentData }) {
  const s = loadCheck(d.attempts, today())
  if (!s.overloaded) return null
  return (
    <div className="alert" role="status">
      <b>最近 3 個有玩的日子，第一次就答對都低於 {Math.round(LOAD_LOW * 100)}%，已經自動減輕負擔</b>
      <p>
        每個遊戲先降一級難度，並暫停教新內容，只複習學過的；等哪一天第一次答對回到 6 成以上就會自動恢復。
        如果 Sam 這幾天累了、身體不舒服，或是題目真的太難，都可能出現這個情況，可以先陪他玩、少玩一點。
      </p>
      <div className="days" style={{ gridColumn: 2 }}>
        {s.days.map((x) => (
          <span key={x.date} className={x.ok / x.n < LOAD_LOW ? 'low' : undefined}>
            {x.date.slice(5).replace('-', '/')}　{pct(x.ok, x.n)}%（{x.n} 題）
          </span>
        ))}
      </div>
    </div>
  )
}

// ── 今天到期複習（進度）─────────────────────────────────────
export function DueCard({ d }: { d: ParentData }) {
  const day = playDayIndex(d)
  const all = skillsOf(d).filter((s) => s.box >= 3)
  const due = all.filter((s) => isDueAt(s, day)).sort((a, b) => overdueBy(b, day) - overdueBy(a, day))
  const confirmed = all.filter((s) => s.lastReview && s.lastReview.result !== 'no')
  return (
    <div className="card">
      <h3>
        今天到期複習 {due.length ? `${due.length} 個` : ''}
        <small style={{ marginLeft: 10, fontWeight: 400, color: 'var(--ink-soft)', fontSize: 13 }}>
          已熟 {all.length} 個，其中 {confirmed.length} 個最近一次到期複習也答對
        </small>
      </h3>
      {due.length ? (
        <ul className="due">
          {due.slice(0, 40).map((s) => {
            const late = overdueBy(s, day)
            return (
              <li key={s.key} className={late >= 3 ? 'stale' : undefined}>
                {skillLabel(s.key)}
                <small>{s.lastReview ? `上次確認：${daysAgo(s.lastReview.ts)}` : s.due == null ? '還沒確認過' : `熟練於 ${daysAgo(s.lastTs)}`}</small>
                {late >= 3 && <span className="tag">待確認</span>}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="empty">今天沒有到期的。已熟（3 格以上）的內容會隔 {REVIEW_DAYS.join('、')} 個「有玩的日子」自動回來考一次。</p>
      )}
      <p className="note">
        到期的題目會優先出。到期那天答對，下次隔得更久；答錯就降一格、下一個有玩的日子再考。用「有玩的日子」計算，假日沒玩不會堆出一大串。
        「待確認」表示超過到期日 3 個有玩的日子還沒考到（例如那個遊戲最近沒排到），不會因此直接降級。
      </p>
    </div>
  )
}

// ── 功文式小練習：速度變化（進度）─────────────────────────────
function Line({ values, color, label }: { values: number[]; color: string; label: string }) {
  const w = 520
  const h = 90
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = Math.max(1, max - min)
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (w - 20) + 10, h - 12 - ((v - min) / span) * (h - 28)] as const)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={label}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4.5} fill="#fbf8f2" stroke={color} strokeWidth={2.5} />
      ))}
    </svg>
  )
}

export function SpeedCard({ d }: { d: ParentData }) {
  const trend = fluencyTrend(d.attempts)
  const first = trend[0]
  const last = trend[trend.length - 1]
  const better = first && last && trend.length >= 2 ? Math.round(((first.ms - last.ms) / first.ms) * 100) : null
  return (
    <div className="card">
      <h3>數字快答：反應速度的變化</h3>
      {trend.length ? (
        <>
          <div className="kv">
            <div>
              第一次
              <b>
                {(first.ms / 1000).toFixed(1)}
                <small>秒</small>
              </b>
            </div>
            <div>
              最近一次
              <b>
                {(last.ms / 1000).toFixed(1)}
                <small>秒</small>
              </b>
            </div>
            <div>
              玩了
              <b>
                {trend.length}
                <small>次</small>
              </b>
            </div>
            {better != null && (
              <div>
                {better >= 0 ? '變快' : '變慢'}
                <b>
                  {Math.abs(better)}
                  <small>%</small>
                </b>
              </div>
            )}
          </div>
          {trend.length >= 2 ? (
            <Line values={trend.map((t) => t.ms)} color="#D38A5E" label="每次數字快答的反應時間中位數，越低越快" />
          ) : (
            <p className="empty">再玩一次就畫得出趨勢。</p>
          )}
        </>
      ) : (
        <p className="empty">還沒玩過。等數字有 3 個以上已熟，數字快答會出現在今日冒險裡。</p>
      )}
      <p className="note">
        每次 5 題、全是已熟的數字題。孩子畫面上沒有計時、沒有分數，只有波波越來越開心；這裡的秒數是每一次「第一次就答對」的反應時間中位數（含題目語音）。
      </p>
    </div>
  )
}

// ── 延遲提示與又對又快（進度）─────────────────────────────────
export function HintCard({ d }: { d: ParentData }) {
  const delayed = d.attempts.filter((a) => a.metrics?.hintDelay != null)
  const h = replayHintDelay(d.attempts)
  const recent = delayed.slice(0, 20)
  const before = recent.filter((a) => !a.metrics!.glowed).length
  const waited = recent.filter((a) => a.metrics!.waited).length
  const slow = skillsOf(d).reduce((s, x) => s + (x.slow ?? 0), 0)
  return (
    <div className="card">
      <h3>延遲提示、又對又快</h3>
      <div className="duo">
        <div>
          <div className="kv">
            <div>
              目前延遲
              <b>
                {h.ms / 1000}
                <small>秒</small>
              </b>
            </div>
            <div>
              最近 {recent.length} 題，光亮前就答
              <b>
                {pct(before, recent.length)}
                <small>%</small>
              </b>
            </div>
            <div>
              等光才點
              <b>
                {waited}
                <small>題</small>
              </b>
            </div>
          </div>
          {h.ms > HINT_DELAY_START ? (
            <p className="note">
              <span className="chip teach">已拉長</span> Sam 常常等提示亮了才點，所以延遲已經從 {HINT_DELAY_START / 1000} 秒拉長到 {h.ms / 1000} 秒（最近一次在 {daysAgo(h.raised[h.raised.length - 1].ts)}）。
            </p>
          ) : (
            <p className="note">學習中（0–2 格）的題目，唸完題目 {h.ms / 1000} 秒還沒點，正確答案才淡淡亮一圈；亮了才答對的不算第一次答對，但也不會退格。最近 5 題有 3 題是等光才點，延遲會自動加 1 秒（最多 10 秒）。</p>
          )}
        </div>
        <div>
          <div className="kv">
            <div>
              答對但偏慢、維持原格
              <b>
                {slow}
                <small>次</small>
              </b>
            </div>
          </div>
          <p className="note">
            熟練度只在「答對而且不比自己平常慢」時往上升一格（功文式）：比他自己這類題目最近的中位數慢超過 {Math.round((SLOW_FACTOR - 1) * 100)}% 的，只維持原格。
            每類題目要先累積 5 次答對才開始比速度。
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Sam 教豆豆（進度）──────────────────────────────────────
export function ProtegeCard({ d }: { d: ParentData }) {
  const s = protegeStats(d.attempts)
  return (
    <div className="card">
      <h3>Sam 教豆豆（實驗中）</h3>
      {s.n ? (
        <>
          <div className="kv">
            <div>
              出現過
              <b>
                {s.n}
                <small>次</small>
              </b>
            </div>
            <div>
              第一下就糾正
              <b>
                {pct(s.corrected, s.n)}
                <small>%</small>
              </b>
            </div>
            <div>
              之後同一題第一次就答對
              <b>
                {s.afterN ? pct(s.afterOk, s.afterN) : '—'}
                <small>{s.afterN ? `%（${s.afterN} 題）` : ''}</small>
              </b>
            </div>
            <div>
              這些題目平常的答對率
              <b>
                {s.baseN ? pct(s.baseOk, s.baseN) : '—'}
                <small>{s.baseN ? '%' : ''}</small>
              </b>
            </div>
          </div>
          <table>
            <tbody>
              {s.last.map((a) => (
                <tr key={a.id}>
                  <td style={{ width: 90 }}>{a.date.slice(5).replace('-', '/')}</td>
                  <td>
                    {skillLabel(a.skill)}：恐龍指著 {a.options[a.metrics?.decoy ?? -1] ?? '?'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{a.firstTryCorrect ? <span className="chip ok">糾正成功</span> : <span className="chip no">跟著點錯</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="empty">還沒出現過。只用在已熟的內容，大約三局出現一次、一局最多一次。</p>
      )}
      <p className="note">
        恐龍故意指錯（「Hmm... is this B?」指著 D），請 Sam 點正確的來糾正。這個做法在 3 歲還沒有研究證實，所以 4 週檢查點要看：「之後同一題第一次就答對」有沒有明顯比平常低（代表孩子可能模仿了錯的答案）。這類題目不計入熟練度與答對率。
      </p>
    </div>
  )
}

// ── 程度校準（進度的難度表）───────────────────────────────────
export function placementText(game: string, l: GameLevel | undefined): string {
  if (!PROBE_START[game]) return '不探測'
  if (!l) return '還沒玩過'
  if (l.probe) return `校準中（已探測 ${l.probe.steps.length} 題）`
  if (!l.placed) return '—'
  if (l.placed.skipped) return '原本難度已夠，未探測'
  return l.placed.to === l.placed.from ? `維持 ${l.placed.to} 級` : `${l.placed.from} → ${l.placed.to} 級`
}

export const placementDots = (l: GameLevel | undefined) => (l?.placed?.steps ?? l?.probe?.steps ?? []).map((s) => (s.ok ? '○' : '×')).join('')

