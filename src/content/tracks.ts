// 四條能力主線（PRD §5.10）：語言、數與規律、思考、動手。
// 排課、每週新概念額度、能力雷達圖、課綱對照都以這裡為準。
// 主線是對「遊戲」分的，不是對站點：同一站的遊戲可能練不同的能力（例如彩虹公園的「圈圈看」是運筆）。
// 注意：這個檔案會被 src/lib/adaptive.ts 引用，而 code.ts 也引用 adaptive，形成循環。
// 所以從 code.ts 拿的資料只在函式裡讀，模組頂層不讀，任何引用順序都安全。
import { VOCAB, THEME_LABEL, type VocabTheme } from './vocab'
import { COLORS, SHAPES, SOLIDS } from './park'
import { PHONICS } from './letters'
import { CATEGORIES } from './worksheet-data'
import { DIR_ZH, PATTERN_ZH, story, driveSkills, storiesFor, patternKinds, type Dir, type PatternKind } from './code'

export type TrackId = 'lang' | 'num' | 'think' | 'hand'

export interface TrackDef {
  id: TrackId
  name: string
  /** 家長區雷達圖下方的一句話：這條線在練什麼 */
  what: string
  /** 圖表顏色：取自負責站點的深色，彼此色相分開、彩度低 */
  color: string
}

export const TRACKS: TrackDef[] = [
  { id: 'lang', name: '語言', what: '英文的字母音、詞彙與顏色，聽懂一句話裡的關鍵字', color: '#5FA883' },
  { id: 'num', name: '數與規律', what: '數量、數字、比多少與大小、形狀、ABAB 規律', color: '#D38A5E' },
  { id: 'think', name: '思考', what: '先後順序、方向、分類與條件，車子撞到了改一張卡（除錯）', color: '#6F8499' },
  { id: 'hand', name: '動手', what: '用筆沿線、連點、描數字字母、圈選，寫字前的運筆', color: '#8F7CC0' },
]

export const track = (id: TrackId) => TRACKS.find((t) => t.id === id)!

/**
 * 每個遊戲屬於哪條主線。有爭議的幾個：
 * - 找顏色（p-color）→ 語言：顏色他在紙本上早就分得出來，App 加的是英文的顏色名稱（Where is | red?）。
 * - 找規律（c-pattern）→ 數與規律：PRD 的表把「規律」放在數與規律；它在程式車庫，但練的是看出重複的單位。
 * - 照順序（m-order）→ 思考：PRD 的表把「照順序」放在思考；點 1→N 練的是一步接一步的順序。
 * - 動動腦（z-category）、做什麼用（z-use）、找出全部（p-findall）→ 思考：依特徵分類是邏輯，詞彙都是學過的。
 * - 立體形狀（p-solid）、比大小（p-size）、找形狀（p-shape）→ 數與規律：幾何與量的比較。
 * - 圈圈看（p-lasso）→ 動手：內容和「找出全部」一樣，多出來的是用筆圈起來的運筆。
 * - 數字快答（m-quick）→ 數與規律：只出已熟的數字題，練又對又快。
 */
export const GAME_TRACK: Record<string, TrackId> = {
  'ph-start': 'lang',
  'ph-same': 'lang',
  'ph-letter': 'lang',
  'z-find': 'lang',
  'z-sound': 'lang',
  'p-color': 'lang',

  'm-count': 'num',
  'm-match': 'num',
  'm-find': 'num',
  'm-compare': 'num',
  'm-quick': 'num',
  'm-fill': 'num',
  'm-give': 'num',
  'm-flash': 'num',
  'c-pattern': 'num',
  'p-shape': 'num',
  'p-size': 'num',
  'p-solid': 'num',

  'c-drive': 'think',
  'c-seq': 'think',
  'm-order': 'think',
  'z-category': 'think',
  'z-use': 'think',
  'p-findall': 'think',

  'd-trace': 'hand',
  'd-dots': 'hand',
  'd-color': 'hand',
  'd-free': 'hand',
  'd-glyph': 'hand',
  'p-lasso': 'hand',
}

/** 舊版遊戲 id（作答紀錄裡可能還有）也要對得到主線 */
const LEGACY: Record<string, TrackId> = { 'en-word': 'lang', 'en-pic': 'lang', 'en-find': 'lang' }

export const trackOf = (game: string): TrackId | null => GAME_TRACK[game] ?? LEGACY[game] ?? null

// ── 新概念（每週額度的單位）──────────────────────────────────
/**
 * 「概念」比技能點粗一層：一個概念底下有很多題目內容，概念第一次出現才算「教新的」。
 * - 語言：一個字母音（sound:b）；一個詞彙主題（theme:animal，主題裡的每個詞是內容）；一組顏色。
 * - 數與規律：一個數字 1–10（數數、認數字、塗格子、給蛋、一眼看幾個都算同一個 n:3）；
 *   11–15、16–20 各算一個；比多少的「多」「少」、比大小的「大」「小」；一組平面形狀、一組立體形狀；一種規律（AB、AABB…）。
 * - 思考：一個方向；2 張、3 張箭頭卡；2、3、4 步的排順序；照順序 5 以內、5 以上；一種分類（會飛、下雨天…）；
 *   依類別／顏色／形狀找出全部。
 * - 動手：運筆小路、連點成圖、描數字字母每升到一個沒到過的難度算一個（每一級是一種新的線條或一組新字）；用筆圈選。
 * 回傳 null 的（著色、自由畫、舊版字母遊戲、舊版爸爸回合的紀錄）不受額度限制。
 */
export function conceptOf(game: string, skill: string): string | null {
  const i = skill.indexOf(':')
  if (i < 0) return null
  const kind = skill.slice(0, i)
  const v = skill.slice(i + 1)
  switch (kind) {
    case 'phonics':
      return `sound:${v}`
    case 'vocab':
    case 'sound': {
      const w = VOCAB.find((x) => x.id === v)
      return w ? `theme:${w.theme}` : null
    }
    case 'color':
      return COLORS.findIndex((c) => c.id === v) < 5 ? 'colors:1' : 'colors:2'
    case 'shape':
      return SHAPES.findIndex((s) => s.id === v) < 4 ? 'shapes:1' : 'shapes:2'
    case 'num':
    case 'count':
    case 'give':
    case 'fill':
    case 'flash':
      return numConcept(Number(v))
    case 'order':
      return Number(v) <= 5 ? 'order:short' : 'order:long'
    case 'compare':
    case 'size':
    case 'pattern':
    case 'route':
    case 'cat':
      return `${kind}:${v}`
    case 'arrow':
      return `dir:${v}`
    case 'seq': {
      const s = story(v)
      return s ? `seq:${s.icons.length}` : null
    }
    case 'all':
      return allConcept(game, v)
    case 'lasso':
      return 'pen:lasso'
    default:
      return null
  }
}

const numConcept = (n: number) => (!(n > 0) ? null : n <= 10 ? `n:${n}` : n <= 15 ? 'n:11-15' : 'n:16-20')

// 2026-10-28 單字盤點：立體形狀只出 block（正方體）、ball（球）；圓柱、圓錐、三角柱延後（solids:2 暫時不會出現）
const SOLID_BASIC = ['cube', 'sphere']

/** 「找出全部」系列共用 all: 開頭的技能代碼，要看是哪個遊戲 */
function allConcept(game: string, v: string): string | null {
  if (game === 'z-use') return `use:${v}`
  if (SOLIDS.some((s) => s.id === v)) return SOLID_BASIC.includes(v) ? 'solids:1' : 'solids:2'
  if (COLORS.some((c) => c.id === v)) return 'sort:color'
  if (SHAPES.some((s) => s.id === v)) return 'sort:shape'
  if (v in CATEGORIES) return 'sort:category'
  return null
}

/** 難度本身就是內容單位的遊戲：升到沒到過的難度，算一個新概念（見 levelConcepts） */
const LEVEL_GAMES: Record<string, number> = { 'd-trace': 6, 'd-dots': 4, 'd-glyph': 4 }

export const levelConcept = (game: string, level: number) => (LEVEL_GAMES[game] ? `lv:${game}:${level}` : null)

/**
 * 某個遊戲升到這一級後會出現的概念，用來決定「額度用完時要不要先不升級」。
 * 只列出「升級就是換一批新內容」的遊戲；其他遊戲升級只是選項變多、干擾變像，不算新概念，回傳 null。
 */
export function levelConcepts(game: string, level: number): string[] | null {
  const lc = levelConcept(game, level)
  if (lc) return [lc]
  if (game === 'c-drive') return [...new Set(driveSkills(level).map((k) => conceptOf(game, k)!))]
  if (game === 'c-seq') return [...new Set(storiesFor(level).map((s) => `seq:${s.icons.length}`))]
  if (game === 'c-pattern') return patternKinds(level).map((k) => `pattern:${k}`)
  return null
}

/** 每條主線 3–6 歲範圍內所有的概念（雷達圖的「涵蓋」= 已經接觸過的比例）。在函式裡才讀 code.ts，見檔案開頭 */
export function trackConcepts(t: TrackId): string[] {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
  const lv = (g: string) => range(1, LEVEL_GAMES[g]).map((n) => `lv:${g}:${n}`)
  switch (t) {
    case 'lang':
      return [...PHONICS.map((u) => `sound:${u.letter}`), ...Object.keys(THEME_LABEL).map((k) => `theme:${k}`), 'colors:1', 'colors:2']
    case 'num':
      return [
        ...range(1, 10).map((n) => `n:${n}`),
        'n:11-15',
        'n:16-20',
        'compare:more',
        'compare:less',
        'size:big',
        'size:small',
        'shapes:1',
        'shapes:2',
        'solids:1',
        ...Object.keys(PATTERN_ZH).map((k) => `pattern:${k}`),
      ]
    case 'think':
      return [
        ...(Object.keys(DIR_ZH) as Dir[]).map((d) => `dir:${d}`),
        'route:2',
        'route:3',
        'seq:2',
        'seq:3',
        'seq:4',
        'order:short',
        'order:long',
        ...['fly', 'water', 'wheels', 'eat', 'legs4'].map((k) => `cat:${k}`),
        ...['rain', 'eat', 'wear', 'bath', 'bed'].map((k) => `use:${k}`),
        'sort:category',
        'sort:color',
        'sort:shape',
      ]
    case 'hand':
      return [...lv('d-trace'), ...lv('d-dots'), ...lv('d-glyph'), 'pen:lasso']
  }
}

const CAT_ZH: Record<string, string> = { fly: '會飛的', water: '在水裡的', wheels: '有輪子的', eat: '可以吃的', legs4: '四隻腳的' }
const USE_ZH: Record<string, string> = { rain: '下雨天用的', eat: '吃的', wear: '穿的', bath: '洗澡用的', bed: '睡覺用的' }
const LV_GAME_ZH: Record<string, string> = { 'd-trace': '運筆小路', 'd-dots': '連點成圖', 'd-glyph': '描數字字母' }

/** 家長區用：概念翻成中文 */
export function conceptLabel(c: string): string {
  const [kind, v, w] = c.split(':')
  switch (kind) {
    case 'sound':
      return `字母音 ${v}`
    case 'theme':
      return `詞彙主題：${THEME_LABEL[v as VocabTheme] ?? v}`
    case 'colors':
      return v === '1' ? '顏色（紅黃藍綠橘）' : '顏色（紫、粉紅、咖啡）'
    case 'shapes':
      return v === '1' ? '平面形狀（圓、三角、正方、星）' : '平面形狀（愛心、長方形）'
    case 'solids':
      return v === '1' ? '立體形狀（積木、球）' : '立體形狀（圓柱、圓錐、三角柱，延後）'
    case 'n':
      return `數字 ${v}`
    case 'compare':
      return v === 'more' ? '比多少（多）' : '比多少（少）'
    case 'size':
      return v === 'big' ? '比大小（大）' : '比大小（小）'
    case 'pattern':
      return `規律 ${PATTERN_ZH[v as PatternKind] ?? v}`
    case 'dir':
      return `方向「${DIR_ZH[v as Dir] ?? v}」`
    case 'route':
      return `箭頭卡 ${v} 張`
    case 'seq':
      return `排順序（${v} 步）`
    case 'order':
      return v === 'short' ? '照順序（5 以內）' : '照順序（5 以上）'
    case 'cat':
      return `分類：${CAT_ZH[v] ?? v}`
    case 'use':
      return `功能分類：${USE_ZH[v] ?? v}`
    case 'sort':
      return `找出全部（依${{ category: '類別', color: '顏色', shape: '形狀' }[v] ?? v}）`
    case 'pen':
      return '用筆圈起來'
    case 'lv':
      return `${LV_GAME_ZH[v] ?? v} 第 ${w} 級`
    default:
      return c
  }
}

// ── 課綱對照（PRD §5.10）──────────────────────────────────────
/**
 * 對照教育部「幼兒園教保活動課程大綱」。只寫領域與能力的正式名稱，
 * 學習指標用白話描述大意、不寫指標代碼（避免寫錯代碼誤導家長）。
 * 語言線比較特別：課綱的語文領域是華語，App 的英文只做「聽懂」，不教讀寫，也不教注音。
 */
export interface CurriculumRow {
  domain: string
  levels: { age: '小班' | '中班' | '大班'; text: string }[]
  /** App 目前教到哪裡、刻意不做什麼 */
  app: string
}

export const CURRICULUM: Record<TrackId, CurriculumRow> = {
  lang: {
    domain: '語文領域：理解、表達（口語、圖像符號、文字功能）',
    levels: [
      { age: '小班', text: '聽懂日常的簡單指示與熟悉的詞彙，喜歡聽故事、兒歌' },
      { age: '中班', text: '理解圖像與符號代表的意思，察覺生活中的文字有用途' },
      { age: '大班', text: '察覺文字的組成與書寫方向，開始接觸注音符號的聲音' },
    ],
    app: '用英文做「聽懂」：聽音找圖、聽詞找圖、字幕逐字亮起建立聲音與文字的連結；不考讀寫，注音留給學校大班',
  },
  num: {
    domain: '認知領域：蒐集訊息、整理訊息（生活環境中的數學）',
    levels: [
      { age: '小班', text: '觀察物品的數量與形狀，點數少量的東西' },
      { age: '中班', text: '點數 10 以內的數量、比較多少與大小，看出簡單的排列規律' },
      { age: '大班', text: '用數字記錄數量、合起來與分開，比較長短輕重，預測規律的下一個' },
    ],
    app: '以 1–10 的點數、認數字、比多少為主，熟了才延伸到 20；規律從 ABAB 開始；不做加減法',
  },
  think: {
    domain: '認知領域：整理訊息、解決問題',
    levels: [
      { age: '小班', text: '依一個明顯的特徵把東西分類，說出事情的先後' },
      { age: '中班', text: '依特徵比較與排序，說出事件的順序與原因' },
      { age: '大班', text: '遇到問題時想辦法、試試看，和別人討論解決的方法' },
    ],
    app: '分類、排順序、用 1–3 張箭頭卡開車，開錯了改一張卡再試（除錯）；只用上下左右的絕對方向',
  },
  hand: {
    domain: '身體動作與健康領域：協調與控制（用具操作）；美感領域：表現與創作',
    levels: [
      { age: '小班', text: '練習手眼協調，用蠟筆、畫筆隨意塗鴉、畫線' },
      { age: '中班', text: '較穩定地控制畫筆，沿線條畫、畫出簡單形狀' },
      { age: '大班', text: '精細動作更熟練，能操作剪刀等工具，嘗試描寫簡單的符號' },
    ],
    app: '用觸控筆沿路開車、連點、描大大的數字字母（判定寬鬆），先用手指再換筆；不要求寫字',
  },
}
