// 每個引擎「這一題出什麼、要不要先教」的決定（純函式，不碰畫面）。
// 引擎（ChoiceGame、PhonicsGame、SheetGame…）和自動檢查 scripts/sim-teach.ts 用同一份，
// 檢查跑的就是孩子實際會遇到的出題規則。
import { ROUND_ITEMS, type ChoiceItem, type GameDef, type PhonicsItem } from '../content/games'
import type { SheetItem, SheetMaker } from '../content/games-worksheet'
import { pickDriveSkill, pickStory, seqSkill, type Story } from '../content/code'
import { isNew, isProbing, level, mastered, teachable, withTargetFilter } from '../lib/adaptive'

/** 一局最多教幾個新內容，其餘都是複習（PRD §5.8） */
export const MAX_TEACH = 2

/** 一局裡跨題目記著的東西：教了幾個、剛出過什麼、是不是第一次玩這個遊戲 */
export interface RoundState {
  taught: number
  /** 示範（Watch me!）用了幾次 */
  demos: number
  recent: string[]
  /** 上一題的技能：探測題不連續考同一個 */
  lastSkill: string | null
  /** 必須在 markPlayed 之前讀：第一次玩的遊戲，第一題一定先一起練一次 */
  firstPlay: boolean
}

export const roundState = (firstPlay: boolean): RoundState => ({ taught: 0, demos: 0, recent: [], lastSkill: null, firstPlay })

// ── 選擇題引擎 ───────────────────────────────────────────────
export interface ChoicePlan {
  it: ChoiceItem
  lv: number
  /** 程度校準的探測題：不先教，直接考比較難的 */
  probe: boolean
  /** 新內容：教學卡 → 一起練 → 自己答 */
  fresh: boolean
  /** 第一次玩的第一題（不是新內容）：一起練一次「怎麼玩」 */
  walk: boolean
}

export function planChoice(def: GameDef, st: RoundState, i: number): ChoicePlan {
  const isLast = i === ROUND_ITEMS - 1
  // 第一次玩的第一題是「怎麼玩」的一起練，不算探測；之後的 2–3 題是探測題
  const probe = isProbing(def.id) && !(st.firstPlay && i === 0)
  const lvBase = level(def.id)
  // 最後一題是挑戰題：比目前難度高一級
  let lv = isLast && !probe && lvBase < def.maxLevel ? lvBase + 1 : lvBase
  const make = () => def.make!(lv, st.recent)
  /** 盡量出符合 ok 的題目：先用挑題篩選，沒有用（例如比多少不經過挑題）就多抽幾次 */
  const makeWhere = (ok: (k: string) => boolean) => {
    let it = make()
    for (let k = 0; k < 10 && !ok(it.skill); k++) it = withTargetFilter(ok, make)
    return it
  }
  // 開局先出已熟的：讓孩子先答對、建立信心（功文式「從低一點開始」）
  let it = i === 0 ? makeWhere(mastered) : make()
  const ok = teachable(def.id, st.taught, MAX_TEACH)
  if (!ok(it.skill)) {
    // 這局已經教滿了、負擔過重暫停教新內容，或這條主線本週的新概念額度用完：其餘出複習題，不考沒教過的
    it = makeWhere(ok)
    // 挑戰題（高一級）的內容全是新的（例如找規律 3 級才有的 AAB）：退回目前難度再找一次
    if (!ok(it.skill) && lv > lvBase) {
      lv = lvBase
      it = makeWhere(ok)
    }
  }
  st.recent = [it.itemId, ...st.recent].slice(0, 3)
  st.lastSkill = it.skill
  // 真的找不到複習題時（例如比多少隨機出到沒學過的「少」），寧可多教一個，也不考沒教過的
  // 探測題例外：先直接考，答錯才教（已經會的就不用教）
  const fresh = !!it.teach && isNew(it.skill) && !probe
  const walk = !fresh && !probe && st.firstPlay && i === 0
  if (fresh) st.taught++
  return { it, lv, probe, fresh, walk }
}

// ── 自然發音 ─────────────────────────────────────────────────
export function planPhonics(def: GameDef, make: (lv: number, recent: string[]) => PhonicsItem, st: RoundState, i: number) {
  const isLast = i === ROUND_ITEMS - 1
  const lvBase = level(def.id)
  const lv = isLast && lvBase < def.maxLevel ? lvBase + 1 : lvBase
  const gen = () => make(lv, st.recent)
  let it = gen()
  // 這局已經教滿、負擔過重，或語言這條線本週的新概念額度用完：出學過的音
  const ok = teachable(def.id, st.taught, MAX_TEACH)
  for (let k = 0; k < 10 && !ok(it.skill); k++) it = withTargetFilter(ok, gen)
  // 同時開放的音只有三、四個：只避開上一題的音，不然出題順序會變成固定輪流
  st.recent = [it.itemId]
  const fresh = isNew(it.skill)
  const walk = !fresh && st.firstPlay && i === 0
  if (fresh) st.taught++
  return { it, lv, fresh, walk }
}

// ── 學習單（找出全部、圈圈看）────────────────────────────────
export function planSheet(def: GameDef, make: SheetMaker, mode: 'tap' | 'lasso', st: RoundState, i: number) {
  const lv = level(def.id)
  const gen = () => make(lv, st.recent)
  let it: SheetItem = gen()
  // 這局已經教滿、負擔過重，或這條主線本週的新概念額度用完：出學過的
  const ok = teachable(def.id, st.taught, MAX_TEACH)
  for (let k = 0; k < 10 && !ok(it.skill); k++) it = withTargetFilter(ok, gen)
  st.recent = [it.itemId, ...st.recent].slice(0, 3)
  // 圈選：概念在「找出全部」學過就不用再看教學卡，只要學怎麼圈
  const fresh = isNew(it.skill) && (mode === 'tap' || isNew(`all:${it.itemId}`))
  const pen = mode === 'lasso' && st.demos < 1 && (st.firstPlay || isNew(it.skill))
  const walk = !fresh && !pen && st.firstPlay && i === 0
  if (fresh) st.taught++
  if (pen) st.demos++
  return { it, lv, fresh, pen, walk }
}

// ── 程式車庫 ─────────────────────────────────────────────────
export function planDrive(def: GameDef, st: RoundState, i: number) {
  const lv = level(def.id)
  const make = () => pickDriveSkill(lv, st.recent)
  // 開局先出已熟的；這局已經教滿（或負擔過重、思考這條線本週的新概念額度用完）就只出學過的。沒有符合的，pickTarget 會照常挑
  let key = i === 0 ? withTargetFilter(mastered, make) : make()
  const ok = teachable(def.id, st.taught, MAX_TEACH)
  if (!ok(key)) key = withTargetFilter(ok, make)
  st.recent = [key, ...st.recent].slice(0, 2)
  const fresh = isNew(key)
  const walk = !fresh && st.firstPlay && i === 0
  if (fresh) st.taught++
  return { key, lv, fresh, walk }
}

export function planSequence(def: GameDef, st: RoundState & { stories: Story[] }, i: number) {
  const lv = level(def.id)
  // 主題式冒險先挑主題的故事（等公車 → 公車來了），這一級沒有就照常挑
  const make = () => pickStory(lv, st.stories)
  // 開局先出已熟的故事；這局已經教滿（或負擔過重、本週新概念額度用完）就只出學過的
  let s = i === 0 ? withTargetFilter(mastered, make) : make()
  const ok = teachable(def.id, st.taught, MAX_TEACH)
  if (!ok(seqSkill(s))) s = withTargetFilter(ok, make)
  st.stories = [s, ...st.stories].slice(0, 2)
  const fresh = isNew(seqSkill(s))
  const walk = !fresh && st.firstPlay && i === 0
  if (fresh) st.taught++
  return { s, lv, fresh, walk }
}

// ── 點點數數、照順序（示範型：波波先做一次給孩子看）────────────────
/** 點點數數每一級的數量範圍 */
export const COUNT_RANGE: Record<number, [number, number]> = { 1: [1, 3], 2: [2, 5], 3: [4, 8], 4: [6, 10] }
/** 一局最多示範一次：數數的規則一樣，看一次就夠 */
const MAX_DEMO = 1

const needsDemo = (firstPlay: boolean, key: string) => firstPlay || isNew(key)

export function planCount(_game: string, lv: number, st: RoundState, i: number) {
  const [a, b] = COUNT_RANGE[lv]
  const n = a + Math.floor(Math.random() * (b - a + 1))
  const show = st.demos < MAX_DEMO && needsDemo(st.firstPlay && i === 0, `count:${n}`)
  if (show) st.demos++
  return { n, show }
}

export function planOrder(_game: string, lv: number, unlocked: number, st: RoundState, i: number) {
  const n = Math.min([3, 4, 5, 6][lv - 1] + (lv === 4 ? Math.floor(Math.random() * 3) : 0), Math.max(5, unlocked), 10)
  const show = st.demos < 1 && needsDemo(st.firstPlay && i === 0, `order:${n}`)
  if (show) st.demos++
  return { n, show }
}

