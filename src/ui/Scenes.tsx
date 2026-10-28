import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref, type RefObject } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { ARM_MS, PAGE_REVEAL_MS, PAGE_SETTLED_MS, background, foreground, page, swap, type PageCustom } from './motion'
import './scenes.css'

/*
 * 全站轉場的元件（規格在 ui/motion.ts）：
 * - Scenes：整頁切換（App 的畫面、今日冒險的每一段）。新舊兩層疊著，新的蓋好了才卸載舊的，不會露出底色。
 * - CardStage：遊戲裡「教學卡 ↔ 題目」的前景／背景（教學卡從主持的恐龍長出來、收回恐龍）。
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
  z: number
  origin: string
  anchored: boolean
  /** 這一層是轉場進來的（不是 App 一打開的第一個畫面）：裡面的東西不再自己做進場動畫 */
  quiet: boolean
}

export interface SceneMove {
  /** 往回：上面的畫面收回去，下面的拉遠回來 */
  back: boolean
  /** 往前時的錨點（視窗座標）：孩子點的那張卡、那個按鈕。往回時不用給：回到「當初從哪裡長出來」的那個畫面，就收回同一個錨點 */
  anchor: { x: number; y: number } | null
  /** 往回到別的畫面也收回當初長出來的錨點（今日冒險：遊戲玩完收回旁白卡的位置，下面是蛋） */
  collapse?: boolean
}

const CENTER = '50% 50%'
const originOf = (a: SceneMove['anchor']) => (a ? `${Math.round(a.x)}px ${Math.round(a.y)}px` : CENTER)

const INITIAL: Record<Role, string | false> = { still: false, enter: 'initial', behind: false, leave: false, under: 'under' }
const ANIMATE: Record<Role, string> = { still: 'shown', enter: 'enter', behind: 'behind', leave: 'leave', under: 'shown' }

/**
 * 一疊整頁畫面：id 換了就做一段轉場。move 在 id 換掉的那一次 render 讀（方向、錨點）。
 * 舊畫面留在畫面上直到新畫面蓋好（往前）或自己收好（往回），期間不收點擊（inert）。
 * 舊畫面保留的是它最後一次的 children，所以它不會讀到新的路由、不會換成新畫面的內容。
 * 每個畫面記得自己從哪個畫面、哪個錨點長出來；往回到那個畫面時就收回同一個錨點，回到別的畫面就用微縮放。
 */
export function Scenes({ id, move, children, className = 'scene' }: { id: string; move: () => SceneMove; children: ReactNode; className?: string }) {
  const snaps = useRef(new Map<string, ReactNode>())
  const born = useRef(new Map<string, { parent: string; origin: string }>())
  const seq = useRef(1)
  const [shown, setShown] = useState(id)
  const [layers, setLayers] = useState<Layer[]>(() => [{ id, role: 'still', z: 1, origin: CENTER, anchored: false, quiet: false }])
  const [armed, setArmed] = useState(id)

  // id 換了：在這次 render 裡就把新的一層排好（React 的「render 中依前一個狀態調整」寫法）
  if (shown !== id) {
    const m = move()
    const from = shown
    setShown(id)
    let anchored: boolean
    let origin: string
    if (m.back) {
      const b = born.current.get(from)
      anchored = !!b && (b.parent === id || !!m.collapse) && b.origin !== CENTER
      origin = anchored ? b!.origin : CENTER
    } else {
      anchored = !!m.anchor
      origin = originOf(m.anchor)
      born.current.set(id, { parent: from, origin })
    }
    setLayers((prev) => {
      const old = prev.find((l) => l.id === from)
      const reuse = prev.find((l) => l.id === id)
      const rest = prev.filter((l) => l.id !== id && l.id !== from)
      const base = { origin, anchored }
      if (m.back) {
        const under: Layer = reuse ? { ...reuse, ...base, role: 'under', z: ++seq.current } : { id, ...base, role: 'under', z: ++seq.current, quiet: true }
        const top: Layer[] = old ? [{ ...old, ...base, role: 'leave', z: ++seq.current }] : []
        return [...rest, under, ...top]
      }
      const behind: Layer[] = old ? [{ ...old, ...base, role: 'behind' }] : []
      const enter: Layer = reuse ? { ...reuse, ...base, role: 'enter', z: ++seq.current } : { id, ...base, role: 'enter', z: ++seq.current, quiet: true }
      return [...rest, ...behind, enter]
    })
  }
  snaps.current.set(id, children)

  // 轉場結束：只留下現在的畫面
  useEffect(() => {
    const cur = layers.find((l) => l.id === id)
    if (!cur || layers.length === 1) return
    const t = window.setTimeout(
      () => {
        setLayers((ls) => ls.filter((l) => l.id === id).map((l) => ({ ...l, role: 'still' })))
        for (const k of [...snaps.current.keys()]) if (k !== id) snaps.current.delete(k)
      },
      cur.role === 'under' ? PAGE_REVEAL_MS : PAGE_SETTLED_MS,
    )
    return () => clearTimeout(t)
  }, [id, layers])

  // 新畫面出現一下子之後才收點擊
  useEffect(() => {
    if (armed === id) return
    const t = window.setTimeout(() => setArmed(id), ARM_MS)
    return () => clearTimeout(t)
  }, [id, armed])

  return (
    <>
      {[...layers]
        .sort((a, b) => a.z - b.z)
        .map((l) => {
          const live = l.id === id
          return (
            <motion.div
              key={l.id}
              className={className}
              data-scene={l.id}
              data-role={l.role}
              style={{ zIndex: l.z, transformOrigin: l.origin, pointerEvents: live && armed === id ? undefined : 'none' }}
              inert={!live}
              custom={{ anchored: l.anchored } satisfies PageCustom}
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

/** 主持的恐龍（Shell 的 .stage-host）在這一層裡的位置：教學卡從牠那裡長出來、收回牠那裡 */
function useHostOrigin(el: RefObject<HTMLDivElement | null>) {
  const [origin, setOrigin] = useState('50% 62%')
  useLayoutEffect(() => {
    const box = el.current?.parentElement
    if (!box) return
    const measure = () => {
      const host = box.closest('.stage')?.querySelector('.stage-host')
      if (!host) return
      const b = box.getBoundingClientRect()
      const h = host.getBoundingClientRect()
      // 恐龍的胸前（手拿著卡片的地方），不是腳底
      setOrigin(`${Math.round(h.left + h.width * 0.55 - b.left)}px ${Math.round(h.top + h.height * 0.45 - b.top)}px`)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [el])
  return origin
}

/**
 * 遊戲裡的教學卡（前景）和題目（背景）：和程式車庫開車同一段轉場（ui/motion.ts 的 foreground／background）。
 * - 卡片從主持的恐龍長出來，題目在卡片後面往恐龍微微推近後淡掉；卡片收回恐龍，題目拉遠回來。
 * - 卡片蓋著的時候換題目（children 換成下一題）不做動畫：卡片收回去時直接看到新的題目，不會先閃回上一題。
 * card 要帶自己的 key（每一張教學卡一個），教學卡元件要用 camera 模式（自己不另外淡入淡出）。
 */
export function CardStage({ card, children, origin: fixed }: { card: ReactNode; children: ReactNode; origin?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const host = useHostOrigin(el)
  const origin = fixed ?? host
  const up = !!card
  // 上一次畫面上卡片是不是蓋著：卡片收起來和換題常常在同一次 render，這一次換上的題目也算「看不到的時候換的」
  const wasUp = useRef(up)
  useEffect(() => {
    wasUp.current = up
  })
  return (
    <>
      <motion.div
        ref={el}
        className="card-bg"
        style={{ transformOrigin: origin, pointerEvents: up ? 'none' : undefined }}
        variants={background}
        initial="initial"
        animate={up ? 'hidden' : 'shown'}
      >
        <CardUp.Provider value={up || wasUp.current}>{children}</CardUp.Provider>
      </motion.div>
      <AnimatePresence>
        {card && (
          <motion.div key={(card as { key?: string }).key ?? 'card'} className="card-fg" style={{ transformOrigin: origin }} variants={foreground} initial="initial" animate="enter" exit="exit">
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
