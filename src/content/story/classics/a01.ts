// 故事時間 A01 龜兔賽跑（docs/故事世界.md §7.1，小班段，伊索寓言）
// 莫莫在書房打開舊書：開場、結尾是故事時間固定的句子（§5.1），5 段放在 5 站之前。
// 兔子用豆豆的聲音、烏龜用波波的聲音，旁白是莫莫。用 Rabbit、Turtle（孩子學過的字），不用 hare、tortoise。
// 和原典不同：結尾不嘲笑兔子，兔子醒來為烏龜高興；不說「所以我們學到…」。
// 跟劇本不一樣的地方：加重的字在句中的「Here is **Rabbit**. Hop, hop, fast!」拆成兩句（`|` 只能加重句尾）；
// 拆開之後第 1 段變成 4 句，超過一段 3 句的上限，所以烏龜移到第 2 站，和「來比賽」一起。
import type { Classic } from '../types'
import { CLOSE_BOOK, OPEN_BOOK } from './fixed'

export const RABBIT_TURTLE: Classic = {
  id: 'A01',
  source: '伊索寓言',
  zh: '龜兔賽跑',
  band: 'small',
  faith: null,
  chapter: {
    id: 'classic-a01',
    kind: 'classic',
    part: 1,
    arc: 'classic',
    chapter: 1,
    band: 'small',
    faith: null,
    look: {
      title: 'Rabbit and Turtle',
      zh: '龜兔賽跑（故事時間）',
      host: 'momo',
      icon: 'open-book',
      scene: 'park',
      tint: '#EFE6D3',
      deep: '#A8875A',
      ground: '#DCCFB2',
      stops: ['rabbit', 'turtle', 'deciduous-tree', 'chequered-flag', 'trophy'],
      finale: ['turtle', 'trophy'],
    },
    intro: OPEN_BOOK,
    stops: [
      {
        generic: [
          { who: 'momo', en: 'Here is | Rabbit.', pic: 'rabbit' },
          { who: 'momo', en: 'Hop, hop, fast!', pic: 'rabbit' },
        ],
      },
      {
        // 拆成兩句之後一段最多 3 句（FRAME-11），烏龜移到第 2 站，和「來比賽」一起
        generic: [
          { who: 'momo', en: 'Here is | Turtle.', pic: 'turtle' },
          { who: 'momo', en: 'Step, step, slow.', pic: 'turtle' },
          { who: 'dodo', en: "Let's race! Ready, set, go!", pic: 'chequered-flag+rabbit' },
        ],
      },
      {
        generic: [
          { who: 'momo', en: 'Rabbit is fast. Then… a nap!', pic: 'rabbit' },
          { who: 'momo', en: 'Zzz… Rabbit sleeps under a tree.', pic: 'deciduous-tree+zzz' },
        ],
      },
      { generic: [{ who: 'momo', en: 'Turtle walks on. Step, step, step.', pic: 'turtle+deciduous-tree' }] },
      {
        generic: [
          { who: 'momo', en: 'Turtle wins! Slow and steady!', pic: 'trophy+turtle' },
          { who: 'dodo', en: 'Good job, Turtle!', pic: 'rabbit+turtle' },
        ],
      },
    ],
    end: CLOSE_BOOK,
  },
}
