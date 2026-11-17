// 影子配對（T-160，家長 2026-11-17 要求；指引 CG-1 配對）：出題、升降級。純函式，scripts/test-match.ts 直接測；畫面在 ./Shadow.tsx。
// 場景上面一排黑影，下面托盤放彩色的東西（每一樣都不在自己影子的正下方），把東西拖到（或點一下再點）對的影子上。
// 級數：2 個影子 → 3 → 4 → 4 個裡有兩個輪廓很像的（貓和狗、湯匙和叉子）→ 輪廓很像，而且影子朝另一邊（左右翻過來）。熟練了才往上。
// 圖從 ../match/catalog.ts 有標 s（輪廓認得出來）的挑；背景是故事插畫的場景（src/art/storybook/scenes.tsx，15 種）。
import { stepLevel, type LevelState } from '../logic/sort-plan'
import { MATCH_PICS, type MatchPic, type MatchThemeId } from '../match/catalog'
import type { SceneId } from '../../art/storybook/layout'

export type ShadowLevel = 1 | 2 | 3 | 4 | 5
export const SHADOW_MAX: ShadowLevel = 5
/** 每一級幾個影子 */
export const SHADOW_COUNT: Record<ShadowLevel, number> = { 1: 2, 2: 3, 3: 4, 4: 4, 5: 4 }
/** 第 4 級起：有兩個輪廓很像的 */
export const LOOKALIKE_FROM: ShadowLevel = 4
/** 第 5 級：影子左右翻過來 */
export const FLIP_FROM: ShadowLevel = 5
export const shadowSkill = (level: ShadowLevel) => (level >= FLIP_FROM ? 'shadow:flip' : level >= LOOKALIKE_FROM ? 'shadow:alike' : `shadow:${SHADOW_COUNT[level]}`)
export const SHADOW_GAME = 'logic-shadow'

/** 影子配對用得到的圖（輪廓認得出來的） */
export const SHADOW_PICS: MatchPic[] = MATCH_PICS.filter((p) => p.shadow)

/**
 * 背景場景（故事插畫），每個場景配幾個主題的東西（在農場找農場的動物）；配不夠就從全部挑。
 * base：場景的底色（天空、牆壁，照 src/art/storybook/scenes.tsx）。影子那一片（全寬、鋪到托盤底下）鋪這個顏色，
 * 把雲、吊車、大樓、窗戶、相框這些裝飾蓋掉（PM 2026-11-17：裝飾壓在影子後面，孩子分不清哪裡是影子），場景只留托盤周圍的地面。
 */
export const SHADOW_SCENES: { id: SceneId; base: string; zh: string; themes: MatchThemeId[] }[] = [
  { id: 'park', base: '#E3EEF2', zh: '公園', themes: ['toys', 'sports', 'plants', 'birds'] },
  { id: 'meadow', base: '#E3EEF2', zh: '草地', themes: ['bugs', 'plants', 'forest', 'birds'] },
  { id: 'city', base: '#E3EEF2', zh: '城市', themes: ['road', 'fun', 'clothes'] },
  { id: 'valley', base: '#EDEAD8', zh: '恐龍谷', themes: ['dino', 'plants', 'birds'] },
  { id: 'farm', base: '#E3EEF2', zh: '農場', themes: ['farm', 'veggies', 'fruit'] },
  { id: 'sea', base: '#E3EEF2', zh: '大海', themes: ['ocean', 'skywater'] },
  { id: 'beach', base: '#E3EEF2', zh: '海邊', themes: ['ocean', 'skywater', 'sports', 'toys'] },
  { id: 'rain', base: '#D3DCE4', zh: '下雨天', themes: ['sky', 'clothes', 'bugs'] },
  { id: 'market', base: '#E3EEF2', zh: '市場', themes: ['fruit', 'veggies', 'snacks', 'kitchen'] },
  { id: 'zoo', base: '#E3EEF2', zh: '動物園', themes: ['wild', 'birds'] },
  { id: 'site', base: '#E3EEF2', zh: '工地', themes: ['tools', 'road'] },
  { id: 'bedroom', base: '#E7E3F2', zh: '臥室', themes: ['toys', 'clothes', 'music', 'home'] },
  { id: 'party', base: '#F7E8D8', zh: '派對', themes: ['snacks', 'toys', 'music'] },
  { id: 'home', base: '#F3EAD8', zh: '客廳', themes: ['home', 'kitchen', 'tools'] },
  { id: 'ark-in', base: '#E9D3AE', zh: '大船裡', themes: ['farm', 'wild', 'forest'] },
]

/** 記住最近幾局的場景、東西 */
export const RECENT_SCENES = 4
export const RECENT_ITEMS = 40
/** 一局順利：放錯 ≤ 這個數、沒有手帶著放 */
export const OK_WRONGS = 1
/** 升級：連續幾局順利 */
export const UP_AFTER = 2

type Rnd = () => number

const shuffle = <T,>(a: readonly T[], rnd: Rnd): T[] => {
  const o = [...a]
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1)
    ;[o[i], o[j]] = [o[j], o[i]]
  }
  return o
}

export function pickScene(recent: readonly string[], rnd: Rnd = Math.random) {
  const last = recent.slice(-RECENT_SCENES)
  const pool = SHADOW_SCENES.filter((s) => !last.includes(s.id))
  return pool[Math.floor(rnd() * pool.length) % pool.length]
}

/** 輪廓很像的兩樣能不能放在同一題：同一組 */
const alike = (a: MatchPic, b: MatchPic) => !!a.look && a.look === b.look

/**
 * 挑 n 樣：
 * - 場景的主題優先，不在最近用過的裡（不夠才放寬）；名字不重複。
 * - 第 1～3 級：沒有兩樣輪廓很像（一眼分得出來）。
 * - 第 4 級起：先挑一組輪廓很像的兩樣，其餘的跟它們、跟彼此都不像。
 */
export function pickItems(level: ShadowLevel, themes: readonly MatchThemeId[], recent: readonly string[], rnd: Rnd = Math.random): MatchPic[] {
  const n = SHADOW_COUNT[level]
  const inScene = (p: MatchPic) => themes.includes(p.theme)
  const fresh = (p: MatchPic) => !recent.includes(p.id)
  // 偏好順序：場景的＋沒用過 → 沒用過 → 場景的 → 全部
  const tiers = [SHADOW_PICS.filter((p) => inScene(p) && fresh(p)), SHADOW_PICS.filter((p) => !inScene(p) && fresh(p)), SHADOW_PICS.filter((p) => inScene(p) && !fresh(p)), SHADOW_PICS.filter((p) => !inScene(p) && !fresh(p))].map((t) => shuffle(t, rnd))
  const ranked = tiers.flat()
  const out: MatchPic[] = []
  if (level >= LOOKALIKE_FROM) {
    // 一組輪廓很像的：兩樣都沒用過的優先（排在最前面、有同組夥伴的），找不到才用最近用過的
    const pairIn = (pool: MatchPic[]) => {
      for (const a of pool) {
        const b = a.look ? pool.find((q) => q !== a && alike(a, q) && q.en !== a.en) : undefined
        if (b) return [a, b]
      }
      return null
    }
    out.push(...(pairIn(ranked.filter(fresh)) ?? pairIn(ranked) ?? []))
  }
  for (const p of ranked) {
    if (out.length >= n) break
    if (out.some((q) => q.id === p.id || q.en === p.en || alike(q, p))) continue
    out.push(p)
  }
  return shuffle(out, rnd)
}

/** 托盤的順序（托盤第 k 格放第 o[k] 個東西）：洗牌，每一樣都不在自己影子的正下方（o[k] ≠ k） */
export function trayOrder(n: number, rnd: Rnd = Math.random): number[] {
  const ids = Array.from({ length: n }, (_, i) => i)
  for (let k = 0; k < 200; k++) {
    const o = shuffle(ids, rnd)
    if (o.every((x, i) => x !== i)) return o
  }
  return ids.map((i) => (i + 1) % n)
}

export interface ShadowRound {
  level: ShadowLevel
  scene: SceneId
  /** 影子由左到右是哪些東西 */
  items: string[]
  /** 托盤第 k 格放第 tray[k] 個東西 */
  tray: number[]
  /** 影子左右翻過來 */
  flip: boolean
  /** 影子稍微高低錯開（-1～1，畫面再乘上可以挪的距離）：不像排好的一排 */
  bob: number[]
}

export function shadowRound(level: ShadowLevel, s: Pick<ShadowState, 'scenes' | 'items'>, rnd: Rnd = Math.random): ShadowRound {
  const sc = pickScene(s.scenes, rnd)
  const items = pickItems(level, sc.themes, s.items, rnd)
  return { level, scene: sc.id, items: items.map((p) => p.id), tray: trayOrder(items.length, rnd), flip: level >= FLIP_FROM, bob: items.map(() => rnd() * 2 - 1) }
}

// ── 進度 ─────────────────────────────────────────────────────

export interface ShadowState extends LevelState {
  streak: number
  scenes: string[]
  items: string[]
}

export function normalizeShadow(raw: unknown): ShadowState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ShadowState>
  const level = Number.isInteger(o.level) ? Math.min(SHADOW_MAX, Math.max(1, o.level as number)) : 1
  const recent = Array.isArray(o.recent) ? o.recent.filter((x) => x && typeof x.date === 'string').map((x) => ({ date: x.date, ok: !!x.ok })) : []
  const taught = Array.isArray(o.taught) ? o.taught.filter((x) => Number.isInteger(x)) : []
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-n) : [])
  const streak = Number.isInteger(o.streak) && (o.streak as number) > 0 ? (o.streak as number) : 0
  return { level, recent, taught, streak, scenes: strs(o.scenes, RECENT_SCENES), items: strs(o.items, RECENT_ITEMS) }
}

/** 玩完一局：記住場景、東西；連續 UP_AFTER 局順利升一級，退級照 stepLevel */
export function afterShadow(s: ShadowState, r: { round: ShadowRound; date: string; wrongs: number; shown: boolean; counted: boolean }): ShadowState {
  const base = {
    ...s,
    scenes: [...s.scenes, r.round.scene].slice(-RECENT_SCENES),
    items: [...s.items.filter((p) => !r.round.items.includes(p)), ...r.round.items].slice(-RECENT_ITEMS),
  }
  if (!r.counted) return base
  const ok = r.wrongs <= OK_WRONGS && !r.shown
  const streak = ok ? s.streak + 1 : 0
  if (ok && streak >= UP_AFTER && s.level < SHADOW_MAX) return { ...base, level: s.level + 1, recent: [], streak: 0 }
  const lv = stepLevel(s, { date: r.date, first: ok, counted: true }, SHADOW_MAX)
  return { ...base, level: lv.level, recent: lv.recent, streak: lv.level !== s.level ? 0 : streak }
}
