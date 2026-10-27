import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Hand } from '../Demo'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef, station as stationDef, ROUND_ITEMS, PHONICS_MAKERS, type PhonicsItem, type PhonicsOption } from '../../content/games'
import { level, reportLevel, markPlayed, plays, isNew, withTargetFilter } from '../../lib/adaptive'
import { logAttempt, logTeach } from '../../lib/record'
import type { Phase } from '../../lib/db'
import { preload, say, sfx, stopSpeech } from '../../lib/audio'
import { shuffle } from '../../lib/random'
import { challengeKey, praiseKey, retryKey, wait } from '../lines'
import { useIdle } from '../idle'
import type { Mood } from '../../art/Dino'
import { PhonicsIntro, introLines } from './PhonicsIntro'
import { LetterPair, Pic, WordLabel } from './parts'
import { useSubtitleTint } from './subtitleTint'
import { migrateLegacy } from './migrate'
import './phonics.css'

type Mark = 'wrong' | 'correct' | 'hint'

/** 一局最多教幾個新的音，其餘都是複習（PRD §5.8） */
const MAX_TEACH = 2

/** 一起練之後的自己答：重新洗牌，而且答案不要留在同一格 */
function reshuffle(it: PhonicsItem): PhonicsItem {
  if (it.options.length < 2) return it
  const at = it.options.findIndex((o) => o.id === it.answer)
  let opts = it.options
  for (let k = 0; k < 12; k++) {
    opts = shuffle(it.options)
    if (opts.findIndex((o) => o.id === it.answer) !== at) break
  }
  // 點名的順序跟著畫面上的順序
  return { ...it, options: opts, names: it.names.length ? opts.map((o) => o.id) : [] }
}

/**
 * 自然發音的三個遊戲共用的引擎（開頭音找圖、開頭一樣、聽音找字母）。
 * 流程和選擇題引擎（ChoiceGame）一樣是「先教 → 一起練 → 自己答」：
 * - 新的音（phonics:b 從沒自己答過）：完整的學習循環（PhonicsIntro）→ 一起練（答案發光、點錯不扣分）→ 自己答。
 * - 自己答時同一題錯兩次：重播精簡的學習循環，再一起練一次。
 * - 閒置規則照 idle.ts：15 秒再唸一次題目（含點名），再 15 秒答案慢慢發光，之後安靜。
 * 不一樣的地方：題目唸完會一張一張點名圖片（Bus. Fish. Moon.），因為要判斷開頭音，孩子得先知道圖叫什麼；
 * 答對後那張圖下面出現單字、開頭字母上色，再念一次「Ball! buh, buh, ball!」。
 * 熟練度與難度只採計「自己答」。
 */
export function PhonicsGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const host = stationDef(def.station).host
  const make = PHONICS_MAKERS[def.id]

  const [idx, setIdx] = useState(0)
  const [item, setItem] = useState<PhonicsItem | null>(null)
  const [phase, setPhase] = useState<Phase>('quiz')
  const [card, setCard] = useState<{ it: PhonicsItem; short: boolean; n: number } | null>(null)
  const [view, setView] = useState(0)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [naming, setNaming] = useState<string | null>(null)
  const [mood, setMood] = useState<Mood>('idle')
  const [burst, setBurst] = useState(0)

  const live = useRef(true)
  const locked = useRef(true)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const shownAt = useRef(0)
  const hintUsed = useRef(false)
  const recent = useRef<string[]>([])
  const firstTries = useRef(0)
  const idle = useIdle()
  const itemLevel = useRef(1)
  const idxRef = useRef(0)
  const itemRef = useRef<PhonicsItem | null>(null)
  const phaseRef = useRef<Phase>('quiz')
  const stepRef = useRef(0)
  /** 點名到一半孩子就點了：停止點名 */
  const nameRef = useRef(0)
  const taught = useRef(0)
  const firstPlay = useRef(plays(def.id) === 0)
  const resolver = useRef<((ms: number) => void) | null>(null)

  useSubtitleTint()

  const waitStep = () => new Promise<number>((res) => (resolver.current = res))
  const release = (ms = 0) => {
    const r = resolver.current
    resolver.current = null
    r?.(ms)
  }

  const base = (it: PhonicsItem) => ({
    station: def.station,
    game: def.id,
    itemId: it.itemId,
    skill: it.skill,
    level: itemLevel.current,
    options: it.options.map((o) => o.id),
    answer: it.answer,
  })

  /** 唸題目，再一張一張點名圖片（點名中孩子點了就停） */
  const ask = async (it: PhonicsItem, lead: string[] = [], tail: string[] = []) => {
    const my = ++nameRef.current
    await say(...lead, ...it.prompt)
    for (const id of it.names) {
      if (!live.current || nameRef.current !== my) return
      setNaming(id)
      await say(`ph.word.${id}`)
      await wait(90)
    }
    if (nameRef.current === my) setNaming(null)
    if (tail.length && live.current && nameRef.current === my) await say(...tail)
  }
  const stopNaming = () => {
    nameRef.current++
    setNaming(null)
  }

  // ── 我示範：學習循環 ───────────────────────────────────────
  const teach = async (it: PhonicsItem, short: boolean) => {
    stepRef.current++
    idle.stop()
    locked.current = true
    setMood('happy')
    setCard({ it, short, n: stepRef.current })
    const ms = await waitStep()
    if (!live.current) return
    setCard(null)
    void logTeach({ station: def.station, game: def.id, itemId: it.unit.letter, skill: it.skill, level: itemLevel.current, ms, retaught: short })
    await wait(260)
  }

  // ── 一起練：答案發光，點錯也沒關係 ─────────────────────────
  const guided = async (it: PhonicsItem) => {
    const my = ++stepRef.current
    phaseRef.current = 'guided'
    itemRef.current = it
    taps.current = []
    setPhase('guided')
    setItem(it)
    setMarks({})
    setMood('happy')
    setView((v) => v + 1)
    shownAt.current = performance.now()
    locked.current = false
    const done = waitStep()
    void (async () => {
      await ask(it, [], [`teach.here.${host}`])
      if (live.current && stepRef.current === my) idle.start({ repeat: () => void ask(it, [], [`teach.here.${host}`]), hint: () => {} })
    })()
    await done
  }

  // ── 自己答 ─────────────────────────────────────────────────
  const quiz = async (it: PhonicsItem, afterGuide: boolean) => {
    const my = ++stepRef.current
    const isLast = idxRef.current === ROUND_ITEMS - 1
    idle.stop()
    phaseRef.current = 'quiz'
    itemRef.current = it
    taps.current = []
    hintUsed.current = false
    setPhase('quiz')
    setItem(it)
    setMarks({})
    setMood('idle')
    setView((v) => v + 1)
    locked.current = false
    shownAt.current = performance.now()
    const challenge = isLast && itemLevel.current > level(def.id)
    await ask(it, afterGuide ? [`teach.turn.${host}`] : challenge ? [challengeKey(host)] : [])
    if (live.current && stepRef.current === my)
      idle.start({
        repeat: () => void ask(it),
        hint: () => {
          hintUsed.current = true
          setMarks((m) => ({ ...m, [it.answer]: 'hint' }))
        },
      })
  }

  const present = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    const isLast = i === ROUND_ITEMS - 1
    const lvBase = level(def.id)
    const lv = isLast && lvBase < def.maxLevel ? lvBase + 1 : lvBase
    itemLevel.current = lv
    const gen = () => make(lv, recent.current)
    let it = gen()
    if (taught.current >= MAX_TEACH) {
      const known = (k: string) => !isNew(k)
      for (let k = 0; k < 10 && isNew(it.skill); k++) it = withTargetFilter(known, gen)
    }
    // 同時開放的音只有三、四個：只避開上一題的音，不然出題順序會變成固定輪流
    recent.current = [it.itemId]
    preload([...it.prompt, ...it.names.map((n) => `ph.word.${n}`), ...it.after, ...introLines(it.unit), `teach.here.${host}`, `teach.turn.${host}`])

    const fresh = isNew(it.skill)
    const walkThrough = !fresh && firstPlay.current && i === 0
    if (fresh) {
      taught.current++
      await teach(it, false)
      if (!live.current) return
    }
    if (fresh || walkThrough) {
      await guided(it)
      if (!live.current) return
      return quiz(reshuffle(it), true)
    }
    return quiz(it, false)
  }

  const next = async () => {
    await wait(350)
    if (!live.current) return
    const n = idxRef.current + 1
    if (n >= ROUND_ITEMS) return onDone({ items: ROUND_ITEMS, firstTry: firstTries.current })
    present(n)
  }

  useEffect(() => {
    live.current = true
    const boot = window.setTimeout(async () => {
      await migrateLegacy()
      if (!live.current) return
      markPlayed(def.id)
      await say(def.intro)
      if (live.current) present(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tapGuided = async (it: PhonicsItem, optId: string) => {
    taps.current.push({ pick: optId, ms: Math.round(performance.now() - shownAt.current) })
    if (optId !== it.answer) {
      sfx.gentle()
      stopNaming()
      void say(`teach.here.${host}`)
      return
    }
    locked.current = true
    stepRef.current++
    idle.stop()
    stopNaming()
    sfx.correct()
    setMarks({ [optId]: 'correct' })
    setMood('cheer')
    setBurst((b) => b + 1)
    void logAttempt({
      ...base(it),
      phase: 'guided',
      taps: taps.current,
      firstTryCorrect: taps.current.length === 1,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: true,
    })
    await say(praiseKey(host, true), ...it.after)
    await wait(250)
    if (live.current) release()
  }

  const reteach = async (it: PhonicsItem) => {
    locked.current = true
    stepRef.current++
    idle.stop()
    stopNaming()
    hintUsed.current = true
    void logAttempt({
      ...base(it),
      phase: 'quiz',
      taps: taps.current,
      firstTryCorrect: false,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: true,
      metrics: { retaught: 1 },
    })
    reportLevel(def.id, false, def.maxLevel)
    await say(`teach.again.${host}`)
    if (!live.current) return
    await teach(it, true)
    if (!live.current) return
    await guided(reshuffle(it))
    if (live.current) next()
  }

  const tap = async (optId: string) => {
    const it = itemRef.current
    if (!it || locked.current) return
    idle.poke()
    if (marks[optId] === 'wrong') return
    if (phaseRef.current === 'guided') return tapGuided(it, optId)
    taps.current.push({ pick: optId, ms: Math.round(performance.now() - shownAt.current) })

    if (optId !== it.answer) {
      sfx.gentle()
      stopNaming()
      setMarks((m) => ({ ...m, [optId]: 'wrong' }))
      const wrongs = taps.current.filter((t) => t.pick !== it.answer).length
      if (wrongs >= 2) return reteach(it)
      await say(retryKey(host))
      idle.poke()
      return
    }

    locked.current = true
    stepRef.current++
    idle.stop()
    stopNaming()
    const firstTry = taps.current.length === 1 && !hintUsed.current
    if (firstTry) firstTries.current++
    sfx.correct()
    setMarks((m) => ({ ...m, [optId]: 'correct' }))
    setMood('cheer')
    setBurst((b) => b + 1)
    void logAttempt({
      ...base(it),
      phase: 'quiz',
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: hintUsed.current,
    })
    const change = reportLevel(def.id, firstTry, def.maxLevel)
    // 答對後一定配上這個音（Ball! buh, buh, ball!）：聲音和字、字母一起出現
    const lines = [praiseKey(host, true), ...it.after]
    if (change === 'up') lines.push('levelup')
    await say(...lines)
    next()
  }

  const onHost = () => {
    if (card || !item) return
    idle.poke()
    void ask(item, [], phase === 'guided' ? [`teach.here.${host}`] : [])
  }

  const guide = phase === 'guided'
  return (
    <Shell station={def.station} mood={mood} progress={{ total: ROUND_ITEMS, done: idx }} onExit={onExit} onHost={onHost}>
      <AnimatePresence mode="wait">
        {card ? (
          <PhonicsIntro key={`teach-${card.n}`} unit={card.it.unit} short={card.short} onDone={release} />
        ) : (
          item && (
            <motion.div key={`q-${view}`} style={{ position: 'absolute', inset: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
              {item.stimulus && (
                <motion.div
                  className="stimulus ph-stim"
                  initial={{ y: -30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  onPointerDown={() => {
                    idle.poke()
                    void ask(item)
                  }}
                >
                  <Pic icon={item.stimulus.icon} />
                  <WordLabel w={item.stimulus.w} tint />
                </motion.div>
              )}
              <div className={`options${item.stimulus ? ' with-stim' : ''}`}>
                {item.options.map((o, i) => (
                  <OptionTile
                    key={o.id}
                    o={o}
                    i={i}
                    mark={marks[o.id]}
                    isAns={o.id === item.answer}
                    guide={guide}
                    named={naming === o.id}
                    burst={burst}
                    onTap={() => tap(o.id)}
                  />
                ))}
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </Shell>
  )
}

function OptionTile({ o, i, mark, isAns, guide, named, burst, onTap }: { o: PhonicsOption; i: number; mark?: Mark; isAns: boolean; guide: boolean; named: boolean; burst: number; onTap: () => void }) {
  const glow = guide && isAns && mark !== 'correct'
  const dim = guide && !isAns
  const reveal = mark === 'correct' && !!o.word
  return (
    <motion.button
      className={`tile ph-tile${o.letter ? ' is-letter' : ''}${mark === 'correct' ? ' correct' : ''}${mark === 'hint' ? ' hint' : ''}${glow ? ' guide' : ''}${dim ? ' dim' : ''}${named ? ' named' : ''}`}
      aria-label={`選項 ${i + 1}`}
      initial={{ y: 60, opacity: 0, scale: 0.85 }}
      animate={
        mark === 'wrong'
          ? { x: [0, -14, 14, -9, 9, 0], opacity: 0.45, y: 0, scale: 0.94 }
          : mark === 'correct'
            ? { scale: [1, 1.14, 1.06], y: -8, opacity: 1 }
            : dim
              ? { y: 0, opacity: 0.3, scale: 0.88 }
              : named
                ? { y: -10, opacity: 1, scale: 1.05 }
                : glow
                  ? { y: 0, opacity: 1, scale: 1.04 }
                  : { y: 0, opacity: 1, scale: 1 }
      }
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 380, damping: 20, delay: mark || named ? 0 : 0.08 * i }}
      onPointerDown={onTap}
    >
      <div className={`tile-in${reveal ? ' with-label' : ''}`}>
        {o.word && <Pic icon={o.word.icon} />}
        {o.letter && <LetterPair l={o.letter} />}
        {o.cue && (
          <div className="ph-cue" aria-hidden="true">
            <Pic icon={o.cue.icon} />
          </div>
        )}
      </div>
      {reveal && (
        <motion.div className="ph-tile-label" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
          <WordLabel w={o.word!.w} tint />
        </motion.div>
      )}
      {glow && <Hand x={74} y={72} size="12cqmin" beckon />}
      {mark === 'correct' && <Sparkles key={burst} />}
    </motion.button>
  )
}
