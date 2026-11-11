import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell } from '../Shell'
import { CATS, PICTURES, type Picture } from './pictures'
import { go } from '../../lib/nav'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { useTaps } from '../../ui/tap'
import './coloring.css'

// 畫畫的入口（T-138，家長 2026-11-11：「畫圖的部分我希望有著色本，這樣比較好玩」）：
// 首頁的「畫畫」→ 選白紙自由畫還是著色本（兩個大圖示，沒有字）→ 著色本：左邊分類、右邊往下滑的縮圖，點一張就開始塗。
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
function FreeArt() {
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
function BookArt() {
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

/** 著色本上次看的分類、捲到哪裡：塗完一張回來還在同一頁、同一個位置 */
let lastCat = 'dino'
const lastScroll = new Map<string, number>()

/**
 * 著色本：左邊一排分類的大圖示（恐龍、動物、海洋、交通工具、水果、房子和氣球；圖示是那一類塗好顏色的一張圖，沒有字），
 * 右邊是那一類的縮圖，往下滑看更多，點一張就開始塗。
 */
export function ColoringBook() {
  useHello('d.book.intro')
  const tap = useTaps()
  const once = useGoOnce()
  const uid = useId()
  const [cat, setCat] = useState(() => (CATS.some((c) => c.id === lastCat) ? lastCat : CATS[0].id))
  const scroller = useRef<HTMLDivElement>(null)
  /**
   * 手指往上推、往下拉就捲動（自己做，不靠瀏覽器的觸控捲動：在這個 App 裡觸控捲動不一定接得到）。
   * 只跟第一根手指；拖超過 8 px 才算在捲，縮圖的點一下（useTaps 超過 40 px 就不算點）不會變成捲動，捲動也不會打開圖。
   * 紙感螢幕：手放開就停，不滑行。
   */
  const pan = useRef<{ id: number; y: number; top: number; moving: boolean } | null>(null)
  const list = PICTURES.filter((p) => p.cat === cat)
  // 回到上次捲到的位置
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = lastScroll.get(cat) ?? 0
  }, [cat])
  return (
    <Shell station="draw" mood="idle" onExit={() => go({ name: 'draw' }, { back: true })} hideHost hint={false}>
      <div className="coloring-book" data-coloring-book="" data-cat={cat}>
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
                })}
              >
                <PictureArt pic={pic} colors={c.colors} />
              </button>
            )
          })}
        </div>
        <div
          ref={scroller}
          className="coloring-scroll"
          onScroll={(e) => void lastScroll.set(cat, (e.target as HTMLElement).scrollTop)}
          onPointerDown={(e) => {
            if (pan.current || e.pointerType === 'mouse') return
            pan.current = { id: e.pointerId, y: e.clientY, top: e.currentTarget.scrollTop, moving: false }
          }}
          onPointerMove={(e) => {
            const p = pan.current
            if (!p || p.id !== e.pointerId) return
            const dy = e.clientY - p.y
            if (!p.moving && Math.abs(dy) < 8) return
            p.moving = true
            e.currentTarget.scrollTop = p.top - dy
          }}
          onPointerUp={(e) => {
            if (pan.current?.id === e.pointerId) pan.current = null
          }}
          onPointerCancel={(e) => {
            if (pan.current?.id === e.pointerId) pan.current = null
          }}
        >
          <div className="coloring-grid">
            {list.map((p, i) => (
              <motion.button
                key={`${uid}-${cat}-${p.id}`}
                className="coloring-page"
                data-pic={p.id}
                aria-label={p.title}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 240, damping: 24, delay: Math.min(i, 8) * 0.04 }}
                whileTap={{ scale: 0.94 }}
                {...tap(p.id, () => once(() => go({ name: 'play', game: 'd-color', station: 'draw', pic: p.id })))}
              >
                <PictureArt pic={p} />
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  )
}
