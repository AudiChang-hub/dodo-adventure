import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { firstFinger, nod } from '../../games/NotYet'
import { EASE } from '../../ui/motion'
import { Sparkles } from '../../ui/Sparkles'
import type { Mood } from '../../art/Dino'
import { linePics, pieces, talkFor, talkOf, type ZhText } from './data'
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

/** 點莫莫：這麼久之內，前幾下會跳、彈一聲（之後只點一下頭、不出聲，不會變成一直點莫莫的遊戲） */
const MOMO_WINDOW_MS = 8000
const MOMO_PLAY = 2
/** 莫莫開心多久就回到平常的樣子 */
const MOMO_HAPPY_MS = 1300

/**
 * 親子共讀（2026-11-03 家長決定：拿掉全部中文語音，App 不出聲，大人念給孩子聽）。
 * - 課本一頁，一次亮一行：亮的那一行底下一條淡藍帶子，念過的行是墨色、還沒念的行很淡；紅字的圖跟著那一行跳出來一下（只一次），孩子的眼睛跟著走。
 * - 大人念完這一行，按右下的「下一行」往下走（大人的按鈕：低調、不跳動，放在孩子常點的課文和圖以外；連點只算一下）；
 *   孩子不小心按到了，上面有一顆更小的「上一行」可以退回去。
 * - 孩子的眼睛和手（T-90，AI 小男生：「整面都是字，不知道要做什麼」）：亮的那一行，紅字的圖放大、一圈淡黃框、
 *   依序輕輕跳一下（跟選圖、教學卡的「輪到你了」同一套）——大人念到那個詞，孩子看圖、點圖。
 *   點紅字（或它的圖）：圖再放大跳一下、有一聲輕的音效，外框收起來；不出聲念、不打斷大人。
 * - 每一行都有圖可以點（T-111，盲測 a35cd5e：三次都沒上完。一半以上的行沒有紅字，念那幾行時他沒有東西可以點，
 *   只好去點莫莫、點字，都沒反應，覺得「好久喔」就離開了）：
 *   - 沒有紅字的行借前後行的主角（data.ts 的 linePics：「跑到樹下睡大覺。」旁邊是兔子），樣子跟紅字的圖一樣；
 *   - 點這一行的字也算點了這一行的圖；
 *   - 每一行第一次點到圖：那張圖撒一把星星（看得出「我點到了」）；同一行再點只跳一下、輕輕一聲（不會變成一直點的遊戲）；
 *   - 上面的進度（Lesson 傳給 Shell）：念完一行亮一格，聽得出、看得出「念到哪裡、還有多少」（onLine）。
 * - 點莫莫（T-111）：莫莫開心跳一下、彈一聲，亮的那一行的圖再亮黃框、跳一下（莫莫在說「看這裡」），8 秒內第 3 下起只點一下頭。
 * - 第 2 次上同一篇（run = 2，現況對照 A3）：每一行最後一個紅字框起來、上面一個「停」字，提醒大人念到這裡停一下，讓他接。
 * - 最後一行念完按「念完了」：「聊一聊」卡片（對話式共讀，T-102）：3 歲問得出來的一題（誰、什麼、哪裡，./talk.json），
 *   有圖的放那張圖讓孩子用指的回答；下面一句「他答不出來，你可以說：…」給大人示範。
 *   孩子點了那張圖（用指的回答了，T-111：盲測裡媽媽問「誰跑得快快快？」他點兔子，什麼都沒發生，只好一直點）：
 *   圖亮綠框、撒星星、莫莫開心，「去選圖」馬上出現（大人的按鈕，不用再等 4 秒）。
 *   「去選圖」「再念一次」不放在卡片上（第三次盲測：孩子自己按掉了這一段），跟「下一行」一樣放在右下角的大人位置、同樣低調的樣子，
 *   聊一聊出來 4 秒後（或孩子指了圖之後）才出現（大人問完、等他回答的時間）；同一顆連點只算一下。
 */
export function Reader({
  t,
  run: times = 1,
  host,
  goLabel = '去選圖',
  onTalk,
  onNext,
  onLine,
  setMood,
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
  /** 念完幾行了（聊一聊的時候是全部的行數）：上面的進度跟著亮（T-111） */
  onLine?: (read: number) => void
  /** 莫莫的表情（點莫莫、用指的回答時開心一下；Lesson 給） */
  setMood?: (m: Mood) => void
  /** 一開始亮第幾行（排版檢查 scripts/check-zh-layout.mjs 用：直接看每一行亮起來、圖放大的樣子；課裡一律從第 0 行） */
  startAt?: number
}) {
  const still = useReducedMotion()
  const [cur, setCur] = useState(startAt)
  const [talk, setTalk] = useState(false)
  /** 聊一聊出來一陣子了（或孩子已經用指的回答了）：「去選圖」「再念一次」才出現在右下角 */
  const [talkReady, setTalkReady] = useState(false)
  /** 聊一聊：孩子點了問題的主角（用指的回答了） */
  const [answered, setAnswered] = useState(false)
  const [pop, setPop] = useState<{ w: string; k: number } | null>(null)
  /** 孩子點過的圖（第幾行:哪個詞）：點過就收起「點我」的外框 */
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  /** 第一次點到某一行的圖：那張圖撒一把星星（第幾行:哪個詞、第幾次） */
  const [burst, setBurst] = useState<{ key: string; n: number } | null>(null)
  /** 撒過星星的圖（第幾行:哪個詞）：每張只撒一次，點莫莫也不會重來 */
  const sparkled = useRef(new Set<string>())
  /** 點莫莫：聊一聊的主角再亮黃框、跳一下（第幾次） */
  const [look, setLook] = useState(0)
  const momoTaps = useRef<number[]>([])
  const moodTimer = useRef(0)
  const lockUntil = useRef(new Map<string, number>())
  const startedAt = useRef(performance.now())
  const left = useRef(false)
  const last = t.lines.length - 1
  const pics = linePics(t)
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

  /** 莫莫開心一下，過一會兒回到平常的樣子 */
  const happy = () => {
    if (!setMood) return
    setMood('happy')
    clearTimeout(moodTimer.current)
    moodTimer.current = window.setTimeout(() => setMood('idle'), MOMO_HAPPY_MS)
  }

  /**
   * 孩子點紅字、點圖、點這一行的字：圖放大跳一下（只看得到念過的行）。
   * 這一行第一次點到：那張圖撒一把星星、亮一點的一聲；同一行再點只跳一下、輕輕一聲。
   */
  const tapWord = (w: string, line: number) => {
    if ((line > cur && !talk) || left.current) return
    const key = `${line}:${w}`
    if (!sparkled.current.has(key)) {
      sparkled.current.add(key)
      sfx.pop()
      setBurst({ key, n: performance.now() })
    } else sfx.tap()
    if (!touched.has(key)) setTouched((s) => new Set(s).add(key))
    setPop({ w, k: performance.now() })
  }

  /** 聊一聊：孩子點了問題的主角（用指的回答）：圖跳一下；第一次再加綠框、星星、莫莫開心，「去選圖」馬上出來 */
  const answerTalk = (w: string) => {
    if (left.current) return
    setPop({ w, k: performance.now() })
    if (answered) return void sfx.tap()
    sfx.pop()
    setAnswered(true)
    setBurst({ key: `talk:${w}`, n: performance.now() })
    happy()
    setTalkReady(true)
  }

  // 上面的進度：念完幾行（聊一聊的時候整篇都念完了）
  useEffect(() => {
    onLine?.(talk ? t.lines.length : cur)
  }, [cur, talk, t.lines.length, onLine])

  useEffect(() => () => clearTimeout(moodTimer.current), [])

  // 聊一聊出來 4 秒後，大人的按鈕才出現（孩子先用指的回答了就馬上出現）
  useEffect(() => {
    if (!talk) {
      setTalkReady(false)
      setAnswered(false)
      return
    }
    const k = window.setTimeout(() => setTalkReady(true), still ? 0 : TALK_WAIT_MS)
    return () => clearTimeout(k)
  }, [talk, still])

  /**
   * 點莫莫（T-111，盲測 a35cd5e：點了沒反應，他一直想點恐龍）：不說話（大人在念），
   * 莫莫開心跳一下、彈一聲，亮的那一行的圖（聊一聊時是問題的主角）再亮黃框、跳一下——莫莫在說「看這裡」，把眼睛帶回課本。
   * 8 秒內第 3 下起只輕輕點一下頭、不出聲：有反應，但不好玩，不會變成一直點莫莫、不聽大人念。
   */
  useEffect(() => {
    host.current = () => {
      if (left.current) return
      const now = performance.now()
      momoTaps.current = [...momoTaps.current.filter((x) => now - x < MOMO_WINDOW_MS), now]
      if (momoTaps.current.length > MOMO_PLAY) return nod()
      sfx.boing()
      happy()
      setLook((n) => n + 1)
      // 亮的那一行的圖：黃框再亮起來、跳一下（點到了又收起來）
      if (!talk)
        setTouched((s) => {
          const n = new Set(s)
          for (const p of pics[cur]) n.delete(`${cur}:${p.word}`)
          return n
        })
    }
    return () => {
      host.current = null
    }
  })

  // 字級照最寬的那一行算（字＋放大的圖＋「停」都要放得進課本，./layout.ts）
  const { units, rows } = pageUnits(t, times)
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
              <div
                key={i}
                className={`zh-line${on ? ' on' : ''}${seen ? ' seen' : ' later'}`}
                data-line={i}
                onPointerDown={(e) => {
                  // 點這一行的字（不是紅字、不是圖）：當作點了這一行的第一張圖（T-111）
                  if (!seen || !pics[i].length || !firstFinger(e.nativeEvent)) return
                  tapWord(pics[i][0].word, i)
                }}
              >
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
                  {pics[i].map(({ word, echo }, j) => {
                    const key = `${i}:${word}`
                    const popped = pop?.w === word
                    return (
                      <motion.button
                        key={word}
                        type="button"
                        // 亮的那一行：圖放大、一圈淡黃框、依序輕輕跳一下（點我，T-84 同一套）；點過就收起外框（點莫莫會再亮一次）
                        className={`zh-pic${echo ? ' echo' : ''}${on ? ' big' : ''}${on && !touched.has(key) ? ' cue turn-hop' : ''}`}
                        data-word={word}
                        style={{ '--turn-i': j, pointerEvents: seen ? 'auto' : 'none', zIndex: on || popped ? 2 : undefined } as CSSProperties}
                        aria-label={word}
                        initial={false}
                        animate={
                          !seen
                            ? { opacity: 0, scale: 0.7, y: 6 }
                            : popped
                              ? { opacity: 1, scale: on ? [BIG, BIG * 1.22, BIG] : [1, 1.4, 1.12], y: 0 }
                              : on
                                ? { opacity: 1, scale: BIG, y: 0 }
                                : { opacity: 1, scale: 1, y: 0 }
                        }
                        transition={{ duration: still ? 0 : popped ? 0.6 : 0.45, ease: EASE.out }}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          if (firstFinger(e.nativeEvent)) tapWord(word, i)
                        }}
                      >
                        <span className="zh-pic-in">
                          <Pic name={t.emoji[word]!} />
                        </span>
                        {burst?.key === key && <Sparkles key={burst.n} count={10} />}
                      </motion.button>
                    )
                  })}
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
              // 問題的主角：孩子可以用指的回答（點了跳一下；第一次亮綠框、撒星星，T-111）。點莫莫時換 key：再亮黃框、跳一下
              <motion.button
                key={`talk-${look}`}
                type="button"
                className={`zh-talk-pic${answered ? ' said' : ' cue turn-hop'}`}
                aria-label={tk.pic}
                animate={pop?.w === tk.pic && !still ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: EASE.out }}
                onPointerDown={(e) => {
                  if (firstFinger(e.nativeEvent)) answerTalk(tk.pic!)
                }}
              >
                <span className="zh-pic-in">
                  <Pic name={t.emoji[tk.pic]!} />
                </span>
                {burst?.key === `talk:${tk.pic}` && <Sparkles key={burst.n} count={14} />}
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
