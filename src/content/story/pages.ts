// 故事每一句的插畫擺法（T-119，家長 2026-11-09：「可以，全部畫」）：句子的 key → 場景、誰在畫面上、什麼姿勢、站在哪裡。
// 格式在 art/storybook/layout.ts（PageArt），角色庫在 art/storybook/meta.ts。每週新劇本的擺法直接寫在每一句的 art 欄位。
// 這裡沒寫到的句子（依主線的備用句、孵出來的朋友）照 pic 自動排一頁（layout.ts 的 fromPic）。
import { fromPic, sceneOf, type Cast, type PageArt, type SceneId, type Size, type Slot } from '../../art/storybook/layout'
import type { Beat, Chapter } from './types'
import { beatKey } from './index'

const c = (who: string, at: Slot = 'C', size: Size = 'M', more: Partial<Cast> = {}): Cast => ({ who, at, size, ...more })
const P = (scene: SceneId, cast: Cast[], back?: Cast[]): PageArt => (back ? { scene, cast, back } : { scene, cast })

/** 開門口令（每一章開場的最後一句）：魔法門在中間，豆豆、莫莫在兩邊 */
const KNOCK = P('home', [c('dodo', 'L'), c('door', 'C', 'L'), c('momo', 'R')])
/** 回魔法屋 */
const HOME = P('meadow', [c('house', 'C', 'L'), c('moon', 'R', 'S')])

export const PAGE_ART: Record<string, PageArt> = {
  // ── 故事時間的開場、結尾（每一則經典共用） ──
  'story.classic.open.0': P('home', [c('momo', 'L'), c('book-open', 'RC')]),
  'story.classic.open.1': P('home', [c('book-open', 'C', 'L')]),
  'story.classic.close': P('home', [c('book-closed', 'LC'), c('momo', 'RC', 'M', { flip: true })]),

  // ── 龜兔賽跑 ──
  'story.classic-a01.stop.0.0': P('park', [c('rabbit', 'C', 'L')], [c('tree', 'R', 'M')]),
  'story.classic-a01.stop.0.1': P('park', [c('rabbit', 'C', 'L', { pose: 'run' })]),
  'story.classic-a01.stop.1.0': P('park', [c('turtle', 'C', 'L', { pose: 'walk' })], [c('tree', 'L', 'M')]),
  'story.classic-a01.stop.1.1': P('park', [c('turtle', 'C', 'L', { pose: 'walk' })]),
  'story.classic-a01.stop.1.2': P('park', [c('rabbit', 'LC'), c('turtle', 'RC', 'M', { pose: 'walk', flip: true })], [c('banner', 'C', 'L')]),
  'story.classic-a01.stop.2.0': P('park', [c('turtle', 'L', 'S', { pose: 'walk' }), c('rabbit', 'RC', 'L', { pose: 'run' })], [c('tree', 'R', 'M')]),
  'story.classic-a01.stop.2.1': P('park', [c('rabbit', 'RC', 'M', { pose: 'sleep' })], [c('tree', 'RC', 'L')]),
  'story.classic-a01.stop.3.0': P('park', [c('turtle', 'L', 'M', { pose: 'walk' }), c('rabbit', 'R', 'M', { pose: 'sleep' })], [c('tree', 'R', 'L')]),
  'story.classic-a01.stop.4.0': P('park', [c('rabbit', 'L', 'S'), c('turtle', 'RC', 'M', { pose: 'cheer' })], [c('banner', 'RC', 'L')]),
  'story.classic-a01.stop.4.1': P('park', [c('rabbit', 'L'), c('trophy', 'C', 'S'), c('turtle', 'R', 'M', { pose: 'cheer', flip: true })]),

  // ── 挪亞方舟（小班版）：不畫挪亞本人（宗教人物不畫），只畫方舟和動物 ──
  'story.classic-b01.stop.0.0': P('meadow', [c('planks', 'L', 'S'), c('hammer', 'C', 'S'), c('ark', 'R', 'L')]),
  'story.classic-b01.stop.0.1': P('meadow', [c('planks', 'LC'), c('hammer', 'RC')]),
  'story.classic-b01.stop.1.0': P('meadow', [c('zebra', 'LC', 'M', { two: true })], [c('ark', 'R', 'L')]),
  'story.classic-b01.stop.1.1': P('meadow', [c('elephant', 'LC', 'M', { two: true })], [c('ark', 'R', 'L')]),
  'story.classic-b01.stop.1.2': P('meadow', [c('giraffe', 'LC', 'M', { two: true })], [c('ark', 'R', 'L')]),
  'story.classic-b01.stop.2.0': P('rain', [c('ark', 'C', 'L'), c('raincloud', 'L', 'S')]),
  'story.classic-b01.stop.2.1': P('rain', [c('ark', 'C', 'L', { pose: 'full' })]),
  'story.classic-b01.stop.3.0': P('ark-in', [c('giraffe', 'LC', 'L'), c('bird', 'RC', 'S', { flip: true })]),
  'story.classic-b01.stop.4.0': P('sea', [c('ark', 'C', 'L'), c('sun', 'R', 'M', { pose: 'face' })]),
  'story.classic-b01.stop.4.1': P('sea', [c('ark', 'C', 'M', { pose: 'full' }), c('rainbow', 'C', 'L')]),

  // ── 挪亞方舟（中班的長大版） ──
  'story.classic-b01-m.stop.0.0': P('meadow', [c('planks', 'L', 'S'), c('hammer', 'C', 'S'), c('ark', 'R', 'L')]),
  'story.classic-b01-m.stop.0.1': P('meadow', [c('planks', 'LC'), c('hammer', 'RC'), c('sun', 'R', 'S')]),
  'story.classic-b01-m.stop.1.0': P('meadow', [c('lion', 'LC', 'M', { two: true })], [c('ark', 'R', 'L')]),
  'story.classic-b01-m.stop.1.1': P('meadow', [c('lion', 'L', 'S', { two: true }), c('monkey', 'C', 'S', { two: true }), c('turtle', 'R', 'S', { two: true, pose: 'walk' })]),
  'story.classic-b01-m.stop.1.2': P('meadow', [c('lion', 'L', 'S', { two: true }), c('monkey', 'C', 'S', { two: true }), c('turtle', 'R', 'S', { two: true, pose: 'walk' })]),
  'story.classic-b01-m.stop.2.0': P('rain', [c('ark', 'C', 'L'), c('raincloud', 'L', 'S')]),
  'story.classic-b01-m.stop.3.0': P('ark-in', [c('elephant', 'L'), c('apples', 'C', 'S'), c('giraffe', 'R', 'M', { flip: true })]),
  'story.classic-b01-m.stop.3.1': P('ark-in', [c('giraffe', 'LC', 'L'), c('bird', 'RC', 'S', { flip: true })]),
  'story.classic-b01-m.stop.4.0': P('sea', [c('ark', 'R', 'M'), c('dove', 'LC', 'M', { pose: 'fly', flip: true })]),
  'story.classic-b01-m.stop.4.1': P('sea', [c('dove', 'C', 'L', { pose: 'leaf' })]),
  'story.classic-b01-m.stop.4.2': P('meadow', [c('seedling', 'LC', 'M'), c('tree', 'R', 'L')]),
  'story.classic-b01-m.finale.0': P('meadow', [c('giraffe', 'L'), c('elephant', 'C'), c('rainbow', 'R', 'M')], [c('ark', 'R', 'M', { pose: 'full' })]),

  // ── 彩虹蛋滾進來了（第一部第 1 篇） ──
  'story.p1-a01-c1.intro.0': P('home', [c('dodo', 'L', 'M', { pose: 'cheer' }), c('egg', 'RC', 'L')]),
  'story.p1-a01-c1.intro.1': P('home', [c('egg', 'C', 'L')]),
  'story.p1-a01-c1.intro.2': KNOCK,
  'story.p1-a01-c1.stop.1.0': P('city', [c('bus', 'C', 'L', { with: 'egg' })]),
  'story.p1-a01-c1.end.0': HOME,
  'story.p1-a01-c1.end.1': P('bedroom', [c('egg', 'C', 'L', { pose: 'sleep' })]),
  'story.p1-a01-c2.intro.0': P('home', [c('bobo', 'L'), c('egg', 'RC', 'M')]),
  'story.p1-a01-c2.intro.1': P('home', [c('egg', 'LC', 'M'), c('bed', 'R', 'M')]),
  'story.p1-a01-c2.intro.2': KNOCK,
  'story.p1-a01-c2.stop.2.0': P('farm', [c('sheep', 'LC', 'L'), c('yarn', 'R', 'M')]),
  'story.p1-a01-c2.end.0': HOME,
  'story.p1-a01-c2.end.1': P('home', [c('yarn', 'LC', 'M'), c('egg', 'RC', 'M')]),
  'story.p1-a01-c3.intro.0': P('home', [c('egg', 'LC', 'M'), c('yarn', 'RC', 'M')]),
  'story.p1-a01-c3.intro.1': P('home', [c('dodo', 'L', 'M', { pose: 'cheer' }), c('egg', 'RC', 'M')]),
  'story.p1-a01-c3.intro.2': KNOCK,
  'story.p1-a01-c3.stop.2.0': P('meadow', [c('blanket', 'C', 'L')]),
  'story.p1-a01-c3.end.0': HOME,
  'story.p1-a01-c3.end.1': P('home', [c('blanket', 'C', 'L', { with: 'egg' })]),
  'story.p1-a01-c4.intro.0': P('home', [c('yarn', 'LC', 'M'), c('blanket', 'RC', 'M')]),
  'story.p1-a01-c4.intro.1': P('home', [c('egg', 'C', 'L')]),
  'story.p1-a01-c4.intro.2': KNOCK,
  'story.p1-a01-c4.stop.0.0': P('market', [c('basket', 'C', 'L')]),
  'story.p1-a01-c4.stop.0.1': P('market', [c('basket', 'C', 'L', { with: 'egg' })]),
  'story.p1-a01-c4.end.0': P('home', [c('basket', 'C', 'L', { with: 'egg' })]),
  'story.p1-a01-c4.end.1': HOME,
  'story.p1-a01-c5.intro.0': P('home', [c('yarn', 'L', 'M'), c('blanket', 'C', 'M'), c('basket', 'R', 'M')]),
  'story.p1-a01-c5.intro.1': P('home', [c('dodo', 'LC', 'M', { pose: 'cheer' }), c('egg', 'RC', 'M')]),
  'story.p1-a01-c5.intro.2': KNOCK,
  'story.p1-a01-c5.stop.2.0': P('bedroom', [c('teddy', 'LC', 'M'), c('egg', 'RC', 'M')]),
  'story.p1-a01-c5.end.0': P('home', [c('nest', 'C', 'L')]),
  'story.p1-a01-c5.end.1': P('home', [c('nest', 'C', 'L')]),
  'story.p1-a01-c5.end.2': P('bedroom', [c('nest', 'C', 'L'), c('moon', 'R', 'S')]),

  // ── 12 扇門的通用章節（標題、開場、5 站、結尾） ──
  'theme.bus.title': P('city', [c('momo', 'L'), c('bus', 'RC', 'L')]),
  'theme.bus.intro': P('city', [c('bus', 'C', 'L')]),
  'theme.bus.stop.0': P('city', [c('bus-stop', 'LC', 'L'), c('momo', 'RC')]),
  'theme.bus.stop.1': P('city', [c('bus', 'C', 'L')]),
  'theme.bus.stop.2': P('city', [c('traffic-light', 'L', 'L'), c('bus', 'RC', 'M')]),
  'theme.bus.stop.3': P('meadow', [c('bridge', 'C', 'L')]),
  'theme.bus.stop.4': P('zoo', [c('giraffe', 'C', 'L')]),
  'theme.bus.end': P('zoo', [c('momo', 'LC', 'M', { pose: 'cheer' }), c('giraffe', 'RC', 'M', { flip: true })]),
  'theme.dino.title': P('valley', [c('dodo', 'C', 'L')]),
  'theme.dino.intro': P('valley', [c('dodo', 'LC', 'M', { pose: 'cheer' }), c('volcano', 'R', 'M')]),
  'theme.dino.stop.0': P('valley', [c('footprints', 'LC', 'M'), c('dodo', 'R')]),
  'theme.dino.stop.1': P('valley', [c('sauropod', 'C', 'L')]),
  'theme.dino.stop.2': P('valley', [c('volcano', 'C', 'L')]),
  'theme.dino.stop.3': P('valley', [c('dodo', 'L'), c('dino-nest', 'RC', 'M')]),
  'theme.dino.stop.4': P('valley', [c('trex', 'C', 'L')]),
  'theme.dino.end': P('valley', [c('dodo', 'L', 'M', { pose: 'cheer' }), c('dino-nest', 'RC', 'M')]),
  'theme.farm.title': P('farm', [c('bobo', 'RC', 'L')]),
  'theme.farm.intro': P('farm', [c('bobo', 'RC', 'M', { pose: 'cheer' })]),
  'theme.farm.stop.0': P('farm', [c('tractor', 'RC', 'L')]),
  'theme.farm.stop.1': P('farm', [c('cow', 'RC', 'L')]),
  'theme.farm.stop.2': P('farm', [c('sheep', 'RC', 'L')]),
  'theme.farm.stop.3': P('farm', [c('pig', 'RC', 'L')]),
  'theme.farm.stop.4': P('farm', [c('chicken', 'RC', 'L')]),
  'theme.farm.end': P('farm', [c('bobo', 'RC', 'M', { pose: 'cheer' }), c('sun', 'L', 'S')]),
  'theme.fire.title': P('city', [c('dodo', 'L'), c('fire-truck', 'RC', 'L')]),
  'theme.fire.intro': P('city', [c('fire-truck', 'C', 'L')]),
  'theme.fire.stop.0': P('city', [c('dodo', 'L'), c('fire-truck', 'RC', 'L')]),
  'theme.fire.stop.1': P('city', [c('police-car', 'C', 'L')]),
  'theme.fire.stop.2': P('city', [c('ladder', 'C', 'L')]),
  'theme.fire.stop.3': P('city', [c('fire-truck', 'L', 'M'), c('water', 'RC', 'M')]),
  'theme.fire.stop.4': P('city', [c('cat', 'C', 'L')]),
  'theme.fire.end': P('city', [c('cat', 'LC', 'M'), c('dodo', 'RC', 'M', { pose: 'cheer', flip: true })]),
  'theme.ocean.title': P('sea', [c('sailboat', 'C', 'L')]),
  'theme.ocean.intro': P('sea', [c('sailboat', 'C', 'L')]),
  'theme.ocean.stop.0': P('sea', [c('sailboat', 'LC', 'L'), c('sun', 'R', 'S')]),
  'theme.ocean.stop.1': P('sea', [c('fish', 'LC', 'M'), c('fish', 'RC', 'S', { flip: true })]),
  'theme.ocean.stop.2': P('sea', [c('octopus', 'C', 'L')]),
  'theme.ocean.stop.3': P('sea', [c('whale', 'C', 'L')]),
  'theme.ocean.stop.4': P('beach', [c('beach-umbrella', 'RC', 'L')]),
  'theme.ocean.end': P('beach', [c('momo', 'LC', 'M', { pose: 'cheer' }), c('beach-umbrella', 'R', 'M')]),
  'theme.rain.title': P('rain', [c('bobo', 'C', 'L')]),
  'theme.rain.intro': P('rain', [c('bobo', 'C', 'M'), c('raincloud', 'R', 'S')]),
  'theme.rain.stop.0': P('rain', [c('raincloud', 'C', 'L'), c('bobo', 'L', 'S')]),
  'theme.rain.stop.1': P('rain', [c('umbrella', 'LC', 'L'), c('bobo', 'RC', 'M', { flip: true })]),
  'theme.rain.stop.2': P('rain', [c('frog', 'C', 'L')]),
  'theme.rain.stop.3': P('rain', [c('snail', 'C', 'L')]),
  'theme.rain.stop.4': P('meadow', [c('bobo', 'LC', 'M'), c('sun', 'R', 'M', { pose: 'face' })]),
  'theme.rain.end': P('meadow', [c('bobo', 'L', 'M', { pose: 'cheer' }), c('rainbow', 'RC', 'L')]),
  'theme.fruit.title': P('market', [c('momo', 'L'), c('basket', 'RC', 'M')]),
  'theme.fruit.intro': P('market', [c('momo', 'LC'), c('basket', 'RC', 'M')]),
  'theme.fruit.stop.0': P('market', [c('basket', 'C', 'L')]),
  'theme.fruit.stop.1': P('market', [c('apples', 'C', 'L')]),
  'theme.fruit.stop.2': P('market', [c('banana', 'C', 'L')]),
  'theme.fruit.stop.3': P('market', [c('grapes', 'C', 'L')]),
  'theme.fruit.stop.4': P('market', [c('watermelon', 'C', 'L')]),
  'theme.fruit.end': P('market', [c('momo', 'L', 'M', { pose: 'cheer' }), c('basket', 'RC', 'L', { pose: 'full' })]),
  'theme.zoo.title': P('zoo', [c('bobo', 'C', 'L')]),
  'theme.zoo.intro': P('zoo', [c('bobo', 'C', 'M', { pose: 'cheer' })]),
  'theme.zoo.stop.0': P('zoo', [c('elephant', 'C', 'L')]),
  'theme.zoo.stop.1': P('zoo', [c('giraffe', 'C', 'L')]),
  'theme.zoo.stop.2': P('zoo', [c('monkey', 'C', 'L', { two: true })]),
  'theme.zoo.stop.3': P('zoo', [c('zebra', 'C', 'L')]),
  'theme.zoo.stop.4': P('zoo', [c('lion', 'C', 'L')]),
  'theme.zoo.end': P('zoo', [c('bobo', 'C', 'L', { pose: 'cheer' })]),
  'theme.build.title': P('site', [c('bobo', 'L'), c('frame', 'RC', 'L')]),
  'theme.build.intro': P('site', [c('bobo', 'LC'), c('blocks', 'RC', 'M')]),
  'theme.build.stop.0': P('site', [c('cone', 'L', 'M'), c('bobo', 'C', 'M', { pose: 'cheer' })]),
  'theme.build.stop.1': P('site', [c('blocks', 'C', 'L')]),
  'theme.build.stop.2': P('site', [c('truck', 'C', 'L')]),
  'theme.build.stop.3': P('site', [c('hammer', 'LC', 'M'), c('blocks', 'RC', 'M')]),
  'theme.build.stop.4': P('site', [c('frame', 'C', 'L')]),
  'theme.build.end': P('site', [c('bobo', 'L', 'M', { pose: 'cheer' }), c('new-house', 'RC', 'L')]),
  'theme.bedtime.title': P('bedroom', [c('momo', 'L'), c('bed', 'RC', 'M')]),
  'theme.bedtime.intro': P('bedroom', [c('momo', 'LC'), c('moon', 'R', 'S')]),
  'theme.bedtime.stop.0': P('bedroom', [c('bathtub', 'C', 'L')]),
  'theme.bedtime.stop.1': P('bedroom', [c('toothbrush', 'C', 'L')]),
  'theme.bedtime.stop.2': P('bedroom', [c('teddy', 'C', 'L')]),
  'theme.bedtime.stop.3': P('bedroom', [c('momo', 'LC'), c('moon', 'R', 'M')]),
  'theme.bedtime.stop.4': P('bedroom', [c('momo', 'L', 'M', { pose: 'sleep' }), c('bed', 'RC', 'M')]),
  'theme.bedtime.end': P('bedroom', [c('bed', 'LC', 'L', { with: 'teddy' }), c('moon', 'R', 'S')]),
  'theme.birthday.title': P('party', [c('dodo', 'L'), c('cake', 'RC', 'M')]),
  'theme.birthday.intro': P('party', [c('dodo', 'LC', 'M', { pose: 'cheer' }), c('balloons', 'RC', 'L')]),
  'theme.birthday.stop.0': P('party', [c('gift', 'C', 'L')]),
  'theme.birthday.stop.1': P('party', [c('balloons', 'C', 'L')]),
  'theme.birthday.stop.2': P('party', [c('cake', 'C', 'L')]),
  'theme.birthday.stop.3': P('party', [c('dodo', 'L', 'M', { pose: 'cheer' }), c('confetti', 'RC', 'M')]),
  'theme.birthday.stop.4': P('party', [c('teddy', 'C', 'L')]),
  'theme.birthday.end': P('party', [c('dodo', 'L', 'M', { pose: 'cheer' }), c('cake', 'C', 'M'), c('balloons', 'R', 'M')]),
  'theme.picnic.title': P('meadow', [c('bobo', 'L'), c('picnic-blanket', 'RC', 'M')]),
  'theme.picnic.intro': P('meadow', [c('bobo', 'L', 'M', { pose: 'cheer' }), c('picnic-blanket', 'RC', 'M')]),
  'theme.picnic.stop.0': P('meadow', [c('tree', 'C', 'L')]),
  'theme.picnic.stop.1': P('meadow', [c('butterfly', 'C', 'L')]),
  'theme.picnic.stop.2': P('meadow', [c('picnic-blanket', 'C', 'M', { with: 'sandwich' })]),
  'theme.picnic.stop.3': P('meadow', [c('bobo', 'L'), c('kite', 'RC', 'M')]),
  'theme.picnic.stop.4': P('meadow', [c('bobo', 'L'), c('sun', 'RC', 'L', { pose: 'face' })]),
  'theme.picnic.end': P('meadow', [c('bobo', 'L', 'M', { pose: 'cheer' }), c('picnic-blanket', 'RC', 'M', { with: 'sandwich' })]),
}

/** 這一句的插畫擺法：每週新劇本寫在句子的 art 裡，手寫的章節寫在上面的表 */
export const pageArtOf = (key: string, inline?: PageArt): PageArt | null => inline ?? PAGE_ART[key] ?? null

/**
 * 講故事時這一句的畫面：手寫的照 key 查表；每週新劇本寫在句子的 art；都沒有的照 pic 自動排一頁（場景用這一章的）。
 * ch：這一章（每週新劇本的 art 要從句子裡找）；sceneKind：這一章的場景（ChapterLook.scene）。
 */
export function artForBeat(ch: Chapter | null, key: string, pic: string | undefined, sceneKind: string | undefined): PageArt | null {
  if (PAGE_ART[key]) return PAGE_ART[key]
  const inline = ch ? beatsOf(ch).find(([k]) => k === key)?.[1].art : undefined
  return inline ?? fromPic(pic, sceneOf(sceneKind))
}

/** 一章所有的句子和它們的 key（跟 chapterLines 同一個順序、同一套 key） */
function beatsOf(ch: Chapter): [string, Beat][] {
  const out: [string, Beat][] = []
  const add = (slot: string, bs: Beat[] | undefined) => bs?.forEach((b, i) => out.push([beatKey(ch, slot, i, b), b]))
  if (ch.title) add('title', [ch.title])
  add('intro', ch.intro)
  ch.stops.forEach((s, n) => {
    if (!s) return
    add(`stop.${n}`, s.generic)
    for (const t of ['lang', 'num', 'think', 'hand'] as const) add(`stop.${n}.${t}`, s[t])
  })
  add('finale', ch.finale)
  add('end', ch.end)
  return out
}
