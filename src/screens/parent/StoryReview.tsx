// 家長區「本週新故事」（G-9 的故事審稿，T-120 起改成直接上線；docs/故事世界.md §8）：每週自動產生、通過自動檢查的故事
// 直接給孩子聽（家長 2026-11-09：「不用審稿，我相信你」）。家長在這裡試聽、看中英對照，不喜歡的章節可以撤下（附一句原因更好，
// 每週流程會照原因重寫），撤下的也可以放回（lib/review.ts）。宗教經典的章節標「宗教經典」，讓家長知道可以特別聽一下。
// 家長常用手機直式看：一句一列（圖、英文、中文、試聽鍵），按鈕都夠大；平板上置中、最寬 860px。
import { useEffect, useMemo, useRef, useState } from 'react'
import { say, stopSpeech } from '../../lib/audio'
import { decide, exportVerdicts, reviewStatus, staleVerdict, useReview, type ReviewStatus } from '../../lib/review'
import { learnerSnapshot } from '../../lib/learner'
import { syncReview, useSync } from '../../lib/sync'
import { hasLine, line } from '../../content/lines'
import { WEEKLY, beatKey, doorStop, draftChapters, draftId, voiceOf, type Beat, type Chapter, type StoryDraft } from '../../content/story'
import { THEMES } from '../../content/themes'
import { StoryPic } from '../../ui/StoryPic'
import { download } from './data'
import { CHILD_EN } from '../../lib/env'
import '../story.css'
import './review.css'

const STATUS_ZH: Record<ReviewStatus, string> = { builtin: '', live: '孩子聽得到', off: '已撤下' }
const VOICE_ZH = { dodo: '豆豆', bobo: '波波', momo: '莫莫' } as const
const WHO_ZH: Record<string, string> = { egg: '彩虹蛋', all: '大家', friend: '朋友' }
const TRACK_ZH = { lang: '排到語言時', num: '排到數與規律時', think: '排到邏輯與程式時', hand: '排到動手時' } as const
const FAITH_ZH: Record<string, string> = { bible: '聖經故事', jataka: '佛教本生經', panchatantra: '印度五卷書' }

/** 審稿頁的一句：台詞 key、劇本的那一句（或門原本的旁白） */
interface Row {
  key: string
  beat: Beat
  /** 門後原本的旁白（不是這次寫的） */
  door?: boolean
  /** 依主線的版本（排到那條線才念） */
  track?: keyof typeof TRACK_ZH
}

interface Seg {
  label: string
  rows: Row[]
}

/** 一章展開成審稿頁的段落：開場 → 5 站（門原本的旁白淡淡地列出來）→ 終點 → 結尾 */
function segsOf(ch: Chapter): Seg[] {
  const segs: Seg[] = [{ label: ch.kind === 'classic' ? '開場（書房）' : '開場（魔法屋）', rows: ch.intro.map((b, i) => ({ key: beatKey(ch, 'intro', i, b), beat: b })) }]
  const door = THEMES.find((t) => t.id === ch.door)
  for (let n = 0; n < 5; n++) {
    const s = ch.stops[n]
    if (!s) {
      if (door && !ch.look) {
        const b = doorStop(door, n)
        segs.push({ label: `第 ${n + 1} 站`, rows: [{ key: b.key!, beat: b, door: true }] })
      }
      continue
    }
    const rows: Row[] = s.generic.map((b, i) => ({ key: beatKey(ch, `stop.${n}`, i, b), beat: b }))
    for (const t of ['lang', 'num', 'think', 'hand'] as const) s[t]?.forEach((b, i) => rows.push({ key: beatKey(ch, `stop.${n}.${t}`, i, b), beat: b, track: t }))
    segs.push({ label: `第 ${n + 1} 站`, rows })
  }
  if (ch.finale?.length) segs.push({ label: '終點', rows: ch.finale.map((b, i) => ({ key: beatKey(ch, 'finale', i, b), beat: b })) })
  if (ch.end.length) segs.push({ label: ch.kind === 'classic' ? '結尾' : '結尾（回到魔法屋）', rows: ch.end.map((b, i) => ({ key: beatKey(ch, 'end', i, b), beat: b })) })
  return segs
}

/** 英文：`|` 後面加重的字用粗體；{name} 換成孩子的英文名字（App 裡就是這樣念） */
function English({ en }: { en: string }) {
  const [body, emph] = en.replace(/\{name\}/g, CHILD_EN).split('|')
  return (
    <span lang="en">
      {body}
      {emph != null && <strong>{emph.trim()}</strong>}
    </span>
  )
}

function speaker(b: Beat, host: 'dodo' | 'bobo' | 'momo') {
  const v = VOICE_ZH[voiceOf(b.who, host)]
  return WHO_ZH[b.who] ? `${WHO_ZH[b.who]}（${v}的聲音）` : v
}

export function StoryReview() {
  const verdicts = useReview()
  const sync = useSync()
  const [playing, setPlaying] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // 打開這一頁：先把另一台裝置的決定拿過來（手機上撤下、平板上看，或反過來）
  useEffect(() => {
    void syncReview()
    return () => stopSpeech()
  }, [])

  // 新的週在最上面（同一週照佇列的順序）；撤下、放回不重排，家長按完不會跳走
  const drafts = useMemo(() => WEEKLY.map((d, i) => ({ d, i })).sort((a, b) => (a.d.week < b.d.week ? 1 : a.d.week > b.d.week ? -1 : a.i - b.i)).map((x) => x.d), [])

  const counts = useMemo(() => {
    const c = { live: 0, off: 0 }
    for (const d of WEEKLY) for (const ch of draftChapters(d)) {
      const s = reviewStatus(ch)
      if (s !== 'builtin') c[s]++
    }
    return c
  }, [verdicts]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 一句一句念；按了別的試聽或停止就不再接著念 */
  const tok = useRef(0)
  const play = async (keys: string[]) => {
    const my = ++tok.current
    for (const k of keys.filter(hasLine)) {
      if (tok.current !== my) return
      setPlaying(k)
      await say(k)
    }
    if (tok.current === my) setPlaying(null)
  }
  const stop = () => {
    tok.current++
    stopSpeech()
    setPlaying(null)
  }

  const exportReview = () => {
    const ex = exportVerdicts()
    download(`故事撤下原因-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ex, null, 1), 'application/json')
    setNote('已下載撤下的原因。把這個檔交給每週流程（story-weekly --feedback），撤下的章節會照你寫的原因重寫，通過自動檢查就會上線。')
  }
  const exportLearner = async () => {
    const s = await learnerSnapshot()
    download('learner.json', JSON.stringify(s, null, 1), 'application/json')
    setNote('已下載學習快照（學過的字、各支線的階、朋友；沒有名字和生日）。放到電腦的 scripts/.cache/learner.json，下一次寫故事就會照這份的程度寫。')
  }

  return (
    <div className="review">
      <header className="review-head">
        <h2>本週新故事</h2>
        <p className="sub">每週自動寫好的新故事，通過自動檢查（太難的字、不適合的主題、宗教用語、名字）就直接給孩子聽。不喜歡哪一章就按「撤下」，孩子就聽不到；寫一句原因，下次會照著改。</p>
        <div className="review-counts" role="status">
          <span className="chip is-live">孩子聽得到 {counts.live} 章</span>
          <span className="chip is-off">已撤下 {counts.off}</span>
        </div>
        <p className="review-sync">{sync.user ? '已登入：撤下、放回會同步到孩子的平板。' : '沒有登入：撤下、放回只存在這台裝置。要在手機上撤下，請在「設定與同步」登入同一個帳號。'}</p>
      </header>

      {drafts.length === 0 && (
        <div className="card review-empty">
          <p>目前沒有新故事。</p>
          <p className="sub">每週的故事流程寫好新的一篇、一則故事時間之後，會出現在這裡。</p>
        </div>
      )}

      {drafts.map((d) => (
        <DraftCard key={draftId(d)} d={d} player={{ playing, play, stop }} />
      ))}

      <section className="card review-tools">
        <h3>給每週故事流程</h3>
        <div className="review-tool-row">
          <button type="button" onClick={exportReview}>匯出撤下的原因</button>
          <button type="button" onClick={() => void exportLearner()}>下載學習快照</button>
        </div>
        {note && <p className="sub review-note">{note}</p>}
      </section>
    </div>
  )
}

interface Player {
  playing: string | null
  play: (keys: string[]) => Promise<void>
  stop: () => void
}

function DraftCard({ d, player }: { d: StoryDraft; player: Player }) {
  const chapters = draftChapters(d)
  const faith = d.type === 'classic' ? d.classic.faith : null
  const kicker = d.type === 'arc' ? `原創長篇・第 ${d.arc.part} 部第 ${d.arc.no} 篇・${chapters.length} 章` : `故事時間・${d.classic.id}・${d.classic.source}`
  const title = d.type === 'arc' ? d.arc : { zh: d.classic.zh, title: d.classic.chapter.look?.title ?? '' }
  return (
    <article className={`card review-draft${faith ? ' is-faith' : ''}`} aria-labelledby={`rv-${draftId(d)}`}>
      <header className="review-draft-head">
        <p className="review-kicker">{kicker}</p>
        <h3 id={`rv-${draftId(d)}`}>
          {title.zh} <span lang="en">{title.title}</span>
        </h3>
        <p className="review-meta">
          {d.week} 那一週・第 {d.rev} 版・{d.by === 'ai' ? 'AI 寫的' : d.by === 'human' ? '人寫的' : '範例'}
        </p>
        {faith && (
          <p className="review-faith" role="note">
            <strong>宗教經典</strong>（{FAITH_ZH[faith] ?? faith}）：當故事講、不傳教義。自動檢查會擋掉禱告、神的指令、「要相信」、懲罰；孩子端不會說出處。不喜歡可以撤下。
          </p>
        )}
        {!!d.notes?.length && (
          <details className="review-notes">
            <summary>改編說明</summary>
            <ul>
              {d.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        )}
      </header>
      {chapters.map((c) => (
        <ChapterCard key={c.id} d={d} ch={c} player={player} />
      ))}
    </article>
  )
}

function ChapterCard({ d, ch, player }: { d: StoryDraft; ch: Chapter; player: Player }) {
  const { playing, play, stop } = player
  const verdict = useReview()[ch.id]
  const status = reviewStatus(ch)
  const stale = staleVerdict(ch)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  const segs = useMemo(() => segsOf(ch), [ch])
  const host = (ch.look?.host ?? THEMES.find((t) => t.id === ch.door)?.host ?? 'momo') as 'dodo' | 'bobo' | 'momo'
  // 整章試聽：沒有排到主線時念的那一版（依主線的版本各自按試聽）
  const all = segs.flatMap((s) => s.rows.filter((r) => !r.track).map((r) => r.key))
  const door = THEMES.find((t) => t.id === ch.door)
  const name = ch.kind === 'classic' ? '故事時間' : `第 ${ch.chapter} 章`
  const send = async (ok: boolean) => {
    await decide([{ chapter: ch, ok, reason: ok ? undefined : reason, rev: d.rev }])
    setRejecting(false)
    setReason('')
  }
  return (
    <section className={`review-ch is-${status}`} aria-label={name}>
      <div className="review-ch-head">
        <button type="button" className="review-ch-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="review-ch-name">{name}</span>
          {door && <span className="review-ch-door">走{door.zh}的門</span>}
          <span className={`chip is-${status}`}>{STATUS_ZH[status]}</span>
        </button>
        <button type="button" className={`review-play-all${all.includes(playing ?? '') ? ' is-on' : ''}`} onClick={() => (all.includes(playing ?? '') ? stop() : void play(all))}>
          {all.includes(playing ?? '') ? '■ 停止' : '▶ 整章試聽'}
        </button>
      </div>
      {stale && status === 'live' && <p className="review-stale">照你撤下的原因重寫過了（第 {d.rev} 版），已經放回給孩子聽。{stale.reason ? `上次撤下的原因：「${stale.reason}」` : ''}</p>}
      {status === 'off' && verdict?.reason && <p className="review-reason">撤下的原因：「{verdict.reason}」</p>}
      {open && (
        <div className="review-lines">
          {segs.map((s) => (
            <div key={s.label} className="review-seg">
              <p className="review-seg-label">{s.label}</p>
              <ol>
                {s.rows.map((r) => (
                  <li key={r.key + (r.track ?? '')} className={`review-line${r.door ? ' is-door' : ''}${r.track ? ' is-track' : ''}${playing === r.key ? ' is-playing' : ''}`}>
                    <span className="review-pic">{r.beat.pic ? <StoryPic pic={r.beat.pic} /> : null}</span>
                    <span className="review-text">
                      <span className="review-who">
                        {r.door ? '門原本的旁白' : speaker(r.beat, host)}
                        {r.track && <em>{TRACK_ZH[r.track]}</em>}
                      </span>
                      <span className="review-en">
                        <English en={hasLine(r.key) ? line(r.key).text.replace(/\s*\|\|\s*/, ' ') : r.beat.en} />
                      </span>
                      {r.beat.zh && <span className="review-zh">{r.beat.zh}</span>}
                    </span>
                    <button type="button" className="review-play" aria-label={`試聽：${r.beat.en.replace(/\|/g, '')}`} onClick={() => (playing === r.key ? stop() : void play([r.key]))}>
                      {playing === r.key ? '■' : '▶'}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      <div className="review-actions">
        {rejecting ? (
          <form
            className="review-reject"
            onSubmit={(e) => {
              e.preventDefault()
              void send(false)
            }}
          >
            <label htmlFor={`why-${ch.id}`}>撤下的原因（一句話，可以不寫）</label>
            <input id={`why-${ch.id}`} value={reason} maxLength={120} autoFocus placeholder="例如：這句太長、這個字他還不會" onChange={(e) => setReason(e.target.value)} />
            <div className="review-btns">
              <button type="submit" className="is-no">
                撤下這一章
              </button>
              <button type="button" onClick={() => setRejecting(false)}>
                取消
              </button>
            </div>
          </form>
        ) : (
          <div className="review-btns">
            {status === 'off' ? (
              <>
                <button type="button" className="is-ok" onClick={() => void send(true)}>
                  放回，給孩子聽
                </button>
                <button type="button" className="is-no" onClick={() => setRejecting(true)}>
                  改撤下的原因
                </button>
              </>
            ) : (
              <button type="button" className="is-no" onClick={() => setRejecting(true)}>
                撤下這一章
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
