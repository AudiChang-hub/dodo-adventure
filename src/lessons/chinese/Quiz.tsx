import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { logAttempt } from '../../lib/record'
import { wait } from '../../games/lines'
import { WaitShield, firstFinger } from '../../games/NotYet'
import { Hand } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { PACE } from '../../games/pace'
import { Sparkles } from '../../ui/Sparkles'
import { FADE, REVEAL_MS } from '../../ui/motion'
import { useSwapQuiet } from '../../ui/Scenes'
import { shuffle } from '../../lib/random'
import type { Mood } from '../../art/Dino'
import { type ZhQuestion, type ZhText } from './data'
import { Pic } from './Pic'
import { ZH_GAME, type HostTap } from './Lesson'

type Mark = 'wrong' | 'correct' | 'hint'

/**
 * 答對之後多久出「下一步」的大箭頭（T-139，盲測 ccf7ac7 中文 2：以前等慶祝 1.5 秒才出箭頭、4 秒手才來，
 * 孩子打勾之後「一直點小豬都沒有變」就離開）。打勾跳出來就出箭頭；慶祝（放大、星星）照樣在箭頭後面播完，換題要等他點箭頭（T-118）
 */
const NEXT_AFTER_MS = 600
/** 最後一題答對：看一下打勾、星星就進下課的慶祝（T-113） */
const LAST_CHEER_MS = 800

/** 答錯幾次以後把答案標出來（手點一下） */
const HINT_AFTER = 2

/**
 * 沒有大人帶的時候（T-135，AI 小男生盲測 becf39a 中文 2：選圖一出來，大人還沒念題目，畫面上只有兔子、烏龜和一堆字，
 * 他不知道要做什麼，「好久喔」就按返回）：孩子還沒點任何一張時，
 * - 這一篇的第一題一出來，手就輪流在每一張上點一下（「點一張」，每一張都點，不洩露答案），點完就收走；
 * - 發呆 WAKE_MS：圖依序再輕輕跳一下；發呆 POINT_MS：手再輪流點一次。
 * 15 秒題目卡跳一下（提醒大人再問一次）、30 秒手點答案（useIdle）照舊。孩子點了任何一張就不再出來（他知道要點圖了）。
 */
const WAKE_MS = 3000
const POINT_MS = 6000
/** 手在一張上停多久（出現 → 點一下 → 換下一張） */
const POINT_STAY_MS = 850


/**
 * 選圖：「哪個是烏龜？」三張圖選一張（親子共讀：App 不出聲，2026-11-03）。
 * - 上面的題目卡字很大：「哪個是」小一點、紅字大，大人照著念給孩子聽。
 * - 卡片一出來就收作答（T-108 搶點：以前等 1.6 秒給大人念題目，孩子搶著點只出現圈圈，覺得被擋；大人還沒念完他就點對了也照常算）；
 *   答對的卡片放大、亮綠框、撒星星、叮一聲，答錯的抖一下變淡、輕輕一聲（抖的時候就可以點別張）；
 *   錯兩次就把答案標出來、手點一下。收作答以後、還沒點過時，每張圖一圈淡黃框、依序輕輕跳一下（輪到你了，T-84）。
 * - 回饋只有畫面和音效，不說話（中文、英文都不說）。答對要不靠語言就看得出來（T-97，AI 小男生盲測：只有綠框和小星星，他看不出答對了）：
 *   答對的那張放大、跳一下、亮綠框、右上角一個綠色大打勾、星星撒開，其他兩張淡掉縮小，莫莫歡呼，叮一聲；1.5 秒後換下一題。
 *   綠框、星星、叮、恐龍歡呼跟英文課、數學課答對時一樣；打勾和其他選項淡掉是中文課多的（別的課有恐龍說 Yes!，這裡不說話）。孩子一直沒動：題目卡輕輕跳一下提醒大人再問一次，再久一點手就示範。
 */
export function Quiz({
  t,
  q,
  last = false,
  first = false,
  host,
  setMood,
  onNext,
}: {
  t: ZhText
  q: ZhQuestion
  /** 這一篇的最後一題：答對了看一下打勾就下課（T-113：不再等滿 1.5 秒） */
  last?: boolean
  /** 這一篇的第一題：一出來手就輪流點每一張（T-135） */
  first?: boolean
  host: HostTap
  setMood: (m: Mood) => void
  onNext: () => void
}) {
  const still = useReducedMotion()
  const quiet = useSwapQuiet()
  const [opts] = useState(() => shuffle(q.options))
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  /** 答對了：其他選項淡掉 */
  const solved = Object.values(marks).includes('correct')
  const [accepting, setAcc] = useState(false)
  // 同一格裡連點兩下（兩根手指、手掌）時，第二下要看到已經關上：用 ref 判斷，state 只管畫面
  const acceptRef = useRef(false)
  const setAccepting = (v: boolean) => {
    acceptRef.current = v
    setAcc(v)
  }
  const [handTap, setHandTap] = useState(0)
  const [burst, setBurst] = useState(0)
  /** 題目卡輕輕跳一下（提醒大人再問一次） */
  const [nudge, setNudge] = useState(0)
  const idle = useIdle()
  const live = useRef(true)
  const locked = useRef(false)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const shownAt = useRef(0)
  const wrongs = useRef(0)
  const hintUsed = useRef(false)
  const led = useRef(false)
  /** 「點一張」的手在第幾張上（沒有是 null）、點了幾下；圖再跳一下（data-wake）幾次（T-135） */
  const [point, setPoint] = useState<number | null>(null)
  const [pointTap, setPointTap] = useState(0)
  const [wake, setWake] = useState(0)
  const early = useRef<number[]>([])
  /** 手輪流點的這一輪（新的一輪、孩子點了就換號，舊的停下來） */
  const sweepId = useRef(0)

  /** 孩子點了、標出答案、換題：早期的提醒都收掉 */
  const calm = () => {
    for (const k of early.current) clearTimeout(k)
    early.current = []
    sweepId.current++
    setPoint(null)
  }

  /** 手輪流在每一張上點一下，點完收走（不停在任何一張上：不是在說答案是哪張） */
  const sweep = async () => {
    const id = ++sweepId.current
    for (let i = 0; i < opts.length; i++) {
      setPoint(i)
      setPointTap(0)
      await wait(still ? 120 : 300)
      if (sweepId.current !== id || !live.current) return
      setPointTap((n) => n + 1)
      await wait(POINT_STAY_MS - 300)
      if (sweepId.current !== id || !live.current) return
    }
    setPoint(null)
  }

  /** 孩子還沒點過任何一張：排好早期的提醒（第一題一出來手就點；WAKE_MS 圖跳、POINT_MS 手再點） */
  const plan = () => {
    calm()
    if (taps.current.length || hintUsed.current || locked.current) return
    if (first) void sweep()
    const at = first ? opts.length * POINT_STAY_MS : 0
    early.current = [window.setTimeout(() => setWake((n) => n + 1), at + WAKE_MS), window.setTimeout(() => void sweep(), at + POINT_MS)]
  }

  /** 再問一次：題目卡跳一下（大人看到就再念一次） */
  const ask = () => setNudge((n) => n + 1)

  const showHint = () => {
    calm()
    hintUsed.current = true
    setMarks((m) => ({ ...m, [q.word]: 'hint' }))
    setHandTap((n) => n + 1)
  }

  const open = () => {
    if (!live.current || locked.current) return
    setAccepting(true)
    if (!shownAt.current) shownAt.current = performance.now()
    idle.start({ repeat: ask, hint: showHint })
    plan()
  }

  useEffect(() => {
    live.current = true
    void (async () => {
      // 卡片淡入完就收（至少 0.5 秒：上一題連點的手指不會直接點掉新題目，PACE.BARGE_ARM）
      await wait(Math.max(REVEAL_MS, PACE.BARGE_ARM))
      if (!live.current) return
      open()
    })()
    return () => {
      live.current = false
      idle.stop()
      calm()
    }
    // 每一題進來問一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    host.current = () => {
      if (locked.current) return
      idle.poke()
      ask()
    }
    return () => {
      host.current = null
    }
  })

  const tap = async (id: string) => {
    if (!acceptRef.current || locked.current || marks[id] === 'wrong') return
    idle.poke()
    calm()
    // 第一次點的時候手正指著答案（發呆太久手出來示範了，T-111）：答案是看手的，記成一起練、不計入熟練
    if (!taps.current.length) led.current = hintUsed.current
    taps.current.push({ pick: id, ms: Math.round(performance.now() - shownAt.current) })
    if (id === q.word) {
      locked.current = true
      idle.stop()
      setMarks((m) => ({ ...m, [id]: 'correct' }))
      setBurst((b) => b + 1)
      sfx.correct()
      // 恐龍跟著歡呼（跟每一課答對時一樣）
      setMood('cheer')
      void logAttempt({
        station: 'mandarin',
        game: ZH_GAME,
        itemId: `${t.day}:${q.word}`,
        skill: `zhtext:${q.word}`,
        level: 1,
        phase: led.current ? 'guided' : 'quiz',
        ...(led.current ? { metrics: { led: 1 } } : {}),
        options: opts.map((o) => o.word),
        answer: q.word,
        taps: taps.current,
        firstTryCorrect: wrongs.current === 0,
        attempts: taps.current.length,
        responseMs: taps.current[0].ms,
        hintUsed: hintUsed.current,
      })
      // 答對了：圖放大跳一下、打勾、星星撒開、其他兩張淡掉；打勾跳出來就出大箭頭（NEXT_AFTER_MS），最後一題看一下就下課
      await wait(last ? LAST_CHEER_MS : NEXT_AFTER_MS)
      if (live.current) onNext()
      return
    }
    wrongs.current++
    setMarks((m) => ({ ...m, [id]: 'wrong' }))
    sfx.gentle()
    // 抖一下、變淡的時候也可以點別張（T-108）；錯兩次的提示等抖完再出來
    await wait(700)
    if (!live.current || locked.current) return
    if (wrongs.current >= HINT_AFTER) showHint()
    idle.poke()
  }

  return (
    <div className="zh-quiz">
      <motion.button
        type="button"
        className="zh-ask"
        aria-label={`哪個是${q.word}？`}
        initial={nudge || quiet || still ? false : { y: -18 }}
        animate={nudge && !still ? { y: [0, -10, 0] } : { y: 0 }}
        transition={nudge ? { duration: 0.5, ease: 'easeOut' } : { type: 'spring', stiffness: 300, damping: 22 }}
        key={`ask${nudge}`}
        onPointerDown={() => {
          if (locked.current) return
          idle.poke()
          ask()
        }}
      >
        <span className="zh-ask-lead">哪個是</span>
        <span className="zh-ask-word">{q.word}</span>
        <span className="zh-ask-lead">？</span>
      </motion.button>
      <div className={`options with-stim zh-options${solved ? ' is-solved' : ''}`} data-wake={wake || undefined}>
        {opts.map((o, i) => {
          const m = marks[o.word]
          return (
            <motion.button
              key={o.word}
              type="button"
              className={`tile${m === 'correct' ? ' correct' : ''}${m === 'hint' ? ' hint' : ''}${accepting && !Object.keys(marks).length ? ' cue turn-hop' : ''}`}
              style={{ '--turn-i': i } as CSSProperties}
              aria-label={`選項 ${i + 1}`}
              data-answer={o.word === q.word ? '1' : undefined}
              initial={quiet || still ? false : { y: 28, scale: 0.94 }}
              animate={
                m === 'correct'
                  ? { scale: still ? 1.12 : [1, 1.24, 1.12], y: still ? -10 : [0, -22, -10], opacity: 1 }
                  : solved
                    ? { opacity: 0.25, scale: 0.88, y: 0, x: 0 }
                    : m === 'wrong'
                      ? { x: [0, -14, 14, -9, 9, 0], opacity: 0.45, y: 0, scale: 0.94 }
                      : { y: 0, opacity: accepting || m ? 1 : 0.55, scale: 1 }
              }
              whileTap={{ scale: 0.94 }}
              transition={
                m === 'correct'
                  ? { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
                  : { type: 'spring', stiffness: 380, damping: 20, delay: m || solved ? 0 : 0.08 * i, opacity: FADE }
              }
              onPointerDown={(e) => {
                // 兩根手指、手掌同時壓到兩張：只算第一根手指（準則 TOUCH-3）
                if (firstFinger(e.nativeEvent)) void tap(o.word)
              }}
            >
              {/* 發呆幾秒：圖依序再輕輕跳一下（turn-hop 換 key 重播，T-135） */}
              <div className={`tile-in${wake && !m ? ' turn-hop' : ''}`} key={`in${wake}`}>
                <Pic name={o.icon} />
              </div>
              {point === i && !m && <Hand x={62} y={64} size="12cqmin" tap={pointTap} />}
              {m === 'hint' && handTap > 0 && <Hand x={74} y={72} size="12cqmin" tap={handTap} />}
              {m === 'correct' && <Sparkles key={burst} count={16} />}
              {m === 'correct' && (
                <motion.span
                  className="zh-yes"
                  aria-hidden="true"
                  initial={still ? false : { scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.12 }}
                >
                  <svg viewBox="0 0 48 48" width="62%" aria-hidden="true">
                    <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.span>
              )}
            </motion.button>
          )
        })}
      </div>
      <WaitShield on={!accepting} />
    </div>
  )
}
