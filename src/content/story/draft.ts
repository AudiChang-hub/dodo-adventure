// 每週自動產生的故事（G-9，docs/成長系統設計.md §3.6.4）：劇本草稿的格式和載入。
//
// 流程：scripts/story-brief.ts 產生寫作簡報 → 寫劇本（AI 或人貼進來）→ scripts/check-story.ts 自動檢查 →
// 產生語音 → scripts/story-weekly.ts 把劇本放進 content/story/weekly/（審稿佇列）→ 家長在家長區「故事審稿」逐章試聽、通過或退回。
// 佇列裡的章節要家長通過（lib/review.ts）才會進孩子端；手寫的示範章節（part1/、classics/）不用審。
//
// 劇本是 JSON（寫的人照 story-brief 的格式寫），這裡只補上每一章都一樣的欄位（kind、part、arc、band、faith），
// 故事時間的開場、結尾沒寫就用固定的兩句（classics/fixed.ts），固定句換成共用的 key（同一個音檔）。
import { fnv1a } from '../../lib/hash'
import { OPEN_BOOK, CLOSE_BOOK } from './classics/fixed'
import type { HouseItem } from './house'
import type { Arc, Beat, Chapter, Classic, StopBeats } from './types'

interface DraftBase {
  /** 第幾版：退回重寫一次加 1（家長的通過記著是哪一版的內容，內容改了要重審） */
  rev: number
  /** 哪一週產生的（那一週星期一的日期 YYYY-MM-DD） */
  week: string
  /** 誰寫的：ai（自動流程）、human（家長或 PM 貼進來的）、sample（範例） */
  by: 'ai' | 'human' | 'sample'
  /** 給家長看：和大綱、原典不一樣的地方，為什麼這樣改（審稿頁顯示） */
  notes?: string[]
  /** 故事裡角色的名字（Rabbit、Noah…）：check-story 不把它們當成「沒學過的字」 */
  cast?: string[]
}

/** 原創長篇的一篇 */
export interface ArcDraft extends DraftBase {
  type: 'arc'
  arc: Arc
  /** 放進哪一季（PARTS 的 season id）；沒寫就放在那一部的最後一季 */
  season?: string
  /** 篇講完魔法屋多的東西（大綱 §4 寫好的；house.ts 沒有的才要寫） */
  house?: HouseItem
}

/** 故事時間的一則 */
export interface ClassicDraft extends DraftBase {
  type: 'classic'
  classic: Classic
}

export type StoryDraft = ArcDraft | ClassicDraft

export const draftId = (d: StoryDraft) => (d.type === 'arc' ? d.arc.id : d.classic.id)
export const draftTitle = (d: StoryDraft) => (d.type === 'arc' ? d.arc.title : d.classic.chapter.look?.title ?? d.classic.id)
export const draftZh = (d: StoryDraft) => (d.type === 'arc' ? d.arc.zh : d.classic.zh)
export const draftChapters = (d: StoryDraft): Chapter[] => (d.type === 'arc' ? d.arc.chapters : [d.classic.chapter])

/** 固定句：寫劇本的人照抄文字就好，這裡換成共用的 key（同一個音檔） */
const FIXED = new Map([...OPEN_BOOK, ...CLOSE_BOOK].map((b) => [b.en, b.key!]))

/** 固定句的中文意思（審稿頁的中英對照；寫劇本的人可以不寫） */
export const FIXED_ZH: Record<string, string> = {
  'Knock, knock! Open, magic door!': '叩叩！魔法門，打開！',
  'Story time! Open the old book.': '故事時間！打開舊書。',
  'Long ago, people told this story.': '很久以前，人們講過這個故事。',
  'The end. Close the old book.': '故事講完了。闔上舊書。',
  'Home to the Magic House.': '回魔法屋囉。',
  'Home to the Magic House!': '回魔法屋囉！',
}

const fixBeat = (b: Beat): Beat => {
  let x = b
  if (!x.key && FIXED.has(x.en)) x = { ...x, key: FIXED.get(x.en) }
  if (!x.zh && FIXED_ZH[x.en]) x = { ...x, zh: FIXED_ZH[x.en] }
  return x
}
const fixBeats = (bs: Beat[] | undefined) => bs?.map(fixBeat)
const fixStop = (s: StopBeats | null): StopBeats | null =>
  s && { generic: fixBeats(s.generic)!, ...Object.fromEntries((['lang', 'num', 'think', 'hand'] as const).filter((t) => s[t]).map((t) => [t, fixBeats(s[t])])) }

function fixChapter(c: Partial<Chapter>, base: Pick<Chapter, 'kind' | 'part' | 'arc' | 'band' | 'faith'>, n: number): Chapter {
  const classic = base.kind === 'classic'
  return {
    ...c,
    id: c.id!,
    kind: base.kind,
    part: base.part,
    arc: base.arc,
    chapter: c.chapter ?? n,
    band: c.band ?? base.band,
    faith: c.faith === undefined ? base.faith : c.faith,
    intro: fixBeats(c.intro?.length ? c.intro : classic ? OPEN_BOOK : [])!,
    stops: (c.stops ?? []).map(fixStop),
    ...(c.finale ? { finale: fixBeats(c.finale) } : {}),
    end: fixBeats(c.end?.length ? c.end : classic ? CLOSE_BOOK : [])!,
  }
}

/** 補上每一章都一樣的欄位（JSON 裡可以省略），回傳新的物件 */
export function normalizeDraft(d: StoryDraft): StoryDraft {
  if (d.type === 'arc') {
    const a = d.arc
    const base = { kind: 'epic' as const, part: a.part, arc: a.id, band: a.band, faith: null }
    return { ...d, arc: { ...a, chapters: a.chapters.map((c, i) => fixChapter(c, base, i + 1)) } }
  }
  const c = d.classic
  const base = { kind: 'classic' as const, part: c.chapter.part ?? 1, arc: 'classic', band: c.band, faith: c.faith ?? null }
  return { ...d, classic: { ...c, faith: c.faith ?? null, chapter: fixChapter(c.chapter, base, 1) } }
}

/**
 * 一章內容的指紋：家長通過時記著這個值；之後內容改了（退回重寫、手改），指紋就不一樣，要重審。
 * 只看會念、會畫出來的內容，家長看的中文意思、版本號改了不用重審。
 */
export function chapterHash(c: Chapter): string {
  const strip = (b: Beat) => [b.who, b.en, b.pic ?? '', b.key ?? '']
  const stop = (s: StopBeats | null) => s && [s.generic.map(strip), ...(['lang', 'num', 'think', 'hand'] as const).map((t) => s[t]?.map(strip) ?? null)]
  return fnv1a(JSON.stringify([c.id, c.door ?? '', c.look ?? null, c.intro.map(strip), c.stops.map(stop), c.finale?.map(strip) ?? null, c.end.map(strip), c.houseAdds ?? '']))
}
