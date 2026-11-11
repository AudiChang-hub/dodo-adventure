import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Again, Resting, Shell, type GameProps } from '../Shell'
import { Ink, type InkHandle, type Pt } from './Ink'
import { Palette, CheckButton, ClearButton, PALETTE } from './Palette'
import { imageOf, onPaper, saveDrawing, svgThumb } from './save'
import { Backdrop, MirrorGuide, PaperButton, PAPER_H, PAPER_W } from './Backdrop'
import { MagicButton, StampButton } from './Stamps'
import { EraserButton, EraserRing } from './Eraser'
import { BRUSH_VARIETY, ERASER, ERASE_SIZE, brushOfDay, brushPool, isEraser, isStampTap, makePaint, preloadEmoji, type BrushId } from './brushes'
import { ideaKey } from './lines'
import { dayNumber, getTodayWorld } from '../../lib/today-world'
import { pickVariety } from '../../lib/variety'
import { HandArt, easeInOut, tween } from '../Demo'
import { DoneChoices } from './DoneChoices'
import { FreeArt } from './DrawPick'
import { go } from '../../lib/nav'
import { game as gameDef } from '../../content/games'
import { markPlayed } from '../../lib/adaptive'
import { logAttempt } from '../../lib/record'
import { hushSpeech, isSpeaking, say, sfx, stopSpeech } from '../../lib/audio'
import { motion, useAnimate } from 'motion/react'
import { Sparkles } from '../../ui/Sparkles'
import { wait, within } from '../lines'
import { useIdle } from '../idle'
import { firstFinger } from '../NotYet'

/** 手指、筆剛離開畫紙這麼久以內點到完成鍵：當成畫畫的手順便碰到，不算（準則 DRAW-6） */
const LIFT_MS = 500
/**
 * 按勾勾以後作品和星星停多久才接每局的回顧（AI 小男生測試 #7：以前約 3 秒就回首頁，他還來不及看自己的畫）。
 * T-110 起回顧完會回到作品上、點大房子才走，作品看得到的時間不再只有這一段，所以從 6 秒縮成 4 秒。
 */
const SHOW_MS = 4000

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

/** 畫筆、魔法筆、印章、橡皮擦：工具欄上選到哪一種 */
type Mode = 'pen' | 'magic' | 'stamp' | 'eraser'

/**
 * 自由畫畫：一張畫紙，畫完存進作品集。
 * 今天的世界（lib/today-world.ts，T-127）：畫紙底下鋪今天的淡色線稿（右上角「白紙」鍵可以拿掉、再拿回來），
 * 工具欄多「印章」（點畫紙蓋一個今天的角色、滑動一路蓋，2～3 種輪流）和「今天的魔法筆」（brushes.ts，4 種輪流、連續兩次不一樣）。
 * 沒有今天的世界（回傳 null）時：空白畫紙、沒有印章，魔法筆照樣有（不含要用小圖的蓋印筆）。
 * 橡皮擦（T-132）：點一下就選到，手指走過的地方擦掉一大條（線、魔法筆、印章都擦得掉，今天的背景和畫紙擦不掉）；點任何一個顏色就回到畫筆。
 * 完成、清空都是點一下（不用按住）；清空要再點一次確認（垃圾桶先晃一下）。
 * 發呆時：15 秒說今天的一句（例如「Draw a home for the cow!」，沒有世界時是「Draw anything you like!」），再 15 秒手在畫紙中間比劃一下，之後每 40 秒手再安靜地比劃一次（三歲模擬測試 B10）。
 * 按勾勾：作品留在畫紙上、星星撒下來，停 4 秒才交出去（之後是每局的慶祝）；慶祝完回到作品上，工具收起來，
 * 右邊換成兩個大圖示：再畫一張（新的白紙）、回首頁（T-139⑧，DoneChoices.tsx；T-110：以前點畫面任何地方就被帶回首頁，他只是想再看一下、去點星星）。
 * 按了勾勾工具欄就整個收起來（T-139⑧：綠勾勾還在，孩子以為還要再按）。
 * 展示、停下來的時候點畫紙、星星：畫紙跳一下、冒一點星星（溫和的回應，不會離開）；停下來時再讓手在房子上點一下給他看。
 */
export function FreeDraw({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [color, setColor] = useState(PALETTE[2])
  const [thick, setThick] = useState(false)
  /** 今天的世界：進來的時候決定，玩到一半過了午夜也不換 */
  const world = useMemo(() => getTodayWorld(), [])
  const stamps = world?.stamps ?? []
  const pool = brushPool(!!world)
  const [mode, setMode] = useState<Mode>('pen')
  /** 今天的魔法筆：先照日期，輪換紀錄讀出來再換成紀錄挑的（通常在轉場結束前就決定了） */
  const [brush, setBrush] = useState<BrushId>(() => brushOfDay(dayNumber(new Date()), pool))
  /** 蓋了幾個印章：下一個蓋 stamps[stampIx % 種數] */
  const [stampIx, setStampIx] = useState(0)
  /** 按了「白紙」：今天的背景拿掉 */
  const [blank, setBlank] = useState(false)
  const backdrop = useRef<SVGSVGElement>(null)
  const paint = useMemo(() => makePaint(PAPER_W), [])
  const ink = useRef<InkHandle>(null)
  /** 擦的時候跟著手指的圈圈 */
  const ring = useRef<HTMLDivElement>(null)
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
  /** 慶祝完、停在作品上（PlayGame 給，回上一層），其他時候是 null */
  const home = useContext(Resting)
  /** 停在作品上點「再畫一張」：新的一張白紙（PlayGame 給，T-139⑧） */
  const again = useContext(Again)
  /** 停在作品上點畫紙幾次：每點一次，「再畫一張」上的手再點一次給他看 */
  const [pokes, setPokes] = useState(0)

  useEffect(() => {
    live.current = true
    // 延到下一輪才說：換畫面時 App 會在子元件掛上之後才 stopSpeech()（App.tsx 的 useEffect [key]），
    // 一掛上就說的開場句會被它切掉；StrictMode 重新掛載時也不會說兩次
    const boot = window.setTimeout(async () => {
      markPlayed(def.id)
      await say(def.intro)
      // 發呆時說今天的一句（T-127）：「什麼都可以畫」對三歲等於沒有起點
      const idea = world ? ideaKey(world.id) : def.intro
      if (live.current) idle.start({ repeat: () => void say(idea), hint: () => void showAgain() })
    }, 0)
    if (world) void preloadEmoji(world.stamps)
    void pickVariety(BRUSH_VARIETY, pool).then((b) => live.current && setBrush(b))
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

  /** 橡皮擦的圈圈移到手指的地方（畫紙的邏輯座標換成畫面上的位置；Ink 是等比例置中） */
  const moveRing = (p: Pt) => {
    const el = ring.current
    const r = room.current
    if (!el || !r) return
    const k = Math.min(r.clientWidth / PAPER_W, r.clientHeight / PAPER_H)
    const d = ERASE_SIZE * k
    el.style.display = 'block'
    el.style.width = el.style.height = `${d}px`
    el.style.transform = `translate(${(r.clientWidth - PAPER_W * k) / 2 + p.x * k - d / 2}px, ${(r.clientHeight - PAPER_H * k) / 2 + p.y * k - d / 2}px)`
  }
  const hideRing = () => {
    if (ring.current) ring.current.style.display = 'none'
  }

  const finish = async () => {
    const strokes = ink.current?.strokes() ?? []
    if (busy.current) return
    // 只有擦過（沒有畫）也是空白的畫紙
    if (!strokes.some((s) => !isEraser(s))) return void say(def.intro)
    busy.current = true
    idle.stop()
    hideHand()
    sfx.done()
    const compact = strokes.map((s) => ({ c: s.color, s: s.size, ...(s.brush ? { b: s.brush } : {}), p: s.pts.filter((_, i) => i % 2 === 0).map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.p * 100) / 100]) }))
    // 作品的縮圖：有今天的背景就把背景放在最底下、筆跡和印章蓋在上面（T-127）；背景轉不出來就只存筆跡
    const thumb = async () => {
      const bd = backdrop.current
      // 用過橡皮擦：擦掉的地方是透明的，鋪回紙色再存（T-132）
      if (!bd) return strokes.some(isEraser) ? onPaper(ink.current!.snapshot('transparent')).catch(() => ink.current!.snapshot()) : ink.current!.snapshot()
      try {
        return await svgThumb(bd, 480, '#FBF8F2', undefined, await imageOf(ink.current!.snapshot('transparent')))
      } catch {
        return ink.current!.snapshot()
      }
    }
    // 存作品、說話等不到（剛從背景切回來、資料庫出錯）也一定收尾（三歲模擬測試 B01）
    await within(Promise.resolve().then(async () => saveDrawing(def.id, '自由畫畫', await thumb(), compact)), 3000, undefined)
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
      metrics: {
        strokes: strokes.length,
        colors: new Set(strokes.map((s) => s.color)).size,
        stamps: strokes.filter(isStampTap).length,
        stampTrails: strokes.filter((s) => s.brush?.startsWith('stamp:') && !isStampTap(s)).length,
        magic: strokes.filter((s) => s.brush && !s.brush.startsWith('stamp:') && !isEraser(s)).length,
        erased: strokes.filter(isEraser).length,
        backdrop: backdrop.current ? 1 : 0,
      },
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
    if (home) setPokes((n) => n + 1)
  }

  return (
    <Shell station="draw" mood="idle" onExit={onExit} hideHost>
      <div ref={room} className="tool-room" style={{ position: 'absolute', inset: '0 13% 4% 3%', borderRadius: 32, background: '#FBF8F2', boxShadow: '0 8px 0 rgba(46,42,37,.08)', overflow: 'hidden' }}>
        {world && !blank && <Backdrop ref={backdrop} scene={world.scene} />}
        {mode === 'magic' && brush === 'mirror' && !show && !home && <MirrorGuide />}
        <Ink
          ref={ink}
          w={PAPER_W}
          h={PAPER_H}
          color={color}
          size={mode === 'eraser' ? ERASE_SIZE : thick ? 34 : 16}
          brush={
            mode === 'eraser'
              ? ERASER
              : mode === 'stamp' && stamps.length
                ? `stamp:${stamps[stampIx % stamps.length]}`
                : mode === 'magic'
                  ? brush === 'trail'
                    ? `trail:${stamps.join(',')}`
                    : brush
                  : undefined
          }
          paint={paint}
          onBase={isEraser}
          onDown={(p) => {
            drawing.current = true
            if (mode === 'eraser') moveRing(p)
            hideHand()
            idle.poke()
            // 開場「Draw anything you like!」講到一半就下筆：停掉語音（T-108 搶點，孩子已經在做了）
            if (!busy.current && isSpeaking()) hushSpeech()
          }}
          onMove={(p) => {
            if (mode === 'eraser') moveRing(p)
          }}
          onUp={() => {
            drawing.current = false
            hideRing()
            liftedAt.current = performance.now()
            idle.poke()
            // 蓋好印章（點一下蓋一個、滑動蓋一串）：下一次換下一種角色（格子上的圖跟著換）
            const last = ink.current?.strokes().at(-1)
            if (mode === 'stamp' && stamps.length && last?.brush?.startsWith('stamp:')) {
              sfx.pop()
              setStampIx((i) => i + 1)
            }
          }}
        />
        <EraserRing ref={ring} />
        {world && !show && !home && (
          <PaperButton
            blank={blank}
            onToggle={() => {
              setBlank((b) => !b)
              idle.poke()
            }}
          />
        )}
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
      {/* 停在作品上：工具收起來，同一個地方換成兩個大圖示：再畫一張（新的白紙）、回首頁（T-139⑧）。左上角的返回鍵照樣回上一層 */}
      {home && (
        <DoneChoices
          again={() => (again ? again() : home())}
          againArt={<FreeArt />}
          againLabel="再畫一張"
          line="d.next.free"
          home={() => go({ name: 'home' }, { back: true })}
          poke={pokes}
        />
      )}
      {/* 按了勾勾就整個收起來（T-139⑧：工具、綠勾勾還在的話，孩子以為還要再按一次）；停在作品上換成兩個大圖示 */}
      <div style={{ display: home || show ? 'none' : 'contents' }}>
        <Palette
          value={mode === 'pen' ? color : ''}
          onChange={(c) => {
            setColor(c)
            // 點顏色：回到一般的筆（三歲點顏色就是想用那個顏色畫）
            setMode('pen')
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
          <MagicButton
            brush={brush}
            color={color}
            stamps={stamps}
            on={mode === 'magic'}
            onPress={() => {
              setMode('magic')
              idle.poke()
            }}
          />
          {stamps.length > 0 && (
            <StampButton
              next={stamps[stampIx % stamps.length]}
              count={stampIx}
              on={mode === 'stamp'}
              onPress={() => {
                // 已經是印章：再點一下換下一個角色
                if (mode === 'stamp') setStampIx((i) => i + 1)
                else setMode('stamp')
                idle.poke()
              }}
            />
          )}
          <EraserButton
            on={mode === 'eraser'}
            onPress={() => {
              setMode('eraser')
              idle.poke()
            }}
          />
        </Palette>
      </div>
    </Shell>
  )
}
