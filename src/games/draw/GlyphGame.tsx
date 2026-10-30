import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Ink, type InkHandle } from './Ink'
import { PathTracker, samplePath } from './track'
import { GLYPHS, GLYPH_LEVELS, lookAlike } from './glyphs'
import { HandArt, PenArt, easeInOut, tween } from '../Demo'
import { Sparkles } from '../../ui/Sparkles'
import './glyph.css'
import { game as gameDef } from '../../content/games'
import { level, markPlayed, needsDemo, plays, reportLevel, pickPreferred, skill } from '../../lib/adaptive'
import { themeNow } from '../../lib/theme-play'
import { glyphToolHint } from '../../content/coplay'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { praiseKey, wait } from '../lines'
import { useIdle } from '../idle'
import { Swap } from '../../ui/Scenes'

const ROUNDS = 3
const LANE = 20
/** 一局最多示範兩個新的字 */
const MAX_DEMO = 2

/** 同一個字用手指描好幾次之後，才建議換筆（benchmark 手法 5） */
const FINGER_GOOD = 2

type Tool = 'finger' | 'pen'
/** 這個字現在建議用什麼描：新的字先用手指，熟了才換筆。只是建議，兩種都能畫 */
const toolFor = (g: string): Tool => (skill(`glyph:${g}`).firstTry < FINGER_GOOD ? 'finger' : 'pen')
const toolLine = (t: Tool) => (t === 'finger' ? 'ink.finger' : 'ink.pen')

/** 角落的大圖示：一直留到這個字描完，告訴孩子（和爸爸）現在建議用手指還是筆 */
function ToolBadge({ tool, pulse }: { tool: Tool; pulse: number }) {
  return (
    <motion.div className="tool-badge" key={`${tool}-${pulse}`} initial={{ scale: pulse ? 1 : 0.4, opacity: pulse ? 1 : 0 }} animate={pulse ? { scale: [1, 1.18, 1], rotate: [0, -8, 6, 0], opacity: 1 } : { scale: 1, opacity: 1 }} transition={pulse ? { duration: 0.7 } : { type: 'spring', stiffness: 260, damping: 15 }} aria-hidden="true">
      <svg viewBox={tool === 'finger' ? '-6 -2 76 92' : '-40 -92 90 100'} width="62%">
        {tool === 'finger' ? <HandArt cuff="#BFB2DF" /> : <PenArt />}
      </svg>
      <span>{tool === 'finger' ? '用手指' : '用筆'}</span>
    </motion.div>
  )
}

const isDigit = (g: string) => /\d/.test(g)
const nameLine = (g: string) => (isDigit(g) ? `d.glyph.num.${g}` : `en.thisis.${g}`)

/** 每一筆的起點與起始方向（畫箭頭用） */
function strokeStart(d: string) {
  const s = samplePath(d, 3)
  const a = s[0]
  const b = s[Math.min(4, s.length - 1)]
  return { x: a.x, y: a.y, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/**
 * 描數字、描字母：粗跑道＋綠色起點＋箭頭，一筆一筆描。
 * 新的字（或第一次玩）先「Watch me!」：照筆順描一次，再「Your turn!」。
 * 新的字建議用手指、熟了才建議換筆；每次換都有大圖示、語音與示範。兩種工具都能完成，不會卡關。
 */
export function GlyphGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [glyph, setGlyph] = useState('1')
  const [stroke, setStroke] = useState(0)
  const [prog, setProg] = useState(0)
  const [done, setDone] = useState(false)
  const [demo, setDemo] = useState(false)
  const tracker = useRef<PathTracker | null>(null)
  const drawing = useRef(false)
  const busy = useRef(true)
  const glyphRef = useRef('1')
  const strokeRef = useRef(0)
  const devs = useRef<{ meanDev: number; offRatio: number }[]>([])
  const t0 = useRef(0)
  const lv = useRef(1)
  const live = useRef(true)
  const first = useRef(0)
  const recent = useRef<string[]>([])
  const demos = useRef(0)
  const firstPlay = useRef(plays(def.id) === 0)
  const idle = useIdle()
  /** 示範、說明中：孩子畫不出線（準則 PHASE-2；家長回報「還在說明時他就已經可以畫」） */
  const [hold, setHold] = useState(true)
  /** 閒置提示「手再描一次」：手在這一筆上的位置（取樣點），null 表示沒有 */
  const [again, setAgain] = useState<number | null>(null)
  const ink = useRef<InkHandle>(null)
  /** 這一筆有沒有描到（沒有的話放開後淡掉：亂畫的線不會一直蓋在字上，準則 DRAW-3） */
  const moved = useRef(false)
  /** 現在建議的工具，與示範時用手指還是筆 */
  const [tool, setTool] = useState<Tool>('finger')
  const toolRef = useRef<Tool | null>(null)
  /** 用了另一種工具時，整局最多溫和地再提示一次 */
  const wrongNudged = useRef(false)
  const [pulse, setPulse] = useState(0)

  const begin = (g: string, k: number) => {
    strokeRef.current = k
    setStroke(k)
    tracker.current = new PathTracker(GLYPHS[g][k], 2, LANE * 0.85)
    setProg(0)
  }

  /** 用建議的工具（手指或筆）照筆順描一次：每一筆從綠點出發，描完換下一筆 */
  const showMe = async (g: string, isNew: boolean) => {
    const s = performance.now()
    if (isNew) demos.current++
    setDemo(true)
    await say('teach.watch.dodo')
    for (let k = 0; k < GLYPHS[g].length; k++) {
      if (!live.current) return
      begin(g, k)
      const total = tracker.current!.samples.length - 1
      await wait(260)
      await tween(Math.max(900, total * 26), (f) => setProg(Math.round(f * total)), () => live.current, easeInOut)
      if (!live.current) return
      sfx.correct()
    }
    // 整個字亮起來，念一次名字
    setDone(true)
    await say(nameLine(g))
    if (!live.current) return
    await wait(250)
    setDone(false)
    setDemo(false)
    begin(g, 0)
    if (isNew) void logTeach({ station: 'draw', game: def.id, itemId: g, skill: `glyph:${g}`, level: lv.current, ms: Math.round(performance.now() - s) })
    // 指令（從綠點開始、往這邊走）放在示範之後，說完「Your turn!」才開放（準則 PHASE-3）
    await say(def.intro, 'teach.turn.dodo')
  }

  /** 閒置第二段：手（筆）沿著現在這一筆描一小段（不出墨），再回到起點停著 */
  const showAgain = async () => {
    const t = tracker.current
    if (!t || t.done) return
    const from = t.progress
    const to = Math.min(t.samples.length - 1, from + Math.max(6, Math.round((t.samples.length - 1) * 0.4)))
    const same = () => live.current && tracker.current === t
    await tween(1500, (f) => setAgain(Math.round(from + (to - from) * f)), same, easeInOut)
    if (!same()) return setAgain(null)
    await wait(300)
    if (same()) setAgain(t.progress)
    else setAgain(null)
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    // 這一回合描過 0 就不出 O（反過來也一樣）：兩個長得像，同一回合一起出會分不清（V-23）
    const pool = [...GLYPH_LEVELS.slice(0, lv.current).join('')].filter((x) => !recent.current.some((r) => lookAlike(r) === x))
    // 主題式冒險先描主題的字（公車旅行的 B、C、O），這一級還沒有就照常挑
    const g = pickPreferred(pool.filter((x) => themeNow()?.glyphs.includes(x)), pool, (x) => `glyph:${x}`, recent.current)
    recent.current = [g, ...recent.current].slice(0, 3)
    glyphRef.current = g
    setGlyph(g)
    setDone(false)
    devs.current = []
    begin(g, 0)
    // 建議的工具：新的字先用手指，用手指描好兩次才換筆。每次換工具（含一局開始）都明確提示：
    // 角落的大圖示、語音「Use your finger! / Now use the pen!」、再用那個工具示範一次
    const t = toolFor(g)
    const switched = toolRef.current !== t
    toolRef.current = t
    setTool(t)
    setPulse(0)
    // 要示範的話，示範完才讓孩子下筆；不示範就跟以前一樣，邊聽邊可以開始描
    const isNew = demos.current < MAX_DEMO && needsDemo(firstPlay.current && i === 0, `glyph:${g}`)
    const show = isNew || switched
    busy.current = show
    setHold(show)
    setAgain(null)
    idle.stop()
    t0.current = performance.now()
    // 要示範的回合：先念這個字、建議的工具，就直接示範；「Start at the green dot! Go this way!」留到示範之後
    if (i === 0 && !show) await say(def.intro, nameLine(g))
    else await say(nameLine(g))
    if (!live.current) return
    if (switched) await say(toolLine(t))
    if (!live.current) return
    if (show) {
      await showMe(g, isNew)
      if (!live.current) return
      t0.current = performance.now()
      busy.current = false
      setHold(false)
    }
    // 閒置：15 秒再唸一次題目 → 再 15 秒手再描一小段 → 之後每 40 秒手再安靜地描一次
    if (glyphRef.current === g && !busy.current) idle.start({ repeat: () => void say(def.intro), hint: () => void showAgain() })
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

  const strokeDone = async () => {
    const g = glyphRef.current
    devs.current.push(tracker.current!.metrics())
    sfx.correct()
    const k = strokeRef.current + 1
    if (k < GLYPHS[g].length) {
      begin(g, k)
      return void say('d.glyph.next')
    }
    setDone(true)
    busy.current = true
    setHold(true)
    idle.stop()
    const off = devs.current.reduce((a, d) => a + d.offRatio, 0) / devs.current.length
    const good = off < 0.4
    if (good) first.current++
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: g,
      skill: `glyph:${g}`,
      phase: 'quiz',
      level: lv.current,
      options: [],
      answer: '',
      taps: [],
      firstTryCorrect: good,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { strokes: GLYPHS[g].length, offRatio: Math.round(off * 100) / 100, meanDev: Math.round((devs.current.reduce((a, d) => a + d.meanDev, 0) / devs.current.length) * 10) / 10 },
    })
    reportLevel(def.id, good, def.maxLevel)
    sfx.done()
    await say('d.glyph.done', nameLine(g), praiseKey('dodo'))
    await wait(400)
    if (!live.current) return
    if (r + 1 >= ROUNDS) return onDone({ items: ROUNDS, firstTry: first.current })
    setR(r + 1)
    start(r + 1)
  }

  const onDown = (p: { x: number; y: number }, type: string) => {
    if (!tracker.current || done || busy.current) return
    // 用了另一種工具：照樣可以畫、可以完成，只是整局最多溫和地再提示一次
    const used: Tool = type === 'pen' ? 'pen' : 'finger'
    if (used !== toolRef.current && !wrongNudged.current) {
      wrongNudged.current = true
      setPulse((n) => n + 1)
      void say(toolLine(toolRef.current!))
    }
    // 有畫線就重新計時
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

  const strokes = GLYPHS[glyph]
  const st = strokeStart(strokes[stroke])
  const samples = tracker.current?.samples ?? []
  const total = Math.max(1, samples.length - 1)
  const tip = samples[Math.min(prog, samples.length - 1)] ?? st
  return (
    <Shell station="draw" mood="idle" progress={{ total: ROUNDS, done: r }} onExit={onExit} hideHost hintText={glyphToolHint(tool)} demo={demo}>
      {/* 換一回合：新的一回合蓋在舊的上面淡入，舊的（答對的樣子）等一下才淡掉，不會一下子變空（ui/Scenes.tsx 的 Swap） */}
      <Swap id={`${r}-${glyph}`} style={{ inset: '0 0 4%' }}>
        <>
        <svg viewBox="0 0 100 140" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          {strokes.map((d, i) => (
            <g key={i}>
              <path d={d} fill="none" stroke="#D9CFBE" strokeWidth={LANE + 3} strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke={i < stroke || done ? '#9FD0B3' : '#FBF8F2'} strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
          {!done && (
            <>
              <path d={strokes[stroke]} fill="none" stroke="#9FD0B3" strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`${prog} ${total + 5}`} />
              <path d={strokes[stroke]} fill="none" stroke="#B9AE9C" strokeWidth={1.2} strokeDasharray="3 3" strokeLinecap="round" />
              <motion.circle cx={st.x} cy={st.y} r={6} fill="#6FAE86" animate={{ r: prog > 0 ? 4 : [5, 7.5, 5] }} transition={{ duration: 1.2, repeat: prog > 0 ? 0 : Infinity }} />
              {prog === 0 && (
                <g transform={`translate(${st.x} ${st.y}) rotate(${st.ang}) translate(13 0)`}>
                  <path d="M-4 -5 L4 0 L-4 5" fill="none" stroke="#6FAE86" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              )}
            </>
          )}
          {/* 閒置提示：手再描一小段，做完停在起點 */}
          {again !== null && !demo && !done && samples[again] && (
            <g data-demo-hand="" transform={`translate(${samples[again].x} ${samples[again].y})`} opacity={0.85}>
              {tool === 'finger' ? (
                <g transform="scale(0.32) translate(-22 -6)">
                  <HandArt cuff="#BFB2DF" />
                </g>
              ) : (
                <PenArt scale={0.3} />
              )}
            </g>
          )}
          {demo && (
            <g transform={`translate(${tip.x} ${tip.y})`}>
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* 手指示範：指尖（HandArt 的 22, 6）對準路徑上的點 */}
                {tool === 'finger' ? (
                  <g transform="scale(0.32) translate(-22 -6)">
                    <HandArt cuff="#BFB2DF" />
                  </g>
                ) : (
                  <PenArt scale={0.3} />
                )}
              </motion.g>
            </g>
          )}
        </svg>
        {done && !demo && (
          <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
            <Sparkles count={16} />
          </div>
        )}
        {/* 建議工具的大圖示：一直留到這個字描完 */}
        {(!done || demo) && <ToolBadge tool={tool} pulse={pulse} />}
        <Ink
          ref={ink}
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
        </>
      </Swap>
    </Shell>
  )
}
