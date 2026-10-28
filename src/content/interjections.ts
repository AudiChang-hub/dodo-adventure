// 語調 E4（2026-10-28 家長選定的「溫和版」）：在情緒句前面加一個溫和的感嘆詞，讓語氣有起伏。
// 研究與試聽在 docs/voice-samples/prosody/README.md（gitignore，不在 repo）。
//
// 台詞語法：`Hooray! || Great job!`。`||` 前面是感嘆詞段，另外合成一段音檔（參數固定，所以同一隻恐龍的同一個感嘆詞只有一個檔）；
// 字幕也會顯示感嘆詞。一般台詞不用自己寫 `||`，下面的規則會在 registry 的 def() 自動加上。
//
// 規則：只加在「情緒句」，題目本身維持簡潔。
// - 稱讚 praise.*：第 0、2、4 種說法加（約一半的稱讚有感嘆詞，不會每次答對都一樣長）。
// - 鼓勵（答錯再試）retry.*：第 0、1 種說法加。
// - 教學卡的第一句（teach.num／color／shape／sound／vocab／letter、teach.cat.*.0、teach.ws.*.0、c.teach.dir.*）。
// - 主題故事的開場 theme.*.intro。
// - 「豆豆說錯」的提問 tease.*：原本句首就有的 "Hmm..." 拆成感嘆詞段（不另外加字）。
// 句首已經有感嘆詞或狀聲詞（Wow, buddy!／Woof woof! This is a dog.／Drip, drop! …）就不再加。
// 不加：作答的題目（Where is | red?）、數數、規律節奏、排順序的故事句、自然發音（ph.*，見 isPronunciationDemo）。
import type { Speaker } from './registry'
import { fnv1a } from '../lib/hash'

/** 感嘆詞段的固定參數：rate、volume 相對於角色基準（%）；gap 是感嘆詞後到下一段的停頓（毫秒）。音高一律 +0Hz */
export interface InterjSpec {
  rate: number
  volume: number
  gap: number
}

// 數字照 E4 試聽（_scripts/gen_e4.py 的 B2_SCRIPT），只有 Hooray!、Look! 再放慢一點（−6% → −10%／−8%）：
// 這兩個字 Ana 本來就念得快，抽樣量到加了 Hooray! 的稱讚句發音速率比現況快；Uh-oh!、Ooh.、Hmm.、Look. 是新增的，比照同類
// 不用 Yay!、Wow!（Ana 念起來又高又短，家長覺得尖）；Guess what? 一律改成 You know what?
export const INTERJ: Record<string, InterjSpec> = {
  'Hooray!': { rate: -10, volume: 10, gap: 180 },
  'Look!': { rate: -8, volume: 10, gap: 220 },
  'Ooh!': { rate: -10, volume: 10, gap: 240 },
  'Oops!': { rate: -6, volume: 0, gap: 260 },
  'Uh-oh!': { rate: -8, volume: 0, gap: 260 },
  'Hmm...': { rate: -10, volume: 0, gap: 240 },
  // 問句當開場：後面停久一點（E4 試聽是 340ms），像在等對方回答
  'You know what?': { rate: -6, volume: 0, gap: 340 },
  // 莫莫比較沉穩：句號版本，安靜一點
  'Ooh.': { rate: -10, volume: 0, gap: 260 },
  'Hmm.': { rate: -10, volume: 0, gap: 260 },
  'Look.': { rate: -6, volume: 0, gap: 240 },
}

// 稱讚、鼓勵：說法不多，直接指定第幾種說法加哪個（其餘的維持原句，所以約一半的稱讚、鼓勵有感嘆詞）
// praise.en.* 是舊版遊戲沿用豆豆的句子，跟豆豆一樣
const PRAISE: Record<Speaker, Record<number, string>> = {
  dodo: { 0: 'Hooray!', 4: 'Ooh!' }, // 2 是「Wow, buddy!」，本來就有
  bobo: { 0: 'Hooray!', 2: 'Ooh!', 4: 'Hooray!' },
  momo: { 0: 'Ooh.', 4: 'Ooh.' },
}
const RETRY: Record<Speaker, Record<number, string>> = {
  dodo: { 0: 'Oops!' }, // 1 是「Hmm, look again!」，本來就有
  bobo: { 0: 'Oops!', 1: 'Uh-oh!' },
  momo: { 0: 'Hmm.', 1: 'Hmm.' },
}
// 教學卡第一句、故事開場：數量多，依 key 的雜湊輪流
type Pool = Record<Speaker, string[]>
const POOLS: Record<'teach' | 'story', Pool> = {
  teach: { dodo: ['Look!', 'Ooh!'], bobo: ['Look!', 'Ooh!'], momo: ['Ooh.', 'Look.'] },
  story: { dodo: ['You know what?', 'Look!'], bobo: ['You know what?', 'Ooh!'], momo: ['You know what?', 'Ooh.'] },
}

const TEACH_FIRST = /^(teach\.(num|color|shape|sound|vocab|letter)\.[^.]+|teach\.(cat|ws)\.[^.]+\.0|c\.teach\.dir\.[^.]+)$/
const TEASE = /^tease\.(letter|word|num|color|shape|vocab|oops)\./

/** 句首已經有感嘆詞、狀聲詞（第一段裡還有一個 ! ? … 結尾的小句），或第一個字本身就是感嘆詞 */
const OPENER_WORDS = new Set(['wow', 'yay', 'yes', 'oh', 'ooh', 'hmm', 'oops', 'look', 'hooray', 'uh-oh', 'woo-hoo', 'bump', 'shh', 'beep'])
function hasOpener(text: string) {
  const first = text.split('|')[0]
  if (/[!?…]\s+\S/.test(first) || /\.\.\.\s+\S/.test(first)) return true
  // 「Wow, buddy!」「Hmm, look again!」：第一個字後面緊接標點才算（「Look again!」的 Look 不算）
  const m = first.trim().match(/^([A-Za-z-]+)[,!.?…]/)
  return !!m && OPENER_WORDS.has(m[1].toLowerCase())
}

const stable = (key: string) => parseInt(fnv1a(key), 36)

/** 這句台詞要加哪個感嘆詞（不加回傳 null） */
export function interjectionFor(key: string, speaker: Speaker, text: string): string | null {
  if (text.includes('||') || hasOpener(text)) return null
  let m: RegExpMatchArray | null
  if ((m = key.match(/^praise\.[a-z]+\.(\d+)$/))) return PRAISE[speaker][Number(m[1])] ?? null
  if ((m = key.match(/^retry\.[a-z]+\.(\d+)$/))) return RETRY[speaker][Number(m[1])] ?? null
  const pool = TEACH_FIRST.test(key) ? POOLS.teach[speaker] : /^theme\.[^.]+\.intro$/.test(key) ? POOLS.story[speaker] : null
  return pool ? pool[(stable(key) >>> 4) % pool.length] : null
}

/** def() 用：加上感嘆詞段，或把 tease 原本句首的 "Hmm..." 拆成感嘆詞段 */
export function withInterjection(key: string, speaker: Speaker, text: string): string {
  if (TEASE.test(key) && text.startsWith('Hmm... ') && !text.includes('||')) return `Hmm... || ${text.slice(7)}`
  const j = interjectionFor(key, speaker, text)
  return j ? `${j} || ${text}` : text
}

/**
 * 發音示範：自然發音的台詞（字母音、/m/ 哼聲、Ssssnake 這類拉長的開頭音、點名的單字、開頭音相同的題目）。
 * 這些都是一個一個實測調過的發音，維持原本的合成參數與原檔：不加感嘆詞、不做 Praat 放大、不修剪、段間停頓照舊。
 * - ph.*：字母森林的自然發音（lines-phonics.ts）
 * - en.where.sound.*：聽音找字母（題目裡就是字母音，例如 Find the letter that says | buh!）
 */
const DEMO_PREFIXES = ['ph.', 'en.where.sound.']
export const isPronunciationDemo = (key: string) => DEMO_PREFIXES.some((p) => key.startsWith(p))
