import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ride } from '../art/Ride'
import { Egg } from '../art/Egg'
import { Emoji } from '../art/Emoji'
import { Scenery } from '../ui/Scenery'
import { Sparkles } from '../ui/Sparkles'
import { PlayGame } from '../games/PlayGame'
import { station as stationDef } from '../content/games'
import { go } from '../lib/nav'
import { say, sfx, stopSpeech } from '../lib/audio'
import { todayPlan, savePlan, planDone, hatchFriend, type Plan } from '../lib/plan'
import { noteActivity, isBreakDue } from '../lib/session'
import { EyeBreak } from '../ui/EyeBreak'
import { wait } from '../games/lines'

type Phase = 'travel' | 'play' | 'egg' | 'hatch' | 'finish' | 'rest'

/** 今日冒險：轉場 → 遊戲 → 蛋裂開一點 → 下一站…最後孵出新朋友 */
export function Adventure() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [phase, setPhase] = useState<Phase>('travel')
  const [taps, setTaps] = useState(0)
  const [friend, setFriend] = useState<string | null>(null)
  const live = useRef(true)

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
    if (phase === 'finish') void say('adv.done')
  }, [phase])

  const onGameDone = async () => {
    if (!plan || !item) return
    const next = { ...plan, items: plan.items.map((it, i) => (i === cur ? { ...it, done: true } : it)) }
    noteActivity(item.game, item.station, true)
    await savePlan(next)
    setPlan(next)
    setPhase('egg')
    await wait(500)
    sfx.crack()
    await say('egg.crack')
    await wait(500)
    if (!live.current) return
    setPhase(planDone(next) ? 'hatch' : isBreakDue() ? 'rest' : 'travel')
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
    await say('egg.hatch')
    await wait(1200)
    if (live.current) setPhase('finish')
  }

  const exit = () => {
    if (item && phase === 'play') noteActivity(item.game, item.station, false)
    go({ name: 'home' })
  }

  if (!plan) return <div className="screen" />

  if (phase === 'rest') return <EyeBreak onDone={() => setPhase('travel')} />

  if (phase === 'play' && item) return <PlayGame gameId={item.game} onDone={onGameDone} onExit={exit} />

  const st = item ? stationDef(item.station) : null
  return (
    <div className="screen travel" style={{ background: st?.tint ?? 'var(--paper)', transition: 'background .6s' } as CSSProperties}>
      <Scenery station="home" />
      <AnimatePresence mode="wait">
        {phase === 'travel' && st && item && (
          <motion.div key={`t${cur}`} className="screen" exit={{ opacity: 0 }}>
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
