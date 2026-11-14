// 給大人看的陪玩小字（中文、不念、不新增語音）：T-149 E3、C1（docs/T-149-熱門幼兒App參考.md 第 3 節，2-6 大人參與）。
// - E3：單字那一段，每個代表字一句生活連結（家裡找得到的就請大人找出來指給他看；找不到的動物、交通工具，改成一起做動作或出門時看）。
// - C1：下課時一句「今天在家可以做的事」。
// 不問「家裡有沒有」家裡不可能有的東西（AI 小男生測試 2026-11-02：snake、volcano）。
import { taughtStarts, taughtWords } from './abc'
import { wordId, type LessonLetter } from './data'

/** 每個代表字（英文課教的 2 個）一句；home：家裡通常找得到（下課那一句會拿來當例子） */
const WORD_TIP: Record<string, { tip: string; home?: true }> = {
  apple: { tip: '家裡找找看有沒有蘋果，指給他看', home: true },
  ant: { tip: '下次出門看看地上有沒有螞蟻，跟他說 ant' },
  bus: { tip: '出門看到公車時，指給他看說 bus' },
  ball: { tip: '拿家裡的球一起滾一滾，說 ball', home: true },
  car: { tip: '找出玩具車，邊推邊說 car', home: true },
  cat: { tip: '跟他一起學小貓喵喵叫，說 cat' },
  dinosaur: { tip: '拿恐龍玩具或圖畫書，一起說 dinosaur' },
  dog: { tip: '跟他一起學小狗汪汪叫，說 dog' },
  egg: { tip: '冰箱裡找找看有沒有雞蛋，指給他看', home: true },
  elephant: { tip: '用手臂當象鼻甩一甩，說 elephant' },
  fish: { tip: '雙手合起來扭一扭學魚游泳，說 fish' },
  fox: { tip: '圖畫書裡找找看有沒有狐狸，說 fox' },
  gift: { tip: '包一個小東西給他拆，說 gift', home: true },
  gorilla: { tip: '一起拍拍胸口學大猩猩，說 gorilla' },
  horse: { tip: '讓他坐在你腿上搖一搖當騎馬，說 horse' },
  helicopter: { tip: '手舉高轉圈圈學直升機，說 helicopter' },
  iguana: { tip: '圖畫書或影片裡找找看大蜥蜴，說 iguana' },
  insect: { tip: '下次出門找找小蟲子，說 insect' },
  jellyfish: { tip: '一起擺動手指學水母，說 jellyfish' },
  jeans: { tip: '找找家裡的牛仔褲，指給他看說 jeans', home: true },
  kangaroo: { tip: '一起雙腳跳學袋鼠，說 kangaroo' },
  koala: { tip: '讓他抱著你學無尾熊抱樹，說 koala' },
  lion: { tip: '一起學獅子吼，說 lion' },
  lemon: { tip: '家裡有檸檬的話讓他聞一聞，說 lemon', home: true },
  moon: { tip: '晚上一起找月亮，指給他看說 moon' },
  mouse: { tip: '一起學老鼠吱吱叫，說 mouse' },
  nest: { tip: '出門看看樹上有沒有鳥巢，說 nest' },
  nose: { tip: '摸摸他的鼻子，說 nose', home: true },
  octopus: { tip: '張開手指扭一扭學章魚，說 octopus' },
  otter: { tip: '躺著拍拍肚子學水獺，說 otter' },
  pig: { tip: '一起學小豬哼哼叫，說 pig' },
  panda: { tip: '找找家裡的熊貓娃娃或圖畫書，說 panda' },
  queen: { tip: '用紙做一頂皇冠給他戴，說 queen' },
  question: { tip: '指著東西問他「這是什麼？」，說 question' },
  rabbit: { tip: '一起蹦蹦跳學兔子，說 rabbit' },
  rocket: { tip: '蹲下再跳起來當火箭發射，說 rocket' },
  snake: { tip: '手扭來扭去、嘶嘶叫學小蛇，說 snake' },
  sun: { tip: '白天出門指給他看太陽（不要直視），說 sun' },
  tiger: { tip: '一起學老虎吼，說 tiger' },
  turtle: { tip: '一起慢慢爬學烏龜，說 turtle' },
  umbrella: { tip: '找找家裡的雨傘，指給他看說 umbrella', home: true },
  up: { tip: '把他抱高高，一起說 up!' },
  volcano: { tip: '雙手從下往上張開學火山爆發，說 volcano' },
  van: { tip: '出門看到廂型車，指給他看說 van' },
  whale: { tip: '洗澡時一起噴水學鯨魚，說 whale' },
  watermelon: { tip: '吃水果時說說看西瓜 watermelon' },
  'x-ray': { tip: '看到 X 光片的圖時指給他看，說 x-ray' },
  'yo-yo': { tip: '有溜溜球的話一起玩，說 yo-yo' },
  yarn: { tip: '找找家裡的毛線或繩子，說 yarn', home: true },
  zebra: { tip: '過斑馬線時指給他看，說 zebra' },
  zero: { tip: '用手比一個圓圈，說 zero' },
}

/** E3：單字那一段，正在念（亮著）的那個字的陪玩小字；沒有這個字的資料就用通用的一句 */
export function wordTip(letter: LessonLetter, i: number): string {
  const w = taughtWords(letter)[Math.max(0, Math.min(i, 1))]
  return WORD_TIP[wordId(w.w)]?.tip ?? `跟他一起說：${w.w}`
}

/**
 * C1：下課時給大人的「今天在家可以做的事」。有家裡找得到的代表字就拿它當例子，不然請他在空中寫今天的字母。
 * 字母遊戲時間的下課也用今天的字母。
 */
export function byeTip(letter: LessonLetter): string {
  const home = taughtStarts(letter).find((w) => WORD_TIP[wordId(w.w)]?.home)
  return home
    ? `找家裡 ${letter.L} 開頭的東西，像 ${home.w}；找到了一起說「${letter.L} is for ${home.w}」`
    : `找家裡 ${letter.L} 開頭的東西，或牽著他的手指在空中寫一個大大的 ${letter.L}`
}

/** 單元測試用：每個代表字都有一句 */
export const hasWordTip = (w: string) => !!WORD_TIP[wordId(w)]
