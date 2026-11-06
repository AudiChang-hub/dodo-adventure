import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { firstFinger } from '../../games/NotYet'
import { EASE } from '../../ui/motion'
import { pieces, talkFor, talkOf, type ZhText } from './data'
import { gapOf } from './cloze'
import { pageUnits } from './layout'
import { Pic } from './Pic'
import type { HostTap } from './Lesson'

/** 聊一聊出來以後，多久才出現「去選圖」（大人問完、等他回答的時間；孩子這時候亂點也不會跳過這一段） */
const TALK_WAIT_MS = 4000

/** 大人的按鈕：同一顆連點時，每兩下之間不到這麼久就不算（孩子連點、手掌壓到，連點再久也只走一行）；每顆按鈕各自算，換一顆按照樣有反應 */
const NEXT_LOCK_MS = 900

/** 亮的那一行，紅字的圖放大到幾倍（孩子的眼睛跟著大人念到哪裡，圖是他看得懂的東西） */
const BIG = 1.25

/**
 * 親子共讀（2026-11-03 家長決定：拿掉全部中文語音，App 不出聲，大人念給孩子聽）。
 * - 課本一頁，一次亮一行：亮的那一行底下一條淡藍帶子，念過的行是墨色、還沒念的行很淡；紅字的圖跟著那一行跳出來一下（只一次），孩子的眼睛跟著走。
 * - 大人念完這一行，按右下的「下一行」往下走（大人的按鈕：低調、不跳動，放在孩子常點的課文和圖以外；連點只算一下）；
 *   孩子不小心按到了，上面有一顆更小的「上一行」可以退回去。
 * - 孩子的眼睛和手（T-90，AI 小男生：「整面都是字，不知道要做什麼」）：亮的那一行，紅字的圖放大、一圈淡黃框、
 *   依序輕輕跳一下（跟選圖、教學卡的「輪到你了」同一套）——大人念到那個詞，孩子看圖、點圖。
 *   點紅字（或它的圖）：圖再放大跳一下、有一聲輕的音效，外框收起來；不出聲念、不打斷大人。
 * - 第 2 次上同一篇（run = 2，現況對照 A3）：每一行最後一個紅字框起來、上面一個「停」字，提醒大人念到這裡停一下，讓他接。
 * - 最後一行念完按「念完了」：「聊一聊」卡片（對話式共讀，T-102）：3 歲問得出來的一題（誰、什麼、哪裡，./talk.json），
 *   有圖的放那張圖讓孩子用指的回答；下面一句「他答不出來，你可以說：…」給大人示範。
 *   「去選圖」「再念一次」不放在卡片上（第三次盲測：孩子自己按掉了這一段），跟「下一行」一樣放在右下角的大人位置、同樣低調的樣子，
 *   聊一聊出來 4 秒後才出現（大人問完、等他回答的時間）；同一顆連點只算一下。
 */
export function Reader({
  t,
  run: times = 1,
  host,
  goLabel = '去選圖',
  onTalk,
  onNext,
  startAt = 0,
}: {
  t: ZhText
  run?: number
  host: HostTap
  /** 聊一聊卡片上往下走的按鈕（沒有選圖題時是「下課」） */
  goLabel?: string
  /** 進出「聊一聊」（陪玩小字跟著換） */
  onTalk?: (on: boolean) => void
  onNext: (ms: number) => void
  /** 一開始亮第幾行（排版檢查 scripts/check-zh-layout.mjs 用：直接看每一行亮起來、圖放大的樣子；課裡一律從第 0 行） */
  startAt?: number
}) {
  const still = useReducedMotion()
  const [cur, setCur] = useState(startAt)
  const [talk, setTalk] = useState(false)
  /** 聊一聊出來一陣子了：「去選圖」「再念一次」才出現在右下角 */
  const [talkReady, setTalkReady] = useState(false)
  const [pop, setPop] = useState<{ w: string; k: number } | null>(null)
  /** 孩子點過的圖（第幾行:哪個詞）：點過就收起「點我」的外框 */
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const lockUntil = useRef(new Map<string, number>())
  const startedAt = useRef(performance.now())
  const left = useRef(false)
  const last = t.lines.length - 1
  const gaps = times === 2 ? t.lines.map((l) => gapOf(l)?.word ?? null) : t.lines.map(() => null)

  /** 大人的按鈕：連點、兩根手指只算一下（id 是哪一顆） */
  const adult = (id: string, fn: () => void) => (e: React.PointerEvent) => {
    if (!firstFinger(e.nativeEvent) || left.current) return
    const now = performance.now()
    const locked = now < (lockUntil.current.get(id) ?? 0)
    // 連點的每一下都把鎖往後延：一直點只算第一下，要停手一下再按才算下一下
    lockUntil.current.set(id, now + NEXT_LOCK_MS)
    if (!locked) fn()
  }

  const next = () => {
    sfx.tap()
    if (cur < last) setCur(cur + 1)
    else {
      setTalk(true)
      onTalk?.(true)
    }
  }

  /** 孩子不小心按了「下一行」：大人退回上一行 */
  const prev = () => {
    sfx.tap()
    setCur((c) => Math.max(0, c - 1))
  }

  const again = () => {
    sfx.tap()
    setTalk(false)
    onTalk?.(false)
    setCur(0)
  }

  const go = () => {
    left.current = true
    sfx.tap()
    onNext(Math.round(performance.now() - startedAt.current))
  }

  /** 孩子點紅字、點圖：圖放大跳一下（只看得到念過的行） */
  const tapWord = (w: string, line: number) => {
    if ((line > cur && !talk) || left.current) return
    sfx.pop()
    setPop({ w, k: performance.now() })
    setTouched((s) => (s.has(`${line}:${w}`) ? s : new Set(s).add(`${line}:${w}`)))
  }

  // 聊一聊出來 4 秒後，大人的按鈕才出現
  useEffect(() => {
    if (!talk) return void setTalkReady(false)
    const k = window.setTimeout(() => setTalkReady(true), still ? 0 : TALK_WAIT_MS)
    return () => clearTimeout(k)
  }, [talk, still])

  // 點莫莫：輕輕一聲（不說話，大人在念）
  useEffect(() => {
    host.current = () => sfx.pop()
    return () => {
      host.current = null
    }
  })

  // 字級照最寬的那一行算（字＋放大的圖＋「停」都要放得進課本，./layout.ts）
  const { units, rows } = pageUnits(t, times)
  const reds = (l: string) => pieces(l).filter((p) => p.red && t.emoji[p.text])
  const tk = talkFor(t)
  const more = talkOf(t.parentTip).rest
  return (
    <div className={`zh-read${talk ? ' talking' : ''}`} data-run={times} data-at={talk ? 'talk' : cur} style={{ '--units': units, '--rows': rows } as CSSProperties}>
      <motion.article className="zh-page" initial={still ? false : { y: 14 }} animate={{ y: 0 }} transition={{ duration: 0.5, ease: EASE.out }}>
        <h2 className="zh-title">{t.title}</h2>
        <div className="zh-lines">
          {t.lines.map((l, i) => {
            const on = !talk && cur === i
            const seen = i <= cur || talk
            return (
              <div key={i} className={`zh-line${on ? ' on' : ''}${seen ? ' seen' : ' later'}`} data-line={i}>
                {on && <motion.span className="zh-band" layoutId={still ? undefined : 'zh-band'} transition={{ duration: 0.35, ease: EASE.inOut }} aria-hidden="true" />}
                <span className="zh-text">
                  {pieces(l).map((p, j) =>
                    p.red ? (
                      <Fragment key={j}>
                        {/* 第 2 次：框起來的詞前面一個「停」，提醒大人念到這裡停一下（排在字的同一行，不疊在上一行） */}
                        {on && gaps[i] === p.text && (
                          <span className="zh-gap-tag" aria-hidden="true">
                            停
                          </span>
                        )}
                      <button
                        type="button"
                        className={`zh-red${pop?.w === p.text ? ' pop' : ''}${on && gaps[i] === p.text ? ' gap' : ''}`}
                        data-word={p.text}
                        tabIndex={seen ? 0 : -1}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          if (firstFinger(e.nativeEvent)) tapWord(p.text, i)
                        }}
                      >
                        {p.text}
                      </button>
                      </Fragment>
                    ) : (
                      <span key={j}>{p.text}</span>
                    ),
                  )}
                </span>
                <span className="zh-pics">
                  {reds(l).map((p, j) => (
                    <motion.button
                      key={p.text}
                      type="button"
                      // 亮的那一行：圖放大、一圈淡黃框、依序輕輕跳一下（點我，T-84 同一套）；點過就收起外框
                      className={`zh-pic${on ? ' big' : ''}${on && !touched.has(`${i}:${p.text}`) ? ' cue turn-hop' : ''}`}
                      style={{ '--turn-i': j, pointerEvents: seen ? 'auto' : 'none', zIndex: on || pop?.w === p.text ? 2 : undefined } as CSSProperties}
                      aria-label={p.text}
                      initial={false}
                      animate={
                        !seen
                          ? { opacity: 0, scale: 0.7, y: 6 }
                          : pop?.w === p.text
                            ? { opacity: 1, scale: on ? [BIG, BIG * 1.22, BIG] : [1, 1.4, 1.12], y: 0 }
                            : on
                              ? { opacity: 1, scale: BIG, y: 0 }
                              : { opacity: 1, scale: 1, y: 0 }
                      }
                      transition={{ duration: still ? 0 : pop?.w === p.text ? 0.6 : 0.45, ease: EASE.out }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        if (firstFinger(e.nativeEvent)) tapWord(p.text, i)
                      }}
                    >
                      <span className="zh-pic-in">
                        <Pic name={t.emoji[p.text]!} />
                      </span>
                    </motion.button>
                  ))}
                </span>
              </div>
            )
          })}
        </div>
      </motion.article>

      {/* 大人的按鈕：課本右下角，課文和圖以外。念課文時是上一行／下一行；聊一聊時（出來 4 秒後）是再念一次／去選圖 */}
      <div className={`zh-controls${!talk || talkReady ? ' on' : ''}`} aria-hidden={talk && !talkReady}>
        {talk ? (
          <>
            <button type="button" className="zh-prev" onPointerDown={adult('again', again)} tabIndex={talkReady ? 0 : -1}>
              再念一次
            </button>
            <button type="button" className="zh-next zh-go-quiz" onPointerDown={adult('go', go)} tabIndex={talkReady ? 0 : -1}>
              <span>{goLabel}</span>
              <NextIcon />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="zh-prev" onPointerDown={adult('prev', prev)} tabIndex={cur === 0 ? -1 : 0} aria-hidden={cur === 0} style={{ visibility: cur === 0 ? 'hidden' : undefined }}>
              上一行
            </button>
            <button type="button" className="zh-next" onPointerDown={adult('next', next)}>
              <span>{cur < last ? '下一行' : '念完了'}</span>
              <NextIcon />
            </button>
          </>
        )}
      </div>

      {talk && (
        <motion.div
          className="zh-talk"
          role="dialog"
          aria-label="聊一聊"
          initial={still ? false : { opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: EASE.out }}
        >
          <div className="zh-talk-tag">聊一聊・問他</div>
          <div className="zh-talk-main">
            <p className="zh-talk-q">{tk.q}</p>
            {tk.pic && t.emoji[tk.pic] && (
              // 問題的主角：孩子可以用指的回答（點了跳一下，跟課文裡的圖一樣）
              <motion.button
                type="button"
                className="zh-talk-pic"
                aria-label={tk.pic}
                animate={pop?.w === tk.pic && !still ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: EASE.out }}
                onPointerDown={(e) => {
                  if (firstFinger(e.nativeEvent)) tapWord(tk.pic!, 0)
                }}
              >
                <span className="zh-pic-in">
                  <Pic name={t.emoji[tk.pic]!} />
                </span>
              </motion.button>
            )}
          </div>
          <p className="zh-talk-model">
            <span className="zh-talk-how">他答不出來，你可以說：</span>「{tk.a}」
          </p>
          <p className="zh-talk-more">等他說；他說一兩個字，你幫他說成完整的一句。{more && `還可以：${more}`}</p>
        </motion.div>
      )}
    </div>
  )
}

/** 下一行：往右的箭頭 */
function NextIcon() {
  return (
    <svg viewBox="0 0 48 48" width={30} height={30} aria-hidden="true">
      <path d="M10 24 H34 M24 13 L36 24 L24 35" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
