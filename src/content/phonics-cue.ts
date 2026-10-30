// 字母和例字一起唸的台詞（2026-10-29 家長指定）：字母名稱 ×3 → 字母音 ×3 → 單字，中間停一下。
// 「ㄟ斯_ㄟ斯_ㄟ斯_斯_斯_斯_司內克」，字幕寫成 S, S, S… s, s, s… snake!
// 2026-10-30 家長改定：字母音也要一個一個斷開（斯_斯_斯），不要一口氣拉長（斯斯斯…）。
// m、s、f、n、l、r 的字母音因此從「拉長 0.7 秒一次」改成「短短的 0.28 秒 ×3」，跟停頓音 b, b, b… 一樣斷開。
// - 字母名稱：大寫（S,）；字母音：小寫 s, s, s…、b, b, b…、a, a…；單字照正確拼法。
//   三種在字幕上的樣子不一樣（src/games/phonics/phonics.css 的 data-part），規則在 subtitles.ts 的 cuePart。
// - TTS 單獨唸 sss…、b… 會拼成字母名稱，所以這種段不直接交給 edge-tts：extract-phrases.ts 把 cueParts() 交給
//   scripts/gen_audio.py，分段合成（字母名稱 "S."、停頓音 "buh."、單字 "snake!"）或從代表字切出字母音，再照順序接起來。
// 只有一部分也可以：They all start with | s, s, s…（只有字母音）、S… s, s, s… socks!（字母名稱一次，答對之後用）。
import { anchorOf, upper, type SoundUnit } from './letters'

/** 會延長的字母音每一下的長度（m、s… 斷開唸三次）、段與段之間、重複之間的停頓（毫秒）；改了數字或做法就把 version 加一，音檔會重新產生 */
export const CUE = { holdMs: 280, holdTimes: 3, gapMs: 400, repeatGapMs: 250, version: 6 }

export interface CueSpec {
  unit: SoundUnit
  /** 字母名稱唸幾次 */
  names: 0 | 1 | 3
  /** 要不要唸字母音（做不出來的 v 會略過） */
  sound: boolean
  /** 最後唸的單字 */
  word?: string
}

const REG = new Map<string, CueSpec>()

/** 字幕上的字母音：s, s, s…、b, b, b…、a, a… */
function soundText(u: SoundUnit): string | null {
  const s = u.sound
  const l = u.letter
  if (s.kind === 'none') return null
  return `${Array<string>(s.kind === 'hold' ? CUE.holdTimes : s.times).fill(l).join(', ')}…`
}

/** 一段台詞的文字（例如 S, S, S… s, s, s… snake!），同時登記起來給產生音檔、字幕用 */
export function cueText(spec: CueSpec): string {
  const U = upper(spec.unit.letter)
  const parts: string[] = []
  if (spec.names) parts.push(`${Array<string>(spec.names).fill(U).join(', ')}…`)
  const st = spec.sound ? soundText(spec.unit) : null
  if (st) parts.push(st)
  if (spec.word) parts.push(`${spec.word}!`)
  if (!parts.length) throw new Error(`空的字母音台詞：${spec.unit.letter}`)
  const text = parts.join(' ')
  const old = REG.get(text)
  if (old && (old.unit !== spec.unit || old.names !== spec.names || old.sound !== spec.sound || old.word !== spec.word)) throw new Error(`字母音台詞重複：${text}`)
  REG.set(text, spec)
  return text
}

/** 這段台詞是不是字母音台詞（整段是 cueText 產生的） */
export const cueOf = (text: string) => REG.get(text) ?? null

/** gen_audio.py 用的組合方式：一段一段，show 是這一段在字幕上對應的字 */
export type CuePart =
  | { kind: 'tts'; text: string; times: number; show: string[] }
  | { kind: 'hold'; src: string; letter: string; times: number; show: string[] }
  | { kind: 'cut'; src: string; ms: number; times: number; show: string[] }

export function cueParts(spec: CueSpec): CuePart[] {
  const u = spec.unit
  const U = upper(u.letter)
  const out: CuePart[] = []
  // 字母名稱：產生一次 "S."，重複三次（三次一模一樣，不會有一次變成別的音）
  if (spec.names) out.push({ kind: 'tts', text: `${U}.`, times: spec.names, show: `${Array<string>(spec.names).fill(U).join(', ')}…`.split(' ') })
  const st = spec.sound ? soundText(u) : null
  const s = u.sound
  const src = `${s.kind === 'cut' && s.from ? s.from : anchorOf(u).w}!`
  if (st && s.kind === 'hold') out.push({ kind: 'hold', src, letter: u.letter, times: CUE.holdTimes, show: st.split(' ') })
  if (st && s.kind === 'cut') out.push({ kind: 'cut', src, ms: s.ms, times: s.times, show: st.split(' ') })
  if (st && s.kind === 'say') out.push({ kind: 'tts', text: `${s.say}.`, times: s.times, show: st.split(' ') })
  if (spec.word) out.push({ kind: 'tts', text: `${spec.word}!`, times: 1, show: `${spec.word}!`.split(' ') })
  return out
}

/** 平板內建語音備援：延長音、剪出來的音會被拼成字母，略過；停頓音照唸 */
export function cueSpoken(spec: CueSpec): string {
  return cueParts(spec)
    .filter((p) => p.kind === 'tts')
    .map((p) => Array<string>(p.times).fill(p.text.replace(/[.!]$/, '')).join(', '))
    .join(', ')
}
