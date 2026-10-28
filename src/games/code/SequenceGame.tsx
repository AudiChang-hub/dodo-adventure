import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Emoji } from '../../art/Emoji'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef } from '../../content/games'
import { seqSkill, type Story } from '../../content/code'
import { markPlayed, plays, reportLevel } from '../../lib/adaptive'
import { planSequence, roundState } from '../pick'
import { logAttempt, logTeach } from '../../lib/record'
import type { Phase } from '../../lib/db'
import { hushSpeech, preload, say, sfx, stopSpeech } from '../../lib/audio'
import { shuffle } from '../../lib/random'
import { praiseKey, wait } from '../lines'
import { PACE, nextPause } from '../pace'
import { hit, useTapDrag } from './drag'
import { GhostView, GuideLoop, HandView, demoCarry, useCarry, useLadder, type Box } from './carry'
import type { Mood } from '../../art/Dino'
import { Swap, useSwapRef } from '../../ui/Scenes'
import { FADE } from '../../ui/motion'
import './code.css'
import './seq.css'

const ROUNDS = 4

/** 洗牌，而且不能剛好就是正確順序（也盡量不要和上一次一樣） */
function scramble(n: number, avoid?: number[]): number[] {
  const id = Array.from({ length: n }, (_, i) => i)
  let o = id
  for (let k = 0; k < 20; k++) {
    o = shuffle(id)
    const sorted = o.every((v, i) => v === i)
    const again = avoid && o.every((v, i) => v === avoid[i])
    if (!sorted && !again) break
  }
  return o
}

type Stage = 'demo' | Phase

/**
 * 排順序（PRD §10，3–4 歲的「順序」）：一個生活或大自然的小故事，圖片打亂，
 * 孩子依序把「先發生的、再來的」放進上面的空格，每放好一張就念那一張的旁白。
 *
 * 2026-10-28 依 docs/玩法看得懂盤點.md（排順序、全站共通規範）改：
 * - 空格跟圖卡一樣大（虛線框），下一個要放的格子會脈動。
 * - 示範不再是「排好的教學卡」：手一張一張把卡片拿起來、放進空格，每放一張念一句（First, rain. Then, a rainbow!）。
 * - 點一下卡片就自己飛進下一格（3 歲拖不穩）；拖過去放也可以。
 * - 一起練：下一張發光，手從它滑到空格、一直重複。
 * - 閒置：5 秒下一格脈動得更明顯 → 10 秒排好的圖照順序跳一次、再問一次 → 20 秒手再示範一次（半透明、做完拿回去）→ 35 秒下一張發光。
 * - 放錯：卡片放進去接不住、搖一搖彈回來，上面那一排晃一下，下一格用力脈動；第二次錯（只剩兩張時第一次錯就是）手示範一次。
 * 最後一張只剩一個選擇時自動放好，不做假的決定。
 */
export function SequenceGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [idx, setIdx] = useState(0)
  const [st, setSt] = useState<Story | null>(null)
  const [tray, setTray] = useState<number[]>([])
  const [placed, setPlaced] = useState<number[]>([])
  const [stage, setStage] = useState<Stage>('quiz')
  const [away, setAway] = useState<number | null>(null)
  const [nudge, setNudge] = useState<{ k: number; n: number } | null>(null)
  const [shake, setShake] = useState(0)
  const [pulse, setPulse] = useState<1 | 2>(1)
  const [hintOn, setHintOn] = useState(false)
  const [loopOff, setLoopOff] = useState(false)
  const [guideBox, setGuideBox] = useState<{ from: Box; to: Box } | null>(null)
  const [hop, setHop] = useState<{ i: number; n: number } | null>(null)
  const [done, setDoneView] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  const [view, setView] = useState(0)

  const live = useRef(true)
  const locked = useRef(true)
  const busy = useRef(false)
  const stRef = useRef<Story | null>(null)
  const placedRef = useRef<number[]>([])
  const trayRef = useRef<number[]>([])
  const stageRef = useRef<Stage>('quiz')
  const stepRef = useRef(0)
  const idxRef = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const wrongs = useRef(0)
  /** 點錯的次數（一起練也算，記錄用；一起練點錯不會被放進去） */
  const misses = useRef(0)
  const hintUsed = useRef(false)
  /** 這一題答錯後手示範過（記錄用，相當於以前的重教） */
  const showed = useRef(false)
  const lv = useRef(1)
  const firstTries = useRef(0)
  const round = useRef({ ...roundState(plays(def.id) === 0), stories: [] as Story[] })
  /** 這一題剛走過示範或一起練：答對後多停一下再換題 */
  const taughtItem = useRef(false)
  const resolver = useRef<(() => void) | null>(null)
  const hopN = useRef(0)
  const replayTok = useRef(0)
  const demoTok = useRef(0)
  const demoOn = useRef(false)
  /** 閒置提示的手正在示範（畫面要知道：孩子可以直接從手上搶過卡片） */
  const [demoLive, setDemoLive] = useState(false)
  const setDemo = (v: boolean) => {
    demoOn.current = v
    setDemoLive(v)
  }
  const dragging = useRef<{ k: number; drop: boolean } | null>(null)

  // 換題時新舊兩塊會疊著一下子：ref 跟著新的那一塊，舊的卸載時不清掉
  const stripEl = useRef<HTMLDivElement | null>(null)
  const stripRef = useSwapRef(stripEl)
  const stage0 = useRef<HTMLDivElement>(null)
  const slotEls = useRef<HTMLElement[]>([])
  const cardEls = useRef<Record<number, HTMLElement>>({})
  const carry = useCarry<number>(stage0)
  const ladder = useLadder()

  const waitStep = () => new Promise<void>((res) => (resolver.current = res))
  const release = () => {
    const r = resolver.current
    resolver.current = null
    r?.()
  }

  const question = () => (placedRef.current.length === 0 ? 'c.seq.first' : 'c.seq.next')
  const cardBox = (k: number) => carry.box(cardEls.current[k])
  const nextSlotBox = () => carry.box(slotEls.current[placedRef.current.length])

  const setup = (s: Story, avoid?: number[]) => {
    stRef.current = s
    setSt(s)
    const o = scramble(s.icons.length, avoid)
    trayRef.current = o
    setTray(o)
    placedRef.current = []
    setPlaced([])
    setHintOn(false)
    setDoneView(false)
    setAway(null)
    setNudge(null)
    setPulse(1)
    setHop(null)
    setView((v) => v + 1)
    cardEls.current = {}
    taps.current = []
    wrongs.current = 0
    misses.current = 0
    hintUsed.current = false
    showed.current = false
    return o
  }

  const base = (s: Story) => ({
    station: def.station,
    game: def.id,
    itemId: s.id,
    skill: seqSkill(s),
    level: lv.current,
    options: trayRef.current.map((i) => s.icons[i]),
    answer: s.icons.join(','),
  })

  /** 把第 k 張（故事裡的順序）放進下一格，並念它的旁白 */
  const put = (s: Story, k: number) => {
    const p = [...placedRef.current, k]
    placedRef.current = p
    setPlaced(p)
    trayRef.current = trayRef.current.filter((x) => x !== k)
    setAway(null)
    setPulse(1)
    sfx.clack()
    return say(`c.seq.${s.id}.${k}`)
  }

  /** 排好的圖照順序跳一次（故事再演一次） */
  const replay = async () => {
    const r = ++replayTok.current
    const n = placedRef.current.length
    for (let i = 0; i < n; i++) {
      if (!live.current || replayTok.current !== r) return
      setHop({ i, n: ++hopN.current })
      sfx.chime(i)
      await wait(420)
    }
    if (live.current && replayTok.current === r) {
      // 最後一拍：下一格用力脈動一下
      setPulse(2)
      setHop(null)
    }
  }

  const cancelDemo = () => {
    if (!demoOn.current) return
    setDemo(false)
    demoTok.current++
    carry.clear()
    setAway(null)
    setLoopOff(false)
  }

  /** 閒置或答錯後：半透明的手把下一張拿到下一格、停一下、再拿回去（不替孩子作答） */
  const hintDemo = async () => {
    const s = stRef.current
    const k = placedRef.current.length
    const from = cardBox(k)
    const to = nextSlotBox()
    if (!s || !from || !to) return
    hintUsed.current = true
    const d = ++demoTok.current
    setDemo(true)
    setLoopOff(true)
    await demoCarry(carry, k, from, to, {
      alive: () => live.current && demoTok.current === d,
      keep: false,
      faint: true,
      onLift: () => setAway(k),
      onBack: () => setAway(null),
    })
    if (demoTok.current !== d) return
    setDemo(false)
    setLoopOff(false)
  }

  /** 每放好一張（或剛出題）：閒置提示從頭計時 */
  const startLadder = (my: number) => {
    let asked = false
    ladder.start([
      { at: 5000, run: () => setPulse(2) },
      {
        at: 10_000,
        run: () =>
          void replay().then(() => {
            if (!asked && live.current && stepRef.current === my) {
              asked = true
              void say(question())
            }
          }),
      },
      { at: 20_000, run: () => void hintDemo() },
      {
        at: 35_000,
        run: () => {
          if (stageRef.current === 'guided') return
          hintUsed.current = true
          setHintOn(true)
        },
      },
    ])
  }

  // ── 我示範：手一張一張放進空格，每放一張念一句 ──────────────────
  const demo = async (s: Story, intro: boolean) => {
    const my = ++stepRef.current
    const ok = () => live.current && stepRef.current === my
    stageRef.current = 'demo'
    setStage('demo')
    locked.current = true
    setMood('happy')
    setup(s)
    const start = performance.now()
    await Promise.all([say(...(intro ? [def.intro] : []), 'teach.watch.bobo'), wait(700)])
    for (let k = 0; k < s.icons.length; k++) {
      if (!ok()) return
      const from = cardBox(k)
      const to = nextSlotBox()
      if (!from || !to) break
      let landed: Promise<void> = Promise.resolve()
      await demoCarry(carry, k, from, to, {
        alive: ok,
        keep: true,
        onLift: () => setAway(k),
        onLand: () => {
          landed = put(s, k)
        },
      })
      await landed
      await wait(250)
    }
    if (!ok()) return
    setDoneView(true)
    setMood('cheer')
    sfx.correct()
    await wait(PACE.DEMO_HOLD)
    void logTeach({ station: def.station, game: def.id, itemId: s.id, skill: seqSkill(s), level: lv.current, ms: Math.round(performance.now() - start), retaught: false })
  }

  /** 一起練或自己答：同一個故事、重新洗牌 */
  const ask = async (s: Story, ph: Phase, o: { afterGuide?: boolean; intro?: boolean; avoid?: number[] } = {}) => {
    const my = ++stepRef.current
    stageRef.current = ph
    setStage(ph)
    const order = setup(s, o.avoid)
    setMood(ph === 'guided' ? 'happy' : 'idle')
    setLoopOff(false)
    locked.current = true
    await wait(320)
    if (!live.current || stepRef.current !== my) return order
    locked.current = false
    t0.current = performance.now()
    const finished = waitStep()
    void (async () => {
      await say(...(o.intro ? [def.intro] : []), ...(o.afterGuide ? ['teach.turn.bobo'] : []), 'c.seq.first', ...(ph === 'guided' ? ['teach.here.bobo'] : []))
      if (live.current && stepRef.current === my) startLadder(my)
    })()
    await finished
    return order
  }

  const present = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    // 這題排哪個故事、要不要先教（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份）
    const { s, lv: l, fresh, walk } = planSequence(def, round.current, i)
    lv.current = l
    preload([...s.lines.map((_, k) => `c.seq.${s.id}.${k}`), 'c.seq.first', 'c.seq.next', 'teach.here.bobo', 'teach.turn.bobo', 'teach.watch.bobo'])
    let intro = i === 0
    if (fresh) {
      await demo(s, intro)
      intro = false
      if (!live.current) return
    }
    taughtItem.current = fresh || walk
    if (fresh || walk) {
      // 一起練答對後的停頓在 GUIDED_TO_QUIZ（finish 裡），這裡不用再等
      const g = await ask(s, 'guided', { intro })
      if (!live.current) return
      return ask(s, 'quiz', { afterGuide: true, avoid: g })
    }
    return ask(s, 'quiz', { intro })
  }

  /** 答對到下一題：剛教的新內容多停一下，複習題維持輕快 */
  const next = async (ms = nextPause(taughtItem.current)) => {
    await wait(ms)
    if (!live.current) return
    const n = idxRef.current + 1
    if (n >= ROUNDS) return onDone({ items: ROUNDS, firstTry: firstTries.current })
    present(n)
  }

  useEffect(() => {
    live.current = true
    const boot = window.setTimeout(() => {
      markPlayed(def.id)
      // 開場說明和第一題一起出現（不先讓孩子看空的舞台）
      if (live.current) present(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      ladder.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 一起練、最後一階提示的手：量好下一張卡和下一格（換題、放好一張之後重量）
  const guideOn = (stage === 'guided' || hintOn) && !done
  useLayoutEffect(() => {
    if (!guideOn || !st) return setGuideBox(null)
    const t = window.setTimeout(() => {
      const from = cardBox(placedRef.current.length)
      const to = nextSlotBox()
      setGuideBox(from && to ? { from, to } : null)
    }, 380)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideOn, st, view, placed])

  // ── 孩子的操作 ─────────────────────────────────────────────
  const touched = () => {
    ladder.poke()
    cancelDemo()
    replayTok.current++
    setHop(null)
  }

  /** 卡片已經在下一格上了：對就放好，不對就彈回去 */
  const judge = async (k: number) => {
    const s = stRef.current!
    const my = stepRef.current
    const ok = () => live.current && stepRef.current === my
    const want = placedRef.current.length
    taps.current.push({ pick: s.icons[k], ms: Math.round(performance.now() - t0.current) })
    if (k === want) {
      locked.current = true
      stepRef.current++
      ladder.stop()
      carry.drop()
      setHintOn(false)
      busy.current = false
      await put(s, k)
      if (!live.current) return
      // 只剩一張：不用選，自動飛進去
      if (trayRef.current.length === 1) {
        const last = trayRef.current[0]
        const from = cardBox(last)
        const to = nextSlotBox()
        await wait(200)
        if (from && to) {
          carry.lift(last, from)
          setAway(last)
          await carry.glide(to, 420)
          carry.drop()
        }
        await put(s, last)
        if (!live.current) return
      }
      if (trayRef.current.length === 0) return finish(s)
      locked.current = false
      const step = stepRef.current
      await say('c.seq.next')
      if (live.current && stepRef.current === step) startLadder(step)
      return
    }

    // 放錯了：接不住、搖一搖彈回去，上面那一排晃一下
    misses.current++
    hushSpeech()
    sfx.boing()
    carry.wobble()
    setShake((x) => x + 1)
    await wait(560)
    if (!ok()) return
    const home = cardBox(k)
    if (home) await carry.glide(home, 460, false)
    carry.drop()
    setAway(null)
    busy.current = false
    setNudge({ k, n: Date.now() })
    setPulse(2)
    if (!ok() || stageRef.current === 'guided') return
    wrongs.current++
    // 第二次錯（只剩兩張時第一次錯就是）：手示範一次，下一張發光（盤點 8-3）
    if (wrongs.current >= 2 || trayRef.current.length <= 2) {
      showed.current = true
      await wait(300)
      await hintDemo()
      if (!ok()) return
      hintUsed.current = true
      setHintOn(true)
    }
    ladder.poke()
  }

  /** 點一下：卡片自己飛進下一格 */
  const choose = async (k: number) => {
    if (!stRef.current || locked.current || busy.current) return
    touched()
    const from = cardBox(k)
    const to = nextSlotBox()
    if (!from || !to) return
    busy.current = true
    sfx.tap()
    carry.lift(k, from)
    setAway(k)
    await carry.glide(to, 440)
    if (live.current) void judge(k)
  }

  /** 閒置提示的手拿著卡片時，孩子直接點它：從手上搶過來、飛進下一格 */
  const grabDemo = async () => {
    const k = carry.holding()
    const to = nextSlotBox()
    if (!demoOn.current || locked.current || busy.current || k === null || !to) return
    ladder.poke()
    replayTok.current++
    setDemo(false)
    demoTok.current++
    busy.current = true
    setLoopOff(true)
    carry.handOff()
    sfx.tap()
    await carry.glide(to, 300)
    setLoopOff(false)
    if (live.current) void judge(k)
  }

  const goHome = async (k: number) => {
    const home = cardBox(k)
    if (home) await carry.glide(home, 320, false)
    carry.drop()
    setAway(null)
    dragging.current = null
    busy.current = false
  }

  const drag = useTapDrag<number>({
    enabled: () => !locked.current && (!busy.current || !!dragging.current),
    onPoke: () => touched(),
    onTap: (k) => void choose(k),
    // 拖到上面那一排放開＝放進下一格；拖到別的地方就放回去
    onDrop: async (k, x, y) => {
      const d = dragging.current
      if (!d || d.k !== k) return
      d.drop = true
      const to = nextSlotBox()
      if (to && hit(stripEl.current, x, y, 30)) {
        await carry.glide(to, 160)
        dragging.current = null
        if (live.current) void judge(k)
        return
      }
      void goHome(k)
    },
  })

  useEffect(() => {
    const g = drag.ghost
    const d = dragging.current
    if (!g) {
      if (d && !d.drop) void goHome(d.k)
      return
    }
    if (!d) {
      if (busy.current) return
      const from = cardBox(g.item)
      if (!from) return
      busy.current = true
      dragging.current = { k: g.item, drop: false }
      carry.lift(g.item, from)
      setAway(g.item)
    } else if (d.k !== g.item) return
    const p = carry.point(g.x, g.y)
    if (p) carry.follow(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.ghost])

  const finish = async (s: Story) => {
    setDoneView(true)
    setMood('cheer')
    sfx.correct()
    const ph = stageRef.current as Phase
    const firstTry = misses.current === 0 && !hintUsed.current
    void logAttempt({
      ...base(s),
      phase: ph,
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: 1 + wrongs.current,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: ph === 'guided' || hintUsed.current,
      metrics: { steps: s.icons.length, wrongTaps: wrongs.current, ...(showed.current ? { retaught: 1 } : {}) },
    })
    if (ph === 'guided') {
      await say(praiseKey('bobo'))
      // 排好的故事和答對的動畫停留一下，才換「Your turn!」
      await wait(PACE.GUIDED_TO_QUIZ)
      return release()
    }
    if (firstTry) firstTries.current++
    const change = reportLevel(def.id, firstTry, def.maxLevel, { skill: seqSkill(s) })
    await say(praiseKey('bobo'), ...(change === 'up' ? ['levelup'] : []))
    release()
    next()
  }

  /** 點空格：排好的圖跳一次、下一格脈動（放不進去的地方點了也有反應） */
  const onStrip = () => {
    if (locked.current || busy.current) return
    touched()
    void replay()
  }

  const onHost = () => {
    if (locked.current || !st) return
    touched()
    void say(question(), ...(stage === 'guided' ? ['teach.here.bobo'] : []))
  }

  const want = placed.length
  const lead = stage === 'guided' || hintOn
  const showLoop = lead && !!guideBox && !loopOff && !done && !busy.current

  return (
    <Shell station={def.station} mood={mood} progress={{ total: ROUNDS, done: idx }} onExit={onExit} onHost={onHost}>
      <div ref={stage0} className="seq-stage">
        {st && (
          <Swap id={view} className="seq">
            {(quiet) => (
              <>
                {/* 一排跟圖卡一樣大的空格：1、2、3…，故事從左讀到右 */}
                <motion.div
                  key={shake}
                  ref={stripRef}
                  className="seq-strip"
                  animate={shake ? { x: [0, -10, 9, -5, 0] } : {}}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  onPointerDown={onStrip}
                >
                  {st.icons.map((_, i) => {
                    const k = placed[i]
                    const next = i === placed.length && !done
                    return (
                      <div key={i} className="prog-cell">
                        {i > 0 && <span className="prog-chev" aria-hidden="true" />}
                        <div
                          ref={(el) => {
                            if (el) slotEls.current[i] = el
                          }}
                          className={`seq-slot${k !== undefined ? ' is-full' : ''}${next ? ` is-next pulse-${pulse}` : ''}`}
                        >
                          <span className="prog-num" aria-hidden="true">
                            {i + 1}
                          </span>
                          {k !== undefined && (
                            <SeqHop n={hop?.i === i ? hop.n : 0} done={done} i={i}>
                              <div className={`seq-card in-slot${done ? ' is-done' : ''}`}>
                                <div className="tile-in">
                                  <Emoji name={st.icons[k]} />
                                </div>
                                {done && i === st.icons.length - 1 && <Sparkles count={14} />}
                              </div>
                            </SeqHop>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </motion.div>

                {/* 打亂的圖：位置固定，放上去的那一張留下空位（不會一放就整排擠過去） */}
                <div className="seq-tray">
                  {tray.map((k, j) => {
                    const used = placed.includes(k)
                    const lit = !used && k === want && lead
                    const dim = stage === 'guided' && !used && k !== want
                    const nudged = nudge?.k === k
                    return (
                      <div key={k} className="seq-spot">
                        <motion.button
                          ref={(el: HTMLButtonElement | null) => {
                            if (el) cardEls.current[k] = el
                          }}
                          className={`seq-card${lit ? ' guide' : ''}${dim ? ' dim' : ''}${used || away === k ? ' is-away' : ''}`}
                          aria-label={`圖 ${j + 1}`}
                          data-k={k}
                          initial={quiet ? false : { y: 28, scale: 0.94 }}
                          animate={nudged ? { x: [0, -12, 12, -7, 0], y: 0, opacity: 1, scale: 1 } : { x: 0, y: 0, opacity: dim ? 0.38 : 1, scale: dim ? 0.9 : 1 }}
                          whileTap={{ scale: 0.94 }}
                          transition={{ type: 'spring', stiffness: 360, damping: 22, delay: nudged ? 0 : 0.06 * j, opacity: FADE }}
                          {...drag.bind(k)}
                        >
                          <div className="tile-in">
                            <Emoji name={st.icons[k]} />
                          </div>
                        </motion.button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Swap>
        )}
        {showLoop && guideBox && <GuideLoop key={`${view}-${want}`} from={guideBox.from} to={guideBox.to} />}
        <GhostView
          ghost={carry.ghost}
          className="seq-ghost"
          render={(k) =>
            st && (
              <div className="seq-card">
                <div className="tile-in">
                  <Emoji name={st.icons[k]} />
                </div>
              </div>
            )
          }
          onGrab={demoLive && stage !== 'demo' ? () => void grabDemo() : undefined}
        />
        <HandView hand={carry.hand} />
        {/* 給自動測試看現在是哪一段（畫面上看不到） */}
        <span hidden data-stage={stage} data-story={st?.id} />
      </div>
    </Shell>
  )
}

/** 排好的圖跳一下（閒置時故事再演一次）；全部排好時一張一張跳（故事完成） */
function SeqHop({ n, done, i, children }: { n: number; done: boolean; i: number; children: ReactNode }) {
  if (done)
    return (
      <motion.div className="seq-hop" initial={{ y: 0 }} animate={{ y: [0, -16, 0] }} transition={{ duration: 0.5, delay: i * 0.18 }}>
        {children}
      </motion.div>
    )
  if (!n) return <div className="seq-hop">{children}</div>
  return (
    <motion.div key={n} className="seq-hop" initial={{ y: 0 }} animate={{ y: ['0%', '-12%', '0%'], scale: [1, 1.06, 1] }} transition={{ duration: 0.34, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}
