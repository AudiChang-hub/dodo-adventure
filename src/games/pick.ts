// 每個引擎「這一題出什麼、要不要先教」的決定（純函式，不碰畫面）。
// 引擎（ChoiceGame、PhonicsGame、SheetGame…）和自動檢查 scripts/sim-teach.ts 用同一份，
// 檢查跑的就是孩子實際會遇到的出題規則。
import { ROUND_ITEMS, type ChoiceItem, type GameDef, type PhonicsItem } from '../content/games'
import type { SheetItem, SheetMaker } from '../content/games-worksheet'
import { pickDriveSkill, pickStory, seqSkill, type Story } from '../content/code'
import { dotsPool, type DotsPic } from '../content/dots'
import { isNew, isProbing, level, mastered, pickPreferred, teachable, withTargetFilter } from '../lib/adaptive'
import { noteTaught } from '../lib/words'
import { wordId } from '../content/letters'

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
  /** 程度校準的探測題：考學過的內容、但用比較難的題型（不先教）；一定是學過的 */
  probe: boolean
  /** 新內容：教學卡 → 一起練 → 自己答 */
  fresh: boolean
  /** 第一次玩的第一題（不是新內容）：一起練一次「怎麼玩」 */
  walk: boolean
}

export function planChoice(def: GameDef, st: RoundState, i: number): ChoicePlan {
  const isLast = i === ROUND_ITEMS - 1
  const lvBase = level(def.id)
  let lv = lvBase
  const make = () => def.make!(lv, st.recent)
  /** 盡量出符合 ok 的題目：先用挑題篩選，沒有用（例如比多少不經過挑題）就多抽幾次 */
  const makeWhere = (ok: (k: string) => boolean) => {
    let it = make()
    for (let k = 0; k < 10 && !ok(it.skill); k++) it = withTargetFilter(ok, make)
    return it
  }
  const done = (it: ChoiceItem, probe: boolean): ChoicePlan => {
    st.recent = [it.itemId, ...st.recent].slice(0, 3)
    st.lastSkill = it.skill
    // 新內容一律先教（這局教滿、額度用完時也一樣：真的找不到複習題，寧可多教一個，也不考沒教過的）。
    // 技能學過、但答案的字家長勾了不認得，或教學卡上要多教一個干擾選項的字（needTeach）：也先教
    const fresh = !probe && !!it.teach && (isNew(it.skill) || !!it.needTeach)
    // 教學卡上的字從這一題起算「教過」（lib/words.ts）：之後才能當干擾選項、唸名字
    if (fresh) noteTaught(it.teachWords ?? [])
    const walk = !fresh && !probe && st.firstPlay && i === 0
    if (fresh) st.taught++
    return { it, lv, probe, fresh, walk }
  }

  // 程度校準的探測題（第一次玩的第一題是「怎麼玩」的一起練，不算探測）：
  // 只考學過的內容，而且不和上一題同一個（placement.ts「不教不考」）。找不到就當一般題目，探測不算這一題
  if (isProbing(def.id) && !(st.firstPlay && i === 0)) {
    const known = (k: string) => !isNew(k) && k !== st.lastSkill
    const it = makeWhere(known)
    // 要先教的題目（needTeach）不能當探測題
    if (known(it.skill) && !it.needTeach) return done(it, true)
  }

  // 最後一題是挑戰題：比目前難度高一級
  if (isLast && lvBase < def.maxLevel) lv = lvBase + 1
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
  return done(it, false)
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
  // 單字卡（新的複習字、補上的干擾字、家長勾掉後重教的字）：自己答之前先教，教完一起練一次
  const cards = it.wordCards
  const walk = !fresh && !cards.length && st.firstPlay && i === 0
  if (fresh) st.taught++
  // 學習循環的三個字、單字卡上的字，從這一題起算「教過」（lib/words.ts）
  noteTaught([...(fresh ? it.unit.keys.map((k) => wordId(k.w)) : []), ...cards.map((c) => c.key)])
  return { it, lv, fresh, walk, cards }
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
  const fresh = (isNew(it.skill) && (mode === 'tap' || isNew(`all:${it.itemId}`))) || !!it.needTeach
  // 教學卡上的例子從這一題起算「教過」（lib/words.ts）
  if (fresh) noteTaught(it.teachWords ?? [])
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

/**
 * 點點數數：新的數量一律先示範（原本一局只示範一次，第二個新的數量就直接考）。
 * 一局最多兩個新數量，其餘出這一級範圍裡學過的；範圍裡一個都沒學過（例如探測剛升到 3 級）就照常出、照常示範。
 * 第一次玩的第一輪就算數量學過了，也示範一次「怎麼玩」。
 */
export function planCount(game: string, lv: number, st: RoundState, i: number) {
  const [a, b] = COUNT_RANGE[lv]
  const all = Array.from({ length: b - a + 1 }, (_, k) => a + k)
  const ok = teachable(game, st.taught, MAX_TEACH)
  const fit = all.filter((n) => ok(`count:${n}`))
  // 範圍裡沒有能出的：先往下找學過、能出的數量（不硬教第二個新概念 FRAME-8、或還沒開放的數字；G-2）
  const lower = fit.length ? [] : Array.from({ length: b }, (_, k) => k + 1).filter((n) => ok(`count:${n}`))
  const pool = fit.length ? fit : lower.length ? lower : all
  const n = pool[Math.floor(Math.random() * pool.length)]
  const fresh = isNew(`count:${n}`)
  const show = fresh || (st.firstPlay && i === 0 && st.demos === 0)
  if (fresh) st.taught++
  if (show) st.demos++
  return { n, show }
}

/**
 * 照順序：排到 n 是這一級決定的；n 是新的長度就先示範（原本一局只示範一次）。
 * 這局已經教滿兩個新長度（或額度用完）時，退回學過的最長那一個，不考沒教過的；一個都沒學過就照常示範。
 */
export function planOrder(game: string, lv: number, unlocked: number, st: RoundState, i: number) {
  let n = Math.min([3, 4, 5, 6][lv - 1] + (lv === 4 ? Math.floor(Math.random() * 3) : 0), Math.max(5, unlocked), 10)
  const ok = teachable(game, st.taught, MAX_TEACH)
  if (!ok(`order:${n}`)) {
    const known = Array.from({ length: n - 2 }, (_, k) => n - k).find((m) => !isNew(`order:${m}`))
    if (known) n = known
  }
  const fresh = isNew(`order:${n}`)
  const show = fresh || (st.firstPlay && i === 0 && st.demos === 0)
  if (fresh) st.taught++
  if (show) st.demos++
  return { n, show }
}

// ── 連點成圖（示範型：豆豆拿筆從家出發、整條路走完回家，再換孩子）──────────
/**
 * 連點成圖：這一級、而且數字都已經解鎖的圖（content/dots.ts 的 dotsPool），主題式冒險先挑主題的圖。
 * 新的圖一律先示範（原本一局只示範一次，第二張新圖就直接考）；一局最多兩張新圖，其餘出學過的。
 * 第一次玩的第一張就算圖學過了，也示範一次「怎麼玩」。
 */
export function planDots(game: string, lv: number, unlocked: number, st: RoundState, i: number, prefer: readonly string[] = []) {
  const pool = dotsPool(lv, unlocked)
  const key = (p: DotsPic) => `dots:${p.id}`
  const make = () => pickPreferred(pool.filter((p) => prefer.includes(p.id)), pool, key, pool.filter((p) => st.recent.includes(p.id)))
  let pic = make()
  const ok = teachable(game, st.taught, MAX_TEACH)
  if (!ok(key(pic))) pic = withTargetFilter(ok, make)
  st.recent = [pic.id, ...st.recent].slice(0, 2)
  const fresh = isNew(key(pic))
  const show = fresh || (st.firstPlay && i === 0 && st.demos === 0)
  if (fresh) st.taught++
  if (show) st.demos++
  return { pic, show }
}
