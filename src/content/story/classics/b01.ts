// 故事時間 B01 挪亞方舟（docs/故事世界.md §7.2，聖經故事，faith: bible）
// 小班段一版，中班段是「長大版」（句子變長、多了鴿子和綠葉子）；播放時照孩子的年段挑（content/story 的 classicFor）。
// 宗教經典另外的規則（§5.1）：當故事講，不傳教義。完全不說為什麼下雨，只說下了好久的雨、大家在船上很安全；
// 沒有神、沒有禱告、沒有「要相信」；挪亞不畫出來（畫面只有方舟、槌子、動物），孩子端也不說這是聖經的故事。
// 跟劇本不一樣的地方：加重的字在句中的「Two **elephants**. Two **giraffes**. Hello!」拆成三句（`|` 只能加重句尾）；
// 拆開之後第 2 段變成 4 句，超過一段 3 句的上限，所以「動物們兩隻兩隻來了」移到第 1 站的最後，接在造好船之後。
import type { Chapter, ChapterLook, Classic } from '../types'
import { CLOSE_BOOK, OPEN_BOOK } from './fixed'

const LOOK: ChapterLook = {
  title: "Noah's Big Boat",
  zh: '挪亞方舟（故事時間）',
  host: 'momo',
  icon: 'open-book',
  scene: 'sea',
  tint: '#E6EBE4',
  deep: '#7F9A8C',
  ground: '#CFD9CC',
  stops: ['@ark', 'elephant', 'cloud-with-rain', 'giraffe', 'rainbow'],
  finale: ['rainbow', 'giraffe'],
}

/** 小班段（§7.2 的表）：12 句，重點是兩隻兩隻（數數、配對）、大家互相照顧、彩虹 */
const SMALL: Chapter = {
  id: 'classic-b01',
  kind: 'classic',
  part: 1,
  arc: 'classic',
  chapter: 1,
  band: 'small',
  faith: 'bible',
  look: LOOK,
  intro: OPEN_BOOK,
  stops: [
    {
      generic: [
        { who: 'momo', en: 'Noah builds a big, big | boat.', pic: '@ark+hammer' },
        { who: 'momo', en: 'Knock, knock! Bang, bang!', pic: 'hammer+wood' },
        // 劇本第 2 段的第一句：第 2 段拆成三句之後放不下，移到這裡（造好船，動物們就來了）
        { who: 'momo', en: 'The animals come, two by two.', pic: '@two-zebra' },
      ],
    },
    {
      generic: [
        { who: 'momo', en: 'Two | elephants.', pic: '@two-elephant' },
        { who: 'momo', en: 'Two | giraffes.', pic: '@two-giraffe' },
        { who: 'momo', en: 'Hello!', pic: '@two-giraffe' },
      ],
    },
    {
      generic: [
        { who: 'momo', en: 'Drip, drop. Rain, rain, rain.', pic: 'cloud-with-rain+@ark' },
        { who: 'momo', en: 'Everyone is cozy in the boat.', pic: '@ark-full' },
      ],
    },
    // 長頸鹿幫小鳥拿高處的果子
    { generic: [{ who: 'momo', en: 'Everyone shares. Everyone helps.', pic: 'giraffe+bird' }] },
    {
      generic: [
        { who: 'momo', en: 'The rain stops. Hello, sun!', pic: 'sun+@ark' },
        { who: 'momo', en: 'Look! A big | rainbow!', pic: 'rainbow+@ark-full' },
      ],
    },
  ],
  end: CLOSE_BOOK,
}

/** 中班段的長大版（§7.2 附表）：句子變長；多了「方舟」這個字、數一數有幾對、鴿子帶回綠葉子。一樣不提原因 */
const MIDDLE: Chapter = {
  ...SMALL,
  id: 'classic-b01-m',
  band: 'middle',
  stops: [
    {
      generic: [
        { who: 'momo', en: 'Noah builds a big boat, called an ark.', pic: '@ark+hammer' },
        { who: 'momo', en: 'Bang, bang! It takes a long time.', pic: 'hammer+wood' },
      ],
    },
    {
      generic: [
        { who: 'momo', en: 'Then the animals come, two by two.', pic: '@two-lion' },
        { who: 'momo', en: 'Two lions, two zebras, two turtles…', pic: '@pairs' },
        { who: 'momo', en: 'Can you count the pairs?', pic: '@pairs' },
      ],
    },
    { generic: [{ who: 'momo', en: 'Then it rains and rains for many days.', pic: 'cloud-with-rain+@ark' }] },
    {
      generic: [
        { who: 'momo', en: 'Noah feeds the animals every day.', pic: '@ark-full+green-apple' },
        { who: 'momo', en: 'The animals help each other, too.', pic: 'giraffe+bird' },
      ],
    },
    {
      generic: [
        { who: 'momo', en: 'One day, a dove flies out.', pic: 'dove' },
        { who: 'momo', en: 'It comes back with a green leaf!', pic: 'dove+leaf-fluttering-in-wind' },
        { who: 'momo', en: 'Look! Plants are growing again.', pic: 'seedling' },
      ],
    },
  ],
  // 劇本的結尾第一句：在故事的終點念（「故事講完了，闔上舊書」照故事時間的規矩回書房念）
  finale: [{ who: 'momo', en: 'Everyone walks out. A rainbow shines!', pic: 'rainbow+@ark-full' }],
  look: { ...LOOK, stops: ['@ark', 'lion', 'cloud-with-rain', 'green-apple', 'dove'], finale: ['rainbow', 'dove'] },
}

export const NOAH: Classic = {
  id: 'B01',
  source: '聖經《創世記》',
  zh: '挪亞方舟',
  band: 'small',
  faith: 'bible',
  chapter: SMALL,
  grown: { middle: MIDDLE },
}
