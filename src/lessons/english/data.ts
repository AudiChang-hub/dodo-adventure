// 英文字母課的內容：A 到 Z 每個字母的念法（字母音）、三個開頭單字（配圖）、大小寫的筆順。
// 念法、圖、單字盡量沿用字母森林（content/letters.ts 的 PHONICS），學校照 A→Z 教，所以字母森林延後、沒教的字母在這裡補。
import { ALL_PHONICS, type PhonicsWord, type SoundUnit } from './letters-extra'
import { GLYPHS } from '../../games/draw/glyphs'

export const ORDER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export interface LessonLetter {
  /** 大寫 A */
  L: string
  /** 小寫 a */
  l: string
  unit: SoundUnit
  /** 三個這個字母開頭的單字（X 只有 x-ray 是開頭，另外兩個是字尾有 x 的字：選擇題不問 X 開頭） */
  words: [PhonicsWord, PhonicsWord, PhonicsWord]
  /** 單字真的是這個字母開頭的（「Which one starts with …?」只問這些） */
  starts: PhonicsWord[]
  /** 大寫的筆順（20～120，塗字母的泡泡字用） */
  upper: string[]
  /** 大寫放到四線格上（頂線到底線，描字用，T-132） */
  upperLined: string[]
  lower: string[]
}

// ── 小寫的筆順 ───────────────────────────────────────────────
// 座標系跟大寫一樣 100 × 140（content 見 games/draw/glyphs.ts）。四條線：上緣 18、中線 64、底線 110、下緣 132。
// 筆順照台灣幼兒園、小學的寫法：圓從右上往左繞；有直線的字先寫圓再寫直線（a、d、g、q）；i、j 的點最後寫（短短一筆，不是點一下）。
export const LOWER: Record<string, string[]> = {
  a: ['M70 74 C60 60 32 62 30 88 C28 112 58 116 70 98', 'M70 66 L70 110'],
  b: ['M30 18 L30 110', 'M30 84 C40 62 74 62 74 88 C74 114 40 114 30 96'],
  c: ['M72 74 C62 60 30 62 30 88 C30 114 62 116 72 104'],
  d: ['M70 74 C60 60 30 62 30 88 C30 114 60 116 70 98', 'M70 18 L70 110'],
  e: ['M30 88 L72 88 C72 66 34 60 30 86 C27 112 60 116 72 104'],
  f: ['M68 26 C58 14 40 18 40 36 L40 110', 'M24 66 L62 66'],
  g: ['M70 74 C60 60 30 62 30 86 C30 108 60 110 70 94', 'M70 66 L70 116 C70 134 40 134 32 124'],
  h: ['M30 18 L30 110', 'M30 86 C36 66 70 62 70 84 L70 110'],
  i: ['M50 66 L50 110', 'M50 34 L50 44'],
  j: ['M56 66 L56 116 C56 134 34 134 28 124', 'M56 34 L56 44'],
  k: ['M30 18 L30 110', 'M68 64 L32 92', 'M44 84 L70 110'],
  l: ['M50 18 L50 110'],
  m: ['M22 66 L22 110', 'M22 84 C26 64 50 62 50 82 L50 110', 'M50 82 C54 64 78 62 78 82 L78 110'],
  n: ['M30 66 L30 110', 'M30 86 C36 66 70 62 70 84 L70 110'],
  o: ['M50 64 C34 64 28 76 28 87 C28 100 34 112 50 112 C66 112 72 100 72 87 C72 76 66 64 50 64'],
  p: ['M30 66 L30 132', 'M30 84 C40 62 74 62 74 88 C74 114 40 114 30 96'],
  q: ['M70 74 C60 60 30 62 30 88 C30 114 60 116 70 98', 'M70 66 L70 132'],
  r: ['M32 66 L32 110', 'M32 88 C38 68 56 62 70 70'],
  s: ['M70 72 C62 60 32 62 34 78 C36 92 68 86 70 100 C72 116 38 118 30 104'],
  t: ['M46 26 L46 102 C46 112 56 114 66 108', 'M28 62 L64 62'],
  u: ['M30 66 L30 92 C30 116 70 116 70 92', 'M70 66 L70 110'],
  v: ['M28 66 L50 110 L72 66'],
  w: ['M18 66 L32 110 L50 74 L68 110 L82 66'],
  x: ['M30 66 L70 110', 'M70 66 L30 110'],
  y: ['M30 66 L50 106', 'M70 66 L44 132'],
  z: ['M30 66 L70 66 L30 110 L70 110'],
}
// 四條線（描字底下淡淡的格線）
export const LINES = { top: 18, mid: 64, base: 110, bottom: 132 }

/**
 * 大寫放到四線格上（T-132，家長：「大小寫都要有格線，這樣才知道大小寫的差異」）：學校的寫法，大寫從頂線寫到底線。
 * games/draw/glyphs.ts 的大寫大約畫在 20～120（數學課的數字也用那一份，不動），英文課描字時換算到 頂線 18～底線 110：
 * 照每個字實際畫出來的上下範圍（彎的字 C、G、S 不是剛好 20～120）對齊，寬度跟著等比縮（以 x = 50 為中心），字的樣子不變。
 * O、Q 的圓原本只有 33～107（跟數字 0 分得出來），這裡上下拉滿頂線到底線、寬度不變（英文課沒有數字 0）；
 * Q 照 O 的圓對齊，尾巴落到底線下面一點點。
 * 小寫本來就照四條線畫（LOWER）：有上伸的（b、d、h、k、l）從頂線、其他從中線，有下伸的（g、j、p、q、y）到下緣。
 */
export function onLines(L: string, strokes: string[]): string[] {
  const round = L === 'O' || L === 'Q'
  const [y0, y1] = yRange(round ? strokes.slice(0, 1) : strokes)
  const sy = (LINES.base - LINES.top) / (y1 - y0)
  const sx = round ? 1 : sy
  const r = (v: number) => Math.round(v * 10) / 10
  return strokes.map((d) => d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${r(50 + (Number(x) - 50) * sx)} ${r(LINES.top + (Number(y) - y0) * sy)}`))
}

/** 筆順（只有 M、L、C 絕對座標）實際畫出來的上下範圍：貝茲曲線取樣，不用 DOM */
function yRange(strokes: string[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const d of strokes) {
    let y0 = 0
    for (const [, cmd, args] of d.matchAll(/([MLC])([^MLC]*)/g)) {
      const v = args.trim().split(/\s+/).map(Number)
      const step = cmd === 'C' ? 6 : 2
      for (let i = 0; i + step - 1 < v.length; i += step) {
        const y = v[i + step - 1]
        if (cmd === 'C')
          for (let t = 0; t <= 1; t += 0.01) {
            const u = 1 - t
            const yy = u * u * u * y0 + 3 * u * u * t * v[i + 1] + 3 * u * t * t * v[i + 3] + t * t * t * y
            lo = Math.min(lo, yy)
            hi = Math.max(hi, yy)
          }
        lo = Math.min(lo, y)
        hi = Math.max(hi, y)
        y0 = y
      }
    }
  }
  return [lo, hi]
}

const byLetter = new Map(ALL_PHONICS.map((u) => [u.letter, u]))

export const LESSON_LETTERS: LessonLetter[] = [...ORDER].map((L) => {
  const l = L.toLowerCase()
  const unit = byLetter.get(l)
  if (!unit) throw new Error(`英文課少了字母 ${L} 的念法`)
  const words = unit.keys
  const starts = words.filter((w) => w.w[0].toLowerCase() === l)
  return { L, l, unit, words, starts, upper: GLYPHS[L], upperLined: onLines(L, GLYPHS[L]), lower: LOWER[l] }
})

/**
 * 一輪字母的順序（A12）：孩子英文名字裡的字母先上（照名字裡出現的順序、不重複），其他的再照 A→Z 補上。
 * 名字只從 .env.local 的 VITE_CHILD_NAME_EN 讀（plan.ts 的 nameOrder），不寫進 repo；沒設名字就是 A→Z。
 */
export function orderFor(name: string | null | undefined): string {
  const first = [...new Set((name ?? '').toUpperCase().replace(/[^A-Z]/g, ''))].join('')
  return first + [...ORDER].filter((c) => !first.includes(c)).join('')
}

/** seq（這一輪的字母順序，預設 A→Z）第 i 個字母 */
export const lessonLetter = (i: number, seq = ORDER) => {
  const L = seq[Math.max(0, Math.min(seq.length - 1, i))]
  return LESSON_LETTERS.find((x) => x.L === L) ?? LESSON_LETTERS[0]
}

/** 字的 id：台詞 key、選項 id 用（fire truck → fire-truck） */
export const wordId = (w: string) => w.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/** 這一課用到的圖（scripts/build-emoji.ts 只打包 App 用到的圖） */
export const ENGLISH_ICONS = [...new Set(LESSON_LETTERS.flatMap((x) => x.words.map((w) => w.icon)))]
