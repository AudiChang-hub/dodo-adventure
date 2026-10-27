import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { VisualView } from '../ui/Visual'
import { Sparkles } from '../ui/Sparkles'
import { game as gameDef, station as stationDef, ROUND_ITEMS, type ChoiceItem } from '../content/games'
import { level, reportLevel, markPlayed } from '../lib/adaptive'
import { logAttempt } from '../lib/record'
import { preload, say, sfx, stopSpeech } from '../lib/audio'
import { challengeKey, praiseKey, retryKey, wait } from './lines'
import type { Mood } from '../art/Dino'

type Mark = 'wrong' | 'correct' | 'hint'

export function ChoiceGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const host = stationDef(def.station).host
  const english = def.station === 'english'

  const [idx, setIdx] = useState(0)
  const [item, setItem] = useState<ChoiceItem | null>(null)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [mood, setMood] = useState<Mood>('idle')
  const [burst, setBurst] = useState(0)

  const live = useRef(true)
  const locked = useRef(true)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const shownAt = useRef(0)
  const hintUsed = useRef(false)
  const recent = useRef<string[]>([])
  const firstTries = useRef(0)
  const idle = useRef(0)
  const idleCount = useRef(0)
  const itemLevel = useRef(1)

  const armIdle = useCallback((it: ChoiceItem) => {
    clearTimeout(idle.current)
    idle.current = window.setTimeout(async () => {
      if (!live.current || locked.current) return
      idleCount.current++
      if (idleCount.current >= 2) {
        hintUsed.current = true
        setMarks((m) => ({ ...m, [it.answer]: 'hint' }))
        await say(`hint.${host}`, ...it.correction)
      } else await say(`idle.${host}`, ...it.prompt)
      // 最多提醒兩次（再說一次題目、給提示），之後就安靜等孩子，不要一直講
      if (idleCount.current < 2) armIdle(it)
    }, 9000)
  }, [host])

  const present = useCallback(
    async (i: number) => {
      const isLast = i === ROUND_ITEMS - 1
      const base = level(def.id)
      // 最後一題是挑戰題：比目前難度高一級
      const lv = isLast && base < def.maxLevel ? base + 1 : base
      itemLevel.current = lv
      const it = def.make!(lv, recent.current)
      recent.current = [it.itemId, ...recent.current].slice(0, 3)
      preload([...it.prompt, ...it.correction, ...(it.after ?? [])])
      taps.current = []
      hintUsed.current = false
      idleCount.current = 0
      setMarks({})
      setMood('idle')
      setItem(it)
      locked.current = false
      shownAt.current = performance.now()
      if (isLast && lv > base) await say(challengeKey(host), ...it.prompt)
      else await say(...it.prompt)
      if (live.current) armIdle(it)
    },
    [def, host, armIdle],
  )

  useEffect(() => {
    live.current = true
    markPlayed(def.id)
    ;(async () => {
      await say(def.intro)
      if (live.current) present(0)
    })()
    return () => {
      live.current = false
      clearTimeout(idle.current)
      stopSpeech()
    }
  }, [def, present])

  const tap = async (optId: string) => {
    if (!item || locked.current || marks[optId] === 'wrong') return
    clearTimeout(idle.current)
    taps.current.push({ pick: optId, ms: Math.round(performance.now() - shownAt.current) })

    if (optId !== item.answer) {
      sfx.gentle()
      setMarks((m) => ({ ...m, [optId]: 'wrong' }))
      const wrongs = taps.current.filter((t) => t.pick !== item.answer).length
      if (wrongs >= 2) {
        hintUsed.current = true
        setMarks((m) => ({ ...m, [optId]: 'wrong', [item.answer]: 'hint' }))
        await say(`hint.${host}`, ...item.correction)
      } else await say(retryKey(host))
      if (live.current) armIdle(item)
      return
    }

    locked.current = true
    const firstTry = taps.current.length === 1 && !hintUsed.current
    if (firstTry) firstTries.current++
    sfx.correct()
    setMarks((m) => ({ ...m, [optId]: 'correct' }))
    setMood('cheer')
    setBurst((b) => b + 1)
    void logAttempt({
      station: def.station,
      game: def.id,
      itemId: item.itemId,
      skill: item.skill,
      level: itemLevel.current,
      options: item.options.map((o) => o.id),
      answer: item.answer,
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: hintUsed.current,
    })
    const change = reportLevel(def.id, firstTry, def.maxLevel)
    const lines = [praiseKey(host, english), ...(item.after && Math.random() < 0.6 ? item.after : [])]
    if (change === 'up') lines.push('levelup')
    await say(...lines)
    await wait(350)
    if (!live.current) return
    const next = idx + 1
    if (next >= ROUND_ITEMS) return onDone({ items: ROUND_ITEMS, firstTry: firstTries.current })
    setIdx(next)
    present(next)
  }

  const wide = item?.options.some((o) => o.v.t === 'group')
  const fit = Math.max(0, ...(item?.options ?? []).map((o) => (o.v.t === 'group' ? o.v.count : 0)))
  return (
    <Shell station={def.station} mood={mood} progress={{ total: ROUND_ITEMS, done: idx }} onExit={onExit} onHost={() => item && say(...item.prompt)}>
      <AnimatePresence mode="wait">
        {item && (
          <motion.div key={idx} style={{ position: 'absolute', inset: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
            {item.stimulus && (
              <motion.div
                className={`stimulus${item.stimulus.t === 'group' ? ' wide' : ''}`}
                initial={{ y: -30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                onPointerDown={() => say(...item.prompt)}
              >
                <VisualView v={item.stimulus} />
              </motion.div>
            )}
            <div className={`options${item.stimulus ? ' with-stim' : ''}`}>
              {item.options.map((o, i) => (
                <motion.button
                  key={o.id}
                  className={`tile${wide ? ' wide' : ''}${marks[o.id] === 'correct' ? ' correct' : ''}${marks[o.id] === 'hint' ? ' hint' : ''}`}
                  aria-label={`選項 ${i + 1}`}
                  initial={{ y: 60, opacity: 0, scale: 0.85 }}
                  animate={
                    marks[o.id] === 'wrong'
                      ? { x: [0, -14, 14, -9, 9, 0], opacity: 0.45, y: 0, scale: 0.94 }
                      : marks[o.id] === 'correct'
                        ? { scale: [1, 1.14, 1.06], y: -8, opacity: 1 }
                        : { y: 0, opacity: 1, scale: 1 }
                  }
                  whileTap={{ scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 20, delay: marks[o.id] ? 0 : 0.08 * i }}
                  onPointerDown={() => tap(o.id)}
                >
                  <div className="tile-in">
                    <VisualView v={o.v} fit={fit} />
                  </div>
                  {marks[o.id] === 'correct' && <Sparkles key={burst} />}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  )
}
