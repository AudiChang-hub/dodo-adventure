import { useEffect, useRef, useState } from 'react'
import { Shell, type GameProps } from '../Shell'
import { Ink, type InkHandle } from './Ink'
import { Palette, CheckButton, PALETTE } from './Palette'
import { saveDrawing } from './save'
import { useHold, Ring } from '../../ui/Hold'
import { game as gameDef } from '../../content/games'
import { markPlayed } from '../../lib/adaptive'
import { logAttempt } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../lines'

/** 自由畫畫：一張空白畫布，畫完存進作品集 */
export function FreeDraw({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [color, setColor] = useState(PALETTE[2])
  const [thick, setThick] = useState(false)
  const ink = useRef<InkHandle>(null)
  const t0 = useRef(performance.now())
  const live = useRef(true)
  const busy = useRef(false)
  const clear = useHold(1000, () => {
    sfx.whoosh()
    ink.current?.clear()
  })

  useEffect(() => {
    live.current = true
    markPlayed(def.id)
    void say(def.intro)
    return () => {
      live.current = false
      stopSpeech()
    }
  }, [def])

  const finish = async () => {
    const strokes = ink.current?.strokes() ?? []
    if (busy.current) return
    if (!strokes.length) return void say(def.intro)
    busy.current = true
    sfx.done()
    const compact = strokes.map((s) => ({ c: s.color, s: s.size, p: s.pts.filter((_, i) => i % 2 === 0).map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.p * 100) / 100]) }))
    await saveDrawing(def.id, '自由畫畫', ink.current!.snapshot(), compact)
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: 'free',
      skill: 'free-draw',
      level: 1,
      options: [],
      answer: '',
      taps: [],
      firstTryCorrect: true,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { strokes: strokes.length, colors: new Set(strokes.map((s) => s.color)).size },
    })
    await say('d.free.done')
    await wait(300)
    if (live.current) onDone({ items: 1, firstTry: 1 })
  }

  return (
    <Shell station="draw" mood="idle" onExit={onExit} hideHost>
      <div style={{ position: 'absolute', inset: '0 13% 4% 3%', borderRadius: 32, background: '#FBF8F2', boxShadow: '0 8px 0 rgba(46,42,37,.08)', overflow: 'hidden' }}>
        <Ink ref={ink} w={1000} h={620} color={color} size={thick ? 34 : 16} />
      </div>
      <Palette value={color} onChange={setColor} />
      <div style={{ position: 'absolute', right: '12%', top: '4%', display: 'flex', gap: 14, zIndex: 3 }}>
        <button className="round-btn" aria-label="換筆的粗細" onPointerDown={() => setThick((t) => !t)}>
          <span style={{ width: thick ? 34 : 14, height: thick ? 34 : 14, borderRadius: '50%', background: color, transition: 'all .25s' }} />
        </button>
        <button className="round-btn" aria-label="清空畫布（按住）" {...clear.handlers}>
          <svg viewBox="0 0 48 48" width={38} aria-hidden="true">
            <path d="M12 30 L26 14 L38 26 L28 36 H16 Z" fill="#F3C1B2" stroke="#2E2A25" strokeWidth={3.5} strokeLinejoin="round" />
            <path d="M8 40 H40" stroke="#2E2A25" strokeWidth={3.5} strokeLinecap="round" />
          </svg>
          <Ring progress={clear.progress} />
        </button>
      </div>
      <CheckButton onPress={finish} />
    </Shell>
  )
}
