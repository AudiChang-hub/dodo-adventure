import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ride } from '../art/Ride'
import { Egg } from '../art/Egg'
import { Emoji } from '../art/Emoji'
import { Scenery } from '../ui/Scenery'
import { ThemeScenery } from '../ui/ThemeScenery'
import { Sparkles } from '../ui/Sparkles'
import { PlayGame } from '../games/PlayGame'
import { PlayingGame } from '../games/Shell'
import { DadTurn } from '../games/DadTurn'
import { station as stationDef } from '../content/games'
import { theme as themeDef } from '../content/themes'
import { STORY_EGG_COUNT } from '../content/lines-friends'
import { hasLine } from '../content/lines'
import { go } from '../lib/nav'
import { say, sfx, stopSpeech } from '../lib/audio'
import { getKV, setKV, today } from '../lib/db'
import { todayPlan, savePlan, planDone, hatchFriend, type Plan } from '../lib/plan'
import { noteActivity, isBreakDue, holdBedtime, bedtimeIfDue } from '../lib/session'
import { useThemeScope } from '../lib/theme-play'
import { EyeBreak } from '../ui/EyeBreak'
import { wait } from '../games/lines'
import { RouteMap, RouteStrip, stopIcon } from './Route'
import { DayRecap } from './DayRecap'

type Phase = 'route' | 'travel' | 'play' | 'coplay' | 'egg' | 'finale' | 'hatch' | 'finish' | 'rest'

/** 開局的路線至少展示這麼久（毫秒），讓孩子看得到「今天有 4 站」 */
const ROUTE_MS = 3000
/** 爸爸回合：一天最多幾次、每站結束後出現的機率（第一站是暖身，不出現） */
const COPLAY_PER_DAY = 1
const COPLAY_CHANCE = 0.5
/** 旁白開始多久之後才能點畫面跳過（避免轉場時手還放在螢幕上就跳過） */
const SKIP_AFTER_MS = 700

/** 爸爸回合也在故事裡：背景、題目的東西照主題（DadTurn 自己不知道主題） */
function ThemeScope({ theme, children }: { theme?: string; children: ReactNode }) {
  useThemeScope(theme)
  return children
}

/**
 * 今日冒險：今天的路線 → 轉場 → 遊戲 →（偶爾）換爸爸問 → 蛋裂開一點 → 下一站…最後孵出新朋友。
 * 每日時間到了不在題目中途結束，而是在兩站之間（蛋裂開之後）才去睡覺。
 *
 * 主題式冒險（plan.theme，2026-10-28 起每天都是）：路線是故事的一格一格（公車站牌 → 公車 → …→ 動物園），
 * 轉場不報站名，而是說故事的恐龍念一句旁白；最後一站之後先到故事的終點（We made it to the zoo!），再孵蛋、回顧。
 * 孩子端看不到也聽不到任何科目或站名；旁白都很短，點一下畫面就跳過。
 */
export function Adventure() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [phase, setPhase] = useState<Phase>('route')
  const [taps, setTaps] = useState(0)
  const [friend, setFriend] = useState<string | null>(null)
  const live = useRef(true)
  /** 爸爸回合是哪一站之後（站的 index），結束後接回蛋裂開 */
  const [coplayAt, setCoplayAt] = useState(-1)
  /** 點畫面跳過旁白：這個階段後面的等待也一起略過 */
  const skipped = useRef(false)
  const skipFrom = useRef(0)

  const cur = plan?.items.findIndex((i) => !i.done) ?? -1
  const item = plan && cur >= 0 ? plan.items[cur] : null
  const doneCount = plan?.items.filter((i) => i.done).length ?? 0
  const th = themeDef(plan?.theme)

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

  // 每換一個階段，重新開始算「可以跳過」的時間
  useEffect(() => {
    skipped.current = false
    skipFrom.current = performance.now() + SKIP_AFTER_MS
  }, [phase])

  /** 等一下；被點畫面跳過時立刻結束 */
  const hold = async (ms: number) => {
    const end = performance.now() + ms
    while (!skipped.current && performance.now() < end) await wait(Math.min(80, end - performance.now()))
  }

  /** 路線、轉場、故事終點：點一下畫面就跳過旁白（say 被 stopSpeech 打斷會提早結束） */
  const skip = () => {
    if (skipped.current || performance.now() < skipFrom.current) return
    if (phase !== 'route' && phase !== 'travel' && phase !== 'finale') return
    skipped.current = true
    stopSpeech()
  }

  // 冒險在畫面上就先擋住「時間到」：由冒險自己在兩站之間檢查。
  // 收尾畫面（finish）說完那句話才放開，之後一般的計時就會送去睡覺
  useEffect(() => {
    const release = holdBedtime()
    if (phase !== 'finish') return release
    let cancelled = false
    // 成就感：說完「今天好棒」，邀請孩子拿給爸爸看（回顧畫面上有爸爸的按鈕）
    void say('adv.done', 'ach.showdad').then(() => !cancelled && release())
    return () => {
      cancelled = true
      release()
    }
  }, [phase])

  // 開局：先看今天的路線（約 3 秒）。主題式冒險念故事的標題與開場；中途回來只念標題
  useEffect(() => {
    if (phase !== 'route' || !plan || planDone(plan)) return
    let cancelled = false
    ;(async () => {
      const t = performance.now()
      await wait(500)
      if (cancelled) return
      if (th) await say(`theme.${th.id}.title`, ...(doneCount === 0 ? [`theme.${th.id}.intro`] : []))
      else {
        const k = `route.stops.${plan.items.length}`
        await say(...(doneCount === 0 && hasLine(k) ? [k] : []), 'adv.go')
      }
      await hold(Math.max(0, ROUTE_MS - (performance.now() - t)))
      if (!cancelled && live.current) setPhase('travel')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, plan])

  // 轉場：主持的恐龍開車進場、報站名（主題式冒險：說故事的一句），說完自動開始
  useEffect(() => {
    if (phase !== 'travel' || !item) return
    let cancelled = false
    ;(async () => {
      sfx.whoosh()
      await hold(700)
      if (cancelled) return
      await say(th ? `theme.${th.id}.stop.${Math.min(cur, th.stops.length - 1)}` : `station.${item.station}`)
      await hold(500)
      if (!cancelled && live.current) setPhase('play')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, item])

  // 故事的終點：目的地大大地出現、說故事的恐龍開到、念結尾，再去孵蛋
  useEffect(() => {
    if (phase !== 'finale' || !th) return
    let cancelled = false
    ;(async () => {
      await hold(900)
      if (cancelled) return
      sfx.done()
      await say(`theme.${th.id}.end`)
      await hold(700)
      if (!cancelled && live.current) setPhase('hatch')
    })()
    return () => {
      cancelled = true
    }
  }, [phase, th])

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
    // 全部走完就到故事的終點、孵蛋（故事的結尾一定讓它說完）；時間到了就在兩站之間去睡覺
    if (planDone(next)) return setPhase(themeDef(next.theme) ? 'finale' : 'hatch')
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
        <PlayGame gameId={item.game} theme={plan.theme} onDone={onGameDone} onExit={exit} />
      </PlayingGame.Provider>
    )

  if (phase === 'coplay' && coplayAt >= 0) {
    const it = plan.items[coplayAt]
    return (
      <ThemeScope theme={plan.theme}>
        <DadTurn gameId={it.game} station={it.station} onDone={() => void afterGame(plan)} onExit={() => go({ name: 'home' })} />
      </ThemeScope>
    )
  }

  const st = item ? stationDef(item.station) : null
  // 背景：主題式冒險整趟都是主題的顏色與場景；舊的冒險照站點換顏色
  const bg = th ? th.tint : phase === 'route' ? 'var(--paper)' : (st?.tint ?? 'var(--paper)')
  return (
    <div className="screen travel" style={{ background: bg, transition: 'background .6s' } as CSSProperties} onPointerDown={skip}>
      {th ? <ThemeScenery def={th} /> : phase !== 'route' && <Scenery station="home" />}
      <AnimatePresence mode="wait">
        {phase === 'route' && (
          <motion.div key="route" className="screen" exit={{ opacity: 0, transition: { duration: 0.3 } }}>
            <RouteMap plan={plan} />
          </motion.div>
        )}

        {phase === 'travel' && th && item && (
          <motion.div key={`t${cur}`} className="screen" exit={{ opacity: 0 }}>
            <RouteStrip plan={plan} />
            {/* 故事的這一格：大大的圖在一張紙卡上，後面一圈淡淡的光 */}
            <motion.div className="story-card" style={{ '--deep': th.deep, '--tint': th.tint } as CSSProperties} initial={{ scale: 0.6, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 17, delay: 0.25 }}>
              <span className="story-card-halo" />
              <motion.span className="story-card-pic" animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1 }}>
                <Emoji name={stopIcon(th, cur)} />
              </motion.span>
            </motion.div>
            <motion.div style={{ position: 'absolute', bottom: '7vh', left: '50%', width: '40vmin', marginLeft: '-20vmin' }} initial={{ x: '-80vw' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 45, damping: 12 }}>
              <Ride who={th.host} width="100%" moving mood="happy" />
            </motion.div>
          </motion.div>
        )}

        {phase === 'travel' && !th && st && item && (
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

        {phase === 'finale' && th && (
          <motion.div key="finale" className="screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }}>
            <div className="story-finale" style={{ '--deep': th.deep, '--tint': th.tint } as CSSProperties}>
              <motion.span className="story-finale-ring" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 16 }} />
              {th.finale.map((ic, i) => (
                <motion.span
                  key={ic}
                  className={`story-finale-pic n${th.finale.length} i${i}`}
                  initial={{ scale: 0, y: 40, rotate: i % 2 ? 12 : -12 }}
                  animate={{ scale: 1, y: 0, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 240, damping: 13, delay: 0.25 + i * 0.18 }}
                >
                  <Emoji name={ic} />
                </motion.span>
              ))}
              <Sparkles count={14} />
            </div>
            <motion.div style={{ position: 'absolute', bottom: '6vh', left: '50%', width: '34vmin', marginLeft: '-34vmin' }} initial={{ x: '-70vw' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 45, damping: 12, delay: 0.2 }}>
              <Ride who={th.host} width="100%" moving={false} mood="cheer" />
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
            <DayRecap plan={plan} />
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
