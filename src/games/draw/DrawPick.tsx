import { useEffect, useId, useRef } from 'react'
import { motion } from 'motion/react'
import { Shell } from '../Shell'
import { PICTURES, type Picture } from './pictures'
import { go } from '../../lib/nav'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { useTaps } from '../../ui/tap'
import './coloring.css'

// 畫畫的入口（T-138，家長 2026-11-11：「畫圖的部分我希望有著色本，這樣比較好玩」）：
// 首頁的「畫畫」→ 選白紙自由畫還是著色本（兩個大圖示，沒有字）→ 著色本是 8 張圖的縮圖，點一張就開始塗。
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

/** 著色本：8 張圖的縮圖，點一張就開始塗 */
export function ColoringBook() {
  useHello('d.book.intro')
  const tap = useTaps()
  const once = useGoOnce()
  const uid = useId()
  return (
    <Shell station="draw" mood="idle" onExit={() => go({ name: 'draw' }, { back: true })} hideHost hint={false}>
      <div className="coloring-book" data-coloring-book="">
        {PICTURES.map((p, i) => (
          <motion.button
            key={`${uid}-${p.id}`}
            className="coloring-page"
            data-pic={p.id}
            aria-label={p.title}
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.05 + i * 0.05 }}
            whileTap={{ scale: 0.94 }}
            {...tap(p.id, () => once(() => go({ name: 'play', game: 'd-color', station: 'draw', pic: p.id })))}
          >
            <PictureArt pic={p} />
          </motion.button>
        ))}
      </div>
    </Shell>
  )
}
