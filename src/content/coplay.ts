// 給爸爸的一句話（benchmark 手法 2）：遊戲角落的中文陪玩提示。
// 以遊戲 id 對應；其他工作線新增的遊戲沒有對應時，先用同一站的提示。
import type { StationId } from '../lib/db'
import type { Cue } from './games'

// ── 陪玩提示：一行、短、只寫給大人看 ─────────────────────────────
// PARENT-1（T-49）：每個遊戲各一句，說的是這個遊戲現在要孩子做的事（V-25：圈圈看曾經顯示比大小的提示）。
// 3–4 歲的陪玩重點是「你也做一次給他看、跟他一起說」；之後換年段（成長系統 §1.2），可以照年段加句子
// （4–5 歲「問他為什麼」、5–6 歲「請他教你」），引擎不用改。
const GAME_HINTS: Record<string, string> = {
  // 字母森林
  'ph-start': '跟他一起把開頭的音拉長，念圖的名字，像 Sss… snake',
  'ph-same': '把兩張圖的名字都念一次，問他：開頭一樣嗎？',
  'ph-letter': '跟他一起念那個音，再問他：是哪個字母？',
  // 數字工地
  'm-count': '他點一個，你跟著數一聲；數完問他：How many?',
  'm-match': '先用手指一個一個數，再問他：是哪個數字？',
  'm-find': '用手指比出題目說的數，讓他找那個數字',
  // 比多少、比大小：題目出來之後換成跟這一題一致的那句（cueHint）；這裡是題目出來前的，不寫多或少
  'm-compare': '兩邊都看過了，再問他：你怎麼知道是這一邊？',
  'm-order': '他從 1 開始點，你在旁邊一起念 one, two, three…',
  'm-quick': '都是他會的數字，答完一起大聲說出那個數字',
  'm-fill': '他每塗一格，你跟著數一聲：one, two, three…',
  'm-give': '他每給一顆蛋，你跟著數一聲；給完問他：幾顆？',
  'm-flash': '葉子蓋起來後問他：剛剛看到幾個？不用一個一個數',
  // 動物村
  'z-find': '他找到後，你指著圖再說一次英文，讓他跟著念',
  'z-category': '選完問他：為什麼是這一個？',
  'z-sound': '聲音播完先別點，問他：這是誰的聲音？',
  'z-use': '指著他選的東西問他：家裡也有嗎？拿來做什麼？',
  // 畫畫小屋
  'd-trace': '請他從車子開始畫，沿著路把車子開到終點',
  'd-dots': '從小房子出發，一起念 one, two, three…，最後連回小房子',
  'd-color': '問他：What color? 塗到線外面也沒關係',
  'd-free': '請他說說畫了什麼，你用英文說一次',
  'd-glyph': '描之前，先用手指在他手心畫一次這個字',
  // 公園
  'p-color': '他找到後，再一起找找身邊一樣顏色的東西',
  'p-shape': '他找到後，用手指在空中跟他一起畫一次這個形狀',
  'p-size': '兩個都看過了，再問他：你怎麼知道是這一個？',
  'p-findall': '他點完一個，問他：還有沒有？全部找到了嗎？',
  'p-lasso': '請他用筆把題目說的那些一個一個圈起來，圈完一起數',
  'p-solid': '玩完找找看：家裡什麼像積木？什麼像球？',
  // 程式車庫：讓他說出想法，比答對更重要；開錯了不急著糾正，等他自己發現
  'c-drive': '按 Go 之前，用手指在格子上跟他一起走一次',
  'c-pattern': '跟著火車的節奏一起拍手，再問他：下一節是什麼？',
  'c-seq': '排好後，請他用「先…再…」說一次',
}

/** 沒有專用句子的新遊戲才用站點的句子（PARENT-1 要每個遊戲都有自己的；scripts/sim-teach.ts 會檢查） */
const STATION_HINTS: Record<StationId, string> = {
  english: '跟他一起念圖的名字，再問他：開頭是什麼聲音？',
  math: '一起大聲數：one, two, three…',
  mandarin: '他選完，你指著圖再說一次英文',
  draw: '請他說說畫了什麼',
  park: '他選完，問他：你怎麼知道的？',
  code: '問他：你怎麼知道的？',
}

/** 這個遊戲有沒有自己的陪玩句子（自動檢查用） */
export const hasGameHint = (gameId: string) => gameId in GAME_HINTS

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

/**
 * 這個遊戲的陪玩提示：每個遊戲固定一句，跟這個遊戲的題目一致。
 * 主題式冒險的「出門可以接著玩」不放在遊戲裡（跟題目無關），家長區的今日主題、出門任務卡有。
 */
export function coplayHint(gameId: string | null, station: StationId): string {
  return (gameId && GAME_HINTS[gameId]) || STATION_HINTS[station]
}

// ── 描數字字母：現在建議用手指還是用筆（手法 5）─────────────────────
/** 給爸爸看的工具提示：寫清楚建議哪一種、為什麼；兩種都能畫，只是建議 */
export function glyphToolHint(tool: 'finger' | 'pen'): string {
  return tool === 'finger'
    ? '建議用手指：新的字先用手指描，觸覺比較能記住筆順；用筆也能完成'
    : '建議用筆：這個字已用手指描好兩次，換筆練握筆；用手指也能完成'
}
