import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { logAttempt } from '../../lib/record'
import { wait } from '../../games/lines'
import { WaitShield, firstFinger } from '../../games/NotYet'
import { Hand } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { Sparkles } from '../../ui/Sparkles'
import { FADE, REVEAL_MS } from '../../ui/motion'
import { useSwapQuiet } from '../../ui/Scenes'
import { shuffle } from '../../lib/random'
import type { Mood } from '../../art/Dino'
import { type ZhQuestion, type ZhText } from './data'
import { Pic } from './Pic'
import { ZH_GAME, type HostTap } from './Lesson'

type Mark = 'wrong' | 'correct' | 'hint'

/** 答對的慶祝多久（FB-4：每題 ≤ 1.5 秒），之後換下一題 */
const CHEER_MS = 1500

/** 答錯幾次以後把答案標出來（手點一下） */
const HINT_AFTER = 2

/** 題目卡出來以後，等這麼久才收作答：給大人時間把題目念出來（念的時候孩子點了只出現「看這裡」的圈圈） */
const READ_MS = 1600

/**
 * 選圖：「哪個是烏龜？」三張圖選一張（親子共讀：App 不出聲，2026-11-03）。
 * - 上面的題目卡字很大：「哪個是」小一點、紅字大，大人照著念給孩子聽。
 * - 題目卡出來一下子（READ_MS）才收作答；答對的卡片放大、亮綠框、撒星星、叮一聲，答錯的抖一下變淡、輕輕一聲；
 *   錯兩次就把答案標出來、手點一下。收作答以後、還沒點過時，每張圖一圈淡黃框、依序輕輕跳一下（輪到你了，T-84）。
 * - 回饋只有畫面和音效，不說話（中文、英文都不說）。答對要不靠語言就看得出來（T-97，AI 小男生盲測：只有綠框和小星星，他看不出答對了）：
 *   答對的那張放大、跳一下、亮綠框、右上角一個綠色大打勾、星星撒開，其他兩張淡掉縮小，莫莫歡呼，叮一聲；1.5 秒後換下一題。
 *   綠框、星星、叮、恐龍歡呼跟英文課、數學課答對時一樣；打勾和其他選項淡掉是中文課多的（別的課有恐龍說 Yes!，這裡不說話）。孩子一直沒動：題目卡輕輕跳一下提醒大人再問一次，再久一點手就示範。
 */
export function Quiz({ t, q, host, setMood, onNext }: { t: ZhText; q: ZhQuestion; host: HostTap; setMood: (m: Mood) => void; onNext: () => void }) {
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

  /** 再問一次：題目卡跳一下（大人看到就再念一次） */
  const ask = () => setNudge((n) => n + 1)

  const showHint = () => {
    hintUsed.current = true
    setMarks((m) => ({ ...m, [q.word]: 'hint' }))
    setHandTap((n) => n + 1)
  }

  const open = () => {
    if (!live.current || locked.current) return
    setAccepting(true)
    if (!shownAt.current) shownAt.current = performance.now()
    idle.start({ repeat: ask, hint: showHint })
  }

  useEffect(() => {
    live.current = true
    void (async () => {
      await wait(REVEAL_MS + READ_MS)
      if (!live.current) return
      open()
    })()
    return () => {
      live.current = false
      idle.stop()
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
        phase: 'quiz',
        options: opts.map((o) => o.word),
        answer: q.word,
        taps: taps.current,
        firstTryCorrect: wrongs.current === 0,
        attempts: taps.current.length,
        responseMs: taps.current[0].ms,
        hintUsed: hintUsed.current,
      })
      // 答對了：圖放大跳一下、打勾、星星撒完、其他兩張淡掉，看一下自己選對的圖，再換下一題（FB-4：每題的慶祝 ≤ 1.5 秒）
      await wait(CHEER_MS)
      if (live.current) onNext()
      return
    }
    wrongs.current++
    setMarks((m) => ({ ...m, [id]: 'wrong' }))
    sfx.gentle()
    setAccepting(false)
    // 抖一下、變淡的動畫走完再收下一次
    await wait(700)
    if (!live.current) return
    if (wrongs.current >= HINT_AFTER) showHint()
    open()
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
      <div className={`options with-stim zh-options${solved ? ' is-solved' : ''}`}>
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
              <div className="tile-in">
                <Pic name={o.icon} />
              </div>
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
