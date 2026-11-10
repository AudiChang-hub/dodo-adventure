// 會動的繪本（T-127 B 案）：一章的頁、每一句誰做什麼動作、單字三明治、第 2 天的停頓點、第 3 天的選圖。只有純函式，
// 畫面在 screens/StoryBook.tsx、screens/story/Act.tsx、Tell.tsx；scripts/story/rules.ts 用 pagesOf 檢查一章最多 6 頁。
//
// 根據（docs/T-127-新鮮感提案.md 第二節）：
// - 動旁白說的那件事（Takacs 2015）：一句只有一個角色做一個慢慢的大動作，做完就停；用位移和換姿勢，不縮放、不彈跳（MOTION-1、2，紙感螢幕）。
// - 互動放在句子和句子之間（Smeets & Bus 2012），念的當下不放熱點。
// - 同一個故事聽 3 天（Horst 2011）：第 1 天看、第 2 天一起演、第 3 天你來說。
import { ITEMS, BY_EMOJI } from '../../art/storybook/meta'
import { PAGE_W, fromPic, hopsOf, layout, sceneOf, type Cast, type PageArt } from '../../art/storybook/layout'
import { artForBeat } from './pages'
import { STORY_NOUNS } from './words'
import type { Chapter } from './types'

/** 一章最多幾頁、一頁最多幾句（FRAME-11 小班段一段 1～3 句） */
export const MAX_PAGES = 6
export const MAX_PER_PAGE = 3

/** 這一天的玩法：第 1 天看、第 2 天一起演、第 3 天你來說 */
export type Mode = 'look' | 'act' | 'tell'
export const modeOfDay = (day: number): Mode => (day >= 3 ? 'tell' : day === 2 ? 'act' : 'look')

const idOf = (c: Cast): string | null => (ITEMS[c.who] ? c.who : (BY_EMOJI[c.who] ?? null))
/** 三隻恐龍：名字不念中文三明治，第 1 天也不問「Where is Dodo?」 */
const DINOS = new Set(['dodo', 'bobo', 'momo'])
const isChar = (c: Cast) => (ITEMS[idOf(c) ?? '']?.kind ?? 'char') === 'char'
const castKey = (c: Cast) => `${idOf(c) ?? c.who}${c.two ? '×2' : ''}`

// ── 頁 ───────────────────────────────────────────────────────

/** 兩句接在一起有多像同一頁：同一個場景 2 分，還有同一個角色再加 1 分 */
function near(a: PageArt, b: PageArt): number {
  if (a.scene !== b.scene) return 0
  const ka = new Set(a.cast.map(castKey))
  return 2 + (b.cast.some((c) => ka.has(castKey(c))) ? 1 : 0)
}

/** key 的段落（story.p1-a01-c1.intro.2 → story.p1-a01-c1.intro）：同一段的句子先放在同一頁 */
const groupOf = (k: string) => (/^story\./.test(k) ? k.replace(/\.\d+$/, '') : k)

/**
 * 一章分成幾頁：每一句是第幾頁（從 0 起算）。一頁是同一張插畫上的 1～3 句，換句子時只有說到的那個角色動（actOf）；換頁才翻頁。
 * 先把同一段、同一個場景的句子放在一起，再把最像的相鄰兩頁併起來，直到不超過 6 頁（併不下去就照實回傳，check-story 會擋）。
 */
export function pagesOf(arts: PageArt[], keys: string[]): number[] {
  let pages: number[][] = []
  arts.forEach((a, i) => {
    const last = pages[pages.length - 1]
    const j = last?.[last.length - 1]
    if (last && last.length < MAX_PER_PAGE && groupOf(keys[j]) === groupOf(keys[i]) && near(arts[j], a) > 0) last.push(i)
    else pages.push([i])
  })
  while (pages.length > MAX_PAGES) {
    let best = -1
    let score = -1
    for (let p = 0; p + 1 < pages.length; p++) {
      const size = pages[p].length + pages[p + 1].length
      if (size > MAX_PER_PAGE) continue
      // 越像越先併；一樣像的，併起來比較短的先
      const s = near(arts[pages[p][pages[p].length - 1]], arts[pages[p + 1][0]]) * 10 + (MAX_PER_PAGE - size)
      if (s > score) {
        score = s
        best = p
      }
    }
    if (best < 0) break
    pages = [...pages.slice(0, best), [...pages[best], ...pages[best + 1]], ...pages.slice(best + 2)]
  }
  const out: number[] = []
  pages.forEach((ps, p) => ps.forEach((i) => (out[i] = p)))
  return out
}

/** 每一頁的第一句是第幾句 */
export const pageStarts = (pageOf: number[]) => pageOf.flatMap((p, i) => (i === 0 || pageOf[i - 1] !== p ? [i] : []))

// ── 這一句誰做什麼動作 ─────────────────────────────────────────

/**
 * 動作（一句只有一個）：
 * - enter：走進來（從背對的那一邊外面走到位置上）
 * - move：從上一句的位置走過去；jump：跳過去（一個弧，不彈跳）
 * - pose：換姿勢（舊的姿勢慢慢淡掉）；sleep：換成睡覺的姿勢，ZZZ 慢慢浮起來
 * - open：門打開（關著的門慢慢淡掉）
 */
export type ActKind = 'enter' | 'move' | 'jump' | 'pose' | 'sleep' | 'open'
export interface Act {
  /** 擺法裡的第幾個（art.cast 的位置） */
  cast: number
  kind: ActKind
  /** 從哪裡開始（相對最後的位置，頁面座標 960×600） */
  dx: number
  dy: number
  /** 換姿勢前的姿勢（pose、sleep、open 用：先畫舊的，慢慢淡掉） */
  fromPose?: string
}

const SLEEPY = /\b(sleep|sleeps|sleepy|nap|night|yawn|zzz)\b/i
const JUMPY = /\b(jump|jumps|hop|hops|over)\b/i
const OPENS = /\b(open|opens|knock)\b/i
/** 會自己開進來的東西（車、船）：念到它也走進來 */
const RIDES = new Set(['bus', 'truck', 'tractor', 'fire-truck', 'police-car', 'sailboat', 'ark'])

/**
 * 這一句誰做什麼動作。prev 是同一頁的上一句（換頁是 null）：
 * 1. 同一頁裡，跟上一句不一樣的（新來的、換位置、換姿勢）就是要動的那一個；有好幾個時，先挑句子說到的。
 * 2. 沒有不一樣的（或是一頁的第一句）：句子說到的角色走進來；說到門、又說打開，門打開；在睡覺就 ZZZ。
 * 都沒有就不動（只有東西、沒有人說到的句子）。
 */
export function actOf(prev: PageArt | null, art: PageArt, en: string): Act | null {
  const now = layout(art).filter((p) => !p.back)
  const named = hopsOf(en, art).map((h) => h.cast)
  const byKey = new Map(prev ? prev.cast.map((c, i) => [castKey(c), i] as const) : [])
  const before = prev ? layout(prev).filter((p) => !p.back) : []
  // 說到門、又說打開（Knock, knock! Open, magic door!）：門打開，比別的都優先
  const door = art.cast.findIndex((c) => idOf(c) === 'door')
  if (door >= 0 && OPENS.test(en)) return { cast: door, kind: 'open', dx: 0, dy: 0, fromPose: 'stand' }
  type Cand = { cast: number; act: Act }
  const cands: Cand[] = []
  if (prev)
    art.cast.forEach((c, j) => {
      const i = byKey.get(castKey(c))
      const id = idOf(c)
      if (i == null) {
        // 新來的角色、車子走進來；新出現的東西（站牌、蛋糕）只是淡淡地出現，不走路
        if (isChar(c) || RIDES.has(id ?? '')) cands.push({ cast: j, act: enterAct(j, art, now) })
        return
      }
      const was = prev.cast[i]
      const wasPose = was.pose ?? Object.keys(ITEMS[id ?? '']?.poses ?? { stand: 0 })[0]
      const pose = now[j].pose
      if (before[i] && was.at !== c.at && Math.abs(before[i].x - now[j].x) > 20) {
        cands.push({ cast: j, act: { cast: j, kind: JUMPY.test(en) ? 'jump' : 'move', dx: before[i].x - now[j].x, dy: before[i].y + before[i].h - (now[j].y + now[j].h) } })
      } else if (wasPose !== pose) {
        cands.push({ cast: j, act: { cast: j, kind: pose === 'sleep' ? 'sleep' : 'pose', dx: 0, dy: 0, fromPose: wasPose } })
      }
    })
  if (cands.length) return (cands.find((x) => named.includes(x.cast)) ?? cands[0]).act
  // 沒有跟上一句不一樣的：照句子說的做
  const sleeper = art.cast.findIndex((c) => now[art.cast.indexOf(c)]?.pose === 'sleep')
  if (sleeper >= 0 && (SLEEPY.test(en) || named.includes(sleeper))) return { cast: sleeper, kind: 'sleep', dx: 0, dy: 0, fromPose: Object.keys(ITEMS[idOf(art.cast[sleeper]) ?? '']?.poses ?? {})[0] }
  const who = named.find((j) => isChar(art.cast[j]) || RIDES.has(idOf(art.cast[j]) ?? '')) ?? (art.cast.length === 1 && isChar(art.cast[0]) ? 0 : -1)
  if (who >= 0) return enterAct(who, art, now)
  // 句子說到的東西（A present!、Here is the cake!）：從下面慢慢升到位置上（不走路）
  const thing = named.find((j) => ITEMS[idOf(art.cast[j]) ?? '']?.zone !== 'sky')
  if (thing != null) return { cast: thing, kind: 'enter', dx: 0, dy: RISE }
  return null
}

/** 東西升上來的距離（頁面座標） */
const RISE = 70

/** 走進來：面向右邊的從左邊外面進來，面向左邊的從右邊；天上的從上面慢慢下來 */
function enterAct(j: number, art: PageArt, now: ReturnType<typeof layout>): Act {
  const p = now[j]
  const sky = ITEMS[idOf(art.cast[j]) ?? '']?.zone === 'sky'
  if (sky) return { cast: j, kind: 'enter', dx: 0, dy: -(p.y + p.h + 20) }
  return { cast: j, kind: 'enter', dx: art.cast[j].flip ? PAGE_W + 20 - p.x : -(p.x + p.w + 20), dy: 0 }
}

/** 一章每一句的動作（同一頁的上一句才算「上一句」） */
export function actsOf(arts: PageArt[], texts: string[], pageOf: number[]): (Act | null)[] {
  return arts.map((a, i) => actOf(i > 0 && pageOf[i - 1] === pageOf[i] ? arts[i - 1] : null, a, texts[i] ?? ''))
}

// ── 單字三明治：每句的主角名詞第一次出現 ─────────────────────────

/** 一句的主角名詞（角色庫的 id）：要動的那一個是句子說到的就是它，不然是句子第一個說到的角色 */
export function nounOf(art: PageArt, en: string, act: Act | null): string | null {
  const named = hopsOf(en, art).map((h) => h.cast)
  const j = act && named.includes(act.cast) ? act.cast : named.find((n) => isChar(art.cast[n])) ?? named[0]
  return j == null ? null : idOf(art.cast[j])
}

/** 主角名詞第一次出現的那一句：第幾句 → 哪個名詞（一章裡同一個名詞只念一次三明治）。canSandwich：這個名詞有沒有中文音檔 */
export function sandwichesOf(arts: PageArt[], texts: string[], acts: (Act | null)[], canSandwich: (id: string) => boolean = () => true): Map<number, string> {
  const seen = new Set<string>()
  const out = new Map<number, string>()
  arts.forEach((a, i) => {
    const n = nounOf(a, texts[i] ?? '', acts[i])
    if (!n || seen.has(n) || DINOS.has(n) || !STORY_NOUNS[n] || !canSandwich(n)) return
    seen.add(n)
    out.set(i, n)
  })
  return out
}

/** 名詞的英文（念的那個字）：角色庫的第一個字 */
export const wordOfItem = (id: string) => ITEMS[id]?.words[0] ?? id

// ── 第 2 天：一起演 ───────────────────────────────────────────

/** 重複的句子（Knock, knock!、Gurgle, gurgle!、Bang, bang!） */
const REPEATED = /\b([a-z]+)\b[\s,!.…-]+\1\b/i

/** 第 2 天在哪幾句之前停下來、讓他點誰（一章最多 3 個） */
export interface ActStop {
  beat: number
  /** 點擺法裡的第幾個 */
  cast: number
}

/** 一章第 2 天停幾次（提案：2～3 個停頓點） */
export const ACT_STOPS = 3

/**
 * 第 2 天的停頓點：在這一句之前停下來，換他點那個角色、東西（門、蛋），他點了才做這一句的動作、念這一句。
 * 要走進來的角色停在畫面邊邊探出頭（peekOf），點得到。先挑重複的句子（Knock, knock!），不夠 3 個再從其他有動作的句子平均挑；
 * 第一句不停（還沒開始聽就要他做事，他不知道在幹嘛）。
 */
export function actStopsOf(texts: readonly string[], acts: (Act | null)[], arts?: readonly PageArt[]): ActStop[] {
  const ok = acts.flatMap((a, i) => (a && i > 0 ? [{ beat: i, cast: a.cast, rep: REPEATED.test(texts[i] ?? '') }] : []))
  const reps = ok.filter((x) => x.rep)
  const pick = reps.slice(0, ACT_STOPS)
  // 不夠的先挑角色、門、車子（點了會走、會開），再挑東西（只是升上來）
  const lively = (x: { beat: number; cast: number }) => {
    const c = arts?.[x.beat]?.cast[x.cast]
    const id = c ? idOf(c) : null
    return !c || isChar(c) || id === 'door' || RIDES.has(id ?? '')
  }
  const rest = ok.filter((o) => !o.rep)
  const more = spread(rest.filter(lively), ACT_STOPS - pick.length)
  pick.push(...more, ...spread(rest.filter((o) => !lively(o)), ACT_STOPS - pick.length - more.length))
  return pick.sort((a, b) => a.beat - b.beat).map(({ beat, cast }) => ({ beat, cast }))
}

/** 第 2 天停下來等他點的時候，要走進來的角色探出頭的位置：只走到一半多一點（身體有 45% 在畫面裡） */
export function peekOf(act: Act, art: PageArt): { dx: number; dy: number } {
  if (act.kind !== 'enter') return { dx: act.dx, dy: act.dy }
  const p = layout(art).filter((x) => !x.back)[act.cast]
  if (!p) return { dx: act.dx, dy: act.dy }
  // 升上來的東西：停在下面一點（看得到、點得到）；從天上下來的：探出下半身
  if (act.dy > 0) return { dx: 0, dy: act.dy }
  if (act.dy) return { dx: 0, dy: -(p.y + p.h * 0.55) }
  return act.dx > 0 ? { dx: PAGE_W - p.w * 0.45 - p.x, dy: 0 } : { dx: -(p.x + p.w * 0.55), dy: 0 }
}

function spread<T>(xs: T[], n: number): T[] {
  if (n <= 0 || !xs.length) return []
  if (xs.length <= n) return xs
  return Array.from({ length: n }, (_, i) => xs[Math.round(((i + 0.5) * xs.length) / n - 0.5)])
}

// ── 第 3 天：你來說 ───────────────────────────────────────────

/** 第 3 天每一頁之前的選圖：對的是下一頁的第一張圖，另一張是別頁的圖（不是上一頁的） */
export interface TellPick {
  /** 這一頁的第一句 */
  beat: number
  /** 兩張圖：第幾句的插畫；answer 是對的那一張的位置（0 或 1） */
  arts: [number, number]
  answer: 0 | 1
}

const sameLook = (a: PageArt, b: PageArt) => a.scene === b.scene && a.cast.map(castKey).sort().join() === b.cast.map(castKey).sort().join()

/**
 * 第 3 天：第 2 頁起每一頁先問 What happens next?，出兩張圖：對的是這一頁的第一張插畫，另一張挑別頁看起來不一樣的插畫
 * （優先挑後面的頁，不挑上一頁，免得「剛剛看過的」變成答案）。對的放左邊還是右邊照頁數輪流。
 */
export function tellPicksOf(arts: PageArt[], pageOf: number[]): TellPick[] {
  const starts = pageStarts(pageOf)
  return starts.slice(1).flatMap((beat, n) => {
    const p = pageOf[beat]
    const later = starts.filter((s) => pageOf[s] > p)
    const earlier = starts.filter((s) => pageOf[s] < p - 1)
    const other = [...later, ...earlier.reverse()].find((s) => !sameLook(arts[s], arts[beat]))
    if (other == null) return []
    const answer = (n % 2) as 0 | 1
    return [{ beat, arts: (answer === 0 ? [beat, other] : [other, beat]) as [number, number], answer }]
  })
}

// ── 第 1 天：最後問一題 ───────────────────────────────────────

/** 第 1 天念完問的一題（Where is the egg?）：問誰、兩張圖（角色庫的 id），answer 是對的那一張的位置 */
export interface LookAsk {
  noun: string
  picks: [string, string]
  answer: 0 | 1
}

/** 這一章說到最多次的角色（一樣多就是先說到的）；另一張是這一章裡別的角色或東西 */
export function lookAskOf(arts: PageArt[], texts: string[]): LookAsk | null {
  const count = new Map<string, number>()
  const order: string[] = []
  arts.forEach((a, i) =>
    hopsOf(texts[i] ?? '', a).forEach((h) => {
      const id = idOf(a.cast[h.cast])
      if (!id) return
      if (!count.has(id)) order.push(id)
      count.set(id, (count.get(id) ?? 0) + 1)
    }),
  )
  // 先問角色（不問三隻恐龍：每天都看得到），沒有角色才問東西
  const rank = (id: string) => (DINOS.has(id) ? 0 : ITEMS[id]?.kind === 'char' ? 2 : 1) * 1000 + (count.get(id) ?? 0)
  const noun = [...order].sort((a, b) => rank(b) - rank(a))[0]
  if (!noun) return null
  const all = [...new Set(arts.flatMap((a) => a.cast.map(idOf)).filter((x): x is string => !!x && x !== noun && ITEMS[x]?.zone !== 'sky'))]
  const other = all.find((x) => ITEMS[x].kind === 'char') ?? all[0]
  if (!other) return null
  const answer = (noun.length % 2) as 0 | 1
  return { noun, picks: answer === 0 ? [noun, other] : [other, noun], answer }
}

// ── 一章全部算好 ─────────────────────────────────────────────

/** 一章（念的那一版）每一句的插畫、頁、動作、三明治、第 2 天的停頓點、第 3 天的選圖、第 1 天最後的問題 */
export interface StoryFlow {
  arts: PageArt[]
  pageOf: number[]
  pages: number
  acts: (Act | null)[]
  /** 第幾句念完要念三明治 → 哪個名詞（角色庫 id） */
  sandwiches: Map<number, string>
  actStops: ActStop[]
  tellPicks: TellPick[]
  ask: LookAsk | null
}

/**
 * beats：念的句子（key、圖）；texts：每一句的英文；sceneKind：這一章的場景；cover：一張圖都沒有時用的封面圖。
 * 沒有擺法的句子沿用前面最近的一張（跟 T-119 一樣），一開始都沒有就用封面。
 */
export function flowOf(
  ch: Chapter | null,
  beats: readonly { k: string; pic?: string }[],
  texts: readonly string[],
  sceneKind: string | undefined,
  cover: string,
  canSandwich: (id: string) => boolean = () => true,
): StoryFlow {
  let last: PageArt | null = null
  const arts = beats.map((b) => (last = artForBeat(ch, b.k, b.pic, sceneKind) ?? last ?? fromPic(cover, sceneOf(sceneKind)) ?? { scene: sceneOf(sceneKind), cast: [] }))
  const keys = beats.map((b) => b.k)
  const tx = beats.map((_, i) => texts[i] ?? '')
  const pageOf = pagesOf(arts, keys)
  const acts = actsOf(arts, tx, pageOf)
  return {
    arts,
    pageOf,
    pages: pageOf.length ? Math.max(...pageOf) + 1 : 0,
    acts,
    sandwiches: sandwichesOf(arts, tx, acts, canSandwich),
    actStops: actStopsOf(tx, acts, arts),
    tellPicks: tellPicksOf(arts, pageOf),
    ask: lookAskOf(arts, tx),
  }
}
