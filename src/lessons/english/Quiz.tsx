import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { useIdle } from '../../games/idle'
import { praiseKey, retryKey, wait } from '../../games/lines'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { logAttempt } from '../../lib/record'
import { pick, shuffle } from '../../lib/random'
import { LOOKALIKE, LOOKALIKE_LOWER } from '../../content/letters'
import { LESSON_LETTERS, ORDER, wordId, type LessonLetter } from './data'

interface Opt {
  id: string
  /** 字母選項：顯示的字 */
  text?: string
  /** 圖的選項 */
  icon?: string
}

export interface Question {
  kind: 'big' | 'little' | 'word'
  /** 這一題問的字母（複習題是以前學的字母） */
  L: string
  prompt: string
  answer: string
  options: Opt[]
  skill: string
  /** 答對之後念的那一句 */
  yes: string
}

/** 跟 x 長得像、或念起來容易混的，不放在同一題（三歲還在認形狀，先不考 b／d） */
const like = (a: string, b: string) => {
  const A = a.toUpperCase()
  const B = b.toUpperCase()
  return (LOOKALIKE[A] ?? '').includes(B) || (LOOKALIKE[B] ?? '').includes(A) || (LOOKALIKE_LOWER[a.toLowerCase()] ?? '').includes(b.toLowerCase()) || (LOOKALIKE_LOWER[b.toLowerCase()] ?? '').includes(a.toLowerCase())
}

/** 干擾的字母：先挑學過的，不夠再挑還沒學的（只是陪襯，答案一定是教過的） */
function otherLetters(target: string, learned: string[], n: number): string[] {
  // X 看起來像「打叉」，不拿來當陪襯
  const ok = (c: string) => c !== target && !like(c, target) && (c !== 'X' || learned.includes('X'))
  const a = shuffle(learned.filter(ok))
  const b = shuffle([...ORDER].filter((c) => ok(c) && !learned.includes(c)))
  return [...a, ...b].slice(0, n)
}

/**
 * 出今天的選擇題（3～5 題，這裡出 4 題）。先教再考：問的都是今天剛教過的字母、單字，或以前上過的字母（複習）。
 * 1. Where is big A?（大寫）  2. Where is little a?（小寫）  3. Which one starts with A?（圖）
 * 4. 以前學過的字母複習一題（第一天沒有以前的字母，就再問一題今天的單字）。
 * 選項數：前三個字母 2 選 1，之後 3 選 1。
 */
export function makeQuiz(letter: LessonLetter, idx: number): Question[] {
  const learned = [...ORDER.slice(0, idx)]
  const n = idx < 3 ? 1 : 2
  const { L, l } = letter
  const qs: Question[] = []
  const letterQ = (X: string, big: boolean): Question => {
    const others = otherLetters(X, learned.filter((c) => c !== X), n)
    const show = (c: string) => (big ? c : c.toLowerCase())
    return {
      kind: big ? 'big' : 'little',
      L: X,
      prompt: big ? `en.where.big.${X}` : `en.where.little.${X.toLowerCase()}`,
      answer: X,
      options: shuffle([X, ...others]).map((c) => ({ id: c, text: show(c) })),
      skill: `letter:${big ? X : X.toLowerCase()}`,
      yes: `ph.${X.toLowerCase()}.sound`,
    }
  }
  const wordQ = (ans: string): Question => {
    // 干擾的圖：別的字母的字（先挑學過的字母），不是今天字母開頭、圖也不一樣
    const pool = LESSON_LETTERS.filter((x) => x.L !== L)
    const prefer = pool.filter((x) => learned.includes(x.L))
    const cands = (xs: LessonLetter[]) => xs.flatMap((x) => x.starts).filter((w) => w.w[0].toLowerCase() !== l && w.alt !== l)
    const others = [...shuffle(cands(prefer)), ...shuffle(cands(pool))].filter((w, i, a) => a.findIndex((v) => v.icon === w.icon) === i).slice(0, n)
    const a = letter.words.find((w) => w.w === ans)!
    return {
      kind: 'word',
      L,
      prompt: `ph.${l}.q.word`,
      answer: wordId(ans),
      options: shuffle([a, ...others]).map((w) => ({ id: wordId(w.w), icon: w.icon })),
      skill: `phonics:${l}`,
      yes: `ph.word.${wordId(ans)}`,
    }
  }
  qs.push(letterQ(L, true), letterQ(L, false))
  const starts = shuffle(letter.starts.map((w) => w.w))
  qs.push(starts.length ? wordQ(starts[0]) : letterQ(L, true))
  if (learned.length) qs.push(letterQ(pick(learned.slice(-3)), true))
  else qs.push(starts.length > 1 ? wordQ(starts[1]) : letterQ(L, false))
  return qs
}

/**
 * 選擇（英文課第 4 段）：一題一題問，念完題目才收作答（念的時候點：輕輕一聲，不算）。
 * 答錯：再試一次；又錯：答案亮起來、手指著，點了才往下（一起練，不算答對）。發呆 15 秒再念一次題目、30 秒手指著答案。
 * 每一題都寫作答紀錄（家長區看得到）。onDone(第一次就答對幾題, 共幾題)。
 */
export function Quiz({ qs, onDone }: { qs: Question[]; onDone: (right: number, total: number) => void }) {
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
  const right = useRef(0)
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
      if (tries.current >= 2) setHint(true)
      await say(tries.current >= 2 ? q.prompt : retryKey('dodo'))
      if (!live.current) return
      busy.current = false
      return
    }
    busy.current = true
    setAccept(false)
    idle.stop()
    const first = tries.current === 0
    if (first) right.current++
    setState((s) => ({ ...s, [o.id]: 'yes' }))
    sfx.correct()
    void logAttempt({
      station: 'english',
      game: 'lesson-en',
      itemId: `${q.kind}:${q.answer}`,
      skill: q.skill,
      // 答錯兩次、手指著答案才點對的：算一起練
      phase: tries.current >= 2 ? 'guided' : 'quiz',
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
    if (i + 1 >= qs.length) return onDone(right.current, qs.length)
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
