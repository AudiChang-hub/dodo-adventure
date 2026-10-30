import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref, type RefObject } from 'react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { ARM_MS, PAGE_ARM_MAX_MS, PAGE_ARM_MS, PAGE_ARM_QUIET_MS, PAGE_REVEAL_MS, PAGE_SETTLED_MS, background, foreground, page, swap, type PageCustom } from './motion'
import { noteEntering } from '../lib/nav'
import { shownFor, type Shown } from '../lib/shown'
import './scenes.css'

/** 新畫面蓋好、舊的卸載之後再多等一下才往回：中間至少有一幀只剩新畫面（完全不透明），往回淡出是另一段 */
const ENTER_MARGIN_MS = 120

/*
 * 全站轉場的元件（規格在 ui/motion.ts）：
 * - Scenes：整頁切換（App 的畫面、今日冒險的每一段）。新舊兩層疊著交叉淡化，新的蓋好了才卸載舊的，不會露出底色。
 * - CardStage：遊戲裡「教學卡 ↔ 題目」的前景／背景（教學卡淡入、題目在後面淡掉）。
 * - Swap：原地換內容（換題、換一回合）：新的蓋在上面淡入，舊的等一下才淡掉。
 */

// ── 畫面自己的進場動畫 ─────────────────────────────────────────

/**
 * 畫面裡的東西要不要做自己的進場動畫（站牌一個個彈出來、車子開進來…）。
 * 只有 App 一打開的第一個畫面要；之後換畫面時整頁已經在做一段轉場，裡面的東西再各自彈一次就變成兩段，
 * 紙感螢幕上看起來是閃，所以直接出現在定位。
 */
const IntroContext = createContext(true)
export const useIntro = () => useContext(IntroContext)

// ── 整頁切換 ────────────────────────────────────────────────

type Role = 'still' | 'enter' | 'behind' | 'leave' | 'under'

interface Layer {
  id: string
  role: Role
  /** 疊的先後（越大越上面）。畫面上用的 z-index 是排好之後的名次（1、2、3），不會一直往上加 */
  z: number
  /** 這一層是轉場進來的（不是 App 一打開的第一個畫面）：裡面的東西不再自己做進場動畫 */
  quiet: boolean
}

export interface SceneMove {
  /** 往回：上面的畫面淡出，露出下面的 */
  back: boolean
}

// ── 新畫面剛換上來：哪幾下點擊不算數 ─────────────────────────────
//
// 在地圖連點站牌，站點畫面出現後，後面幾下不能點進同一個位置的遊戲卡（B07、T-67）。
// 以前是從換畫面那一刻起算的計時器，到了就開始收點擊。平板忙的時候（換畫面後主執行緒卡住一兩秒）兩頭都錯：
// - 計時器先跑，排隊還沒處理的連點之後才送進來，被當成新的一下；
// - 卡住的期間新畫面根本還沒畫出來，計時器卻已經走完，畫面一出現馬上按下去的也算數。
// 現在每一下按下去都用它自己的時間（e.timeStamp：手指碰到螢幕的時間，不是主執行緒有空處理它的時間），
// 跟新畫面「孩子真的看得到」的時間比（lib/shown.ts：一格一格算，卡住的那一段不算；卡住時轉場的淡入也停在半透明）。
// - 新畫面順順地出現了 PAGE_ARM_MS 之前按下去的不算（轉場還沒走完）；換畫面之前就按著的手指放開也不算。
// - 換畫面的那一下如果是孩子點的，同一處的連點一直不算，直到那裡停了 PAGE_ARM_QUIET_MS 再按（最多 PAGE_ARM_MAX_MS）。
// - 點別的地方、返回鍵（孩子一進來就想回去）照常。
// 不算的那一下：按下、放開、click 都在最外層攔掉，畫面裡的東西完全收不到（按鈕也不會縮一下）。

interface Down {
  /** 手指碰到螢幕的時間（e.timeStamp） */
  t: number
  x: number
  y: number
  /** 處理到它的時間：換畫面時用來找「是哪一下點的」 */
  seen: number
  blocked: boolean
}

/** 剛換上來、還在挑點擊的畫面（每一疊 Scenes 一個） */
interface Gate {
  el: HTMLElement | null
  /** 新畫面畫出來的第一格；順順地出現了 PAGE_ARM_MS 的那一格（at）之後按下去的才算 */
  shown: Shown
  /** 換畫面的那一下（自己往下走的換畫面沒有） */
  origin: Down | null
  /** 同一處連點最後一下的時間 */
  last: number
}

const gates = new Set<Gate>()
/** 每一根手指按下去時的判斷（pointerId → 那一下） */
const downs = new Map<number, Down>()
let lastDown: Down | null = null
/** 離換畫面的那一下多近算「還在同一處連點」 */
const SAME_SPOT_PX = 140

/** 這一下按在 gate 的畫面裡，要不要攔掉 */
function blocks(g: Gate, d: Down) {
  if (d.t < g.shown.at) return true
  const o = g.origin
  if (!o || Math.hypot(d.x - o.x, d.y - o.y) > SAME_SPOT_PX) return false
  // 還在換畫面的那一處連點：隔不到 PAGE_ARM_QUIET_MS 又按下去
  if (d.t - g.last < PAGE_ARM_QUIET_MS && d.t < g.shown.first + PAGE_ARM_MAX_MS) return true
  // 停下來了，這一下是新的；之後同一處的點擊都照常
  g.origin = null
  return false
}

/** 這個元素在哪幾個還在挑點擊的畫面裡（冒險裡的一段也在 App 的冒險畫面裡）；返回鍵不算 */
function gatesOf(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest('[data-back]')) return []
  return [...gates].filter((g) => g.el?.contains(target))
}

if (typeof window !== 'undefined') {
  const stop = (e: Event) => {
    e.stopPropagation()
    if (e.cancelable) e.preventDefault()
  }
  window.addEventListener(
    'pointerdown',
    (e) => {
      const d: Down = { t: e.timeStamp, x: e.clientX, y: e.clientY, seen: performance.now(), blocked: false }
      for (const g of gatesOf(e.target)) if (blocks(g, d)) d.blocked = true
      // 換畫面那一處的連點：落在哪裡都算（例如落在返回鍵上），記下最後一下的時間
      for (const o of gates) if (o.origin && Math.hypot(d.x - o.origin.x, d.y - o.origin.y) <= SAME_SPOT_PX && d.t > o.last) o.last = d.t
      downs.set(e.pointerId, d)
      if (downs.size > 32) downs.delete(downs.keys().next().value!)
      lastDown = d
      if (d.blocked) stop(e)
    },
    { capture: true },
  )
  // 放開、click：按下去那一下不算的就不算；換畫面之前就按著的手指，在新畫面放開也不算
  const follow = (e: Event) => {
    // 鍵盤（Enter／空白鍵）、程式自己按的 click 不是手指，不管
    if (!e.isTrusted || (e.type === 'click' && (e as MouseEvent).detail === 0)) return
    const gs = gatesOf(e.target)
    if (!gs.length) return
    const d = downs.get((e as PointerEvent).pointerId) ?? lastDown
    if (!d || d.blocked || gs.some((g) => d.t < g.shown.first)) stop(e)
  }
  for (const type of ['pointerup', 'click']) window.addEventListener(type, follow, { capture: true })
}

const INITIAL: Record<Role, string | false> = { still: false, enter: 'initial', behind: false, leave: false, under: 'under' }
const ANIMATE: Record<Role, string> = { still: 'shown', enter: 'enter', behind: 'behind', leave: 'leave', under: 'shown' }

/**
 * 一疊整頁畫面：id 換了就做一段轉場。move 在 id 換掉的那一次 render 讀（方向）。
 * 舊畫面留在畫面上直到新畫面蓋好（往前）或自己淡出（往回），期間不收點擊（inert）。
 * 舊畫面保留的是它最後一次的 children，所以它不會讀到新的路由、不會換成新畫面的內容。
 * 整頁不從點的那張卡長出來、也不收回去（紙感螢幕上看起來像子母畫面），一律在原地交叉淡化。
 *
 * 疊放順序只用 1～3（同時最多三層）：換過幾百次畫面，字幕（60）、護眼休息（120）、家長角落（150）還是在最上面（NAV-7）。
 */
export function Scenes({ id, move, children, className = 'scene' }: { id: string; move: () => SceneMove; children: ReactNode; className?: string }) {
  const snaps = useRef(new Map<string, ReactNode>())
  const seq = useRef(1)
  const [shown, setShown] = useState(id)
  const [layers, setLayers] = useState<Layer[]>(() => [{ id, role: 'still', z: 1, quiet: false }])
  /** 這一次換畫面是哪一下點的（App 一打開的第一個畫面不是換畫面，是 null） */
  const entered = useRef<{ origin: Down | null } | null>(null)
  const liveEl = useRef<HTMLElement | null>(null)

  // id 換了：在這次 render 裡就把新的一層排好（React 的「render 中依前一個狀態調整」寫法）
  if (shown !== id) {
    const m = move()
    const from = shown
    setShown(id)
    setLayers((prev) => {
      const old = prev.find((l) => l.id === from)
      const reuse = prev.find((l) => l.id === id)
      const rest = prev.filter((l) => l.id !== id && l.id !== from)
      if (m.back) {
        const under: Layer = reuse ? { ...reuse, role: 'under', z: ++seq.current } : { id, role: 'under', z: ++seq.current, quiet: true }
        const top: Layer[] = old ? [{ ...old, role: 'leave', z: ++seq.current }] : []
        return [...rest, under, ...top]
      }
      const behind: Layer[] = old ? [{ ...old, role: 'behind' }] : []
      const enter: Layer = reuse ? { ...reuse, role: 'enter', z: ++seq.current } : { id, role: 'enter', z: ++seq.current, quiet: true }
      return [...rest, ...behind, enter]
    })
    // 新畫面淡入中：這時候按返回，等它蓋好了才往回（lib/nav.ts 的 afterEntering）
    if (!m.back) noteEntering(PAGE_SETTLED_MS + ENTER_MARGIN_MS)
    // 換畫面的那一下：剛處理過的那一下按下去（click 之後馬上就換畫面；自己往下走的換畫面沒有）
    const now = performance.now()
    entered.current = { origin: lastDown && now - lastDown.seen < 1000 ? lastDown : null }
  }
  snaps.current.set(id, children)

  // 轉場結束：只留下現在的畫面
  useEffect(() => {
    const cur = layers.find((l) => l.id === id)
    if (!cur || layers.length === 1) return
    const t = window.setTimeout(
      () => {
        setLayers((ls) => ls.filter((l) => l.id === id).map((l) => ({ ...l, role: 'still', z: 1 })))
        seq.current = 1
        for (const k of [...snaps.current.keys()]) if (k !== id) snaps.current.delete(k)
      },
      cur.role === 'under' ? PAGE_REVEAL_MS : PAGE_SETTLED_MS,
    )
    return () => clearTimeout(t)
  }, [id, layers])

  // 透明的一層（冒險的每一段）下面擋不住，舊的要跟著淡掉（ui/motion.ts 的 page）
  const clear = className.split(' ').includes('is-clear')
  const reduced = !!useReducedMotion()

  // 新畫面剛換上來的這一段，哪幾下點擊不算數（見最上面的 Gate）：用每一下自己的時間判斷，不靠計時器
  useLayoutEffect(() => {
    const e = entered.current
    if (!e) return
    const g: Gate = { el: liveEl.current, shown: shownFor(PAGE_ARM_MS), origin: e.origin, last: e.origin?.t ?? -Infinity }
    gates.add(g)
    const t = window.setTimeout(() => gates.delete(g), PAGE_ARM_MAX_MS + 2000)
    return () => {
      g.shown.cancel()
      clearTimeout(t)
      gates.delete(g)
    }
  }, [id])

  return (
    <>
      {[...layers]
        .sort((a, b) => a.z - b.z)
        .map((l, rank) => {
          const live = l.id === id
          return (
            <motion.div
              key={l.id}
              className={className}
              data-scene={l.id}
              data-role={l.role}
              ref={live ? (n: HTMLDivElement | null) => void (liveEl.current = n) : undefined}
              style={{ zIndex: rank + 1, pointerEvents: live ? undefined : 'none' }}
              inert={!live}
              custom={{ clear, reduced } satisfies PageCustom}
              variants={page}
              initial={INITIAL[l.role]}
              animate={ANIMATE[l.role]}
            >
              <IntroContext.Provider value={!l.quiet}>{live ? children : snaps.current.get(l.id)}</IntroContext.Provider>
            </motion.div>
          )
        })}
    </>
  )
}

// ── 教學卡 ↔ 題目 ────────────────────────────────────────────

/**
 * 遊戲裡的教學卡（前景）和題目（背景）：和程式車庫開車同一段轉場（ui/motion.ts 的 foreground／background）。
 * - 卡片在原地淡入（只帶 2% 的推近），題目在卡片後面原地淡掉；卡片淡出時題目淡回來。不從恐龍長出來、不收回恐龍。
 * - 卡片蓋著的時候換題目（children 換成下一題）不做動畫：卡片收回去時直接看到新的題目，不會先閃回上一題。
 * card 要帶自己的 key（每一張教學卡一個），教學卡元件要用 camera 模式（自己不另外淡入淡出）。
 */
export function CardStage({ card, children }: { card: ReactNode; children: ReactNode }) {
  const up = !!card
  const reduced = !!useReducedMotion()
  // 上一次畫面上卡片是不是蓋著：卡片收起來和換題常常在同一次 render，這一次換上的題目也算「看不到的時候換的」
  const wasUp = useRef(up)
  useEffect(() => {
    wasUp.current = up
  })
  return (
    <>
      <motion.div
        className="card-bg"
        style={{ pointerEvents: up ? 'none' : undefined }}
        variants={background}
        initial="initial"
        animate={up ? 'hidden' : 'shown'}
      >
        <CardUp.Provider value={up || wasUp.current}>{children}</CardUp.Provider>
      </motion.div>
      <AnimatePresence custom={reduced}>
        {card && (
          <motion.div key={(card as { key?: string }).key ?? 'card'} className="card-fg" custom={reduced} variants={foreground} initial="initial" animate="enter" exit="exit">
            {card}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** 題目是不是被教學卡蓋著（蓋著的時候換題不做動畫） */
const CardUp = createContext(false)

// ── 原地換內容 ──────────────────────────────────────────────

function SwapLayer({ children, className, style, divRef, arm }: { children: ReactNode; className?: string; style?: CSSProperties; divRef?: Ref<HTMLDivElement>; arm: boolean }) {
  const present = useIsPresent()
  // 剛換上來的這一下子不收點擊：孩子連點上一題的手，不會直接點到新題目
  const [armed, setArmed] = useState(!arm)
  useEffect(() => {
    if (armed) return
    const t = window.setTimeout(() => setArmed(true), ARM_MS)
    return () => clearTimeout(t)
  }, [armed])
  const still = useContext(SwapStill)
  return (
    <motion.div
      ref={divRef}
      className={className}
      style={{ ...(className ? null : FILL), ...style, pointerEvents: present && (armed || still) ? style?.pointerEvents : 'none' }}
      custom={still}
      variants={swap}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.div>
  )
}
const SwapStill = createContext(false)
/** 沒有自己的 className（CSS 決定位置）時，兩塊內容疊在同一個位置：蓋滿外層 */
const FILL: CSSProperties = { position: 'absolute', inset: 0 }

/**
 * 這一塊內容是不是「看不到的時候直接換上」的（被教學卡蓋著時換的題目）：
 * 是的話，裡面的東西不用再自己彈進來，卡片收起來時就已經在定位。
 */
export const useSwapQuiet = () => useContext(SwapStill)

/**
 * 原地換內容：id 換了，新的疊在上面淡入、舊的等一下才淡掉（ui/motion.ts 的 swap）。
 * 在 CardStage 裡、被教學卡蓋著的時候換，就直接換（看不到，不用動畫）；still 也可以自己指定。
 * children 可以是函式：拿到 quiet（這一塊是不是直接換上的），裡面的東西就知道要不要自己彈進來。
 * divRef 用 callback ref 比較安全：舊的那層卸載時不會把它清成 null。
 */
export function Swap({
  id,
  children,
  className,
  style,
  still,
  divRef,
  arm = true,
}: {
  id: string | number
  children: ReactNode | ((quiet: boolean) => ReactNode)
  className?: string
  style?: CSSProperties
  still?: boolean
  divRef?: Ref<HTMLDivElement>
  /** 新的一塊換上來後先擋一下點擊（預設要）；一題接一題、唸題目時就要能點的快速練習不擋 */
  arm?: boolean
}) {
  // 換的那一刻是不是看不到（被教學卡蓋著，或卡片就在這一次收起來）
  const covered = useContext(CardUp)
  // 每一塊內容在換上來的那一刻就決定好，之後不再變
  const mine = useRef<{ id: string | number; quiet: boolean } | null>(null)
  if (!mine.current || mine.current.id !== id) mine.current = { id, quiet: still ?? covered }
  const quiet = mine.current.quiet
  return (
    <AnimatePresence custom={quiet}>
      <SwapStill.Provider key={id} value={quiet}>
        <SwapLayer className={className} style={style} divRef={divRef} arm={arm}>
          {typeof children === 'function' ? children(quiet) : children}
        </SwapLayer>
      </SwapStill.Provider>
    </AnimatePresence>
  )
}

/**
 * 放在 Swap 裡的 ref：新的一塊掛上來時更新，舊的一塊淡出完卸載時不清掉
 * （物件 ref 會在舊的卸載時被 React 設成 null，換題之後就拿不到新的那一塊）。
 */
export function useSwapRef<T>(r: RefObject<T | null>) {
  return useCallback(
    (v: T | null) => {
      if (v) r.current = v
    },
    [r],
  )
}
