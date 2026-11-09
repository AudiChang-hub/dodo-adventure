import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react'
import { Hand } from '../games/Demo'
import { sfx } from '../lib/audio'
import { firstFinger } from '../games/NotYet'

/**
 * 「下一步」的大箭頭（T-118，家長決定：課程不能自己換頁、自己結束，孩子會覺得「怎麼不見了」）。
 * 一堂課裡每做完一段、一題，畫面停在「完成了」的樣子，右下角出現一顆大大的箭頭；孩子點了才往下。他不點就一直等，不自己走。
 * - 用圖示不用字：綠色圓鈕、白色往右的粗箭頭（聽不懂英文也看得懂）。
 * - 出來時跳一下；2.5 秒沒點，手來點一下給他看；之後每 8 秒（PHASE-7 小班段）箭頭再跳一下、手再點一下。
 *   nextStep({ cue: true })：一出來（0.65 秒）就跳一下、手點一下，2.5 秒再一次（T-122，英文選擇題答完）。
 * - 點別的地方（返回鍵以外）：箭頭跳一下、手點一下（「點這裡」）。
 * - 剛出來的 0.5 秒不收（上一題連點的手指不會一下就跳過，PACE.BARGE_ARM）。
 * - 減少動態效果時只出現、不跳。
 * 用法：在課程裡 `if (!(await nextStep())) return`；畫面上放一個 <NextStepHost />（LessonScreen 放了）。
 */

/** 剛出來多久內點了不算 */
const ARM_MS = 500
/** 多久沒點，手來點一下給他看 */
const FIRST_HAND_MS = 2500
/** 之後每隔多久再提醒一次（PHASE-7 小班段 8 秒） */
const AGAIN_MS = 8000

/** cue：一出來（收得到的時候）箭頭就跳、手就點，不等 2.5 秒（T-122，英文選擇題答完：他看不出做完了、該點哪裡） */
const CUE_MS = ARM_MS + 150

type Pending = { resolve: (ok: boolean) => void; at: number; cue: boolean }
let pending: Pending | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/**
 * 停下來等孩子點「下一步」：點了回傳 true；課被關掉（離開、換課）回傳 false。
 * cue：一出來就跳一下、手點一下（2.5 秒再一次），給「做完了，下一步在這裡」看不出來的地方用；沒給照舊 2.5 秒才來
 */
export function nextStep({ cue = false }: { cue?: boolean } = {}): Promise<boolean> {
  pending?.resolve(false)
  return new Promise<boolean>((resolve) => {
    pending = { resolve, at: performance.now(), cue }
    emit()
  })
}

/** 取消正在等的「下一步」（離開這堂課時） */
export function cancelNextStep() {
  if (!pending) return
  const p = pending
  pending = null
  emit()
  p.resolve(false)
}

/** 現在是不是停著等「下一步」（陪玩小字跟著換） */
export function useNextPending() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => pending !== null,
  )
}

/** 給大人的陪玩小字（停著等「下一步」的時候） */
export const NEXT_HINT = '做完一段會停下來，請他點右下角的大箭頭。'

export function NextStepHost() {
  const on = useNextPending()
  useEffect(() => cancelNextStep, [])
  return <AnimatePresence>{on && <NextButton key="next" />}</AnimatePresence>
}

function NextButton() {
  const still = useReducedMotion()
  const [scope, animate] = useAnimate<HTMLButtonElement>()
  const [hand, setHand] = useState(0)
  const handTimer = useRef(0)
  const gone = useRef(false)

  /** 箭頭跳一下、手點一下 */
  const nudge = () => {
    if (gone.current) return
    if (!still && scope.current) void animate(scope.current, { y: [0, -18, 0], scale: [1, 1.08, 1] }, { duration: 0.55, ease: 'easeOut' })
    setHand((h) => h + 1)
    clearTimeout(handTimer.current)
    handTimer.current = window.setTimeout(() => setHand(0), 1800)
  }

  useEffect(() => {
    const cue = window.setTimeout(() => pending?.cue && nudge(), CUE_MS)
    const first = window.setTimeout(nudge, FIRST_HAND_MS)
    const again = window.setInterval(nudge, AGAIN_MS)
    // 點別的地方（返回鍵、大人的東西以外）：箭頭跳一下、手點一下
    const elsewhere = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (!el || el.closest('.next-step, [data-back], .back-btn, .parent-corner, .coplay-hint')) return
      nudge()
    }
    window.addEventListener('pointerdown', elsewhere, true)
    return () => {
      gone.current = true
      clearTimeout(cue)
      clearTimeout(first)
      clearInterval(again)
      clearTimeout(handTimer.current)
      window.removeEventListener('pointerdown', elsewhere, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (e: React.PointerEvent) => {
    if (!firstFinger(e.nativeEvent) || !pending) return
    if (performance.now() - pending.at < ARM_MS) return
    sfx.tap()
    const p = pending
    pending = null
    emit()
    p.resolve(true)
  }

  return (
    <motion.button
      ref={scope}
      type="button"
      className="next-step"
      aria-label="下一步"
      data-next-step=""
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
      whileTap={{ scale: 0.9 }}
      onPointerDown={go}
      onClick={(e) => {
        // 鍵盤（Enter／空白鍵）
        if (e.detail === 0 && pending) {
          const p = pending
          pending = null
          emit()
          p.resolve(true)
        }
      }}
    >
      <svg viewBox="0 0 48 48" width="56%" aria-hidden="true">
        <path d="M9 24 H35 M24 12 L37 24 L24 36" fill="none" stroke="#fff" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <AnimatePresence>
        {hand > 0 && (
          <span className="next-step-hand" aria-hidden="true">
            <Hand x={52} y={54} tap={hand} size="62%" cuff="#BFE0CC" />
          </span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
