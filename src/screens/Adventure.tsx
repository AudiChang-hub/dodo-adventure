import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ride } from '../art/Ride'
import { Egg } from '../art/Egg'
import { Emoji } from '../art/Emoji'
import { Scenery } from '../ui/Scenery'
import { Sparkles } from '../ui/Sparkles'
import { PlayGame } from '../games/PlayGame'
import { PlayingGame } from '../games/Shell'
import { DadTurn } from '../games/DadTurn'
import { station as stationDef } from '../content/games'
import { STORY_EGG_COUNT } from '../content/lines-friends'
import { hasLine } from '../content/lines'
import { go } from '../lib/nav'
import { say, sfx, stopSpeech } from '../lib/audio'
import { getKV, setKV, today } from '../lib/db'
import { todayPlan, savePlan, planDone, hatchFriend, type Plan } from '../lib/plan'
import { noteActivity, isBreakDue, holdBedtime, bedtimeIfDue } from '../lib/session'
import { EyeBreak } from '../ui/EyeBreak'
import { wait } from '../games/lines'
import { RouteMap, RouteStrip } from './Route'

type Phase = 'route' | 'travel' | 'play' | 'coplay' | 'egg' | 'hatch' | 'finish' | 'rest'

/** 開局的路線至少展示這麼久（毫秒），讓孩子看得到「今天有 4 站」 */
const ROUTE_MS = 3000
/** 爸爸回合：一天最多幾次、每站結束後出現的機率（第一站是暖身，不出現） */
const COPLAY_PER_DAY = 1
const COPLAY_CHANCE = 0.5

/**
 * 今日冒險：今天的路線 → 轉場 → 遊戲 →（偶爾）換爸爸問 → 蛋裂開一點 → 下一站…最後孵出新朋友。
 * 每日時間到了不在題目中途結束，而是在兩站之間（蛋裂開之後）才去睡覺。
 */
export function Adventure() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [phase, setPhase] = useState<Phase>('route')
  const [taps, setTaps] = useState(0)
  const [friend, setFriend] = useState<string | null>(null)
  const live = useRef(true)
  /** 爸爸回合是哪一站之後（站的 index），結束後接回蛋裂開 */
  const [coplayAt, setCoplayAt] = useState(-1)

  const cur = plan?.items.findIndex((i) => !i.done) ?? -1
  const item = plan && cur >= 0 ? plan.items[cur] : null
  const doneCount = plan?.items.filter((i) => i.done).length ?? 0

  useEffect(() => {
    live.current = true
    todayPlan().then((p) => {
      setPlan(p)
      if (planDone(p)) setPhase(p.hatched ? 'finish' : 'hatch')
    })
    return () => {
      live.current = false
      stopSpeech()
    }
  }, [])

  // 冒險在畫面上就先擋住「時間到」：由冒險自己在兩站之間檢查。
  // 收尾畫面（finish）說完那句話才放開，之後一般的計時就會送去睡覺
  useEffect(() => {
    const release = holdBedtime()
    if (phase !== 'finish') return release
    let cancelled = false
    void say('adv.done').then(() => !cancelled && release())
    return () => {
      cancelled = true
      release()
    }
  }, [phase])

  // 開局：先看今天的路線（約 3 秒），說「今天有四站」，再出發
  useEffect(() => {
    if (phase !== 'route' || !plan || planDone(plan)) return
    let cancelled = false
    ;(async () => {
      const t = performance.now()
      await wait(500)
      if (cancelled) return
      const n = plan.items.length
      const k = `route.stops.${n}`
      await say(...(doneCount === 0 && hasLine(k) ? [k] : []), 'adv.go')
      await wait(Math.max(0, ROUTE_MS - (performance.now() - t)))
      if (!cancelled && live.current) setPhase('travel')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, plan])

  // 轉場：主持的恐龍開車進場、報站名，說完自動開始
  useEffect(() => {
    if (phase !== 'travel' || !item) return
    let cancelled = false
    ;(async () => {
      sfx.whoosh()
      await wait(700)
      if (cancelled) return
      await say(`station.${item.station}`)
      await wait(500)
      if (!cancelled && live.current) setPhase('play')
    })()
    return () => {
      cancelled = true
    }
  }, [phase, item])

  useEffect(() => {
    if (phase === 'hatch') void say('egg.ready')
  }, [phase])

  /** 這一站之後要不要換爸爸問：第一站是暖身，之後一天最多一次、偶爾出現 */
  const wantCoplay = async (index: number) => {
    if (index === 0) return false
    const key = `coplay:${today()}`
    const n = await getKV<number>(key, 0)
    if (n >= COPLAY_PER_DAY || Math.random() >= COPLAY_CHANCE) return false
    await setKV(key, n + 1)
    return true
  }

  const onGameDone = async () => {
    if (!plan || !item) return
    const index = cur
    const next = { ...plan, items: plan.items.map((it, i) => (i === index ? { ...it, done: true } : it)) }
    noteActivity(item.game, item.station, true)
    await savePlan(next)
    if (await wantCoplay(index)) {
      setCoplayAt(index)
      setPlan(next)
      setPhase('coplay')
      return
    }
    setPlan(next)
    void afterGame(next)
  }

  /** 一站結束：蛋在車上晃一下、多一道裂痕（旅程的劇情，不是付款），再決定下一步 */
  const afterGame = async (next: Plan) => {
    setPhase('egg')
    await wait(500)
    sfx.crack()
    const done = next.items.filter((i) => i.done).length
    await say(`story.egg.${(done - 1 + STORY_EGG_COUNT) % STORY_EGG_COUNT}`)
    await wait(500)
    if (!live.current) return
    // 全部走完就孵蛋（故事的結尾一定讓它說完）；時間到了就在兩站之間去睡覺
    if (planDone(next)) return setPhase('hatch')
    if (bedtimeIfDue()) return
    setPhase(isBreakDue() ? 'rest' : 'travel')
  }

  const tapEgg = async () => {
    if (!plan || friend) return
    sfx.crack()
    const n = taps + 1
    setTaps(n)
    if (n < 3) return
    const id = await hatchFriend()
    const next = { ...plan, hatched: id }
    await savePlan(next)
    setPlan(next)
    setFriend(id)
    sfx.hatch()
    // 新朋友一出來就自我介紹：I'm a fox!
    await say('egg.hatch', ...[`friend.name.${id}`, `friend.sound.${id}`].filter(hasLine))
    await wait(900)
    if (live.current) setPhase('finish')
  }

  const exit = () => {
    if (item && phase === 'play') noteActivity(item.game, item.station, false)
    go({ name: 'home' })
  }

  if (!plan) return <div className="screen" />

  if (phase === 'rest')
    return (
      <EyeBreak
        onDone={() => {
          if (!bedtimeIfDue()) setPhase('travel')
        }}
      />
    )

  if (phase === 'play' && item)
    return (
      <PlayingGame.Provider value={item.game}>
        <PlayGame gameId={item.game} onDone={onGameDone} onExit={exit} />
      </PlayingGame.Provider>
    )

  if (phase === 'coplay' && coplayAt >= 0) {
    const it = plan.items[coplayAt]
    return <DadTurn gameId={it.game} station={it.station} onDone={() => void afterGame(plan)} onExit={() => go({ name: 'home' })} />
  }

  const st = item ? stationDef(item.station) : null
  return (
    <div className="screen travel" style={{ background: phase === 'route' ? 'var(--paper)' : (st?.tint ?? 'var(--paper)'), transition: 'background .6s' } as CSSProperties}>
      {/* 路線圖自己就是一條路，不再疊首頁的地面 */}
      {phase !== 'route' && <Scenery station="home" />}
      <AnimatePresence mode="wait">
        {phase === 'route' && (
          <motion.div key="route" className="screen" exit={{ opacity: 0, transition: { duration: 0.3 } }}>
            <RouteMap plan={plan} />
          </motion.div>
        )}

        {phase === 'travel' && st && item && (
          <motion.div key={`t${cur}`} className="screen" exit={{ opacity: 0 }}>
            <RouteStrip plan={plan} />
            <motion.div className="travel-badge" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.3 }}>
              <Emoji name={st.icon} />
            </motion.div>
            <motion.div className="travel-name" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              {st.name}
            </motion.div>
            <motion.div style={{ position: 'absolute', bottom: '8vh', left: '50%', width: '40vmin', marginLeft: '-20vmin' }} initial={{ x: '-80vw' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 45, damping: 12 }}>
              <Ride who={st.host} width="100%" moving mood="happy" />
            </motion.div>
          </motion.div>
        )}

        {(phase === 'egg' || phase === 'hatch') && (
          <motion.div key="egg" className="screen" style={{ display: 'grid', placeItems: 'center' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{ position: 'relative' }} onPointerDown={phase === 'hatch' ? tapEgg : undefined}>
              <AnimatePresence>
                {!friend && (
                  <motion.div key="e" exit={{ scale: 1.6, opacity: 0, transition: { duration: 0.35 } }} animate={phase === 'hatch' ? { scale: [1, 1.04, 1], transition: { repeat: Infinity, duration: 1.2 } } : {}}>
                    <Egg cracks={Math.min(5, doneCount + taps)} wobble={phase === 'egg' || taps > 0} size="34vmin" />
                  </motion.div>
                )}
              </AnimatePresence>
              {friend && (
                <motion.div style={{ width: '30vmin' }} initial={{ scale: 0, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
                  <Emoji name={friend} />
                  <Sparkles count={18} />
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'finish' && (
          <motion.div key="fin" className="screen" style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: '4vh' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ display: 'flex', gap: '3vmin', alignItems: 'flex-end' }}>
              <div style={{ width: '18vmin' }}>{plan.hatched && <Emoji name={plan.hatched} />}</div>
              <div style={{ width: '36vmin' }}>
                <Ride who="dodo" width="100%" mood="cheer" />
              </div>
            </div>
            <button className="go-btn" style={{ position: 'static', width: '18vmin' }} aria-label="回首頁" onClick={() => go({ name: 'home' })}>
              <svg viewBox="0 0 48 48" width="46%" aria-hidden="true">
                <path d="M8 22 L24 8 L40 22 V38 Q40 41 37 41 H11 Q8 41 8 38 Z" fill="#FBF8F2" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
