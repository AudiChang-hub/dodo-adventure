// 成就感強化：學會的東西（里程碑的圖）、貼紙本的貼紙、每局結束時「這一局做了什麼」的小圖。
// 「學會的東西」：一個技能第一次熟練（自己答、連續答對）就慶祝一次。v1 時它直接變成一張貼紙；
// v2（2026-10-28）起貼紙改成集星星自己挑（sticker-art.ts），學會的東西改給加速的星星，v1 拿到的舊貼紙照樣留在貼紙本。
// 同一個概念只有一張：數數量（count）、塗格子（fill）、給蛋（give）、一眼看幾個（flash）的 5，都是「數到 5」這一張。
import type { Visual } from './games'
import { STICKER_ART_ICONS, artOf } from './sticker-art'
import { ALL_PHONICS, PHONICS, PHONICS_WORDS, upper, wordId } from './letters'
import { ALL_VOCAB, CAT_EXAMPLES, vocab, type Tag } from './vocab'
import { COLORS, SHAPES, SOLIDS, type ShapeId, type SolidId } from './park'
import { ALL_STORIES, DIRS, DIR_ZH, PATTERN_TOKS, story, type Dir } from './code'

/** 貼紙上的圖：沿用題目的圖，另外加上立體形狀、字母配關鍵字、短文字、帶數字的圖示 */
export type Pic =
  | Visual
  | { t: 'solid'; solid: SolidId; hex: string }
  /** 字母音：大大的 S s，角落一張關鍵字的小圖（太陽） */
  | { t: 'pair'; ch: string; icon?: string }
  /** 短文字，例如照順序的 1–5 */
  | { t: 'text'; text: string }
  /** 圖示加上一個數字小圓牌，例如修好 3 個程式 */
  | { t: 'badge'; icon: string; n: number }

/**
 * 貼紙底色：只是讓一整頁看起來繽紛，畫面上不寫分類名稱（家長拍板：孩子端不分科目）。
 * 全部是紙感主題的淡色，明度接近、只差色相。
 */
const TINT = {
  mint: '#DDEFE3',
  apricot: '#FBE3D2',
  sky: '#DCE8F4',
  butter: '#F8EDC6',
  lilac: '#E7E1F3',
  stone: '#E3E7EA',
} as const

export interface StickerDef {
  /** 貼紙的 id（概念），例如 phonics:s、count:5 */
  id: string
  pic: Pic
  tint: string
  /** 在貼紙本裡點它時念的話：Letter S 的音、Number five! */
  lines: string[]
  /** 拿到貼紙那一刻念的短版（慶祝要短）；沒有就念 lines 的第一句 */
  short?: string
  /** 家長區「今日亮點」用的中文 */
  zh: string
  /** 挑選式貼紙的主角（sticker-art.ts）與外觀種子：有的話畫成隨機外觀的貼紙，沒有的話是圓形的舊貼紙 */
  art?: string
  seed?: number
}

const hexOf = (id: string) => COLORS.find((c) => c.id === id)?.hex ?? '#F0B088'
const isColor = (id: string) => COLORS.some((c) => c.id === id)
const isShape = (id: string): id is ShapeId => SHAPES.some((s) => s.id === id)
const isSolid = (id: string): id is SolidId => SOLIDS.some((s) => s.id === id)
const isTag = (id: string): id is Tag => id in CAT_EXAMPLES
const num = (v: string) => Number(v) || 0
const CAT_ZH: Record<Tag, string> = { fly: '會飛', water: '水裡', wheels: '有輪子', legs4: '四隻腳', eat: '可以吃' }

/** 連點成圖的圖 → 一張看得出是什麼的圖 */
const DOTS_PIC: Record<string, Pic> = {
  triangle: { t: 'shape', shape: 'triangle', hex: '#BFB2DF' },
  square: { t: 'shape', shape: 'square', hex: '#BFB2DF' },
  diamond: { t: 'shape', shape: 'square', hex: '#BFB2DF' },
  heart: { t: 'shape', shape: 'heart', hex: '#F09DB9' },
  star: { t: 'emoji', icon: 'star' },
  house: { t: 'emoji', icon: 'house' },
  fish: { t: 'emoji', icon: 'fish' },
  boat: { t: 'emoji', icon: 'sailboat' },
}

/** 數量類的技能（數數量、塗格子、給蛋、一眼看幾個、數字快答的數量題）共用一張「數到 n」 */
const COUNT_KINDS = new Set(['count', 'fill', 'give', 'flash'])

/**
 * 技能代碼 → 貼紙。沒有對應的（例如舊版的 letter:、word:、陪玩的 coplay:、著色）回傳 null：
 * 那些不是「學會一個東西」，不給貼紙。
 */
export function stickerFor(skill: string): StickerDef | null {
  const [kind, v = ''] = skill.split(':')
  if (kind === 'phonics') {
    // 延後的音（o、j、v、y）之前得到的貼紙也照樣顯示
    const u = ALL_PHONICS.find((x) => x.letter === v)
    if (!u) return null
    // 貼紙上的圖是代表字（第一個關鍵字），台詞 S, S, S… sss… snake! 唸的也是它；
    // 慶祝時接在 You learned it! 後面太長，字母名稱只唸一次（S… sss… snake!，延後的音沒有這句就用完整的）
    const short = PHONICS.includes(u) ? `ph.${v}.echo.${wordId(u.keys[0].w)}` : undefined
    return { id: skill, pic: { t: 'pair', ch: `${upper(v)}${v}`, icon: u.keys[0]?.icon }, tint: TINT.mint, lines: [`ph.${v}.says`], ...(short ? { short } : {}), zh: `字母音 ${v}` }
  }
  if (kind === 'num') {
    const n = num(v)
    return n ? { id: `num:${n}`, pic: { t: 'number', n }, tint: TINT.apricot, lines: [`stk.num.${n}`], zh: `認數字 ${n}` } : null
  }
  if (COUNT_KINDS.has(kind)) {
    const n = num(v)
    if (!n) return null
    // 小的數量直接畫出來（一眼看得出是幾個），大的用數字配一顆蛋
    const pic: Pic = n <= 5 ? { t: 'group', icon: 'egg', count: n } : { t: 'badge', icon: 'egg', n }
    return { id: `count:${n}`, pic, tint: TINT.apricot, lines: [`stk.count.${n}`], zh: `數到 ${n}` }
  }
  if (kind === 'order') {
    const n = num(v)
    return n ? { id: skill, pic: { t: 'text', text: `1–${n}` }, tint: TINT.apricot, lines: [`stk.order.${n}`], zh: `照順序 1–${n}` } : null
  }
  if (kind === 'compare') return { id: skill, pic: { t: 'group', icon: 'strawberry', count: v === 'less' ? 1 : 3 }, tint: TINT.apricot, lines: [v === 'less' ? 'teach.fewer' : 'teach.more'], zh: v === 'less' ? '比多少（少）' : '比多少（多）' }
  if (kind === 'size') return { id: skill, pic: { t: 'emoji', icon: v === 'small' ? 'fish' : 'elephant' }, tint: TINT.butter, lines: [v === 'small' ? 'teach.smaller' : 'teach.bigger'], zh: v === 'small' ? '比大小（小）' : '比大小（大）' }
  // 找出全部（all:）的對象可能是顏色、形狀、立體形狀或用途；用途沒有一張圖講得清楚，不給貼紙
  if (kind === 'color' || (kind === 'all' && isColor(v))) {
    if (!isColor(v)) return null
    return { id: `color:${v}`, pic: { t: 'color', hex: hexOf(v) }, tint: TINT.butter, lines: [`teach.colorlike.${v}`], zh: `顏色 ${COLORS.find((c) => c.id === v)!.zh}` }
  }
  if (kind === 'shape' || (kind === 'all' && isShape(v))) {
    if (!isShape(v)) return null
    return { id: `shape:${v}`, pic: { t: 'shape', shape: v, hex: '#F0B088' }, tint: TINT.butter, lines: [`teach.shape.${v}`, `teach.shapefun.${v}`], zh: `形狀 ${SHAPES.find((s) => s.id === v)!.zh}` }
  }
  if (kind === 'all' && isSolid(v)) return { id: `solid:${v}`, pic: { t: 'solid', solid: v, hex: '#8FCBAA' }, tint: TINT.butter, lines: [`ws.thisis.${v}`], zh: `立體形狀 ${SOLIDS.find((s) => s.id === v)!.zh}` }
  if (kind === 'vocab' || kind === 'sound') {
    const e = ALL_VOCAB.find((x) => x.id === v)
    return e ? { id: `vocab:${v}`, pic: { t: 'emoji', icon: e.icon }, tint: TINT.sky, lines: [`teach.vocab.${v}`], short: `z.itis.${v}`, zh: `詞彙 ${e.zh}` } : null
  }
  if (kind === 'cat' && isTag(v)) return { id: skill, pic: { t: 'emoji', icon: vocab(CAT_EXAMPLES[v][0]).icon }, tint: TINT.sky, lines: [`teach.cat.${v}.0`, `teach.cat.${v}.1`], zh: `分類 ${CAT_ZH[v]}` }
  if (kind === 'arrow' && (DIRS as string[]).includes(v)) return { id: skill, pic: { t: 'arrow', dir: v as Dir }, tint: TINT.stone, lines: [`c.teach.dir.${v}`], zh: `方向 ${DIR_ZH[v as Dir]}` }
  if (kind === 'route') {
    const n = num(v)
    return n ? { id: skill, pic: { t: 'badge', icon: 'automobile', n }, tint: TINT.stone, lines: [`stk.route.${n}`], zh: `箭頭卡 ${n} 張` } : null
  }
  if (kind === 'pattern') return { id: skill, pic: { t: 'emoji', icon: 'puzzle-piece' }, tint: TINT.stone, lines: ['stk.pattern'], zh: `規律 ${v}` }
  if (kind === 'seq') {
    const s = story(v)
    return s ? { id: skill, pic: { t: 'emoji', icon: s.icons[s.icons.length - 1] }, tint: TINT.stone, lines: ['stk.seq'], zh: `排順序：${s.zh}` } : null
  }
  if (kind === 'glyph' && v) return { id: skill, pic: { t: 'text', text: v }, tint: TINT.lilac, lines: [/^\d$/.test(v) ? `d.glyph.num.${v}` : `en.thisis.${v}`], zh: `描 ${v}` }
  if (kind === 'dots' && DOTS_PIC[v]) return { id: skill, pic: DOTS_PIC[v], tint: TINT.lilac, lines: [`d.dots.is.${v}`], zh: `連點 ${v}` }
  if (kind === 'trace') return { id: 'trace', pic: { t: 'emoji', icon: 'pencil' }, tint: TINT.lilac, lines: ['stk.trace'], zh: '運筆小路' }
  return null
}

// ── 修好程式（程式車庫）：累計到這些次數就貼一張 ─────────────────
export const FIX_STEPS = [1, 3, 5, 10, 20, 30, 50] as const

export const fixSticker = (n: number): StickerDef => ({
  id: `fixes:${n}`,
  pic: { t: 'badge', icon: 'wrench', n },
  tint: TINT.stone,
  lines: [`ach.fixes.${n}`],
  zh: `自己修好 ${n} 個程式`,
})

// ── 挑選式貼紙（集滿 5 顆星自己挑的：主角在 sticker-art.ts，隨機外觀在 sticker-look.ts）──────────
/** 主角 + 種子 → 貼紙（StickerArt 看到 art 就用 stickerSvg 畫隨機外觀，不是圓形的舊貼紙） */
export function artSticker(id: string, seed: number): StickerDef {
  const a = artOf(id)
  return { id: `art:${id}:${seed}`, art: id, seed, pic: { t: 'emoji', icon: id }, tint: '#FFFDF8', lines: [`stk.art.${id}`], zh: a?.zh ?? id }
}

// ── 每局結束：這一局做了什麼（一題一張小圖）──────────────────
/** 一題的答案畫成什麼：盡量用孩子剛剛點到的那張圖 */
export function thingPic(a: { skill: string; answer: string; itemId: string }): Pic {
  const [kind, v = ''] = a.skill.split(':')
  if (kind === 'phonics') {
    const w = PHONICS_WORDS.find((x) => wordId(x.w) === a.answer)
    if (w) return { t: 'emoji', icon: w.icon }
    return { t: 'pair', ch: `${upper(v)}${v}`, icon: ALL_PHONICS.find((x) => x.letter === v)?.keys[0]?.icon }
  }
  if (kind === 'cat') {
    const e = ALL_VOCAB.find((x) => x.id === a.answer)
    if (e) return { t: 'emoji', icon: e.icon }
  }
  if (kind === 'compare') return { t: 'group', icon: 'strawberry', count: Math.min(5, num(a.answer) || 2) }
  if (kind === 'size') return { t: 'emoji', icon: a.itemId.split(':')[0] || 'elephant' }
  if (kind === 'pattern') {
    const tok = PATTERN_TOKS.find((x) => x.id === a.answer)
    if (tok) return tok.v
  }
  if (kind === 'num') return { t: 'number', n: num(v) }
  if (COUNT_KINDS.has(kind)) return { t: 'number', n: num(v) }
  if (kind === 'route') return { t: 'emoji', icon: 'automobile' }
  if (kind === 'trace') return { t: 'emoji', icon: 'automobile' }
  if (kind === 'coloring') return { t: 'emoji', icon: 'crayon' }
  if (kind === 'free-draw') return { t: 'emoji', icon: 'framed-picture' }
  if (kind === 'all' && !isColor(v) && !isShape(v) && !isSolid(v)) return { t: 'emoji', icon: 'basket' }
  return stickerFor(a.skill)?.pic ?? { t: 'emoji', icon: 'star' }
}

/** 給 scripts/build-emoji.ts：這裡用到、別處沒有打包的圖示 */
export const ACHIEVE_ICONS = ['wrench', 'flexed-biceps', 'open-book', 'man', 'waving-hand', 'hatching-chick', 'sparkles', 'glowing-star', 'strawberry', 'sailboat', 'house', 'basket', 'crayon', 'framed-picture', 'pencil', ...STICKER_ART_ICONS, ...ALL_STORIES.map((s) => s.icons[s.icons.length - 1])]
