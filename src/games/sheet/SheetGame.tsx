import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Hand, PenArt, easeInOut, tween } from '../Demo'
import { Ink, type InkHandle, type Pt } from '../draw/Ink'
import { Sparkles } from '../../ui/Sparkles'
import { SheetTeach } from './SheetTeach'
import { ThingView } from './ThingView'
import { game as gameDef, station as stationDef } from '../../content/games'
import { SHEET_MAKERS, type SheetItem } from '../../content/games-worksheet'
import { reportLevel, markPlayed, plays } from '../../lib/adaptive'
import { planSheet, roundState } from '../pick'
import { logAttempt, logTeach } from '../../lib/record'
import type { Phase } from '../../lib/db'
import { preload, say, sfx, stopSpeech } from '../../lib/audio'
import { shuffle } from '../../lib/random'
import { praiseKey, retryKey, wait } from '../lines'
import { useIdle } from '../idle'
import { PACE, nextPause } from '../pace'
import { analyzeLasso, crayonLoop, dist, layout, smoothPath, winding, BOARD_H, BOARD_W, type P, type Spot } from './geom'
import type { Mood } from '../../art/Dino'
import { CardStage, Swap, useSwapRef } from '../../ui/Scenes'
import { REVEAL_MS } from '../../ui/motion'
import { FADE } from '../../ui/motion'
import './sheet.css'

export type SheetMode = 'tap' | 'lasso'

interface LoopStat {
  circ: number
  gap: number
  ms: number
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`

/**
 * 學習單題型的引擎：「找出全部」（點選）與「用筆圈起來」（圈選）共用。
 * 一題有 4–6 個東西、2–3 個符合；全部找到才算完成，點錯溫和提示（說出那是什麼）。
 * 新概念：教學卡（兩個例子）→ 一起練（答案發光、其他變淡）→ 自己答；自己答錯兩次就重教一次。
 * 圈選第一次玩時，波波先用筆示範圈一個，再換孩子；圈選的軌跡品質（圓度、缺口、花多久）都會記錄。
 */
export function SheetGame({ gameId, onDone, onExit, mode }: GameProps & { mode: SheetMode }) {
  const def = gameDef(gameId)
  const host = stationDef(def.station).host === 'momo' ? 'momo' : 'bobo'
  const ITEMS = mode === 'lasso' ? 4 : 5
  const make = SHEET_MAKERS[def.id]

  const [idx, setIdx] = useState(0)
  const [item, setItem] = useState<SheetItem | null>(null)
  const [spots, setSpots] = useState<Spot[]>([])
  const [phase, setPhase] = useState<Phase>('quiz')
  const [card, setCard] = useState<{ it: SheetItem; short: boolean; n: number } | null>(null)
  const [view, setView] = useState(0)
  const [found, setFound] = useState<string[]>([])
  const [wrong, setWrong] = useState<string[]>([])
  const [shake, setShake] = useState<{ ids: string[]; k: number }>({ ids: [], k: 0 })
  const [mood, setMood] = useState<Mood>('idle')
  const [burst, setBurst] = useState<{ id: string; k: number } | null>(null)
  const [hint, setHint] = useState(false)
  const [loops, setLoops] = useState<{ d: string; k: number }[]>([])
  const [miss, setMiss] = useState<{ d: string; k: number } | null>(null)
  const [demo, setDemo] = useState<{ d: string; pen: P } | null>(null)

  const live = useRef(true)
  const locked = useRef(true)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const shownAt = useRef(0)
  const hintUsed = useRef(false)
  const wrongs = useRef(0)
  const firstTries = useRef(0)
  const itemLevel = useRef(1)
  const idxRef = useRef(0)
  const itemRef = useRef<SheetItem | null>(null)
  const spotsRef = useRef<Spot[]>([])
  const phaseRef = useRef<Phase>('quiz')
  const foundRef = useRef<string[]>([])
  const wrongRef = useRef<string[]>([])
  /** 每換一個步驟就加一，舊步驟的計時器看到不一樣就不動作 */
  const stepRef = useRef(0)
  const round = useRef(roundState(plays(def.id) === 0))
  /** 這一題剛走過教學卡、示範或一起練：答對後多停一下再換題 */
  const taughtItem = useRef(false)
  const resolver = useRef<((ms: number) => void) | null>(null)
  /** 教學卡還蓋在題目上：一起練把題目換好之後才收起來（ui/Scenes.tsx 的 CardStage） */
  const cardUp = useRef(false)
  const idle = useIdle()
  // 圈選
  const ink = useRef<InkHandle>(null)
  const inkRef = useSwapRef(ink)
  const stroke = useRef<P[]>([])
  const strokeAt = useRef(0)
  const pointer = useRef('')
  const said = useRef({ around: false, close: false })
  const stats = useRef({ tries: 0, open: 0, rejected: 0, loops: [] as LoopStat[], pen: 0 })

  const waitStep = () => new Promise<number>((res) => (resolver.current = res))
  const release = (ms = 0) => {
    const r = resolver.current
    resolver.current = null
    r?.(ms)
  }

  const promptOf = (it: SheetItem) => (mode === 'lasso' ? it.lasso : it.prompt)
  const hereKey = mode === 'lasso' ? 'ws.lasso.here' : `ws.here.${host}`
  const numKey = (n: number) => (host === 'momo' ? `ws.num.momo.${Math.min(6, n)}` : `m.num.${n}`)
  const targets = (it: SheetItem) => it.things.filter((t) => t.ok)

  const base = (it: SheetItem) => ({
    station: def.station,
    game: def.id,
    itemId: it.itemId,
    skill: it.skill,
    level: itemLevel.current,
    options: it.things.map((t) => t.id),
    answer: targets(it)
      .map((t) => t.id)
      .join(','),
  })

  /** 擺上學習單：每次重新洗牌，一起練之後的自己答不會在同樣的位置 */
  const lay = (it: SheetItem) => {
    const sh = { ...it, things: shuffle(it.things) }
    const sp = layout(sh.things.length, sh.things.map((t) => t.scale))
    itemRef.current = sh
    spotsRef.current = sp
    foundRef.current = []
    wrongRef.current = []
    setItem(sh)
    setSpots(sp)
    setFound([])
    setWrong([])
    setLoops([])
    setMiss(null)
    setHint(false)
    setBurst(null)
    setView((v) => v + 1)
    return sh
  }

  // ── 我示範：教學卡（先看兩個例子）──────────────────────────
  const teach = async (it: SheetItem, short: boolean) => {
    stepRef.current++
    idle.stop()
    locked.current = true
    setMood('happy')
    cardUp.current = true
    setCard({ it, short, n: stepRef.current })
    const ms = await waitStep()
    if (!live.current) return
    // 卡片先不收：一起練把學習單擺好的同一刻才收（收回恐龍時直接看到新的一題）
    void logTeach({ station: def.station, game: def.id, itemId: it.itemId, skill: it.skill, level: itemLevel.current, ms, retaught: short })
  }

  /** 教學卡收回主持的恐龍、題目拉遠回來；停頓和以前一樣（TEACH_TO_GUIDED），只是收卡的動畫也算在裡面 */
  const reveal = async () => {
    if (!cardUp.current) return
    cardUp.current = false
    setCard(null)
    await wait(Math.max(PACE.TEACH_TO_GUIDED, REVEAL_MS))
  }

  // ── 圈選示範：Watch me! 筆沿著一圈畫過去，把第一個圈起來 ─────────
  const penShow = async (it: SheetItem) => {
    const s = performance.now()
    stepRef.current++
    idle.stop()
    locked.current = true
    phaseRef.current = 'guided'
    setPhase('guided')
    // 學習單在教學卡後面擺好，再把卡收回恐龍：筆的示範一定在孩子看得到的地方做（盤點：原本卡還蓋著就開始畫）
    const sh = lay(it)
    setMood('happy')
    await reveal()
    if (!live.current) return
    await wait(500)
    await say('teach.watch.bobo')
    if (!live.current) return
    const i = sh.things.findIndex((t) => t.ok)
    const sp = spotsRef.current[i]
    const pts = crayonLoop(sp.x, sp.y, sp.size * 0.66, 11)
    await tween(
      1900,
      (f) => {
        const n = Math.max(2, Math.round(f * pts.length))
        setDemo({ d: smoothPath(pts.slice(0, n)), pen: pts[n - 1] })
      },
      () => live.current,
      easeInOut,
    )
    if (!live.current) return
    sfx.count(1)
    setFound([sh.things[i].id])
    setBurst({ id: sh.things[i].id, k: Date.now() })
    await say(numKey(1))
    await wait(PACE.DEMO_HOLD)
    if (!live.current) return
    setDemo(null)
    setFound([])
    void logTeach({ station: def.station, game: def.id, itemId: 'lasso', skill: 'lasso:demo', level: itemLevel.current, ms: Math.round(performance.now() - s) })
    setMood('idle')
    await say('teach.turn.bobo')
  }

  // ── 一起練：答案發光，其他變淡；點錯也沒關係 ─────────────────
  const guided = async (it: SheetItem, keep = false) => {
    const my = ++stepRef.current
    phaseRef.current = 'guided'
    taps.current = []
    setPhase('guided')
    // 剛示範完（keep）：同一張學習單、同樣的位置直接接著一起練，孩子照著剛剛看到的圈
    if (!keep) lay(it)
    setMood('happy')
    await reveal()
    if (!live.current) return
    shownAt.current = performance.now()
    said.current = { around: false, close: false }
    locked.current = false
    const done = waitStep()
    void (async () => {
      await say(promptOf(it), hereKey)
      // 一起練的答案本來就在發光，第二段提醒什麼都不用做
      if (live.current && stepRef.current === my) idle.start({ repeat: () => void say(promptOf(it), hereKey), hint: () => {} })
    })()
    await done
  }

  // ── 自己答 ─────────────────────────────────────────────────
  const quiz = async (it: SheetItem, afterGuide: boolean) => {
    const my = ++stepRef.current
    idle.stop()
    phaseRef.current = 'quiz'
    taps.current = []
    hintUsed.current = false
    wrongs.current = 0
    stats.current = { tries: 0, open: 0, rejected: 0, loops: [], pen: 0 }
    said.current = { around: false, close: false }
    setPhase('quiz')
    lay(it)
    setMood('idle')
    await reveal()
    if (!live.current || stepRef.current !== my) return
    locked.current = false
    shownAt.current = performance.now()
    if (afterGuide) await say(`teach.turn.${host}`, promptOf(it))
    else await say(promptOf(it))
    if (live.current && stepRef.current === my)
      idle.start({
        repeat: () => void say(promptOf(it)),
        // 還沒找到的慢慢發光，不說話；看了提示就不算第一次答對
        hint: () => {
          hintUsed.current = true
          setHint(true)
        },
      })
  }

  /** 出下一題：先決定這題要不要教 */
  const present = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    // 這題出什麼、要不要先教、要不要先示範怎麼圈（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份）
    const { it, lv, fresh, pen, walk } = planSheet(def, make, mode, round.current, i)
    itemLevel.current = lv
    preload([promptOf(it), hereKey, ...it.teach.lines, ...it.things.flatMap((t) => (t.say ? [t.say] : [])), `teach.turn.${host}`, `ws.done.${host}`])

    if (fresh) {
      await teach(it, false)
      if (!live.current) return
    }
    if (pen) {
      await penShow(it)
      if (!live.current) return
    }
    taughtItem.current = fresh || pen || walk
    if (fresh || pen || walk) {
      await guided(it, pen)
      if (!live.current) return
    }
    return quiz(it, fresh || pen || walk)
  }

  /** 答對（或重教完）到下一題：剛教的新概念多停一下，複習題維持輕快 */
  const next = async (ms = nextPause(taughtItem.current)) => {
    await wait(ms)
    if (!live.current) return
    const n = idxRef.current + 1
    if (n >= ITEMS) return onDone({ items: ITEMS, firstTry: firstTries.current })
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

  const lassoMetrics = () => {
    const s = stats.current
    const avg = (f: (l: LoopStat) => number) => (s.loops.length ? Math.round((s.loops.reduce((a, l) => a + f(l), 0) / s.loops.length) * 100) / 100 : 0)
    return {
      lassoTries: s.tries,
      lassoOpen: s.open,
      lassoRejected: s.rejected,
      lassoLoops: s.loops.length,
      circularity: avg((l) => l.circ),
      gapRatio: avg((l) => l.gap),
      loopMs: Math.round(avg((l) => l.ms)),
      pen: s.pen,
    }
  }

  /** 自己答錯兩次：重新教一次，再一起練 */
  const reteach = async (it: SheetItem) => {
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
      responseMs: taps.current[0]?.ms ?? 0,
      hintUsed: true,
      metrics: { retaught: 1, wrong: wrongs.current, found: foundRef.current.length, ...(mode === 'lasso' ? lassoMetrics() : {}) },
    })
    reportLevel(def.id, false, def.maxLevel)
    await wait(500)
    await say(`teach.again.${host}`)
    if (!live.current) return
    await teach(it, true)
    if (!live.current) return
    await guided(it)
    // 一起練答對時已經停過了（GUIDED_TO_QUIZ），不用再多等
    if (live.current) next(PACE.NEXT_REVIEW)
  }

  const finishQuiz = async (it: SheetItem) => {
    const firstTry = wrongs.current === 0 && !hintUsed.current
    if (firstTry) firstTries.current++
    setMood('cheer')
    void logAttempt({
      ...base(it),
      phase: 'quiz',
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: Math.round(performance.now() - shownAt.current),
      hintUsed: hintUsed.current,
      metrics: { wrong: wrongs.current, targets: targets(it).length, things: it.things.length, ...(mode === 'lasso' ? lassoMetrics() : {}) },
    })
    const change = reportLevel(def.id, firstTry, def.maxLevel)
    sfx.correct()
    const lines = [`ws.done.${host}`, praiseKey(host)]
    if (change === 'up') lines.push('levelup')
    await say(...lines)
    next()
  }

  /** 點到或圈到一些東西：全部都對才收下；有錯的就整筆不算，說出那是什麼 */
  const pick = async (ids: string[], loop?: string) => {
    const it = itemRef.current
    if (!it || locked.current) return
    idle.poke()
    const fresh = ids.filter((id) => !foundRef.current.includes(id) && !wrongRef.current.includes(id))
    if (!fresh.length) return
    const things = fresh.map((id) => it.things.find((t) => t.id === id)!)
    const bad = things.filter((t) => !t.ok)
    const ms = Math.round(performance.now() - shownAt.current)
    fresh.forEach((id) => taps.current.push({ pick: id, ms }))

    if (bad.length) {
      sfx.gentle()
      setShake({ ids: bad.map((b) => b.id), k: Date.now() })
      if (loop) {
        stats.current.rejected++
        setMiss({ d: loop, k: Date.now() })
      }
      // 一起練不會答錯：不扣分，再指一次（這是回饋，不算閒置提醒）
      if (phaseRef.current === 'guided') return void say(hereKey)
      wrongs.current++
      if (mode === 'tap') {
        wrongRef.current = [...wrongRef.current, ...bad.map((b) => b.id)]
        setWrong(wrongRef.current)
      }
      if (wrongs.current >= 2) return reteach(it)
      await say(bad[0].say ?? retryKey(host))
      return idle.poke()
    }

    foundRef.current = [...foundRef.current, ...fresh]
    setFound(foundRef.current)
    setBurst({ id: fresh[fresh.length - 1], k: Date.now() })
    if (loop) setLoops((l) => [...l, { d: loop, k: Date.now() }])
    const n = foundRef.current.length
    sfx.count(n)
    const total = targets(it).length
    if (n < total) return void say(numKey(n))

    locked.current = true
    stepRef.current++
    idle.stop()
    await say(numKey(n))
    if (!live.current) return
    if (phaseRef.current === 'guided') {
      setMood('cheer')
      sfx.correct()
      void logAttempt({
        ...base(it),
        phase: 'guided',
        taps: taps.current,
        firstTryCorrect: taps.current.length === total,
        attempts: taps.current.length,
        responseMs: Math.round(performance.now() - shownAt.current),
        hintUsed: true,
        ...(mode === 'lasso' ? { metrics: lassoMetrics() } : {}),
      })
      await say(praiseKey(host))
      // 答對的動畫跑完、孩子看清楚了，才換「Your turn!」
      await wait(PACE.GUIDED_TO_QUIZ)
      if (live.current) release()
      return
    }
    finishQuiz(it)
  }

  // ── 圈選：筆跡交給 Ink（有防手掌誤觸），放開筆時判斷圈到了什麼 ──────
  const onDown = (p: Pt) => {
    stroke.current = [p]
    strokeAt.current = performance.now()
    if (!locked.current) idle.poke()
  }
  const onMove = (p: Pt) => {
    stroke.current.push(p)
  }
  const onUp = () => {
    const raw = stroke.current
    stroke.current = []
    // 孩子的筆跡先清掉：圈到的會換成留在紙上的蠟筆圈，沒圈到的淡淡消失
    ink.current?.clear()
    const it = itemRef.current
    if (locked.current || !it || raw.length < 2) return
    idle.poke()
    const sp = spotsRef.current
    const shape = analyzeLasso(raw)
    if (pointer.current === 'pen') stats.current.pen = 1
    // 點一下（不是圈）：提醒一次要「圈起來」
    if (shape.perimeter < 70) {
      const hit = it.things.findIndex((_, i) => dist(raw[0], sp[i]) < sp[i].size * 0.6)
      if (hit >= 0 && !said.current.around) {
        said.current.around = true
        void say('ws.lasso.around')
      }
      return
    }
    stats.current.tries++
    const d = smoothPath(shape.poly, true)
    if (!shape.closed) {
      stats.current.open++
      sfx.gentle()
      setMiss({ d: smoothPath(shape.poly), k: Date.now() })
      if (!said.current.close) {
        said.current.close = true
        void say('ws.lasso.close')
      }
      return
    }
    let ids = it.things.filter((_, i) => winding(sp[i], shape.poly) !== 0).map((t) => t.id)
    if (!ids.length) {
      // 圈在東西「上面」（圈得比東西小）：圈的中心落在東西上、圈又不比它大太多，也算圈到
      const i = it.things.findIndex((_, j) => dist(shape.centroid, sp[j]) < sp[j].size * 0.5 && shape.span < sp[j].size * 1.9)
      if (i >= 0) ids = [it.things[i].id]
    }
    stats.current.loops.push({ circ: shape.circularity, gap: shape.gapRatio, ms: Math.round(performance.now() - strokeAt.current) })
    if (!ids.length) {
      sfx.gentle()
      setMiss({ d, k: Date.now() })
      return
    }
    void pick(ids, d)
  }

  // 孩子主動點恐龍：是孩子要聽的，不是閒置提醒；也算有操作
  const onHost = () => {
    if (card || !item) return
    idle.poke()
    if (phase === 'guided') void say(promptOf(item), hereKey)
    else void say(promptOf(item))
  }

  const guide = phase === 'guided'
  const firstLeft = item && guide && !demo ? item.things.findIndex((t) => t.ok && !found.includes(t.id)) : -1
  // 蠟筆圈用站點的深色（SVG 屬性不吃 CSS 變數，直接給色碼）
  const deep = stationDef(def.station).deep
  return (
    <Shell station={def.station} mood={mood} progress={{ total: ITEMS, done: idx }} onExit={onExit} onHost={onHost} demo={!!demo}>
      {/* 教學卡在原地淡入、學習單在後面淡掉；換題時新的學習單蓋在舊的上面淡入（ui/Scenes.tsx） */}
      <CardStage
        card={
          card && (
          <SheetTeach
            key={`teach-${card.n}`}
            items={card.it.teach.examples.map((v, i) => (
              <div key={i} style={{ width: '86cqmin', height: '86cqmin' }}>
                <ThingView v={v} />
              </div>
            ))}
            lines={card.it.teach.lines}
            short={card.short}
            onDone={release}
          />
          )
        }
      >
        {item && (
          <Swap id={view} className="sheet-area">
            {(quiet) => (
              <div className="sheet-board" onPointerDownCapture={(e) => (pointer.current = e.pointerType)}>
                {item.things.map((t, i) => {
                  const s = spots[i]
                  if (!s) return null
                  const isFound = found.includes(t.id)
                  const isWrong = wrong.includes(t.id)
                  const glow = guide && t.ok && !isFound && !demo
                  const dim = guide && !t.ok
                  const shaking = shake.ids.includes(t.id)
                  return (
                    <motion.button
                      key={t.id}
                      className={`sheet-thing${dim ? ' dim' : ''}`}
                      aria-label={`第 ${i + 1} 個`}
                      // 開發模式才標出答案，方便自動測試
                      data-ok={import.meta.env.DEV ? String(t.ok) : undefined}
                      style={{ left: pct(s.x, BOARD_W), top: pct(s.y, BOARD_H), width: pct(s.size, BOARD_W), pointerEvents: mode === 'tap' ? 'auto' : 'none' }}
                      initial={quiet ? false : { scale: 0.86 }}
                      animate={
                        shaking
                          ? { x: [0, -12, 12, -8, 8, 0], scale: 1, opacity: isWrong ? 0.4 : 1 }
                          : isFound
                            ? { scale: [1, 1.12, 1.04], opacity: 1 }
                            : dim
                              ? { scale: 0.9, opacity: 0.32 }
                              : { scale: 1, opacity: isWrong ? 0.4 : 1 }
                      }
                      transition={shaking ? { duration: 0.45 } : { type: 'spring', stiffness: 340, damping: 20, delay: isFound || isWrong ? 0 : 0.06 * i, opacity: FADE }}
                      whileTap={mode === 'tap' ? { scale: 0.93 } : undefined}
                      onPointerDown={mode === 'tap' ? () => void pick([t.id]) : undefined}
                    >
                      {glow && <span className="sheet-glow" aria-hidden="true" />}
                      {hint && t.ok && !isFound && <span className="nudge-glow" aria-hidden="true" />}
                      <div className="art" style={{ rotate: `${s.rot}deg` }}>
                        <ThingView v={t.v} />
                      </div>
                      {burst?.id === t.id && <Sparkles key={burst.k} />}
                    </motion.button>
                  )
                })}

                <svg className="sheet-svg" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} aria-hidden="true">
                  {/* 點選版：找到的用蠟筆圈起來，像紙本的作答 */}
                  {mode === 'tap' &&
                    item.things.map((t, i) =>
                      found.includes(t.id) && spots[i] ? (
                        <motion.path
                          key={t.id}
                          d={smoothPath(crayonLoop(spots[i].x, spots[i].y, spots[i].size * 0.64, i * 97 + 13))}
                          fill="none"
                          stroke={deep}
                          strokeWidth={9}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.85}
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                        />
                      ) : null,
                    )}
                  {/* 一起練（圈選）：還沒圈的外面有一圈虛線，照著圈就好 */}
                  {mode === 'lasso' &&
                    guide &&
                    !demo &&
                    item.things.map((t, i) =>
                      t.ok && !found.includes(t.id) && spots[i] ? (
                        <circle key={t.id} className="nudge-path" cx={spots[i].x} cy={spots[i].y} r={spots[i].size * 0.68} fill="none" stroke="#C9A23E" strokeWidth={6} strokeDasharray="14 14" strokeLinecap="round" />
                      ) : null,
                    )}
                  {mode === 'lasso' &&
                    loops.map((l) => (
                      <motion.path key={l.k} d={l.d} fill="none" stroke={deep} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" initial={{ opacity: 0.4 }} animate={{ opacity: 0.88 }} />
                    ))}
                  <AnimatePresence>
                    {miss && (
                      <motion.path
                        key={miss.k}
                        d={miss.d}
                        fill="none"
                        stroke="rgba(46,42,37,0.4)"
                        strokeWidth={9}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ opacity: 0.8 }}
                        animate={{ opacity: 0 }}
                        transition={{ duration: 0.9, ease: 'easeOut' }}
                        onAnimationComplete={() => setMiss((m) => (m?.k === miss.k ? null : m))}
                      />
                    )}
                  </AnimatePresence>
                  {demo && (
                    <g>
                      <path d={demo.d} fill="none" stroke={deep} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" opacity={0.88} />
                      <g transform={`translate(${demo.pen.x} ${demo.pen.y})`}>
                        <PenArt scale={1.5} color="#F0B088" />
                      </g>
                    </g>
                  )}
                </svg>

                {mode === 'tap' && firstLeft >= 0 && spots[firstLeft] && (
                  <Hand x={(spots[firstLeft].x / BOARD_W) * 100 + 3} y={(spots[firstLeft].y / BOARD_H) * 100 + 6} size="9cqmin" beckon />
                )}
                {mode === 'lasso' && <Ink ref={inkRef} w={BOARD_W} h={BOARD_H} color="rgba(46,42,37,0.62)" size={11} ink={!demo} onDown={onDown} onMove={onMove} onUp={onUp} />}
              </div>
            )}
          </Swap>
        )}
      </CardStage>
    </Shell>
  )
}
