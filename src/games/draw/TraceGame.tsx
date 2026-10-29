import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Ink } from './Ink'
import { PathTracker } from './track'
import { PenArt, easeInOut, tween } from '../Demo'
import { Ride } from '../../art/Ride'
import { Emoji } from '../../art/Emoji'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef } from '../../content/games'
import { level, markPlayed, needsDemo, plays, reportLevel } from '../../lib/adaptive'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { praiseKey, wait } from '../lines'
import { useIdle } from '../idle'
import { Swap } from '../../ui/Scenes'

/**
 * 照運筆的發展順序（benchmark 手法 5）：直線（由上往下）→ 橫線（由左往右）→ 弧線 → 圓 →
 * 直角轉彎（橫線＋直線）→ 波浪 → 斜線的 Z 字路最後（只在最高難度的第三條才會出現）。
 * home 是家的位置：直線往下開時，家放在終點下面
 */
const ROADS: { d: string; lane: number; home?: 'below' }[] = [
  { d: 'M500 110 L500 420', lane: 130, home: 'below' },
  { d: 'M130 320 L870 320', lane: 130 },
  { d: 'M130 400 Q500 130 870 400', lane: 124 },
  { d: 'M500 130 A175 175 0 1 1 499 130', lane: 110 },
  { d: 'M130 470 L130 190 L500 190 L500 470 L870 470 L870 190', lane: 104 },
  { d: 'M110 330 C230 150 360 150 450 320 S 680 490 780 320 S 870 220 900 230', lane: 104 },
  { d: 'M120 440 L310 190 L500 440 L690 190 L880 440', lane: 96 },
]

const ROUNDS = 3
/** 一局最多示範兩條新的路 */
const MAX_DEMO = 2

/**
 * 運筆小路：用筆帶豆豆的車沿著路開回家。
 * 新的路（或第一次玩）先「Watch me!」：一支筆推著車沿路開一次，再「Your turn!」。
 */
export function TraceGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [road, setRoad] = useState(ROADS[0])
  const [prog, setProg] = useState(0)
  const [done, setDone] = useState(false)
  const [demo, setDemo] = useState(false)
  const tracker = useRef<PathTracker | null>(null)
  const drawing = useRef(false)
  const busy = useRef(true)
  const t0 = useRef(0)
  const lv = useRef(1)
  const live = useRef(true)
  const first = useRef(0)
  const nudged = useRef(false)
  const idle = useIdle()
  /** 閒置第二段提示：整條路慢慢亮起來 */
  const [nudge, setNudge] = useState(false)
  const demos = useRef(0)
  const firstPlay = useRef(plays(def.id) === 0)

  const showMe = async (idx: number) => {
    const t = tracker.current!
    const total = t.samples.length - 1
    const s = performance.now()
    demos.current++
    setDemo(true)
    await say('teach.watch.dodo')
    if (!live.current) return
    await tween(Math.max(1800, total * 22), (f) => setProg(Math.round(f * total)), () => live.current, easeInOut)
    if (!live.current) return
    sfx.tap()
    await wait(380)
    // 倒車回起點，換孩子開
    await tween(520, (f) => setProg(Math.round((1 - f) * total)), () => live.current)
    if (!live.current) return
    tracker.current = new PathTracker(ROADS[idx].d, 8, ROADS[idx].lane * 0.75)
    setProg(0)
    setDemo(false)
    void logTeach({ station: 'draw', game: def.id, itemId: `road-${idx + 1}`, skill: `trace:${idx + 1}`, level: lv.current, ms: Math.round(performance.now() - s) })
    await say('teach.turn.dodo')
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    // 同一局三條路：目前難度、目前難度、再難一點點
    const idx = Math.min(ROADS.length - 1, lv.current - 1 + (i === 2 ? 1 : 0))
    const rd = ROADS[idx]
    setRoad(rd)
    tracker.current = new PathTracker(rd.d, 8, rd.lane * 0.75)
    setProg(0)
    setDone(false)
    // 要示範的話，示範完才讓孩子開；不示範就跟以前一樣，邊聽邊可以開始
    const show = demos.current < MAX_DEMO && needsDemo(firstPlay.current && i === 0, `trace:${idx + 1}`)
    busy.current = show
    idle.stop()
    setNudge(false)
    nudged.current = false
    t0.current = performance.now()
    if (i === 0) await say(def.intro)
    if (!live.current) return
    if (show) {
      await showMe(idx)
      if (!live.current) return
      t0.current = performance.now()
      busy.current = false
    }
    // 閒置：15 秒再唸一次題目 → 再 15 秒整條路慢慢亮起來 → 之後安靜
    if (!tracker.current?.done) idle.start({ repeat: () => void say(def.intro), hint: () => setNudge(true) })
  }

  useEffect(() => {
    live.current = true
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
    const boot = window.setTimeout(() => {
      markPlayed(def.id)
      start(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = async () => {
    const t = tracker.current!
    const m = t.metrics()
    const good = m.offRatio < 0.35
    if (good) first.current++
    idle.stop()
    setDone(true)
    sfx.done()
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: `road-${ROADS.indexOf(road) + 1}`,
      skill: `trace:${ROADS.indexOf(road) + 1}`,
      phase: 'quiz',
      level: lv.current,
      options: [],
      answer: '',
      taps: [],
      firstTryCorrect: good,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { ...m, lane: road.lane },
    })
    reportLevel(def.id, good, def.maxLevel)
    await say('d.trace.done', praiseKey('dodo'))
    await wait(500)
    if (!live.current) return
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    setR(r + 1)
    start(r + 1)
  }

  const onDown = (p: { x: number; y: number }) => {
    const t = tracker.current
    if (!t || done || busy.current) return
    // 有畫線就重新計時
    idle.poke()
    drawing.current = t.near(p)
    if (drawing.current) sfx.tap()
  }
  const onMove = (p: { x: number; y: number }) => {
    const t = tracker.current
    if (!t || done || busy.current) return
    idle.poke()
    if (!drawing.current) return
    if (t.feed(p)) {
      setProg(t.progress)
      if (t.done) {
        drawing.current = false
        void finish()
      }
    }
  }
  const onUp = () => {
    drawing.current = false
    const t = tracker.current
    // 開到一半放開筆：每條路最多鼓勵一次「Keep going!」，不要一直講
    if (t && !t.done && !busy.current && t.progress > 0 && !nudged.current) {
      nudged.current = true
      void say('d.trace.keep')
    }
  }

  const s = tracker.current?.samples ?? []
  const car = s[Math.min(prog, s.length - 1)] ?? { x: 130, y: 320 }
  const ahead = s[Math.min(prog + 3, s.length - 1)] ?? car
  const end = s[s.length - 1] ?? { x: 870, y: 320 }
  const total = Math.max(1, s.length - 1)

  return (
    <Shell station="draw" mood="idle" progress={{ total: ROUNDS, done: r }} onExit={onExit} hideHost demo={demo}>
      {/* 換一回合：新的一回合蓋在舊的上面淡入，舊的（答對的樣子）等一下才淡掉，不會一下子變空（ui/Scenes.tsx 的 Swap） */}
      <Swap id={r} style={{ inset: '0 3% 4%' }}>
        <>
        <svg viewBox="0 0 1000 600" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          <path d={road.d} fill="none" stroke="#D9CFBE" strokeWidth={road.lane + 14} strokeLinecap="round" strokeLinejoin="round" />
          <path d={road.d} fill="none" stroke="#EFE8DA" strokeWidth={road.lane} strokeLinecap="round" strokeLinejoin="round" />
          {nudge && !done && <path className="nudge-path" d={road.d} fill="none" stroke="#F1D27C" strokeWidth={road.lane} strokeLinecap="round" strokeLinejoin="round" />}
          <path d={road.d} fill="none" stroke="#C9E4D4" strokeWidth={road.lane} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`${prog} ${total + 10}`} />
          <path d={road.d} fill="none" stroke="#FBF8F2" strokeWidth={6} strokeDasharray="22 22" strokeLinecap="round" />
          <foreignObject x={end.x - 70} y={road.home === 'below' ? end.y + 40 : end.y - 150} width={140} height={140}>
            <motion.div animate={done ? { scale: [1, 1.25, 1], rotate: [0, -6, 6, 0] } : {}} style={{ width: '100%', height: '100%', position: 'relative' }}>
              <Emoji name="house-with-garden" />
              {done && <Sparkles count={14} />}
            </motion.div>
          </foreignObject>
          <g transform={`translate(${car.x} ${car.y})`}>
            <g transform={`scale(${ahead.x < car.x - 2 ? -1 : 1} 1) translate(-75 -92)`}>
              <Ride who="dodo" width={150} moving={prog > 0 && !done} mood={done ? 'cheer' : 'happy'} />
            </g>
          </g>
          {prog === 0 && !demo && (
            <motion.circle cx={s[0]?.x ?? 130} cy={s[0]?.y ?? 320} r={30} fill="none" stroke="#6FAE86" strokeWidth={8} animate={{ r: [26, 40, 26], opacity: [1, 0.4, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
          )}
          {demo && (
            <g transform={`translate(${car.x + 10} ${car.y + 6})`}>
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <PenArt scale={1.7} />
              </motion.g>
            </g>
          )}
        </svg>
        <Ink w={1000} h={600} color="rgba(46,42,37,0.55)" size={16} ink={!demo} onDown={onDown} onMove={onMove} onUp={onUp} />
        </>
      </Swap>
    </Shell>
  )
}
