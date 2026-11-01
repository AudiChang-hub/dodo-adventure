import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Ink, type InkHandle } from '../../games/draw/Ink'
import { PathTracker, samplePath } from '../../games/draw/track'
import { GLYPHS } from '../../games/draw/glyphs'
import { PenArt, easeInOut, tween } from '../../games/Demo'
import { wait } from '../../games/lines'
import { useIdle } from '../../games/idle'
import { Sparkles } from '../../ui/Sparkles'
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

function strokeStart(d: string) {
  const s = samplePath(d, 3)
  const a = s[0]
  const b = s[Math.min(4, s.length - 1)]
  return { x: a.x, y: a.y, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/**
 * 寫數字（描字 GlyphGame 的做法）：粗跑道、綠色起點、箭頭，一筆一筆描今天的數字，描 2～3 次。
 * 第一次波波先用筆照筆順描一次（Watch me!），示範中下筆不出墨、只出現「看這裡」（Ink 的 disabled）。
 * 筆要沿著跑道往前推才會前進：點一下、亂畫都不會完成；畫在跑道外的線放開後淡掉。
 */
export function WritePart({ ctx }: { ctx: PartCtx }) {
  const n = ctx.lesson.n
  const g = digit(n)
  const reps = writeReps(ctx.lesson)
  const [k, setK] = useState(0)
  const [stroke, setStroke] = useState(0)
  const [prog, setProg] = useState(0)
  const [done, setDone] = useState(false)
  const [demo, setDemo] = useState(false)
  const [hold, setHold] = useState(true)
  /** 閒置提示：筆在這一筆上的位置（取樣點） */
  const [again, setAgain] = useState<number | null>(null)
  const tracker = useRef<PathTracker | null>(null)
  const strokeRef = useRef(0)
  const drawing = useRef(false)
  const moved = useRef(false)
  const busy = useRef(true)
  const devs = useRef<{ meanDev: number; offRatio: number }[]>([])
  const missed = useRef(0)
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
  const showMe = async () => {
    const s = performance.now()
    setDemo(true)
    showing(true)
    ctx.mood('happy')
    await say('teach.watch.bobo')
    for (let i = 0; i < g.strokes.length; i++) {
      if (!live.current) return
      begin(i)
      const total = tracker.current!.samples.length - 1
      await wait(260)
      await tween(Math.max(900, total * 26), (f) => setProg(Math.round(f * total)), () => live.current, easeInOut)
      if (!live.current) return
      sfx.correct()
    }
    setDone(true)
    await say(`teach.num.${n}`)
    if (!live.current) return
    await wait(300)
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

  const start = async (i: number) => {
    busy.current = true
    setHold(true)
    setDone(false)
    setAgain(null)
    devs.current = []
    idle.stop()
    begin(0)
    if (i === 0) {
      await say(`ma.write.${n}`)
      if (!live.current) return
      // 新的數字（或還沒描過這個數字）先示範；複習就直接描
      if (ctx.lesson.mode === 'new' || isNew(skillOf(n))) {
        await showMe()
        if (!live.current) return
        await say('teach.turn.bobo', 'ma.pen', 'ma.write.go')
      } else await say('ma.pen', 'ma.write.go')
    } else await say('ma.write.again')
    if (!live.current) return
    busy.current = false
    setHold(false)
    t0.current = performance.now()
    idle.start({ repeat: () => void say('ma.write.go'), hint: () => void showAgain() })
  }

  useEffect(() => {
    const boot = window.setTimeout(() => start(0), 0)
    const mine = () => {
      if (busy.current) return
      idle.poke()
      void say('ma.write.go')
      void showAgain()
    }
    ctx.host.current = mine
    return () => {
      clearTimeout(boot)
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
    setDone(true)
    busy.current = true
    setHold(true)
    idle.stop()
    const off = devs.current.reduce((a, d) => a + d.offRatio, 0) / devs.current.length
    const good = off < 0.4
    if (!good) missed.current++
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
      hintUsed: false,
      metrics: { strokes: g.strokes.length, offRatio: Math.round(off * 100) / 100, meanDev: Math.round((devs.current.reduce((a, d) => a + d.meanDev, 0) / devs.current.length) * 10) / 10, lesson: n },
    })
    sfx.done()
    ctx.ping()
    ctx.mood('cheer')
    await say('ma.write.done')
    await wait(500)
    if (!live.current) return
    ctx.mood('idle')
    if (k + 1 >= reps) return ctx.done(reps, missed.current)
    setK(k + 1)
    start(k + 1)
  }

  const onDown = (p: { x: number; y: number }) => {
    if (!tracker.current || done || busy.current) return
    idle.poke()
    setAgain(null)
    moved.current = false
    drawing.current = tracker.current.near(p)
  }
  const onMove = (p: { x: number; y: number }) => {
    const t = tracker.current
    if (!t || done || busy.current) return
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
          <svg viewBox={`0 0 ${g.w} ${H}`} className="ma-lane" aria-hidden="true">
            {g.strokes.map((d, i) => (
              <g key={i}>
                <path d={d} fill="none" stroke="#D9CFBE" strokeWidth={LANE + 3} strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke={i < stroke || done ? '#9FD0B3' : '#FBF8F2'} strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ))}
            {!done && (
              <>
                <path d={g.strokes[stroke]} fill="none" stroke="#9FD0B3" strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`${prog} ${total + 5}`} />
                <path d={g.strokes[stroke]} fill="none" stroke="#B9AE9C" strokeWidth={1.2} strokeDasharray="3 3" strokeLinecap="round" />
                <motion.circle cx={st.x} cy={st.y} r={6} fill="#6FAE86" animate={{ r: prog > 0 ? 4 : [5, 7.5, 5] }} transition={{ duration: 1.2, repeat: prog > 0 ? 0 : Infinity }} />
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
          {done && !demo && (
            <div className="ma-burst">
              <Sparkles count={16} />
            </div>
          )}
          <Ink
            ref={inkRef}
            w={g.w}
            h={H}
            color="rgba(46,42,37,0.6)"
            size={3.2}
            disabled={hold}
            onDown={onDown}
            onMove={onMove}
            onUp={() => {
              if (!moved.current) ink.current?.fadeLast()
              moved.current = false
            }}
          />
        </>
      </Fade>
      {/* 第幾次：描好一次亮一顆 */}
        <div className="ma-reps" aria-hidden="true">
          {Array.from({ length: reps }, (_, i) => (
            <i key={i} className={i < k || (i === k && done && !demo) ? 'on' : ''} />
          ))}
      </div>
    </div>
  )
}
