import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ride } from '../art/Ride'
import { Egg } from '../art/Egg'
import { Emoji } from '../art/Emoji'
import { Scenery } from '../ui/Scenery'
import { ThemeScenery } from '../ui/ThemeScenery'
import { Sparkles } from '../ui/Sparkles'
import { PlayGame } from '../games/PlayGame'
import { PlayingGame } from '../games/Shell'
import { station as stationDef } from '../content/games'
import { theme as themeDef } from '../content/themes'
import { STORY_EGG_COUNT } from '../content/lines-friends'
import { hasLine } from '../content/lines'
import { go } from '../lib/nav'
import { say, sfx, hushSpeech, stopSpeech } from '../lib/audio'
import { cachedPlan, todayPlan, savePlan, planDone, hatchFriend, type Plan } from '../lib/plan'
import { noteActivity, isBreakDue, holdBedtime, bedtimeIfDue } from '../lib/session'
import { pendingPicks } from '../lib/achievements'
import { EyeBreak } from '../ui/EyeBreak'
import { wait } from '../games/lines'
import { RouteMap, RouteStrip, stopIcon } from './Route'
import { DayRecap } from './DayRecap'
import { Scenes, type SceneMove } from '../ui/Scenes'
import { DUR, EASE, RANGE } from '../ui/motion'

type Phase = 'route' | 'travel' | 'play' | 'egg' | 'finale' | 'hatch' | 'finish' | 'rest'

/** 開局的路線至少展示這麼久（毫秒），讓孩子看得到「今天有 4 站」 */
const ROUTE_MS = 3000
/** 旁白開始多久之後才能點畫面跳過（避免轉場時手還放在螢幕上就跳過） */
const SKIP_AFTER_MS = 700

/**
 * 今日冒險：今天的路線 → 轉場 → 遊戲 → 蛋裂開一點 → 下一站…最後孵出新朋友。
 * 每日時間到了不在題目中途結束，而是在兩站之間（蛋裂開之後）才去睡覺。
 *
 * 主題式冒險（plan.theme，2026-10-28 起每天都是）：路線是故事的一格一格（公車站牌 → 公車 → …→ 動物園），
 * 轉場不報站名，而是說故事的恐龍念一句旁白；最後一站之後先到故事的終點（We made it to the zoo!），再孵蛋、回顧。
 * 孩子端看不到也聽不到任何科目或站名；旁白都很短，點一下畫面就跳過。
 */
export function Adventure() {
  // 首頁已經讀過今天的冒險：第一幀就畫得出路線，不會先閃一張空白
  const [plan, setPlan] = useState<Plan | null>(cachedPlan)
  const [phase, setPhase] = useState<Phase>(() => {
    const p = cachedPlan()
    return p && planDone(p) ? (p.hatched ? 'finish' : 'hatch') : 'route'
  })
  const [taps, setTaps] = useState(0)
  const [friend, setFriend] = useState<string | null>(null)
  const live = useRef(true)
  /** 旁白卡（主題式冒險）或站牌：遊戲從它長出來 */
  const story = useRef<HTMLDivElement>(null)
  /** 畫面上現在是哪一段：換段的那一次 render 用它決定往前還是往回 */
  const shownPhase = useRef<Phase>(phase)
  useEffect(() => {
    shownPhase.current = phase
  }, [phase])
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
      // 跟一開始用的那份一樣就不換：換了物件，路線那一段的旁白會被打斷重來
      setPlan((cur) => (cur && JSON.stringify(cur) === JSON.stringify(p) ? cur : p))
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

  /** 路線、轉場、故事終點：點一下畫面就跳過旁白（say 被 hushSpeech 打斷會提早結束；字幕留著等下一句） */
  const skip = () => {
    if (skipped.current || performance.now() < skipFrom.current) return
    if (phase !== 'route' && phase !== 'travel' && phase !== 'finale') return
    skipped.current = true
    hushSpeech()
  }

  // 冒險在畫面上就先擋住「時間到」：由冒險自己在兩站之間檢查。
  // 收尾畫面（finish）說完那句話才放開，之後一般的計時就會送去睡覺
  useEffect(() => {
    const release = holdBedtime()
    if (phase !== 'finish') return release
    let cancelled = false
    // 成就感：說完「今天好棒」，邀請孩子拿給爸爸看（回顧畫面上有爸爸的按鈕）
    // 還有集滿了沒挑的貼紙（之前按了等一下再選）：提醒一句，回顧上有一張發光的卡片
    void say('adv.done', 'ach.showdad', ...(pendingPicks() > 0 ? ['stk.wait'] : [])).then(() => !cancelled && release())
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

  const onGameDone = async () => {
    if (!plan || !item) return
    const index = cur
    const next = { ...plan, items: plan.items.map((it, i) => (i === index ? { ...it, done: true } : it)) }
    noteActivity(item.game, item.station, true)
    await savePlan(next)
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

  // ── 轉場：每一段是一層（ui/Scenes.tsx） ──────────────────────
  const sceneId =
    phase === 'route'
      ? 'route'
      : phase === 'travel'
        ? `travel-${cur}`
        : phase === 'play'
          ? `play-${cur}`
          : phase === 'egg' || phase === 'hatch'
            ? `egg-${doneCount}`
            : phase === 'rest'
              ? `rest-${doneCount}`
              : phase
  /** 旁白卡進遊戲：遊戲從那張卡長出來；遊戲（含護眼休息）結束回到旅程：收回去，旅程拉遠回來 */
  const move = (): SceneMove => {
    const from = shownPhase.current
    if (phase === 'play') {
      const box = story.current?.getBoundingClientRect()
      return { back: false, anchor: box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null }
    }
    const fromGame = from === 'play' || from === 'rest'
    return { back: fromGame, collapse: from === 'play', anchor: null }
  }

  if (!plan) return <div className="screen" />

  const st = item ? stationDef(item.station) : null
  // 背景：主題式冒險整趟都是主題的顏色與場景；舊的冒險照站點換顏色
  const bg = th ? th.tint : phase === 'route' ? 'var(--paper)' : (st?.tint ?? 'var(--paper)')
  return (
    <div className="screen travel" style={{ background: bg, transition: 'background .6s' } as CSSProperties} onPointerDown={skip}>
      {th ? <ThemeScenery def={th} /> : phase !== 'route' && <Scenery station="home" />}
      {/* 每一段（路線、旁白卡、遊戲、蛋、終點、回顧）都是一層：新的蓋好了舊的才退，故事背景一直都在，不會露出空白 */}
      <Scenes id={sceneId} move={move} className="scene is-clear">
        {scene()}
      </Scenes>
    </div>
  )

  function scene() {
    if (!plan) return null
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

    return (
      <>
        {phase === 'route' && (
          <div className="screen">
            <RouteMap plan={plan} />
          </div>
        )}

        {phase === 'travel' && th && item && (
          <div className="screen">
            <RouteStrip plan={plan} />
            {/* 故事的這一格：大大的圖在一張紙卡上，後面一圈淡淡的光。跟著這一段一起出現（不另外淡入），只多一點點長大；遊戲從這張卡長出來 */}
            <motion.div ref={story} className="story-card" style={{ '--deep': th.deep, '--tint': th.tint } as CSSProperties} initial={{ scale: RANGE.fromScale + 0.2, y: 16 }} animate={{ scale: 1, y: 0 }} transition={{ duration: DUR.enter + 0.2, ease: EASE.out }}>
              <span className="story-card-halo" />
              <motion.span className="story-card-pic" animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1 }}>
                <Emoji name={stopIcon(th, cur)} />
              </motion.span>
            </motion.div>
            <motion.div style={{ position: 'absolute', bottom: '7vh', left: '50%', width: '40vmin', marginLeft: '-20vmin' }} initial={{ x: '-80vw' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 45, damping: 12 }}>
              <Ride who={th.host} width="100%" moving mood="happy" />
            </motion.div>
          </div>
        )}

        {phase === 'travel' && !th && st && item && (
          <div className="screen">
            <RouteStrip plan={plan} />
            <motion.div ref={story} className="travel-badge" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.3 }}>
              <Emoji name={st.icon} />
            </motion.div>
            <motion.div className="travel-name" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              {st.name}
            </motion.div>
            <motion.div style={{ position: 'absolute', bottom: '8vh', left: '50%', width: '40vmin', marginLeft: '-20vmin' }} initial={{ x: '-80vw' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 45, damping: 12 }}>
              <Ride who={st.host} width="100%" moving mood="happy" />
            </motion.div>
          </div>
        )}

        {phase === 'finale' && th && (
          <div className="screen">
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
          </div>
        )}

        {(phase === 'egg' || phase === 'hatch') && (
          <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>
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
          </div>
        )}

        {phase === 'finish' && (
          <div className="screen" style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: '4vh' }}>
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
          </div>
        )}
      </>
    )
  }
}
