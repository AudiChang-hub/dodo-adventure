import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { firstFinger } from '../../games/NotYet'
import { EASE } from '../../ui/motion'
import { pieces, plain, talkOf, type ZhText } from './data'
import { gapOf } from './cloze'
import { Pic } from './Pic'
import type { HostTap } from './Lesson'

/** 大人的按鈕：同一顆連點時，每兩下之間不到這麼久就不算（孩子連點、手掌壓到，連點再久也只走一行）；每顆按鈕各自算，換一顆按照樣有反應 */
const NEXT_LOCK_MS = 900

/**
 * 親子共讀（2026-11-03 家長決定：拿掉全部中文語音，App 不出聲，大人念給孩子聽）。
 * - 課本一頁，一次亮一行：亮的那一行底下一條淡藍帶子，念過的行是墨色、還沒念的行很淡；紅字的圖跟著那一行跳出來一下（只一次），孩子的眼睛跟著走。
 * - 大人念完這一行，按右下的「下一行」往下走（大人的按鈕：低調、不跳動，放在孩子常點的課文和圖以外；連點只算一下）；
 *   孩子不小心按到了，上面有一顆更小的「上一行」可以退回去。
 * - 孩子點紅字（或它的圖）：圖放大跳一下、有一聲輕的音效，讓他看清楚那是什麼；不出聲念、不打斷大人。
 * - 第 2 次上同一篇（run = 2，現況對照 A3）：每一行最後一個紅字框起來、上面一個「停」字，提醒大人念到這裡停一下，讓他接。
 * - 最後一行念完按「念完了」：「聊一聊」卡片（parentTip 的開放問題放大，對話式共讀），大人問完按「去選圖」。
 */
export function Reader({
  t,
  run: times = 1,
  host,
  goLabel = '去選圖',
  onTalk,
  onNext,
}: {
  t: ZhText
  run?: number
  host: HostTap
  /** 聊一聊卡片上往下走的按鈕（沒有選圖題時是「下課」） */
  goLabel?: string
  /** 進出「聊一聊」（陪玩小字跟著換） */
  onTalk?: (on: boolean) => void
  onNext: (ms: number) => void
}) {
  const still = useReducedMotion()
  const [cur, setCur] = useState(0)
  const [talk, setTalk] = useState(false)
  const [pop, setPop] = useState<{ w: string; k: number } | null>(null)
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
  }

  // 點莫莫：輕輕一聲（不說話，大人在念）
  useEffect(() => {
    host.current = () => sfx.pop()
    return () => {
      host.current = null
    }
  })

  const chars = Math.max(...t.lines.map((l) => plain(l).length))
  const reds = (l: string) => pieces(l).filter((p) => p.red && t.emoji[p.text])
  const tk = talkOf(t.parentTip)
  return (
    <div className={`zh-read${talk ? ' talking' : ''}`} data-run={times} data-at={talk ? 'talk' : cur} style={{ '--chars': chars } as CSSProperties}>
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
                      <button
                        key={j}
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
                        {on && gaps[i] === p.text && (
                          <span className="zh-gap-tag" aria-hidden="true">
                            停
                          </span>
                        )}
                      </button>
                    ) : (
                      <span key={j}>{p.text}</span>
                    ),
                  )}
                </span>
                <span className="zh-pics">
                  {reds(l).map((p) => (
                    <motion.button
                      key={p.text}
                      type="button"
                      className="zh-pic"
                      aria-label={p.text}
                      initial={false}
                      animate={
                        !seen
                          ? { opacity: 0, scale: 0.7, y: 6 }
                          : pop?.w === p.text
                            ? { opacity: 1, scale: [1, 1.4, 1.12], y: 0 }
                            : on && !still
                              ? { opacity: 1, scale: [0.7, 1.12, 1], y: [6, -6, 0] }
                              : { opacity: 1, scale: 1, y: 0 }
                      }
                      transition={{ duration: still ? 0 : pop?.w === p.text ? 0.6 : 0.55, ease: EASE.out }}
                      style={{ pointerEvents: seen ? 'auto' : 'none', zIndex: pop?.w === p.text ? 2 : undefined }}
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

      {/* 大人的按鈕：課本右下角，課文和圖以外；聊一聊的時候收起來 */}
      <div className={`zh-controls${talk ? '' : ' on'}`} aria-hidden={talk}>
        <button type="button" className="zh-prev" onPointerDown={adult('prev', prev)} tabIndex={talk || cur === 0 ? -1 : 0} aria-hidden={cur === 0} style={{ visibility: cur === 0 ? 'hidden' : undefined }}>
          上一行
        </button>
        <button type="button" className="zh-next" onPointerDown={adult('next', next)} tabIndex={talk ? -1 : 0}>
          <span>{cur < last ? '下一行' : '念完了'}</span>
          <NextIcon />
        </button>
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
          {tk.questions.length ? (
            tk.questions.map((q, i) => (
              <p key={i} className="zh-talk-q">
                {q}
              </p>
            ))
          ) : (
            <p className="zh-talk-q">{tk.rest}</p>
          )}
          {tk.questions.length > 0 && tk.rest && <p className="zh-talk-more">{tk.rest}</p>}
          <p className="zh-talk-how">等他回答；他說一兩個字，你幫他說成完整的一句。</p>
          <div className="zh-talk-btns">
            <button type="button" className="zh-again" onPointerDown={adult('again', again)}>
              再念一次
            </button>
            <button type="button" className="zh-go" onPointerDown={adult('go', go)}>
              {goLabel}
            </button>
          </div>
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
