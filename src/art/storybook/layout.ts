// 故事插畫的「擺法」（T-119）：一頁 960×600，場景＋最多 3 個角色站在左、中、右。只有資料和算位置的純函式，
// 畫面在 ./Page.tsx；scripts/check-story.ts 用 problemsOf 檢查每週新劇本的擺法。
import { BY_EMOJI, ITEMS, poseOf } from './meta'

export const PAGE_W = 960
export const PAGE_H = 600

/** 場景（背景）：天空、地面和一兩樣固定的東西 */
export const SCENES = {
  park: '公園（有跑道）',
  meadow: '草地（沒有跑道）',
  city: '城市',
  valley: '恐龍谷',
  farm: '農場',
  sea: '海上',
  beach: '海邊沙灘',
  rain: '下雨天',
  market: '水果市場',
  zoo: '動物園',
  site: '工地',
  bedroom: '晚上的房間',
  party: '生日派對',
  home: '魔法屋的客廳',
  'ark-in': '方舟裡面',
} as const
export type SceneId = keyof typeof SCENES

/** 章節的場景（themes 的 SceneKind）→ 插畫的場景：night 是晚上的房間，沒有對應的用草地 */
export const sceneOf = (kind: string | undefined): SceneId => (kind === 'night' ? 'bedroom' : kind && kind in SCENES ? (kind as SceneId) : 'meadow')

/** 站的位置：左、左中、中、右中、右 */
export type Slot = 'L' | 'LC' | 'C' | 'RC' | 'R'
export type Size = 'S' | 'M' | 'L'

/** 擺法裡的一個角色或東西 */
export interface Cast {
  /** 角色庫的 id（meta.ts）；角色庫沒有的新角色寫新的 id，加上 emoji（先用 Fluent Emoji 代替） */
  who: string
  pose?: string
  at: Slot
  size?: Size
  /** 面向左邊（預設面向右邊） */
  flip?: boolean
  /** 兩隻一樣的並排（挪亞方舟的「兩隻兩隻」）：算一組 */
  two?: boolean
  /** 坐在它上面、裝在它裡面的小東西（蛋坐公車、蛋在籃子裡） */
  with?: string
  /** 角色庫還沒有的新角色：先畫這個 Fluent Emoji */
  emoji?: string
}

/** 一頁的擺法 */
export interface PageArt {
  scene: SceneId
  /** 前景的角色和東西（地上、水裡、天上） */
  cast: Cast[]
  /** 畫在角色後面的大東西（大樹、拱門、方舟）：不算角色數、可以跟角色疊在一起 */
  back?: Cast[]
}

const SLOT_X: Record<Slot, number> = { L: 170, LC: 330, C: 480, RC: 630, R: 790 }
/** 各場景角色腳底的高度（地面、海面、室內地板） */
const GROUND_Y: Record<SceneId, number> = {
  park: 520,
  meadow: 520,
  city: 530,
  valley: 520,
  farm: 520,
  sea: 470,
  beach: 540,
  rain: 520,
  market: 530,
  zoo: 520,
  site: 525,
  bedroom: 540,
  party: 540,
  home: 540,
  'ark-in': 540,
}
const WATER_Y = 580
const SKY_Y: Record<Slot, number> = { L: 250, LC: 240, C: 250, RC: 240, R: 250 }
/** 目標高度：角色、東西各三種大小 */
const HEIGHT = { char: { S: 160, M: 220, L: 300 }, thing: { S: 120, M: 190, L: 270 } }
/** 在平板上至少要多高（準則 TOUCH-1、FRAME：約 2 公分；頁面在平板上是 975/960 倍） */
export const MIN_CHAR_H = 120

export interface Placed {
  cast: Cast
  /** 角色庫的 id；null 是角色庫沒有、畫 emoji */
  id: string | null
  pose: string
  /** 左上角、縮放、畫出來的寬高（一組兩隻的是兩隻加起來） */
  x: number
  y: number
  k: number
  w: number
  h: number
  back: boolean
  /** 坐在上面的小東西 */
  rider?: { id: string | null; who: string; x: number; y: number; k: number; w: number; h: number }
}

const EMOJI_BOX = { w: 200, h: 200 }

/** 一個角色在這一頁的位置和大小（others：同一頁地上幾樣東西，越多每樣能佔的寬度越小） */
function place(c: Cast, scene: SceneId, others: number, back: boolean): Placed {
  const id = ITEMS[c.who] ? c.who : (BY_EMOJI[c.who] ?? null)
  const it = id ? ITEMS[id] : null
  const p = id ? poseOf(id, c.pose)! : { name: 'stand', box: EMOJI_BOX }
  const kind = it?.kind ?? 'char'
  const zone = it?.zone === 'water' && scene !== 'sea' ? 'ground' : (it?.zone ?? 'ground')
  const size = c.size ?? 'M'
  const pair = c.two ? 1.55 : 1
  // 一頁地上有好幾樣：左、中、右各分到的寬度（L 15～325、C 330～630、R 635～945 不會疊）
  const maxW = back ? 640 : others <= 1 ? 760 : c.at === 'C' ? 300 : c.at === 'LC' || c.at === 'RC' ? 280 : 310
  let k = HEIGHT[kind][size] / p.box.h
  if (zone === 'sky') k = ({ S: 110, M: 160, L: 240 } as const)[size] / Math.max(p.box.h, p.box.w * 0.5)
  k = Math.min(k, maxW / (p.box.w * pair))
  const w = p.box.w * k * pair
  const h = p.box.h * k
  const cx = SLOT_X[c.at]
  const foot = zone === 'sky' ? SKY_Y[c.at] : zone === 'water' ? WATER_Y : GROUND_Y[scene]
  // 靠邊的大東西（方舟、大樹）不超出畫面：往裡面推
  const x = Math.min(Math.max(cx - w / 2, 8), PAGE_W - 8 - w)
  const placed: Placed = { cast: c, id, pose: p.name, x, y: foot - h, k, w, h, back }
  if (c.with) {
    const rid = ITEMS[c.with] ? c.with : (BY_EMOJI[c.with] ?? null)
    const rb = rid ? poseOf(rid)!.box : EMOJI_BOX
    const seat = it?.seat ?? [p.box.w / 2, p.box.h * 0.35]
    const rk = (h * 0.5) / rb.h
    const sx = placed.x + seat[0] * k
    const sy = placed.y + seat[1] * k
    placed.rider = { id: rid, who: c.with, x: sx - (rb.w * rk) / 2, y: sy - rb.h * rk, k: rk, w: rb.w * rk, h: rb.h * rk }
  }
  return placed
}

/** 一頁所有東西的位置（先畫後面的大東西，再畫前景） */
export function layout(art: PageArt): Placed[] {
  const ground = art.cast.filter((c) => (ITEMS[c.who]?.zone ?? 'ground') !== 'sky').length
  return [...(art.back ?? []).map((c) => place(c, art.scene, 1, true)), ...art.cast.map((c) => place(c, art.scene, ground, false))]
}

/** 擺法有什麼問題（每週新劇本、手寫的章節都檢查）：角色太多、太小、互相重疊、超出畫面、不認得的角色 */
export function problemsOf(art: PageArt): { blocking: string[]; newChars: string[] } {
  const blocking: string[] = []
  const newChars: string[] = []
  if (!(art.scene in SCENES)) blocking.push(`場景 ${art.scene} 不存在（只有 ${Object.keys(SCENES).join('、')}）`)
  for (const c of [...art.cast, ...(art.back ?? [])]) {
    const id = ITEMS[c.who] ? c.who : BY_EMOJI[c.who]
    if (!id) {
      if (c.emoji) newChars.push(c.who)
      else blocking.push(`${c.who} 不在角色庫裡（新角色要加 emoji，先用 Fluent Emoji 代替）`)
    } else if (c.pose && !ITEMS[id].poses[c.pose]) blocking.push(`${c.who} 沒有 ${c.pose} 這個姿勢（只有 ${Object.keys(ITEMS[id].poses).join('、')}）`)
    if (c.with && !ITEMS[c.with] && !BY_EMOJI[c.with]) blocking.push(`${c.with} 不在角色庫裡`)
  }
  const chars = art.cast.filter((c) => (ITEMS[c.who] ?? ITEMS[BY_EMOJI[c.who] ?? ''])?.kind !== 'thing')
  if (chars.length > 3) blocking.push(`一頁最多 3 個角色（準則 LOAD-1），現在 ${chars.length} 個`)
  if (art.cast.length > 4) blocking.push(`一頁前景最多 4 樣東西，現在 ${art.cast.length} 樣`)
  if (!art.cast.length) blocking.push('這一頁沒有角色也沒有東西')
  const ps = layout(art).filter((p) => !p.back)
  for (const p of ps) {
    const it = p.id ? ITEMS[p.id] : null
    if ((it?.kind ?? 'char') === 'char' && p.h < MIN_CHAR_H) blocking.push(`${p.cast.who} 太小（${Math.round(p.h)}，至少 ${MIN_CHAR_H}）`)
    if (p.x < -2 || p.x + p.w > PAGE_W + 2 || p.y < -2) blocking.push(`${p.cast.who} 超出畫面`)
  }
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]
      const b = ps[j]
      // 留 6 的空隙：腳、尾巴碰在一起可以，身體不能疊
      const ov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 6 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 6
      if (ov) blocking.push(`${a.cast.who} 和 ${b.cast.who} 疊在一起（換一個位置：L、LC、C、RC、R）`)
    }
  return { blocking, newChars }
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z-]/g, '')

/**
 * 念到哪個字時誰跳一下：句子的第幾個字 → 擺法裡第幾個（cast 的位置）。
 * 字跟角色庫的 words 比（不分大小寫、複數 s 也算）；一個角色只跳第一次念到的那個字。
 */
export function hopsOf(en: string, art: PageArt): { word: number; cast: number }[] {
  const words = en.replace(/\|/g, ' ').split(/\s+/).filter(Boolean).map(norm)
  const out: { word: number; cast: number }[] = []
  art.cast.forEach((c, j) => {
    const id = ITEMS[c.who] ? c.who : BY_EMOJI[c.who]
    const rid = c.with ? (ITEMS[c.with] ? c.with : BY_EMOJI[c.with]) : null
    // 坐在上面的小東西（蛋坐公車）念到它也算：整組跳一下
    const names = [...(id ? ITEMS[id].words : [c.who]), ...(rid ? ITEMS[rid].words : [])]
    const i = words.findIndex((w) => names.some((n) => w === n || w === `${n}s` || w === `${n}es`))
    if (i >= 0) out.push({ word: i, cast: j })
  })
  return out
}

/**
 * 沒有寫擺法的句子（舊劇本只寫 pic）：用 pic 自動排一頁。`a+b` 的第一張大的在中間，第二張靠右；
 * 角色庫有的換成手繪的，沒有的畫 Fluent Emoji。
 */
export function fromPic(pic: string | undefined, scene: SceneId): PageArt | null {
  if (!pic) return null
  const parts = pic.split('+').filter(Boolean)
  const ids = parts.map((p) => (ITEMS[p] ? p : BY_EMOJI[p]))
  // 房子一律蓋在草地上；海上的場景只有水裡的、船才放在海上，其他放到沙灘（不會有房子浮在海上）
  if (ids.some((id) => id === 'house' || id === 'new-house' || id === 'frame')) scene = 'meadow'
  else if (scene === 'sea' && ids.some((id) => !id || (ITEMS[id].zone !== 'water' && ITEMS[id].zone !== 'sky' && id !== 'sailboat' && id !== 'ark'))) scene = 'beach'
  const cast: Cast[] = parts.map((p, i) => {
    const two = p.startsWith('@two-')
    const who = two ? p.slice(5) : p
    const id = ITEMS[who] ? who : BY_EMOJI[who]
    return { who: id ?? who, at: parts.length === 1 ? 'C' : i === 0 ? 'LC' : 'R', size: parts.length === 1 ? 'L' : 'M', two, ...(id ? {} : { emoji: who }) }
  })
  return { scene, cast }
}

/**
 * 照語音的逐字時間（public/audio/timings.json，[開始毫秒, 結束毫秒, 字]）算出誰在第幾毫秒跳一下：
 * hopsOf 找到句子裡的第幾個字，再到時間資料裡依序找同一個字（不分大小寫、去掉標點）。找不到時間的字不跳。
 */
export function hopTimes(en: string, art: PageArt, words: readonly (readonly [number, number, string])[]): { cast: number; ms: number }[] {
  const toks = en.replace(/\|/g, ' ').split(/\s+/).filter(Boolean).map(norm)
  const ws = words.map((w) => norm(w[2]))
  return hopsOf(en, art).flatMap((h) => {
    // 句子裡前面出現過幾次同一個字（同一個字念兩次時找對的那一次）
    const nth = toks.slice(0, h.word).filter((t) => t === toks[h.word]).length
    let seen = -1
    const i = ws.findIndex((w) => w === toks[h.word] && ++seen === nth)
    return i >= 0 ? [{ cast: h.cast, ms: words[i][0] }] : []
  })
}
