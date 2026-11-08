import { useContext, useEffect, useRef, useState } from 'react'
import { Resting, Shell, HomeIcon, type GameProps } from '../Shell'
import { Ink, type InkHandle } from './Ink'
import { Palette, CheckButton, ClearButton, PALETTE } from './Palette'
import { saveDrawing } from './save'
import { Hand, HandArt, easeInOut, tween } from '../Demo'
import { game as gameDef } from '../../content/games'
import { markPlayed } from '../../lib/adaptive'
import { logAttempt } from '../../lib/record'
import { hushSpeech, isSpeaking, say, sfx, stopSpeech } from '../../lib/audio'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { Sparkles } from '../../ui/Sparkles'
import { wait, within } from '../lines'
import { useIdle } from '../idle'
import { firstFinger } from '../NotYet'
import { useTaps } from '../../ui/tap'

/** 手指、筆剛離開畫紙這麼久以內點到完成鍵：當成畫畫的手順便碰到，不算（準則 DRAW-6） */
const LIFT_MS = 500
/**
 * 按勾勾以後作品和星星停多久才接每局的回顧（AI 小男生測試 #7：以前約 3 秒就回首頁，他還來不及看自己的畫）。
 * T-110 起回顧完會回到作品上、點大房子才走，作品看得到的時間不再只有這一段，所以從 6 秒縮成 4 秒。
 */
const SHOW_MS = 4000
/** 停在作品上：多久沒點房子，示範的手在房子上點一下（跟下課畫面 LessonBye 一樣） */
const HOME_HAND_MS = 3000

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
 * 按勾勾：作品留在畫紙上、星星撒下來，停 4 秒才交出去（之後是每局的慶祝）；慶祝完回到作品上，工具收起來，
 * 右邊換成一顆大房子（PlayGame 的 Resting），點房子才回首頁（T-110：以前點畫面任何地方就被帶回首頁，他只是想再看一下、去點星星）。
 * 展示、停下來的時候點畫紙、星星：畫紙跳一下、冒一點星星（溫和的回應，不會離開）；停下來時再讓手在房子上點一下給他看。
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
  /** 展示、停下來的時候點畫紙：畫紙跳一下、手指的地方冒星星（n 每點一次加一） */
  const [hop, setHop] = useState<{ n: number; x: number; y: number }>({ n: 0, x: 50, y: 50 })
  const [room, animateRoom] = useAnimate<HTMLDivElement>()
  /** 慶祝完、停在作品上：點大房子回首頁（PlayGame 給），其他時候是 null */
  const home = useContext(Resting)
  const [homeHand, setHomeHand] = useState(0)
  const tap = useTaps()

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
    // 作品和星星：停 SHOW_MS（點畫紙不會提早結束，T-110）
    const showAt = performance.now()
    setShow(true)
    await within(say('d.free.done'), SHOW_MS, undefined)
    await wait(Math.max(300, SHOW_MS - (performance.now() - showAt)))
    if (live.current) onDone({ items: 1, firstTry: 1 })
  }

  /** 展示、停下來的時候點畫紙：跳一下、冒星星；停下來的時候手接著在房子上點一下（下一步在那裡） */
  const poke = (e: { clientX: number; clientY: number }) => {
    const r = room.current?.getBoundingClientRect()
    const x = r && r.width ? ((e.clientX - r.left) / r.width) * 100 : 50
    const y = r && r.height ? ((e.clientY - r.top) / r.height) * 100 : 50
    sfx.tap()
    setHop((h) => ({ n: h.n + 1, x, y }))
    // 整張畫紙輕輕跳一下（一次就停，MOTION-1/2）。不能用換 key 重新掛上：畫布會被清掉
    if (room.current) void animateRoom(room.current, { y: [0, -16, 0] }, { duration: 0.45, ease: 'easeOut' })
    if (home) setHomeHand(1)
  }

  // 停在作品上：3 秒沒點房子，手在房子上點一下；點畫紙之後也會再點一下給他看
  useEffect(() => {
    if (!home) return
    const h = window.setTimeout(() => setHomeHand((v) => v || 1), HOME_HAND_MS)
    return () => clearTimeout(h)
  }, [home])
  useEffect(() => {
    if (homeHand !== 1) return
    const t = window.setTimeout(() => setHomeHand(2), 700)
    const tt = window.setTimeout(() => setHomeHand(0), 1700)
    return () => {
      clearTimeout(t)
      clearTimeout(tt)
    }
  }, [homeHand])

  return (
    <Shell station="draw" mood="idle" onExit={onExit} hideHost>
      <div ref={room} className="tool-room" style={{ position: 'absolute', inset: '0 13% 4% 3%', borderRadius: 32, background: '#FBF8F2', boxShadow: '0 8px 0 rgba(46,42,37,.08)', overflow: 'hidden' }}>
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
            onPointerDown={(e) => {
              if (firstFinger(e.nativeEvent)) poke(e)
            }}
          >
            {hop.n > 0 && (
              <div key={hop.n} style={{ position: 'absolute', left: `${hop.x}%`, top: `${hop.y}%` }}>
                <Sparkles count={8} />
              </div>
            )}
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
      {/* 停在作品上：工具收起來，同一個地方換成一顆大房子，點了才回首頁（T-110）。左上角的返回鍵照樣也能回去 */}
      {home && (
        <div className="draw-home-col" data-resting="">
          <motion.button
            className="draw-home turn-hop"
            aria-label="回首頁"
            style={{ animationDelay: '0.9s' }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
            whileTap={{ scale: 0.92 }}
            {...tap('home', () => {
              sfx.tap()
              home()
            })}
          >
            <HomeIcon />
            <AnimatePresence>
              {homeHand > 0 && (
                <span className="draw-home-hand" aria-hidden="true">
                  <Hand x={58} y={56} tap={homeHand - 1} size="52%" cuff="#F2C9A8" />
                </span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      )}
      {/* 展示作品的時候工具都不能按（不會一碰垃圾桶就把作品清掉）；停在作品上的時候整個收起來 */}
      <div style={{ display: home ? 'none' : 'contents', pointerEvents: show ? 'none' : undefined }}>
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
