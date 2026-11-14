// 英文的 4 歲內容（T-150 E，設計稿 docs/T-150-4歲階段設計.md 第二節案 A、第四節 3-1 案 A、3-2 案 A）：熟練了才自動開的「門」。
// 純函式（不碰資料庫、不碰畫面），scripts/test-abc.ts 直接測；存取和畫面在 ./Play.tsx，家長區（T-150 P）只讀 gates()。
//
// 兩道門（同一科一天最多開一道，先開上面那道）：
//   en-more   更多單字：字母遊戲時間的「新朋友」，教那個字母的第 3 個字（data.ts 的 words[2]）。
//             門：聽字找圖（enword:）照 lib/readiness.ts 的 mastery 熟練（整組當一個技能：最近 10 題對 8 題、分在 3 天以上、
//             有一個字隔 2 天再考還對），而且最近 20 題（3 選 1）≥ 80%、分在 3 天以上。
//             門開了以後每個字母分開：那個字母教過的 2 個字都「答得出」（knownWords）才教第 3 個；一天最多 1 個新字。
//   en-onset  開頭音：字母遊戲時間的第三種遊戲「聽開頭」（./Pair.tsx 的 onset 回合）。
//             門：同上的 mastery，最近 20 題 ≥ 85%、分在 3 天以上，而且「答得出的字」分布在 ≥ 4 個開頭音。
//             不是 T-147 拿掉的 3 歲開頭題（phonics:）：skill 用新前綴 onset:，一定要等門開。
// 開了不關（不會因為後來答錯又關掉）；答不好時內容自己退一級（開頭音）：
//   - 第 2 級（平常）：一起做 1 回合（2 選 1，手指著答案）＋ 自己做 3 回合（3 選 1，才記熟練）。
//   - 自己做最近 6 題（2 週內）第一次就對 ≤ 3 題 → 退回第 1 級：示範 1 回合 ＋ 自己做 3 回合 2 選 1（只是練習）。
//     第 1 級的 2 選 1 最近 6 題第一次就對 ≥ 4 題 → 回到第 2 級。
//   - 第一次玩（門剛開那一次）：示範 1 ＋ 一起做 3（都不記熟練）。
// 怎麼混著出（避免一下子變難）：
//   - 頭 14 天（任何一道門剛開）：一次字母遊戲時間最多 1 個 4 歲回合——有新朋友就不玩聽開頭；聽開頭每 3 天最多 1 次。
//   - 14 天以後：聽開頭隔 2 天就可以再玩（跟放進籃子、翻翻卡輪流），新朋友照樣一天最多 1 個。
// 暫停：家長區的「暫停英文 4 歲內容」寫 kv 的 PAUSE_KEY（true＝暫停）：照 3 歲的玩、門不會開、第 3 個字也先不用。
// 緊急開關：STAGE4_ON 改成 false 重新部署，門全部當作關。
import { isLed, phaseOf, type Attempt } from '../../lib/db'
import { MIN_DAYS, NEED_RIGHT, RECENT, RETAIN_GAP_DAYS, counts, mastery, recentRate } from '../../lib/readiness'

/** 4 歲內容總開關（緊急時改 false：門全部當作關，孩子端回到 3 歲的內容） */
export const STAGE4_ON = true
/** 門的狀態（Stage4Kv）存在這個 kv；家長重置學習進度時跟著清掉，門回到關 */
export const STAGE4_KEY = 'lesson.english.stage4'
/** 家長區的「暫停英文 4 歲內容」：kv 存 true 就暫停（沒有＝不暫停） */
export const PAUSE_KEY = 'stage4.paused.en'

/** 剛開的頭幾天（少量混著出） */
export const FRESH_DAYS = 14
/** 退一級：最近幾題、第一次就對 ≤ 幾題、只看最近幾天 */
export const BACK_OF = 6
export const BACK_MAX_RIGHT = 3
export const BACK_DAYS = 14
/** 聽字找圖最近幾題的正確率（設計稿第二節的表） */
export const RATE_N = 20
export const MORE_PCT = 80
export const ONSET_PCT = 85
/** 答得出的字要分布在幾個開頭音以上，才開聽開頭 */
export const ONSET_SPREAD = 4
/** 聽開頭隔幾天才再玩：剛開（頭 14 天）每 3 天最多 1 次，之後隔 2 天 */
export const ONSET_GAP_FRESH = 3
export const ONSET_GAP = 2

export type GateId = 'en-more' | 'en-onset'
/** 兩道門，照開的順序 */
export const GATE_IDS: readonly GateId[] = ['en-more', 'en-onset']
const LABEL: Record<GateId, string> = { 'en-more': '英文 更多單字（第 3 個字）', 'en-onset': '英文 聽開頭的音' }

/** 一道門（三科同一個形狀，家長區 T-150 P 照這個顯示） */
export interface Gate {
  id: string
  label: string
  open: boolean
  /** 開的那一天（YYYY-MM-DD） */
  openedOn?: string
  /** 還差什麼（開了的話是現在的狀況，例如退一級了） */
  need: string
  /** 現在的難度級：en-onset 1＝示範＋2 選 1、2＝自己做 3 選 1 */
  level?: number
}

export interface MoreKv {
  opened: string
  /** 教到第 3 個字的字母（A: 3） */
  taught?: Record<string, 3>
  /** 最近一次教新朋友的那一天（一天最多 1 個） */
  lastNew?: string
}
export interface OnsetKv {
  opened: string
  /** 1 退一級（示範＋2 選 1）、2 平常（一起做 1 ＋ 自己做 3 選 1）；沒有＝2 */
  level?: 1 | 2
  /** 最近一次退一級的那一天：之後的作答才拿來判斷升回去、再退 */
  downOn?: string
  /** 玩完幾次聽開頭（0 次：第一次玩是示範＋一起做） */
  plays?: number
  /** 最近一次玩完聽開頭的那一天 */
  lastPlay?: string
}
export interface Stage4Kv {
  'en-more'?: MoreKv
  'en-onset'?: OnsetKv
}

const dayNo = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}
const daysBetween = (a: string, b: string) => dayNo(b) - dayNo(a)
/** 開門以後第幾天還算「剛開」 */
export const isFresh = (g: { opened: string } | undefined, today: string) => !!g && daysBetween(g.opened, today) < FRESH_DAYS
/** 任何一道門剛開 */
export const anyFresh = (kv: Stage4Kv, today: string) => GATE_IDS.some((id) => isFresh(kv[id], today))

// ── 開頭音：哪些字可以拿來問、哪些開頭容易混 ──────────────────

/**
 * 開頭的音不是字母本來的短音、或念法不規則的字：不拿來問開頭音、也不當干擾圖
 * （x-ray 開頭是 /ɛ/、unicorn 是 /j/、ice cream 是長母音、queen／quiet 是 /kw/；up、question 看圖認不出來）
 */
const NO_ONSET = new Set(['x-ray', 'unicorn', 'ice-cream', 'up', 'question', 'queen', 'quiet'])
/** 沒有字母音音檔的字母（q、v、x：ph.<x>.sound 只念字母名） */
const NO_SOUND = new Set(['q', 'v', 'x'])
/** 容易混的開頭（設計稿 3-2 第 5 條）：同一組的不放同一題。短母音彼此都算容易混 */
export const CONFUSE: readonly string[][] = [['b', 'p'], ['d', 't'], ['m', 'n'], ['f', 'v'], ['s', 'z'], ['c', 'k', 'q'], ['g', 'j'], ['j', 'y'], ['a', 'e', 'i', 'o', 'u']]
/** 開頭可以拉長、好聽出來的（設計稿 3-2 第 6 條）：出題時先挑 */
export const EASY_ONSET = new Set(['m', 's', 'f', 'l', 'a', 'o', 'n', 'r'])

/** 一個字（wordId，例：apple、fire-truck）的開頭音（字母小寫）；不拿來問開頭音的回傳 null */
export function onsetOf(id: string): string | null {
  if (NO_ONSET.has(id)) return null
  const l = id[0]
  return /[a-z]/.test(l) && !NO_SOUND.has(l) ? l : null
}
/** 兩個開頭音差很遠（不一樣、也不在同一組容易混的） */
export const farApart = (a: string, b: string) => a !== b && !CONFUSE.some((g) => g.includes(a) && g.includes(b))

// ── 答得出的字（設計稿第四節共同前提）─────────────────────────

const isWord = (a: Attempt) => a.skill.startsWith('enword:')
const isOnset = (a: Attempt) => a.skill.startsWith('onset:')
const byTs = (x: Attempt, y: Attempt) => x.ts - y.ts

/**
 * 他答得出的字（wordId）：聽字找圖（enword:<字>）3 選 1、聽完才點、自己做（readiness.counts）第一次就對至少 2 次、分在 2 天以上，
 * 而且最近一次（聽完、不是手帶著做的）沒答錯。比 mastery 寬一點：這是挑哪些字可以拿來用，不是開門。
 */
export function knownWords(attempts: readonly Attempt[]): Set<string> {
  const by = new Map<string, Attempt[]>()
  for (const a of attempts) {
    if (!isWord(a) || phaseOf(a) === 'teach') continue
    const xs = by.get(a.skill) ?? []
    xs.push(a)
    by.set(a.skill, xs)
  }
  const out = new Set<string>()
  for (const [skill, xs] of by) {
    const good = xs.filter((a) => counts(a) && a.firstTryCorrect)
    if (good.length < 2 || new Set(good.map((a) => a.date)).size < 2) continue
    const last = xs.filter((a) => a.heard !== false && !isLed(a)).sort(byTs).pop()
    if (last && !last.firstTryCorrect) continue
    out.add(skill.slice('enword:'.length))
  }
  return out
}

// ── 熟練（沿用 readiness.mastery）─────────────────────────────

export interface Firm {
  ok: boolean
  need: string
}

/**
 * 聽字找圖整組（所有 enword:<字>）照 readiness.mastery 判斷：最近 10 題、對幾題、幾天把整組當同一個技能算；
 * 「隔 2 天再考還對」看每一個字自己的（整組合起來天天都有練，永遠不會「隔 2 天」）。
 */
export function wordsFirm(attempts: readonly Attempt[]): Firm {
  const mine = attempts.filter(isWord)
  const pool = mastery(
    mine.map((a) => ({ ...a, skill: 'enword:' })),
    'enword:',
  )
  const retained = [...new Set(mine.map((a) => a.skill))].some((s) => mastery(mine, s).retained)
  const lacks: string[] = []
  if (pool.recent < RECENT) lacks.push(`還要再答 ${RECENT - pool.recent} 題`)
  else if (pool.right < NEED_RIGHT) lacks.push(`最近 ${RECENT} 題對 ${pool.right} 題（要 ${NEED_RIGHT} 題）`)
  if (pool.days < MIN_DAYS) lacks.push(`分在 ${pool.days} 天（要 ${MIN_DAYS} 天）`)
  if (!retained) lacks.push(`還沒有隔 ${RETAIN_GAP_DAYS} 天再考還對`)
  return { ok: !lacks.length, need: lacks.join('、') }
}

/** 聽字找圖的門檻：mastery 熟練，最近 20 題（3 選 1、聽完、自己做）≥ pct%、分在 3 天以上 */
function wordsReady(attempts: readonly Attempt[], pct: number): Firm {
  const firm = wordsFirm(attempts)
  const rate = recentRate(attempts, isWord, RATE_N)
  const last = attempts.filter((a) => isWord(a) && counts(a)).sort(byTs).slice(-RATE_N)
  const days = new Set(last.map((a) => a.date)).size
  const p = rate.n ? Math.round((100 * rate.right) / rate.n) : 0
  const lacks = [
    !firm.ok && `聽字找圖還在練（${firm.need}）`,
    (rate.n < RATE_N || p < pct) && `聽字找圖 3 選 1 最近 ${rate.n} 題對 ${p}%（要 ${RATE_N} 題、${pct}%）`,
    days < MIN_DAYS && `最近 ${RATE_N} 題分在 ${days} 天（要 ${MIN_DAYS} 天）`,
  ].filter(Boolean)
  return { ok: !lacks.length, need: lacks.join('；') }
}

/** 更多單字的門（全局；每個字母另外看 knownWords） */
export const moreReady = (attempts: readonly Attempt[]) => wordsReady(attempts, MORE_PCT)

/** 答得出、可以拿來問開頭音的字，分布在幾個開頭音 */
export const onsetSpread = (known: ReadonlySet<string>) => new Set([...known].map(onsetOf).filter(Boolean)).size

/** 開頭音的門 */
export function onsetReady(attempts: readonly Attempt[]): Firm {
  const w = wordsReady(attempts, ONSET_PCT)
  const spread = onsetSpread(knownWords(attempts))
  const lacks = [w.need, spread < ONSET_SPREAD && `答得出的字只有 ${spread} 種開頭音（要 ${ONSET_SPREAD} 種）`].filter(Boolean)
  return { ok: !lacks.length, need: lacks.join('；') }
}

/** 聽開頭自己做的回合（不是示範、不是手帶著做、聽完才點）；n3：只要 3 選 1 的 */
const onsetSolo = (a: Attempt, n3: boolean) => isOnset(a) && phaseOf(a) === 'quiz' && a.heard !== false && !isLed(a) && (n3 ? counts(a) : true)

/** 聽開頭現在第幾級要不要變（進字母遊戲時間時算一次） */
export function onsetLevel(attempts: readonly Attempt[], g: OnsetKv, today: string): OnsetKv {
  const level = g.level ?? 2
  const from = g.downOn ?? ''
  const recent = (n3: boolean) =>
    attempts
      .filter((a) => onsetSolo(a, n3) && a.date > from && daysBetween(a.date, today) < BACK_DAYS)
      .sort(byTs)
      .slice(-BACK_OF)
  if (level === 2) {
    const xs = recent(true)
    if (xs.length >= BACK_OF && xs.filter((a) => a.firstTryCorrect).length <= BACK_MAX_RIGHT) return { ...g, level: 1, downOn: today }
    return g
  }
  // 第 1 級：退了以後的 2 選 1，最近 6 題第一次就對 ≥ 4 題 → 回到第 2 級（一樣的門檻）
  const xs = recent(false).filter((a) => (a.options?.length ?? 0) === 2)
  if (xs.length >= BACK_OF && xs.filter((a) => a.firstTryCorrect).length > BACK_MAX_RIGHT) return { ...g, level: 2, downOn: today }
  return g
}

// ── 進字母遊戲時間時更新門 ────────────────────────────────────

/**
 * 進字母遊戲時間時算一次（./Play.tsx）：該開的門開、聽開頭該退就退、該升回去就升。回傳新的 kv（沒變就是同一個物件）。
 * 暫停中、總開關關著：不開門、不動。同一天最多開一道門。
 */
export function advance(kv: Stage4Kv, attempts: readonly Attempt[], today: string, paused = false): Stage4Kv {
  if (!STAGE4_ON || paused) return kv
  let out = kv
  let openedToday = GATE_IDS.some((id) => kv[id]?.opened === today)
  if (!kv['en-more'] && !openedToday && moreReady(attempts).ok) {
    out = { ...out, 'en-more': { opened: today } }
    openedToday = true
  }
  const O = kv['en-onset']
  if (!O) {
    if (!openedToday && onsetReady(attempts).ok) out = { ...out, 'en-onset': { opened: today, plays: 0 } }
  } else {
    const next = onsetLevel(attempts, O, today)
    if (next !== O) out = { ...out, 'en-onset': next }
  }
  return out
}

// ── 這一次字母遊戲時間出什麼 ──────────────────────────────────

/** 教到第 3 個字的字母（暫停中、總開關關著：沒有，照 3 歲的只用 2 個字） */
export function moreSet(kv: Stage4Kv, paused = false): ReadonlySet<string> {
  if (!STAGE4_ON || paused || !kv['en-more']) return new Set()
  return new Set(Object.keys(kv['en-more'].taught ?? {}))
}

/** 今天還可以教新朋友嗎（門開了、沒暫停、今天還沒教過） */
export const canTeachNew = (kv: Stage4Kv, today: string, paused = false) => STAGE4_ON && !paused && !!kv['en-more'] && kv['en-more'].lastNew !== today

/** 教完一個新朋友（純函式） */
export function afterNewWord(kv: Stage4Kv, L: string, today: string): Stage4Kv {
  const m = kv['en-more']
  if (!m) return kv
  return { ...kv, 'en-more': { ...m, taught: { ...(m.taught ?? {}), [L]: 3 }, lastNew: today } }
}

/**
 * 這一次要不要玩聽開頭：門開了、沒暫停、今天第一次玩字母遊戲時間、離上次玩聽開頭夠久（剛開 3 天、之後 2 天）；
 * 頭 14 天這一次已經有新朋友（4 歲回合）就不玩。
 */
export function onsetToday(kv: Stage4Kv, today: string, sessionsToday: number, newWord: boolean, paused = false): boolean {
  const g = kv['en-onset']
  if (!STAGE4_ON || paused || !g || sessionsToday > 0) return false
  if (newWord && anyFresh(kv, today)) return false
  const gap = isFresh(g, today) ? ONSET_GAP_FRESH : ONSET_GAP
  return !g.lastPlay || daysBetween(g.lastPlay, today) >= gap
}

/** 聽開頭這一次怎麼玩：intro 第一次（示範＋一起做 3）、1 退一級（示範＋自己做 2 選 1）、2 平常（一起做 1 ＋ 自己做 3 選 1） */
export type OnsetMode = 'intro' | 1 | 2
export const onsetMode = (g: OnsetKv | undefined): OnsetMode => (!g || !g.plays ? 'intro' : (g.level ?? 2))

/** 玩完一次聽開頭（純函式） */
export function afterOnset(kv: Stage4Kv, today: string): Stage4Kv {
  const g = kv['en-onset']
  if (!g) return kv
  return { ...kv, 'en-onset': { ...g, plays: (g.plays ?? 0) + 1, lastPlay: today } }
}

// ── 家長區看的 ────────────────────────────────────────────────

/** 每道門現在怎樣（家長區 T-150 P 讀；不改 kv） */
export function gates(attempts: readonly Attempt[], kv: Stage4Kv, today: string): Gate[] {
  void today
  return GATE_IDS.map((id): Gate => {
    if (id === 'en-more') {
      const g = STAGE4_ON ? kv['en-more'] : undefined
      if (g) {
        const ls = Object.keys(g.taught ?? {}).sort()
        return { id, label: LABEL[id], open: true, openedOn: g.opened, need: ls.length ? `已經認識第 3 個字的字母：${ls.join('、')}` : '某個字母的 2 個字都答得出來，就在字母遊戲時間認識它的第 3 個字' }
      }
      return { id, label: LABEL[id], open: false, need: STAGE4_ON ? moreReady(attempts).need || '下次玩字母遊戲時間就開' : '4 歲內容總開關關著' }
    }
    const g = STAGE4_ON ? kv['en-onset'] : undefined
    if (g) {
      const level = g.level ?? 2
      return { id, label: LABEL[id], open: true, openedOn: g.opened, level, need: level === 1 ? '最近答得不太好，先回到有示範的 2 選 1；再答穩就回到 3 選 1' : '' }
    }
    const need = !STAGE4_ON
      ? '4 歲內容總開關關著'
      : !kv['en-more']
        ? `更多單字開了以後才開；${onsetReady(attempts).need || '條件已經到了'}`
        : onsetReady(attempts).need || '下次玩字母遊戲時間就開'
    return { id, label: LABEL[id], open: false, need }
  })
}
