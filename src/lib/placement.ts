import type { GameLevel, ProbeStep } from './db'

/**
 * 程度校準（第二批・工作線 A）：每個遊戲第一次玩（或舊資料還沒校準過）時，
 * 用 2–3 題比較難的題目快速探測，答對就把起始難度往上調，
 * 讓 Sam 不會從 2 選 1、數 1–3 這種對他太簡單的地方開始。
 *
 * 探測的起點依 Sam 的實際程度（2026-10-25 學習單）訂：
 * - 選擇題從 3 級（4 選 1）開始；
 * - 數數、照順序、有幾個從 2 級開始（他能數到 5，2 級是 2–5、3 級是 4–8）。
 * 不在表上的遊戲（畫畫類照發展順序走、全新的能力）不探測，理由寫在表的最後。
 *
 * 不教不考（2026-10-28 家長：「不教而殺謂之虐」）：探測題也只能考 App 裡已經學過的內容。
 * - 英文名稱類的遊戲（找顏色、找形狀、聽詞找圖、聽聲音、動動腦、找數字）不探測，第一次玩照教學順序從 1 級教。
 *   這些遊戲答案是一個英文名字（green、circle、cat、number seven），Sam 分得出顏色、數得出來，但英文名字在 App 裡還沒教過；
 *   難度主要是「池子裡有幾個名字、幾個選項」，對還不會這些名字的他來說，1 級就是真正的起點，不是「太簡單」。
 *   他學得快的話，連續 3 題第一次就答對就升一級（adaptive.reportLevel），一兩局就會到該有的難度。
 *   不選「探測題前先秀教學卡」：那樣探測題就變成剛教完的考題，量不出程度，還會一局教到 3 個以上的新名字。
 * - 其他留著探測的遊戲：
 *   - 選擇題引擎（有幾個）的探測題只出學過的內容，而且不連續考同一個（games/pick.ts 的 planChoice）；
 *     找不到就當一般題目（新的照樣先教），探測不算這一題，等學過的內容夠了再探。
 *   - 數數、塗格子、給蛋、一眼看幾個、學習單：這些引擎本來就是新內容先示範或教學卡、一起練，才自己答，
 *     探測只決定「出幾個、出哪一級」，答案目標都已經教過。
 * 自動檢查：scripts/sim-teach.ts（空資料庫一路玩 40 天，每一題自己答都必須已學過或剛教過）。
 */
export const PROBE_START: Record<string, number> = {
  'm-count': 2,
  'm-match': 2,
  'm-order': 2,
  // 第三批補上：學習單題型的遊戲。紙本學習單他寫得很快（數到 5 一對一塗格子、依類別／顏色／功能分類、
  // 正方體 vs 三角柱都會），從 1 級開始太簡單，所以也探測；2 級正好是學習單的量（數量 2–5、5 個找 2–3 個）
  'm-fill': 2,
  'm-give': 2,
  'm-flash': 2,
  'p-findall': 2,
  'p-solid': 2,
  'z-use': 2,
  // 刻意不探測的：
  // - 找顏色（p-color）、找形狀（p-shape）、聽詞找圖（z-find）、聽聲音猜猜看（z-sound）、動動腦（z-category）、找數字（m-find）：
  //   英文名稱類，探測就是考沒教過的英文名字（2026-10-28 拿掉，理由見上面）。
  // - 自然發音（ph-*；舊的 en-* 已改成 ph-*）、程式車庫（c-*）：全新的能力，學習單沒有做過，探測只會先答錯一串，照教學順序從頭教。
  // - 圈圈看（p-lasso）：紙上用蠟筆圈過，但在平板上用筆圈是新的運筆動作，和畫畫小屋一樣照發展順序走。
  // - 數字快答（m-quick）：只有一級，出的都是已熟的題目。
  // - 比多少（m-compare）、比大小（p-size）：2026-10-28 拿掉。由簡到難照熟練度走（先只問多／大、差很多，
  //   熟了才問少／小，之後才縮小差距，見 content/games.ts 的 compareStage）；原本空資料庫從 3 級探測，第一題就可能是 6 對 8 的「少」。
}

/** 最多探測幾題 */
export const PROBE_ITEMS = 3
/** 探測時錯幾題就停 */
const PROBE_MAX_WRONG = 2

export const probing = (l: GameLevel | undefined) => !!l?.probe

/**
 * 開始探測：還沒校準過、而且目前難度低於探測起點的遊戲。
 * 原本難度已經夠高的，直接記為「已校準（略過）」。回傳 null 代表這個遊戲不探測。
 */
export function beginProbe(l: GameLevel): GameLevel | null {
  if (l.placed || l.probe) return null
  const start = PROBE_START[l.key]
  if (!start) return null
  if (l.level >= start) return { ...l, placed: { ts: Date.now(), from: l.level, to: l.level, steps: [], skipped: true } }
  return { ...l, level: start, up: 0, down: 0, probe: { from: l.level, start, steps: [] } }
}

/** 探測到一半停在現在的難度：這一題記下來，不升不降（lib/adaptive.ts 的 reportLevel） */
export function stopProbe(l: GameLevel, ok: boolean, skill?: string): GameLevel {
  const p = l.probe!
  const steps: ProbeStep[] = [...p.steps, { level: l.level, ok, ...(skill ? { skill } : {}) }]
  const { probe: _p, ...rest } = l
  return { ...rest, up: 0, down: 0, placed: { ts: Date.now(), from: p.from, to: l.level, steps } }
}

/**
 * 探測一題的結果（階梯法）：答對往上一級、答錯退一級；
 * 出滿 3 題或錯 2 題就結束，停在當時的難度。
 */
export function stepProbe(l: GameLevel, ok: boolean, maxLevel: number, skill?: string): GameLevel {
  const p = l.probe!
  const steps: ProbeStep[] = [...p.steps, { level: l.level, ok, ...(skill ? { skill } : {}) }]
  const level = ok ? Math.min(maxLevel, l.level + 1) : Math.max(1, l.level - 1)
  const wrong = steps.filter((s) => !s.ok).length
  if (steps.length >= PROBE_ITEMS || wrong >= PROBE_MAX_WRONG) {
    const { probe: _p, ...rest } = l
    return { ...rest, level, up: 0, down: 0, placed: { ts: Date.now(), from: p.from, to: level, steps } }
  }
  return { ...l, level, probe: { ...p, steps } }
}
