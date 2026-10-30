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
