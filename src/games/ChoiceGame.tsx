import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { TeachCard } from './Teach'
import { Hand } from './Demo'
import { VisualView } from '../ui/Visual'
import { Sparkles } from '../ui/Sparkles'
import { game as gameDef, station as stationDef, ROUND_ITEMS, type ChoiceItem, type TeachSpec } from '../content/games'
import { level, reportLevel, markPlayed, plays, isNew, withTargetFilter } from '../lib/adaptive'
import { logAttempt, logTeach } from '../lib/record'
import type { Phase } from '../lib/db'
import { preload, say, sfx, stopSpeech } from '../lib/audio'
import { shuffle } from '../lib/random'
import { challengeKey, praiseKey, retryKey, wait } from './lines'
import { useIdle } from './idle'
import type { Mood } from '../art/Dino'

type Mark = 'wrong' | 'correct' | 'hint'

/** 一局最多教幾個新內容，其餘都是複習（PRD §5.8） */
const MAX_TEACH = 2

/** 一起練之後的自己答：重新洗牌，而且答案不要留在同一格（不然只是記位置） */
function reshuffle(it: ChoiceItem): ChoiceItem {
  if (it.options.length < 2) return it
  const at = it.options.findIndex((o) => o.id === it.answer)
  let opts = it.options
  for (let k = 0; k < 12; k++) {
    opts = shuffle(it.options)
    if (opts.findIndex((o) => o.id === it.answer) !== at) break
  }
  return { ...it, options: opts }
}

/**
 * 選擇題引擎：每一題都可能是「先教 → 一起練 → 自己答」。
 * - 新內容（從沒自己答過）：教學卡 → 一起練（答案發光、其他變淡、點錯不扣分）→ 自己答。
 * - 自己答時同一題錯兩次：重播精簡的教學卡，再一起練一次。
 * - 已經學過的：直接自己答（複習）。
 * 熟練度與難度只採計「自己答」。
 */
export function ChoiceGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const host = stationDef(def.station).host
  const english = def.station === 'english'

  const [idx, setIdx] = useState(0)
  const [item, setItem] = useState<ChoiceItem | null>(null)
  const [phase, setPhase] = useState<Phase>('quiz')
  const [card, setCard] = useState<{ spec: TeachSpec; short: boolean; n: number } | null>(null)
  const [view, setView] = useState(0)
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
  const idle = useIdle()
  const itemLevel = useRef(1)
  const idxRef = useRef(0)
  const itemRef = useRef<ChoiceItem | null>(null)
  const phaseRef = useRef<Phase>('quiz')
  /** 每換一個步驟就加一，舊步驟的計時器看到不一樣就不動作 */
  const stepRef = useRef(0)
  const taught = useRef(0)
  // 必須在 markPlayed 之前讀：第一次玩的遊戲，第一題一定先一起練一次
  const firstPlay = useRef(plays(def.id) === 0)
  const resolver = useRef<((ms: number) => void) | null>(null)

  const waitStep = () => new Promise<number>((res) => (resolver.current = res))
  const release = (ms = 0) => {
    const r = resolver.current
    resolver.current = null
    r?.(ms)
  }

  const base = (it: ChoiceItem) => ({
    station: def.station,
    game: def.id,
    itemId: it.itemId,
    skill: it.skill,
    level: itemLevel.current,
    options: it.options.map((o) => o.id),
    answer: it.answer,
  })

  // ── 我示範：教學卡 ─────────────────────────────────────────
  const teach = async (it: ChoiceItem, short: boolean) => {
    stepRef.current++
    idle.stop()
    locked.current = true
    setMood('happy')
    setCard({ spec: it.teach!, short, n: stepRef.current })
    const ms = await waitStep()
    if (!live.current) return
    setCard(null)
    void logTeach({ station: def.station, game: def.id, itemId: it.itemId, skill: it.skill, level: itemLevel.current, ms, retaught: short })
    await wait(260)
  }

  // ── 一起練：答案發光，點錯也沒關係 ─────────────────────────
  const guided = async (it: ChoiceItem) => {
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
      await say(...it.prompt, `teach.here.${host}`)
      // 一起練的答案本來就在發光，所以第二段提醒什麼都不用做
      if (live.current && stepRef.current === my) idle.start({ repeat: () => void say(...it.prompt, `teach.here.${host}`), hint: () => {} })
    })()
    await done
  }

  // ── 自己答 ─────────────────────────────────────────────────
  const quiz = async (it: ChoiceItem, afterGuide: boolean) => {
    const my = ++stepRef.current
    const i = idxRef.current
    const isLast = i === ROUND_ITEMS - 1
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
    if (afterGuide) await say(`teach.turn.${host}`, ...it.prompt)
    else if (challenge) await say(challengeKey(host), ...it.prompt)
    else await say(...it.prompt)
    if (live.current && stepRef.current === my)
      idle.start({
        repeat: () => void say(...it.prompt),
        // 答案慢慢發光，不說話；看了提示就不算第一次答對
        hint: () => {
          hintUsed.current = true
          setMarks((m) => ({ ...m, [it.answer]: 'hint' }))
        },
      })
  }

  /** 出下一題：先決定這題要不要教 */
  const present = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    const isLast = i === ROUND_ITEMS - 1
    const lvBase = level(def.id)
    // 最後一題是挑戰題：比目前難度高一級
    const lv = isLast && lvBase < def.maxLevel ? lvBase + 1 : lvBase
    itemLevel.current = lv
    const make = () => def.make!(lv, recent.current)
    let it = make()
    if (taught.current >= MAX_TEACH) {
      // 這局已經教滿了：其餘出複習題，不考沒教過的
      const known = (k: string) => !isNew(k)
      for (let k = 0; k < 10 && isNew(it.skill); k++) it = withTargetFilter(known, make)
    }
    recent.current = [it.itemId, ...recent.current].slice(0, 3)
    preload([...it.prompt, ...it.correction, ...(it.after ?? []), ...(it.teach?.lines ?? []), `teach.here.${host}`, `teach.turn.${host}`])

    // 真的找不到複習題時（例如比多少隨機出到沒學過的「少」），寧可多教一個，也不考沒教過的
    const fresh = !!it.teach && isNew(it.skill)
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
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
    const boot = window.setTimeout(async () => {
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

  const tapGuided = async (it: ChoiceItem, optId: string) => {
    taps.current.push({ pick: optId, ms: Math.round(performance.now() - shownAt.current) })
    if (optId !== it.answer) {
      // 一起練不會答錯：不搖、不扣分，再指一次（這是點錯的回饋，不算閒置提醒）
      sfx.gentle()
      void say(`teach.here.${host}`)
      return
    }
    locked.current = true
    stepRef.current++
    idle.stop()
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
    await say(praiseKey(host, english))
    await wait(250)
    if (live.current) release()
  }

  /** 自己答錯兩次：不只是提示，而是重新教一次，再一起練 */
  const reteach = async (it: ChoiceItem) => {
    locked.current = true
    stepRef.current++
    idle.stop()
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
    // 任何點擊都重新計時（點到已經答錯的也算有在操作）
    idle.poke()
    if (marks[optId] === 'wrong') return
    if (phaseRef.current === 'guided') return tapGuided(it, optId)
    taps.current.push({ pick: optId, ms: Math.round(performance.now() - shownAt.current) })

    if (optId !== it.answer) {
      sfx.gentle()
      setMarks((m) => ({ ...m, [optId]: 'wrong' }))
      const wrongs = taps.current.filter((t) => t.pick !== it.answer).length
      if (wrongs >= 2 && it.teach) return reteach(it)
      if (wrongs >= 2) {
        hintUsed.current = true
        setMarks((m) => ({ ...m, [optId]: 'wrong', [it.answer]: 'hint' }))
        await say(`hint.${host}`, ...it.correction)
      } else await say(retryKey(host))
      // 「再試一次」說完才重新計時，不算在閒置提醒裡
      idle.poke()
      return
    }

    locked.current = true
    stepRef.current++
    idle.stop()
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
    const lines = [praiseKey(host, english), ...(it.after && Math.random() < 0.6 ? it.after : [])]
    if (change === 'up') lines.push('levelup')
    await say(...lines)
    next()
  }

  // 孩子主動點恐龍、點題目圖：是孩子要聽的，不是閒置提醒；也算有操作
  const onHost = () => {
    if (card || !item) return
    idle.poke()
    if (phase === 'guided') void say(...item.prompt, `teach.here.${host}`)
    else void say(...item.prompt)
  }

  const guide = phase === 'guided'
  const wide = item?.options.some((o) => o.v.t === 'group')
  const fit = Math.max(0, ...(item?.options ?? []).map((o) => (o.v.t === 'group' ? o.v.count : 0)))
  return (
    <Shell station={def.station} mood={mood} progress={{ total: ROUND_ITEMS, done: idx }} onExit={onExit} onHost={onHost}>
      <AnimatePresence mode="wait">
        {card ? (
          <TeachCard key={`teach-${card.n}`} spec={card.spec} short={card.short} onDone={release} />
        ) : (
          item && (
            <motion.div key={`q-${view}`} style={{ position: 'absolute', inset: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
              {item.stimulus && (
                <motion.div
                  className={`stimulus${item.stimulus.t === 'group' ? ' wide' : ''}`}
                  initial={{ y: -30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  onPointerDown={() => {
                    idle.poke()
                    void say(...item.prompt)
                  }}
                >
                  <VisualView v={item.stimulus} />
                </motion.div>
              )}
              <div className={`options${item.stimulus ? ' with-stim' : ''}`}>
                {item.options.map((o, i) => {
                  const m = marks[o.id]
                  const isAns = o.id === item.answer
                  const glow = guide && isAns && m !== 'correct'
                  const dim = guide && !isAns
                  return (
                    <motion.button
                      key={o.id}
                      className={`tile${wide ? ' wide' : ''}${m === 'correct' ? ' correct' : ''}${m === 'hint' ? ' hint' : ''}${glow ? ' guide' : ''}${dim ? ' dim' : ''}`}
                      aria-label={`選項 ${i + 1}`}
                      initial={{ y: 60, opacity: 0, scale: 0.85 }}
                      animate={
                        m === 'wrong'
                          ? { x: [0, -14, 14, -9, 9, 0], opacity: 0.45, y: 0, scale: 0.94 }
                          : m === 'correct'
                            ? { scale: [1, 1.14, 1.06], y: -8, opacity: 1 }
                            : dim
                              ? { y: 0, opacity: 0.3, scale: 0.88 }
                              : glow
                                ? { y: 0, opacity: 1, scale: 1.04 }
                                : { y: 0, opacity: 1, scale: 1 }
                      }
                      whileTap={{ scale: 0.94 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 20, delay: m ? 0 : 0.08 * i }}
                      onPointerDown={() => tap(o.id)}
                    >
                      <div className="tile-in">
                        <VisualView v={o.v} fit={fit} />
                      </div>
                      {glow && <Hand x={74} y={72} size="12cqmin" beckon />}
                      {m === 'correct' && <Sparkles key={burst} />}
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </Shell>
  )
}
