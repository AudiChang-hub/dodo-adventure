// 故事的目錄：部、季、篇、故事時間，以及「這一章今天實際要念哪些句子」（純函式，排課的結果傳進來）。
// 決定今天播哪一章、記錄進度在 lib/story.ts；台詞在 lines.ts 產生；畫面在 screens/Adventure.tsx、StoryBook.tsx。
//
// 第一批正式故事由 G-9、G-11 產生。現在只有示範：第一部第 1 篇〈彩虹蛋滾進來了〉、故事時間 A01 龜兔賽跑、B01 挪亞方舟。
import type { Speaker } from '../registry'
import { theme, type ThemeId } from '../themes'
import type { TrackId } from '../tracks'
import { EVERGREEN, doorStop, lookOf } from './evergreen'
import { A01 } from './part1/a01'
import { RABBIT_TURTLE } from './classics/a01'
import { NOAH } from './classics/b01'
import { artParts } from './art'
import type { Band } from '../growth'
import { HOUSE_ITEMS } from './house'
import type { Arc, Beat, Chapter, ChapterLook, Classic, Part, Pic, Who } from './types'

export type * from './types'
export { EVERGREEN, doorStop, lookOf } from './evergreen'
export { HOUSE_ITEMS, ROOMS, houseItem, type HouseItem, type Room, type RoomId } from './house'

export const ARCS: Arc[] = [A01]

export const PARTS: Part[] = [
  {
    no: 1,
    title: 'Hello, Rainbow Egg',
    zh: '哈囉，彩虹蛋',
    band: 'small',
    seasons: [{ id: 'p1-s1', zh: '紅點', arcs: ['p1-a01'] }],
  },
]

/**
 * 故事時間第一輪的順序（故事世界 §5.4 小班段第一輪）：龜兔賽跑 → 兔子與月亮 → 獅子與老鼠 → 挪亞方舟 → …
 * 還沒有劇本的（J02、A02 等 G-11 產生）先跳過，輪到下一則有劇本的；之後加進來，照這個順序排在還沒講的前面。
 */
export const CLASSIC_ROUND = ['A01', 'J02', 'A02', 'B01', 'A04', 'P01', 'A06', 'C01'] as const

const WRITTEN: Classic[] = [RABBIT_TURTLE, NOAH]

/** 有劇本的故事時間，照講的順序 */
export const CLASSICS: Classic[] = CLASSIC_ROUND.map((id) => WRITTEN.find((c) => c.id === id)).filter((c): c is Classic => !!c)

/** 這一則照年段挑的那一版：沒有這個年段的長大版，就用比較小的年段裡最大的那一版 */
export function classicFor(c: Classic, band: Band): Chapter {
  if (band === 'big') return c.grown?.big ?? c.grown?.middle ?? c.chapter
  if (band === 'middle') return c.grown?.middle ?? c.chapter
  return c.chapter
}

/** kv.story 的 classicsDone 記的名字：本來那一版是編號（A01），長大版加年段（B01@middle），長大之後還能再講一次長大版 */
export const classicDoneKey = (c: Classic, ch: Chapter) => (ch.id === c.chapter.id ? c.id : `${c.id}@${ch.band}`)

/** 這一則的每一個年段的版本 */
export const classicVersions = (c: Classic): Chapter[] => [c.chapter, ...Object.values(c.grown ?? {}).filter((x): x is Chapter => !!x)]

/** 這一章是哪一則故事時間（每個年段的版本都算） */
export const classicOfChapter = (id: string) => CLASSICS.find((c) => classicVersions(c).some((x) => x.id === id)) ?? null

export const arcOf = (id: string) => ARCS.find((a) => a.id === id) ?? null

const ALL: Chapter[] = [...Object.values(EVERGREEN), ...ARCS.flatMap((a) => a.chapters), ...CLASSICS.flatMap(classicVersions)]
export const allChapters = () => ALL
export const chapterOf = (id: string | null | undefined): Chapter | null => (id ? (ALL.find((c) => c.id === id) ?? null) : null)
export const evergreenOf = (door: ThemeId) => EVERGREEN[door]

/** 部裡的篇，照順序（季的順序 → 季裡的順序） */
export const arcsOfPart = (no: number): Arc[] =>
  (PARTS.find((p) => p.no === no)?.seasons ?? []).flatMap((s) => s.arcs).map(arcOf).filter((a): a is Arc => !!a)

/** 章的畫面：有門的用門的樣子，故事時間用書的樣子 */
export function chapterLook(ch: Chapter, fallbackDoor?: ThemeId | null): ChapterLook | null {
  if (ch.look) return ch.look
  const t = theme(ch.door ?? fallbackDoor)
  return t ? lookOf(t) : null
}

// ── 今天實際要念的句子 ─────────────────────────────────────────

/** 要念的一句：台詞 key（registry）＋畫面 */
export interface Said {
  key: string
  speaker: Speaker
  who: Who
  pic?: Pic
}

/** 一章展開成冒險的每一段 */
export interface Script {
  chapter: Chapter
  look: ChapterLook
  /** 路線圖上念的標題（故事時間沒有，書名只寫在標題卡上） */
  title: Said[]
  /** 開場：長篇、故事時間在魔法屋念（開門之前）；通用章節在路線圖上、標題之後念 */
  intro: Said[]
  /** 每一站之前的那一段（依站的順序） */
  stops: Said[][]
  /** 到了故事終點念的（通用章節：門原本的結尾） */
  finale: Said[]
  /** 回到魔法屋念的結尾（通用章節沒有） */
  end: Said[]
}

/** 開場在魔法屋念（長篇、故事時間）；通用章節沒有魔法屋那一段 */
export const opensAtHome = (ch: Chapter) => ch.kind !== 'evergreen'

/** 這一句是誰的聲音：彩虹蛋用豆豆的聲音；大家一起說用今天主持的恐龍；朋友的通用句也是主持的恐龍 */
export function voiceOf(who: Who, host: Speaker): Speaker {
  if (who === 'dodo' || who === 'bobo' || who === 'momo') return who
  if (who === 'egg') return 'dodo'
  return host
}

/** 一句的 key：有寫就用（通用章節沿用主題的 key），沒寫就由章節 id 和位置組出來 */
export const beatKey = (ch: Chapter, slot: string, i: number, b: Beat) => b.key ?? `story.${ch.id}.${slot}.${i}`

/** 這一章所有要產生的台詞：[key, 說話的人, 英文]（lines.ts 用；依主線的每一版、朋友的通用句都算） */
export function chapterLines(ch: Chapter): [string, Speaker, string][] {
  const look = chapterLook(ch)
  const host: Speaker = look?.host ?? 'dodo'
  const out: [string, Speaker, string][] = []
  const add = (slot: string, bs: Beat[] | undefined) => bs?.forEach((b, i) => out.push([beatKey(ch, slot, i, b), voiceOf(b.who, host), b.en]))
  if (ch.title) add('title', [ch.title])
  add('intro', ch.intro)
  const door = theme(ch.door)
  // 門原本的 5 站旁白（null 的站）：key 是 theme.<門>.stop.<i>，和通用章節共用
  if (door) for (let n = 0; n < 5; n++) if (!ch.stops[n]) add(`door.${n}`, [doorStop(door, n)])
  ch.stops.forEach((s, n) => {
    if (!s) return
    add(`stop.${n}`, s.generic)
    for (const t of ['lang', 'num', 'think', 'hand'] as const) add(`stop.${n}.${t}`, s[t])
  })
  add('finale', ch.finale)
  add('end', ch.end)
  return out
}

export interface ScriptInput {
  /** 每一站練的主線（plan.items 的 track，照站的順序） */
  tracks: readonly (TrackId | undefined)[]
  /** 孩子有的朋友（孵出來的）裡，今天上場的那一位；沒有朋友就是 null，朋友的句子換成通用句 */
  friend?: string | null
  /** 故事時間、沒有門的章節：門的樣子用今天的主題（遊戲內容還是照今天的主題出） */
  door?: ThemeId | null
}

/** 把一章展開成今天實際要念的句子（純函式：同一章、同樣的排課，結果一定一樣） */
export function scriptOf(ch: Chapter, input: ScriptInput): Script | null {
  const look = chapterLook(ch, input.door)
  if (!look) return null
  const door = theme(ch.door ?? input.door)
  const host = look.host
  const said = (slot: string, bs: Beat[] | undefined): Said[] =>
    (bs ?? []).flatMap((b, i): Said[] => {
      const key = beatKey(ch, slot, i, b)
      // 孵出來的朋友：念那位朋友自己的台詞（This is a fox! 和牠的叫聲）；沒有朋友就念通用句
      if (b.who === 'friend' && input.friend)
        return [`friend.name.${input.friend}`, `friend.sound.${input.friend}`].map((k) => ({ key: k, speaker: host, who: 'friend', pic: input.friend! }))
      return [{ key, speaker: voiceOf(b.who, host), who: b.who, pic: b.pic }]
    })
  const n = input.tracks.length || 5
  const slot = (i: number): Said[] => {
    const s = ch.stops[i]
    if (!s) {
      // 門原本的旁白（故事時間沒有門：站比故事的段落多時，那一站只看圖、不念）
      if (!door || ch.look) return []
      return said(`door.${i}`, [doorStop(door, i)])
    }
    const t = input.tracks[i]
    const pick = (t && s[t]) || s.generic
    return said(pick === s.generic ? `stop.${i}` : `stop.${i}.${t}`, pick)
  }
  const stops = Array.from({ length: n }, (_, i) => slot(i))
  // 今天的站比故事的段落少（家長設 2–4 站）：沒講到的故事段落在終點一起講完，故事不會少一段
  const rest = ch.stops.slice(n).flatMap((s, j) => (s ? slot(n + j) : []))
  return {
    chapter: ch,
    look,
    title: said('title', ch.title ? [ch.title] : []),
    intro: said('intro', ch.intro),
    stops,
    finale: [...rest, ...said('finale', ch.finale)],
    end: said('end', ch.end),
  }
}

/** 第 i 站的圖：那一段第一句的圖，沒有就用門（書）原本的那一張 */
export const stopPic = (s: Script, i: number): Pic => s.stops[i]?.find((x) => x.pic)?.pic ?? s.look.stops[Math.min(i, s.look.stops.length - 1)]

/** 故事用到的圖示（scripts/build-emoji.ts 會一起打包；@ 開頭的是故事自己畫的圖） */
export const STORY_ICONS: string[] = [
  ...new Set(
    [
      ...ALL.flatMap((c) => [c.look?.icon, ...(c.look?.stops ?? []), ...(c.look?.finale ?? []), ...chapterPics(c)]),
      ...ARCS.map((a) => a.icon),
      ...HOUSE_ITEMS.map((h) => h.pic),
      // 魔法屋的剖面圖、故事書
      'door', 'open-book', 'closed-book', 'books', 'couch-and-lamp', 'red-apple', 'teddy-bear', 'framed-picture', 'crayon', 'world-map', 'zzz',
      'automobile', 'sport-utility-vehicle', 'bus', 'house-with-garden',
    ]
      .filter((x): x is string => !!x)
      .flatMap((p) => p.split('+'))
      // 故事自己畫的圖裡用到的圖示（@two-elephant 是兩隻大象）也要打包
      .flatMap((p) => (p.startsWith('@') ? (artParts(p) ?? []) : [p])),
  ),
]

function chapterPics(c: Chapter): string[] {
  const bs = [...(c.title ? [c.title] : []), ...c.intro, ...c.stops.flatMap((s) => (s ? [...s.generic, ...(s.lang ?? []), ...(s.num ?? []), ...(s.think ?? []), ...(s.hand ?? [])] : [])), ...(c.finale ?? []), ...c.end]
  return bs.map((b) => b.pic).filter((p): p is string => !!p)
}
