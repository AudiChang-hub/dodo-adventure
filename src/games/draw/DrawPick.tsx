import { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell } from '../Shell'
import { CATS, PICTURES, type Picture } from './pictures'
import { go } from '../../lib/nav'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { useTaps } from '../../ui/tap'
import './coloring.css'

// 畫畫的入口（T-138，家長 2026-11-11：「畫圖的部分我希望有著色本，這樣比較好玩」）：
// 首頁的「畫畫」→ 選白紙自由畫還是著色本（兩個大圖示，沒有字）→ 著色本：左邊分類、右邊一頁 6 張、大箭頭翻頁，點一張就開始塗。
// 每一層返回鍵點一下回上一層（塗一張圖 → 著色本 → 選白紙還是著色本 → 首頁，lib/nav.ts 的 parentOf）。

const INK = '#2E2A25'
const PAPER = '#FBF8F2'

/** 進來說一句：延到下一輪才說（換畫面時 App 會在子元件掛上之後才 stopSpeech，一掛上就說的會被切掉） */
function useHello(line: string) {
  useEffect(() => {
    const t = window.setTimeout(() => void say(line), 0)
    return () => {
      clearTimeout(t)
      stopSpeech()
    }
  }, [line])
}

/** 只走一次：連點、兩根手指同時點兩張，只照第一下換畫面 */
function useGoOnce() {
  const gone = useRef(false)
  return (fn: () => void) => {
    if (gone.current) return
    gone.current = true
    sfx.tap()
    fn()
  }
}

/** 白紙自由畫的圖示：一張白紙、上面一道彩色的塗鴉、旁邊一支蠟筆 */
export function FreeArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <g strokeLinejoin="round" strokeLinecap="round">
        <rect x={34} y={22} width={164} height={150} rx={14} fill="#E6DCCB" transform="rotate(-4 116 97)" />
        <rect x={30} y={18} width={164} height={150} rx={14} fill={PAPER} stroke={INK} strokeWidth={4} />
        <path d="M58 126 C70 70 104 64 110 98 S146 138 156 84 S170 54 176 66" fill="none" stroke="#E98A7A" strokeWidth={11} />
        <path d="M60 148 Q96 132 132 148 T178 142" fill="none" stroke="#8FCBAA" strokeWidth={9} />
        <circle cx={70} cy={52} r={13} fill="#F1D27C" stroke={INK} strokeWidth={3} />
        <g transform="rotate(-48 196 120)">
          <path d="M152 112 Q150 120 152 128 L176 136 V104 Z" fill="#7FA9DC" stroke={INK} strokeWidth={4} />
          <rect x={174} y={102} width={74} height={36} rx={8} fill="#7FA9DC" stroke={INK} strokeWidth={4} />
          <rect x={190} y={102} width={42} height={36} fill={PAPER} opacity={0.45} />
        </g>
      </g>
    </svg>
  )
}

/** 一張著色圖的線稿（縮圖用）：每一塊塗紙色、後面的蓋前面的，所以被蓋住的線不會露出來；colors 給了就塗上顏色 */
export function PictureArt({ pic, colors, box }: { pic: Picture; colors?: Record<string, string>; box?: { x: number; y: number; w: number; h: number } }) {
  const eyes = new Set(pic.ink ?? [])
  return (
    <svg viewBox="0 0 1000 600" x={box?.x} y={box?.y} width={box?.w ?? '100%'} height={box?.h ?? '100%'} aria-hidden="true" style={{ display: 'block' }}>
      <g transform={pic.transform} stroke={INK} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
        {pic.regions.map((r) => (
          <path key={r.id} d={r.d} fill={colors?.[r.id] ?? PAPER} />
        ))}
        {pic.deco.map((d, i) => (
          <path key={i} d={d} fill={eyes.has(i) ? INK : 'none'} />
        ))}
      </g>
    </svg>
  )
}

/** 著色本的圖示：上面有線圈的本子，翻開的那頁是一條塗了一半的小魚 */
export function BookArt() {
  const fish = PICTURES.find((p) => p.id === 'fish')!
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <g strokeLinejoin="round" strokeLinecap="round">
        <rect x={30} y={30} width={184} height={150} rx={14} fill="#A3C4E4" stroke={INK} strokeWidth={4} />
        <rect x={22} y={22} width={184} height={150} rx={14} fill={PAPER} stroke={INK} strokeWidth={4} />
        <PictureArt pic={fish} box={{ x: 26, y: 42, w: 176, h: 124 }} colors={{ body: '#F0B088', tail: '#F1D27C', top: '#F1D27C', stripe: '#E98A7A', bubble1: '#A3C4E4' }} />
        {[48, 78, 108, 138, 168].map((x) => (
          <path key={x} d={`M${x} 12 Q${x + 8} 12 ${x + 8} 22 Q${x + 8} 32 ${x} 32`} fill="none" stroke={INK} strokeWidth={4} />
        ))}
      </g>
    </svg>
  )
}

/** 首頁「畫畫」進來：白紙自由畫、著色本，兩個大圖示 */
export function DrawPick() {
  useHello('d.pick.intro')
  const tap = useTaps()
  const once = useGoOnce()
  const cards = [
    { id: 'free', label: '白紙自由畫', art: <FreeArt />, to: () => go({ name: 'play', game: 'd-free', station: 'draw' }) },
    { id: 'book', label: '著色本', art: <BookArt />, to: () => go({ name: 'coloring' }) },
  ]
  return (
    <Shell station="draw" mood="idle" onExit={() => go({ name: 'home' }, { back: true })} hideHost hint={false}>
      <div className="draw-pick" data-draw-pick="">
        {cards.map((c, i) => (
          <motion.button
            key={c.id}
            className="draw-pick-card"
            data-pick={c.id}
            aria-label={c.label}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.1 + i * 0.12 }}
            whileTap={{ scale: 0.95 }}
            {...tap(c.id, () => once(c.to))}
          >
            {c.art}
          </motion.button>
        ))}
      </div>
    </Shell>
  )
}

/** 著色本上次看的分類、翻到第幾頁：塗完一張回來還在同一類、同一頁 */
let lastCat = 'dino'
const lastPage = new Map<string, number>()

/** 一頁幾張：3 欄 2 排，每張都比手掌大，整頁放得進畫面，不用捲 */
export const PER_PAGE = 6
/** 手指左右滑這麼遠就翻頁（另外有大箭頭，滑不會也翻得到） */
const SWIPE_PX = 70

/** 翻頁的大箭頭（≥ 2 cm，準則 TOUCH-1）：朝左上一頁、朝右下一頁 */
function Arrow({ dir }: { dir: -1 | 1 }) {
  return (
    <svg viewBox="0 0 48 48" width="56%" aria-hidden="true" style={{ transform: dir < 0 ? 'scaleX(-1)' : undefined }}>
      <path d="M17 10 L33 24 L17 38" fill="none" stroke={INK} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 著色本（T-139：盲測 ccf7ac7「圖卡要往下捲才看得全，3 歲不一定會捲」）：
 * 左邊一排分類的大圖示（恐龍、動物、海洋、交通工具、水果、房子和氣球；圖示是那一類塗好顏色的一張圖，沒有字），
 * 右邊一頁 6 張縮圖，整頁都看得到、不用捲；兩邊的大箭頭點一下翻頁（左右滑也可以），下面的小圓點是第幾頁。
 * 第一頁沒有往左的箭頭、最後一頁沒有往右的箭頭。點一張就開始塗。
 */
export function ColoringBook() {
  useHello('d.book.intro')
  const tap = useTaps()
  const once = useGoOnce()
  const uid = useId()
  const [cat, setCat] = useState(() => (CATS.some((c) => c.id === lastCat) ? lastCat : CATS[0].id))
  const list = PICTURES.filter((p) => p.cat === cat)
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE))
  const [page, setPage] = useState(() => Math.min(lastPage.get(cat) ?? 0, pages - 1))
  /** 翻頁的方向：新的一頁從那一邊滑進來 */
  const [dir, setDir] = useState(1)
  const at = Math.min(page, pages - 1)
  const shown = list.slice(at * PER_PAGE, at * PER_PAGE + PER_PAGE)
  const flip = (d: -1 | 1) => {
    const next = at + d
    if (next < 0 || next >= pages) return
    sfx.pop()
    setDir(d)
    setPage(next)
    lastPage.set(cat, next)
  }
  const flipRef = useRef(flip)
  flipRef.current = flip
  /** 左右滑翻頁：只跟第一根手指，放手時看橫的走了多遠（直的走比較多就不算） */
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null)
  return (
    <Shell station="draw" mood="idle" onExit={() => go({ name: 'draw' }, { back: true })} hideHost hint={false}>
      <div className="coloring-book" data-coloring-book="" data-cat={cat} data-page={at} data-pages={pages}>
        <div className="coloring-cats" role="tablist">
          {CATS.map((c) => {
            const pic = PICTURES.find((p) => p.id === c.icon) ?? PICTURES.find((p) => p.cat === c.id)!
            const on = c.id === cat
            return (
              <button
                key={c.id}
                className={`coloring-cat${on ? ' on' : ''}`}
                role="tab"
                data-cat={c.id}
                aria-label={c.title}
                aria-selected={on}
                {...tap(`cat-${c.id}`, () => {
                  if (on) return
                  sfx.pop()
                  lastCat = c.id
                  setCat(c.id)
                  setDir(1)
                  setPage(lastPage.get(c.id) ?? 0)
                })}
              >
                <PictureArt pic={pic} colors={c.colors} />
              </button>
            )
          })}
        </div>
        <div className="coloring-pager">
          <button className="coloring-arrow coloring-prev" aria-label="上一頁" data-hidden={at === 0 ? '' : undefined} {...tap('prev', () => flipRef.current(-1))}>
            <Arrow dir={-1} />
          </button>
          <div
            className="coloring-pagebox"
            onPointerDown={(e) => {
              if (!swipe.current) swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
            }}
            onPointerUp={(e) => {
              const s = swipe.current
              if (!s || s.id !== e.pointerId) return
              swipe.current = null
              const dx = e.clientX - s.x
              if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) flipRef.current(dx < 0 ? 1 : -1)
            }}
            onPointerCancel={(e) => {
              if (swipe.current?.id === e.pointerId) swipe.current = null
            }}
          >
            <motion.div
              key={`${cat}-${at}`}
              className="coloring-grid"
              initial={{ x: dir * 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
              {shown.map((p) => (
                <motion.button
                  key={`${uid}-${cat}-${p.id}`}
                  className="coloring-page"
                  data-pic={p.id}
                  aria-label={p.title}
                  whileTap={{ scale: 0.94 }}
                  {...tap(p.id, () => once(() => go({ name: 'play', game: 'd-color', station: 'draw', pic: p.id })))}
                >
                  <PictureArt pic={p} />
                </motion.button>
              ))}
            </motion.div>
            {pages > 1 && (
              <div className="coloring-dots" aria-hidden="true">
                {Array.from({ length: pages }, (_, i) => (
                  <i key={i} className={i === at ? 'on' : undefined} />
                ))}
              </div>
            )}
          </div>
          <button className="coloring-arrow coloring-next" aria-label="下一頁" data-hidden={at >= pages - 1 ? '' : undefined} {...tap('next', () => flipRef.current(1))}>
            <Arrow dir={1} />
          </button>
        </div>
      </div>
    </Shell>
  )
}
