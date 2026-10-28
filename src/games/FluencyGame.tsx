import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { VisualView } from '../ui/Visual'
import { Sparkles } from '../ui/Sparkles'
import { game as gameDef, type Visual } from '../content/games'
import { COUNT_ICONS } from '../content/park'
import { themed } from '../lib/theme-play'
import { QUICK_CHEERS } from '../content/lines-engine'
import { markPlayed } from '../lib/adaptive'
import { fluencyKey, fluencyTargets, type FluencyTarget } from '../lib/fluency'
import { logAttempt } from '../lib/record'
import { preload, say, sfx, stopSpeech } from '../lib/audio'
import { pick, sample, shuffle } from '../lib/random'
import { retryKey, wait } from './lines'
import { useIdle } from './idle'
import type { Mood } from '../art/Dino'
import { Swap } from '../ui/Scenes'
import { FADE } from '../ui/motion'
import './engine.css'

export { isFluency } from '../lib/fluency'

/** 每次 5 題 */
const ITEMS = 5

interface Q {
  t: FluencyTarget
  stimulus?: Visual
  prompt: string
  options: number[]
}

function makeQ(t: FluencyTarget): Q {
  const near = [t.n - 2, t.n - 1, t.n + 1, t.n + 2].filter((x) => x >= 1 && x <= (t.kind === 'count' ? 10 : 20))
  const options = shuffle([t.n, ...sample(near, 2)])
  return t.kind === 'count'
    ? { t, stimulus: { t: 'group', icon: pick(themed(COUNT_ICONS, (th) => th.count)), count: t.n }, prompt: 'm.howmany', options }
    : { t, prompt: `m.findnum.${t.n}`, options }
}

/** 5 題，盡量不重複、不連續出同一題 */
function makeRound(): Q[] {
  const pool = fluencyTargets()
  const out: FluencyTarget[] = []
  let bag: FluencyTarget[] = []
  while (out.length < ITEMS) {
    if (!bag.length) bag = shuffle(pool)
    const t = bag.shift()!
    if (out.length && out[out.length - 1] === t && pool.length > 1) continue
    out.push(t)
  }
  return out.map(makeQ)
}

/**
 * 功文式小練習（數字工地）：全是已熟的數字題，一題接一題快速作答。
 * - 沒有計時、沒有倒數、沒有分數；畫面上看不到任何時間。
 * - 答對一題，波波就更開心一點（台詞與慶祝越來越大）；答錯只是輕輕再試一次。
 * - 背景記下每一題的反應時間，家長區畫出這個遊戲的速度變化。
 */
export function FluencyGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [round] = useState(makeRound)
  const [idx, setIdx] = useState(0)
  const [view, setView] = useState(0)
  const [wrong, setWrong] = useState<number[]>([])
  const [hint, setHint] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [mood, setMood] = useState<Mood>('happy')
  /** 答對了幾題：波波的開心程度 */
  const [joy, setJoy] = useState(0)
  const [ready, setReady] = useState(false)
  const live = useRef(true)
  const locked = useRef(true)
  const idxRef = useRef(0)
  const shownAt = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const hintUsed = useRef(false)
  const firstTries = useRef(0)
  const idle = useIdle()

  const q = round[idx]

  const show = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    setWrong([])
    setHint(false)
    setDone(null)
    setView((v) => v + 1)
    taps.current = []
    hintUsed.current = false
    locked.current = false
    shownAt.current = performance.now()
    const it = round[i]
    if (round[i + 1]) preload([round[i + 1].prompt])
    // 一題接一題：唸題目時就可以點，不必等唸完
    await say(it.prompt)
    if (!live.current || idxRef.current !== i || locked.current) return
    idle.start({
      repeat: () => void say(it.prompt),
      hint: () => {
        hintUsed.current = true
        setHint(true)
      },
    })
  }

  useEffect(() => {
    live.current = true
    preload(['quick.intro', 'quick.done', ...round.map((r) => r.prompt), ...QUICK_CHEERS.map((_, i) => `quick.cheer.${i}`)])
    const boot = window.setTimeout(async () => {
      markPlayed(def.id)
      await say('quick.intro')
      if (!live.current) return
      setReady(true)
      setMood('idle')
      void show(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async (n: number) => {
    if (locked.current || wrong.includes(n)) return
    idle.poke()
    const it = round[idxRef.current]
    taps.current.push({ pick: String(n), ms: Math.round(performance.now() - shownAt.current) })
    if (n !== it.t.n) {
      sfx.gentle()
      setWrong((w) => [...w, n])
      const wrongs = taps.current.filter((t) => t.pick !== String(it.t.n)).length
      if (wrongs >= 2) {
        hintUsed.current = true
        setHint(true)
      }
      await say(wrongs >= 2 ? (it.t.kind === 'count' ? `m.total.${it.t.n}` : `m.thisis.${it.t.n}`) : retryKey('bobo'))
      idle.poke()
      return
    }
    locked.current = true
    idle.stop()
    const firstTry = taps.current.length === 1 && !hintUsed.current
    if (firstTry) firstTries.current++
    sfx.correct()
    setDone(n)
    const j = joy + 1
    setJoy(j)
    setMood('cheer')
    void logAttempt({
      station: def.station,
      game: def.id,
      itemId: String(it.t.n),
      skill: fluencyKey(it.t),
      level: 1,
      phase: 'quiz',
      options: it.options.map(String),
      answer: String(it.t.n),
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: hintUsed.current,
    })
    // 答對越多題，波波越開心：台詞一句比一句興奮
    await say(`quick.cheer.${Math.min(QUICK_CHEERS.length - 1, j - 1)}`)
    if (!live.current) return
    const nx = idxRef.current + 1
    if (nx >= ITEMS) {
      await wait(200)
      await say('quick.done')
      if (live.current) onDone({ items: ITEMS, firstTry: firstTries.current })
      return
    }
    setMood('idle')
    void show(nx)
  }

  const onHost = () => {
    if (!ready || locked.current) return
    idle.poke()
    void say(q.prompt)
  }

  return (
    <Shell station={def.station} mood={mood} progress={{ total: ITEMS, done: idx }} onExit={onExit} onHost={onHost}>
      {/* 波波的開心程度：答對越多，背後的光暈越大、越暖（不是分數，沒有數字） */}
      <motion.div
        className="quick-joy"
        aria-hidden="true"
        initial={false}
        animate={{ scale: 0.6 + joy * 0.22, opacity: joy ? 0.25 + joy * 0.1 : 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
      />
      {/* 換題：新題目蓋在舊的上面淡入，舊的等一下才淡掉（ui/Scenes.tsx 的 Swap）；一題接一題，換上來就能點 */}
      {ready && q && (
        <Swap id={view} arm={false}>
          <>
            {q.stimulus && (
              <div className="stimulus wide" onPointerDown={() => void say(q.prompt)}>
                <VisualView v={q.stimulus} />
              </div>
            )}
            <div className={`options${q.stimulus ? ' with-stim' : ''}`}>
              {q.options.map((n, i) => {
                const isAns = n === q.t.n
                const w = wrong.includes(n)
                const ok = done === n
                return (
                  <motion.button
                    key={n}
                    className={`tile${ok ? ' correct' : ''}${hint && isAns && !ok ? ' hint' : ''}`}
                    aria-label={`選項 ${i + 1}`}
                    initial={{ y: 20, scale: 0.94 }}
                    animate={w ? { x: [0, -12, 12, -7, 7, 0], opacity: 0.45, y: 0, scale: 0.94 } : ok ? { scale: [1, 1.16, 1.06], y: -8, opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
                    whileTap={{ scale: 0.94 }}
                    transition={{ type: 'spring', stiffness: 460, damping: 22, delay: w || ok ? 0 : 0.05 * i, opacity: FADE }}
                    onPointerDown={() => tap(n)}
                  >
                    <div className="tile-in">
                      <VisualView v={{ t: 'number', n }} />
                    </div>
                    {ok && <Sparkles key={view} count={8 + joy * 3} />}
                  </motion.button>
                )
              })}
            </div>
          </>
        </Swap>
      )}
    </Shell>
  )
}
