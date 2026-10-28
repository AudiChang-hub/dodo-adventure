// 給爸爸的一句話（benchmark 手法 2）：遊戲角落的中文陪玩提示，與「換爸爸問」回合的題目。
// 以遊戲 id 對應；其他工作線新增的遊戲沒有對應時，先找同一站的提示，再用通用提示。
import type { StationId } from '../lib/db'
import type { Visual } from './games'
import { hasLine } from './lines'
import { letterEntry } from './letters'
import { VOCAB } from './vocab'
import { COLORS, SHAPES, COUNT_ICONS } from './park'
import { pick } from '../lib/random'
import { themeNow } from '../lib/theme-play'

// ── 陪玩提示：一行、短、只寫給大人看 ─────────────────────────────
const GAME_HINTS: Record<string, string[]> = {
  'en-find': ['問他：這是什麼字母？怎麼唸？', '唸到字母時，用手指點一下上方字幕的字', '玩完一起找：家裡有什麼是這個字母開頭的？'],
  'en-pic': ['指著圖問他：開頭是什麼聲音？', '指著圖問他：What is this?'],
  'en-word': ['問他：這是什麼？開頭是什麼聲音？', '玩完問他：Where is the bus? 讓他在房間裡找'],
  'm-count': ['伸出手指問他：How many fingers?', '輪流數：他點一個，你數一個'],
  'm-match': ['數完問他：How many? 用手指比給你看', '一起大聲數：one, two, three…'],
  'm-find': ['問他：這是幾？家裡哪裡有這個數字？', '用手指比數字，讓他說英文'],
  'm-compare': ['問他：哪邊比較多？你怎麼知道的？', '拿兩堆餅乾，問他 Which has more?'],
  'm-order': ['一起大聲數：one, two, three…', '問他：下一個是幾？'],
  'z-find': ['問他：這是什麼動物？牠怎麼叫？', '你學動物叫，讓他用英文說名字'],
  'z-category': ['問他：還有什麼會飛？', '問他：為什麼選這個？'],
  'z-sound': ['你學叫聲，讓他猜是誰', '問他：小狗怎麼叫？Woof woof!'],
  'd-trace': ['在他背上用手指畫一條線，讓他猜', '說說看：車子開到哪裡了？'],
  'd-dots': ['一起念數字：one, two, three…', '連完問他：這是什麼？'],
  'd-color': ['問他：What color? 這是什麼顏色？', '問他：你最喜歡哪個顏色？'],
  'd-free': ['請他說說畫了什麼，你用英文說一次', '問他：這是誰？在做什麼？'],
  'd-glyph': ['讓他先在你手心用手指描一次', '描完問他：這是什麼？'],
  'p-color': ['指著衣服問他：What color?', '找找看：家裡什麼是紅色的？'],
  'p-shape': ['找找看：家裡什麼東西是圓形？', '用手指在空中畫形狀，讓他猜'],
  'p-size': ['問他：哪個比較大？用手比比看', '拿兩個杯子，問他 Which is bigger?'],
  // 程式車庫：讓他說出想法，比答對更重要；開錯了不急著糾正，等他自己發現
  'c-drive': ['按 Go 之前先問他：車子會開到哪裡？', '開錯了先別說，問他：哪一張卡要換？', '用手指在格子上走一次，邊走邊說 up、right'],
  'c-pattern': ['跟他一起拍手念：car, dino, car, dino…', '玩完找找看：地磚、衣服上有沒有一樣的規律？', '問他：你怎麼知道下一個是這個？'],
  'c-seq': ['排好後請他用自己的話說一次故事', '問他：早上起床先做什麼？再做什麼？', '用「先…再…」說說看'],
}

const STATION_HINTS: Record<StationId, string[]> = {
  english: ['問他：這是什麼？開頭是什麼聲音？', '唸到目標字時，用手指點一下上方字幕的字'],
  math: ['伸出手指問他：How many?', '一起大聲數：one, two, three…'],
  mandarin: ['問他：這是什麼？牠怎麼叫？', '你說中文，讓他說英文'],
  draw: ['讓他先用手指描，再換筆', '問他：你畫了什麼？'],
  park: ['指著身邊的東西問他：What color?', '問他：哪個比較大？'],
  code: ['問他：你怎麼知道的？', '用「先…再…」說說看'],
}

const GENERIC_HINTS = ['問他：這是什麼？', '他答對時，說說他做了什麼：你看得好仔細！', '他卡住時，先等 5 秒，不急著說答案']

/** 主題式冒險裡，陪玩提示說今天主題的機會 */
const THEME_HINT_SHARE = 0.35

/** 這個遊戲的陪玩提示（每次進遊戲隨機挑一句） */
export function coplayHint(gameId: string | null, station: StationId): string {
  // 主題式冒險：有時候提示今天的主題，爸爸在路上、家裡可以接著玩（今天的主題是公車：路上看到公車…）
  const th = themeNow()
  if (th && Math.random() < THEME_HINT_SHARE) return `今天的主題是${th.zh}：${th.dad}`
  const list = (gameId && GAME_HINTS[gameId]) || STATION_HINTS[station] || GENERIC_HINTS
  return pick(list)
}

// ── 換爸爸問：大圖＋爸爸用中文問孩子 ─────────────────────────────
export interface DadAsk {
  itemId: string
  /** 記錄用的技能：coplay: 前綴，不和孩子自己答的熟練度混在一起 */
  skill: string
  visual: Visual
  /** 給爸爸看的中文提示 */
  ask: string
  /** 爸爸按完之後，恐龍用英文說一次答案（台詞 key） */
  answer: string | null
}

const line = (k: string) => (hasLine(k) ? k : null)
const NUM_RE = /^\d+$/

function letterAsk(L: string): DadAsk | null {
  if (!/^[A-Z]$/.test(L)) return null
  return { itemId: L, skill: `coplay:letter:${L}`, visual: { t: 'letter', ch: L }, ask: '指著字母問他：「這是什麼？」', answer: line(`en.thisis.${L}`) }
}

function wordAsk(L: string): DadAsk | null {
  const e = /^[A-Z]$/.test(L) ? letterEntry(L) : null
  if (!e) return null
  return { itemId: L, skill: `coplay:word:${L}`, visual: { t: 'emoji', icon: e.icon }, ask: '指著圖問他：「What is this?」開頭是什麼聲音？', answer: line(`en.itis.${L}`) }
}

function numAsk(id: string): DadAsk | null {
  if (!NUM_RE.test(id)) return null
  const n = Number(id)
  return { itemId: id, skill: `coplay:num:${n}`, visual: { t: 'number', n }, ask: '指著數字問他：「這是幾？」', answer: line(`m.thisis.${n}`) }
}

function countAsk(id: string): DadAsk | null {
  if (!NUM_RE.test(id) || Number(id) < 1 || Number(id) > 10) return null
  const n = Number(id)
  return { itemId: id, skill: `coplay:count:${n}`, visual: { t: 'group', icon: pick(COUNT_ICONS), count: n }, ask: '請他一個一個點著數：「How many?」', answer: line(`m.total.${n}`) }
}

function vocabAsk(id: string): DadAsk | null {
  const v = VOCAB.find((x) => x.id === id)
  if (!v) return null
  const ask = v.theme === 'animal' ? '指著圖問他：「這是什麼動物？」牠怎麼叫？' : '指著圖問他：「What is this?」'
  return { itemId: id, skill: `coplay:vocab:${id}`, visual: { t: 'emoji', icon: v.icon }, ask, answer: line(`z.itis.${id}`) }
}

function colorAsk(id: string): DadAsk | null {
  const c = COLORS.find((x) => x.id === id)
  if (!c) return null
  return { itemId: id, skill: `coplay:color:${id}`, visual: { t: 'color', hex: c.hex }, ask: '指著顏色問他：「What color?」', answer: line(`p.thisis.color.${id}`) }
}

function shapeAsk(id: string): DadAsk | null {
  const s = SHAPES.find((x) => x.id === id)
  if (!s) return null
  return { itemId: id, skill: `coplay:shape:${id}`, visual: { t: 'shape', shape: s.id, hex: '#F0B088' }, ask: '指著形狀問他：「這是什麼形狀？」', answer: line(`p.thisis.shape.${id}`) }
}

function glyphAsk(g: string): DadAsk | null {
  if (/^\d$/.test(g)) return { itemId: g, skill: `coplay:glyph:${g}`, visual: { t: 'number', n: Number(g) }, ask: '指著問他：「這是幾？」', answer: line(`d.glyph.num.${g}`) }
  const a = letterAsk(g)
  return a && { ...a, skill: `coplay:glyph:${g}` }
}

/** 每個遊戲怎麼把剛玩過的題目（itemId）變成爸爸的問題 */
const ASKS: Record<string, (itemId: string) => DadAsk | null> = {
  'en-find': letterAsk,
  'en-pic': wordAsk,
  'en-word': wordAsk,
  'm-find': numAsk,
  'm-match': countAsk,
  'm-count': countAsk,
  'z-find': vocabAsk,
  'z-sound': vocabAsk,
  'p-color': colorAsk,
  'p-shape': shapeAsk,
  'd-glyph': glyphAsk,
}

/** 通用題：拿一個動物村的詞，問「這是什麼？」 */
function genericAsk(): DadAsk {
  const v = pick(VOCAB.filter((x) => x.theme === 'animal' || x.theme === 'vehicle'))
  return vocabAsk(v.id)!
}

/**
 * 換爸爸問的題目：優先從孩子剛剛在這個遊戲答過的題目裡挑（今天學過的才問），
 * 對應不到（例如照順序、運筆，或其他工作線新增的遊戲）就用通用題。
 */
export function dadAsk(gameId: string, recentItems: string[]): DadAsk {
  const make = ASKS[gameId]
  if (make) {
    const asks = [...new Set(recentItems)].map(make).filter((a): a is DadAsk => !!a)
    if (asks.length) return pick(asks)
  }
  return genericAsk()
}

// ── 描數字字母：現在建議用手指還是用筆（手法 5）─────────────────────
/** 給爸爸看的工具提示：寫清楚建議哪一種、為什麼；兩種都能畫，只是建議 */
export function glyphToolHint(tool: 'finger' | 'pen'): string {
  return tool === 'finger'
    ? '建議用手指：新的字先用手指描，觸覺比較能記住筆順；用筆也能完成'
    : '建議用筆：這個字已用手指描好兩次，換筆練握筆；用手指也能完成'
}
