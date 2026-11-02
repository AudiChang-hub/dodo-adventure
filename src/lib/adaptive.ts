import { db, today, type Attempt, type GameLevel, type Skill } from './db'
import { MASTERED_BOX, REVIEW_DAYS, SPEED_WINDOW, dayIndexOf, isDueAt, isProtege, isSlow, overdueBy, speedCat } from './engine'

// 學習引擎（2026-11-03 T-76 第 3 層簡化）：只留熟練度、到期複習、作答紀錄用到的狀態，和每個遊戲玩過幾次。
// 舊的成長系統（年段、支線與階梯、每週新概念額度、負擔控制、程度校準、主題式冒險的挑題）只有舊的站點、冒險在用，
// 孩子端 2026-10-31 起就走不到了，這次拿掉；要找回來從 git 歷史救（T-76 第 3 層之前的 src/lib/adaptive.ts）。

// 技能熟練度與遊戲的遊玩次數都很小，開機時整份載入記憶體，畫面就能同步取用
const skills = new Map<string, Skill>()
const levels = new Map<string, GameLevel>()
/** 熟練度改過幾次：lib/words.ts 從熟練度推算「教過哪些字」時拿來判斷要不要重算 */
let skillsVer = 0
export const skillsVersion = () => skillsVer

/** 有玩的日子（作答紀錄的日期） */
const playDates = new Set<string>()
/** 每一類題目最近幾次「第一次就答對」的反應時間 */
const speed = new Map<string, number[]>()

/** 開機時讀多久以內的紀錄來推算速度 */
const LOOKBACK_DAYS = 60

export async function loadAdaptive() {
  ;(await db.skills.toArray()).forEach((s) => skills.set(s.key, s))
  skillsVer++
  ;(await db.levels.toArray()).forEach((l) => levels.set(l.key, l))
  ;((await db.attempts.orderBy('date').uniqueKeys()) as string[]).forEach((d) => playDates.add(d))

  const since = today(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000))
  const recent = await db.attempts.where('date').aboveOrEqual(since).sortBy('ts')
  for (const a of recent) if (a.phase === 'quiz' || a.phase == null) noteSpeed(a)
}

export function skill(key: string): Skill {
  return skills.get(key) ?? { key, box: 0, seen: 0, firstTry: 0, streak: 0, lastTs: 0 }
}

// ── 有玩的日子 ───────────────────────────────────────────────
/** 今天是第幾個有玩的日子 */
export const dayIndex = () => dayIndexOf(playDates, today())
const notePlayDay = () => playDates.add(today())

export const isDue = (key: string) => isDueAt(skill(key), dayIndex())

/** 今天到期、該複習的已熟技能（越久沒確認的越前面） */
export function dueSkills(): Skill[] {
  const day = dayIndex()
  return [...skills.values()].filter((s) => isDueAt(s, day)).sort((a, b) => overdueBy(b, day) - overdueBy(a, day))
}

// ── 又對又快 ─────────────────────────────────────────────────
function noteSpeed(a: Pick<Attempt, 'game' | 'skill' | 'firstTryCorrect' | 'hintUsed' | 'responseMs' | 'metrics'>) {
  if (!a.firstTryCorrect || a.hintUsed || isProtege(a) || !(a.responseMs > 0)) return
  const cat = speedCat(a.game, a.skill)
  if (!cat) return
  speed.set(cat, [...(speed.get(cat) ?? []), a.responseMs].slice(-SPEED_WINDOW))
}

/** 這一類題目目前的速度樣本 */
const speedWindow = (game: string, skillKey: string) => speed.get(speedCat(game, skillKey) ?? '') ?? []

export interface SkillInput {
  game: string
  responseMs: number
  hintUsed: boolean
  metrics?: Record<string, number>
}

/**
 * 熟練度分 0–5 格（只採計「自己答」）：
 * - 第一次就答對，而且沒有比他自己這類題目的移動中位數明顯慢 → 往上一格；
 *   答對但明顯偏慢 → 維持原格（功文式：又對又快才算熟練）。
 * - 答錯 → 退一格。
 * - 已熟（3 格以上）的技能排到期複習：依序隔 1、2、4、7、14 個有玩的日子。
 *   到期那天答對就拉長間隔；答錯就降一格、隔天再考，間隔從頭開始。
 * - 延遲提示亮了才答對（softHint）：不算第一次答對，但也不退格。
 * - 探測題答錯、Sam 教豆豆：不改熟練度（舊資料的標記；前者是用比較難的題型考學過的內容，後者是另一種題型）。
 */
export function recordSkill(key: string, firstTry: boolean, info?: SkillInput) {
  const m = info?.metrics
  if (m?.protege) return
  if (m?.probe && !firstTry) return
  notePlayDay()
  const s = { ...skill(key) }
  const day = dayIndex()
  const wasMastered = s.box >= MASTERED_BOX
  const due = wasMastered && isDueAt(s, day)
  const slow = !!info && firstTry && isSlow(speedWindow(info.game, key), info.responseMs)
  s.seen++
  s.lastTs = Date.now()
  if (firstTry) {
    s.firstTry++
    s.streak++
    if (slow) s.slow = (s.slow ?? 0) + 1
    else s.box = Math.min(5, s.box + 1)
  } else {
    s.streak = 0
    if (!m?.softHint) s.box = Math.max(0, s.box - 1)
  }
  if (info) noteSpeed({ ...info, skill: key, firstTryCorrect: firstTry })

  // 到期複習的排程
  if (s.box >= MASTERED_BOX) {
    if (!wasMastered) {
      s.rev = 0
      s.due = day + REVIEW_DAYS[0]
    } else if (!firstTry) {
      s.rev = 0
      s.due = day + 1
      if (due) s.lastReview = { day, ts: s.lastTs, result: 'no' }
    } else if (due) {
      const rev = slow ? (s.rev ?? 0) : Math.min(REVIEW_DAYS.length - 1, (s.rev ?? 0) + 1)
      s.rev = rev
      s.due = day + REVIEW_DAYS[rev]
      s.lastReview = { day, ts: s.lastTs, result: slow ? 'slow' : 'ok' }
    }
  } else if (wasMastered) {
    // 複習答錯、掉出已熟：回到一般的練習，重新熟了再排複習
    s.lastReview = due ? { day, ts: s.lastTs, result: 'no' } : s.lastReview
    delete s.rev
    delete s.due
  }
  skills.set(key, s)
  skillsVer++
  void db.skills.put(s)
}

export const mastered = (key: string) => skill(key).box >= MASTERED_BOX

/**
 * 從沒在「自己答」出現過的內容：要先教才能考。
 * 教學卡、一起練都不算（seen 只在自己答時加一）；教完之後的那一題自己答做完，才算學過。
 */
export const isNew = (key: string) => skill(key).seen === 0

// ── 遊戲玩過幾次 ─────────────────────────────────────────────
const blankLevel = (game: string): GameLevel => ({ key: game, level: 1, up: 0, down: 0, plays: 0, lastTs: 0 })

/** 遊戲現在的難度（孩子點得到的遊戲只剩自由畫畫，一直是 1；舊資料的站點遊戲照存下來的） */
export function level(game: string): number {
  return levels.get(game)?.level ?? 1
}

/** 每個遊戲開始時呼叫：記一次遊玩 */
export function markPlayed(game: string) {
  notePlayDay()
  const l: GameLevel = { ...(levels.get(game) ?? blankLevel(game)) }
  l.plays++
  l.lastTs = Date.now()
  levels.set(l.key, l)
  void db.levels.put(l)
}

/** 這個遊戲玩過幾次（markPlayed 之前讀，0 代表第一次玩，一定要示範） */
export const plays = (game: string) => levels.get(game)?.plays ?? 0
