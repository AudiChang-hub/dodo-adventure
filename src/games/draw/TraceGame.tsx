import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Ink, type InkHandle } from './Ink'
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

/** 示範開車的速度：每個取樣點幾毫秒（2026-10-29 放慢 1.5 倍，V-28：孩子剛進遊戲常常還在看別的地方） */
const DEMO_MS_PER = 33
/** 下筆不在車子附近：「Start at the car!」每條路最多說兩次 */
const START_SAY_MAX = 2

/**
 * 運筆小路：用筆帶豆豆的車沿著路開回家。
 * 新的路（或第一次玩）先「Watch me!」：一支筆推著車沿路慢慢開一次，示範走過的路留下一條淡淡的虛線當範本，
 * 車子回到起點，接著才說指令和「Your turn!」（先示範、再叫孩子動手，準則 PHASE-3）。
 * 示範和說明的時候畫不出線（Ink disabled），碰到的地方出現「看這裡」的圈圈。
 * 從哪裡下筆都有回應：線一定跟著手；不是從車子出發的話，車子那裡亮一圈、豆豆說 Start at the car!，
 * 畫的時候經過車子就接著開；沒推動車子的線一下子就淡掉，不會越畫越亂。
 */
export function TraceGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [road, setRoad] = useState(ROADS[0])
  const [prog, setProg] = useState(0)
  const [done, setDone] = useState(false)
  const [demo, setDemo] = useState(false)
  /** 示範、說明中：孩子畫不出線（準則 PHASE-2） */
  const [hold, setHold] = useState(true)
  /** 示範走過的路：淡淡的虛線範本，留到這條路開完 */
  const [template, setTemplate] = useState(false)
  /** 下筆不在車子附近：車子那裡亮一圈（每次加一，重新播一次） */
  const [startRing, setStartRing] = useState(0)
  const startSaid = useRef(0)
  /** 閒置提示「筆再示範一次」：筆在路上的位置（取樣點），null 表示沒有在示範 */
  const [again, setAgain] = useState<number | null>(null)
  const ink = useRef<InkHandle>(null)
  /** 這一筆有沒有推動車子（沒有的話放開後淡掉） */
  const moved = useRef(false)
  const tracker = useRef<PathTracker | null>(null)
  const drawing = useRef(false)
  const busy = useRef(true)
  const t0 = useRef(0)
  const lv = useRef(1)
  const live = useRef(true)
  const first = useRef(0)
  const nudged = useRef(false)
  const idle = useIdle()
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
    // 先讓孩子看到筆在車子上，停一下再開
    await wait(800)
    if (!live.current) return
    await tween(Math.max(2700, total * DEMO_MS_PER), (f) => setProg(Math.round(f * total)), () => live.current, easeInOut)
    if (!live.current) return
    sfx.tap()
    await wait(600)
    if (!live.current) return
    // 不倒車：示範走過的路留成淡淡的虛線範本，車子回到起點等孩子
    setTemplate(true)
    tracker.current = new PathTracker(ROADS[idx].d, 8, ROADS[idx].lane * 0.75)
    setProg(0)
    setDemo(false)
    void logTeach({ station: 'draw', game: def.id, itemId: `road-${idx + 1}`, skill: `trace:${idx + 1}`, level: lv.current, ms: Math.round(performance.now() - s) })
    await wait(400)
    if (!live.current) return
    // 指令放在示範之後，說完「Your turn!」才開放（準則 PHASE-3）
    await say(def.intro, 'teach.turn.dodo')
  }

  /** 閒置第二段：筆從車子出發、沿著路畫一小段（不出墨、車子不動），再回到車子上停著 */
  const showAgain = async () => {
    const t = tracker.current
    if (!t || t.done) return
    const from = t.progress
    const to = Math.min(t.samples.length - 1, from + Math.max(8, Math.round((t.samples.length - 1) * 0.3)))
    const same = () => live.current && tracker.current === t
    await tween(1600, (f) => setAgain(Math.round(from + (to - from) * f)), same, easeInOut)
    if (!same()) return setAgain(null)
    await wait(300)
    if (!same()) return setAgain(null)
    // 回到車子上停著（靜態），孩子一動手就收起來
    setAgain(t.progress)
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
    setHold(show)
    setTemplate(false)
    setAgain(null)
    startSaid.current = 0
    idle.stop()
    nudged.current = false
    t0.current = performance.now()
    // 要示範的回合：開場只說「Watch me!」就示範，指令留到示範之後（showMe）
    if (i === 0 && !show) await say(def.intro)
    if (!live.current) return
    if (show) {
      await showMe(idx)
      if (!live.current) return
      t0.current = performance.now()
      busy.current = false
      setHold(false)
    }
    // 閒置：15 秒再唸一次題目 → 再 15 秒筆再示範一小段 → 之後每 40 秒筆再安靜地示範一次
    if (!tracker.current?.done) idle.start({ repeat: () => void say(def.intro), hint: () => void showAgain() })
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
    moved.current = false
    if (!t || done || busy.current) return
    // 有畫線就重新計時
    idle.poke()
    setAgain(null)
    drawing.current = t.near(p)
    if (drawing.current) return void sfx.tap()
    // 不是從車子出發：線照樣跟著手，車子那裡亮一圈，告訴孩子從車子開始（每條路最多說兩次）
    setStartRing((n) => n + 1)
    if (startSaid.current < START_SAY_MAX) {
      startSaid.current++
      void say('d.trace.start')
    }
  }
  const onMove = (p: { x: number; y: number }) => {
    const t = tracker.current
    if (!t || done || busy.current) return
    idle.poke()
    // 從別的地方下筆、畫著畫著經過車子：接著開
    if (!drawing.current) {
      if (!t.near(p)) return
      drawing.current = true
      sfx.tap()
    }
    if (t.feed(p)) {
      moved.current = true
      setProg(t.progress)
      if (t.done) {
        drawing.current = false
        void finish()
      }
    }
  }
  const onUp = () => {
    drawing.current = false
    // 沒推動車子的那一筆（畫在路外面、亂畫）：一下子就淡掉，畫面不會越畫越亂
    if (!moved.current) ink.current?.fadeLast()
    moved.current = false
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
          <path d={road.d} fill="none" stroke="#C9E4D4" strokeWidth={road.lane} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`${prog} ${total + 10}`} />
          <path d={road.d} fill="none" stroke="#FBF8F2" strokeWidth={6} strokeDasharray="22 22" strokeLinecap="round" />
          {/* 示範走過的路：淡紫色虛線範本（準則 DRAW-7），跟孩子的灰色筆跡分得出來 */}
          {template && !done && (
            <motion.path d={road.d} fill="none" stroke="#8F7CC0" strokeWidth={10} strokeDasharray="4 22" strokeLinecap="round" initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} transition={{ duration: 0.6 }} />
          )}
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
          {/* 起點：輪到孩子才亮（示範、說明中不亮，準則 PHASE-3） */}
          {prog === 0 && !hold && !done && (
            <motion.circle cx={s[0]?.x ?? 130} cy={s[0]?.y ?? 320} r={30} fill="none" stroke="#6FAE86" strokeWidth={8} animate={{ r: [26, 40, 26], opacity: [1, 0.4, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
          )}
          {/* 不是從車子出發：車子那裡亮一圈（只動一次） */}
          {startRing > 0 && !done && !hold && (
            <motion.circle key={startRing} cx={car.x} cy={car.y} fill="none" stroke="#F1D27C" strokeWidth={12} initial={{ r: 40, opacity: 1 }} animate={{ r: 120, opacity: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
          )}
          {/* 閒置提示：筆再示範一小段（不出墨），做完停在車子上 */}
          {again !== null && !demo && !done && s[again] && (
            <g className="demo-hand" transform={`translate(${s[again].x + 10} ${s[again].y + 6})`}>
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 0.85 }}>
                <PenArt scale={1.5} />
              </motion.g>
            </g>
          )}
          {demo && (
            <g transform={`translate(${car.x + 10} ${car.y + 6})`}>
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <PenArt scale={1.7} />
              </motion.g>
            </g>
          )}
        </svg>
        <Ink ref={ink} w={1000} h={600} color="rgba(46,42,37,0.55)" size={16} disabled={hold} onDown={onDown} onMove={onMove} onUp={onUp} />
        </>
      </Swap>
    </Shell>
  )
}
