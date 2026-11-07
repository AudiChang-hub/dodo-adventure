import { useEffect, useRef, useState } from 'react'
import { Shell, type GameProps } from '../Shell'
import { Ink, type InkHandle } from './Ink'
import { Palette, CheckButton, ClearButton, PALETTE } from './Palette'
import { saveDrawing } from './save'
import { HandArt, easeInOut, tween } from '../Demo'
import { game as gameDef } from '../../content/games'
import { markPlayed } from '../../lib/adaptive'
import { logAttempt } from '../../lib/record'
import { hushSpeech, isSpeaking, say, sfx, stopSpeech } from '../../lib/audio'
import { motion } from 'motion/react'
import { Sparkles } from '../../ui/Sparkles'
import { wait, within } from '../lines'
import { useIdle } from '../idle'
import { firstFinger } from '../NotYet'

/** 手指、筆剛離開畫紙這麼久以內點到完成鍵：當成畫畫的手順便碰到，不算（準則 DRAW-6） */
const LIFT_MS = 500
/** 按勾勾以後作品和星星最少停多久（AI 小男生測試 #7：以前約 3 秒就回首頁，他還來不及看自己的畫） */
const SHOW_MS = 6000
/** 展示剛出現這麼久以內點畫面不算（按勾勾的手常常還在點） */
const SHOW_GRACE_MS = 1200

/** 展示作品時畫紙邊上的星星（百分比位置、大小）：一顆一顆冒出來就留著，不閃（紙感螢幕） */
const SHOW_STARS = [
  { x: 8, y: 10, s: 44 },
  { x: 30, y: 6, s: 34 },
  { x: 52, y: 9, s: 48 },
  { x: 74, y: 6, s: 36 },
  { x: 92, y: 12, s: 46 },
  { x: 6, y: 86, s: 36 },
  { x: 94, y: 84, s: 40 },
]
const STAR_PATH = 'M10 0 L12.6 7.4 L20 10 L12.6 12.6 L10 20 L7.4 12.6 L0 10 L7.4 7.4 Z'
const STAR_COLORS = ['#F1D27C', '#E99A84', '#8FCBAA', '#A3C4E4', '#BFB2DF']

/**
 * 自由畫畫：一張空白畫布，畫完存進作品集。
 * 完成、清空都是點一下（不用按住）；清空要再點一次確認（垃圾桶先晃一下）。
 * 發呆時：15 秒再說一次「Draw anything you like!」，再 15 秒手在畫紙中間比劃一下，之後每 40 秒手再安靜地比劃一次（三歲模擬測試 B10）。
 * 按勾勾：作品留在畫紙上、星星撒下來，停 6 秒（或孩子點一下畫紙）才交出去（之後是每局的慶祝、回首頁）。
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
  /** 按了勾勾：展示作品（畫紙上蓋一層星星，點一下就結束展示） */
  const [show, setShow] = useState(false)
  const showEnd = useRef<(() => void) | null>(null)
  const showAt = useRef(0)

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
    // 作品和星星：至少 SHOW_MS，或孩子點一下畫紙
    showAt.current = performance.now()
    setShow(true)
    const tapped = new Promise<void>((r) => (showEnd.current = r))
    await Promise.race([within(say('d.free.done'), SHOW_MS, undefined).then(() => wait(Math.max(300, SHOW_MS - (performance.now() - showAt.current)))), tapped])
    showEnd.current = null
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
            // 開場「Draw anything you like!」講到一半就下筆：停掉語音（T-108 搶點，孩子已經在做了）
            if (!busy.current && isSpeaking()) hushSpeech()
          }}
          onUp={() => {
            drawing.current = false
            liftedAt.current = performance.now()
            idle.poke()
          }}
        />
        {show && (
          <div
            className="draw-show"
            data-show=""
            style={{ position: 'absolute', inset: 0, zIndex: 4, boxShadow: 'inset 0 0 0 10px #F1D27C', borderRadius: 32 }}
            onPointerDown={() => {
              if (performance.now() - showAt.current < SHOW_GRACE_MS || !showEnd.current) return
              hushSpeech()
              showEnd.current()
            }}
          >
            <div style={{ position: 'absolute', left: '50%', top: '42%' }}>
              <Sparkles count={22} />
            </div>
            {SHOW_STARS.map((st, i) => (
              <motion.svg
                key={i}
                viewBox="0 0 20 20"
                width={st.s}
                aria-hidden="true"
                style={{ position: 'absolute', left: `${st.x}%`, top: `${st.y}%`, marginLeft: -st.s / 2, marginTop: -st.s / 2 }}
                initial={{ scale: 0, rotate: -40 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.25 + i * 0.22, type: 'spring', stiffness: 260, damping: 16 }}
              >
                <path d={STAR_PATH} fill={STAR_COLORS[i % STAR_COLORS.length]} stroke="#2E2A25" strokeWidth={1} strokeLinejoin="round" />
              </motion.svg>
            ))}
          </div>
        )}
        {hand && (
          <div className="demo-hand" style={{ left: `${hand.x}%`, top: `${hand.y}%`, width: 'min(11cqmin, 90px)' }}>
            <svg viewBox="0 0 64 84" width="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
              <HandArt />
            </svg>
          </div>
        )}
      </div>
      {/* 展示作品的時候工具都不能按（不會一碰垃圾桶就把作品清掉） */}
      <div style={{ display: 'contents', pointerEvents: show ? 'none' : undefined }}>
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
      </div>
    </Shell>
  )
}
