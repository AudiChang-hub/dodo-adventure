import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Palette, CheckButton, PALETTE } from './Palette'
import { PICTURES } from './pictures'
import { svgThumb, saveDrawing } from './save'
import { game as gameDef } from '../../content/games'
import { markPlayed, pickTarget } from '../../lib/adaptive'
import { logAttempt } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../lines'

/** 著色：點一下就整塊塗滿，3 歲孩子不會因為塗出線外而挫折 */
export function ColoringGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [pic] = useState(() => pickTarget(PICTURES, (p) => `coloring:${p.id}`))
  const [fills, setFills] = useState<Record<string, string>>({})
  const [color, setColor] = useState(PALETTE[0])
  const [splash, setSplash] = useState<string | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const t0 = useRef(performance.now())
  const taps = useRef(0)
  const live = useRef(true)
  const finishing = useRef(false)

  useEffect(() => {
    live.current = true
    markPlayed(def.id)
    void say(def.intro)
    return () => {
      live.current = false
      stopSpeech()
    }
  }, [def])

  const paint = (id: string) => {
    taps.current++
    sfx.pop()
    setSplash(id)
    setFills((f) => ({ ...f, [id]: color }))
  }

  const finish = async () => {
    if (finishing.current) return
    const filled = Object.keys(fills).length
    if (filled === 0) return void say(def.intro)
    finishing.current = true
    sfx.done()
    const thumb = svg.current ? await svgThumb(svg.current) : ''
    await saveDrawing(def.id, `著色：${pic.title}`, thumb, { picture: pic.id, fills })
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: pic.id,
      skill: `coloring:${pic.id}`,
      level: 1,
      options: [],
      answer: '',
      taps: [],
      firstTryCorrect: filled >= Math.ceil(pic.regions.length / 2),
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: { regions: pic.regions.length, filled, colorsUsed: new Set(Object.values(fills)).size, taps: taps.current },
    })
    await say('d.color.done')
    await wait(400)
    if (live.current) onDone({ items: 1, firstTry: 1 })
  }

  return (
    <Shell station="draw" mood="idle" onExit={onExit} hideHost>
      <div style={{ position: 'absolute', inset: '0 14% 4% 4%' }}>
        <svg ref={svg} viewBox="0 0 1000 600" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g transform={pic.transform}>
            {pic.regions.map((rg) => (
              <motion.path
                key={rg.id}
                d={rg.d}
                fill={fills[rg.id] ?? '#FBF8F2'}
                stroke="#2E2A25"
                strokeWidth={2.4}
                strokeLinejoin="round"
                animate={splash === rg.id ? { scale: [1, 1.03, 1] } : {}}
                style={{ transformBox: 'fill-box', transformOrigin: 'center', cursor: 'pointer' }}
                onPointerDown={() => paint(rg.id)}
              />
            ))}
            {pic.deco.map((d, i) => (
              <path key={i} d={d} fill={i === 0 && pic.id === 'dodo' ? '#2E2A25' : 'none'} stroke="#2E2A25" strokeWidth={2.4} strokeLinecap="round" pointerEvents="none" />
            ))}
          </g>
        </svg>
      </div>
      <Palette value={color} onChange={setColor} />
      <CheckButton onPress={finish} />
    </Shell>
  )
}
