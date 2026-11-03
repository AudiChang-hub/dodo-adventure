// 故事系統的執行期（docs/成長系統設計.md §3、§5.1）。
// 2026-11-02 起（T-77）故事不在冒險裡講了：首頁的「故事」點進去，今天有還沒講完的新章節就先講（todaysStory），講完收進書架。
// 下面說的「冒險」「今天的門」是當初的設計；現在一天一章，用的是同一套選章和記錄的規則。
//
// - 決定今天播哪一章：故事沒開（家長設定「故事（試播）」）→ 今天這扇門的通用章節，冒險和以前一模一樣；
//   開了 → 長篇的下一章（指定今天走哪一扇門），每週一章故事時間（莫莫講經典，照年段挑那一則的版本）。
// - 記錄進度：每天一筆 chapters（id 是日期），念完結尾才算講完；kv.story 記長篇講到哪、講過哪些經典、魔法屋多了什麼。
// - 依主線的旁白：每一站念哪一句由 content/story 的 scriptOf 照排課的主線挑。
// - 依篇快取：今天這一章、這一篇剩下的章、下一篇的語音先補進快取（lib/audio-cache.ts 的 warmAudio），沒網路也講得完。
//
// 故事永遠聽排課的：這裡只決定故事和今天走哪一扇門（門只決定題目裡出現什麼東西），不改排了哪些遊戲。
import { db, getKV, setKV, today, type Chapter as ChapterRow } from './db'
import { getSettings } from './settings'
import { fnv1a } from './hash'
import { warmAudio } from './audio-cache'
import { playable } from './review'
import { clipName } from './clip'
import { line, segments, hasLine } from '../content/lines'
import { ARCS, CLASSICS, EVERGREEN, arcOf, arcsOfPart, chapterLines, chapterOf, classicDoneKey, classicFor, classicOfChapter, evergreenOf, houseItem, scriptOf, type Arc, type Chapter, type Pic, type Script } from '../content/story'
import type { Band } from '../content/growth'
import type { ThemeId } from '../content/themes'

/** kv.story（§5.1）：長篇講到哪一篇的第幾章、孩子的選擇、講過的經典、魔法屋多的東西（只會變多） */
export interface StoryState {
  part: number
  arc: string
  /** 這一篇下一個要講的是第幾章（0 起算） */
  next: number
  choices: Record<string, string>
  /** 講完的故事時間：本來那一版記編號（A01），長大版加年段（B01@middle，見 classicDoneKey） */
  classicsDone: string[]
  house: string[]
}

const KV = 'story'
const START: StoryState = { part: 1, arc: ARCS[0]?.id ?? '', next: 0, choices: {}, classicsDone: [], house: [] }

export async function storyState(): Promise<StoryState> {
  return { ...START, ...(await getKV<Partial<StoryState>>(KV, {})) }
}

export const storyOn = () => getSettings().story

/**
 * 孩子的年段：只做 3 歲（2026-10-31 家長決定），固定小班段。
 * 原本照家長設定的生日算（lib/growth.ts，T-76 第 3 層拿掉）；故事時間的「長大版」、雲端的章節紀錄還用這個欄位。
 */
const BAND: Band = 'small'

// ── 決定今天播哪一章 ─────────────────────────────────────────

/** 星期幾（0 是星期日）；date 是 YYYY-MM-DD */
const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}
/** 這一週（星期一開始）的星期一 */
function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const back = (weekday(date) + 6) % 7
  return today(new Date(y, m - 1, d - back))
}

/** 故事時間在一週的後半（星期四到星期日）講，這一週還沒講過才講：一週一章（§3.6.3） */
const CLASSIC_FROM_WEEKDAY = 4

/** 這一週講過故事時間了沒（有排就算，沒講完的那一章下一次排冒險不會再排一次） */
async function classicThisWeek(date: string): Promise<boolean> {
  const rows = await db.chapters.where('date').between(mondayOf(date), date, true, true).toArray()
  return rows.some((r) => r.kind === 'classic' && r.date !== date)
}

/** 長篇現在講到的那一篇和那一章；這一篇講完了往下一篇；整部都講完了回傳 null（之後用通用章節） */
function epicAt(st: StoryState): { arc: Arc; chapter: Chapter } | null {
  const arcs = arcsOfPart(st.part)
  let i = Math.max(0, arcs.findIndex((a) => a.id === st.arc))
  let next = st.arc === arcs[i]?.id ? st.next : 0
  while (arcs[i] && next >= arcs[i].chapters.length) {
    i++
    next = 0
  }
  if (!arcs[i]) return null
  // 下一章還沒通過審稿（或被退回）：先講通用章節，等家長通過再接著講
  const chapter = arcs[i].chapters[next]
  return playable(chapter) ? { arc: arcs[i], chapter } : null
}

/**
 * 下一則要講的故事時間（照 CLASSICS 第一輪的順序、孩子的年段挑版本）；講過的不再講，長大之後可以講長大版。
 * 都講過了回傳 null
 */
export function nextClassic(st: Pick<StoryState, 'classicsDone'>, band: Band = BAND): Chapter | null {
  for (const c of CLASSICS) {
    const ch = classicFor(c, band)
    // 審稿佇列裡的故事時間要家長通過才講（lib/review.ts）
    if (!st.classicsDone.includes(classicDoneKey(c, ch)) && playable(ch)) return ch
  }
  return null
}

/**
 * 今天要講的新章節（todaysStory 呼叫；名字是冒險還在時留下來的）。故事沒開回傳 null（講一扇門的通用章節）。
 * 長篇的章指定今天走哪一扇門；故事時間沒有門。
 */
export async function chapterForNewPlan(date: string): Promise<Chapter | null> {
  if (!storyOn()) return null
  const st = await storyState()
  if (weekday(date) >= CLASSIC_FROM_WEEKDAY || weekday(date) === 0) {
    const c = nextClassic(st)
    if (c && !(await classicThisWeek(date))) return c
  }
  return epicAt(st)?.chapter ?? null
}

/** 今天上場的朋友（孵出來的朋友裡依日期固定挑一位；沒有朋友是 null，朋友的句子換成通用句） */
export async function friendFor(date: string): Promise<string | null> {
  const fs = (await db.friends.toArray()).map((f) => f.id).sort()
  return fs.length ? fs[parseInt(fnv1a(`friend|${date}`), 36) % fs.length] : null
}

// ── 記錄進度 ─────────────────────────────────────────────────

/** 存在 chapters 裡的念法：故事書重聽時照這份念（依主線挑過、朋友換過的那一版） */
export interface ToldBeat {
  k: string
  pic?: Pic
}

/** chapters 的一筆再多記幾個欄位（不建索引）：哪一章、今天的門、念了哪些句子 */
export interface ToldChapter extends ChapterRow {
  ref: string
  door?: string
  script: ToldBeat[]
}

const toldBeats = (s: Script): ToldBeat[] =>
  [...s.title, ...s.intro, ...s.stops.flat(), ...s.finale, ...s.end].map((x) => (x.pic ? { k: x.key, pic: x.pic } : { k: x.key }))

/** 講故事的那一天：日期（chapters 的 id）和今天的門（通用章節用；以前是冒險的 Plan） */
export interface StoryDay {
  date: string
  theme?: ThemeId
}

/** 開始講今天這一章：記一筆還沒講完的；同一天再進來不重記 */
export async function startChapter(plan: StoryDay, s: Script): Promise<void> {
  const id = plan.date
  const had = (await db.chapters.get(id)) as ToldChapter | undefined
  if (had?.ref === s.chapter.id) return
  const ch = s.chapter
  const row: ToldChapter = {
    id,
    date: plan.date,
    part: ch.part,
    arc: ch.arc,
    chapter: ch.chapter,
    kind: ch.kind,
    band: BAND,
    picks: { words: [], friends: [...new Set(s.intro.concat(...s.stops, s.end).filter((x) => x.who === 'friend').map((x) => x.pic!))], stickers: [], drawings: [] },
    choices: {},
    done: false,
    synced: 0,
    ref: ch.id,
    ...(plan.theme ? { door: plan.theme } : {}),
    script: toldBeats(s),
  }
  if (ch.faith) row.faith = ch.faith
  await db.chapters.put(row)
}

/** 同一天的「講完了」只算一次：結尾念完、孵蛋畫面、按返回離開都會呼叫，同時呼叫也只往下一章一次 */
const finishing = new Map<string, Promise<string | null>>()

/**
 * 這一章講完了（結尾念完；孩子在結尾按返回離開也算，故事已經講到最後）。
 * 長篇往下一章；這一篇講完了，魔法屋多一樣東西。回傳這次魔法屋多的東西（之前就講完了是 null）
 */
export function finishChapter(plan: StoryDay, s: Script): Promise<string | null> {
  const k = `${plan.date}|${s.chapter.id}`
  let p = finishing.get(k)
  if (!p) finishing.set(k, (p = finish(plan, s)))
  return p
}

async function finish(plan: StoryDay, s: Script): Promise<string | null> {
  const row = (await db.chapters.get(plan.date)) as ToldChapter | undefined
  if (!row || row.ref !== s.chapter.id) await startChapter(plan, s)
  if (row?.done) return null
  return finishCore(plan.date, s.chapter)
}

/** 記成講完、長篇往下一章（finishChapter、finishTold 共用） */
async function finishCore(date: string, ch: Chapter): Promise<string | null> {
  await db.chapters.update(date, { done: true, synced: 0 })
  const st = await storyState()
  let added: string | null = null
  if (ch.kind === 'classic') {
    const c = classicOfChapter(ch.id)
    const k = c && classicDoneKey(c, ch)
    if (k && !st.classicsDone.includes(k)) st.classicsDone = [...st.classicsDone, k]
  } else if (ch.kind === 'epic') {
    const arc = arcOf(ch.arc)
    if (arc && st.arc === arc.id && arc.chapters[st.next]?.id === ch.id) st.next++
    else if (arc) {
      // 講的不是記著的那一章（例如兩台裝置）：照講到的這一章往後
      st.arc = arc.id
      st.next = arc.chapters.findIndex((c) => c.id === ch.id) + 1
    }
    const done = arc && st.next >= arc.chapters.length
    const item = ch.houseAdds ?? (done ? arc?.houseAdds : undefined)
    if (item && houseItem(item) && !st.house.includes(item)) {
      st.house = [...st.house, item]
      added = item
    }
    if (done && arc) {
      const arcs = arcsOfPart(st.part)
      const nx = arcs[arcs.findIndex((a) => a.id === arc.id) + 1]
      if (nx) {
        st.arc = nx.id
        st.next = 0
      }
    }
  }
  await setKV(KV, st)
  return added
}

/**
 * 已經記下來的一章講完了（故事書講今天的新章節用：中途離開、下次再進來接著講，這時手上只有存下來的那一筆）。
 * 同一章只算一次；回傳魔法屋多的東西（同 finishChapter）
 */
export function finishTold(row: ToldChapter): Promise<string | null> {
  const ch = chapterOf(row.ref)
  if (!ch) return Promise.resolve(null)
  const k = `${row.date}|${ch.id}`
  let p = finishing.get(k)
  if (!p)
    finishing.set(
      k,
      (p = (async () => {
        const now = (await db.chapters.get(row.id)) as ToldChapter | undefined
        return now?.done ? null : finishCore(row.id, ch)
      })()),
    )
  return p.then((x) => (setKV(AT_KV, null), x))
}

// ── 故事時間：首頁的「故事」（T-77）────────────────────────────

/** 今天的新章節講到第幾句（中途離開，下次進來從這一句接著講） */
const AT_KV = 'story.at'

export const toldAt = async (date: string) => {
  const a = await getKV<{ date: string; at: number } | null>(AT_KV, null)
  return a?.date === date ? a.at : 0
}
export const saveToldAt = (date: string, at: number) => setKV(AT_KV, { date, at })

/**
 * 沒有長篇、故事時間可以講的日子講哪一扇門的通用章節：還沒講過的門先講（照日期輪），12 扇都講過了照日期輪。
 * 第一次打開 App 的那天也是從這裡（或長篇的第一章）開始，所以書架一定有書。
 */
async function evergreenDoor(date: string): Promise<ThemeId> {
  const doors = Object.keys(EVERGREEN) as ThemeId[]
  const told = new Set(((await db.chapters.toArray()) as ToldChapter[]).filter((r) => r.done).map((r) => r.ref))
  const fresh = doors.filter((d) => !told.has(EVERGREEN[d].id))
  const pool = fresh.length ? fresh : doors
  return pool[parseInt(fnv1a(`door|${date}`), 36) % pool.length]
}

/**
 * 今天的新章節（故事書一打開就先講）：
 * - 今天已經記了一章：講完了回傳 null（直接進書架）；還沒講完就是那一章（中途離開過，接著講）。
 * - 還沒有：照原本的規則挑（一週一章故事時間、長篇的下一章；家長在故事審稿通過的才講），都沒有就講一扇門的通用章節，
 *   記一筆還沒講完的，回傳它。
 */
export async function todaysStory(date = today()): Promise<ToldChapter | null> {
  const had = (await db.chapters.get(date)) as ToldChapter | undefined
  if (had && Array.isArray(had.script) && had.script.length) return had.done ? null : had
  let ch = await chapterForNewPlan(date)
  const door: ThemeId = ch?.door ?? (await evergreenDoor(date))
  ch ??= evergreenOf(door)
  const s = scriptOf(ch, { tracks: [], friend: await friendFor(date), door })
  if (!s) return null
  const day: StoryDay = { date, theme: door }
  await startChapter(day, s)
  warmStory(s)
  return ((await db.chapters.get(date)) as ToldChapter | undefined) ?? null
}

/** 我的故事書：講完的章節（新的在前）。同一章講過好幾次只留最近的一次 */
export async function toldChapters(): Promise<ToldChapter[]> {
  const rows = (await db.chapters.toArray()) as ToldChapter[]
  const seen = new Set<string>()
  return rows
    .filter((r) => r.done && Array.isArray(r.script) && r.script.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .filter((r) => (seen.has(r.ref) ? false : (seen.add(r.ref), true)))
}

// ── 依篇快取 ─────────────────────────────────────────────────

const filesOf = (keys: string[]) =>
  keys.filter(hasLine).flatMap((k) => {
    const l = line(k)
    return segments(l).map((x) => `${clipName(l, x)}.mp3`)
  })

/**
 * 今天這一章、這一篇剩下的章、下一篇的語音先存進快取（全部語音也會在背景慢慢補齊，這裡只是讓這幾章先到）。
 * 第一次打開、還在補全部語音的時候斷網，也能把今天這一篇講完。
 */
export function warmStory(s: Script) {
  const ch = s.chapter
  const keys = new Set([...s.title, ...s.intro, ...s.stops.flat(), ...s.finale, ...s.end].map((x) => x.key))
  const arc = arcOf(ch.arc)
  if (arc) {
    const i = arc.chapters.findIndex((c) => c.id === ch.id)
    const arcs = arcsOfPart(arc.part)
    const nx = arcs[arcs.findIndex((a) => a.id === arc.id) + 1]
    for (const c of [...arc.chapters.slice(i + 1), ...(nx?.chapters ?? [])].filter(playable)) for (const [k] of chapterLines(c)) keys.add(k)
  }
  void warmAudio(filesOf([...keys]))
}
