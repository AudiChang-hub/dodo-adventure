import { useRef } from 'react'
import { hushSpeech } from '../lib/audio'

/**
 * 搶點（T-108，家長真人試玩：三歲等不及，波波話還沒講完就點，點了沒反應、被擋，整個很卡）。
 * 說明、念題目、示範都可以被孩子搶掉：
 * - 點到要點的東西（選項、要數的、要拿的、在描字板下筆）：停掉語音、示範收掉，照常判對錯；
 * - 點到空白：停掉語音，不算錯，輪到你的發光框或手指提示馬上出來；
 * - 被打斷的話不重播（閒置 15 秒的提醒會再短講一次題目）。
 * 答對後的稱讚、慶祝、換題不能搶（免得重複作答），那幾段照舊用擋板（games/NotYet 的 WaitShield）。
 *
 * 用法：每一段可以被打斷的流程開頭 `const ok = flow.begin(live)`，每個 await 之後 `if (!ok()) return`；
 * 孩子搶點時 `flow.cut()`：正在說的話停下（字幕留著），之前開始的流程在下一個 await 之後自己結束，不會再說話。
 */
export function useFlow() {
  const run = useRef(0)
  return useRef({
    /** 開始一段可以被打斷的流程：回傳「這段流程還算數嗎」（離開畫面、被搶掉都算不算數了） */
    begin(live: { current: boolean }) {
      const my = ++run.current
      return () => live.current && run.current === my
    },
    /** 孩子搶點：停掉正在說的話，之前開始的流程都作廢 */
    cut() {
      run.current++
      hushSpeech()
    },
  }).current
}

/** 這一下點在空白處（不是按鈕、不是畫布）：給作答區容器的 onPointerDown 判斷用 */
export const onBlank = (target: EventTarget | null) => !(target instanceof Element && target.closest('button, [role="button"], canvas'))
