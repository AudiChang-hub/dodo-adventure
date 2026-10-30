// 「拿起來放進去」的共用元件：操作降階版（成長系統 G-3；準則 TOUCH-2、FRAME-3）。
//
// 給大孩子的遊戲（拖放、插到中間、多步驟排列）一律用它：同一題在每個年段都能「點一下」完成，
// 年段只決定「能不能拖」，不決定「能不能玩」：
// - 小班段（tap）：只用點的。點一下片子就飛進空格（fill: 'next'），或點片子再點空格（fill: 'choose'）。
// - 中班段（short）：再加上拖放。放手時靠近空格就吸進去；拖到一半放開、放在空白處，片子安靜地回原位，不算錯。
// - 大班段（long）：同上；拖曳本身是學習目標（dragGoal）時才要求拖，點一下片子只會往空格那邊輕推一下示意。
//
// 這個元件只管手勢和片子的移動；對不對、說什麼、算不算第一次答對，都由遊戲在 onPlace 決定。
// 動態照準則 MOTION-1：片子只位移、不縮放、不旋轉、不彈跳；系統「減少動態效果」時直接到位。
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import type { Frame } from '../../content/growth'
import { useGrowth } from '../../lib/growth'
import { EASE } from '../../ui/motion'
import { firstFinger } from '../NotYet'
import './place.css'

export interface PlacePiece {
  id: string
  /** 唸給螢幕閱讀器的名字（孩子看不到） */
  label: string
  node: ReactNode
}

export interface PlaceSlot {
  id: string
  label: string
  /** 空格裡淡淡的提示（例如要放的東西的影子）；放進去之後蓋掉 */
  node?: ReactNode
}

export type PlaceHow = 'tap' | 'drag'

export interface PlaceProps {
  pieces: PlacePiece[]
  slots: PlaceSlot[]
  /** 已經放好的：空格 id → 片子 id（遊戲管理；onPlace 回傳 true 之後由遊戲寫進來） */
  placed: Record<string, string>
  /**
   * 點一下片子之後放到哪裡：
   * - next：直接飛進下一個空格（照順序填、或只有一個空格的題目；TOUCH-2 的「點選項 → 自動飛進空位」）
   * - choose：先拿起來，再點一個空格放進去（要選位置的題目）
   */
  fill: 'next' | 'choose'
  /**
   * 片子飛到空格時呼叫：回傳 true 是放進去（遊戲接著把它寫進 placed），false 是不對，片子溫和地飛回原位。
   * 答錯的回饋（聲音、台詞、算不算第一次答對）由遊戲決定；這裡不做紅叉、不搖晃（FB-1、FB-5）。
   */
  onPlace: (piece: string, slot: string, how: PlaceHow) => boolean
  /** 收不收作答（PHASE-2、PHASE-3）：念題目、示範的時候是 false，點了沒有動作 */
  accepting?: boolean
  /** 拖曳本身是學習目標（插到中間、在格線內寫字）：只有大班段會真的要求拖，其他年段照樣能點（FRAME-3） */
  dragGoal?: boolean
  /** 大班段要求拖、孩子卻用點的：遊戲可以在這裡說一句「拖過去」並示範（片子會先自己往空格輕推一下） */
  onNeedDrag?: (piece: string) => void
  /** 任何一次觸碰（遊戲用來重新計時閒置提醒） */
  onTouch?: () => void
  /** 指定操作方式（家長區的示範用）；沒給就照現在的年段外框 */
  drag?: Frame['drag']
  /** 片子區在空格的哪一邊：橫向平板放下面，空間不夠時遊戲可以改放右邊 */
  tray?: 'below' | 'side'
  className?: string
}

/** 手指移動超過這麼多 px 才算開始拖（小於它都算點一下：三歲的手點下去常常會滑一點點） */
const DRAG_START_PX = 14
/** 飛進空格、飛回原位要多久（秒） */
const FLY_S = 0.32

export function Place({
  pieces,
  slots,
  placed,
  fill,
  onPlace,
  accepting = true,
  dragGoal = false,
  onNeedDrag,
  onTouch,
  drag,
  tray = 'below',
  className,
}: PlaceProps) {
  const growth = useGrowth()
  const mode = drag ?? growth.frame.drag
  const canDrag = mode !== 'tap'
  const mustDrag = dragGoal && mode === 'long'
  const [picked, setPicked] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  /** 正在飛的片子：飛完之前不收別的操作，免得同一個空格被搶兩次 */
  const [flying, setFlying] = useState<string | null>(null)
  const slotEls = useRef(new Map<string, HTMLElement>())
  /** 每個片子的位移（相對原位）和它在原位的位置：fly、back、nudge 用 */
  const refs = useRef(new Map<string, PieceRef>())
  const reduced = useReducedMotion()
  const register = useCallback((id: string, r: PieceRef | null) => {
    if (r) refs.current.set(id, r)
    else refs.current.delete(id)
  }, [])
  const inSlot = new Set(Object.values(placed))
  const empty = slots.filter((s) => !placed[s.id])

  // 拿起來的片子被放好了、或題目換了：放下
  useEffect(() => {
    if (picked && (Object.values(placed).includes(picked) || !pieces.some((p) => p.id === picked))) setPicked(null)
  }, [picked, placed, pieces])

  const live = accepting && !flying

  return (
    <div className={`place place-${tray}${className ? ` ${className}` : ''}`} data-drag={mode} data-must-drag={mustDrag ? '1' : undefined}>
      <div className="place-slots" role="group" aria-label="空格">
        {slots.map((s) => {
          const pieceId = placed[s.id]
          const piece = pieceId ? pieces.find((p) => p.id === pieceId) : undefined
          const target = !piece && (over === s.id || (fill === 'choose' && !!picked))
          return (
            <button
              key={s.id}
              ref={(el) => {
                if (el) slotEls.current.set(s.id, el)
                else slotEls.current.delete(s.id)
              }}
              type="button"
              className={`place-slot${piece ? ' filled' : ''}${target ? ' target' : ''}${over === s.id ? ' over' : ''}`}
              aria-label={piece ? `${s.label}：${piece.label}` : s.label}
              onPointerDown={(e) => {
                if (!firstFinger(e.nativeEvent)) return
                onTouch?.()
                if (!live || piece || fill !== 'choose' || !picked) return
                fly(picked, s.id, 'tap')
              }}
            >
              {piece ? <span className="place-in">{piece.node}</span> : s.node && <span className="place-ghost">{s.node}</span>}
            </button>
          )
        })}
      </div>
      <div className="place-tray" role="group" aria-label="可以放的東西">
        {pieces.map((p) => (
          <Piece
            key={p.id}
            piece={p}
            hidden={inSlot.has(p.id)}
            picked={picked === p.id}
            canDrag={canDrag && live}
            onDown={() => onTouch?.()}
            onTap={() => {
              if (!live) return
              if (mustDrag) {
                setPicked(null)
                return nudge(p.id)
              }
              if (fill === 'next') {
                if (empty[0]) fly(p.id, empty[0].id, 'tap')
                return
              }
              setPicked((cur) => (cur === p.id ? null : p.id))
            }}
            onDragMove={(pt) => setOver(slotAt(pt))}
            onDrop={(pt) => {
              setOver(null)
              const slot = slotAt(pt)
              if (slot && live) fly(p.id, slot, 'drag')
              else back(p.id)
            }}
            register={register}
          />
        ))}
      </div>
    </div>
  )

  // ── 片子怎麼動（函式宣告會提前，render 之後的事件才會呼叫）──────────────

  /** 放手的位置在哪個空格上：空格往外放寬一個間距（吸附，TOUCH-1 的「實際可點範圍比看到的大」），重疊時取中心最近的 */
  function slotAt(pt: { x: number; y: number }): string | null {
    let best: string | null = null
    let bestD = Infinity
    const pad = gapPx()
    for (const s of slots) {
      if (placed[s.id]) continue
      const el = slotEls.current.get(s.id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (pt.x < r.left - pad || pt.x > r.right + pad || pt.y < r.top - pad || pt.y > r.bottom + pad) continue
      const d = Math.hypot(pt.x - (r.left + r.width / 2), pt.y - (r.top + r.height / 2))
      if (d < bestD) {
        bestD = d
        best = s.id
      }
    }
    return best
  }

  function gapPx() {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--touch-gap'))
    return Number.isFinite(v) ? v : 28
  }

  /** 片子飛到空格：放對了就留在那裡（遊戲把它寫進 placed，片子在原位藏起來、空格裡出現），不對就飛回原位 */
  async function fly(id: string, slot: string, how: PlaceHow) {
    const r = refs.current.get(id)
    const el = slotEls.current.get(slot)
    if (!r || !el) return
    setPicked(null)
    setFlying(id)
    const home = r.home()
    const to = el.getBoundingClientRect()
    const dx = to.left + to.width / 2 - (home.left + home.width / 2)
    const dy = to.top + to.height / 2 - (home.top + home.height / 2)
    await Promise.all([run(r.x, dx), run(r.y, dy)])
    const ok = onPlace(id, slot, how)
    // 放對了：片子先停在空格上，等遊戲把它寫進 placed、片子藏起來的那一次畫面才回原位（Piece 的 useLayoutEffect），不會閃回托盤
    if (ok) return setFlying(null)
    await back(id)
  }

  async function back(id: string) {
    const r = refs.current.get(id)
    if (!r) return setFlying(null)
    setFlying(id)
    await Promise.all([run(r.x, 0), run(r.y, 0)])
    setFlying(null)
  }

  /** 大班段要求拖、孩子用點的：片子往第一個空格輕推一小段再回來，示意「拖過去」 */
  async function nudge(id: string) {
    const r = refs.current.get(id)
    const el = empty[0] && slotEls.current.get(empty[0].id)
    if (!r || !el) return
    onNeedDrag?.(id)
    const home = r.home()
    const to = el.getBoundingClientRect()
    const dx = to.left - home.left
    const dy = to.top - home.top
    const len = Math.hypot(dx, dy) || 1
    const step = Math.min(36, len * 0.15)
    setFlying(id)
    await Promise.all([run(r.x, (dx / len) * step), run(r.y, (dy / len) * step)])
    await Promise.all([run(r.x, 0), run(r.y, 0)])
    setFlying(null)
  }

  function run(v: PieceRef['x'], to: number) {
    if (reduced) {
      v.set(to)
      return Promise.resolve()
    }
    return new Promise<void>((res) => {
      animate(v, to, { duration: FLY_S, ease: EASE.out, onComplete: res })
    })
  }
}

interface PieceRef {
  x: ReturnType<typeof useMotionValue<number>>
  y: ReturnType<typeof useMotionValue<number>>
  /** 片子在原位（沒有位移時）的位置 */
  home: () => DOMRect
}

interface PieceProps {
  piece: PlacePiece
  hidden: boolean
  picked: boolean
  canDrag: boolean
  onDown: () => void
  onTap: () => void
  onDragMove: (pt: { x: number; y: number }) => void
  onDrop: (pt: { x: number; y: number }) => void
  register: (id: string, r: PieceRef | null) => void
}

function Piece({ piece, hidden, picked, canDrag, onDown, onTap, onDragMove, onDrop, register }: PieceProps) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const spot = useRef<HTMLSpanElement>(null)
  const press = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    register(piece.id, { x, y, home: () => spot.current!.getBoundingClientRect() })
    return () => register(piece.id, null)
  }, [piece.id, register, x, y])

  // 放進空格（藏起來）的同一次畫面回到原位：之後這個片子再出現（下一題、重來）是在托盤裡
  useLayoutEffect(() => {
    if (!hidden) return
    x.set(0)
    y.set(0)
  }, [hidden, x, y])

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    // 兩根手指、手掌同時壓到：只算第一根（TOUCH-3）
    if (!firstFinger(e.nativeEvent) || hidden) return
    onDown()
    if (!canDrag) {
      // 只能點的年段：按下去就算，跟其他選擇題一樣快（FB-1）
      onTap()
      return
    }
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (!p.dragging && Math.hypot(dx, dy) < DRAG_START_PX) return
    if (!p.dragging) {
      p.dragging = true
      setDragging(true)
    }
    x.set(dx)
    y.set(dy)
    onDragMove({ x: e.clientX, y: e.clientY })
  }

  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    press.current = null
    setDragging(false)
    if (p.dragging) onDrop({ x: e.clientX, y: e.clientY })
    else onTap()
  }

  /** 被系統搶走（例如捲動、來電）：當作拖到一半放開，片子回原位，不算錯 */
  const cancel = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    press.current = null
    setDragging(false)
    if (p.dragging) onDrop({ x: -1e6, y: -1e6 })
  }

  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap()
    }
  }

  return (
    <span ref={spot} className={`place-spot${hidden ? ' empty' : ''}`}>
      <motion.button
        type="button"
        className={`place-piece${picked ? ' picked' : ''}${dragging ? ' dragging' : ''}`}
        aria-label={piece.label}
        aria-pressed={picked}
        aria-hidden={hidden || undefined}
        tabIndex={hidden ? -1 : 0}
        style={{ x, y, visibility: hidden ? 'hidden' : undefined, touchAction: canDrag ? 'none' : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onKeyDown={key}
      >
        <span className="place-in">{piece.node}</span>
      </motion.button>
    </span>
  )
}
