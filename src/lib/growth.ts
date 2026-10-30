// 成長系統：由生日算年段、生日跨段時 4 週慢慢放寬、家長覆寫年段（docs/成長系統設計.md §1.1、§1.2、§1.5、§4.2、§5.1）
//
// 年段只決定操作外框（content/growth.ts 的 FRAMES），不決定學什麼（D1）。
// 生日只記到年月，由家長在家長區設定，存在 kv.profile（這台平板）和雲端的私人文件（D2）；
// 程式和 repo 裡不寫任何預設生日。沒設生日就是小班段，也就是 App 現在的樣子。
//
// 上半部是純函式（不碰資料庫，scripts/test-growth.ts 直接測）；下半部是讀寫 kv 的狀態，家長區和之後的 G-3 用。
import { useSyncExternalStore } from 'react'
import { BANDS, BAND_FROM_MONTHS, DEFAULT_BAND, FRAMES, RAMP_WEEK, RAMP_WEEKS, type Band, type Frame } from '../content/growth'
import { db, getKV, setKV, today, uid, type GrowthLogEntry } from './db'
import { MASTERED_BOX } from './engine'
import type { TrackId } from '../content/tracks'
import {
  DONE_RATIO,
  FIRM_REV,
  NESTED_GAMES,
  REOPEN_DAYS,
  REOPEN_DROP,
  REOPEN_FAILS,
  REOPEN_MAX,
  RUNGS,
  STRANDS,
  STUCK_DAYS,
  STUCK_RATIO,
  TRANSFER_GAMES,
  TRANSFER_RATIO,
  strand,
  strandRungs,
  unitOfSkill,
  unitsOf,
  type RungDef,
  type StrandId,
} from '../content/ladder'

/** kv.profile：生日年月，由家長設定 */
export interface Profile {
  /** 'YYYY-MM' */
  birth: string
  setAt: number
}

/**
 * 家長覆寫年段（§4.2）：固定在某個年段，或跟著年齡但提早、延後一段。
 * until 是到期日（YYYY-MM-DD，這一天起不再生效，回到跟著年齡）；沒有就一直有效，直到家長改回來。
 */
export interface Override {
  band?: Band
  shift?: -1 | 1
  until?: string
  setAt: number
}

/** kv.growth */
export interface GrowthState {
  override?: Override
  /** 鎖住的支線 → 鎖在第幾階（G-2、G-6 才用） */
  locks: Record<string, number>
  /** 生日跨段的 4 週放寬：從哪段到哪段、哪一天開始（YYYY-MM-DD） */
  ramp?: { from: Band; to: Band; start: string }
  /**
   * 最近一次確定（放寬完成）的年段。舊資料沒有，當作小班段：App 一直以來就是小班段的外框，
   * 家長第一次設定生日、算出來已經是中班段時，也要從小班段慢慢放寬過去。
   */
  band?: Band
}

export const PROFILE_KV = 'profile'
export const GROWTH_KV = 'growth'

export const EMPTY_GROWTH: GrowthState = { locks: {} }

// ── 純函式 ─────────────────────────────────────────────

const rank = (b: Band) => BANDS.indexOf(b)

/** 'YYYY-MM' → 年、月；格式不對是 null */
export function parseBirth(s: string): { y: number; m: number } | null {
  const hit = /^(\d{4})-(\d{2})$/.exec(s)
  if (!hit) return null
  const y = Number(hit[1])
  const m = Number(hit[2])
  return m >= 1 && m <= 12 ? { y, m } : null
}

/** 到 day（YYYY-MM-DD）為止滿幾個月。生日只記到月，當月算 0 個月；格式不對是 null */
export function monthsOld(birth: string, day: string): number | null {
  const b = parseBirth(birth)
  if (!b) return null
  const [y, m] = day.split('-').map(Number)
  return (y - b.y) * 12 + (m - b.m)
}

/** 家長可以設定的生日：格式對、不在未來、不超過 12 歲 */
export function validBirth(birth: string, day: string): boolean {
  const m = monthsOld(birth, day)
  return m !== null && m >= 0 && m <= 12 * 12
}

/** 月齡 → 年段：未滿 3 歲也是小班段，滿 6 歲之後停在大班段 */
export function bandForMonths(months: number): Band {
  let band: Band = 'small'
  for (const b of BANDS) if (months >= BAND_FROM_MONTHS[b]) band = b
  return band
}

/** 「3 歲 4 個月」 */
export function ageLabel(months: number): string {
  const y = Math.floor(months / 12)
  const m = months % 12
  return m ? `${y} 歲 ${m} 個月` : `${y} 歲`
}

export function overrideActive(ov: Override | undefined, day: string): ov is Override {
  return Boolean(ov && (ov.band || ov.shift) && (!ov.until || day < ov.until))
}

export interface Target {
  band: Band
  /** age：照生日；default：沒設生日，用小班段；override：家長覆寫 */
  source: 'age' | 'default' | 'override'
  /** 有設生日才有 */
  months?: number
  /** 照年齡會是哪一段（覆寫時家長區要寫「照年齡是中班段」） */
  ageBand: Band
}

/** 今天應該是哪個年段（還沒算放寬） */
export function targetBand(profile: Profile | null, growth: GrowthState, day: string): Target {
  const months = profile ? monthsOld(profile.birth, day) : null
  const ageBand = months !== null && months >= 0 ? bandForMonths(months) : DEFAULT_BAND
  const base = { ageBand, ...(months !== null && months >= 0 ? { months } : {}) }
  const ov = growth.override
  if (overrideActive(ov, day)) {
    const band = ov.band ?? BANDS[Math.min(BANDS.length - 1, Math.max(0, rank(ageBand) + (ov.shift ?? 0)))]
    return { ...base, band, source: 'override' }
  }
  return { ...base, band: ageBand, source: months !== null && months >= 0 ? 'age' : 'default' }
}

/** 兩個 YYYY-MM-DD 差幾天 */
export function daysBetween(from: string, to: string): number {
  const d = (s: string) => {
    const [y, m, dd] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, dd)
  }
  return Math.round((d(to) - d(from)) / 86_400_000)
}

/** 放寬的第幾週（1–4）；還沒開始是 1，放寬完了是 0 */
export function rampWeek(ramp: GrowthState['ramp'], day: string): number {
  if (!ramp) return 0
  const days = Math.max(0, daysBetween(ramp.start, day))
  return days >= RAMP_WEEKS * 7 ? 0 : Math.floor(days / 7) + 1
}

/** 放寬中的外框：到了那一週的項目換成新年段的值，其他還是舊的（§1.5） */
export function blendFrame(from: Band, to: Band, week: number): Frame {
  const a = FRAMES[from]
  const b = FRAMES[to]
  const out = { ...a } as Record<keyof Frame, unknown>
  for (const k of Object.keys(RAMP_WEEK) as (keyof Frame)[]) if (RAMP_WEEK[k] <= week) out[k] = b[k]
  return out as unknown as Frame
}

export type LogDraft = Pick<GrowthLogEntry, 'kind' | 'data'>

/**
 * 依今天的日期整理年段（開機、回到前景、家長改了生日或覆寫時都跑一次）：
 * - 家長覆寫：當天就換，不慢慢放寬（家長選的就是要立刻看到）。
 * - 照年齡往上換段：開始 4 週放寬，放寬完才算換段。放寬到一半目標又變了（家長改了生日），從確定的年段重新開始。
 * - 往下換段（家長把生日改小、覆寫到期回到比較小的年段）：當天就全部換掉，不讓小的孩子多用幾週大孩子的外框。
 * 回傳新的狀態（沒變就是同一個物件）和要寫進時間軸的紀錄。
 */
export function reconcile(profile: Profile | null, growth: GrowthState, day: string): { growth: GrowthState; log: LogDraft[] } {
  const t = targetBand(profile, growth, day)
  const settled = growth.band ?? DEFAULT_BAND
  const { ramp: _r, ...rest } = growth
  const settle = (band: Band, data: Record<string, unknown> | null) => ({
    growth: { ...rest, band },
    log: data ? [{ kind: 'band' as const, data: { from: settled, to: band, ...data } }] : [],
  })

  if (t.source === 'override') {
    if (!growth.ramp && settled === t.band && growth.band) return { growth, log: [] }
    return settle(t.band, settled === t.band ? null : { step: 'override' })
  }
  if (growth.ramp?.to === t.band && growth.ramp.from === settled) {
    if (rampWeek(growth.ramp, day)) return { growth, log: [] }
    return settle(t.band, { step: 'done' })
  }
  if (t.band === settled) return growth.ramp ? settle(t.band, null) : { growth, log: [] }
  if (rank(t.band) < rank(settled)) return settle(t.band, { step: 'down' })
  return {
    growth: { ...rest, ramp: { from: settled, to: t.band, start: day } },
    log: [{ kind: 'band', data: { from: settled, to: t.band, step: 'start' } }],
  }
}

export interface GrowthStatus extends Target {
  /** 放寬中：從哪段到哪段、第幾週 */
  ramp?: { from: Band; to: Band; start: string; week: number }
  /** 現在實際用的操作外框 */
  frame: Frame
}

/** 整理過的狀態 → 家長區和遊戲要用的樣子 */
export function statusOf(profile: Profile | null, growth: GrowthState, day: string): GrowthStatus {
  const t = targetBand(profile, growth, day)
  const week = rampWeek(growth.ramp, day)
  if (growth.ramp && week) return { ...t, ramp: { ...growth.ramp, week }, frame: blendFrame(growth.ramp.from, growth.ramp.to, week) }
  return { ...t, frame: FRAMES[growth.band ?? t.band] }
}

// ── 支線與階梯（G-2，§1.3、§1.4、§5.4）──────────────────────
// 純函式：輸入是技能點的熟練度和「在哪些遊戲第一次就答對過」，輸出是每一階開了沒、完成了沒、要不要回補。
// 孩子端（lib/adaptive.ts）每一回合開始時算一次；家長區（G-6）、試算報告（scripts/ladder-report.ts）用同一套。

/** 熟練度裡判斷階梯要用的欄位（db.Skill 的一部分） */
export interface SkillView {
  box: number
  seen: number
  rev?: number
  lastReview?: { ts: number; result: 'ok' | 'slow' | 'no' }
  firmAt?: number
}

/**
 * 穩固：已熟，而且通過至少 2 次到期複習（隔 1 天、再隔 2 天都還記得）。同一局連對三題的「已熟」還不算。
 * 通過過一次就記在 firmAt：之後偶爾答錯一題（rev 從頭算）仍然算穩固，掉出已熟才不算。
 */
export const isFirm = (s: SkillView | undefined) => !!s && s.box >= MASTERED_BOX && ((s.rev ?? 0) >= FIRM_REV || s.firmAt != null)

export interface LadderFacts {
  /** 出現過的技能點 */
  skills: ReadonlyMap<string, SkillView>
  /** 技能點 → 在哪些遊戲「自己答」第一次就答對過（遷移） */
  okGames: ReadonlyMap<string, ReadonlySet<string>>
}

export interface UnitStat {
  id: string
  seen: boolean
  mastered: boolean
  firm: boolean
  /** 能練到它的遊戲有 2 種以上 */
  transferable: boolean
  transfer: boolean
  /** 屬於這個單位、出現過的技能點 */
  skills: string[]
}

export interface RungCalc {
  units: UnitStat[]
  /** 做出來的單位數；0 就是這一階還沒有內容 */
  total: number
  seen: number
  mastered: number
  firm: number
  transferable: number
  transferred: number
  /** 穩固的比例 0–1 */
  ratio: number
  /** 現在算起來夠不夠「階完成」：80% 穩固，而且能遷移的單位一半以上有遷移 */
  done: boolean
  /** 最近的到期複習連續失敗幾次（這一階所有技能點一起看） */
  fails: number
}

/** 把出現過的技能點分到各階的各單位，算出每一階的穩固、遷移 */
export function ladderCalc(facts: LadderFacts): Map<string, RungCalc> {
  const byUnit = new Map<string, string[]>()
  for (const key of facts.skills.keys()) {
    const u = unitOfSkill(key)
    if (!u) continue
    const k = `${u.rung}|${u.unit.id}`
    byUnit.set(k, [...(byUnit.get(k) ?? []), key])
  }
  const raw = new Map<string, UnitStat>()
  for (const r of RUNGS)
    for (const u of unitsOf(r.id)) {
      const keys = byUnit.get(`${r.id}|${u.id}`) ?? []
      const sk = keys.map((k) => facts.skills.get(k)!)
      const games = new Set(keys.flatMap((k) => [...(facts.okGames.get(k) ?? [])]))
      raw.set(`${r.id}|${u.id}`, {
        id: u.id,
        seen: sk.some((s) => s.seen > 0),
        mastered: sk.some((s) => s.box >= MASTERED_BOX),
        firm: sk.some(isFirm),
        transferable: u.games.length >= TRANSFER_GAMES,
        transfer: games.size >= TRANSFER_GAMES,
        skills: keys,
      })
    }
  // 難度越高越包含前面的：同一個遊戲高一級的單位穩固（已熟、出現過）了，低的也算
  const nested = [...RUNGS].flatMap((r) => unitsOf(r.id).filter((u) => u.game && NESTED_GAMES.has(u.game)).map((u) => ({ u, s: raw.get(`${r.id}|${u.id}`)! })))
  for (const { u, s } of nested) {
    const higher = nested.filter((x) => x.u.game === u.game && (x.u.lv ?? 0) > (u.lv ?? 0)).map((x) => x.s)
    s.seen ||= higher.some((h) => h.seen)
    s.mastered ||= higher.some((h) => h.mastered)
    s.firm ||= higher.some((h) => h.firm)
  }
  const out = new Map<string, RungCalc>()
  for (const r of RUNGS) {
    if (r.with) continue
    const units = unitsOf(r.id).map((u) => raw.get(`${r.id}|${u.id}`)!)
    const total = units.length
    const firm = units.filter((x) => x.firm).length
    const transferable = units.filter((x) => x.transferable).length
    const transferred = units.filter((x) => x.transferable && x.transfer).length
    const reviews = units
      .flatMap((x) => x.skills.map((k) => facts.skills.get(k)!.lastReview))
      .filter((x): x is NonNullable<SkillView['lastReview']> => !!x)
      .sort((a, b) => b.ts - a.ts)
    let fails = 0
    while (fails < reviews.length && reviews[fails].result === 'no') fails++
    const ratio = total ? firm / total : 0
    out.set(r.id, {
      units,
      total,
      seen: units.filter((x) => x.seen).length,
      mastered: units.filter((x) => x.mastered).length,
      firm,
      transferable,
      transferred,
      ratio,
      done: total > 0 && ratio >= DONE_RATIO && (!transferable || transferred / transferable >= TRANSFER_RATIO),
      fails,
    })
  }
  for (const r of RUNGS) if (r.with) out.set(r.id, out.get(r.with)!)
  return out
}

/**
 * 一階怎麼開的：
 * start 沒有前置；prereq 前置都完成；stuck 卡關保險（前一階 60% 穩固、開放滿 3 週）；
 * legacy 成長系統上線前就已經玩到這一階（舊資料升級時補記，已經開放的不收回）。
 */
export type OpenBy = 'start' | 'prereq' | 'stuck' | 'legacy'

export interface Reopen {
  from: string
  /** 這一天起結束（YYYY-MM-DD） */
  until: string
  /** drop：30% 以上掉出已熟；fail：連續 2 次到期複習失敗 */
  why: 'drop' | 'fail'
  /** 掉出已熟的技能點：重跑一次短教學卡 */
  reteach: string[]
}

export interface RungMark {
  open?: string
  by?: OpenBy
  done?: string
  reopen?: Reopen
  /** 連續回補了幾次（回補結束時還是掉著，就接著再回補一次；回來了就清掉） */
  again?: number
  /** 連續回補 REOPEN_MAX 次還沒回來：從這一天起不再回補，改在家長區提醒（回來了就清掉） */
  held?: string
}

/** kv.ladder：每一階什麼時候開、什麼時候完成、回補中。開了不收回，完成了不收回（掉了就回補） */
export interface LadderState {
  v: number
  rungs: Record<string, RungMark>
}

export const LADDER_V = 1
export const emptyLadder = (): LadderState => ({ v: LADDER_V, rungs: {} })

export interface RungView extends RungCalc {
  id: string
  strand: StrandId
  track: TrackId
  open: boolean
  by?: OpenBy
  openDate?: string
  doneDate?: string
  /** 完成了（記下來的，之後掉了也不收回，改成回補） */
  complete: boolean
  reopen?: Reopen
  /** 連續回補還沒回來、停下來改提醒家長的日子（RungMark.held） */
  held?: string
  /** 家長鎖住這條支線，這一階不會再開 */
  locked: boolean
  free: boolean
}

export interface StrandView {
  id: StrandId
  track: TrackId
  name: string
  /** 完成的階 */
  done: string[]
  /** 開了、還在練的階（有內容的） */
  current: string[]
  /** 下一個還沒開、已經有內容的階 */
  next: string | null
  /** 還沒出現過的新內容（單位）數：開了的階＋還沒開的階 */
  left: number
  /** 現有內容都教過了：之後只能橫向加深，要提醒家長（§1.1） */
  out: boolean
  /** 回補中的階 */
  reopen: string[]
  /** 連續回補還沒回來、要提醒家長的階 */
  held: string[]
}

export interface LadderView {
  date: string
  rungs: Map<string, RungView>
  strands: StrandView[]
}

export interface LadderLog {
  kind: 'rung' | 'reopen'
  date: string
  track: TrackId
  strand: StrandId
  /** 這條支線的第幾階（從 1 開始） */
  rung: number
  data: Record<string, unknown>
}

export interface StepOpts {
  /** 家長鎖住的支線 → 鎖在第幾階（kv.growth.locks） */
  locks?: Record<string, number>
  /**
   * 舊資料第一次算（§5.4）：已經玩過的階直接算開放，紀錄都標成「補記」，日期用作答紀錄推回去：
   * 開放＝這一階第一次出現的日期，完成＝這一階最後一次作答的日期（約略）。
   */
  migrate?: { first: (rung: string) => string | undefined; last: (rung: string) => string | undefined; open?: readonly string[] }
}

/** YYYY-MM-DD 往後 n 天 */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const posIn = (r: RungDef) => strandRungs(r.strand).indexOf(r) + 1

/**
 * 依今天的資料往前走一步：該開的開、該完成的記完成、該回補的開始回補（回傳新的狀態、要寫進時間軸的紀錄、整理好的樣子）。
 * - 開：前置都完成，或卡關保險。不看年齡（D1）。家長鎖住的支線，鎖的那一階之後不開（複習照常）。
 * - 完成：開了的階算起來夠了就記下來，之後不收回。
 * - 回補：完成的階有 30% 以上的單位掉出已熟，或連續 2 次到期複習失敗：1 週暫停新概念、到期複習加倍、掉出來的重教一次。
 *   已經開放的下一階不收回；孩子端看不出來，原因只寫在時間軸。
 *   連續回補 REOPEN_MAX 次（結束時還是掉著）就停下來，時間軸記一筆 hold 提醒家長；回來了再記一筆 back。
 */
export function stepLadder(prev: LadderState, facts: LadderFacts, date: string, opts: StepOpts = {}): { state: LadderState; log: LadderLog[]; view: LadderView } {
  const calc = ladderCalc(facts)
  const rungs: Record<string, RungMark> = {}
  const log: LadderLog[] = []
  const mig = opts.migrate
  const backfill = mig ? { backfill: true } : {}
  const note = (r: RungDef, kind: LadderLog['kind'], day: string, data: Record<string, unknown>) =>
    log.push({ kind, date: day, track: strand(r.strand).track, strand: r.strand, rung: posIn(r), data: { rung: r.id, ...data, ...backfill } })

  // 沒有對錯的階（著色、自由畫）不會「完成」：開著就算前置滿足（H13 畫故事裡的東西的前置是 H11）
  const doneOf = (id: string) => !!rungs[id]?.done || (!!RUNGS.find((r) => r.id === id)?.free && !!rungs[id]?.open)
  const stuckOf = (id: string) => {
    const mk = rungs[id]
    const c = calc.get(id)!
    return !!mk?.open && !mk.done && c.total > 0 && c.ratio >= STUCK_RATIO && daysBetween(mk.open, date) >= STUCK_DAYS
  }

  for (const r of RUNGS) {
    const mk: RungMark = { ...prev.rungs[r.id] }
    const c = calc.get(r.id)!
    const lock = opts.locks?.[r.strand]
    const locked = lock !== undefined && posIn(r) > lock

    // 開
    if (!mk.open) {
      const ok = r.prereq.every((p) => doneOf(p) || stuckOf(p))
      const by: OpenBy | null = ok ? (!r.prereq.length ? 'start' : r.prereq.every(doneOf) ? 'prereq' : 'stuck') : mig && (c.seen > 0 || mig.open?.includes(r.id)) ? 'legacy' : null
      if (by && (!locked || by === 'legacy')) {
        mk.open = (mig && mig.first(r.id)) || date
        mk.by = by
        // 一開始就開著的階（沒有前置）、還沒有內容的階不必寫進時間軸；舊資料升級時，有玩過的都補記
        if ((by !== 'start' && c.total > 0) || (mig && c.seen > 0)) note(r, 'rung', mk.open, { event: 'open', by, ...(by === 'stuck' ? { from: r.prereq.filter((p) => !doneOf(p)) } : {}) })
      }
    }
    // 完成
    if (mk.open && !mk.done && !r.free && c.done) {
      mk.done = (mig && mig.last(r.id)) || date
      note(r, 'rung', mk.done, { event: 'done', firm: c.firm, total: c.total })
    }
    // 回補
    if (mk.reopen && date >= mk.reopen.until) {
      note(r, 'reopen', date, { event: 'end', why: mk.reopen.why })
      delete mk.reopen
    }
    if (mk.done && !mk.reopen && c.total) {
      const dropped = c.units.filter((u) => !u.mastered)
      const why = dropped.length / c.total >= REOPEN_DROP ? 'drop' : c.fails >= REOPEN_FAILS ? 'fail' : null
      if (!why) {
        // 回來了：重新算連續次數；停下來的提醒也收掉
        if (mk.held) note(r, 'reopen', date, { event: 'back' })
        delete mk.again
        delete mk.held
      } else if (!mk.held) {
        const again = (mk.again ?? 0) + 1
        if (again > REOPEN_MAX) {
          // 連續回補還是沒回來：不再暫停這條支線，改在家長區提醒（到期複習照常）
          mk.held = date
          note(r, 'reopen', date, { event: 'hold', why, dropped: dropped.map((u) => u.id), times: REOPEN_MAX })
        } else {
          const reteach = dropped.flatMap((u) => u.skills.filter((k) => facts.skills.get(k)!.seen > 0 && facts.skills.get(k)!.box < MASTERED_BOX))
          mk.again = again
          mk.reopen = { from: date, until: addDays(date, REOPEN_DAYS), why, reteach }
          note(r, 'reopen', date, { event: 'start', why, dropped: dropped.map((u) => u.id), mastered: c.mastered, total: c.total })
        }
      }
    }
    rungs[r.id] = mk
  }

  const state: LadderState = { v: LADDER_V, rungs }
  return { state, log, view: ladderView(state, calc, date, opts.locks) }
}

/** 整理成家長區、孩子端要用的樣子 */
export function ladderView(state: LadderState, calc: Map<string, RungCalc>, date: string, locks?: Record<string, number>): LadderView {
  const rungs = new Map<string, RungView>()
  for (const r of RUNGS) {
    const mk = state.rungs[r.id] ?? {}
    const lock = locks?.[r.strand]
    rungs.set(r.id, {
      ...calc.get(r.id)!,
      id: r.id,
      strand: r.strand,
      track: strand(r.strand).track,
      open: !!mk.open,
      by: mk.by,
      openDate: mk.open,
      doneDate: mk.done,
      complete: !!mk.done,
      reopen: mk.reopen && date < mk.reopen.until ? mk.reopen : undefined,
      held: mk.held,
      locked: lock !== undefined && posIn(r) > lock && !mk.open,
      free: !!r.free,
    })
  }
  const strands = STRANDS.map((s): StrandView => {
    const list = strandRungs(s.id).map((r) => rungs.get(r.id)!)
    const built = list.filter((x) => x.total > 0 && !RUNGS.find((r) => r.id === x.id)!.with)
    const left = built.reduce((n, x) => n + (x.total - x.seen), 0)
    const current = built.filter((x) => x.open && !x.complete).map((x) => x.id)
    const next = built.find((x) => !x.open)?.id ?? null
    return {
      id: s.id,
      track: s.track,
      name: s.name,
      done: list.filter((x) => x.complete).map((x) => x.id),
      current,
      next,
      left,
      out: built.length > 0 && left === 0,
      reopen: list.filter((x) => x.reopen).map((x) => x.id),
      held: list.filter((x) => x.held).map((x) => x.id),
    }
  })
  return { date, rungs, strands }
}

/**
 * 內容庫存（§1.1、§4.1）：照最近 4 週這條支線教新內容的速度，剩下的新內容大約還能撐幾週。
 * introDates：這條支線每個單位第一次出現的日期。最近 4 週沒教過新的就算不出來（null）。
 */
export function contentWeeks(left: number, introDates: readonly string[], date: string): number | null {
  if (!left) return 0
  const from = addDays(date, -27)
  const recent = introDates.filter((d) => d >= from && d <= date).length
  return recent ? Math.round((left / (recent / 4)) * 10) / 10 : null
}

// ── 這台平板的狀態 ───────────────────────────────────────

let profile: Profile | null = null
let growth: GrowthState = EMPTY_GROWTH
let status: GrowthStatus = statusOf(null, EMPTY_GROWTH, today())
const subs = new Set<() => void>()

/** Firestore 不收 undefined 的欄位：存之前整個拿掉 */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

async function addLog(drafts: LogDraft[]) {
  if (!drafts.length) return
  const ts = Date.now()
  const date = today()
  await db.growthLog.bulkAdd(drafts.map((d, i) => clean({ id: uid(), ts: ts + i, date, ...d, synced: 0 as const })))
}

/** 支線與階梯的時間軸紀錄（lib/adaptive.ts 寫）。補記的日期是從作答紀錄推回去的，ts 跟著日期排 */
export async function addLadderLog(entries: readonly LadderLog[]) {
  if (!entries.length) return
  const now = Date.now()
  const day = today()
  await db.growthLog.bulkAdd(
    entries.map((e, i) =>
      clean({
        id: uid(),
        ts: (e.date === day ? now : new Date(`${e.date}T12:00:00`).getTime()) + i,
        date: e.date,
        kind: e.kind,
        track: e.track,
        strand: e.strand,
        rung: e.rung,
        data: e.data,
        synced: 0 as const,
      }),
    ),
  )
}

/** 依今天重新整理年段；有變就寫回 kv、記進時間軸 */
export async function refreshGrowth() {
  const day = today()
  const r = reconcile(profile, growth, day)
  if (r.growth !== growth) {
    growth = r.growth
    await setKV(GROWTH_KV, clean(growth))
  }
  await addLog(r.log)
  status = statusOf(profile, growth, day)
  subs.forEach((f) => f())
}

let listening = false

/**
 * 開機時讀進來。讀不到（資料庫壞了、欄位怪怪的）就當作沒設生日：照小班段、照現在的樣子玩，不擋開機。
 */
export async function loadGrowth() {
  try {
    const p = await getKV<Profile | null>(PROFILE_KV, null)
    profile = p && typeof p.birth === 'string' && parseBirth(p.birth) ? p : null
    const g = await getKV<Partial<GrowthState> | null>(GROWTH_KV, null)
    growth = g ? { ...g, locks: g.locks ?? {} } : EMPTY_GROWTH
    await refreshGrowth()
  } catch (e) {
    console.warn('讀取成長設定失敗，先用小班段', e)
    profile = null
    growth = EMPTY_GROWTH
    status = statusOf(null, EMPTY_GROWTH, today())
  }
  // App 開著跨過生日月的第一天，回到前景時換段
  if (!listening && typeof document !== 'undefined') {
    listening = true
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void refreshGrowth().catch(() => {})
    })
  }
}

/** 家長設定生日（'YYYY-MM'）；null 是清除。時間軸只記「設定了」，不記生日本身 */
export async function setBirth(birth: string | null) {
  if (birth !== null && !validBirth(birth, today())) throw new Error('生日的格式不對，或是在未來')
  if (birth === null) {
    profile = null
    await db.kv.delete(PROFILE_KV)
  } else {
    profile = { birth, setAt: Date.now() }
    await setKV(PROFILE_KV, profile)
  }
  await addLog([{ kind: 'profile', data: { action: birth ? 'set' : 'clear' } }])
  await refreshGrowth()
}

/** 家長覆寫年段；null 是改回跟著年齡 */
export async function setOverride(ov: Omit<Override, 'setAt'> | null) {
  const { override: _o, ...rest } = growth
  growth = ov ? { ...rest, override: { ...ov, setAt: Date.now() } } : rest
  await setKV(GROWTH_KV, clean(growth))
  await addLog([{ kind: 'override', data: ov ? clean({ ...ov }) : { action: 'clear' } }])
  await refreshGrowth()
}

export const getProfile = () => profile
export const getGrowthState = () => growth
/** 現在的年段和操作外框（G-3 套用到遊戲時讀這個） */
export const getGrowth = () => status
export const getFrame = () => status.frame

export function useGrowth(): GrowthStatus {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => status,
  )
}

/** 同步用：上傳到雲端私人文件的樣子（lib/sync.ts） */
export function growthForSync() {
  return { profile: profile ? clean(profile) : null, growth: clean(growth) }
}
