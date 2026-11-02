import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { praiseKey, retryKey, wait } from '../../games/lines'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { hasLine } from '../../content/lines'
import { logAttempt } from '../../lib/record'
import type { QuizResult } from './plan'
import { wrongKeys, type Opt, type Question } from './quiz-plan'

/**
 * 選擇（英文課第 4 段）：一題一題問，念完題目才收作答（念的時候點：輕輕一聲，不算）。
 * 答錯：說出點的是什麼、要找的是什麼（That's big B. Find big A!），答案同時亮起來、手指著，點了才往下（一起練，不算答對）。
 * 發呆 15 秒再念一次題目、30 秒手指著答案。
 * 每一題都寫作答紀錄（家長區看得到）。onDone(每一題的種類和第一次有沒有答對)：隔天重不重上只看字母題（plan.ts 的 lessonGood）。
 */
export function Quiz({ qs, onDone }: { qs: Question[]; onDone: (rs: QuizResult[]) => void }) {
  const [i, setI] = useState(0)
  const [accept, setAccept] = useState(false)
  const [state, setState] = useState<Record<string, 'no' | 'yes'>>({})
  const [hint, setHint] = useState(false)
  const [bump, setBump] = useState<{ id: string; n: number } | null>(null)
  const live = useRef(true)
  const busy = useRef(true)
  const tries = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const results = useRef<QuizResult[]>([])
  const idle = useIdle()
  const q = qs[i]

  const ask = async (k: number) => {
    busy.current = true
    setAccept(false)
    setState({})
    setHint(false)
    tries.current = 0
    taps.current = []
    idle.stop()
    await wait(k === 0 ? 300 : 450)
    if (!live.current) return
    if (k === 0) await say('le.en.play')
    if (!live.current) return
    await say(qs[k].prompt)
    if (!live.current) return
    busy.current = false
    setAccept(true)
    t0.current = performance.now()
    idle.start({ repeat: () => void say(qs[k].prompt), hint: () => setHint(true) })
  }

  useEffect(() => {
    live.current = true
    void ask(0)
    return () => {
      live.current = false
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = async (o: Opt) => {
    setBump((b) => ({ id: o.id, n: (b?.n ?? 0) + 1 }))
    if (busy.current) return void sfx.tap()
    idle.poke()
    const ms = Math.round(performance.now() - t0.current)
    taps.current.push({ pick: o.id, ms })
    if (o.id !== q.answer) {
      tries.current++
      sfx.gentle()
      setState((s) => ({ ...s, [o.id]: 'no' }))
      busy.current = true
      // 答案亮起來、手指著；第一次錯說明點的是什麼、要找的是什麼，之後再錯只念題目
      setHint(true)
      const why = wrongKeys(q, o)
      await say(...(tries.current >= 2 ? [q.prompt] : why.every(hasLine) ? why : [retryKey('dodo')]))
      if (!live.current) return
      busy.current = false
      return
    }
    busy.current = true
    setAccept(false)
    idle.stop()
    const first = tries.current === 0
    results.current.push({ kind: q.kind, first })
    setState((s) => ({ ...s, [o.id]: 'yes' }))
    sfx.correct()
    void logAttempt({
      station: 'english',
      game: 'lesson-en',
      itemId: `${q.kind}:${q.answer}`,
      skill: q.skill,
      // 答錯過（答案已經亮起來、手指著）才點對的：算一起練
      phase: tries.current >= 1 ? 'guided' : 'quiz',
      level: 1,
      options: q.options.map((x) => x.id),
      answer: q.answer,
      taps: taps.current,
      firstTryCorrect: first,
      attempts: tries.current + 1,
      responseMs: ms,
      hintUsed: hint,
    })
    await say(...(first ? [praiseKey('dodo'), q.yes] : [q.yes]))
    await wait(300)
    if (!live.current) return
    if (i + 1 >= qs.length) return onDone(results.current)
    setI(i + 1)
    void ask(i + 1)
  }

  const handAt = q.options.findIndex((o) => o.id === q.answer)
  return (
    <div className="en-quiz">
      <AnimatePresence initial={false}>
        <motion.div
          key={i}
          className={`en-options is-${q.kind} n${q.options.length}`}
          data-accepting={accept ? undefined : 'false'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.45 } }}
          exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.1 } }}
        >
          {q.options.map((o, k) => (
            <button
              key={o.id}
              type="button"
              className={`en-opt${state[o.id] === 'yes' ? ' is-yes' : state[o.id] === 'no' ? ' is-no' : ''}${hint && o.id === q.answer ? ' is-hint' : ''}`}
              aria-label={o.text ?? o.id}
              onClick={() => void choose(o)}
            >
              <span key={bump?.id === o.id ? bump.n : 0} className={bump?.id === o.id ? (state[o.id] === 'no' ? 'en-shake' : 'en-hop') : undefined}>
                {o.icon ? <Emoji name={o.icon} /> : <span className="en-opt-letter">{o.text}</span>}
              </span>
              {hint && k === handAt && (
                <span className="en-opt-hand" aria-hidden="true">
                  <Hand x={58} y={58} tap={1} size="38%" cuff="#BFE0CC" />
                </span>
              )}
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
