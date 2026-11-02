import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ink, type InkHandle } from '../../games/draw/Ink'
import { PathTracker, samplePath } from '../../games/draw/track'
import { HandArt, PenArt, easeInOut, tween } from '../../games/Demo'
import { Sparkles } from '../../ui/Sparkles'
import { useIdle } from '../../games/idle'
import { praiseKey, wait } from '../../games/lines'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { LINES, type LessonLetter } from './data'

const LANE = 20

/** 描字的四回合：大寫兩次、小寫兩次；每個大小寫第一次先示範 */
const ROUNDS: { big: boolean; demo: boolean }[] = [
  { big: true, demo: true },
  { big: true, demo: false },
  { big: false, demo: true },
  { big: false, demo: false },
]

function strokeStart(d: string) {
  const s = samplePath(d, 3)
  const a = s[0]
  const b = s[Math.min(4, s.length - 1)]
  return { x: a.x, y: a.y, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/**
 * 描字（英文課第 2 段）：今天的大寫、小寫各描兩次，用觸控筆或手指都可以。
 * 跟舊的描數字字母 GlyphGame（T-75 拿掉了）同一套做法：粗跑道、綠色起點和箭頭、一筆一筆照筆順描（PathTracker）。
 * - 每個大小寫第一次先「Watch me!」筆照筆順描一次，說完「Your turn!」才能畫；示範中畫不出線（Ink disabled），也不會記成作答。
 * - 要沿著跑道一路描到底才算描完一筆：點一下、亂畫都不會自動完成。沒描到的線放開後淡掉。
 * - 發呆：15 秒再說一次「從綠點開始」，30 秒筆再描一小段。
 */
export function Trace({ letter, onDone }: { letter: LessonLetter; onDone: (good: number) => void }) {
  const [r, setR] = useState(0)
  const round = ROUNDS[r]
  const strokes = round.big ? letter.upper : letter.lower
  const glyph = round.big ? letter.L : letter.l
  const [stroke, setStroke] = useState(0)
  const [prog, setProg] = useState(0)
  const [done, setDone] = useState(false)
  const [demo, setDemo] = useState(false)
  const [hold, setHold] = useState(true)
  const [again, setAgain] = useState<number | null>(null)
  const tracker = useRef<PathTracker | null>(null)
  const drawing = useRef(false)
  const moved = useRef(false)
  const busy = useRef(true)
  const live = useRef(true)
  const devs = useRef<{ offRatio: number; meanDev: number }[]>([])
  const good = useRef(0)
  const t0 = useRef(0)
  const ink = useRef<InkHandle>(null)
  const idle = useIdle()
  const cur = useRef({ r: 0, strokes, glyph, stroke: 0 })
  cur.current = { r, strokes, glyph, stroke }

  const nameKey = (big: boolean) => (big ? `ph.${letter.l}.big` : `ph.${letter.l}.little`)

  const begin = (ss: string[], k: number) => {
    cur.current.stroke = k
    setStroke(k)
    tracker.current = new PathTracker(ss[k], 2, LANE * 0.85)
    setProg(0)
  }

  /** 筆照筆順描一次 */
  const showMe = async (ss: string[], big: boolean) => {
    const s = performance.now()
    setDemo(true)
    await say('teach.watch.dodo')
    for (let k = 0; k < ss.length; k++) {
      if (!live.current) return
      begin(ss, k)
      const total = tracker.current!.samples.length - 1
      await wait(260)
      await tween(Math.max(900, total * 26), (f) => setProg(Math.round(f * total)), () => live.current, easeInOut)
      if (!live.current) return
      sfx.correct()
    }
    setDone(true)
    await say(nameKey(big))
    if (!live.current) return
    await wait(300)
    setDone(false)
    setDemo(false)
    begin(ss, 0)
    void logTeach({ station: 'english', game: 'lesson-en', itemId: `write:${big ? letter.L : letter.l}`, skill: `write:${big ? letter.L : letter.l}`, level: 1, ms: Math.round(performance.now() - s) })
    await say('d.intro.glyph', 'teach.turn.dodo')
  }

  /** 發呆的第二段提示：筆沿著這一筆描一小段（不出墨），停在孩子該接著描的地方 */
  const showAgain = async () => {
    const t = tracker.current
    if (!t || t.done) return
    const from = t.progress
    const to = Math.min(t.samples.length - 1, from + Math.max(6, Math.round((t.samples.length - 1) * 0.4)))
    const same = () => live.current && tracker.current === t
    await tween(1500, (f) => setAgain(Math.round(from + (to - from) * f)), same, easeInOut)
    if (!same()) return setAgain(null)
    await wait(300)
    setAgain(same() ? t.progress : null)
  }

  const start = async (i: number) => {
    const rd = ROUNDS[i]
    const ss = rd.big ? letter.upper : letter.lower
    devs.current = []
    setDone(false)
    setAgain(null)
    begin(ss, 0)
    busy.current = true
    setHold(true)
    idle.stop()
    ink.current?.clear()
    if (i === 0) await say('le.en.write')
    if (!live.current) return
    if (rd.demo) await showMe(ss, rd.big)
    else await say(nameKey(rd.big), 'd.intro.glyph')
    if (!live.current) return
    t0.current = performance.now()
    busy.current = false
    setHold(false)
    idle.start({ repeat: () => void say('d.intro.glyph'), hint: () => void showAgain() })
  }

  useEffect(() => {
    live.current = true
    const boot = window.setTimeout(() => void start(0), 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const strokeDone = async () => {
    const { r: i, strokes: ss, glyph: g } = cur.current
    devs.current.push(tracker.current!.metrics())
    sfx.correct()
    const k = cur.current.stroke + 1
    if (k < ss.length) {
      begin(ss, k)
      return void say('d.glyph.next')
    }
    setDone(true)
    busy.current = true
    setHold(true)
    idle.stop()
    const off = devs.current.reduce((a, d) => a + d.offRatio, 0) / devs.current.length
    const ok = off < 0.4
    if (ok) good.current++
    void logAttempt({
      station: 'english',
      game: 'lesson-en',
      itemId: `write:${g}`,
      skill: `write:${g}`,
      phase: 'quiz',
      level: 1,
      options: [],
      answer: g,
      taps: [],
      firstTryCorrect: ok,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { strokes: ss.length, offRatio: Math.round(off * 100) / 100 },
    })
    sfx.done()
    await say(i % 2 ? praiseKey('dodo') : 'd.glyph.done')
    await wait(350)
    if (!live.current) return
    if (i + 1 >= ROUNDS.length) return onDone(good.current)
    setR(i + 1)
    void start(i + 1)
  }

  const onDown = (p: { x: number; y: number }) => {
    if (!tracker.current || busy.current) return
    idle.poke()
    setAgain(null)
    moved.current = false
    // 接著描，或描到一半又從綠點重新開始（這一筆從頭再描，track.ts 的 penDown）
    const how = tracker.current.penDown(p)
    drawing.current = !!how
    if (how === 'again') setProg(0)
  }
  const onMove = (p: { x: number; y: number }) => {
    const t = tracker.current
    if (!t || busy.current) return
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

  const st = strokeStart(strokes[stroke])
  const samples = tracker.current?.samples ?? []
  const total = Math.max(1, samples.length - 1)
  const tip = samples[Math.min(prog, samples.length - 1)] ?? st

  return (
    // data-demo、data-accepting：三歲模擬測試看得到「示範中」「還不能畫」（tests/toddler/probe.js 的 teaching()）
    <div className="en-trace" data-demo={demo ? '1' : undefined} data-accepting={hold ? 'false' : undefined}>
      {/* 四回合：A A a a，描好的變綠 */}
      <div className="en-trace-rounds" aria-hidden="true">
        {ROUNDS.map((x, i) => (
          <span key={i} className={i < r ? 'is-done' : i === r ? 'is-now' : ''}>
            {x.big ? letter.L : letter.l}
          </span>
        ))}
      </div>
      <div className="en-trace-paper">
        <AnimatePresence initial={false}>
          <motion.div key={r} className="en-trace-board" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.45 } }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
            <svg viewBox="0 0 100 140" className="en-trace-svg" aria-hidden="true">
              {/* 小寫的四條線（學校的作業簿）：中線虛線 */}
              {!round.big && (
                <g className="en-trace-lines">
                  <line x1="2" x2="98" y1={LINES.top} y2={LINES.top} />
                  <line x1="2" x2="98" y1={LINES.mid} y2={LINES.mid} strokeDasharray="2.4 2.4" />
                  <line x1="2" x2="98" y1={LINES.base} y2={LINES.base} className="is-base" />
                  <line x1="2" x2="98" y1={LINES.bottom} y2={LINES.bottom} />
                </g>
              )}
              {strokes.map((d, i) => (
                <g key={i}>
                  <path d={d} fill="none" stroke="#CFE3D6" strokeWidth={LANE + 3} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={d} fill="none" stroke={i < stroke || done ? '#8FCBAA' : '#FBF8F2'} strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ))}
              {!done && (
                <>
                  <path d={strokes[stroke]} fill="none" stroke="#8FCBAA" strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`${prog} ${total + 5}`} />
                  <path d={strokes[stroke]} fill="none" stroke="#9DB5A6" strokeWidth={1.2} strokeDasharray="3 3" strokeLinecap="round" />
                  <motion.circle cx={st.x} cy={st.y} r={6} fill="#4E9A72" animate={{ r: prog > 0 ? 4 : [5, 7.5, 5] }} transition={{ duration: 1.2, repeat: prog > 0 || hold ? 0 : Infinity }} />
                  {prog === 0 && (
                    <g transform={`translate(${st.x} ${st.y}) rotate(${st.ang}) translate(13 0)`}>
                      <path d="M-4 -5 L4 0 L-4 5" fill="none" stroke="#4E9A72" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
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
              <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
                <Sparkles count={14} />
              </div>
            )}
            <Ink
              ref={(v) => {
                if (v) ink.current = v
              }}
              w={100}
              h={140}
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
          </motion.div>
        </AnimatePresence>
      </div>
      {/* 手指也可以：只是個小提示，不擋 */}
      <div className="en-trace-tool" aria-hidden="true">
        <svg viewBox="-40 -92 90 100" width="46">
          <PenArt />
        </svg>
        <svg viewBox="-6 -2 76 92" width="34">
          <HandArt cuff="#BFE0CC" />
        </svg>
      </div>
    </div>
  )
}
