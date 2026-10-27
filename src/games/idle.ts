import { useEffect, useRef } from 'react'

/** 題目唸完後多久沒操作才提醒 */
export const IDLE_MS = 15_000

export interface IdleSteps {
  /** 第一次閒置：用語音再唸一次題目（整題只唸這一次） */
  repeat: () => void
  /** 第二次閒置：正確答案慢慢發光，不說話 */
  hint: () => void
}

/**
 * 閒置提醒（家長回饋：孩子還沒作答時恐龍一直講話很吵）。所有遊戲共用同一套規則：
 * 1. 題目唸完後 15 秒沒有任何操作 → 用語音再唸一次題目。整題只唸這一次。
 * 2. 再 15 秒還是沒操作 → 正確答案慢慢發光，不說話。
 * 3. 之後完全安靜，等孩子操作。
 * 任何點擊、畫線都會重新計時，但不會讓已經做過的步驟重來（題目不會被唸第二次）。
 * 答錯時的「再試一次」是回饋，不算在閒置提醒裡。
 */
export function useIdle() {
  const timer = useRef(0)
  const stage = useRef(0)
  const steps = useRef<IdleSteps | null>(null)

  const schedule = () => {
    clearTimeout(timer.current)
    if (!steps.current || stage.current >= 2) return
    timer.current = window.setTimeout(() => {
      const s = steps.current
      if (!s) return
      if (stage.current === 0) s.repeat()
      else s.hint()
      stage.current++
      schedule()
    }, IDLE_MS)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return useRef({
    /** 新的題目（或新步驟）唸完了：從頭開始計時 */
    start(s: IdleSteps) {
      steps.current = s
      stage.current = 0
      schedule()
    },
    /** 孩子有操作：重新計時，已經做過的提醒不會重來 */
    poke() {
      if (steps.current) schedule()
    },
    /** 作答完成、換題、示範中：停止提醒 */
    stop() {
      clearTimeout(timer.current)
      steps.current = null
    },
  }).current
}
