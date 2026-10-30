// 能力階梯：主線 → 支線 → 階 → 概念 → 技能點（docs/成長系統設計.md §1.3、§1.4、§2）
//
// 每條支線一階一階往上，只看自己的前置條件，不看年齡（D1、LOAD-4）。這個檔案只放「內容」：
// 有哪些支線、每一階的前置條件、每一階現在有哪些做出來的內容（單位），和判斷穩固、完成、卡關、回補用的數字。
// 判斷本身是 lib/growth.ts 的純函式；孩子端的狀態在 lib/adaptive.ts。
//
// 「單位」是階裡面算穩固的東西，大多就是 content/tracks.ts 的概念（字母音 m、數字 3、詞彙主題「動物」）；
// 難度本身就是內容的遊戲（運筆小路、連點成圖），一級算一個單位；描數字字母一個零件或一個字算一個單位。
// 一個技能點只屬於一個單位（照 RUNGS 的順序，先對到的算）。
// 還沒做出來的階（§2 表上 ✗ 的）沒有單位：它們照樣有前置條件，家長區看得到「還沒有內容」，之後的遊戲做好了再補上單位。
//
// 注意：content/tracks.ts、content/code.ts、games/draw/glyphs.ts 都在 lib/adaptive.ts 的引用循環裡，
// 所以從它們拿的資料只在函式裡讀（unitsOf 第一次被呼叫時才建表），模組頂層不讀。
import { THEME_LABEL, VOCAB, type VocabTheme } from './vocab'
import { PHONICS } from './letters'
import { DOTS_PICS } from './dots'
import { conceptOf, type TrackId } from './tracks'
import { GLYPH_LEVELS, PART_LEVELS } from '../games/draw/glyphs'

// ── 數字（設計值；§1.4）────────────────────────────────────────
/** 穩固：已熟（3 格以上），而且通過至少 2 次到期複習 */
export const FIRM_REV = 2
/** 階完成：這一階 80% 的單位穩固…… */
export const DONE_RATIO = 0.8
/** ……而且能遷移的單位裡，一半以上有遷移（在至少 2 種不同的遊戲裡都第一次就答對） */
export const TRANSFER_RATIO = 0.5
export const TRANSFER_GAMES = 2
/** 卡關保險：前一階已經 60% 穩固、而且開放滿 3 週，就開下一階（前一階繼續複習） */
export const STUCK_RATIO = 0.6
export const STUCK_DAYS = 21
/** 回補：完成的階有 30% 以上的單位掉出已熟，或連續 2 次到期複習失敗 */
export const REOPEN_DROP = 0.3
export const REOPEN_FAILS = 2
/** 回補中：這條支線暫停新概念 1 週、到期複習的間隔減半 */
export const REOPEN_DAYS = 7
/** 太順就加速：連續 5 個有玩這條支線的日子，第一次答對率都 ≥ 92%、速度也變快 → 這條支線每週額度 +1 */
export const FAST_DAYS = 5
export const FAST_RATE = 0.92
export const FAST_BONUS = 1
/** 一條支線一天至少答幾題才拿來判斷太順、負擔（一個遊戲一回合 3–6 題） */
export const STRAND_MIN_ITEMS = 3
/** 超過 14 天沒玩：回來第一天不教新內容 */
export const BREAK_DAYS = 14
/** 內容快用完：剩下的新內容照最近的速度大約不到 2 週，就提醒家長 */
export const CONTENT_WARN_WEEKS = 2

// ── 支線 ─────────────────────────────────────────────────────
export type StrandId =
  | 'vocab'
  | 'phon'
  | 'read'
  | 'count'
  | 'measure'
  | 'pattern'
  | 'shape'
  | 'compose'
  | 'seq'
  | 'classify'
  | 'space'
  | 'reason'
  | 'code'
  | 'pen'
  | 'write'
  | 'create'

export interface StrandDef {
  id: StrandId
  track: TrackId
  name: string
}

/** 每條主線底下的支線（§2.1–§2.4），順序就是家長區列出來的順序 */
export const STRANDS: readonly StrandDef[] = [
  { id: 'vocab', track: 'lang', name: '詞彙' },
  { id: 'phon', track: 'lang', name: '語音覺識' },
  { id: 'read', track: 'lang', name: '字母與讀' },
  { id: 'count', track: 'num', name: '數數與數字' },
  { id: 'measure', track: 'num', name: '比較與測量' },
  { id: 'pattern', track: 'num', name: '規律' },
  { id: 'shape', track: 'num', name: '形狀與空間' },
  { id: 'compose', track: 'num', name: '合成與運算' },
  { id: 'seq', track: 'think', name: '順序與因果' },
  { id: 'classify', track: 'think', name: '分類' },
  { id: 'space', track: 'think', name: '空間方向' },
  { id: 'reason', track: 'think', name: '推理' },
  { id: 'code', track: 'think', name: '程式' },
  { id: 'pen', track: 'hand', name: '運筆' },
  { id: 'write', track: 'hand', name: '描寫' },
  { id: 'create', track: 'hand', name: '創作' },
]

export const strand = (id: StrandId) => STRANDS.find((s) => s.id === id)!

// ── 階 ───────────────────────────────────────────────────────
export interface RungDef {
  /** 和 §2 表上的編號一樣（L1、N3、H6b…） */
  id: string
  strand: StrandId
  /** 參考年齡（月）：只給家長看「比一般早／還在練」，不是門檻（D1） */
  age: number
  what: string
  /** 前置條件：這些階完成（或觸發卡關保險）才開放。不看年齡 */
  prereq: readonly string[]
  /** 現在練得到這一階的遊戲（遷移、負擔控制、排課用） */
  games: readonly string[]
  /** 沒有自己的技能點、和另一階一起算的（P2 除錯就在 P1 的箭頭卡開車裡） */
  with?: string
  /** 沒有對錯、不算穩固的（著色、自由畫）：一直開著，不會「完成」 */
  free?: boolean
}

const m = (y: number, mo = 0) => y * 12 + mo

/**
 * 全部的階（§2）。前置一定排在後面的階之前（lib/growth.ts 依這個順序一階一階判斷）。
 * 和 §2 表上不一樣的地方（都是為了對上現有的遊戲，數字沒有放寬）：
 * - 數數與數字：現有的遊戲（unlockedNumbers）是「1–5 → 6–10 → 11–20」一段一段開，數數、認數字、給蛋、塗格子都用同一個數字概念。
 *   所以 N1 是 1–5（點數、認數字、一眼看出），N2 是 6–10，N3 是 11–20。§2 的 N2「認數字 1–5」併在 N1 裡。
 * - 照順序（T2）、連點成圖（H2）的前置寫成 N1：它們要的是「認得 1–5」（現有的連點圖、照順序只出到已經開放的數字），
 *   照 §2 原文寫 N2 的話，在現在的分法裡是 6–10，會擋住連點成圖，連帶擋住描字母。
 * - 詞彙 L2 只有顏色：找形狀（p-shape）在數與規律線（content/tracks.ts），形狀的單位放在 N12。
 * - 語音覺識 L5 是第一組 m s a t b f；字母與讀 L9 是 PHONICS 後面的音（同一個技能點 phonics:x 由三個字母森林的遊戲共用）。
 * - 規律：AABB 照 LOAD-4 的順序放在 N11（AB 之後）。
 */
export const RUNGS: readonly RungDef[] = [
  // 語言：詞彙
  { id: 'L1', strand: 'vocab', age: m(3), what: '主題詞彙聽懂', prereq: [], games: ['z-find', 'z-sound'] },
  { id: 'L2', strand: 'vocab', age: m(3), what: '顏色的英文名字', prereq: [], games: ['p-color'] },
  { id: 'L3', strand: 'vocab', age: m(4), what: '位置詞 in、on、under、behind', prereq: ['L1'], games: [] },
  { id: 'L4', strand: 'vocab', age: m(5), what: '聽故事回答 Who、Where、What happened', prereq: ['L1'], games: [] },
  // 語言：語音覺識
  { id: 'L5', strand: 'phon', age: m(3), what: '開頭音辨識，第一組 m s a t b f', prereq: [], games: ['ph-start', 'ph-same', 'ph-letter'] },
  { id: 'L6', strand: 'phon', age: m(4), what: '押韻', prereq: ['L5'], games: [] },
  { id: 'L7', strand: 'phon', age: m(4), what: '拍音節', prereq: [], games: [] },
  { id: 'L8', strand: 'phon', age: m(4, 6), what: '口語合音', prereq: ['L5'], games: [] },
  // 語言：字母與讀
  { id: 'L9', strand: 'read', age: m(3, 3), what: '音對字母，PHONICS 後面的音', prereq: ['L5'], games: ['ph-start', 'ph-same', 'ph-letter'] },
  { id: 'L10', strand: 'read', age: m(4, 3), what: '26 個字母音全部（o j v y 延後的音）', prereq: ['L9'], games: [] },
  { id: 'L11', strand: 'read', age: m(5), what: 'CVC 合音讀', prereq: ['L8', 'L9'], games: [] },
  { id: 'L12', strand: 'read', age: m(5, 3), what: '拼字', prereq: ['L11'], games: [] },
  { id: 'L13', strand: 'read', age: m(5, 6), what: '雙字母音 sh、ch、th、ck', prereq: ['L11'], games: [] },
  { id: 'L14', strand: 'read', age: m(5), what: '常見字', prereq: ['L9'], games: [] },
  { id: 'L15', strand: 'read', age: m(5, 6), what: '讀一句短句', prereq: ['L11', 'L14'], games: [] },

  // 數與規律：數數與數字
  { id: 'N1', strand: 'count', age: m(3), what: '1–5：點數、給 N 個、塗格子、認數字、一眼看出', prereq: [], games: ['m-count', 'm-match', 'm-find', 'm-give', 'm-fill', 'm-flash', 'm-quick'] },
  { id: 'N2', strand: 'count', age: m(3, 3), what: '6–10：點數、數量對數字、認數字', prereq: ['N1'], games: ['m-count', 'm-match', 'm-find', 'm-give', 'm-fill', 'm-quick'] },
  { id: 'N3', strand: 'count', age: m(3, 6), what: '11–20', prereq: ['N2'], games: ['m-find', 'm-count', 'm-quick'] },
  { id: 'N4', strand: 'count', age: m(4), what: '數序：下一個、前一個', prereq: ['N3'], games: [] },
  { id: 'N5', strand: 'count', age: m(4, 3), what: '多一個、少一個', prereq: ['N4'], games: [] },
  { id: 'N6', strand: 'count', age: m(5, 6), what: '數到 100、十個十個數', prereq: ['N5'], games: [] },
  // 比較與測量
  { id: 'N7', strand: 'measure', age: m(3), what: '比多少、比大小', prereq: [], games: ['m-compare', 'p-size'] },
  { id: 'N8', strand: 'measure', age: m(4, 6), what: '排長短、輕重；序數', prereq: ['N7'], games: [] },
  { id: 'N9', strand: 'measure', age: m(5, 6), what: '用積木量長度；簡單圖表', prereq: ['N8', 'N3'], games: [] },
  // 規律
  { id: 'N10', strand: 'pattern', age: m(3, 3), what: 'AB 規律', prereq: [], games: ['c-pattern'] },
  { id: 'N11', strand: 'pattern', age: m(4), what: 'AABB、ABC；規律補洞、找錯', prereq: ['N10'], games: ['c-pattern'] },
  // 形狀與空間
  { id: 'N12', strand: 'shape', age: m(3), what: '平面形狀、立體（積木、球）', prereq: [], games: ['p-shape', 'p-solid'] },
  { id: 'N13', strand: 'shape', age: m(5, 3), what: '圖形組合、對稱', prereq: ['N12'], games: [] },
  // 合成與運算
  { id: 'N14', strand: 'compose', age: m(4, 6), what: '5 以內合成分解', prereq: ['N1'], games: [] },
  { id: 'N15', strand: 'compose', age: m(5), what: '十格框：一眼看出 6–10', prereq: ['N14'], games: [] },
  { id: 'N16', strand: 'compose', age: m(5), what: '10 以內加減故事題', prereq: ['N14', 'N3'], games: [] },

  // 邏輯與程式：順序與因果
  { id: 'T1', strand: 'seq', age: m(3), what: '先後順序 2–4 步', prereq: [], games: ['c-seq'] },
  { id: 'T2', strand: 'seq', age: m(3), what: '照順序點 1→N', prereq: ['N1'], games: ['m-order'] },
  { id: 'T3', strand: 'seq', age: m(3, 6), what: '因果配對', prereq: [], games: [] },
  { id: 'T4', strand: 'seq', age: m(4, 6), what: '預測接下來會怎樣', prereq: ['T3'], games: [] },
  { id: 'T5', strand: 'seq', age: m(5), what: '找出放錯的那一張', prereq: ['T1'], games: [] },
  // 分類
  { id: 'T6', strand: 'classify', age: m(3), what: '單一特徵分類', prereq: [], games: ['z-category', 'z-use', 'p-findall'] },
  { id: 'T7', strand: 'classify', age: m(4), what: '哪個不一樣', prereq: ['T6'], games: [] },
  { id: 'T8', strand: 'classify', age: m(4, 6), what: '雙特徵；「不是」…的', prereq: ['T6'], games: [] },
  { id: 'T9', strand: 'classify', age: m(5, 3), what: '規則格', prereq: ['T8'], games: [] },
  // 空間方向
  { id: 'T10', strand: 'space', age: m(3), what: '上下（前後、裡外還沒做）', prereq: [], games: ['c-drive'] },
  { id: 'T12', strand: 'space', age: m(4), what: '左右', prereq: ['T10'], games: ['c-drive'] },
  { id: 'T14', strand: 'space', age: m(5, 3), what: '心像：轉一轉、鏡子', prereq: ['T10'], games: [] },
  // 推理
  { id: 'T15', strand: 'reason', age: m(4, 6), what: '找不同', prereq: [], games: [] },
  { id: 'T16', strand: 'reason', age: m(5), what: '兩條線索的排除法', prereq: ['T8'], games: [] },
  { id: 'T17', strand: 'reason', age: m(5, 6), what: '故事推理', prereq: ['T3', 'L4'], games: [] },
  // 程式
  { id: 'P1', strand: 'code', age: m(3, 3), what: '指令：2–3 張方向卡開到目的地', prereq: ['T10'], games: ['c-drive'] },
  { id: 'P2', strand: 'code', age: m(3, 6), what: '除錯：撞到了換一張', prereq: ['P1'], games: ['c-drive'], with: 'P1' },
  { id: 'P3', strand: 'code', age: m(4), what: '指令變長、繞過障礙', prereq: ['P1', 'T12'], games: [] },
  { id: 'P4', strand: 'code', age: m(4, 3), what: '讀程式：猜車會停在哪', prereq: ['P1'], games: [] },
  { id: 'P5', strand: 'code', age: m(4, 3), what: '除錯關', prereq: ['P2', 'P4'], games: [] },
  { id: 'P6', strand: 'code', age: m(4, 6), what: '重複卡', prereq: ['P3', 'N11'], games: [] },
  { id: 'P7', strand: 'code', age: m(5), what: '重複裡放好幾步', prereq: ['P6'], games: [] },
  { id: 'P8', strand: 'code', age: m(5), what: '條件卡', prereq: ['P5', 'T8'], games: [] },
  { id: 'P9', strand: 'code', age: m(5, 3), what: '事件', prereq: ['P6'], games: [] },
  { id: 'P10', strand: 'code', age: m(5, 6), what: '函式：我的卡', prereq: ['P7'], games: [] },
  { id: 'P11', strand: 'code', age: m(5, 6), what: '自由創作', prereq: ['P9'], games: [] },
  { id: 'P12', strand: 'code', age: m(6), what: '銜接 ScratchJr', prereq: ['P8', 'P9', 'P10'], games: [] },

  // 動手：運筆
  { id: 'H1', strand: 'pen', age: m(3), what: '運筆小路：直線 → 彎路 → Z 字路', prereq: [], games: ['d-trace'] },
  { id: 'H2', strand: 'pen', age: m(3), what: '連點成圖', prereq: ['N1'], games: ['d-dots'] },
  { id: 'H3', strand: 'pen', age: m(3, 3), what: '用筆圈起來', prereq: ['H1'], games: ['p-lasso'] },
  // 描寫：零件第 2 組排在 H4 之前，因為 H4 要用到它
  { id: 'H6', strand: 'write', age: m(3), what: '字的零件：直線、橫線、圓、十字', prereq: [], games: ['d-glyph'] },
  { id: 'H6b', strand: 'write', age: m(3, 6), what: '字的零件：斜線、半圓、轉角', prereq: ['H6'], games: ['d-glyph'] },
  { id: 'H4', strand: 'pen', age: m(4), what: '描形狀', prereq: ['H6b'], games: [] },
  { id: 'H5', strand: 'pen', age: m(4), what: '用筆帶車子走迷宮', prereq: ['H1'], games: [] },
  { id: 'H7', strand: 'write', age: m(4), what: '描大大的數字、字母：1 I L T H 0 O C', prereq: ['H1', 'H2', 'H6b'], games: ['d-glyph'] },
  { id: 'H7b', strand: 'write', age: m(4, 6), what: '描全部大寫字母、數字 0–9', prereq: ['H7'], games: ['d-glyph'] },
  { id: 'H8', strand: 'write', age: m(5), what: '寫自己的英文名字', prereq: ['H7b'], games: [] },
  { id: 'H9', strand: 'write', age: m(5, 3), what: '描小寫字母；在格線內寫', prereq: ['H7b'], games: [] },
  // 創作
  { id: 'H11', strand: 'create', age: m(3), what: '蠟筆著色、自由畫', prereq: [], games: ['d-color', 'd-free'], free: true },
  { id: 'H12', strand: 'create', age: m(4, 6), what: '照樣畫', prereq: ['H4'], games: [] },
  { id: 'H13', strand: 'create', age: m(5), what: '畫故事裡的東西', prereq: ['H11'], games: [] },
  { id: 'H14', strand: 'create', age: m(4, 3), what: '拼圖', prereq: [], games: [] },
]

export const rung = (id: string) => RUNGS.find((r) => r.id === id)

/** 這條支線的階，照 §2 表的順序（家長鎖支線時的「第幾階」就是這個順序，從 1 開始） */
export const strandRungs = (s: StrandId) => RUNGS.filter((r) => r.strand === s)

/**
 * 難度就是內容的遊戲：第幾級屬於哪一階（升級前看那一階開了沒，lib/adaptive.ts 的 holdLevelUp）。
 * 沒列的遊戲升級只是選項變多、干擾變像，內容不換階。
 */
export const LEVEL_RUNG: Record<string, readonly string[]> = {
  'd-trace': ['H1', 'H1', 'H1', 'H1', 'H1', 'H1'],
  'd-dots': ['H2', 'H2', 'H2', 'H2'],
  'd-glyph': ['H6', 'H6b', 'H7', 'H7b', 'H7b', 'H7b'],
  'c-drive': ['T10', 'T12', 'P1', 'P1'],
  'c-pattern': ['N10', 'N10', 'N11', 'N11'],
  'c-seq': ['T1', 'T1', 'T1', 'T1'],
}

export const levelRung = (game: string, level: number): string | null => LEVEL_RUNG[game]?.[level - 1] ?? null

/** 一個遊戲從哪一階開始（第 1 級，或第一個列了它的階）：排課用，這一階還沒開就先不排 */
export function entryRung(game: string): string | null {
  return levelRung(game, 1) ?? RUNGS.find((r) => r.games.includes(game))?.id ?? null
}

/**
 * 難度越高越包含前面的遊戲：高一級的內容穩固了，低的也算穩固。
 * 這些遊戲升了級就不再出低級的內容（運筆小路到 5 級就不再開直線），低級的技能點不會再有到期複習，
 * 不這樣算的話，前面的級永遠到不了「通過 2 次到期複習」。
 */
export const NESTED_GAMES: ReadonlySet<string> = new Set(['d-trace', 'd-dots', 'c-drive', 'c-seq'])

// ── 單位 ─────────────────────────────────────────────────────
export interface UnitDef {
  /** 大多是 content/tracks.ts 的概念（sound:m、n:3）；難度型的遊戲是 lv:遊戲:級 */
  id: string
  /** 哪些技能點屬於這個單位 */
  match: (skill: string) => boolean
  /** 能練到這個單位的遊戲有幾種：2 種以上才要求遷移 */
  games: readonly string[]
  /** 難度型的遊戲：這個單位在第幾級（NESTED_GAMES 用） */
  game?: string
  lv?: number
}

/** 做什麼用（z-use）和找出全部（p-findall）共用 all: 開頭的技能點，要知道是哪個遊戲才分得出概念 */
const USE_KEYS = new Set(['rain', 'eat', 'wear', 'bath', 'bed'])

/** 技能點 → 概念（不知道遊戲時用；只有 all: 要猜是哪個遊戲） */
export function skillConcept(key: string): string | null {
  if (key.startsWith('all:') && USE_KEYS.has(key.slice(4))) return `use:${key.slice(4)}`
  return conceptOf('', key)
}

const byConcept = (id: string, games: readonly string[]): UnitDef => ({ id, match: (k) => skillConcept(k) === id, games })

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

const FIRST_SOUNDS = 6

let UNITS: Map<string, UnitDef[]> | null = null

function buildUnits(): Map<string, UnitDef[]> {
  const u = new Map<string, UnitDef[]>()
  const set = (id: string, list: UnitDef[]) => u.set(id, list)
  const games = (id: string) => rung(id)!.games

  // 詞彙主題：有聲音的主題才練得到「聽聲音猜猜看」
  set(
    'L1',
    (Object.keys(THEME_LABEL) as VocabTheme[]).map((t) =>
      byConcept(`theme:${t}`, VOCAB.some((v) => v.theme === t && v.sound) ? ['z-find', 'z-sound'] : ['z-find']),
    ),
  )
  set('L2', ['colors:1', 'colors:2'].map((c) => byConcept(c, games('L2'))))
  const sounds = PHONICS.map((p) => `sound:${p.letter}`)
  set('L5', sounds.slice(0, FIRST_SOUNDS).map((c) => byConcept(c, games('L5'))))
  set('L9', sounds.slice(FIRST_SOUNDS).map((c) => byConcept(c, games('L9'))))

  // 數字：1–5 一眼看得出來（m-flash 只出到 5），6–10、11–20 沒有一眼看幾個
  set('N1', range(1, 5).map((n) => byConcept(`n:${n}`, games('N1'))))
  set('N2', range(6, 10).map((n) => byConcept(`n:${n}`, games('N2'))))
  set('N3', ['n:11-15', 'n:16-20'].map((c) => byConcept(c, games('N3'))))
  set('N7', [byConcept('compare:more', ['m-compare']), byConcept('compare:less', ['m-compare']), byConcept('size:big', ['p-size']), byConcept('size:small', ['p-size'])])
  const pattern = (k: string, lv: number): UnitDef => ({ ...byConcept(`pattern:${k}`, ['c-pattern']), game: 'c-pattern', lv })
  set('N10', [pattern('AB', 1)])
  set('N11', [pattern('AABB', 3), pattern('ABC', 4)])
  // 立體形狀只有積木、球（solids:2 延後，還不會出現）
  set('N12', [byConcept('shapes:1', ['p-shape']), byConcept('shapes:2', ['p-shape']), byConcept('solids:1', ['p-solid'])])

  const seq = (n: number, lv: number): UnitDef => ({ ...byConcept(`seq:${n}`, ['c-seq']), game: 'c-seq', lv })
  set('T1', [seq(2, 1), seq(3, 3), seq(4, 4)])
  set('T2', ['order:short', 'order:long'].map((c) => byConcept(c, ['m-order'])))
  set('T6', [
    ...['fly', 'water', 'wheels', 'eat', 'legs4'].map((k) => byConcept(`cat:${k}`, ['z-category'])),
    ...[...USE_KEYS].map((k) => byConcept(`use:${k}`, ['z-use'])),
    ...['category', 'color', 'shape'].map((k) => byConcept(`sort:${k}`, ['p-findall'])),
  ])
  const drive = (c: string, lv: number): UnitDef => ({ ...byConcept(c, ['c-drive']), game: 'c-drive', lv })
  set('T10', [drive('dir:up', 1), drive('dir:down', 1)])
  set('T12', [drive('dir:left', 2), drive('dir:right', 2)])
  set('P1', [drive('route:2', 3), drive('route:3', 4)])

  // 運筆小路：一級一個單位（第 n 級的路是 trace:n；最高級的第三條 Z 字路 trace:7 也算在第 6 級）
  const roads = rungLevels('d-trace')
  set(
    'H1',
    range(1, roads).map((n) => ({ id: `lv:d-trace:${n}`, match: (k: string) => k === `trace:${n}` || (n === roads && k === `trace:${n + 1}`), games: ['d-trace'], game: 'd-trace', lv: n })),
  )
  // 連點成圖：一級一個單位，那一級的每張圖都算
  set(
    'H2',
    range(1, rungLevels('d-dots')).map((n) => {
      const pics = new Set(DOTS_PICS.filter((p) => p.level === n).map((p) => `dots:${p.id}`))
      return { id: `lv:d-dots:${n}`, match: (k: string) => pics.has(k), games: ['d-dots'], game: 'd-dots', lv: n }
    }),
  )
  set('H3', [{ id: 'pen:lasso', match: (k) => k.startsWith('lasso:'), games: ['p-lasso'] }])
  // 描數字字母：一個零件、一個字一個單位
  const glyph = (key: string, lv: number): UnitDef => ({ id: key, match: (k) => k === key, games: ['d-glyph'], game: 'd-glyph', lv })
  set('H6', PART_LEVELS[0].map((p) => glyph(`part:${p}`, 1)))
  set('H6b', PART_LEVELS[1].map((p) => glyph(`part:${p}`, 2)))
  set('H7', [...GLYPH_LEVELS[0]].map((g) => glyph(`glyph:${g}`, 3)))
  set('H7b', GLYPH_LEVELS.slice(1).flatMap((s, i) => [...s].map((g) => glyph(`glyph:${g}`, 4 + i))))
  return u
}

/** 遊戲的級數有幾級屬於難度型的階 */
const rungLevels = (game: string) => LEVEL_RUNG[game].length

/** 這一階現在做出來的單位（沒做出來的階是空的） */
export function unitsOf(id: string): readonly UnitDef[] {
  UNITS ??= buildUnits()
  return UNITS.get(id) ?? []
}

let UNIT_OF = new Map<string, { rung: string; unit: UnitDef } | null>()

/** 技能點屬於哪一階的哪個單位（照 RUNGS 的順序，先對到的算）；不屬於任何一階的（著色、舊版字母遊戲）是 null */
export function unitOfSkill(key: string): { rung: string; unit: UnitDef } | null {
  const hit = UNIT_OF.get(key)
  if (hit !== undefined) return hit
  let out: { rung: string; unit: UnitDef } | null = null
  for (const r of RUNGS) {
    const unit = unitsOf(r.id).find((x) => x.match(key))
    if (unit) {
      out = { rung: r.id, unit }
      break
    }
  }
  UNIT_OF.set(key, out)
  return out
}

/** 技能點屬於哪條支線 */
export const strandOfSkill = (key: string): StrandId | null => {
  const u = unitOfSkill(key)
  return u ? rung(u.rung)!.strand : null
}

/** 測試用：重建單位表 */
export function resetUnitCache() {
  UNITS = null
  UNIT_OF = new Map()
}
