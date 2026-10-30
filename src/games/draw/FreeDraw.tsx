import { useEffect, useRef, useState } from 'react'
import { Shell, type GameProps } from '../Shell'
import { Ink, type InkHandle } from './Ink'
import { Palette, CheckButton, ClearButton, PALETTE } from './Palette'
import { saveDrawing } from './save'
import { HandArt, easeInOut, tween } from '../Demo'
import { game as gameDef } from '../../content/games'
import { markPlayed } from '../../lib/adaptive'
import { logAttempt } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait, within } from '../lines'
import { useIdle } from '../idle'
import { firstFinger } from '../NotYet'

/** 手指、筆剛離開畫紙這麼久以內點到完成鍵：當成畫畫的手順便碰到，不算（準則 DRAW-6） */
const LIFT_MS = 500

/**
 * 自由畫畫：一張空白畫布，畫完存進作品集。
 * 完成、清空都是點一下（不用按住）；清空要再點一次確認（垃圾桶先晃一下）。
 * 發呆時：15 秒再說一次「Draw anything you like!」，再 15 秒手在畫紙中間比劃一下，之後每 40 秒手再安靜地比劃一次（三歲模擬測試 B10）。
 */
export function FreeDraw({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [color, setColor] = useState(PALETTE[2])
  const [thick, setThick] = useState(false)
  const ink = useRef<InkHandle>(null)
  const t0 = useRef(performance.now())
  const live = useRef(true)
  const busy = useRef(false)
  const idle = useIdle()
  const drawing = useRef(false)
  const liftedAt = useRef(0)
  /** 閒置提示的手：在畫紙上的位置（百分比），null 表示沒有 */
  const [hand, setHand] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    live.current = true
    // 延到下一輪才說：換畫面時 App 會在子元件掛上之後才 stopSpeech()（App.tsx 的 useEffect [key]），
    // 一掛上就說的開場句會被它切掉；StrictMode 重新掛載時也不會說兩次
    const boot = window.setTimeout(async () => {
      markPlayed(def.id)
      await say(def.intro)
      if (live.current) idle.start({ repeat: () => void say(def.intro), hint: () => void showAgain() })
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def])

  /** 閒置第二段：手在畫紙中間畫一個小圈圈的樣子（不出墨），再停在那裡 */
  const handOn = useRef(false)
  const showAgain = async () => {
    if (drawing.current || busy.current) return
    handOn.current = true
    const ok = () => live.current && handOn.current && !drawing.current
    await tween(1800, (f) => setHand({ x: 50 + 12 * Math.cos(f * Math.PI * 2 - Math.PI / 2), y: 46 + 16 * Math.sin(f * Math.PI * 2 - Math.PI / 2) }), ok, easeInOut)
  }
  const hideHand = () => {
    handOn.current = false
    setHand(null)
  }

  const finish = async () => {
    const strokes = ink.current?.strokes() ?? []
    if (busy.current) return
    if (!strokes.length) return void say(def.intro)
    busy.current = true
    idle.stop()
    hideHand()
    sfx.done()
    const compact = strokes.map((s) => ({ c: s.color, s: s.size, p: s.pts.filter((_, i) => i % 2 === 0).map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.p * 100) / 100]) }))
    // 存作品、說話等不到（剛從背景切回來、資料庫出錯）也一定收尾（三歲模擬測試 B01）
    await within(Promise.resolve().then(() => saveDrawing(def.id, '自由畫畫', ink.current!.snapshot(), compact)), 3000, undefined)
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: 'free',
      skill: 'free-draw',
      phase: 'quiz',
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
    await within(say('d.free.done'), 6000, undefined)
    await wait(300)
    if (live.current) onDone({ items: 1, firstTry: 1 })
  }

  return (
    <Shell station="draw" mood="idle" onExit={onExit} hideHost>
      <div className="tool-room" style={{ position: 'absolute', inset: '0 13% 4% 3%', borderRadius: 32, background: '#FBF8F2', boxShadow: '0 8px 0 rgba(46,42,37,.08)', overflow: 'hidden' }}>
        <Ink
          ref={ink}
          w={1000}
          h={620}
          color={color}
          size={thick ? 34 : 16}
          onDown={() => {
            drawing.current = true
            hideHand()
            idle.poke()
          }}
          onUp={() => {
            drawing.current = false
            liftedAt.current = performance.now()
            idle.poke()
          }}
        />
        {hand && (
          <div className="demo-hand" style={{ left: `${hand.x}%`, top: `${hand.y}%`, width: 'min(11cqmin, 90px)' }}>
            <svg viewBox="0 0 64 84" width="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
              <HandArt />
            </svg>
          </div>
        )}
      </div>
      <Palette
        value={color}
        onChange={(c) => {
          setColor(c)
          idle.poke()
        }}
      >
        <CheckButton onPress={finish} guard={() => drawing.current || performance.now() - liftedAt.current < LIFT_MS} />
        <ClearButton onClear={() => ink.current?.clear()} />
        <button
          className="tool"
          aria-label="換筆的粗細"
          onPointerDown={(e) => {
            if (!firstFinger(e.nativeEvent)) return
            sfx.pop()
            setThick((t) => !t)
          }}
        >
          <span style={{ width: thick ? 46 : 18, height: thick ? 46 : 18, borderRadius: '50%', background: color, transition: 'all .25s' }} />
        </button>
      </Palette>
    </Shell>
  )
}
