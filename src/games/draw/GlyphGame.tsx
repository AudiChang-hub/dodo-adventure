import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Ink } from './Ink'
import { PathTracker, samplePath } from './track'
import { GLYPHS, GLYPH_LEVELS } from './glyphs'
import { PenArt, easeInOut, tween } from '../Demo'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef } from '../../content/games'
import { level, markPlayed, needsDemo, plays, reportLevel, pickTarget } from '../../lib/adaptive'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { praiseKey, wait } from '../lines'
import { useIdle } from '../idle'

const ROUNDS = 3
const LANE = 20
/** 一局最多示範兩個新的字 */
const MAX_DEMO = 2

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
 * 新的字（或第一次玩）先「Watch me!」：一支筆照筆順描一次，再「Your turn!」。
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
  /** 閒置第二段提示：現在這一筆慢慢亮起來 */
  const [nudge, setNudge] = useState(false)

  const begin = (g: string, k: number) => {
    strokeRef.current = k
    setStroke(k)
    tracker.current = new PathTracker(GLYPHS[g][k], 2, LANE * 0.85)
    setProg(0)
  }

  /** 筆照筆順描一次：每一筆從綠點出發，描完換下一筆 */
  const showMe = async (g: string) => {
    const s = performance.now()
    demos.current++
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
    void logTeach({ station: 'draw', game: def.id, itemId: g, skill: `glyph:${g}`, level: lv.current, ms: Math.round(performance.now() - s) })
    await say('teach.turn.dodo')
  }

  const start = async (i: number) => {
    lv.current = level(def.id)
    const pool = [...GLYPH_LEVELS.slice(0, lv.current).join('')]
    const g = pickTarget(pool, (x) => `glyph:${x}`, recent.current)
    recent.current = [g, ...recent.current].slice(0, 3)
    glyphRef.current = g
    setGlyph(g)
    setDone(false)
    devs.current = []
    begin(g, 0)
    // 要示範的話，示範完才讓孩子下筆；不示範就跟以前一樣，邊聽邊可以開始描
    const show = demos.current < MAX_DEMO && needsDemo(firstPlay.current && i === 0, `glyph:${g}`)
    busy.current = show
    idle.stop()
    setNudge(false)
    t0.current = performance.now()
    if (i === 0) await say(def.intro, nameLine(g))
    else await say(nameLine(g))
    if (!live.current) return
    if (show) {
      await showMe(g)
      if (!live.current) return
      t0.current = performance.now()
      busy.current = false
    }
    // 閒置：15 秒再唸一次題目 → 再 15 秒現在這一筆慢慢亮起來 → 之後安靜
    if (glyphRef.current === g && !busy.current) idle.start({ repeat: () => void say(def.intro), hint: () => setNudge(true) })
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

  const onDown = (p: { x: number; y: number }) => {
    if (!tracker.current || done || busy.current) return
    // 有畫線就重新計時
    idle.poke()
    drawing.current = tracker.current.near(p)
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
    <Shell station="draw" mood="idle" progress={{ total: ROUNDS, done: r }} onExit={onExit} hideHost>
      <div key={`${r}-${glyph}`} style={{ position: 'absolute', inset: '0 0 4%' }}>
        <svg viewBox="0 0 100 140" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          {strokes.map((d, i) => (
            <g key={i}>
              <path d={d} fill="none" stroke="#D9CFBE" strokeWidth={LANE + 3} strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke={i < stroke || done ? '#9FD0B3' : '#FBF8F2'} strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
          {!done && (
            <>
              {nudge && !demo && <path className="nudge-path" d={strokes[stroke]} fill="none" stroke="#F1D27C" strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" />}
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
            <Sparkles count={16} />
          </div>
        )}
        <Ink w={100} h={140} color="rgba(46,42,37,0.6)" size={3.2} ink={!demo} onDown={onDown} onMove={onMove} />
      </div>
    </Shell>
  )
}
