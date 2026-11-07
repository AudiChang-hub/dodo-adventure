import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Ink, type InkHandle } from '../../games/draw/Ink'
import { HELP_MS, LIFT_FINISH, PathTracker, PX_PER_MM, SNAP_MM, samplePath } from '../../games/draw/track'
import { GoalStar, RainbowDef, RestGuide, ResumeDot } from '../../games/draw/TraceFx'
import { GLYPHS } from '../../games/draw/glyphs'
import { PenArt, easeInOut, tween } from '../../games/Demo'
import { wait } from '../../games/lines'
import { useFlow } from '../../games/barge'
import { PACE } from '../../games/pace'
import { useIdle } from '../../games/idle'
import { Sparkles } from '../../ui/Sparkles'
import { Emoji } from '../../art/Emoji'
import { useSwapRef } from '../../ui/Scenes'
import { isNew } from '../../lib/adaptive'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx } from '../../lib/audio'
import { writeReps } from './plan'
import { Fade, useLive, type PartCtx } from './kit'
import '../../games/draw/glyph.css'

const LANE = 20
const H = 140

/** 數字的筆順（座標系 W × 140）：1～9 用描字的 GLYPHS；10 是 1 和 0 並排（寬一點的畫布），一樣是兩筆 */
function digit(n: number): { w: number; strokes: string[] } {
  if (n < 10) return { w: 100, strokes: GLYPHS[String(n)] }
  return {
    w: 150,
    strokes: ['M41 20 L41 120', 'M108 20 C96 20 86 42 86 70 C86 98 96 120 108 120 C120 120 130 98 130 70 C130 42 120 20 108 20'],
  }
}
const skillOf = (n: number) => `glyph:${n}`

/**
 * 每一次描的樣子（AI 小男生測試 #2：同一個數字描第二次就無聊）：第二次換跑道顏色、墨水顏色，旁邊多一隻小雞陪他描。
 * 綠色起點不變（台詞是「Start at the green dot!」）。
 */
const LOOKS = [
  { lane: '#FBF8F2', done: '#9FD0B3', ink: 'rgba(46,42,37,0.6)', friend: null },
  { lane: '#FDF1E6', done: '#F2C29A', ink: 'rgba(52,96,150,0.7)', friend: 'baby-chick' },
] as const

function strokeStart(d: string) {
  const s = samplePath(d, 3)
  const a = s[0]
  const b = s[Math.min(4, s.length - 1)]
  return { x: a.x, y: a.y, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/**
 * 寫數字（描字 GlyphGame 的做法）：粗跑道、綠色起點、箭頭，一筆一筆描今天的數字。
 * 新的數字描一次就慶祝，複習描兩次、第二次換一個樣子（plan.ts 的 writeReps、上面的 LOOKS）；描得好不好不影響明天上什麼。
 * 第一次波波先用筆照筆順描一次（Watch me!）。
 * 搶點（T-108，games/barge.ts）：說明、示範的時候在描字板下筆：停掉語音、筆的示範收掉，那一筆照常描。
 * 描完的慶祝、筆帶著描完、放手後補滿的那一下不能搶（Ink 的 disabled）。
 * 筆要沿著跑道往前推才會前進：點一下、亂畫都不會完成；畫在跑道外的線放開後淡掉。
 * T-95（AI 小男生盲測：描 1 畫了 4 次，看不出畫對了沒、什麼時候算畫完）：
 * - 起點、斷掉的地方附近按下去都吸過去（track.ts 的 SNAP_MM）；放手不歸零，綠點移到斷掉的地方（TraceFx 的 ResumeDot）；
 * - 畫完：數字變彩虹色、跳一下、星星，不靠語言；
 * - 輪到他描 45 秒還沒描完（HELP_MS）：筆帶著把剩下的描完、照樣慶祝（不算自己描好）；
 * - 描到這一筆的 60% 以上就放手（LIFT_FINISH，T-101、T-106）：剩下的一段補滿，算他描完；
 * - 還剩哪一段（T-106，跟英文描字一樣）：描到一半，還沒描的跑道輕輕亮、小點往終點流（RestGuide），終點有星星，描過一半輕輕晃（GoalStar）。
 */
export function WritePart({ ctx }: { ctx: PartCtx }) {
  const n = ctx.lesson.n
  const g = digit(n)
  const reps = writeReps(ctx.lesson)
  const [k, setK] = useState(0)
  /** 第幾次（計時器裡的帶著描完讀得到最新的） */
  const kRef = useRef(0)
  const look = LOOKS[k % LOOKS.length]
  const [stroke, setStroke] = useState(0)
  const [prog, setProg] = useState(0)
  const [done, setDoneState] = useState(false)
  /** 下筆時讀得到最新的（示範最後整個數字亮起來時被搶掉，要馬上算回「還沒描完」） */
  const doneRef = useRef(false)
  const setDone = (v: boolean) => {
    doneRef.current = v
    setDoneState(v)
  }
  const [demo, setDemo] = useState(false)
  const [hold, setHold] = useState(true)
  /** 閒置提示：筆在這一筆上的位置（取樣點） */
  const [again, setAgain] = useState<number | null>(null)
  const tracker = useRef<PathTracker | null>(null)
  const lane = useRef<SVGSVGElement | null>(null)
  const helpTimer = useRef(0)
  /** 這一次是筆帶著描完的 */
  const helped = useRef(false)
  const strokeRef = useRef(0)
  const drawing = useRef(false)
  const moved = useRef(false)
  /** 不能搶的那幾段：描完的慶祝、筆帶著描完、放手後補滿 */
  const busy = useRef(false)
  /** intro 說明、demo 筆的示範（可以搶）；turn 輪到孩子 */
  const phase = useRef<'intro' | 'demo' | 'turn'>('intro')
  /** 這一次剛出來的 0.5 秒過了（PACE.BARGE_ARM） */
  const armed = useRef(false)
  const armTimer = useRef(0)
  const flow = useFlow()
  const devs = useRef<{ meanDev: number; offRatio: number }[]>([])
  const t0 = useRef(0)
  const ink = useRef<InkHandle>(null)
  // 畫布在 Fade 裡：舊的一次淡出卸載時不會把 ink 清成 null（跟 GlyphGame 一樣用 useSwapRef）
  const inkRef = useSwapRef(ink)
  const live = useLive()
  const idle = useIdle()
  const demoing = useRef(false)
  const showing = (on: boolean) => {
    demoing.current = on
    ctx.demo(on)
  }

  const begin = (s: number) => {
    strokeRef.current = s
    setStroke(s)
    tracker.current = new PathTracker(g.strokes[s], 2, LANE * 0.85)
    setProg(0)
  }

  /** 波波用筆照筆順描一次，描完整個數字亮起來、念一次 */
  const showMe = async (ok: () => boolean) => {
    const s = performance.now()
    setDemo(true)
    showing(true)
    ctx.mood('happy')
    await say('teach.watch.bobo')
    for (let i = 0; i < g.strokes.length; i++) {
      if (!ok()) return
      begin(i)
      const total = tracker.current!.samples.length - 1
      await wait(260)
      if (!ok()) return
      await tween(Math.max(900, total * 26), (f) => setProg(Math.round(f * total)), ok, easeInOut)
      if (!ok()) return
      sfx.correct()
    }
    setDone(true)
    await say(`teach.num.${n}`)
    if (!ok()) return
    await wait(300)
    if (!ok()) return
    setDone(false)
    setDemo(false)
    showing(false)
    ctx.mood('idle')
    begin(0)
    void logTeach({ station: 'math', game: 'd-glyph', itemId: String(n), skill: skillOf(n), level: 1, ms: Math.round(performance.now() - s) })
  }

  /** 閒置第二段：筆沿著現在這一筆描一小段（不出墨），再停在孩子描到的地方 */
  const showAgain = async () => {
    const t = tracker.current
    if (!t || t.done || busy.current) return
    const from = t.progress
    const to = Math.min(t.samples.length - 1, from + Math.max(6, Math.round((t.samples.length - 1) * 0.4)))
    const same = () => live.current && tracker.current === t
    await tween(1500, (f) => setAgain(Math.round(from + (to - from) * f)), same, easeInOut)
    if (!same()) return setAgain(null)
    await wait(300)
    setAgain(same() ? t.progress : null)
  }

  /** 吸附範圍換成描字板的座標（板子多大照實際畫面量） */
  const snapUnits = () => {
    const h = lane.current?.getBoundingClientRect().height ?? 0
    return h > 0 ? (SNAP_MM * PX_PER_MM * H) / h : 0
  }

  /** 描太久（HELP_MS）：筆從孩子描到的地方把剩下的描完，跑道一樣填滿，然後照樣慶祝 */
  const helpFinish = async () => {
    if (!tracker.current || busy.current || !live.current) return
    busy.current = true
    drawing.current = false
    setHold(true)
    setAgain(null)
    idle.stop()
    helped.current = true
    setDemo(true)
    for (let s = strokeRef.current; s < g.strokes.length; s++) {
      if (s > strokeRef.current) begin(s)
      const t = tracker.current!
      const at = t.progress
      const total = t.samples.length - 1
      await tween(Math.max(700, (total - at) * 24), (f) => setProg(Math.round(at + (total - at) * f)), () => live.current, easeInOut)
      if (!live.current) return
      t.progress = total
      devs.current.push(t.metrics())
      sfx.correct()
    }
    setDemo(false)
    void finishOne()
  }

  /** 輪到孩子（說完、或被搶掉）：開始計時，45 秒還沒描完筆帶著描完 */
  const openTurn = () => {
    phase.current = 'turn'
    if (!t0.current) t0.current = performance.now()
    idle.start({ repeat: () => void say('ma.write.go'), hint: () => void showAgain() })
    clearTimeout(helpTimer.current)
    helpTimer.current = window.setTimeout(() => void helpFinish(), HELP_MS)
  }

  /** 孩子搶著下筆：停掉語音、筆的示範收掉，直接輪到他 */
  const takeOver = () => {
    const was = phase.current
    flow.cut()
    if (was === 'demo') {
      setDone(false)
      setDemo(false)
      showing(false)
      ctx.mood('idle')
      begin(0)
    }
    openTurn()
  }

  const start = async (i: number) => {
    const ok = flow.begin(live)
    clearTimeout(helpTimer.current)
    helped.current = false
    busy.current = false
    phase.current = 'intro'
    t0.current = 0
    armed.current = false
    setHold(true)
    clearTimeout(armTimer.current)
    // 剛出來的 0.5 秒：上一次連點的手指先不算，之後說明、示範時下筆就搶
    armTimer.current = window.setTimeout(() => {
      if (!live.current || busy.current) return
      armed.current = true
      setHold(false)
    }, PACE.BARGE_ARM)
    setDone(false)
    setAgain(null)
    devs.current = []
    idle.stop()
    begin(0)
    if (i === 0) {
      // 新的數字（或還沒描過這個數字）先示範：直接「Watch me!」，示範完只說「Your turn!」（T-108：輪到他之前的話越短越好）；
      // 複習只說「Let's write three!」就換他
      if (ctx.lesson.mode === 'new' || isNew(skillOf(n))) {
        phase.current = 'demo'
        await showMe(ok)
        if (!ok()) return
        phase.current = 'intro'
        await say('teach.turn.bobo')
      } else await say(`ma.write.${n}`)
    } else await say('ma.write.again')
    if (!ok()) return
    openTurn()
  }

  useEffect(() => {
    const boot = window.setTimeout(() => start(0), 0)
    const mine = () => {
      if (busy.current || phase.current !== 'turn') return
      idle.poke()
      void say('ma.write.go')
      void showAgain()
    }
    ctx.host.current = mine
    return () => {
      clearTimeout(boot)
      clearTimeout(armTimer.current)
      clearTimeout(helpTimer.current)
      idle.stop()
      // 淡出中的這一段比下一段晚卸載：只收自己的，不要清掉下一段的
      if (ctx.host.current === mine) ctx.host.current = null
      if (demoing.current) ctx.demo(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const strokeDone = async () => {
    devs.current.push(tracker.current!.metrics())
    sfx.correct()
    const s = strokeRef.current + 1
    if (s < g.strokes.length) {
      begin(s)
      return void say('ma.write.next')
    }
    void finishOne()
  }

  /** 這一次描完（自己描完，或筆帶著描完）：記一筆、慶祝，往下一次 */
  const finishOne = async () => {
    clearTimeout(helpTimer.current)
    setDone(true)
    busy.current = true
    setHold(true)
    idle.stop()
    const off = devs.current.reduce((a, d) => a + d.offRatio, 0) / devs.current.length
    const good = off < 0.4 && !helped.current
    void logAttempt({
      station: 'math',
      game: 'd-glyph',
      itemId: String(n),
      skill: skillOf(n),
      phase: 'quiz',
      level: 1,
      options: [],
      answer: '',
      taps: [],
      firstTryCorrect: good,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: helped.current,
      metrics: {
        strokes: g.strokes.length,
        offRatio: Math.round(off * 100) / 100,
        meanDev: Math.round((devs.current.reduce((a, d) => a + d.meanDev, 0) / devs.current.length) * 10) / 10,
        lesson: n,
        ...(helped.current ? { helped: 1 } : {}),
      },
    })
    sfx.done()
    ctx.ping()
    ctx.mood('cheer')
    await say('ma.write.done')
    await wait(500)
    if (!live.current) return
    ctx.mood('idle')
    // 描得好不好不算進「錯很多隔天重上」（plan.ts 的 partDone 也不算寫數字這一段）
    const next = kRef.current + 1
    if (next >= reps) return ctx.done(reps, 0)
    kRef.current = next
    setK(next)
    start(next)
  }

  /** 描到大部分就放手（LIFT_FINISH）：剩下的一小段很快補滿，接著跟描到底一樣 */
  const fillRest = async (t: PathTracker) => {
    busy.current = true
    const at = t.progress
    const end = t.samples.length - 1
    // 剩下的越長補得越慢一點（最多 0.6 秒）：看得到是「帶著描完」，不是突然跳到好了
    await tween(Math.min(600, 200 + (end - at) * 8), (f) => setProg(Math.round(at + (end - at) * f)), () => live.current && tracker.current === t)
    if (!live.current || tracker.current !== t) return
    t.progress = end
    busy.current = false
    void strokeDone()
  }

  const onDown = (p: { x: number; y: number }) => {
    if (!tracker.current || busy.current || !armed.current) return
    // 說明、示範的時候下筆：示範收掉，這一筆照常描（示範最後整個數字亮起來的那一刻也算，先收掉才看描完了沒）
    if (phase.current !== 'turn') takeOver()
    if (doneRef.current) return
    idle.poke()
    setAgain(null)
    moved.current = false
    // 接著描、從起點沿著描好的部分走回來、或起點和斷掉的地方附近吸過去（track.ts 的 penDown）
    const how = tracker.current.penDown(p, snapUnits())
    drawing.current = !!how
  }
  const onMove = (p: { x: number; y: number }) => {
    const t = tracker.current
    if (!t || doneRef.current || busy.current || phase.current !== 'turn') return
    idle.poke()
    if (!drawing.current) return
    if (t.feed(p)) {
      moved.current = true
      setProg(t.progress)
      if (t.done) {
        drawing.current = false
        void strokeDone()
      }
    }
  }

  const st = strokeStart(g.strokes[stroke])
  const samples = tracker.current?.samples ?? []
  const total = Math.max(1, samples.length - 1)
  const tip = samples[Math.min(prog, samples.length - 1)] ?? st
  return (
    <div className={`ma-write${g.w > 100 ? ' wide' : ''}`}>
      <Fade id={k} className="ma-paper">
        <>
          <svg
            viewBox={`0 0 ${g.w} ${H}`}
            className="ma-lane"
            aria-hidden="true"
            ref={(v) => {
              if (v) lane.current = v
            }}
          >
            <RainbowDef id={`ma-rainbow-${k}`} w={g.w} h={H} />
            {/* 畫完（不是示範）：整個數字變彩虹色、跳一下 */}
            <g className={done && !demo ? 'trace-pop' : undefined} data-trace-finished={done && !demo ? '' : undefined}>
              {g.strokes.map((d, i) => (
                <g key={i}>
                  <path d={d} fill="none" stroke="#D9CFBE" strokeWidth={LANE + 3} strokeLinecap="round" strokeLinejoin="round" />
                  <path
                    d={d}
                    fill="none"
                    stroke={done && !demo ? `url(#ma-rainbow-${k})` : i < stroke || done ? look.done : look.lane}
                    strokeWidth={LANE}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </g>
            {!done && (
              <>
                <path d={g.strokes[stroke]} fill="none" stroke={look.done} strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`${prog} ${total + 5}`} />
                <path d={g.strokes[stroke]} fill="none" stroke="#B9AE9C" strokeWidth={1.2} strokeDasharray="3 3" strokeLinecap="round" />
                {/* 起點：描到一半就淡掉，綠點換到要接著描的地方（ResumeDot） */}
                <motion.circle cx={st.x} cy={st.y} r={6} fill="#6FAE86" animate={{ r: prog > 0 ? 4 : [5, 7.5, 5], opacity: prog > 0 && !demo ? 0.35 : 1 }} transition={{ duration: 1.2, repeat: prog > 0 ? 0 : Infinity }} />
                {/* 還剩哪一段、終點的星星（跟英文描字一樣，TraceFx） */}
                {prog > 0 && !demo && !hold && <RestGuide d={g.strokes[stroke]} at={prog} total={total} color="#6FAE86" lane={LANE} />}
                {samples.length > 0 && <GoalStar at={samples[samples.length - 1]} from={samples[0]} near={prog / total >= 0.5 && !demo} />}
                {prog > 0 && !demo && !hold && <ResumeDot at={tip} color="#6FAE86" />}
                {prog === 0 && (
                  <g transform={`translate(${st.x} ${st.y}) rotate(${st.ang}) translate(13 0)`}>
                    <path d="M-4 -5 L4 0 L-4 5" fill="none" stroke="#6FAE86" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                )}
              </>
            )}
            {again !== null && !demo && !done && samples[again] && (
              <g data-demo-hand="" transform={`translate(${samples[again].x} ${samples[again].y})`} opacity={0.85}>
                <PenArt scale={0.3} />
              </g>
            )}
            {demo && (
              <g transform={`translate(${tip.x} ${tip.y})`}>
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <PenArt scale={0.3} />
                </motion.g>
              </g>
            )}
          </svg>
          {look.friend && (
            <div className="ma-write-friend" aria-hidden="true">
              <Emoji name={look.friend} />
            </div>
          )}
          {done && !demo && (
            <div className="ma-burst">
              <Sparkles count={16} />
            </div>
          )}
          <Ink
            ref={inkRef}
            w={g.w}
            h={H}
            color={look.ink}
            size={3.2}
            disabled={hold}
            onDown={onDown}
            onMove={onMove}
            onUp={() => {
              const t = tracker.current
              // 描到大部分就放手：剩下的一小段很快補滿，算描完（T-101）
              if (drawing.current && t && !t.done && t.progress > 0 && !busy.current && t.ratio >= LIFT_FINISH) void fillRest(t)
              drawing.current = false
              if (!moved.current) ink.current?.fadeLast()
              moved.current = false
            }}
          />
        </>
      </Fade>
      {/* 第幾次：描好一次亮一顆（只描一次就不放，AI 小男生測試 #2：他看不懂這是「還剩幾次」） */}
      {reps > 1 && (
        <div className="ma-reps" aria-hidden="true">
          {Array.from({ length: reps }, (_, i) => (
            <i key={i} className={i < k || (i === k && done && !demo) ? 'on' : ''} />
          ))}
        </div>
      )}
    </div>
  )
}
