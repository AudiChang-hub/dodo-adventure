import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react'
import { AnimatePresence } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { firstFinger, localPoint, useNotYet } from '../NotYet'
import { useIdle } from '../idle'
import { within } from '../lines'
import { DoneChoices } from '../draw/DoneChoices'
import { CheckButton, ClearButton } from '../draw/Palette'
import { saveDrawing, svgThumb } from '../draw/save'
import { say, sfx } from '../../lib/audio'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { useLive } from '../logic/kit'
import { COLORS, FREE_COLORS, type Brick, type ColorId, type Shape } from './bricks'
import { BrickSet, Plate, U, boxOf } from './BrickArt'
import { BrickPiece } from './Build'
import { FreeArt } from './art'
import { BLOCKS_COPLAY } from './coplay'
import { freeGeo, toPx, type FreeGeo } from './geometry'
import { FREE_COLS, FREE_MAX, FREE_ROWS, covered, dropFree } from './plan'
import '../draw/tools.css'
import './blocks.css'

/** 自由蓋托盤裡的積木（顏色另外選；輪子一律黑色） */
export const FREE_SHAPES: { shape: Shape; w: number }[] = [
  { shape: 'brick', w: 1 },
  { shape: 'brick', w: 2 },
  { shape: 'brick', w: 3 },
  { shape: 'brick', w: 4 },
  { shape: 'slopeR', w: 2 },
  { shape: 'slopeL', w: 2 },
  { shape: 'round', w: 1 },
  { shape: 'wheel', w: 1 },
  { shape: 'eyeL', w: 1 },
]
const DRAG_PX = 14

/**
 * 自由蓋（T-162）：沒有對錯、不評分。右邊選顏色、拖一種積木到底板上，放手就從上面掉下來疊在最高的那一塊上面。
 * 點一種積木（拿起來）再點底板也能放（TOUCH-2）。放好的積木：上面沒壓著東西的可以拖走（拖出底板就收回去）。
 * 蓋好按綠勾勾：存成作品（家長區的作品集看得到，跟畫畫的作品存在一起），停在「再蓋一個／回首頁」。
 */
export function FreeBuild({ onExit }: { onExit: () => void }) {
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  return (
    <Shell station="logic" mood="idle" onExit={onExit} hideHost hintText={resting ? BLOCKS_COPLAY.freeNow : BLOCKS_COPLAY.free}>
      <FreeView
        key={n}
        resting={resting}
        onDone={() => setResting(true)}
        onAgain={() => {
          if (bedtimeIfDue()) return
          setResting(false)
          setN((k) => k + 1)
        }}
      />
    </Shell>
  )
}

/** 存作品用的圖：整塊底板＋積木 */
function FreePic({ bricks, svgRef }: { bricks: readonly Brick[]; svgRef?: Ref<SVGSVGElement> }) {
  const b = boxOf([...bricks, { x: 0, z: -0.32, y: 0, w: FREE_COLS, d: 1, color: 'G', shape: 'brick' }, { x: 0, z: 3, y: 0, w: 1, d: 1, color: 'G', shape: 'brick' }], 'flat', 0.3)
  return (
    <svg ref={svgRef} viewBox={`${b.x} ${b.y} ${b.w} ${b.h + 16}`} width={b.w} height={b.h + 16} aria-hidden="true">
      <Plate cols={FREE_COLS} v="flat" />
      <BrickSet bricks={bricks} v="flat" />
    </svg>
  )
}

function FreeView({ resting, onDone, onAgain }: { resting: boolean; onDone: () => void; onAgain: () => void }) {
  const live = useLive()
  const idle = useIdle()
  const notYet = useNotYet()
  const area = useRef<HTMLDivElement | null>(null)
  const thumbSvg = useRef<SVGSVGElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const geo = freeGeo(size.w, size.h, FREE_COLS, FREE_ROWS, FREE_COLORS.length, FREE_SHAPES.length)
  const geoRef = useRef<FreeGeo | null>(geo)
  geoRef.current = geo

  const [bricks, setBricks] = useState<Brick[]>([])
  const bricksRef = useRef<Brick[]>([])
  const [color, setColor] = useState<ColorId>('R')
  const [lifted, setLifted] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ b: Brick; x: number; y: number } | null>(null)
  const [hand, setHand] = useState<{ x: number; y: number; tap: number; beckon?: boolean } | null>(null)
  const [done, setDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const ended = useRef(false)
  const dragRef = useRef<{ pid: number; b: Brick; from: number | null; sx: number; sy: number; moved: boolean } | null>(null)

  const put = (list: Brick[]) => {
    bricksRef.current = list
    setBricks(list)
  }
  const pieceOf = (k: number): Brick => {
    const s = FREE_SHAPES[k]
    return { x: 0, z: 0, y: 0, w: s.w, d: 1, shape: s.shape, color: s.shape === 'wheel' ? 'D' : color }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void say('bk.free.intro').then(() => {
        if (!live.current || ended.current) return
        idle.start({
          repeat: () => void say('bk.free.intro'),
          hint: () => {
            // 發呆：手在一塊積木上點一下（不說話）
            const g = geoRef.current
            if (!g || ended.current) return
            const c = g.shapes[1]
            setHand({ x: (c.x / g.w) * 100, y: (c.y / g.h) * 100, tap: Date.now(), beckon: true })
          },
        })
      })
    }, 0)
    return () => {
      clearTimeout(t)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const at = (e: { clientX: number; clientY: number }) => (area.current ? localPoint(area.current, e.clientX, e.clientY) : { x: 0, y: 0 })
  const onBoard = (p: { x: number; y: number }) => {
    const g = geoRef.current
    return !!g && p.x >= g.board.x && p.x <= g.board.x + g.board.w && p.y >= g.board.y - 20 && p.y <= g.gy + g.u
  }

  /** 放手：p 是積木正面的中心。在底板上：掉下去疊好；不在：收回去 */
  const drop = (b: Brick, p: { x: number; y: number }) => {
    const g = geoRef.current
    setDrag(null)
    setHand(null)
    if (!g || !onBoard(p)) return false
    if (bricksRef.current.length >= FREE_MAX) {
      notYet.ping(p.x, p.y)
      return false
    }
    const x = Math.round((p.x - g.ox) / g.u - b.w / 2)
    const nb = dropFree(bricksRef.current, b, x)
    if (!nb) {
      notYet.ping(p.x, p.y)
      return false
    }
    put([...bricksRef.current, nb])
    sfx.pop()
    return true
  }

  // ── 托盤的積木 ──
  const downShape = (e: ReactPointerEvent<HTMLDivElement>, k: number) => {
    e.stopPropagation()
    if (!firstFinger(e.nativeEvent) || ended.current) return
    idle.poke()
    setHand(null)
    dragRef.current = { pid: e.pointerId, b: pieceOf(k), from: null, sx: e.clientX, sy: e.clientY, moved: false }
    ;(dragRef.current as { k?: number }).k = k
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 有些瀏覽器拿不到 */
    }
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pid !== e.pointerId) return
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_PX) return
    d.moved = true
    idle.poke()
    const p = at(e)
    setDrag({ b: d.b, x: p.x, y: p.y })
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pid !== e.pointerId) return
    dragRef.current = null
    if (!d.moved) {
      if (d.from != null) {
        // 點一下放好的積木：放回原位（沒有動）
        put([...bricksRef.current, d.b])
        setDrag(null)
        return
      }
      sfx.tap()
      const k = (d as { k?: number }).k ?? null
      setLifted((l) => (l === k ? null : k))
      return
    }
    const ok = drop(d.b, at(e))
    if (!ok && d.from != null && !onBoard(at(e))) sfx.whoosh()
  }
  const cancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pid !== e.pointerId) return
    dragRef.current = null
    if (d.from != null) put([...bricksRef.current, d.b])
    setDrag(null)
  }

  // ── 底板：拿著一種積木時點一下就放；按住上面沒壓著東西的積木可以拖走 ──
  const downBoard = (e: ReactPointerEvent<HTMLDivElement>) => {
    idle.poke()
    if (resting) setPoke((k) => k + 1)
    if (!firstFinger(e.nativeEvent) || ended.current) return
    setHand(null)
    const g = geoRef.current
    if (!g) return
    const p = at(e)
    if (!onBoard(p)) return
    // 點到哪一塊（最上面那層的先）
    const list = bricksRef.current
    const hit = [...list]
      .map((b, i) => ({ b, i }))
      .sort((a, b) => b.b.z - a.b.z)
      .find(({ b }) => {
        const q = toPx(g, false, b.x, b.z, 0)
        return p.x >= q.x && p.x <= q.x + b.w * g.u && p.y <= q.y && p.y >= q.y - g.u
      })
    if (hit) {
      if (covered(list, hit.b)) return notYet.ping(p.x, p.y)
      // 拿起來：先從底板拿掉（拖的時候畫在手指下面）
      put(list.filter((_, i) => i !== hit.i))
      dragRef.current = { pid: e.pointerId, b: hit.b, from: hit.i, sx: e.clientX, sy: e.clientY, moved: false }
      setDrag({ b: hit.b, ...(() => toPx(g, false, hit.b.x + hit.b.w / 2, hit.b.z + 0.5, 0))() })
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* 有些瀏覽器拿不到 */
      }
      return
    }
    if (lifted != null) {
      drop(pieceOf(lifted), p)
      return
    }
  }

  const finish = async () => {
    if (ended.current) return
    const g = geoRef.current
    if (!bricksRef.current.length) {
      void say('bk.free.empty')
      if (g) setHand({ x: (g.shapes[1].x / g.w) * 100, y: (g.shapes[1].y / g.h) * 100, tap: Date.now() })
      return
    }
    ended.current = true
    idle.stop()
    setHand(null)
    setLifted(null)
    setDone(true)
    sfx.done()
    const list = bricksRef.current
    await within(
      Promise.resolve().then(async () => {
        const svg = thumbSvg.current
        if (svg) await saveDrawing('blocks-free', '積木作品', await svgThumb(svg, 480), list.map(({ x, z, w, color, shape }) => ({ x, z, w, color, shape })))
      }),
      3000,
      undefined,
    )
    if (!live.current) return
    await say('bk.free.done')
    if (!live.current || bedtimeIfDue()) return
    onDone()
  }

  const g = geo
  const handSize = g ? `${Math.round(Math.min(110, Math.max(70, g.h * 0.13)))}px` : '90px'
  return (
    <div className={`bk bk-free${done ? ' is-done' : ''}${resting ? ' is-resting' : ''}`} data-logic-game="blocks-free" data-bricks={bricks.length} data-done={done ? '1' : undefined}>
      <div className="bk-play" ref={area} onPointerDown={downBoard} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
        {g && (
          <>
            <svg className="bk-board" width={g.w} height={g.h} viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden="true">
              <g transform={`translate(${g.ox} ${g.gy}) scale(${g.u / U})`}>
                <Plate cols={FREE_COLS} v="flat" />
                <BrickSet bricks={bricks} v="flat" />
              </g>
            </svg>
            {!done && (
              <>
                {FREE_COLORS.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    className={`bk-swatch${color === c ? ' is-on' : ''}`}
                    data-color={c}
                    aria-label={`${COLORS[c].zh}色`}
                    style={{ left: g.colors[i].x - g.colors[i].w / 2, top: g.colors[i].y - g.colors[i].h / 2, width: g.colors[i].w, height: g.colors[i].h }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      if (!firstFinger(e.nativeEvent)) return
                      idle.poke()
                      sfx.tap()
                      setColor(c)
                    }}
                  >
                    <span style={{ background: COLORS[c].hex }} />
                  </button>
                ))}
                {FREE_SHAPES.map((s, k) => {
                  const c = g.shapes[k]
                  const b = pieceOf(k)
                  const ut = Math.min(g.u * 0.8, (c.w - 24) / 4)
                  return (
                    <div
                      key={k}
                      className={`bk-cell bk-shape${lifted === k ? ' is-lifted' : ''}`}
                      data-shape={`${s.shape}-${s.w}`}
                      role="button"
                      aria-label={`積木 ${s.shape} ${s.w}`}
                      style={{ left: c.x - c.w / 2, top: c.y - c.h / 2, width: c.w, height: c.h }}
                      onPointerDown={(e) => downShape(e, k)}
                    >
                      <div className="bk-piece" style={{ transform: `translate(${c.w / 2}px, ${c.h / 2 + 0.11 * ut}px) scale(${ut / g.u})` }}>
                        <BrickPiece b={b} v="flat" unit={g.u} />
                      </div>
                    </div>
                  )
                })}
                <div className="bk-btn" style={{ left: g.check.x - g.check.w / 2, top: g.check.y - g.check.h / 2, width: g.check.w, height: g.check.h }} onPointerDown={(e) => e.stopPropagation()}>
                  <CheckButton onPress={() => void finish()} guard={() => !!dragRef.current} />
                </div>
                <div className="bk-btn" style={{ left: g.clear.x - g.clear.w / 2, top: g.clear.y - g.clear.h / 2, width: g.clear.w, height: g.clear.h }} onPointerDown={(e) => e.stopPropagation()}>
                  <ClearButton
                    onClear={() => {
                      idle.poke()
                      put([])
                    }}
                  />
                </div>
              </>
            )}
            {drag && (
              <div className="bk-piece is-drag" style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}>
                <BrickPiece b={drag.b} v="flat" unit={g.u} />
              </div>
            )}
          </>
        )}
        <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} beckon={hand.beckon} size={handSize} cuff="#F1D27C" />}</AnimatePresence>
        {notYet.view}
        <div className="bk-thumb" aria-hidden="true">
          <FreePic bricks={bricks} svgRef={thumbSvg} />
        </div>
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<FreeArt />} againLabel="再蓋一個" line="bk.free.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
