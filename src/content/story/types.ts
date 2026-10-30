// 故事系統的資料格式（docs/成長系統設計.md §3、docs/故事世界.md §3.6）
//
// 時間結構：部（一個年段）→ 季（約一個月）→ 篇（約一週、5–7 章）→ 章（今天的冒險）。
// 另外每週一章「故事時間」（莫莫在書房打開舊書，講一則經典），還有沒有故事時用的「通用章節」（12 扇魔法門＝現有 12 個主題）。
//
// 這個資料夾只放資料和純函式，不碰資料庫、不放畫面；決定今天播哪一章、記錄進度在 lib/story.ts。
// 台詞的寫法和 BEATS 一樣：`|` 之後是加重的字；`{name}` 是孩子的英文名字，產生台詞時才換成 env 的名字（名字不進 repo）。
import type { Speaker } from '../registry'
import type { Band } from '../growth'
import type { SceneKind, ThemeId } from '../themes'
import type { TrackId } from '../tracks'

/**
 * 誰說這一句。三隻恐龍用自己的聲音；其他角色借恐龍的聲音（BEAT_VOICE）：
 * - egg：彩虹蛋不會說話，只會咕嚕咕嚕（Gurgle!），用豆豆的聲音
 * - all：大家一起說（開門口令），用今天主持的恐龍的聲音
 * - friend：孵出來的朋友。執行時換成孩子真的有的朋友，念那位朋友自己的台詞（lines-friends.ts）；
 *   還沒有朋友時念 en 這一句通用句（故事世界 §2.1）
 */
export type Who = Speaker | 'egg' | 'all' | 'friend'

/**
 * 畫面的代號：Fluent Emoji 的名字（bus、rabbit），或 @ 開頭的故事自己的圖（@rainbow-egg 彩虹蛋、@blanket 毯子，
 * 畫在 ui/StoryPic.tsx）。用 + 疊兩張：第一張大的在中間，第二張小的靠在右下角（bus+@rainbow-egg：蛋坐公車）。
 */
export type Pic = string

/** 劇本裡的一句（§3.6 的 { who, en, pic }） */
export interface Beat {
  who: Who
  /** 英文台詞；`|` 之後是加重的字，可以有 `{name}` */
  en: string
  /**
   * 畫面（Pic）。沒有就用那一段原本的圖。故事時間裡的角色借恐龍的聲音：兔子的台詞 who 寫 dodo、烏龜寫 bobo，
   * 畫面放兔子、烏龜（故事世界 §5.1）
   */
  pic?: Pic
  /** 這句台詞的 key（通用章節沿用現有主題的 key，音檔才會一樣）；沒寫就由章節的 id 和位置組出來 */
  key?: string
  /** 家長看的中文意思（審稿頁的中英對照）；只給家長看，App 裡不念、不顯示（故事裡不出現中文） */
  zh?: string
}

/**
 * 一站之前的那一段（1–3 句）。依主線的版本（成長系統 §3.2）：排到哪條線就用那一版，沒有那一版就用 generic。
 * 故事永遠聽排課的：今天練什麼由排課決定，故事只說「為什麼要做這件事」。
 */
export interface StopBeats {
  generic: Beat[]
  lang?: Beat[]
  num?: Beat[]
  think?: Beat[]
  hand?: Beat[]
}

/**
 * 一章的種類（db.ts 的 Chapter.kind）：
 * - epic：原創長篇《彩虹蛋之旅》的一章
 * - classic：故事時間（經典改編，每週一章）
 * - evergreen：通用章節（現有 12 扇魔法門自己的故事；沒有長篇可講、或家長沒有開故事時用）
 */
export type ChapterKind = 'epic' | 'classic' | 'evergreen'

/** 宗教經典的標籤（故事世界 §5.1）；原創和一般經典是 null */
export type Faith = 'bible' | 'jataka' | 'panchatantra' | null

/** 畫面的樣子：路線圖的標題卡、背景、每一站的圖、終點（和 ThemeDef 的這幾個欄位同一個格式） */
export interface ChapterLook {
  title: string
  /** 家長看的中文小字 */
  zh: string
  host: Speaker
  icon: string
  scene: SceneKind
  tint: string
  deep: string
  ground: string
  stops: [string, string, string, string, string]
  finale: string[]
}

export interface Chapter {
  /** 例如 p1-a01-c1、classic-a01、ev-bus */
  id: string
  kind: ChapterKind
  /** 第幾部（通用章節是 0） */
  part: number
  /** 哪一篇（例如 p1-a01；故事時間是 classic；通用章節是 evergreen） */
  arc: string
  /** 篇裡的第幾章（從 1 開始） */
  chapter: number
  band: Band
  faith: Faith
  /** 今天走哪一扇魔法門（現有的主題）。原創長篇的每一章指定一扇；故事時間沒有門 */
  door?: ThemeId
  /** 故事時間：書的樣子（標題卡、背景、每一站的圖）；有門的章節用門的樣子 */
  look?: ChapterLook
  /** 路線圖上念的標題（通用章節是門的標題 theme.<id>.title） */
  title?: Beat
  /** 開場（在魔法屋）。最後一句通常是開門口令 */
  intro: Beat[]
  /**
   * 5 站之前的那一段，依站的順序。null：用門後面原本的那一句（第一部只換其中一站，故事世界 §6）。
   * 少於 5 個時，後面的站都用門原本的旁白。
   */
  stops: (StopBeats | null)[]
  /** 到了故事的終點時念的一句（通用章節是門的結尾 theme.<id>.end；長篇和故事時間的結尾改在魔法屋念） */
  finale?: Beat[]
  /** 結尾（回到魔法屋）。通用章節沒有 */
  end: Beat[]
  /** 這一章念完、這一篇也講完時，魔法屋多的東西（house.ts 的 id）。放在篇的最後一章 */
  houseAdds?: string
}

/** 一篇（約一週）：同一個小目標的 5–7 章 */
export interface Arc {
  id: string
  part: number
  /** 第幾篇（整部連號，故事世界 §4） */
  no: number
  /** 英文標題（故事書的封面） */
  title: string
  /** 家長看的中文 */
  zh: string
  /** 封面圖 */
  icon: string
  band: Band
  chapters: Chapter[]
  /** 講完這一篇，魔法屋多的東西 */
  houseAdds: string
}

/** 一季（約一個月）：對上學校聯絡簿的主題 */
export interface Season {
  id: string
  zh: string
  arcs: string[]
}

/** 一部（一個年段） */
export interface Part {
  no: number
  title: string
  zh: string
  band: Band
  seasons: Season[]
}

/** 故事時間的一則（故事世界 §5.3 的編號，例如 A01） */
export interface Classic {
  id: string
  /** 出處只給家長看（孩子端不說「這是聖經的故事」，§5.1） */
  source: string
  zh: string
  band: Band
  faith: Faith
  /** 這一則給的年段（band）的那一版 */
  chapter: Chapter
  /**
   * 同一則的「長大版」（§5.4：中班段、大班段可以再講一次長大的版本，例如挪亞方舟到中班多了鴿子和綠葉子）。
   * 播放時照孩子的年段挑：沒有那個年段的版本，就用比較小的年段裡最大的那一版
   */
  grown?: Partial<Record<Exclude<Band, 'small'>, Chapter>>
}

export const TRACK_IDS: readonly TrackId[] = ['lang', 'num', 'think', 'hand']
