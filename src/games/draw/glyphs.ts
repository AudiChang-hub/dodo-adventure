import { needsDemo, pickPreferred, refreshLadder, rungOpen, teachable, withTargetFilter } from '../../lib/adaptive'
import { themeNow } from '../../lib/theme-play'

// 描數字、描字母的筆順：座標系 100 × 140，每一筆是一條 SVG 路徑，依序描
export const GLYPHS: Record<string, string[]> = {
  '1': ['M50 20 L50 120'],
  I: ['M50 20 L50 120', 'M30 20 L70 20', 'M30 120 L70 120'],
  L: ['M30 20 L30 120 L75 120'],
  T: ['M20 20 L80 20', 'M50 20 L50 120'],
  '7': ['M22 22 L78 22 L40 120'],
  H: ['M25 20 L25 120', 'M75 20 L75 120', 'M25 70 L75 70'],

  // 數字 0 和字母 O 一眼分得出來（V-23）：0 是瘦長的蛋形（寬 44、高 100），O 是正圓（直徑 74，加上跑道寬也不會碰到邊）
  '0': ['M50 20 C38 20 28 42 28 70 C28 98 38 120 50 120 C62 120 72 98 72 70 C72 42 62 20 50 20'],
  O: ['M50 33 C29.6 33 13 49.6 13 70 C13 90.4 29.6 107 50 107 C70.4 107 87 90.4 87 70 C87 49.6 70.4 33 50 33'],
  C: ['M80 35 C65 15 25 15 22 70 C25 125 65 125 80 105'],
  U: ['M25 20 L25 85 C25 130 75 130 75 85 L75 20'],
  V: ['M22 20 L50 120 L78 20'],
  A: ['M50 20 L22 120', 'M50 20 L78 120', 'M33 85 L67 85'],

  '4': ['M60 20 L20 90 L82 90', 'M60 20 L60 120'],
  E: ['M28 20 L28 120', 'M28 20 L75 20', 'M28 70 L68 70', 'M28 120 L75 120'],
  F: ['M28 20 L28 120', 'M28 20 L75 20', 'M28 70 L68 70'],
  N: ['M25 120 L25 20 L75 120 L75 20'],
  M: ['M18 120 L18 20 L50 80 L82 20 L82 120'],
  W: ['M15 20 L32 120 L50 50 L68 120 L85 20'],
  Z: ['M22 20 L78 20 L22 120 L78 120'],
  K: ['M28 20 L28 120', 'M75 20 L30 75 L75 120'],
  X: ['M22 20 L78 120', 'M78 20 L22 120'],
  Y: ['M22 20 L50 70 L78 20', 'M50 70 L50 120'],

  '2': ['M25 40 C30 10 78 12 75 45 C72 70 30 95 22 120 L80 120'],
  '3': ['M25 30 C40 10 78 15 72 48 C68 66 50 68 45 68 C55 68 80 72 78 98 C75 130 35 128 25 108'],
  '5': ['M72 20 L32 20 L28 65 C45 52 78 55 78 88 C78 125 35 128 25 108'],
  '6': ['M70 25 C55 12 25 20 24 75 C22 125 76 128 76 92 C76 60 35 60 25 85'],
  '8': ['M50 70 C20 62 25 20 50 20 C75 20 80 62 50 70 C15 78 20 120 50 120 C80 120 85 78 50 70'],
  '9': ['M75 50 C75 15 25 15 25 48 C25 80 75 80 75 50 L72 120'],
  B: ['M28 20 L28 120', 'M28 20 L55 20 C80 20 80 68 55 68 L28 68', 'M28 68 L58 68 C86 68 86 120 58 120 L28 120'],
  D: ['M28 20 L28 120', 'M28 20 L48 20 C88 20 88 120 48 120 L28 120'],
  P: ['M28 20 L28 120', 'M28 20 L55 20 C82 20 82 72 55 72 L28 72'],
  R: ['M28 20 L28 120', 'M28 20 L55 20 C82 20 82 72 55 72 L28 72', 'M50 72 L78 120'],
  S: ['M76 32 C66 12 24 14 26 44 C28 70 74 66 76 96 C78 128 32 130 22 106'],
  G: ['M80 38 C66 14 22 16 22 70 C22 126 80 126 80 80 L56 80'],
  J: ['M70 20 L70 95 C70 130 25 128 24 100'],
  Q: ['M50 33 C29.6 33 13 49.6 13 70 C13 90.4 29.6 107 50 107 C70.4 107 87 90.4 87 70 C87 49.6 70.4 33 50 33', 'M62 90 L84 118'],
}

/** 長得很像、同一回合不一起出的字（V-23：0 和 O） */
const LOOK_ALIKE: Record<string, string> = { '0': 'O', O: '0' }
export const lookAlike = (g: string): string | undefined => LOOK_ALIKE[g]

/**
 * 照運筆的發展順序分組（benchmark 手法 5）：直線 → 橫線 → 圓 → 十字 → 斜線。
 * 1. 只有直線、橫線與圓：1 I L T H 0 O C
 * 2. 直線＋橫線的多筆畫、直線＋弧線：E F U D P B J
 * 3. 連續的曲線（沒有斜線）：S G 3 5 6 8 9
 * 4. 有斜線的最後：A K V X Y Z N M W 4 7 2 R Q（約 5 歲才畫得好斜線）
 */
export const GLYPH_LEVELS = ['1ILTH0OC', 'EFUDPBJ', 'SG35689', 'AKVXYZNMW472RQ']

// ── 字的零件（V-24、成長系統設計 §2.4）────────────────────────
// 3 歲的目標是「看了示範之後畫出圓、直線」（DRAW-4），照筆順寫字母是 4～5 歲的事：
// 描數字字母的前兩級只描字的零件，字母、數字往後移到 3–6 級（GLYPH_LEVELS 的內容不變）。
// 座標系和字一樣 100 × 140；筆順照書寫習慣：由上往下、由左往右，圓從上面往左繞（和 O 一樣）
export const PARTS: Record<string, string[]> = {
  down: ['M50 25 L50 115'],
  across: ['M15 70 L85 70'],
  circle: GLYPHS.O,
  cross: ['M50 30 L50 110', 'M15 70 L85 70'],
  // 斜線像溜滑梯，兩個方向
  slide: ['M76 25 L24 115'],
  slide2: ['M24 25 L76 115'],
  // 半圓：開口朝右的月亮（⊂，像 C）、開口朝上的杯子（∪，像 U）
  moon: ['M78 32 C8 32 8 108 78 108'],
  cup: ['M20 35 C20 128 80 128 80 35'],
  // 轉角：L 和反過來的 ⅃
  corner: ['M30 25 L30 110 L78 110'],
  corner2: ['M70 25 L70 110 L22 110'],
}

/** 第 1 級：直線（直、橫）、圓、十字；第 2 級：斜線、半圓、轉角 */
export const PART_LEVELS = [['down', 'across', 'circle', 'cross'], ['slide', 'slide2', 'moon', 'cup', 'corner', 'corner2']]

/** 家長區用的中文名稱 */
export const PART_ZH: Record<string, string> = {
  down: '直線',
  across: '橫線',
  circle: '圓',
  cross: '十字',
  slide: '斜線 /',
  slide2: '斜線 \\',
  moon: '半圓 ⊂',
  cup: '半圓 ∪',
  corner: '轉角 L',
  corner2: '轉角 ⅃',
}

export const isPart = (g: string) => g in PARTS
export const strokesOf = (g: string) => PARTS[g] ?? GLYPHS[g]
/** 熟練度的技能代碼：零件是 part:x，字是 glyph:x */
export const glyphSkill = (g: string) => (isPart(g) ? `part:${g}` : `glyph:${g}`)

/** 這一級出哪些：1–2 級是零件（2 級含 1 級的複習），3 級以後是字（一路累積，和原本的 1–4 級一樣） */
export function glyphPool(lv: number): string[] {
  if (lv <= PART_LEVELS.length) return PART_LEVELS.slice(0, lv).flat()
  return [...GLYPH_LEVELS.slice(0, lv - PART_LEVELS.length).join('')]
}

// ── 什麼時候開放描字母（V-24、成長系統 §2.4）────────────────────
// 描字母是能力階梯的 H7：運筆小路（H1）、連點成圖（H2）兩階都完成，零件第 2 組（H6b）也完成，才開放（content/ladder.ts）。
// 不看年齡：運筆很穩的話，3 歲半也可以開始描字母。開了就一直開著（階開了不收回），之後運筆偶爾沒有第一次就完成，字母也不會又縮回零件。
// G-33 的暫時門檻（運筆小路 4 級、連點成圖 2 級、最近 5 次都第一次就完成）已經拿掉；用暫時門檻開過的舊資料，升級時算開放（lib/adaptive.ts 的 loadLadder）。

/** 描字母那一階 */
export const LETTER_RUNG = 'H7'

/** 現在能不能描字母（GlyphGame、scripts/sim-teach.ts 都看這個） */
export const lettersOpen = () => rungOpen(LETTER_RUNG)

/** 開局讀一次：先依現在的熟練度整理一次階梯，再看描字母那一階開了沒 */
export async function lettersOpenNow(): Promise<boolean> {
  refreshLadder()
  return lettersOpen()
}

/**
 * 實際出題的級數：描字母那一階還沒開，最多停在零件的級數；零件第 2 組（H6b）也還沒開，就停在第 1 組。
 * 舊資料已經升到字母的級數（或以前描過字母）也一樣，下次就出零件；這不是退步，不播降級的語音（家長區寫明原因）。
 */
export const glyphLevelCap = (open: boolean, maxLevel: number) => (open ? maxLevel : rungOpen('H6b') ? PART_LEVELS.length : 1)
export const glyphLevel = (stored: number, open: boolean, maxLevel: number) => Math.min(stored, glyphLevelCap(open, maxLevel))

/** 一局最多示範兩個新的（字或零件） */
export const GLYPH_MAX_DEMO = 2

/**
 * 挑這一回合描什麼（GlyphGame 和 scripts/sim-teach.ts 共用）：
 * 先教再考：這一局已經示範滿兩個新的，就只出學過的；新的一定先示範（手先描一次）再換孩子描。
 * recent：這一局描過的（新的在前）。剛描完的不連著出；描過 0 就不出 O（反過來也一樣，V-23）。
 */
export function planGlyph(game: string, lv: number, st: { firstPlay: boolean; demos: number; recent: string[] }, i: number) {
  // 剛描完的不連著再描一次（一局示範滿兩個、只剩學過的可以出時也一樣）
  const pool = glyphPool(lv).filter((x) => x !== st.recent[0] && !st.recent.some((r) => lookAlike(r) === x))
  // 主題式冒險先描主題的字（公車旅行的 B、C、O），這一級還沒有就照常挑
  const g = withTargetFilter(teachable(game, st.demos, GLYPH_MAX_DEMO), () =>
    pickPreferred(pool.filter((x) => themeNow()?.glyphs.includes(x)), pool, glyphSkill, st.recent),
  )
  return { g, isNew: needsDemo(st.firstPlay && i === 0, glyphSkill(g)) }
}
