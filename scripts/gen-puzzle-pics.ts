// 產生拼圖圖庫的「組合圖」（T-159，家長 2026-11-16：拼圖圖庫至少 200 張）：npx tsx scripts/gen-puzzle-pics.ts
// 每個場景一組住在那裡的角色、東西（故事插畫的角色庫＋專案已經在用的 Fluent Emoji），挑三樣站在左、中、右，
// 擺法要過 problemsOf（不疊、不超出、角色 ≤ 3），3×3 切開每一格都有東西（coverage.ts），
// 同一個場景裡任兩張最多只有一樣一樣（細細、扁扁的東西：氣球、站牌、紅綠燈、蟲、攤開的書、木板、三角錐、雨傘、三明治、警車，切開只剩線條，不放；
// 海上的動物站在水裡、切開下面幾片只剩水，也不做海上的組合圖），每一樣在整個圖庫最多出現幾次（多樣）。寫到 src/games/puzzle/pics-mix.ts。
// 句子：「Cow, pig, and duck!」（≤ 6 個字），拼完念，順便聽到三樣東西的英文。
// 產生完要產語音：npx tsx scripts/extract-phrases.ts && python scripts/gen_audio.py --only pz.
import { writeFileSync } from 'node:fs'
import { problemsOf, type Cast, type PageArt, type SceneId } from '../src/art/storybook/layout'
import { ITEMS } from '../src/art/storybook/meta'
import { EMOJI } from '../src/art/emoji.generated'
import { emptyCells, seedOf, withSky } from '../src/games/puzzle/coverage'
import { HAND_PICS } from '../src/games/puzzle/pics-hand'

/** 'who|英文|中文|姿勢'：英文、中文省略就用角色庫的（words 第一個、zh）；Fluent Emoji 的寫 *who */
const POOLS: Record<string, { scene: SceneId; n: number; items: string[] }> = {
  meadow: { scene: 'meadow', n: 26, items: ['dodo|Dodo', 'momo|Momo', 'bobo|Bobo', 'rabbit', 'turtle|turtle||walk', 'sheep', 'frog', 'snail', 'bird', 'cat', '*duck|duck|鴨子', '*deer|deer|鹿', '*fox|fox|狐狸', '*hedgehog|hedgehog|刺蝟', '*mushroom|mushroom|香菇', '*tulip|flower|鬱金香', '*sunflower|sunflower|向日葵', '*honeybee|bee|蜜蜂', '*lady-beetle|ladybug|瓢蟲', '*unicorn|unicorn|獨角獸', '*goat|goat|山羊', '*bear|bear|熊', '*owl|owl|貓頭鷹'] },
  park: { scene: 'park', n: 14, items: ['dodo|Dodo', 'momo|Momo', 'bobo|Bobo', 'bird', 'cat', 'rabbit', 'apples|apples', 'basket', '*bicycle|bike|腳踏車', '*soccer-ball|ball|足球', '*tulip|flower|鬱金香', '*duck|duck|鴨子'] },
  farm: { scene: 'farm', n: 16, items: ['cow', 'pig', 'sheep', 'chicken', 'tractor', 'apples|apples', 'basket', 'rabbit', 'cat', '*horse|horse|馬', '*goat|goat|山羊', '*duck|duck|鴨子', '*front-facing-baby-chick|chick|小雞', '*carrot|carrot|紅蘿蔔', '*tomato|tomato|番茄'] },
  zoo: { scene: 'zoo', n: 24, items: ['lion', 'zebra', 'giraffe', 'elephant', 'monkey', 'turtle|turtle||walk', '*panda|panda|熊貓', '*kangaroo|kangaroo|袋鼠', '*koala|koala|無尾熊', '*penguin|penguin|企鵝', '*crocodile|crocodile|鱷魚', '*hippopotamus|hippo|河馬', '*gorilla|gorilla|大猩猩', '*snake|snake|蛇', '*bear|bear|熊'] },
  beach: { scene: 'beach', n: 10, items: ['dodo|Dodo', 'momo|Momo', 'bobo|Bobo', 'turtle|turtle||walk', 'watermelon', '*crab|crab|螃蟹', '*ice-cream|ice cream|冰淇淋', '*soccer-ball|ball|足球', '*penguin|penguin|企鵝', 'cat'] },
  valley: { scene: 'valley', n: 10, items: ['sauropod|dinosaur', 'trex|T-rex', 'egg', 'dino-nest|nest', 'dodo|Dodo', 'momo|Momo', 'bobo|Bobo', '*lizard|lizard|蜥蜴', '*mammoth|mammoth|長毛象', '*crocodile|crocodile|鱷魚', '*turtle|turtle|烏龜'] },
  city: { scene: 'city', n: 16, items: ['bus', 'fire-truck|fire truck', 'truck', 'cat', 'dodo|Dodo', 'momo|Momo', 'bobo|Bobo', '*taxi|taxi|計程車', '*automobile|car|汽車', '*ambulance|ambulance|救護車', '*motor-scooter|scooter|機車', '*bicycle|bike|腳踏車', '*motorcycle|motorcycle|摩托車'] },
  site: { scene: 'site', n: 6, items: ['truck', 'blocks|bricks', 'ladder', 'tractor', 'dodo|Dodo', 'momo|Momo', 'bobo|Bobo', '*wrench|wrench|扳手'] },
  market: { scene: 'market', n: 22, items: ['apples|apples', 'banana', 'grapes|grapes', 'watermelon', 'basket', 'monkey', '*strawberry|strawberry|草莓', '*cherries|cherries|櫻桃', '*pear|pear|西洋梨', '*peach|peach|桃子', '*lemon|lemon|檸檬', '*tangerine|orange|橘子', '*mango|mango|芒果', '*kiwi-fruit|kiwi|奇異果', '*tomato|tomato|番茄', '*carrot|carrot|紅蘿蔔', '*bread|bread|麵包'] },
  party: { scene: 'party', n: 20, items: ['cake', 'gift|present', 'dodo|Dodo', 'momo|Momo', 'bobo|Bobo', 'teddy', '*cupcake|cupcake|杯子蛋糕', '*pizza|pizza|披薩', '*ice-cream|ice cream|冰淇淋', '*lollipop|lollipop|棒棒糖', '*doughnut|donut|甜甜圈', '*cookie|cookie|餅乾', '*popcorn|popcorn|爆米花', '*hamburger|burger|漢堡', '*hot-dog|hot dog|熱狗'] },
  home: { scene: 'home', n: 18, items: ['dodo|Dodo', 'momo|Momo', 'bobo|Bobo', 'cat', 'teddy', 'blocks', 'yarn', '*books|books|書', '*crayon|crayon|蠟筆', '*robot|robot|機器人', '*drum|drum|鼓', '*violin|violin|小提琴', '*yo-yo|yo-yo|溜溜球', '*soccer-ball|ball|足球', '*basketball|basketball|籃球', '*puzzle-piece|puzzle|拼圖', '*abacus|abacus|算盤'] },
  rain: { scene: 'rain', n: 6, items: ['frog', 'snail', 'dodo|Dodo', 'momo|Momo', 'bobo|Bobo', '*duck|duck|鴨子', '*mushroom|mushroom|香菇'] },
}
/** 每一樣在整個組合圖裡最多出現幾次 */
const CAP = 6
const SLOTS = ['L', 'C', 'R'] as const

interface It {
  who: string
  en: string
  zh: string
  pose?: string
  emoji: boolean
  key: string
}
function parse(s: string): It {
  const [raw, en, zh, pose] = s.split('|')
  const emoji = raw.startsWith('*')
  const who = emoji ? raw.slice(1) : raw
  if (emoji && !EMOJI[who]) throw new Error(`emoji.generated.ts 沒有 ${who}`)
  if (!emoji && !ITEMS[who]) throw new Error(`角色庫沒有 ${who}`)
  return { who, en: en || ITEMS[who].words[0], zh: zh || ITEMS[who].zh, pose: pose || undefined, emoji, key: `${emoji ? '' : ''}${who}` }
}

/** 固定的亂數（每次產生的結果一樣） */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

const isChar = (it: It) => it.emoji || ITEMS[it.who].kind === 'char'
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const cap1 = (s: string) => s[0].toUpperCase() + s.slice(1)

const used = new Map<string, number>()
const taken = new Set(HAND_PICS.map((p) => p.id))
const out: { id: string; zh: string; en: string; art: PageArt }[] = []
let si = 0
for (const [name, pool] of Object.entries(POOLS)) {
  const items = pool.items.map(parse)
  const combos: It[][] = []
  for (let a = 0; a < items.length; a++)
    for (let b = 0; b < items.length; b++)
      for (let c = 0; c < items.length; c++) if (a !== b && b !== c && a !== c) combos.push([items[a], items[b], items[c]])
  const r = rng(1000 + si++)
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[combos[i], combos[j]] = [combos[j], combos[i]]
  }
  // 用得少的先挑（每一樣都輪得到）
  const sets: Set<string>[] = []
  let got = 0
  for (let round = 0; round < 3 && got < pool.n; round++)
    for (const trio of combos) {
      if (got >= pool.n) break
      if (trio.some((t) => (used.get(t.who) ?? 0) >= CAP - (round === 0 ? 2 : round === 1 ? 1 : 0))) continue
      if (trio.filter(isChar).length > 3) continue
      if (sets.some((s) => trio.filter((t) => s.has(t.who)).length > 1)) continue
      const en = `${cap1(trio[0].en)}, ${trio[1].en}, and ${trio[2].en}!`
      if (en.split(/\s+/).length > 6) continue
      const cast: Cast[] = trio.map((t, k) => ({
        who: t.who,
        at: SLOTS[k],
        size: 'L',
        ...(t.emoji ? { emoji: t.who } : {}),
        ...(t.pose ? { pose: t.pose } : {}),
        // 右邊的角色面向中間
        ...(k === 2 && isChar(t) ? { flip: true } : {}),
      }))
      const id = `${name}-${trio.map((t) => slug(t.en)).join('-')}`
      if (taken.has(id)) continue
      const art: PageArt = { scene: pool.scene, cast }
      if (problemsOf(art).blocking.length) continue
      if (emptyCells(withSky(art, seedOf(id))).length) continue
      taken.add(id)
      sets.push(new Set(trio.map((t) => t.who)))
      for (const t of trio) used.set(t.who, (used.get(t.who) ?? 0) + 1)
      out.push({ id, zh: trio.map((t) => t.zh).join('、'), en, art })
      got++
    }
  console.log(`${name}: ${got}/${pool.n}`)
}

const body = out.map((p) => `  ${JSON.stringify(p).replace(/"([a-z]+)":/g, '$1: ').replace(/"/g, "'")},`).join('\n')
writeFileSync(
  'src/games/puzzle/pics-mix.ts',
  `// 由 scripts/gen-puzzle-pics.ts 產生，請勿手動修改（改那個檔的場景清單再跑一次）。T-159 拼圖圖庫的組合圖：一個場景、左中右三樣。
import type { PuzzlePic } from './pics-hand'

export const MIX_PICS: PuzzlePic[] = [
${body}
]
`,
)
console.log(`共 ${out.length} 張 → src/games/puzzle/pics-mix.ts`)
