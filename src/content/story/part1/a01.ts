// 第一部 第 1 篇〈彩虹蛋滾進來了〉（docs/故事世界.md §6.1 示範劇本，小班段，5 章）
// 這一週的事：一顆大蛋滾進魔法屋。大家每天出門，帶一樣軟軟的東西回來，幫蛋做一個窩。週末魔法屋多了蛋窩。
//
// 第一部的 5 站用門後面原本的旁白（BEATS），其中一站換成故事的句子（stops 裡 null 的站用門原本的那一句）。
// 跟劇本不一樣的地方（都只為了 `|` 只能加重句尾的字）：
// - 「A round **basket**! Just right!」這種加重的字在句中的句子，拆成兩句（A round | basket! ／ Just right!）。
// - 「A **teddy bear** for the egg!」改成加重句尾的 egg（A teddy bear for the | egg!）。
import type { Arc, Beat, Chapter, StopBeats } from '../types'
import type { ThemeId } from '../../themes'

const EGG = '@rainbow-egg'
const KNOCK: Beat = { who: 'all', en: 'Knock, knock! Open, magic door!', pic: 'door' }

const one = (b: Beat): StopBeats => ({ generic: [b] })

function ch(n: number, door: ThemeId, intro: Beat[], stops: (StopBeats | null)[], end: Beat[], houseAdds?: string): Chapter {
  return { id: `p1-a01-c${n}`, kind: 'epic', part: 1, arc: 'p1-a01', chapter: n, band: 'small', faith: null, door, intro: [...intro, KNOCK], stops, end, houseAdds }
}

export const A01: Arc = {
  id: 'p1-a01',
  part: 1,
  no: 1,
  title: 'The Rainbow Egg Rolls In',
  zh: '彩虹蛋滾進來了',
  icon: EGG,
  band: 'small',
  houseAdds: 'egg-nest',
  chapters: [
    ch(
      1,
      'bus',
      [
        { who: 'dodo', en: 'Look! A big, big | egg!', pic: EGG },
        { who: 'egg', en: 'Gurgle, gurgle!', pic: EGG },
      ],
      [
        null,
        {
          // 第 2 站：蛋也一起坐公車。依主線的版本（§6.1 第 1 章的例子）：排到哪條線就用哪一句
          generic: [{ who: 'momo', en: 'The egg rides the | bus, too!', pic: `bus+${EGG}` }],
          lang: [{ who: 'momo', en: 'The egg loves new | words!', pic: `${EGG}+speech-balloon` }],
          num: [{ who: 'momo', en: 'Count for the egg! One, two…', pic: `${EGG}+keycap-2` }],
          think: [{ who: 'momo', en: 'Show the egg the | way!', pic: `${EGG}+world-map` }],
          hand: [{ who: 'momo', en: 'Draw a picture for the | egg!', pic: `${EGG}+crayon` }],
        },
      ],
      [
        { who: 'momo', en: 'Home to the Magic House.', pic: 'house-with-garden' },
        { who: 'momo', en: 'Good night, little | egg.', pic: `${EGG}+zzz` },
      ],
    ),
    ch(
      2,
      'farm',
      [
        { who: 'bobo', en: 'Good morning, little | egg!', pic: EGG },
        { who: 'bobo', en: 'The egg needs a soft bed.', pic: `${EGG}+bed` },
      ],
      [null, null, one({ who: 'bobo', en: 'Baa! Soft wool for the | egg!', pic: 'ewe+yarn' })],
      [
        { who: 'bobo', en: 'Home to the Magic House.', pic: 'house-with-garden' },
        { who: 'egg', en: 'Gurgle!', pic: `yarn+${EGG}` },
      ],
    ),
    ch(
      3,
      'picnic',
      [
        { who: 'dodo', en: 'The egg loves the soft wool!', pic: `yarn+${EGG}` },
        { who: 'dodo', en: "Let's find more soft things!", pic: EGG },
      ],
      [null, null, one({ who: 'dodo', en: 'A soft blanket for the | egg!', pic: '@blanket' })],
      [
        { who: 'dodo', en: 'Home to the Magic House!', pic: 'house-with-garden' },
        { who: 'dodo', en: 'Wrap, wrap. So cozy!', pic: `@blanket+${EGG}` },
      ],
    ),
    ch(
      4,
      'fruit',
      [
        { who: 'momo', en: 'Wool and a blanket. What next?', pic: 'yarn+@blanket' },
        { who: 'momo', en: 'Something round, like the egg.', pic: EGG },
      ],
      [
        {
          generic: [
            { who: 'momo', en: 'A round | basket!', pic: 'basket' },
            { who: 'momo', en: 'Just right!', pic: `basket+${EGG}` },
          ],
        },
      ],
      [
        { who: 'momo', en: 'The egg fits in the basket!', pic: `basket+${EGG}` },
        { who: 'momo', en: 'Home to the Magic House.', pic: 'house-with-garden' },
      ],
    ),
    ch(
      5,
      'bedtime',
      [
        { who: 'bobo', en: 'Wool, a blanket, a basket…', pic: 'yarn+basket' },
        { who: 'dodo', en: 'One more thing!', pic: EGG },
      ],
      [null, null, one({ who: 'dodo', en: 'A teddy bear for the | egg!', pic: `teddy-bear+${EGG}` })],
      [
        { who: 'momo', en: 'Look! A cozy egg | bed!', pic: '@egg-nest' },
        { who: 'egg', en: 'Gurgle, gurgle…', pic: '@egg-nest' },
        { who: 'momo', en: 'Good night, little egg.', pic: `@egg-nest+zzz` },
      ],
      'egg-nest',
    ),
  ],
}
