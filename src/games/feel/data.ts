// 心情臉（社會情緒 SE-1，T-160）的內容：主角的小動物、60 個小情境（每種情緒 15 個）。只有資料，沒有畫面（scripts/test-where-feel.ts 直接測）。
// 只用 happy、sad、angry、scared 四種（指引 SE-1：3 歲說出或指出開心、難過、生氣、害怕）。
// 情境是一小段動畫：場景（沿用躲在哪裡的場景）＋道具（Fluent Emoji 或自己畫的小東西）照時間移動；主角在 turn 毫秒時換成那個心情的臉和動作。
// 座標跟躲在哪裡的場景一樣（1000×620，地面 y = 560）；主角站在 x = 400，右手大約在 HAND。
import type { PlaceId } from '../where/data'

export type Emo = 'happy' | 'sad' | 'angry' | 'scared'
export const EMOS: Emo[] = ['happy', 'sad', 'angry', 'scared']
export const EMO_ZH: Record<Emo, string> = { happy: '開心', sad: '難過', angry: '生氣', scared: '害怕' }
/** 「為什麼」那一層（T-164，4 歲：說出情緒的原因）多一種：驚訝。原本的 3 歲玩法只用上面四種 */
export type Mood = Emo | 'surprised'
export const MOODS: Mood[] = [...EMOS, 'surprised']
export const MOOD_ZH: Record<Mood, string> = { ...EMO_ZH, surprised: '驚訝' }

// ── 主角（自己畫的小動物，./critter.tsx） ──────────────────────

export type SpeciesId = 'bunny' | 'bear' | 'kitty' | 'puppy' | 'piggy' | 'mouse' | 'fox' | 'panda' | 'froggy' | 'ducky' | 'lion' | 'elephant' | 'monkey' | 'koala'
/** en：念的名字（How does Bunny feel?），像繪本裡的角色名字 */
export const SPECIES: { id: SpeciesId; en: string; zh: string }[] = [
  { id: 'bunny', en: 'Bunny', zh: '兔子' },
  { id: 'bear', en: 'Bear', zh: '小熊' },
  { id: 'kitty', en: 'Kitty', zh: '小貓' },
  { id: 'puppy', en: 'Puppy', zh: '小狗' },
  { id: 'piggy', en: 'Piggy', zh: '小豬' },
  { id: 'mouse', en: 'Mouse', zh: '老鼠' },
  { id: 'fox', en: 'Fox', zh: '狐狸' },
  { id: 'panda', en: 'Panda', zh: '熊貓' },
  { id: 'froggy', en: 'Froggy', zh: '青蛙' },
  { id: 'ducky', en: 'Ducky', zh: '小鴨' },
  { id: 'lion', en: 'Lion', zh: '獅子' },
  { id: 'elephant', en: 'Elephant', zh: '大象' },
  { id: 'monkey', en: 'Monkey', zh: '猴子' },
  { id: 'koala', en: 'Koala', zh: '無尾熊' },
]
export const SPECIES_IDS = SPECIES.map((s) => s.id)

// ── 情境的動畫 ───────────────────────────────────────────────

/** 一個時間點的狀態（沒寫的沿用上一個）：x、y 是中心，s 是大小倍數，r 是旋轉角度，o 是透明度 */
export interface Key {
  t: number
  x?: number
  y?: number
  s?: number
  r?: number
  o?: number
}

/** 道具長什麼樣：emoji，或自己畫的小東西（./scene.tsx 的 Drawn） */
export type Look =
  | { e: string; flip?: boolean }
  | { e: string; half: 'l' | 'r' }
  | { d: 'block'; c: string }
  | { d: 'picture' }
  | { d: 'scribble' }
  | { d: 'mud' }
  | { d: 'puddle' }
  | { d: 'castle' }
  | { d: 'flat-castle' }
  | { d: 'stool' }
  | { d: 'thread' }
  | { d: 'plate' }
  | { d: 'blanket' }
  | { d: 'wave' }
  | { d: 'firework'; c: string }

export interface Track {
  look: Look
  /** 方框大小（場景座標） */
  size: number
  k: Key[]
  /** 畫在主角後面（預設在前面） */
  behind?: boolean
}

/** 整個畫面的效果：fx 在 t 毫秒開始，跑一次就停（準則 MOTION-2、3：不循環、不連閃） */
export type Fx = 'confetti' | 'hearts' | 'rain' | 'flash' | 'dark' | 'snow' | 'sparkle' | 'burst' | 'notes' | 'splash' | 'bubbles' | 'zzz'

export interface Sit {
  id: string
  emo: Mood
  /** 旁白（≤ 6 個字，不說心情的字，讓孩子自己看臉、看發生什麼事） */
  say: string
  place: PlaceId
  /** 晚上（場景變暗、月亮星星）、下雨（灰灰的天空） */
  night?: boolean
  gray?: boolean
  tracks: Track[]
  /** 另一隻小動物（朋友）怎麼走：出場、做動作、離開；種類在出題時挑 */
  friend?: Key[]
  /** 朋友抱抱主角（開心） */
  hug?: boolean
  fx?: { kind: Fx; t: number; x?: number; y?: number }[]
  /** 主角幾毫秒時換成這個心情（預設 TURN） */
  turn?: number
  /** 主角手裡一開始拿著東西（手舉起來一點） */
  holding?: boolean
  /** T-164 看臉選情境的小圖停在幾毫秒（事情剛發生、看得出發生什麼事的那一刻；預設 turn） */
  snap?: number
}

/** 主角換表情的時間、整段動畫大約多長 */
export const TURN = 1500
export const HAND = { x: 500, y: 468 }
const FLOOR = 520
const SKY = 150

// ── 小工具：常用的動作 ─────────────────────────────────────

const em = (e: string, size: number, k: Key[], behind?: boolean): Track => ({ look: { e }, size, k, behind })
/** 拿在手上 */
const hold = (e: string, size = 96, extra: Key[] = []): Track => em(e, size, [{ t: 0, ...HAND, s: 1, r: 0, o: 1 }, ...extra])
/** 放在旁邊的小椅凳上 */
const STOOL_TOP = 452
const stool = (): Track => ({ look: { d: 'stool' }, size: 150, k: [{ t: 0, x: 640, y: 492 }], behind: true })
const onStool = (e: string, size = 90, extra: Key[] = []): Track => em(e, size, [{ t: 0, x: 640, y: STOOL_TOP - size / 2 + 8, o: 1, s: 1, r: 0 }, ...extra])
/** 從上面掉下來，停在 (x, y) */
const dropIn = (e: string, x: number, y: number, size = 96, at = 300, dur = 700): Track => em(e, size, [{ t: 0, x, y: -160, o: 1, s: 1, r: 0 }, { t: at }, { t: at + dur, y }])
/** 慢慢長出來（變大、出現） */
const grow = (e: string, x: number, y: number, size = 120, at = 300, dur = 900, behind?: boolean): Track => em(e, size, [{ t: 0, x, y, s: 0.2, o: 0, r: 0 }, { t: at }, { t: at + dur, s: 1, o: 1 }], behind)
/** 從左飛到右（經過） */
const pass = (e: string, y: number, size = 150, at = 200, dur = 1400, flip = false): Track => ({ look: { e, flip }, size, k: [{ t: 0, x: -200, y, o: 1, s: 1, r: 0 }, { t: at }, { t: at + dur, x: 1200 }] })
/** 朋友：從右邊走進來到 x，停一下，再（可以不）離開 */
const friendIn = (x = 720, at = 200, stay = 700, leave = true): Key[] => {
  const k: Key[] = [{ t: 0, x: 1200, o: 1 }, { t: at }, { t: at + 700, x }]
  if (stay) k.push({ t: at + 700 + stay })
  if (leave) k.push({ t: at + 700 + stay + 700, x: 1250 })
  return k
}
/** 一座三塊積木的塔，在 t 時倒下（往右散開） */
const tower = (x: number, fallAt: number | null, colors = ['#E0604E', '#F2C94C', '#4F7FC2']): Track[] =>
  colors.map((c, i) => {
    const y = FLOOR + 20 - 40 - i * 78
    const k: Key[] = [{ t: 0, x, y, r: 0, o: 1, s: 1 }]
    if (fallAt != null) k.push({ t: fallAt }, { t: fallAt + 500 + i * 120, x: x + 70 + i * 90, y: FLOOR + 20 - 40, r: 70 + i * 40 })
    return { look: { d: 'block', c }, size: 80, k }
  })
/** 積木一塊一塊疊上去（開心：疊好了） */
const stackUp = (x: number, colors = ['#5DAE76', '#F2C94C', '#E0604E']): Track[] =>
  colors.map((c, i) => ({ look: { d: 'block', c }, size: 80, k: [{ t: 0, x: x + 60, y: -120, o: 1, s: 1, r: 0 }, { t: 200 + i * 350 }, { t: 500 + i * 350, x, y: FLOOR + 20 - 40 - i * 78 }] }))
/** 朋友拿走主角手上的東西（跟著朋友一起離開） */
const taken = (e: string, size = 90, at = 200): Track =>
  em(e, size, [{ t: 0, ...HAND, o: 1, s: 1, r: 0 }, { t: at + 800 }, { t: at + 1000, x: 660, y: HAND.y - 10 }, { t: at + 1500 }, { t: at + 2200, x: 1190 }])

// ── 60 個情境 ─────────────────────────────────────────────────
// 每一句旁白只說發生什麼事；主角的臉、身體、小符號（眼淚、汗、怒氣）在 turn 的時候出來。

const HAPPY: Sit[] = [
  { id: 'h-gift', emo: 'happy', say: 'A present for you!', place: 'living', holding: true, friend: friendIn(700, 200, 900), tracks: [em('wrapped-gift', 96, [{ t: 0, x: 1150, y: HAND.y, o: 1, s: 1 }, { t: 200 }, { t: 900, x: 620 }, { t: 1200, x: HAND.x }])], fx: [{ kind: 'sparkle', t: 1300, x: HAND.x, y: HAND.y - 60 }] },
  { id: 'h-cake', emo: 'happy', say: "It's a birthday party!", place: 'playroom', tracks: [stool(), dropIn('birthday-cake', 640, STOOL_TOP - 50, 110, 300, 700)], fx: [{ kind: 'confetti', t: 1100 }] },
  { id: 'h-balloon', emo: 'happy', say: 'A balloon for you!', place: 'park', friend: friendIn(700, 100, 1000), tracks: [em('balloon', 120, [{ t: 0, x: 1180, y: 330, o: 1, s: 1 }, { t: 100 }, { t: 800, x: 640 }, { t: 1100, x: 520, y: 340 }])] },
  { id: 'h-icecream', emo: 'happy', say: 'Ice cream time!', place: 'park', holding: true, tracks: [dropIn('soft-ice-cream', HAND.x, HAND.y - 10, 100, 300, 800)], fx: [{ kind: 'sparkle', t: 1100, x: HAND.x, y: HAND.y - 70 }] },
  { id: 'h-friend', emo: 'happy', say: 'A friend came to play!', place: 'garden', friend: friendIn(560, 200, 0, false), hug: true, tracks: [], fx: [{ kind: 'hearts', t: 1200, x: 480, y: 300 }] },
  { id: 'h-rainbow', emo: 'happy', say: 'Look, a big rainbow!', place: 'park', tracks: [em('cloud', 140, [{ t: 0, x: 760, y: SKY, o: 1, s: 1 }, { t: 300 }, { t: 900, o: 0, x: 900 }]), grow('rainbow', 720, 190, 260, 600, 900, true)] },
  { id: 'h-kite', emo: 'happy', say: 'The kite flies so high!', place: 'beach', holding: true, tracks: [em('kite', 110, [{ t: 0, ...HAND, o: 1, s: 0.8, r: 0 }, { t: 300 }, { t: 1300, x: 760, y: 130, s: 1.1, r: -10 }])] },
  { id: 'h-puppy', emo: 'happy', say: 'A puppy came to say hi!', place: 'garden', tracks: [{ look: { e: 'dog', flip: true }, size: 180, k: [{ t: 0, x: 1180, y: 488, o: 1, s: 1 }, { t: 200 }, { t: 1000, x: 640 }] }], fx: [{ kind: 'hearts', t: 1200, x: 560, y: 360 }] },
  { id: 'h-snow', emo: 'happy', say: "It's snowing!", place: 'snow', tracks: [grow('snowman', 700, 470, 150, 700, 800)], fx: [{ kind: 'snow', t: 100 }] },
  { id: 'h-star', emo: 'happy', say: 'A shiny star fell down!', place: 'forest', night: true, holding: true, tracks: [em('glowing-star', 90, [{ t: 0, x: 820, y: -100, o: 1, s: 1, r: 0 }, { t: 200 }, { t: 1100, ...HAND, r: 360 }])], fx: [{ kind: 'sparkle', t: 1150, x: HAND.x, y: HAND.y - 60 }] },
  { id: 'h-butterfly', emo: 'happy', say: 'A butterfly came to visit!', place: 'garden', tracks: [em('butterfly', 70, [{ t: 0, x: 900, y: 200, o: 1, s: 1, r: 0 }, { t: 200 }, { t: 700, x: 640, y: 260, r: -10 }, { t: 1200, x: 430, y: 290, r: 0 }])] },
  { id: 'h-pizza', emo: 'happy', say: 'Pizza for lunch!', place: 'kitchen', tracks: [stool(), { look: { d: 'plate' }, size: 130, k: [{ t: 0, x: 640, y: STOOL_TOP - 4 }], behind: true }, dropIn('pizza', 640, STOOL_TOP - 40, 100, 300, 700)], fx: [{ kind: 'sparkle', t: 1000, x: 640, y: 360 }] },
  { id: 'h-tower', emo: 'happy', say: 'The tower is all done!', place: 'playroom', tracks: [...stackUp(640), dropIn('star', 640, FLOOR + 20 - 40 - 3 * 78 + 6, 70, 1200, 400)], turn: 1700, fx: [{ kind: 'sparkle', t: 1650, x: 640, y: 230 }] },
  { id: 'h-flower', emo: 'happy', say: 'The flower grew so big!', place: 'garden', tracks: [em('seedling', 90, [{ t: 0, x: 650, y: 510, o: 1, s: 1 }, { t: 500 }, { t: 700, o: 0 }]), grow('sunflower', 650, 440, 200, 500, 900)] },
  { id: 'h-bath', emo: 'happy', say: 'Bubble bath time!', place: 'bathroom', tracks: [em('bathtub', 280, [{ t: 0, x: 690, y: 450, o: 1, s: 1 }], true)], fx: [{ kind: 'bubbles', t: 400, x: 640, y: 380 }] },
]

const SAD: Sit[] = [
  { id: 's-icecream', emo: 'sad', say: 'Oh no, the ice cream fell!', place: 'park', holding: true, tracks: [hold('soft-ice-cream', 120, [{ t: 500 }, { t: 1000, x: 570, y: 520, r: 150 }])], fx: [{ kind: 'splash', t: 1000, x: 560, y: 545 }] },
  { id: 's-balloon', emo: 'sad', say: 'The balloon flew away.', place: 'park', holding: true, tracks: [em('balloon', 120, [{ t: 0, x: 510, y: 330, o: 1, s: 1 }, { t: 400 }, { t: 1800, x: 760, y: -140 }])] },
  { id: 's-cookie', emo: 'sad', say: 'The cookie broke in two.', place: 'kitchen', holding: true, tracks: [{ look: { e: 'cookie', half: 'l' }, size: 96, k: [{ t: 0, ...HAND, o: 1, s: 1, r: 0 }, { t: 500 }, { t: 1000, x: 470, y: 540, r: -40 }] }, { look: { e: 'cookie', half: 'r' }, size: 96, k: [{ t: 0, ...HAND, o: 1, s: 1, r: 0 }, { t: 500 }, { t: 1000, x: 580, y: 540, r: 60 }] }] },
  { id: 's-flower', emo: 'sad', say: 'The flower drooped down.', place: 'garden', tracks: [em('tulip', 130, [{ t: 0, x: 640, y: 480, o: 1, s: 1 }, { t: 500 }, { t: 900, o: 0 }]), em('wilted-flower', 130, [{ t: 0, x: 640, y: 480, o: 0, s: 1 }, { t: 500 }, { t: 900, o: 1 }])] },
  { id: 's-rain', emo: 'sad', say: 'Rain on the picnic.', place: 'park', gray: true, tracks: [{ look: { d: 'blanket' }, size: 260, k: [{ t: 0, x: 620, y: 545 }], behind: true }, em('sandwich', 80, [{ t: 0, x: 600, y: 520, o: 1 }]), em('cloud-with-rain', 160, [{ t: 0, x: 1150, y: SKY, o: 1, s: 1 }, { t: 100 }, { t: 900, x: 560 }])], fx: [{ kind: 'rain', t: 900 }] },
  { id: 's-kite', emo: 'sad', say: 'The kite got stuck.', place: 'park', tracks: [em('deciduous-tree', 280, [{ t: 0, x: 760, y: 360, o: 1, s: 1 }], true), em('kite', 90, [{ t: 0, ...HAND, o: 1, s: 0.8, r: 0 }, { t: 200 }, { t: 1200, x: 740, y: 300, s: 1, r: 30 }])] },
  { id: 's-bye', emo: 'sad', say: 'Time to say bye-bye.', place: 'garden', friend: [{ t: 0, x: 680, o: 1 }, { t: 600 }, { t: 1800, x: 1250 }], tracks: [em('waving-hand', 70, [{ t: 0, x: 700, y: 360, o: 0, s: 1 }, { t: 200, o: 1 }, { t: 600 }, { t: 1800, x: 1270 }])] },
  { id: 's-robot', emo: 'sad', say: 'The robot toy broke.', place: 'playroom', holding: true, tracks: [hold('robot', 96, [{ t: 500 }, { t: 1000, x: 590, y: 530, r: 95 }])], fx: [{ kind: 'burst', t: 1000, x: 590, y: 520 }] },
  { id: 's-milk', emo: 'sad', say: 'The milk spilled.', place: 'kitchen', tracks: [stool(), { look: { d: 'puddle' }, size: 150, k: [{ t: 0, x: 690, y: STOOL_TOP + 4, o: 0, s: 0.3 }, { t: 900 }, { t: 1300, o: 1, s: 1 }], behind: true }, onStool('glass-of-milk', 90, [{ t: 500 }, { t: 900, x: 660, r: 90 }])] },
  { id: 's-teddy', emo: 'sad', say: 'Where did Teddy go?', place: 'bedroom', tracks: [em('teddy-bear', 100, [{ t: 0, x: 650, y: 500, o: 1, s: 1 }, { t: 400 }, { t: 900, o: 0, s: 0.6 }]), grow('red-question-mark', 650, 470, 90, 1000, 400)] },
  { id: 's-snowman', emo: 'sad', say: 'The snowman melted.', place: 'snow', tracks: [em('sun', 120, [{ t: 0, x: 860, y: 260, o: 0, s: 0.6 }, { t: 200 }, { t: 700, y: 110, o: 1, s: 1 }], true), em('snowman', 160, [{ t: 0, x: 680, y: 470, o: 1, s: 1 }, { t: 700 }, { t: 1500, y: 530, s: 0.45, o: 0.85 }]), { look: { d: 'puddle' }, size: 160, k: [{ t: 0, x: 680, y: 552, o: 0, s: 0.4 }, { t: 900 }, { t: 1500, o: 1, s: 1 }], behind: true }] },
  { id: 's-jar', emo: 'sad', say: 'The cookie jar is empty.', place: 'kitchen', holding: true, tracks: [hold('jar', 110, [{ t: 400 }, { t: 600, r: -20 }, { t: 800, r: 20 }, { t: 1000, r: 0 }])] },
  { id: 's-knee', emo: 'sad', say: 'Ouch! A bumpy fall.', place: 'park', tracks: [em('rock', 80, [{ t: 0, x: 560, y: 535, o: 1, s: 1 }], true), grow('adhesive-bandage', 380, 520, 70, 1300, 300)], turn: 900, fx: [{ kind: 'burst', t: 700, x: 420, y: 520 }] },
  { id: 's-crayon', emo: 'sad', say: 'The crayon snapped.', place: 'classroom', holding: true, tracks: [{ look: { e: 'crayon', half: 'l' }, size: 96, k: [{ t: 0, ...HAND, o: 1, s: 1, r: 0 }, { t: 600 }, { t: 900, x: 470, r: -30 }] }, { look: { e: 'crayon', half: 'r' }, size: 96, k: [{ t: 0, ...HAND, o: 1, s: 1, r: 0 }, { t: 600 }, { t: 900, x: 560, y: 530, r: 70 }] }] },
  { id: 's-castle', emo: 'sad', say: 'The wave took the sandcastle.', place: 'beach', tracks: [{ look: { d: 'castle' }, size: 150, k: [{ t: 0, x: 660, y: 490, o: 1 }, { t: 900 }, { t: 1200, o: 0 }] }, { look: { d: 'flat-castle' }, size: 150, k: [{ t: 0, x: 660, y: 520, o: 0 }, { t: 900 }, { t: 1200, o: 1 }] }, { look: { d: 'wave' }, size: 300, k: [{ t: 0, x: 1250, y: 500, o: 1 }, { t: 200 }, { t: 1100, x: 680 }, { t: 1700, x: 1250 }] }] },
]

const ANGRY: Sit[] = [
  { id: 'a-tower', emo: 'angry', say: 'Someone knocked the tower down!', place: 'playroom', friend: [{ t: 0, x: 1200, o: 1 }, { t: 200 }, { t: 800, x: 760 }, { t: 1100 }, { t: 1700, x: 1250 }], tracks: tower(630, 800) },
  { id: 'a-ball', emo: 'angry', say: 'Hey! That was my ball!', place: 'park', holding: true, friend: friendIn(620, 200, 400), tracks: [taken('soccer-ball', 90, 200)] },
  { id: 'a-scribble', emo: 'angry', say: 'Someone scribbled on the picture!', place: 'classroom', friend: [{ t: 0, x: 1200, o: 1 }, { t: 200 }, { t: 800, x: 790 }, { t: 1300 }, { t: 1900, x: 1250 }], tracks: [stool(), { look: { d: 'picture' }, size: 140, k: [{ t: 0, x: 640, y: STOOL_TOP - 50 }] }, { look: { d: 'scribble' }, size: 130, k: [{ t: 0, x: 640, y: STOOL_TOP - 50, o: 0, s: 0.4 }, { t: 900 }, { t: 1300, o: 1, s: 1 }] }] },
  { id: 'a-cookie', emo: 'angry', say: 'Someone took the last cookie!', place: 'kitchen', friend: [{ t: 0, x: 1200, o: 1 }, { t: 200 }, { t: 800, x: 760 }, { t: 1100 }, { t: 1700, x: 1250 }], tracks: [stool(), { look: { d: 'plate' }, size: 130, k: [{ t: 0, x: 640, y: STOOL_TOP - 4 }], behind: true }, onStool('cookie', 80, [{ t: 800 }, { t: 1000, x: 720, y: 400 }, { t: 1100 }, { t: 1700, x: 1210 }])] },
  { id: 'a-mud', emo: 'angry', say: 'Splash! Mud everywhere!', place: 'park', gray: true, friend: [{ t: 0, x: 1200, o: 1 }, { t: 100 }, { t: 700, x: 680 }, { t: 1100 }, { t: 1700, x: 1250 }], tracks: [{ look: { d: 'puddle' }, size: 220, k: [{ t: 0, x: 620, y: 556 }], behind: true }, { look: { d: 'mud' }, size: 120, k: [{ t: 0, x: 410, y: 470, o: 0, s: 0.3 }, { t: 750 }, { t: 1000, o: 1, s: 1 }] }], fx: [{ kind: 'splash', t: 700, x: 620, y: 540 }] },
  { id: 'a-lid', emo: 'angry', say: "The lid won't come off!", place: 'kitchen', holding: true, tracks: [hold('jar', 110, [{ t: 300 }, { t: 450, r: -14 }, { t: 600, r: 14 }, { t: 750, r: -14 }, { t: 900, r: 14 }, { t: 1050, r: 0 }])] },
  { id: 'a-zipper', emo: 'angry', say: 'The zipper is stuck!', place: 'bedroom', holding: true, tracks: [hold('coat', 120, [{ t: 300 }, { t: 450, y: HAND.y - 14 }, { t: 600, y: HAND.y }, { t: 750, y: HAND.y - 14 }, { t: 900, y: HAND.y }])] },
  { id: 'a-kite', emo: 'angry', say: 'Hey! Give back the kite!', place: 'beach', holding: true, friend: friendIn(620, 200, 400), tracks: [taken('kite', 100, 200)] },
  { id: 'a-kick', emo: 'angry', say: 'Someone kicked the ball away!', place: 'park', friend: [{ t: 0, x: 1200, o: 1 }, { t: 100 }, { t: 700, x: 720 }, { t: 1200 }, { t: 1700, x: 1250 }], tracks: [em('soccer-ball', 80, [{ t: 0, x: 600, y: 520, o: 1, s: 1, r: 0 }, { t: 800 }, { t: 1500, x: -150, y: 200, r: -540 }])] },
  { id: 'a-puzzle', emo: 'angry', say: 'Someone took the puzzle piece!', place: 'living', holding: true, friend: friendIn(620, 200, 400), tracks: [taken('puzzle-piece', 86, 200)] },
  { id: 'a-car', emo: 'angry', say: "Hey! That's my race car!", place: 'playroom', holding: true, friend: friendIn(620, 200, 400), tracks: [taken('racing-car', 100, 200)] },
  { id: 'a-pizza', emo: 'angry', say: 'Someone ate all the pizza!', place: 'kitchen', friend: [{ t: 0, x: 1200, o: 1 }, { t: 100 }, { t: 700, x: 780 }, { t: 1400 }, { t: 1900, x: 1250 }], tracks: [stool(), { look: { d: 'plate' }, size: 130, k: [{ t: 0, x: 640, y: STOOL_TOP - 4 }], behind: true }, onStool('pizza', 100, [{ t: 800 }, { t: 1300, s: 0.1, o: 0 }])] },
  { id: 'a-again', emo: 'angry', say: 'The blocks fell down again!', place: 'living', tracks: tower(630, 500, ['#5DAE76', '#CFA0C9', '#F2C94C']), turn: 1300 },
  { id: 'a-stomp', emo: 'angry', say: 'Someone stepped on the sandcastle!', place: 'beach', friend: [{ t: 0, x: 1200, o: 1 }, { t: 100 }, { t: 900, x: 660 }, { t: 1200 }, { t: 1800, x: 1250 }], tracks: [{ look: { d: 'castle' }, size: 150, k: [{ t: 0, x: 660, y: 490, o: 1 }, { t: 800 }, { t: 1000, o: 0 }] }, { look: { d: 'flat-castle' }, size: 150, k: [{ t: 0, x: 660, y: 520, o: 0 }, { t: 800 }, { t: 1000, o: 1 }] }] },
  { id: 'a-teddy', emo: 'angry', say: 'Hey! Give Teddy back!', place: 'bedroom', holding: true, friend: friendIn(620, 200, 400), tracks: [taken('teddy-bear', 100, 200)] },
]

const SCARED: Sit[] = [
  { id: 'c-thunder', emo: 'scared', say: 'Boom! Loud thunder!', place: 'park', gray: true, tracks: [em('cloud-with-lightning', 170, [{ t: 0, x: 1150, y: SKY, o: 1, s: 1 }, { t: 100 }, { t: 800, x: 700 }])], fx: [{ kind: 'flash', t: 900 }], turn: 1000 },
  { id: 'c-dog', emo: 'scared', say: 'Woof! A big barking dog!', place: 'garden', tracks: [{ look: { e: 'dog', flip: true }, size: 200, k: [{ t: 0, x: 1180, y: 470, o: 1, s: 1 }, { t: 100 }, { t: 700, x: 760 }, { t: 900, s: 1.45, y: 420 }] }, grow('speech-balloon', 860, 230, 120, 900, 250)], turn: 1000 },
  { id: 'c-spider', emo: 'scared', say: 'A spider came down!', place: 'bedroom', tracks: [{ look: { d: 'thread' }, size: 400, k: [{ t: 0, x: 560, y: -300, o: 1 }, { t: 200 }, { t: 1100, y: 80 }] }, em('spider', 90, [{ t: 0, x: 560, y: -100, o: 1, s: 1 }, { t: 200 }, { t: 1100, y: 280 }])] },
  { id: 'c-dark', emo: 'scared', say: 'The lights went out!', place: 'living', tracks: [], fx: [{ kind: 'dark', t: 600 }], turn: 900 },
  { id: 'c-siren', emo: 'scared', say: 'Nee-naw! A loud fire truck!', place: 'street', tracks: [pass('fire-engine', 520, 200, 200, 1300, true)], turn: 900 },
  { id: 'c-boo', emo: 'scared', say: 'Boo! Something jumped out!', place: 'bedroom', tracks: [em('package', 130, [{ t: 0, x: 680, y: 495, o: 1, s: 1 }], true), em('ghost', 120, [{ t: 0, x: 680, y: 490, o: 0, s: 0.4 }, { t: 600 }, { t: 900, y: 330, o: 1, s: 1 }])], turn: 950 },
  { id: 'c-snake', emo: 'scared', say: 'A snake slid by!', place: 'forest', tracks: [{ look: { e: 'snake', flip: true }, size: 130, k: [{ t: 0, x: 1180, y: 510, o: 1, s: 1 }, { t: 100 }, { t: 1100, x: 600 }] }] },
  { id: 'c-pop', emo: 'scared', say: 'Pop! A very loud bang!', place: 'playroom', tracks: [em('balloon', 130, [{ t: 0, x: 680, y: 330, o: 1, s: 1 }, { t: 700 }, { t: 820, s: 1.25, o: 0 }])], fx: [{ kind: 'burst', t: 820, x: 680, y: 300 }], turn: 900 },
  { id: 'c-wave', emo: 'scared', say: 'A big wave is coming!', place: 'beach', tracks: [{ look: { d: 'wave' }, size: 300, k: [{ t: 0, x: 1100, y: 480, o: 1, s: 0.6 }, { t: 200 }, { t: 1200, x: 820, s: 1.3, y: 420 }] }] },
  { id: 'c-owl', emo: 'scared', say: 'Hoo! A noise in the dark!', place: 'forest', night: true, tracks: [grow('owl', 820, 260, 100, 500, 500)], turn: 1100 },
  { id: 'c-bee', emo: 'scared', say: 'Bzz! A bee is buzzing close!', place: 'garden', tracks: [em('honeybee', 70, [{ t: 0, x: 1100, y: 250, o: 1, s: 1 }, { t: 100 }, { t: 500, x: 760, y: 330 }, { t: 800, x: 620, y: 250 }, { t: 1100, x: 520, y: 340 }, { t: 1400, x: 480, y: 280 }])] },
  { id: 'c-croc', emo: 'scared', say: 'A crocodile in the water!', place: 'lake', tracks: [{ look: { e: 'crocodile', flip: true }, size: 170, k: [{ t: 0, x: 780, y: 470, o: 0, s: 0.8 }, { t: 300 }, { t: 1000, o: 1, s: 1, y: 430 }] }] },
  { id: 'c-wolf', emo: 'scared', say: 'Awoo! A wolf is howling!', place: 'forest', night: true, tracks: [grow('crescent-moon', 820, 110, 100, 0, 400, true), grow('wolf', 820, 330, 150, 400, 700)], turn: 1200 },
  { id: 'c-fireworks', emo: 'scared', say: 'Bang! Loud fireworks!', place: 'park', night: true, tracks: [{ look: { d: 'firework', c: '#F2C94C' }, size: 220, k: [{ t: 0, x: 740, y: 190, s: 0.2, o: 0 }, { t: 500 }, { t: 800, s: 1, o: 1 }], behind: true }, { look: { d: 'firework', c: '#F2A9A0' }, size: 160, k: [{ t: 0, x: 900, y: 290, s: 0.2, o: 0 }, { t: 700 }, { t: 1000, s: 1, o: 1 }], behind: true }], fx: [{ kind: 'burst', t: 600, x: 740, y: 190 }], turn: 900 },
  { id: 'c-crash', emo: 'scared', say: 'Crash! A loud noise!', place: 'classroom', tracks: [em('books', 150, [{ t: 0, x: 700, y: 250, o: 1, s: 1, r: 0 }, { t: 500 }, { t: 900, y: 500, r: 80, x: 740 }])], fx: [{ kind: 'burst', t: 900, x: 740, y: 520 }], turn: 1000 },
]

export const SITUATIONS: Sit[] = [...HAPPY, ...SAD, ...ANGRY, ...SCARED]

// ── 驚訝（T-164，只在「為什麼」那一層用）：9 個。旁白不說 wow、surprise，讓孩子自己看發生什麼事 ──
const SURPRISED: Sit[] = [
  { id: 'w-hat', emo: 'surprised', say: 'A bunny in the hat!', place: 'living', tracks: [stool(), em('rabbit-face', 80, [{ t: 0, x: 640, y: STOOL_TOP - 40, o: 0, s: 0.3 }, { t: 700 }, { t: 1100, y: STOOL_TOP - 110, o: 1, s: 1 }], true), onStool('top-hat', 96)], fx: [{ kind: 'sparkle', t: 1000, x: 640, y: 300 }], turn: 1200 },
  { id: 'w-whale', emo: 'surprised', say: 'A whale jumped up!', place: 'beach', tracks: [em('spouting-whale', 200, [{ t: 0, x: 800, y: 620, o: 1, s: 0.8, r: 0 }, { t: 400 }, { t: 1000, y: 330, s: 1, r: -10 }])], fx: [{ kind: 'splash', t: 1000, x: 800, y: 470 }], turn: 1100 },
  { id: 'w-melon', emo: 'surprised', say: 'A giant watermelon!', place: 'garden', tracks: [grow('watermelon', 680, 430, 260, 300, 900)], turn: 1300 },
  { id: 'w-star', emo: 'surprised', say: 'A shooting star zoomed by!', place: 'forest', night: true, tracks: [em('shooting-star', 130, [{ t: 0, x: 1150, y: 60, o: 1, s: 1, r: 0 }, { t: 200 }, { t: 1200, x: 520, y: 220 }])], fx: [{ kind: 'sparkle', t: 1200, x: 560, y: 200 }], turn: 1300 },
  { id: 'w-pop', emo: 'surprised', say: 'Pop! The popcorn jumped!', place: 'kitchen', tracks: [stool(), onStool('popcorn', 90, [{ t: 600 }, { t: 900, y: STOOL_TOP - 160, s: 1.3 }, { t: 1200, y: STOOL_TOP - 37 }])], fx: [{ kind: 'burst', t: 650, x: 640, y: 360 }], turn: 900 },
  { id: 'w-dino', emo: 'surprised', say: 'A dinosaur egg cracked open!', place: 'forest', tracks: [em('egg', 110, [{ t: 0, x: 680, y: 500, o: 1, s: 1 }, { t: 500 }, { t: 700, o: 0 }]), grow('sauropod', 680, 450, 180, 600, 600)], fx: [{ kind: 'burst', t: 600, x: 680, y: 480 }], turn: 1000 },
  { id: 'w-bubble', emo: 'surprised', say: 'A giant bubble!', place: 'park', tracks: [grow('bubbles', 680, 300, 260, 300, 1100)], turn: 1300 },
  { id: 'w-frog', emo: 'surprised', say: 'A frog jumped on the cake!', place: 'kitchen', tracks: [stool(), onStool('birthday-cake', 110), em('frog', 80, [{ t: 0, x: 1150, y: 500, o: 1, s: 1 }, { t: 200 }, { t: 700, x: 900, y: 250 }, { t: 1100, x: 640, y: STOOL_TOP - 130 }])], turn: 1200 },
  { id: 'w-party', emo: 'surprised', say: 'A party! Everyone jumped out!', place: 'living', friend: [{ t: 0, x: 1200, o: 1 }, { t: 100 }, { t: 600, x: 700 }], tracks: [dropIn('balloon', 820, 220, 110, 500, 500)], fx: [{ kind: 'confetti', t: 700 }], turn: 800 },
]

/** 看臉選情境的小圖停在哪一刻：預設是主角換心情的時候；這幾個那時候東西已經飛走、朋友已經走出畫面，往前一點 */
const SNAP: Record<string, number> = { 's-balloon': 900, 's-bye': 800, 'a-scribble': 1200, 'a-cookie': 1050, 'a-mud': 1000, 'a-kick': 1100, 'a-pizza': 1300, 'a-stomp': 1150, 'a-tower': 1050, 'w-dino': 1300 }
for (const s of [...SITUATIONS, ...SURPRISED]) if (SNAP[s.id] != null) s.snap = SNAP[s.id]

/** 「為什麼」那一層用的情境：原本 60 個加上驚訝 9 個 */
export const WHY_SITS: Sit[] = [...SITUATIONS, ...SURPRISED]
export const sitOf = (id: string) => WHY_SITS.find((s) => s.id === id) ?? null

/** 這一段動畫多長（最後一個時間點） */
export const sitLength = (s: Sit) => Math.max(s.turn ?? TURN, ...s.tracks.flatMap((t) => t.k.map((k) => k.t)), ...(s.friend ?? []).map((k) => k.t), ...(s.fx ?? []).map((f) => f.t + 600))

/** 所有用得到的 emoji（scripts/build-play-emoji.ts） */
/** 效果（./scene.tsx 的 FxView）用的 emoji */
export const FX_EMOJI = ['red-heart', 'sparkles', 'collision', 'musical-note']
export const FEEL_EMOJI = [...new Set([...FX_EMOJI, ...SITUATIONS.flatMap((s) => s.tracks.map((t) => ('e' in t.look ? t.look.e : null)).filter((e): e is string => !!e))])]
/** 驚訝的情境用到、上面那一套沒有的 emoji（T-164，放在 ../lang-emoji.generated.ts，不動 ../play-emoji.generated.ts） */
export const WHY_EMOJI = [...new Set(SURPRISED.flatMap((s) => s.tracks.map((t) => ('e' in t.look ? t.look.e : null)).filter((e): e is string => !!e)))]
