/**
 * 孩子真的看得到畫面的時間：一格一格算（requestAnimationFrame），卡住的那一段不算。
 * 換畫面、返回之後「多久之內的點擊不算」都要用這個算，不能用計時器：
 * 平板忙的時候主執行緒會卡一兩秒，轉場的淡入停在半透明，孩子根本還看不到新畫面，計時器卻已經走完；
 * 卡住期間的點擊排在後面才處理，也不能用處理到它的時間，要用它自己的 e.timeStamp 跟這裡的 at 比（ui/Scenes.tsx、lib/nav.ts）。
 */

/** 兩格之間最多算多久（再久就是卡住了，或切到背景） */
const FRAME_MAX_MS = 50

export interface Shown {
  /** 第一格畫出來的時間（還沒畫是 Infinity） */
  first: number
  /** 順順地看得到 ms 的那一格（還沒到是 Infinity）；跟 e.timeStamp 同一個時鐘 */
  at: number
  cancel: () => void
}

/** 從現在起，畫面順順地出現 ms 之後是什麼時候 */
export function shownFor(ms: number): Shown {
  const s: Shown = { first: Infinity, at: Infinity, cancel: () => cancelAnimationFrame(raf) }
  let raf = 0
  let prev = 0
  let shown = 0
  const tick = (t: number) => {
    if (s.first === Infinity) s.first = t
    else shown += Math.min(t - prev, FRAME_MAX_MS)
    prev = t
    if (shown >= ms) s.at = t
    else raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return s
}
