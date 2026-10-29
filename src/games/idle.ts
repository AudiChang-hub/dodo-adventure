import { useEffect, useRef } from 'react'

/** 題目唸完後多久沒操作才提醒 */
export const IDLE_MS = 15_000
/** 兩段提醒都做過、孩子還是沒動：之後每隔這麼久，手再安靜地示範一次（不說話） */
export const IDLE_AGAIN_MS = 40_000

export interface IdleSteps {
  /** 第一次閒置：用語音再唸一次題目 */
  repeat: () => void
  /**
   * 第二次閒置：手再示範一次（準則 PHASE-7）：選擇題的手移到答案上點一下，畫畫類的手（筆）畫一小段，
   * 做完停在答案或起點上（靜態，不循環）。不說話。之後每 40 秒會再叫一次，要能重複叫。
   */
  hint: () => void
}

/**
 * 閒置提醒（家長回饋：孩子還沒作答時恐龍一直講話很吵）。所有遊戲共用同一套規則：
 * 1. 題目唸完後 15 秒沒有任何操作 → 用語音再唸一次題目。
 * 2. 再 15 秒還是沒操作 → 手再示範一次，不說話。
 * 3. 之後不再說話；每 40 秒手再安靜地示範一次（畫畫這種沒有標準答案的，發呆再久也一定有提示，三歲模擬測試 B10）。
 * 任何點擊、畫線都會重新計時。已經做過的步驟不會因為重新計時就重來（題目不會在孩子沒動的時候被唸第二次）；
 * 三段都做完之後孩子又動手了，才從頭再來一輪（那時孩子是玩了一陣子才停下來，不是一直沒反應）。
 * 答錯時的「再試一次」是回饋，不算在閒置提醒裡。
 */
export function useIdle() {
  const timer = useRef(0)
  const stage = useRef(0)
  const steps = useRef<IdleSteps | null>(null)

  const schedule = () => {
    clearTimeout(timer.current)
    if (!steps.current) return
    timer.current = window.setTimeout(
      () => {
        const s = steps.current
        if (!s) return
        if (stage.current === 0) s.repeat()
        else s.hint()
        stage.current++
        schedule()
      },
      stage.current >= 2 ? IDLE_AGAIN_MS : IDLE_MS,
    )
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return useRef({
    /** 新的題目（或新步驟）唸完了：從頭開始計時 */
    start(s: IdleSteps) {
      steps.current = s
      stage.current = 0
      schedule()
    },
    /** 孩子有操作：重新計時，已經做過的提醒不會重來（三段都做完了才從頭再來一輪） */
    poke() {
      if (!steps.current) return
      if (stage.current >= 2) stage.current = 0
      schedule()
    },
    /** 作答完成、換題、示範中：停止提醒 */
    stop() {
      clearTimeout(timer.current)
      steps.current = null
    },
  }).current
}
