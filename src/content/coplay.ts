// 給爸爸的一句話（benchmark 手法 2）：遊戲角落的中文陪玩提示。
// 以遊戲 id 對應；其他工作線新增的遊戲沒有對應時，先找同一站的提示，再用通用提示。
import type { StationId } from '../lib/db'
import type { Cue } from './games'
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
  // 比多少、比大小：題目出來之後換成跟這一題一致的那句（cueHint）；這裡是題目出來前的，不寫多或少
  'm-compare': ['問他：你怎麼知道是這一邊的？', '拿兩堆餅乾，跟他一起比一比'],
  'm-order': ['一起大聲數：one, two, three…', '問他：下一個是幾？'],
  'z-find': ['問他：這是什麼動物？牠怎麼叫？', '你學動物叫，讓他用英文說名字'],
  'z-category': ['問他：還有什麼會飛？', '問他：為什麼選這個？'],
  'z-sound': ['你學叫聲，讓他猜是誰', '問他：小狗怎麼叫？Woof woof!'],
  'd-trace': ['在他背上用手指畫一條線，讓他猜', '說說看：車子開到哪裡了？'],
  'd-dots': ['從小房子出發，一起念 one, two, three…', '最後要連回小房子，形狀才會變彩色', '連完問他：這是什麼？'],
  'd-color': ['問他：What color? 這是什麼顏色？', '讓他用手指或筆來回塗，塗得亂也沒關係', '問他：你最喜歡哪個顏色？'],
  'd-free': ['請他說說畫了什麼，你用英文說一次', '問他：這是誰？在做什麼？'],
  'd-glyph': ['讓他先在你手心用手指描一次', '描完問他：這是什麼？'],
  'p-color': ['指著衣服問他：What color?', '找找看：家裡什麼是紅色的？'],
  'p-shape': ['找找看：家裡什麼東西是圓形？', '用手指在空中畫形狀，讓他猜'],
  'p-size': ['問他：你怎麼知道是這一個的？', '拿兩個杯子，跟他一起比一比'],
  // 程式車庫：讓他說出想法，比答對更重要；開錯了不急著糾正，等他自己發現
  'c-drive': ['按 Go 之前先問他：車子會開到哪裡？', '開錯了先別說，問他：哪一張卡要換？', '用手指在格子上走一次，邊走邊說 up、right'],
  'c-pattern': ['跟著火車的節奏一起拍手：叮、咚、叮、咚…', '玩完找找看：地磚、衣服上有沒有一樣的規律？', '問他：你怎麼知道下一節車廂是這個？'],
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

/**
 * 比較題的陪玩提示要跟當題問的一致（題目問 fewer 時不能寫 Which has more?）。
 * 選擇題引擎每出一題就用題目徽章換一次；variant 一局固定，句型不會每題跳來跳去。
 */
const CUE_HINTS: Record<Cue, string[]> = {
  more: ['問他：哪邊比較多？你怎麼知道的？', '拿兩堆餅乾，問他 Which has more?'],
  less: ['問他：哪邊比較少？你怎麼知道的？', '拿兩堆餅乾，問他 Which has fewer?'],
  big: ['問他：哪個比較大？用手比比看', '拿兩個杯子，問他 Which is bigger?'],
  small: ['問他：哪個比較小？用手比比看', '拿兩個杯子，問他 Which is smaller?'],
}

export const cueHint = (cue: Cue, variant: number) => CUE_HINTS[cue][variant % CUE_HINTS[cue].length]

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

// ── 描數字字母：現在建議用手指還是用筆（手法 5）─────────────────────
/** 給爸爸看的工具提示：寫清楚建議哪一種、為什麼；兩種都能畫，只是建議 */
export function glyphToolHint(tool: 'finger' | 'pen'): string {
  return tool === 'finger'
    ? '建議用手指：新的字先用手指描，觸覺比較能記住筆順；用筆也能完成'
    : '建議用筆：這個字已用手指描好兩次，換筆練握筆；用手指也能完成'
}
