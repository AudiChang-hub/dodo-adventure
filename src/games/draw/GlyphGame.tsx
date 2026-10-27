import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Ink } from './Ink'
import { PathTracker, samplePath } from './track'
import { GLYPHS, GLYPH_LEVELS } from './glyphs'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef } from '../../content/games'
import { level, markPlayed, reportLevel, pickTarget } from '../../lib/adaptive'
import { logAttempt } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { praiseKey, wait } from '../lines'

const ROUNDS = 3
const LANE = 20

const isDigit = (g: string) => /\d/.test(g)
const nameLine = (g: string) => (isDigit(g) ? `d.glyph.num.${g}` : `en.thisis.${g}`)

/** 每一筆的起點與起始方向（畫箭頭用） */
function strokeStart(d: string) {
  const s = samplePath(d, 3)
  const a = s[0]
  const b = s[Math.min(4, s.length - 1)]
  return { x: a.x, y: a.y, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/** 描數字、描字母：粗跑道＋綠色起點＋箭頭，一筆一筆描 */
export function GlyphGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [r, setR] = useState(0)
  const [glyph, setGlyph] = useState('1')
  const [stroke, setStroke] = useState(0)
  const [prog, setProg] = useState(0)
  const [done, setDone] = useState(false)
  const tracker = useRef<PathTracker | null>(null)
  const drawing = useRef(false)
  const glyphRef = useRef('1')
  const strokeRef = useRef(0)
  const devs = useRef<{ meanDev: number; offRatio: number }[]>([])
  const t0 = useRef(0)
  const lv = useRef(1)
  const live = useRef(true)
  const first = useRef(0)
  const recent = useRef<string[]>([])

  const begin = (g: string, k: number) => {
    strokeRef.current = k
    setStroke(k)
    tracker.current = new PathTracker(GLYPHS[g][k], 2, LANE * 0.85)
    setProg(0)
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
    t0.current = performance.now()
    begin(g, 0)
    if (i === 0) await say(def.intro, nameLine(g))
    else await say(nameLine(g))
  }

  useEffect(() => {
    live.current = true
    markPlayed(def.id)
    start(0)
    return () => {
      live.current = false
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
    const off = devs.current.reduce((a, d) => a + d.offRatio, 0) / devs.current.length
    const good = off < 0.4
    if (good) first.current++
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: g,
      skill: `glyph:${g}`,
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
    if (!tracker.current || done) return
    drawing.current = tracker.current.near(p)
  }
  const onMove = (p: { x: number; y: number }) => {
    const t = tracker.current
    if (!t || !drawing.current || done) return
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
  const total = Math.max(1, (tracker.current?.samples.length ?? 2) - 1)
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
        </svg>
        {done && (
          <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
            <Sparkles count={16} />
          </div>
        )}
        <Ink w={100} h={140} color="rgba(46,42,37,0.6)" size={3.2} onDown={onDown} onMove={onMove} />
      </div>
    </Shell>
  )
}
