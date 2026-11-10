import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Dino } from '../../art/Dino'
import { firstFinger } from '../../games/NotYet'
import { Sparkles } from '../../ui/Sparkles'
import { turnStyle, type OptView } from './QuizParts'

/** 手指移動不到這麼多（px）就放開：當作點一下（三歲大多是用點的，點一下也是餵） */
const TAP_PX = 14

/**
 * 選擇題的玩法三：餵豆豆（T-127 B 案，docs/T-127-新鮮感提案.md 第四節 (a)）。
 * 字母卡排在左邊，右邊站著一隻大大的豆豆，嘴巴張開；把今天的字母卡拖給豆豆吃。
 * - 跟找卡片一樣的題目、對錯、示範的手、答錯的說明、作答紀錄（Quiz.tsx 管），只換外觀和操作。
 * - 拖到豆豆身上任何地方放開都算餵（三歲手指不準）；只點一下也算餵（卡片自己飛進嘴巴）。
 * - 拖到一半、在別的地方放開：卡片回到原位，不算答、不扣分。
 * - 餵對：卡片飛進嘴巴、豆豆吃掉。聽完才答、一次就對的，豆豆跳起來、撒星星（T-109 的完整慶祝）；其他的只有安靜地吃掉。
 * - 餵錯：豆豆輕輕搖頭，卡片回到原位、淡掉（不打叉，T-109）；之後照找卡片一樣，手指著答案、答案跳（T-116）。
 * - 示範（Watch me）：手按住答案卡、帶著它走到豆豆嘴巴，豆豆吃一口，卡片再回到原位（選項不換位置，T-100）。
 * - 多指：只理第一根手指；拖著的時候別的手指不會再拿起別張。
 */
export function Feed({ v, carry, onMouth }: { v: OptView; carry: string | null; onMouth: (el: HTMLElement | null) => void }) {
  const { q, i, still } = v
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)
  /** 卡片要飛到嘴巴的位移（carry 那一張） */
  const [fly, setFly] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const dodo = useRef<HTMLDivElement | null>(null)
  const mouth = useRef<HTMLDivElement | null>(null)
  const grip = useRef<{ id: string; pid: number; x: number; y: number; moved: boolean } | null>(null)
  /** 餵錯幾次（豆豆搖頭用） */
  const nos = Object.values(v.state).filter((x) => x === 'no').length
  const cheer = q.options.some((o) => v.cheer(o))

  // 要吃的那一張：算出它的家到嘴巴的距離，飛過去（示範、餵對）；carry 清掉就回家
  useLayoutEffect(() => {
    if (!carry) return setFly(null)
    const el = els.current.get(carry)
    const m = mouth.current
    if (!el || !m) return
    const r = el.getBoundingClientRect()
    const t = m.getBoundingClientRect()
    const d = drag?.id === carry ? drag : { dx: 0, dy: 0 }
    setFly({ id: carry, dx: t.left + t.width / 2 - (r.left + r.width / 2 - d.dx), dy: t.top + t.height / 2 - (r.top + r.height / 2 - d.dy) })
    setDrag(null)
    grip.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carry])

  const overDodo = (x: number, y: number) => {
    const r = dodo.current?.getBoundingClientRect()
    return !!r && x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12
  }

  const down = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (!firstFinger(e.nativeEvent) || grip.current || fly) return
    // 擋板時間（剛出來、答完之後）：不能拿，Quiz 出「看這裡」的圈圈；示範、念題目的時候拿起來就搶掉
    if (!v.grab(e)) return
    grip.current = { id, pid: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 合成的事件沒有真的指標 */
    }
  }
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = grip.current
    if (!g || g.pid !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.moved && Math.hypot(dx, dy) < TAP_PX) return
    g.moved = true
    setDrag({ id: g.id, dx, dy })
  }
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = grip.current
    if (!g || g.pid !== e.pointerId) return
    grip.current = null
    const o = q.options.find((x) => x.id === g.id)
    // 點一下、或拖到豆豆身上放開：餵這一張（對錯由 Quiz 判）；拖到別的地方放開：回到原位，不算
    if (o && (!g.moved || overDodo(e.clientX, e.clientY))) v.choose(o, e)
    setDrag(null)
  }
  const cancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (grip.current?.pid !== e.pointerId) return
    grip.current = null
    setDrag(null)
  }

  return (
    <>
      <AnimatePresence initial={false}>
        <motion.div
          key={i}
          className={`en-options en-feed ${v.boxClass}`}
          data-accepting={v.accept ? undefined : 'false'}
          initial={{ opacity: 0, x: still ? 0 : -60 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.1 } }}
        >
          {q.options.map((o, k) => {
            const f = fly?.id === o.id ? fly : null
            const d = drag?.id === o.id ? drag : null
            return (
              <motion.button
                key={o.id}
                ref={(el: HTMLButtonElement | null) => {
                  if (el) els.current.set(o.id, el)
                  v.tile(o.id)(el)
                }}
                type="button"
                className={`${v.optClass(o, k)} en-food${d ? ' is-drag' : ''}${f ? ' is-eaten' : ''}`}
                style={turnStyle(k)}
                aria-label={o.text ?? o.id}
                // 不動 opacity（淡入、點錯淡掉、吃掉之後不見都交給 CSS：.is-wait、.is-no、.is-eaten）
                animate={f ? { x: f.dx, y: f.dy, scale: 0.3 } : d ? { x: d.dx, y: d.dy, scale: 1.06 } : { x: 0, y: 0, scale: 1 }}
                transition={f ? { duration: still ? 0 : 0.55, ease: [0.45, 0, 0.25, 1] } : d ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                onPointerDown={(e) => down(e, o.id)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={cancel}
                onLostPointerCapture={cancel}
                onClick={(e) => {
                  if (e.detail === 0) v.choose(o)
                }}
              >
                {v.face(o, k)}
              </motion.button>
            )
          })}
        </motion.div>
      </AnimatePresence>
      {/* 豆豆：站在今天的世界裡，嘴巴那一圈是餵食的地方（拖到豆豆身上任何地方都算） */}
      <div className="en-feed-dodo" ref={dodo} aria-hidden="true">
        <motion.div
          key={`no${nos}`}
          animate={nos && !still ? { rotate: [0, -6, 6, -4, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ transformOrigin: '50% 90%' }}
        >
          <Dino who="dodo" flip mood={cheer ? 'cheer' : carry ? 'happy' : 'idle'} size="100%" />
        </motion.div>
        <div
          className={`en-feed-mouth${carry ? ' is-eat' : ''}`}
          ref={(el) => {
            mouth.current = el
            onMouth(el)
          }}
        />
        {cheer && <Sparkles count={14} />}
      </div>
    </>
  )
}
