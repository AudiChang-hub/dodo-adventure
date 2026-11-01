import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { say, sayClip, sfx } from '../../lib/audio'
import { logAttempt } from '../../lib/record'
import { praiseKey, retryKey, wait } from '../../games/lines'
import { WaitShield, firstFinger } from '../../games/NotYet'
import { Hand } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { Sparkles } from '../../ui/Sparkles'
import { FADE, REVEAL_MS } from '../../ui/motion'
import { useSwapQuiet } from '../../ui/Scenes'
import { shuffle } from '../../lib/random'
import type { Mood } from '../../art/Dino'
import { hasClip, questionText, zhClip, type ZhQuestion, type ZhText } from './data'
import { Pic } from './Pic'
import { ZH_GAME, type HostTap } from './Lesson'

type Mark = 'wrong' | 'correct' | 'hint'

/** 答錯幾次以後把答案標出來（手點一下） */
const HINT_AFTER = 2

/**
 * 選圖：「哪個是烏龜？」三張圖選一張，手感跟選擇題引擎（games/ChoiceGame.tsx）一樣——
 * 題目念完才收作答（念的時候點了只出現「看這裡」的圈圈），答對的卡片放大、亮綠框、撒星星，答錯的抖一下變淡；
 * 錯兩次就把答案標出來、手點一下。上面是課文裡那個紅字，點它（或點莫莫）再聽一次題目。
 * 題目用中文念（BreezyVoice），稱讚、再試一次照全站慣例用英文（莫莫的 Yes. / Try again.）。
 */
export function Quiz({ t, q, ready, host, setMood, onNext }: { t: ZhText; q: ZhQuestion; ready: Set<string>; host: HostTap; setMood: (m: Mood) => void; onNext: () => void }) {
  const still = useReducedMotion()
  const quiet = useSwapQuiet()
  const [opts] = useState(() => shuffle(q.options))
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [accepting, setAcc] = useState(false)
  // 同一格裡連點兩下（兩根手指、手掌）時，第二下要看到已經關上：用 ref 判斷，state 只管畫面
  const acceptRef = useRef(false)
  const setAccepting = (v: boolean) => {
    acceptRef.current = v
    setAcc(v)
  }
  const [handTap, setHandTap] = useState(0)
  const [burst, setBurst] = useState(0)
  const idle = useIdle()
  const live = useRef(true)
  const locked = useRef(false)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const shownAt = useRef(0)
  const wrongs = useRef(0)
  const hintUsed = useRef(false)

  /** 問題：「哪個是烏龜？」。沒有聲音就停一下（題目卡上看得到那個紅字） */
  const ask = async () => {
    const text = questionText(q.word)
    const ok = hasClip(ready, 'question', text) && (await sayClip(zhClip('question', text), 'momo'))
    if (!ok && live.current) await wait(900)
  }

  const showHint = () => {
    hintUsed.current = true
    setMarks((m) => ({ ...m, [q.word]: 'hint' }))
    setHandTap((n) => n + 1)
  }

  const open = () => {
    if (!live.current || locked.current) return
    setAccepting(true)
    if (!shownAt.current) shownAt.current = performance.now()
    idle.start({ repeat: () => void ask(), hint: showHint })
  }

  useEffect(() => {
    live.current = true
    void (async () => {
      await wait(REVEAL_MS)
      if (!live.current) return
      await ask()
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
      void ask()
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
      setMood('happy')
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
      await say(praiseKey('momo'))
      if (!live.current) return
      // 答對了再念一次這個詞（圖和字連在一起）
      if (hasClip(ready, 'word', q.word)) await sayClip(zhClip('word', q.word), 'momo')
      if (!live.current) return
      await wait(500)
      if (live.current) onNext()
      return
    }
    wrongs.current++
    setMarks((m) => ({ ...m, [id]: 'wrong' }))
    sfx.gentle()
    setAccepting(false)
    await say(retryKey('momo'))
    if (!live.current) return
    if (wrongs.current >= HINT_AFTER) showHint()
    await ask()
    open()
  }

  return (
    <div className="zh-quiz">
      <motion.button
        type="button"
        className="zh-ask"
        aria-label="再聽一次題目"
        initial={quiet || still ? false : { y: -18 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        onPointerDown={() => {
          if (!acceptRef.current || locked.current) return
          idle.poke()
          void ask()
        }}
      >
        <span className="zh-ask-word">{q.word}</span>
      </motion.button>
      <div className="options with-stim zh-options">
        {opts.map((o, i) => {
          const m = marks[o.word]
          return (
            <motion.button
              key={o.word}
              type="button"
              className={`tile${m === 'correct' ? ' correct' : ''}${m === 'hint' ? ' hint' : ''}`}
              aria-label={`選項 ${i + 1}`}
              data-answer={o.word === q.word ? '1' : undefined}
              initial={quiet || still ? false : { y: 28, scale: 0.94 }}
              animate={
                m === 'wrong'
                  ? { x: [0, -14, 14, -9, 9, 0], opacity: 0.45, y: 0, scale: 0.94 }
                  : m === 'correct'
                    ? { scale: [1, 1.14, 1.06], y: -8, opacity: 1 }
                    : { y: 0, opacity: accepting || m ? 1 : 0.55, scale: 1 }
              }
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 380, damping: 20, delay: m ? 0 : 0.08 * i, opacity: FADE }}
              onPointerDown={(e) => {
                // 兩根手指、手掌同時壓到兩張：只算第一根手指（準則 TOUCH-3）
                if (firstFinger(e.nativeEvent)) void tap(o.word)
              }}
            >
              <div className="tile-in">
                <Pic name={o.icon} />
              </div>
              {m === 'hint' && handTap > 0 && <Hand x={74} y={72} size="12cqmin" tap={handTap} />}
              {m === 'correct' && <Sparkles key={burst} />}
            </motion.button>
          )
        })}
      </div>
      <WaitShield on={!accepting} />
    </div>
  )
}
