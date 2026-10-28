export interface LetterEntry {
  letter: string
  word: string
  icon: string
}

/**
 * 舊版字母森林（字母名稱＋一個代表字）的資料。
 * 自然發音上線後遊戲改用下面的 PHONICS；這份還留著，因為：
 * - 描字母（GlyphGame）唸「This is | B.」、教學卡的台詞（lines.ts 的 teach.letter.*）會用到；
 * - 家長區的舊紀錄（letter:X、word:X）要能對回字母。
 */
export const LETTERS: LetterEntry[] = [
  { letter: 'A', word: 'apple', icon: 'red-apple' },
  { letter: 'B', word: 'bus', icon: 'bus' },
  { letter: 'C', word: 'car', icon: 'automobile' },
  { letter: 'D', word: 'dinosaur', icon: 'sauropod' },
  { letter: 'E', word: 'elephant', icon: 'elephant' },
  { letter: 'F', word: 'fish', icon: 'fish' },
  { letter: 'G', word: 'giraffe', icon: 'giraffe' },
  { letter: 'H', word: 'horse', icon: 'horse' },
  { letter: 'I', word: 'ice cream', icon: 'soft-ice-cream' },
  { letter: 'J', word: 'jellyfish', icon: 'jellyfish' },
  { letter: 'K', word: 'kangaroo', icon: 'kangaroo' },
  { letter: 'L', word: 'lion', icon: 'lion' },
  { letter: 'M', word: 'monkey', icon: 'monkey' },
  { letter: 'N', word: 'nest', icon: 'nest-with-eggs' },
  { letter: 'O', word: 'octopus', icon: 'octopus' },
  { letter: 'P', word: 'pig', icon: 'pig-face' },
  { letter: 'Q', word: 'queen', icon: 'crown' },
  { letter: 'R', word: 'rabbit', icon: 'rabbit-face' },
  { letter: 'S', word: 'sun', icon: 'sun-with-face' },
  { letter: 'T', word: 'T-rex', icon: 't-rex' },
  { letter: 'U', word: 'umbrella', icon: 'umbrella' },
  { letter: 'V', word: 'volcano', icon: 'volcano' },
  { letter: 'W', word: 'whale', icon: 'spouting-whale' },
  { letter: 'X', word: 'x-ray', icon: 'x-ray' },
  { letter: 'Y', word: 'yo-yo', icon: 'yo-yo' },
  { letter: 'Z', word: 'zebra', icon: 'zebra' },
]

/** 舊版：字母依序分組解鎖（src/lib/adaptive.ts 的 unlockedLetters 還在用） */
export const LETTER_GROUPS = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWXYZ']

/** 外型相近的字母，高難度時拿來當干擾選項 */
export const LOOKALIKE: Record<string, string> = {
  E: 'FB',
  F: 'EP',
  M: 'NW',
  N: 'MH',
  O: 'QC',
  Q: 'OG',
  P: 'RB',
  R: 'PB',
  C: 'GO',
  G: 'CO',
  U: 'VJ',
  V: 'UY',
  W: 'MV',
  B: 'PR',
  I: 'LT',
  L: 'IT',
  T: 'IL',
  K: 'XY',
  X: 'KY',
  Y: 'VX',
}

export const letterEntry = (l: string) => LETTERS.find((e) => e.letter === l)!

// ══ 自然發音：從單字認識字母（PRD §6.1b）══════════════════════════════
//
// 【教學順序】m s a t b f n d c r p e l h g w k
// （2026-10-28 單字盤點後 o、j、v、y 延後，見 DEFERRED_PHONICS；原本是 m s a t b f n o d c r p e l h g w j v y k）
//
// 依據的原則（不照 A 到 Z）：
// 1. 連續音先教：m、s 可以一直拉長（mmm、sss），最容易從單字裡「聽出來」；
//    m 也是幼兒最早會發的音之一。停頓音（b、t、d…）只能短短地出現，比較難單獨聽出。
// 2. 常用音先教：s、a、t、p、n 在英文單字裡最常見，Jolly Phonics 第一組就是 s a t i p n，
//    Letterland 也從 s a t p i n 開始；Carnine 的順序（a m t s i f d r o g…）同樣把常用、
//    能拼出最多字的音放前面。
// 3. 容易混淆的分開：
//    - 外型：b／d／p 互相旋轉或鏡像，b 第 5、d 第 9、p 第 12；m／n、m／w 也拉開。
//    - 聲音：只差有沒有聲帶振動的成對音分開——b／p、t／d、f／v、k／g；
//      母音 a（/æ/）、e（/ɛ/）、o（/ɑ/）彼此聽起來接近，也錯開。
//    - c 和 k 是同一個音 /k/：c 先教（car、cat、cow 都是 Sam 熟的字），k 放最後。
// 4. Sam 的程度與興趣：Sam 已經認得 A、B，所以 a、b 排在前五個，讓他很快有「我會」的感覺；
//    恐龍（dinosaur、T-rex）、車子（bus、taxi、fire truck、car）、動物放在關鍵字裡。
// 5. 要有三個「一看就知道是什麼」的圖：圖示庫（Fluent Emoji）找不到三個清楚的字的音先不教——
//    i、u（短母音開頭又畫得出來的字太少）、z（只有 zebra、zero）、x（只出現在字尾）、q（要跟 u 一起教 qu）。
//    之後要教時再補圖。
//
// 參考：
// - Jolly Phonics 的 7 組順序（s a t i p n / c k e h r m d / g o u l f b …）：
//   https://www.greatstaughton.cambs.sch.uk/jolly-phonics/
// - Letterland 從 s a t p i n 開始、先教字母音再教名稱：https://letterland.com/at-school/phonics
//   https://letterland.com/blogs/news/learning-alphabet-sounds-and-shapes-with-letterland
// - Carnine, Silbert & Kameenui《Direct Instruction Reading》的順序，刻意把外型、聲音相近的字母分開：
//   https://petaa.edu.au/litportal/Resources-for-Curriculum/Lower-primary/Phonics-Spelling/Phonics/Carnine-order.aspx
// - Keys to Literacy《Guidelines for Effective Phonics Instruction》：先教常用的音；聽覺、視覺相近的
//   （b／p、m／n）分開時間教；用好記的圖、取圖的第一個音對應字母；I do → We do → You do：
//   https://keystoliteracy.com/wp-content/uploads/2019/10/Guidelines-for-Effective-Phonics-Instruction.pdf
// - 注意：沒有研究證明哪一種順序最好（https://www.readingrockets.org/blogs/shanahan-on-literacy/why-instructional-sequence-doesnt-always-matter），
//   所以順序以上面的原則為主，實際玩了之後可以依紀錄調整。
//
// 【語音】TTS 單獨唸音素常常不準，以下寫法都用 edge-tts（en-US-AnaNeural）實測過，
// 試聽檔在 docs/voice-samples/phonics/。結論：
// - 單獨的字母（"b"）、斜線（"/b/"）、"b… b… bus"、"s-s-sun"、"sss"、"fff" 都會被唸成字母名稱（bee、ess、eff），不能用。
// - SSML 的 <phoneme> 標籤：edge-tts 會把文字跳脫，標籤被直接唸出來，不能用；IPA 字元（bʌ、æ）也唸不對。
// - 停頓音加短母音（buh、tuh、duh、puh、kuh）唸得清楚，採用。
//   教學指引提醒老師不要在 /b/ 後面多加「uh」，但停頓音本來就沒辦法不帶母音單獨唸，TTS 也做不到更短的版本；
//   所以這個音一定和真的單字一起出現（buh, buh, bus），讓孩子聽到單字裡真正的開頭。
//   "guh"、"cuh" 會被拼成字母，所以 g 改用單字開頭，c 寫成 kuh。
// - m 可以單獨拉長："Mmmmm" 是乾淨的哼聲，採用。
// - s、f、n、l、r、v、z 單獨拉長會被拼成 ess ess…，但「拉長開頭的單字」唸得對：
//   Ssssnake、Ffffrog、Nnnnest、Llllion、Rrrrabbit、Vvvvan、Zzzzebra——用這個當「這個音」。
//   （注意字母數要剛好：Sssssun、Fffffish 這種會在中間多出一個母音，所以只用實測過的字。）
// - 母音：eh（/ɛ/）、ah（美式 o 的 /ɑ/）唸得對；a 的 /æ/ 唸不出來（aah、æ 都變成別的音），改用單字 apple。

/** 一個關鍵字：圖示＋英文字 */
export interface PhonicsWord {
  w: string
  icon: string
  /** 這張圖孩子可能叫成別的名字，那個名字的開頭字母（van 的圖像 bus → b）。避免當成會混淆的干擾選項 */
  alt?: string
}

/**
 * 「這個音」要怎麼唸：
 * - sound：TTS 能正確單獨唸出的音，例如 buh、Mmmmm、eh。
 * - stretch：拉長開頭的單字，例如 Ssssnake（word 是被拉長的那個字）。
 * - word：連拉長都不行，只用單字開頭呈現，例如 apple、goat。
 */
export type Cue = { kind: 'sound'; say: string; repeat: 1 | 2 } | { kind: 'stretch'; say: string; word: string } | { kind: 'word'; word: string }

export interface SoundUnit {
  /** 小寫字母，也是技能代碼 phonics:<letter> 的值 */
  letter: string
  /** 實際的音（給家長看，也用來判斷兩個字母是不是同一個音，例如 c、k 都是 k） */
  phoneme: string
  ipa: string
  cue: Cue
  /** 三個關鍵字：學習循環一開始的三個字 */
  keys: [PhonicsWord, PhonicsWord, PhonicsWord]
  /** 複習用的新字：熟了之後用沒看過的字確認是真的懂了這個音，而不是記住某一張圖 */
  review: PhonicsWord[]
}

const W = (w: string, icon: string, alt?: string): PhonicsWord => (alt ? { w, icon, alt } : { w, icon })
const sound = (say: string, repeat: 1 | 2 = 2): Cue => ({ kind: 'sound', say, repeat })
const stretch = (say: string, word: string): Cue => ({ kind: 'stretch', say, word })

// 2026-10-28 單字盤點（docs/單字盤點.md 第 3 章）之後的版本：
// - 換掉陌生、圖不好認、和別的名字打架的字（notebook → noodles、envelope → elevator、goat／guitar → gift／grapes…）；
// - 複習字只留第 1、2 層、畫得出來的字；a 沒有好的複習字，複習時重複三個關鍵字；
// - 找不到三個好例字的音（o、j、v、y）延後，放在下面的 DEFERRED_PHONICS，不出現在字母森林。
// 複習字第一次當答案之前，一定先用單字卡教過（games/phonics/PhonicsGame.tsx），不再「刻意用沒看過的字考」。
export const PHONICS: SoundUnit[] = [
  { letter: 'm', phoneme: 'm', ipa: '/m/', cue: sound('Mmmmm', 1), keys: [W('moon', 'crescent-moon'), W('mouse', 'mouse-face'), W('monkey', 'monkey-face')], review: [W('mushroom', 'mushroom'), W('mango', 'mango'), W('milk', 'glass-of-milk')] },
  { letter: 's', phoneme: 's', ipa: '/s/', cue: stretch('Ssssnake', 'snake'), keys: [W('sun', 'sun-with-face'), W('snake', 'snake'), W('socks', 'socks')], review: [W('soap', 'soap'), W('sandwich', 'sandwich'), W('snail', 'snail')] },
  { letter: 'a', phoneme: 'æ', ipa: '/æ/', cue: { kind: 'word', word: 'apple' }, keys: [W('apple', 'red-apple'), W('ant', 'ant'), W('ambulance', 'ambulance')], review: [] },
  { letter: 't', phoneme: 't', ipa: '/t/', cue: sound('tuh'), keys: [W('tiger', 'tiger-face'), W('turtle', 'turtle'), W('taxi', 'taxi')], review: [W('T-rex', 't-rex', 'd'), W('tomato', 'tomato'), W('toothbrush', 'toothbrush'), W('teddy bear', 'teddy-bear', 'b')] },
  { letter: 'b', phoneme: 'b', ipa: '/b/', cue: sound('buh'), keys: [W('bus', 'bus'), W('ball', 'soccer-ball'), W('bear', 'bear')], review: [W('banana', 'banana'), W('balloon', 'balloon'), W('butterfly', 'butterfly'), W('bike', 'bicycle')] },
  { letter: 'f', phoneme: 'f', ipa: '/f/', cue: stretch('Ffffrog', 'frog'), keys: [W('fish', 'fish'), W('fox', 'fox'), W('frog', 'frog')], review: [W('fire truck', 'fire-engine', 'c'), W('foot', 'foot', 'l'), W('flower', 'sunflower', 's')] },
  { letter: 'n', phoneme: 'n', ipa: '/n/', cue: stretch('Nnnnest', 'nest'), keys: [W('nest', 'nest-with-eggs'), W('nose', 'nose'), W('noodles', 'steaming-bowl')], review: [] },
  { letter: 'd', phoneme: 'd', ipa: '/d/', cue: sound('duh'), keys: [W('dinosaur', 'sauropod'), W('dog', 'dog-face'), W('duck', 'duck')], review: [W('deer', 'deer'), W('dolphin', 'dolphin')] },
  { letter: 'c', phoneme: 'k', ipa: '/k/', cue: sound('kuh'), keys: [W('car', 'automobile'), W('cat', 'cat-face'), W('cow', 'cow-face')], review: [W('cookie', 'cookie'), W('carrot', 'carrot'), W('cake', 'birthday-cake', 'b'), W('cupcake', 'cupcake', 'c')] },
  { letter: 'r', phoneme: 'r', ipa: '/r/', cue: stretch('Rrrrabbit', 'rabbit'), keys: [W('rabbit', 'rabbit-face'), W('rocket', 'rocket'), W('rainbow', 'rainbow')], review: [W('robot', 'robot'), W('rice', 'cooked-rice')] },
  { letter: 'p', phoneme: 'p', ipa: '/p/', cue: sound('puh'), keys: [W('pig', 'pig-face'), W('panda', 'panda'), W('penguin', 'penguin')], review: [W('pizza', 'pizza'), W('pear', 'pear'), W('popcorn', 'popcorn'), W('police car', 'police-car', 'c')] },
  { letter: 'e', phoneme: 'ɛ', ipa: '/ɛ/', cue: sound('eh'), keys: [W('egg', 'egg'), W('elephant', 'elephant'), W('elevator', 'elevator')], review: [] },
  { letter: 'l', phoneme: 'l', ipa: '/l/', cue: stretch('Llllion', 'lion'), keys: [W('lion', 'lion'), W('lemon', 'lemon'), W('lollipop', 'lollipop')], review: [W('leaf', 'leaf-fluttering-in-wind'), W('ladybug', 'lady-beetle', 'b'), W('leg', 'leg', 'f'), W('ladder', 'ladder')] },
  { letter: 'h', phoneme: 'h', ipa: '/h/', cue: sound('huh'), keys: [W('horse', 'horse'), W('helicopter', 'helicopter'), W('hippo', 'hippopotamus')], review: [W('hand', 'raised-hand'), W('hamburger', 'hamburger'), W('house', 'house'), W('hot dog', 'hot-dog')] },
  { letter: 'g', phoneme: 'g', ipa: '/g/', cue: { kind: 'word', word: 'gift' }, keys: [W('gift', 'wrapped-gift', 'p'), W('gorilla', 'gorilla', 'm'), W('grapes', 'grapes')], review: [] },
  { letter: 'w', phoneme: 'w', ipa: '/w/', cue: sound('wuh'), keys: [W('whale', 'spouting-whale'), W('watermelon', 'watermelon'), W('worm', 'worm')], review: [W('wolf', 'wolf', 'd'), W('window', 'window'), W('wheel', 'wheel', 't')] },
  { letter: 'k', phoneme: 'k', ipa: '/k/', cue: sound('kuh'), keys: [W('kangaroo', 'kangaroo'), W('koala', 'koala'), W('kite', 'kite')], review: [W('key', 'key'), W('kiwi', 'kiwi-fruit')] },
]

/**
 * 延後的音（2026-10-28 單字盤點）：找不到三個第 1、2 層、一看就知道是什麼的圖，先不教。
 * 資料原樣留著：孩子之前學過的熟練度（phonics:o…）、得過的貼紙還對得到字母；字母森林的教學順序、出題都不會用到。
 * i、u、z、x、q 本來就沒教（理由見上面的【教學順序】第 5 點）。
 */
export const DEFERRED_PHONICS: SoundUnit[] = [
  { letter: 'o', phoneme: 'ɑ', ipa: '/ɑ/', cue: sound('ah'), keys: [W('octopus', 'octopus'), W('otter', 'otter', 'b'), W('ox', 'ox', 'cb')], review: [] },
  { letter: 'j', phoneme: 'dʒ', ipa: '/dʒ/', cue: sound('juh'), keys: [W('jellyfish', 'jellyfish'), W('jeans', 'jeans'), W('jar', 'jar', 'b')], review: [] },
  { letter: 'v', phoneme: 'v', ipa: '/v/', cue: stretch('Vvvvan', 'van'), keys: [W('volcano', 'volcano'), W('van', 'minibus', 'b'), W('violin', 'violin')], review: [] },
  { letter: 'y', phoneme: 'j', ipa: '/j/', cue: sound('yuh'), keys: [W('yo-yo', 'yo-yo'), W('yarn', 'yarn'), W('yawn', 'yawning-face', 's')], review: [] },
]

/** 教的、延後的音都找得到（家長區、貼紙本、出門任務卡讀舊紀錄用）；出題只用 PHONICS */
export const ALL_PHONICS: SoundUnit[] = [...PHONICS, ...DEFERRED_PHONICS]

/**
 * 這次才換上的關鍵字：舊紀錄裡「這個音學過」不代表孩子看過這幾個字（當時是 notebook、envelope、goat、guitar），
 * 從熟練度推算「教過哪些字」時不算進去（lib/words.ts），第一次出現時先教。
 */
export const NEW_KEY_WORDS = new Set(['noodles', 'elevator', 'gift', 'grapes'])

export const soundUnit = (l: string) => ALL_PHONICS.find((u) => u.letter === l)!

/** 技能代碼。注意不能用 sound:，那個前綴已經是動物村「聽聲音猜猜看」在用（sound:dog） */
export const phonicsSkill = (l: string) => `phonics:${l}`

export const upper = (l: string) => l.toUpperCase()
/** 大小寫一起出現：B b */
export const pairOf = (l: string) => `${upper(l)} ${l}`

export const wordsOf = (u: SoundUnit) => [...u.keys, ...u.review]

/** 字的 id：台詞 key、選項 id 用（fire truck → fire-truck） */
export const wordId = (w: string) => w.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/** 全部的字（去重），找干擾選項、產生台詞用 */
export const PHONICS_WORDS: (PhonicsWord & { unit: SoundUnit })[] = PHONICS.flatMap((u) => wordsOf(u).map((x) => ({ ...x, unit: u })))

/** 「這個音」被拉長或當作代表的那個字（沒有就是 null） */
export const cueWord = (u: SoundUnit) => (u.cue.kind === 'sound' ? null : u.cue.word)

/** 唸「這個音」的文字：buh、Mmmmm、Ssssnake、apple */
export const cueText = (u: SoundUnit) => (u.cue.kind === 'word' ? u.cue.word : u.cue.say)

/**
 * 聽起來容易混淆的音：最高難度時拿來當干擾選項（PRD §5.5「干擾項更相近」）。
 * 只差聲帶振動的成對音、同部位的鼻音、相近的母音。
 */
export const CONFUSE: Record<string, string> = {
  b: 'pd',
  p: 'bt',
  d: 'tb',
  t: 'dp',
  c: 'gt',
  k: 'gt',
  g: 'cd',
  m: 'n',
  n: 'm',
  f: 'vs',
  v: 'fb',
  s: 'f',
  a: 'eo',
  e: 'a',
  o: 'a',
  l: 'r',
  r: 'lw',
  w: 'r',
  h: 'f',
  j: 'd',
  y: 'l',
}

/** 外型相近的字母（小寫）：聽音找字母的最高難度用 */
export const LOOKALIKE_LOWER: Record<string, string> = {
  b: 'dp',
  d: 'bp',
  p: 'bd',
  m: 'nw',
  n: 'mh',
  w: 'mv',
  v: 'wy',
  h: 'n',
  c: 'eo',
  e: 'c',
  o: 'c',
  a: 'o',
  l: 't',
  t: 'l',
  f: 't',
  j: 'y',
  y: 'jv',
  g: 'j',
  k: 'h',
  r: 'n',
  s: 'c',
}
