// 第 2 次上同一篇（現況對照 A3）：念到紅字前停下來，字幕的紅字挖空，等孩子接（對話式共讀的「填空提示」）。
// 課文一行是一個音檔（BreezyVoice，沒有逐字時間），這裡估出紅字前一個字在聲音裡的結束點，再對齊到最近的停頓（音量最小的地方）。
// 只有純函式，scripts/test-zh-course.ts 直接測。
import { pieces } from './data'

/** 一遍怎麼念：照念（plain），或念到紅字前停下來等孩子接（gap） */
export type Pass = 'plain' | 'gap'

/** 第幾次上這一篇 → 一開始念哪幾遍：第 2 次先照念一遍，第二遍挖空讓孩子接；第 1、3 次照念兩遍 */
export const passesOf = (run: number): Pass[] => (run === 2 ? ['plain', 'gap'] : ['plain', 'plain'])

/** 挖空之後等孩子接多久（≥ 1.5 秒；沒人接就自己念出來、接著念下去） */
export const CLOZE_WAIT_MS = 2000

/** 一個字大概佔多長：漢字 1；標點後面會停一下，算長一點；英文字母、數字短一點 */
const weight = (ch: string) => (/\p{Script=Han}/u.test(ch) ? 1 : /[，。！？、；：,.!?;:]/.test(ch) ? 1.6 : /\s/.test(ch) ? 0 : 0.6)
const weigh = (s: string) => [...s].reduce((a, c) => a + weight(c), 0)

/**
 * 一行要挖空的地方：最後一個紅字（一行只挖一個，不然停太多次）。挑最後一個：前面念得越多，孩子越有線索接得出來，
 * 也最像大人共讀時的「三隻小豬蓋……？」。沒有紅字回傳 null。
 */
export function gapOf(line: string): { word: string; before: string; after: string } | null {
  const ps = pieces(line)
  const k = ps.map((p) => p.red).lastIndexOf(true)
  if (k < 0) return null
  const join = (xs: typeof ps) => xs.map((p) => p.text).join('')
  return { word: ps[k].text, before: join(ps.slice(0, k)), after: join(ps.slice(k + 1)) }
}

/** 紅字前那一段佔整行的多少（0～1）：帶子走到這裡停 */
export function beforeShare(line: string): number {
  const g = gapOf(line)
  if (!g) return 1
  // 行尾的標點不算：有聲音的長度（audio.ts 的 audibleDuration）已經把結尾的靜音切掉了
  const all = weigh(g.before) + weigh(g.word) + weigh(g.after.replace(/[\p{P}\s]+$/u, ''))
  return all ? weigh(g.before) / all : 0
}

/** 聲音開始的地方（音檔前面的靜音），秒 */
export function onsetOf(data: Float32Array, rate: number, floor = 0.02): number {
  let i = 0
  while (i < data.length && Math.abs(data[i]) < floor) i++
  return i / rate
}

/**
 * 在 [from, to] 秒之間找音量最小的 20 毫秒（字和字之間的停頓），回傳那一段的中間；靠前的優先（寧可早一點停，不要念出紅字的開頭）。
 */
export function quietest(data: Float32Array, rate: number, from: number, to: number): number {
  const win = Math.max(1, Math.round(rate * 0.02))
  const a = Math.max(0, Math.round(from * rate))
  const b = Math.min(data.length - win, Math.round(to * rate))
  if (b <= a) return Math.max(0, Math.min(to, from))
  let best = a
  let bestE = Infinity
  for (let i = a; i <= b; i += Math.max(1, win >> 1)) {
    let e = 0
    for (let j = i; j < i + win; j++) e += data[j] * data[j]
    // 越後面稍微加一點分數：一樣安靜時選前面的
    const score = e * (1 + (0.6 * (i - a)) / (b - a + 1))
    if (score < bestE) {
      bestE = score
      best = i
    }
  }
  return (best + win / 2) / rate
}

/** 10 毫秒一格的音量（前後各平均一格） */
function envelope(data: Float32Array, rate: number): number[] {
  const fr = Math.max(1, Math.round(rate * 0.01))
  const env: number[] = []
  for (let i = 0; i + fr <= data.length; i += fr) {
    let e = 0
    for (let j = i; j < i + fr; j++) e += data[j] * data[j]
    env.push(Math.sqrt(e / fr))
  }
  return env.map((_, i) => (env[Math.max(0, i - 1)] + env[i] + env[Math.min(env.length - 1, i + 1)]) / 3)
}

/**
 * 每個字的韻母最響：找出音量的高峰（一個字一個），回傳每個高峰在第幾格（10 毫秒一格）。
 * 兩個高峰至少隔 0.12 秒，中間要掉下去一些才算兩個字。用真的課文語音（第 1～30 篇 119 行）調過：約一半的行數得剛好跟字數一樣。
 */
export function syllablePeaks(env: number[]): number[] {
  const mx = Math.max(...env)
  const out: number[] = []
  for (let i = 1; i < env.length - 1; i++) {
    if (!(env[i] > 0.1 * mx && env[i] >= env[i - 1] && env[i] > env[i + 1])) continue
    const q = out[out.length - 1]
    if (q == null) {
      out.push(i)
      continue
    }
    let valley = Infinity
    for (let k = q; k <= i; k++) valley = Math.min(valley, env[k])
    if (i - q >= 12 && valley < 0.85 * Math.min(env[i], env[q])) out.push(i)
    else if (env[i] > env[q]) out[out.length - 1] = i
  }
  return out
}

const hanCount = (s: string) => s.match(/\p{Script=Han}/gu)?.length ?? 0

/**
 * 這一行念到紅字前要停在幾秒。dur 是有聲音的長度（audio.ts 的 audibleDuration）。紅字在行首時回傳 0（不播，直接挖空等）。
 * 1. 數得出每個字（音量高峰的數目剛好等於字數）：停在紅字前一個字和紅字之間最安靜的地方。
 * 2. 數不出來：照字數估（前面靜音之後、到有聲音的結尾按字的份量分），再往前後找最近的停頓（偏早，寧可少念一個字也不要念出答案）。
 */
export function cutAt(line: string, data: Float32Array, rate: number, dur: number): number {
  const g = gapOf(line)
  const share = beforeShare(line)
  if (!g || share <= 0) return 0
  const env = envelope(data, rate)
  const peaks = syllablePeaks(env)
  const k = hanCount(g.before)
  if (k > 0 && peaks.length === k + hanCount(g.word) + hanCount(g.after)) {
    let best = peaks[k - 1]
    for (let i = peaks[k - 1]; i <= peaks[k]; i++) if (env[i] < env[best]) best = i
    return (best + 0.5) / 100
  }
  const lead = Math.min(onsetOf(data, rate), dur * 0.3)
  const est = lead + (dur - lead) * share
  return quietest(data, rate, est - 0.22, est + 0.06)
}
