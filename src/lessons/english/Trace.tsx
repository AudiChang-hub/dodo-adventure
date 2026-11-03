import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ink, type InkHandle } from '../../games/draw/Ink'
import { PathTracker, PX_PER_MM, SNAP_MM, samplePath, type P2 } from '../../games/draw/track'
import { HandArt, PenArt, easeInOut, tween } from '../../games/Demo'
import { Sparkles } from '../../ui/Sparkles'
import { useIdle } from '../../games/idle'
import { wait } from '../../games/lines'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { LINES, type LessonLetter } from './data'

const LANE = 20
/** 描字板的邏輯座標（跟 SVG viewBox、Ink 一樣） */
const VIEW_H = 140

/**
 * 每一輪的顏色：兩輪看得出不一樣（A5：要多練的話每一輪要看得出不一樣）。
 * 起點圓點兩輪都是綠色：語音說「Start at the green dot!」，三歲認得顏色，圓點變藍色就對不上（AI 小男生測試 2026-11-02）。
 * tag：右邊大小寫格子的顏色。
 */
const LOOKS = {
  green: { rim: '#CFE3D6', lane: '#8FCBAA', dot: '#4E9A72', dash: '#9DB5A6', tag: '#4E9A72' },
  blue: { rim: '#D3E2F1', lane: '#9DC2E5', dot: '#4E9A72', dash: '#9AB0C6', tag: '#3E7DB6' },
} as const

/**
 * 描字的回合（A5，全球幼教指引：3～4 歲描字只示範、不求多）：大寫一次、小寫一次，每一次都先示範、描完就慶祝。
 * 以前是大寫兩次、小寫兩次，AI 小男生每次到第二遍就無聊、按返回。兩輪換顏色，看得出是新的一輪。
 */
const ROUNDS: { big: boolean; demo: boolean; look: keyof typeof LOOKS }[] = [
  { big: true, demo: true, look: 'green' },
  { big: false, demo: true, look: 'blue' },
]

/** 鼓勵的話最少隔多久說一次（不要一直講） */
const CHEER_GAP_MS = 5000
/** 偏離路徑多少點才提醒（偶爾手抖不算） */
const STRAY_POINTS = 10

function strokeStart(d: string) {
  const s = samplePath(d, 3)
  const a = s[0]
  const b = s[Math.min(4, s.length - 1)]
  return { x: a.x, y: a.y, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/**
 * 描字（英文課第 2 段）：今天的大寫、小寫各描一次，用觸控筆或手指都可以。
 * 粗跑道、起點圓點和箭頭、一筆一筆照筆順描（PathTracker）。描得好不好只寫進作答紀錄，不影響隔天上哪個字母（A5）。
 * - 每一輪先「Watch me!」筆照筆順描一次，說完「Your turn!」才能畫；示範中畫不出線（Ink disabled），也不會記成作答。
 * - 要沿著跑道一路描到底才算描完一筆：點一下、亂畫都不會自動完成。沒描到的線放開後淡掉。
 * - 回饋（AI 小男生測試 #3）：
 *   - 起點附近按下去吸到起點（SNAP_MM，3 歲手指的偏差），圓點那邊亮一圈、有一條虛線從手指連過去；
 *   - 描到一半放手、或一直偏離跑道：圓點彈一下，豆豆說一句鼓勵的話（最少隔 5 秒）；
 *   - 按得太遠（吸不到）：圓點彈一下；連兩次再說一次「從綠點開始」；
 *   - 下一筆的起點有一圈光往外擴，看得出要從哪裡開始；
 *   - 10 秒沒動：筆把這一筆從頭再描一次（不出墨、不說話）；再 15 秒說一次「從綠點開始」。
 */
export function Trace({ letter, onDone }: { letter: LessonLetter; onDone: (good: number) => void }) {
  const [r, setR] = useState(0)
  const round = ROUNDS[r]
  const look = LOOKS[round.look]
  const strokes = round.big ? letter.upper : letter.lower
  const [stroke, setStroke] = useState(0)
  const [prog, setProg] = useState(0)
  const [done, setDone] = useState(false)
  const [demo, setDemo] = useState(false)
  const [hold, setHold] = useState(true)
  const [again, setAgain] = useState<number | null>(null)
  /** 圓點彈一下（在哪裡、第幾次） */
  const [bounce, setBounce] = useState<{ at: P2; n: number } | null>(null)
  /** 吸附：手指按在哪裡（虛線從那裡連到起點） */
  const [snapFx, setSnapFx] = useState<{ from: P2; n: number } | null>(null)
  const tracker = useRef<PathTracker | null>(null)
  const paper = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const moved = useRef(false)
  const busy = useRef(true)
  const live = useRef(true)
  const devs = useRef<{ offRatio: number; meanDev: number }[]>([])
  const good = useRef(0)
  const t0 = useRef(0)
  const misses = useRef(0)
  const strayed = useRef(0)
  const cheeredAt = useRef(0)
  const spoke = useRef(false)
  const fx = useRef(0)
  const ink = useRef<InkHandle>(null)
  const idle = useIdle()
  const cur = useRef({ r: 0, strokes, stroke: 0 })
  cur.current = { r, strokes, stroke }

  const nameKey = (big: boolean) => (big ? `ph.${letter.l}.big` : `ph.${letter.l}.little`)
  const glyphOf = (big: boolean) => (big ? letter.L : letter.l)

  const begin = (ss: string[], k: number) => {
    cur.current.stroke = k
    setStroke(k)
    tracker.current = new PathTracker(ss[k], 2, LANE * 0.85)
    setProg(0)
  }

  /** 吸附範圍換成描字板的座標（板子多大照實際畫面量） */
  const snapUnits = () => {
    const h = paper.current?.getBoundingClientRect().height ?? 0
    return h > 0 ? (SNAP_MM * PX_PER_MM * VIEW_H) / h : 0
  }

  /** 圓點彈一下：在這一筆現在要接著描的地方 */
  const bump = () => {
    const t = tracker.current
    if (!t) return
    setBounce({ at: t.samples[Math.min(t.progress, t.samples.length - 1)], n: ++fx.current })
  }

  /** 鼓勵的話：最少隔 CHEER_GAP_MS，不打斷別的話 */
  const cheer = (key: string) => {
    const now = performance.now()
    if (now - cheeredAt.current < CHEER_GAP_MS) return
    cheeredAt.current = now
    void say(key)
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
    void logTeach({ station: 'english', game: 'lesson-en', itemId: `write:${glyphOf(big)}`, skill: `write:${glyphOf(big)}`, level: 1, ms: Math.round(performance.now() - s) })
    await say('d.intro.glyph', 'teach.turn.dodo')
  }

  /** 沒動 10 秒：筆把這一筆從頭描一次（不出墨），停在孩子該接著描的地方 */
  const showAgain = async () => {
    const t = tracker.current
    if (!t || t.done) return
    const to = t.samples.length - 1
    const same = () => live.current && tracker.current === t
    await tween(Math.max(1200, to * 22), (f) => setAgain(Math.round(to * f)), same, easeInOut)
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
    setBounce(null)
    setSnapFx(null)
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
    spoke.current = false
    idle.start(
      {
        repeat: () => void showAgain(),
        hint: () => {
          // 只說一次；之後每 40 秒筆再安靜地描一次
          if (!spoke.current) void say('d.intro.glyph')
          spoke.current = true
          void showAgain()
        },
      },
      { repeat: 10_000, hint: 15_000 },
    )
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
    const { r: i, strokes: ss } = cur.current
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
    const g = glyphOf(ROUNDS[i].big)
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
    // 描完一次就慶祝（A5）
    sfx.done()
    await say('d.glyph.done')
    await wait(450)
    if (!live.current) return
    if (i + 1 >= ROUNDS.length) return onDone(good.current)
    setR(i + 1)
    void start(i + 1)
  }

  const onDown = (p: P2) => {
    const t = tracker.current
    if (!t || busy.current) return
    idle.poke()
    setAgain(null)
    moved.current = false
    strayed.current = 0
    // 接著描、描到一半又從起點重新開始、或起點附近吸過去（track.ts 的 penDown）
    const how = t.penDown(p, snapUnits())
    drawing.current = !!how
    if (how === 'snap') {
      setSnapFx({ from: p, n: ++fx.current })
      misses.current = 0
    } else if (how) misses.current = 0
    else {
      // 按得太遠：圓點彈一下告訴他在這裡；連兩次再說一次從綠點開始
      bump()
      if (++misses.current >= 2) {
        misses.current = 0
        cheer('d.intro.glyph')
      }
    }
  }
  const onMove = (p: P2) => {
    const t = tracker.current
    if (!t || busy.current) return
    idle.poke()
    if (!drawing.current) return
    if (t.feed(p)) {
      moved.current = true
      strayed.current = 0
      setProg(t.progress)
      if (t.done) {
        drawing.current = false
        void strokeDone()
      }
    } else if (t.lastDev > LANE * 1.3 && ++strayed.current === STRAY_POINTS) {
      // 一直畫在跑道外面：圓點彈一下、叫他回到線上
      bump()
      cheer('d.glyph.back')
    }
  }
  const onUp = () => {
    const t = tracker.current
    // 描到一半放手：圓點在停下來的地方彈一下，鼓勵他接著描
    if (drawing.current && t && !t.done && t.progress > 0 && !busy.current) {
      bump()
      cheer('d.glyph.keep')
    }
    drawing.current = false
    if (!moved.current) ink.current?.fadeLast()
    moved.current = false
  }

  const st = strokeStart(strokes[stroke])
  const samples = tracker.current?.samples ?? []
  const total = Math.max(1, samples.length - 1)
  const tip = samples[Math.min(prog, samples.length - 1)] ?? st

  return (
    // data-demo、data-accepting：三歲模擬測試看得到「示範中」「還不能畫」（tests/toddler/probe.js 的 teaching()）
    <div className="en-trace" data-demo={demo ? '1' : undefined} data-accepting={hold ? 'false' : undefined}>
      {/* 兩輪：大寫、小寫，描好的變成那一輪的顏色 */}
      <div className="en-trace-rounds" aria-hidden="true">
        {ROUNDS.map((x, i) => (
          <span key={i} className={i < r ? 'is-done' : i === r ? 'is-now' : ''} style={{ '--round': LOOKS[x.look].tag } as CSSProperties}>
            {x.big ? letter.L : letter.l}
          </span>
        ))}
      </div>
      <div className="en-trace-paper" ref={paper}>
        <AnimatePresence initial={false}>
          <motion.div key={r} className="en-trace-board" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.45 } }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
            <svg viewBox={`0 0 100 ${VIEW_H}`} className="en-trace-svg" aria-hidden="true">
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
                  <path d={d} fill="none" stroke={look.rim} strokeWidth={LANE + 3} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={d} fill="none" stroke={i < stroke || done ? look.lane : '#FBF8F2'} strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ))}
              {!done && (
                <>
                  <path d={strokes[stroke]} fill="none" stroke={look.lane} strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`${prog} ${total + 5}`} />
                  <path d={strokes[stroke]} fill="none" stroke={look.dash} strokeWidth={1.2} strokeDasharray="3 3" strokeLinecap="round" />
                  {/* 這一筆的起點：一圈光往外擴（每一筆開始時兩次），看得出要從哪裡開始 */}
                  {prog === 0 && !demo && !hold && (
                    <motion.circle
                      key={`ring-${r}-${stroke}`}
                      data-start-ring=""
                      cx={st.x}
                      cy={st.y}
                      fill="none"
                      stroke={look.dot}
                      strokeWidth={1.6}
                      initial={{ r: 6, opacity: 0.9 }}
                      animate={{ r: 17, opacity: 0 }}
                      transition={{ duration: 1.1, repeat: 2, ease: 'easeOut' }}
                    />
                  )}
                  <motion.circle cx={st.x} cy={st.y} r={6} fill={look.dot} animate={{ r: prog > 0 ? 4 : [5.5, 8, 5.5] }} transition={{ duration: 1.2, repeat: prog > 0 || hold ? 0 : Infinity }} />
                  {prog === 0 && (
                    <g transform={`translate(${st.x} ${st.y}) rotate(${st.ang}) translate(13 0)`}>
                      <path d="M-4 -5 L4 0 L-4 5" fill="none" stroke={look.dot} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  )}
                </>
              )}
              {/* 吸附：從手指按下去的地方一條虛線連到起點，起點亮一圈 */}
              <AnimatePresence>
                {snapFx && !done && (
                  <motion.g key={snapFx.n} data-snap="" initial={{ opacity: 1 }} animate={{ opacity: 0, transition: { delay: 0.6, duration: 0.5 } }} onAnimationComplete={() => setSnapFx((s) => (s?.n === snapFx.n ? null : s))}>
                    <line x1={snapFx.from.x} y1={snapFx.from.y} x2={samples[0]?.x ?? st.x} y2={samples[0]?.y ?? st.y} stroke={look.dot} strokeWidth={1.4} strokeDasharray="2 2" strokeLinecap="round" />
                    <circle cx={snapFx.from.x} cy={snapFx.from.y} r={2.4} fill={look.dot} opacity={0.5} />
                    <motion.circle cx={st.x} cy={st.y} fill="none" stroke={look.dot} strokeWidth={2} initial={{ r: 6 }} animate={{ r: 11 }} transition={{ duration: 0.4, ease: 'easeOut' }} />
                  </motion.g>
                )}
              </AnimatePresence>
              {/* 圓點彈一下：在要接著描的地方 */}
              {bounce && !done && !demo && (
                <motion.circle
                  key={bounce.n}
                  data-bounce=""
                  cx={bounce.at.x}
                  cy={bounce.at.y}
                  fill={look.dot}
                  initial={{ r: 4, opacity: 0.95 }}
                  animate={{ r: [4, 10, 5.5], opacity: [0.95, 0.9, 0] }}
                  transition={{ duration: 0.9, ease: 'easeOut', times: [0, 0.35, 1] }}
                />
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
                <Sparkles count={18} />
              </div>
            )}
            <Ink
              ref={(v) => {
                if (v) ink.current = v
              }}
              w={100}
              h={VIEW_H}
              color="rgba(46,42,37,0.6)"
              size={3.2}
              disabled={hold}
              onDown={onDown}
              onMove={onMove}
              onUp={onUp}
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
