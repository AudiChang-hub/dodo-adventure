/**
 * 孩子真的看得到畫面的時間：一格一格算（requestAnimationFrame），卡住的那一段不算。
 * 換畫面、返回之後「多久之內的點擊不算」都要用這個算，不能用計時器：
 * 平板忙的時候主執行緒會卡一兩秒，轉場的淡入停在半透明，孩子根本還看不到新畫面，計時器卻已經走完；
 * 卡住期間的點擊排在後面才處理，也不能用處理到它的時間，要用它自己的 e.timeStamp 跟這裡的 at 比（ui/Scenes.tsx、lib/nav.ts）。
 *
 * 「卡住」是跟平常比：一格比最近幾格長很多才算卡住。
 * 2026-11-01 修（三大門偶發「點門沒反應」）：以前每一格最多算 50ms，平板一直很忙、一秒只畫得出 5 格（每格 200ms）時，
 * 每一格都被當成卡住、只算 50ms，換畫面後要 10 格（2 秒）才收點擊；4 格的話要 2.5 秒。這時候轉場早就走完、畫面靜止了，
 * 孩子點門卻沒反應。現在一格算到「最近幾格的中位數 × 1.5」：一直都慢的平板照實際時間算，突然卡一下的那一格還是只算一點點。
 */

/** 兩格之間至少算到這麼久（平常 60fps 時，比這個長就是卡住了，或切到背景） */
const FRAME_MAX_MS = 50
/** 一直很慢的平板：一格最多算到這麼久（再久就算畫面再慢，也當成卡住） */
const FRAME_CAP_MS = 250
/** 用最近幾格算「平常一格多久」 */
const RECENT = 8

/** 最近幾格的間隔（所有正在算的畫面一起量：同一個頁面的畫格速度是一樣的） */
const recent: number[] = []

/** 這一格最多算多久：平常一格的 1.5 倍（至少 50ms、最多 250ms） */
function frameMax() {
  if (recent.length < 3) return FRAME_MAX_MS
  const s = [...recent].sort((a, b) => a - b)
  const median = s[Math.floor(s.length / 2)]
  return Math.min(FRAME_CAP_MS, Math.max(FRAME_MAX_MS, median * 1.5))
}

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
    else {
      const dt = t - prev
      // 先用之前的速度判斷這一格算多少，再把它記進「最近」：卡住的那一格不會先把標準拉高
      shown += Math.min(dt, frameMax())
      recent.push(dt)
      if (recent.length > RECENT) recent.shift()
    }
    prev = t
    if (shown >= ms) s.at = t
    else raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return s
}
