import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { WaitShield, localPoint, useNotYet } from '../NotYet'
import { useFlow } from '../barge'
import { useIdle } from '../idle'
import { wait } from '../lines'
import { PACE } from '../pace'
import { DoneChoices } from '../draw/DoneChoices'
import { SvgEmoji } from '../PlayEmoji'
import { say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { ANSWER_TAP, useTaps } from '../../ui/tap'
import { missLocked } from '../miss-lock'
import { pointIn, useLive } from '../logic/kit'
import { ANIMAL, HIDERS, OBJECTS, type Rel } from './data'
import { THING_ART } from './things'
import { Backdrop, GROUND, SCENE_H, SCENE_W } from './places'
import { WherePickArt } from './art'
import { whereCoplay } from './coplay'
import { atKey, findKey, isKey } from './lines'
import { loadWhere, saveWhere } from './progress'
import { WHERE_GAME, afterWhere, whereRound, type WhereQ, type WhereState } from './plan'
import '../draw/tools.css'
import './where.css'

/** 新的一題剛出來這麼久內點不算（上一題連點的手指，TOUCH-4） */
const ARM_MS = 300
/** 點到的那一隻「跑出來」的動畫 */
const OUT_MS = 650
/** 可以點的範圍至少這麼大（場景座標，平板上 > 2 cm，TOUCH-1），比看到的小動物大一圈 */
const HIT = 132

/**
 * 躲在哪裡（T-160，數學 MA-8 位置詞）：場景裡一樣大東西（桌子、床、車子、樹…），小動物躲在它的裡面、上面、下面。
 * 豆豆說「Find the cat ⋯ under the table.」，點對的那一隻：它跑出來（從箱子裡跳出來、從桌子底下鑽出來、在桌上跳一下），再念完整的一句「The cat is ⋯ under the table.」。
 * 點錯：那一隻輕輕跳一下，豆豆說「This one is ⋯ on the table.」，再說一次題目（不說錯）；第 2 次錯，對的那一隻有一圈黃色的框；第 3 次手帶著點。
 * 第一次到這一級：先示範一題（手點對的那一隻），下一題手在答案旁邊等（一起做）。發呆：15 秒再說一次、30 秒手點答案。
 * 一局 4 題（in、on、under 都會出現），找完停在「再一局／回首頁」。
 */
export function Where() {
  const prog = useRef<WhereState | null>(null)
  const [qs, setQs] = useState<WhereQ[] | null>(null)
  const [n, setN] = useState(0)
  const [rel, setRel] = useState<Rel>('under')
  const [resting, setResting] = useState(false)
  const deal = (p: WhereState) => {
    const mem = { sigs: p.sigs, places: p.places, objs: p.objs, hiders: p.hiders }
    const r = whereRound(p.level, mem)
    prog.current = { ...p, ...mem }
    void saveWhere(prog.current)
    return r
  }
  useEffect(() => {
    let on = true
    void loadWhere().then((p) => {
      if (!on || prog.current) return
      setQs(deal(p))
    })
    return () => {
      on = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const again = () => {
    const p = prog.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    setQs(deal(p))
    setN((k) => k + 1)
  }
  const hint = whereCoplay(rel)
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? hint.now : hint.play}>
      {qs && prog.current && <WhereRoundView key={n} qs={qs} prog={prog} onQ={setRel} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

type HandState = { at: number; tap: number; beckon: boolean } | null

function WhereRoundView({ qs, prog, onQ, onDone, onAgain, resting }: { qs: WhereQ[]; prog: { current: WhereState | null }; onQ: (r: Rel) => void; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const tap = useTaps()
  const live = useLive()
  const flow = useFlow()
  const idle = useIdle()
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement | null>(null)
  const els = useRef(new Map<number, SVGGElement | null>())

  const [qi, setQi] = useState(0)
  const [out, setOut] = useState<number | null>(null)
  const [nudge, setNudge] = useState<{ i: number; k: number } | null>(null)
  const [glow, setGlow] = useState<number | null>(null)
  const [hand, setHand] = useState<HandState>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [turn, setTurn] = useState(false)
  const st = useRef({ qi: 0, busy: true, demo: false, asking: false, armed: false, wrongs: 0, missAt: -Infinity, led: false, guided: false, taps: [] as { pick: string; ms: number }[], t0: 0 })
  const armTimer = useRef(0)
  const tally = useRef({ counted: 0, misses: 0 })

  const level = qs[0].level
  const [firstTime] = useState(() => !(prog.current?.taught.includes(level) ?? true))
  const phaseOf = (i: number): 'teach' | 'guided' | 'quiz' => (firstTime && i === 0 ? 'teach' : firstTime && i === 1 ? 'guided' : 'quiz')
  const showHand = (at: number, tapIt: boolean, beckon = false) => setHand((h) => ({ at, tap: tapIt ? (h?.tap ?? 0) + 1 : (h?.tap ?? 0), beckon }))

  const q = qs[qi]
  const target = (x: WhereQ) => x.hidden[x.answer]
  /** 題目：「Find the cat」＋「under the table.」 */
  const askKeys = (x: WhereQ) => [findKey(target(x).hider), atKey(target(x).rel, x.obj)]
  const tellKeys = (x: WhereQ, i = x.answer) => [isKey(x.hidden[i].hider), atKey(x.hidden[i].rel, x.obj)]

  const record = (i: number, how: { handPlaced?: boolean }) => {
    const s = st.current
    const x = qs[i]
    const phase = s.guided || s.led || how.handPlaced || phaseOf(i) === 'teach' ? 'guided' : 'quiz'
    const first = s.wrongs === 0 && !how.handPlaced
    void logAttempt({
      station: 'logic',
      game: WHERE_GAME,
      itemId: x.itemId,
      skill: x.skill,
      phase,
      level: x.level,
      options: x.hidden.map((h) => `${h.hider}:${h.rel}`),
      answer: `${target(x).hider}:${target(x).rel}`,
      taps: s.taps,
      firstTryCorrect: first,
      attempts: s.taps.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.wrongs >= 2 || s.led || !!how.handPlaced,
      heard: true,
      metrics: { ...(s.led ? { led: 1 } : {}), ...(how.handPlaced ? { shown: 1 } : {}), hidden: x.hidden.length },
    })
    if (phase === 'quiz') {
      tally.current.counted++
      if (!first) tally.current.misses++
    }
  }

  const finish = async () => {
    const ok = flow.begin(live)
    setAllDone(true)
    sfx.done()
    const p = prog.current
    if (p) {
      prog.current = afterWhere(p, tally.current)
      void saveWhere(prog.current)
    }
    await say('wh.done')
    if (!ok()) return
    if (bedtimeIfDue()) return
    onDone()
  }

  /** 找到了：那一隻跑出來，念完整的一句 */
  const reveal = async (i: number, ok: () => boolean) => {
    setOut(qs[st.current.qi].answer)
    sfx.correct()
    await wait(OUT_MS)
    if (!ok()) return false
    await say(...tellKeys(qs[i]))
    return ok()
  }

  const next = async (i: number) => {
    if (i + 1 < qs.length) present(i + 1)
    else await finish()
  }

  const runDemo = async (i: number) => {
    const s = st.current
    const x = qs[i]
    const ok = flow.begin(live)
    s.demo = true
    setDemo(true)
    setHold(true)
    const t0 = performance.now()
    await say('wh.intro', 'teach.watch.dodo', ...askKeys(x))
    if (!ok()) return
    showHand(x.answer, false)
    await wait(700)
    if (!ok()) return
    showHand(x.answer, true)
    await wait(300)
    if (!ok()) return
    setHand(null)
    if (!(await reveal(i, ok))) return
    await wait(PACE.DEMO_HOLD)
    if (!ok()) return
    await say('teach.turn.dodo')
    if (!ok()) return
    void logTeach({ station: 'logic', game: WHERE_GAME, itemId: x.itemId, skill: x.skill, level: x.level, ms: Math.round(performance.now() - t0) })
    const p = prog.current
    if (p && !p.taught.includes(level)) {
      prog.current = { ...p, taught: [...p.taught, level] }
      void saveWhere(prog.current)
    }
    s.demo = false
    setDemo(false)
    void next(i)
  }

  const present = async (i: number) => {
    const s = st.current
    Object.assign(s, { qi: i, busy: false, demo: false, asking: false, armed: false, wrongs: 0, missAt: -Infinity, led: false, guided: phaseOf(i) === 'guided', taps: [], t0: performance.now() })
    setQi(i)
    setOut(null)
    setNudge(null)
    setGlow(null)
    setHand(null)
    setTurn(false)
    onQ(target(qs[i]).rel)
    idle.stop()
    setHold(true)
    clearTimeout(armTimer.current)
    armTimer.current = window.setTimeout(() => {
      if (!st.current.demo) setHold(false)
      st.current.armed = true
    }, ARM_MS)
    if (phaseOf(i) === 'teach') return void runDemo(i)
    const x = qs[i]
    const ok = flow.begin(live)
    s.asking = true
    await say(...(i === 0 ? ['wh.intro'] : []), ...askKeys(x))
    s.asking = false
    if (!ok()) return
    if (s.guided) setHand({ at: x.answer, tap: 0, beckon: true })
    setTurn(true)
    idle.start({
      repeat: () => void say(...askKeys(x)),
      hint: () => {
        st.current.led = true
        showHand(x.answer, true)
      },
    })
  }

  useEffect(() => {
    const t = window.setTimeout(() => void present(0), 0)
    return () => {
      clearTimeout(t)
      clearTimeout(armTimer.current)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pingAt = (el: Element | null | undefined) => {
    if (!layer.current || !el) return
    const r = el.getBoundingClientRect()
    const p = localPoint(layer.current, r.left + r.width / 2, r.top + r.height / 2)
    notYet.ping(p.x, p.y)
  }

  const choose = async (k: number) => {
    const s = st.current
    if (s.busy || s.demo || resting || allDone) return
    if (!s.armed) return pingAt(els.current.get(k))
    if (missLocked(s.missAt, performance.now())) return
    const i = s.qi
    const x = qs[i]
    // 念題目的時候點錯：不算錯（TOUCH-7），只有「看這裡」的圈圈
    if (k !== x.answer && s.asking) return pingAt(els.current.get(k))
    setTurn(false)
    const h = x.hidden[k]
    s.taps.push({ pick: `${h.hider}:${h.rel}`, ms: Math.round(performance.now() - s.t0) })
    idle.poke()
    s.busy = true
    flow.cut()
    if (k === x.answer) {
      idle.stop()
      setHand(null)
      setGlow(null)
      record(i, {})
      const ok = flow.begin(live)
      if (!(await reveal(i, ok))) return
      await wait(s.wrongs === 0 ? PACE.NEXT_REVIEW : PACE.NEXT_NEW)
      if (!ok()) return
      return next(i)
    }
    // 點錯：那一隻輕輕跳一下（不搖、不打叉），說牠在哪裡，再說一次題目
    s.wrongs++
    s.missAt = performance.now()
    setNudge({ i: k, k: performance.now() })
    sfx.boing()
    const ok = flow.begin(live)
    if (s.wrongs >= 3) {
      idle.stop()
      await wait(350)
      if (!ok()) return
      showHand(x.answer, false)
      await wait(600)
      if (!ok()) return
      showHand(x.answer, true)
      await wait(300)
      if (!ok()) return
      record(i, { handPlaced: true })
      setHand(null)
      if (!(await reveal(i, ok))) return
      await wait(PACE.NEXT_NEW)
      if (!ok()) return
      return next(i)
    }
    s.busy = false
    if (s.wrongs === 2) setGlow(x.answer)
    await say('wh.this', atKey(h.rel, x.obj), ...askKeys(x))
    if (!ok()) return
    setTurn(true)
    idle.start({
      repeat: () => void say(...askKeys(x)),
      hint: () => {
        st.current.led = true
        showHand(x.answer, true)
      },
    })
  }

  const handAt = hand ? pointIn(els.current.get(hand.at), layer.current, 0.55, 0.45) : null
  const obj = OBJECTS[q.obj]
  /** 大東西的配色：跟著這一題固定（同一張桌子不會每次都一樣顏色） */
  const v = [...q.itemId].reduce((a, c) => a + c.charCodeAt(0), 0) % 3
  const art = THING_ART[q.obj]
  /** 一隻小動物（in 的畫在大東西前面那一層的後面） */
  const animal = (k: number) => {
    const h = q.hidden[k]
    const slot = obj.slots[h.slot]
    const size = ANIMAL * (slot.k ?? 1)
    const hider = HIDERS.find((x) => x.id === h.hider)!
    const hit = Math.max(HIT, size + 18)
    const isOut = out === k
    // 跑出來：in 往上跳出來、under 往前鑽出來、on 跳一下
    const outMove = h.rel === 'in' ? { y: [0, -size * 0.75, -size * 0.6] } : h.rel === 'under' ? { y: [0, 18, 26], scale: [1, 1.08, 1.08] } : { y: [0, -44, 0] }
    const nudged = nudge?.i === k
    return (
      <g key={`${qi}-${k}`} transform={`translate(${slot.x} ${slot.y})`}>
        <motion.g
          ref={(el: SVGGElement | null) => {
            els.current.set(k, el)
          }}
          className="wh-animal"
          data-hider={h.hider}
          data-rel={h.rel}
          data-answer={k === q.answer ? '1' : undefined}
          role="button"
          aria-label={`${hider.en} ${h.rel}`}
          initial={{ opacity: 0 }}
          animate={isOut ? { opacity: 1, ...outMove } : nudged ? { opacity: 1, y: [0, -24, 0] } : { opacity: 1, y: 0, scale: 1 }}
          transition={isOut ? { duration: OUT_MS / 1000, ease: 'easeOut' } : nudged ? { duration: 0.4 } : { duration: 0.25 }}
          {...tap(`a${qi}-${k}`, () => void choose(k), ANSWER_TAP)}
        >
          <rect x={-hit / 2} y={-size / 2 - hit / 2} width={hit} height={hit} fill="transparent" />
          <SvgEmoji name={hider.emoji} x={-size / 2} y={-size * 0.93} size={size} />
        </motion.g>
      </g>
    )
  }
  const inside = q.hidden.map((_, k) => k).filter((k) => q.hidden[k].rel === 'in')
  const outside = q.hidden.map((_, k) => k).filter((k) => q.hidden[k].rel !== 'in')
  const glowSlot = glow != null ? obj.slots[q.hidden[glow].slot] : null
  const glowSize = glowSlot ? ANIMAL * (glowSlot.k ?? 1) : 0
  return (
    <div
      className={`wh${resting ? ' is-resting' : ''}`}
      ref={layer}
      data-logic-game="where"
      data-level={level}
      data-item={qi}
      data-place={q.place}
      data-obj={q.obj}
      data-demo={demo ? '1' : undefined}
      data-turn={turn ? '1' : undefined}
      onPointerDown={() => {
        idle.poke()
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="wh-play">
        <AnimatePresence mode="wait">
          <motion.svg
            key={qi}
            className="wh-scene"
            viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
            preserveAspectRatio="xMidYMid meet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <g pointerEvents="none">
              <Backdrop place={q.place} />
              <ellipse cx={SCENE_W / 2} cy={GROUND + 4} rx={330} ry={22} fill="#2E2A25" opacity={0.1} />
            </g>
            <g transform={`translate(${SCENE_W / 2} ${GROUND})`}>
              <g pointerEvents="none">{art.back(v)}</g>
              {inside.map(animal)}
              {art.front && <g pointerEvents="none">{art.front(v)}</g>}
              {outside.map(animal)}
              {/* 第 2 次點錯：對的那一隻外面一圈黃色的框（靜止、不閃，MOTION-3） */}
              {glowSlot && <rect className="wh-glow" x={glowSlot.x - glowSize / 2 - 12} y={glowSlot.y - glowSize - 12} width={glowSize + 24} height={glowSize + 24} rx={26} pointerEvents="none" />}
            </g>
          </motion.svg>
        </AnimatePresence>
        <AnimatePresence>{handAt && <Hand key="hand" x={handAt.x} y={handAt.y} tap={hand!.tap} beckon={hand!.beckon} size="clamp(70px, 9cqmin, 110px)" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !allDone} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<WherePickArt />} againLabel="再一局" line="wh.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
