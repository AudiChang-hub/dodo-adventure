// 單字的「教過沒」與家長的「他不認得」（2026-10-28：單字也要不教不考）。
//
// - 教過：這個字在教學卡上出現過（看圖、聽名字）。來源有兩個：
//   1. 這次之後的紀錄：出題規劃（games/pick.ts）決定要跑教學卡時，把卡上教的字記下來（kv 的 words:taught）；
//   2. 之前的熟練度推算：動物村 vocab:dog 自己答過、字母森林 phonics:b 學過（三個關鍵字）、動動腦 cat:fly 學過（兩個例子）……
//      這樣原本已經在學的孩子不會一下子什麼字都「沒教過」。名字這次改掉的字（rooster → chicken）、新換上的關鍵字不算，要重教。
// - 家長勾「他不認得」（kv 的 words:unknown，屬於家長設定：重置學習進度時保留、會同步到雲端）：
//   那個字不再當例子、干擾選項，也不唸它的名字；它是教學目標時，勾選之後要先重新教過一次才能考。
//
// 出題的規則：答案、干擾選項、動動腦的圖、字母森林的複習字，都要是 usable（教過、家長沒勾）的字；
// 不夠的時候選項變少（最少 2 個），再不夠就在教學卡上多教一個字，不補沒教過的字。
import { useSyncExternalStore } from 'react'
import { getKV, setKV } from './db'
import { skill, skillsVersion } from './adaptive'
import { VOCAB, CAT_EXAMPLES } from '../content/vocab'
import { PHONICS, NEW_KEY_WORDS, LETTERS, wordId } from '../content/letters'
import { CATEGORIES } from '../content/worksheet-data'
import { keyOfIcon, keyOfVocab, wordKey } from '../content/lexicon'

export const TAUGHT_KV = 'words:taught'
/** 家長設定：reset.ts 的 KEEP_KV 要保留，sync.ts 會上傳 */
export const UNKNOWN_KV = 'words:unknown'

/** 字 → 第一次（或家長勾選之後重新）教的時間 */
let taught = new Map<string, number>()
/** 字 → 家長勾「他不認得」的時間 */
let unknown = new Map<string, number>()
const subs = new Set<() => void>()
let snapshot: ReadonlyMap<string, number> = unknown

export async function loadWords() {
  taught = new Map(Object.entries(await getKV<Record<string, number>>(TAUGHT_KV, {})))
  unknown = new Map(Object.entries(await getKV<Record<string, number>>(UNKNOWN_KV, {})))
  snapshot = new Map(unknown)
  subs.forEach((f) => f())
}

// ── 從之前的熟練度推算（只讀，不寫回去） ──────────────────────
/** 這次改了英文名字的詞：舊紀錄教的是舊名字（rooster、present、long-neck dinosaur），不算教過新名字 */
const RENAMED_VOCAB = new Set(['chicken', 'gift', 'sauropod'])
/** 改版前「做什麼用」的教學卡例子（rain 的 boot、bath 的 sponge 已經不當例子，但孩子確實看過 boot 這個字） */
const OLD_USE_EXAMPLES: Record<string, string[]> = { rain: ['umbrella', 'boot'], bath: ['bathtub'], bed: ['bed', 'teddy'], eat: ['apple', 'cookie'], wear: ['tshirt', 'cap'] }
const seen = (k: string) => skill(k).seen > 0

let derivedVer = -1
let derived = new Set<string>()
function derivedWords(): Set<string> {
  const v = skillsVersion()
  if (v === derivedVer) return derived
  const out = new Set<string>()
  for (const x of VOCAB) if (!RENAMED_VOCAB.has(x.id) && (seen(`vocab:${x.id}`) || seen(`sound:${x.id}`))) out.add(wordKey(x.en))
  for (const u of PHONICS) if (seen(`phonics:${u.letter}`)) for (const k of u.keys) if (!NEW_KEY_WORDS.has(wordId(k.w))) out.add(wordId(k.w))
  for (const [tag, ids] of Object.entries(CAT_EXAMPLES)) if (seen(`cat:${tag}`)) for (const id of ids.slice(0, 2)) out.add(keyOfVocab(id))
  for (const [u, ids] of Object.entries(OLD_USE_EXAMPLES)) if (seen(`all:${u}`)) for (const id of ids) out.add(keyOfVocab(id))
  for (const [c, d] of Object.entries(CATEGORIES))
    if (seen(`all:${c}`) || seen(`lasso:${c}`))
      for (const icon of d.examples) {
        const k = keyOfIcon(icon)
        if (k) out.add(k)
      }
  // 舊版字母森林（字母配圖 B → bus）自己答過的字
  for (const l of LETTERS) if (seen(`word:${l.letter}`)) out.add(wordKey(l.word))
  derived = out
  derivedVer = v
  return out
}

// ── 查詢 ─────────────────────────────────────────────────────
export const isUnknown = (key: string) => unknown.has(key)

/** 這個字教過了沒（不管家長有沒有勾） */
export const wasTaught = (key: string) => taught.has(key) || derivedWords().has(key)

/** 可以當干擾選項、例子、可以唸名字：教過，而且家長沒勾「他不認得」 */
export const usable = (key: string) => !unknown.has(key) && wasTaught(key)

/** 這個字當答案（教學目標）之前要不要先教：沒教過；或家長勾了「他不認得」之後還沒重新教過 */
export function needsTeach(key: string): boolean {
  const flagged = unknown.get(key)
  if (flagged != null) return (taught.get(key) ?? 0) <= flagged
  return !wasTaught(key)
}

// ── 紀錄 ─────────────────────────────────────────────────────
let saving = false
function saveTaught() {
  if (saving) return
  saving = true
  queueMicrotask(() => {
    saving = false
    void setKV(TAUGHT_KV, Object.fromEntries(taught)).catch(() => {})
  })
}

/** 教學卡上教了這些字（出題規劃決定要教的時候呼叫） */
export function noteTaught(keys: readonly string[]) {
  if (!keys.length) return
  const now = Date.now()
  for (const k of keys) taught.set(k, now)
  saveTaught()
}

// ── 家長勾選 ─────────────────────────────────────────────────
export async function setUnknown(key: string, on: boolean) {
  if (on) unknown.set(key, Date.now())
  else unknown.delete(key)
  snapshot = new Map(unknown)
  subs.forEach((f) => f())
  await setKV(UNKNOWN_KV, Object.fromEntries(unknown))
}

/** 雲端備份用（lib/sync.ts 的 meta/state） */
export const unknownForSync = () => Object.fromEntries(unknown)

export function useUnknownWords(): ReadonlyMap<string, number> {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => snapshot,
  )
}

/** 自動檢查（scripts/sim-teach.ts）用：模擬家長勾選 */
export function setUnknownNow(key: string, on: boolean) {
  if (on) unknown.set(key, Date.now())
  else unknown.delete(key)
  snapshot = new Map(unknown)
}
