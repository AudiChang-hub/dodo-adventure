// 劇本的自動檢查規則（G-9 的 check-story；docs/成長系統設計.md §3.3、§3.6.1、§3.6.3b、§3.8，docs/故事世界.md §3）。
// 這裡只放規則和詞表；讀檔、印結果在 scripts/check-story.ts。story-weekly.ts 也用同一份規則決定要不要退回重寫。
//
// 每一個問題都有類別，fixtures（scripts/fixtures/story/bad/）照類別確認「該擋的都擋得下」：
//   long 太長｜word 沒學過的字｜topic 禁用主題｜brand 受保護作品的招牌元素｜private 真名、生日、學校｜
//   emph 加重的字不在句尾｜faith 宗教類違規｜format 格式（id、門、圖、中文、固定句）
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { FRAMES, type Band } from '../../src/content/growth'
import { allLines, plainText } from '../../src/content/lines'
import { LEXICON } from '../../src/content/lexicon'
import { THEMES } from '../../src/content/themes'
import { EMOJI } from '../../src/art/emoji.generated'
import { STORY_ART, TWO, artParts } from '../../src/content/story/art'
import { allChapters, doorStop, draftChapters, weeklyOf, type Beat, type Chapter, type StopBeats, type StoryDraft } from '../../src/content/story'
import { OPEN_BOOK, CLOSE_BOOK } from '../../src/content/story/classics/fixed'
import { BASIC_WORDS } from './basic-words'
import type { LearnerSnapshot } from '../../src/lib/learner'

export type Category = 'long' | 'word' | 'topic' | 'brand' | 'private' | 'emph' | 'faith' | 'format'

export const CATEGORY_ZH: Record<Category, string> = {
  long: '太長',
  word: '沒學過的字',
  topic: '禁用主題',
  brand: '受保護作品的招牌元素',
  private: '個人資料（真名、生日、學校）',
  emph: '加重的字不在句尾',
  faith: '宗教類違規',
  format: '格式',
}

export interface Problem {
  cat: Category
  /** 哪一章（整份劇本的問題是 null） */
  chapter: string | null
  /** 哪一段：開場、第 2 站（數與規律版）、結尾… */
  where?: string
  /** 中文原因 */
  msg: string
  /** 只提醒、不擋（例如圖還沒打包，story-weekly 會自動打包） */
  warn?: boolean
}

// ── 斷字 ─────────────────────────────────────────────────────

/** 一句的英文字（去掉 `|`、`||`、標點；{name} 算一個字；連字號拆開：Hoo-hoo → hoo hoo） */
export function wordsOf(en: string): string[] {
  return en
    .replace(/\|\|?/g, ' ')
    .replace(/\{name\}/g, ' NAME ')
    .split(/[\s—–-]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '').replace(/'s$/i, ''))
    .filter((w) => /\p{L}/u.test(w))
}

/** 句長規則算的字數（和 G-8 的 check-story-themes 一樣：有英文字母的才算） */
export const countWords = (en: string) => wordsOf(en).length

/** 變化形還原成原形的候選（sleeps → sleep、rides → ride、carries → carry、hopping → hop） */
export function stems(w: string): string[] {
  const x = w.toLowerCase()
  const out = [x]
  if (x.endsWith('ies')) out.push(x.slice(0, -3) + 'y')
  if (x.endsWith('es')) out.push(x.slice(0, -2))
  if (x.endsWith('s')) out.push(x.slice(0, -1))
  if (x.endsWith('ied')) out.push(x.slice(0, -3) + 'y')
  if (x.endsWith('ed')) out.push(x.slice(0, -2), x.slice(0, -1), x.slice(0, -3))
  if (x.endsWith('ing')) out.push(x.slice(0, -3), x.slice(0, -3) + 'e', x.slice(0, -4))
  if (x.endsWith('er')) out.push(x.slice(0, -2), x.slice(0, -3))
  if (x.endsWith('est')) out.push(x.slice(0, -3), x.slice(0, -4))
  if (x.endsWith('ly')) out.push(x.slice(0, -2))
  return out
}

// ── 詞表 ─────────────────────────────────────────────────────

/** 角色的名字（例外清單：不算沒學過的字；故事世界 §2） */
export const STORY_NAMES = ['NAME', 'Dodo', 'Bobo', 'Momo', 'Teacher', 'Hoot', 'Dudu', 'Lulu']

/**
 * 故事世界的固定詞（例外清單）：魔法屋、開門口令、故事時間的開場結尾、彩虹蛋的咕嚕聲、恐龍的口頭禪、狀聲詞。
 * 這些字每一章都會出現，孩子聽久了就懂（故事世界 §1、§2、§5.1）。
 */
export const STORY_FIXED = [
  // 魔法屋、房間、門（§1）
  'magic', 'house', 'door', 'doors', 'knock', 'open', 'home', 'room', 'hall', 'yard', 'garage', 'kitchen', 'bedroom', 'living',
  // 故事時間（§5.1）
  'story', 'time', 'old', 'book', 'long', 'ago', 'people', 'told', 'tell', 'end', 'close',
  // 彩虹蛋（§2.1）：不會說話，只會咕嚕咕嚕
  'rainbow', 'egg', 'gurgle', 'spot', 'spots',
  // 口頭禪（§2.1、§2.2）
  'uh', 'oh', 'help', 'again', 'count', 'yes', 'look', 'up', 'slow', 'gentle', 'hoo', 'good', 'thinking', 'hmph', 'drip', 'drop', 'here', 'come', 'lu',
  // 固定口號、常見的狀聲詞（小班段每章都有 Beep, beep, here we go!）
  'beep', 'go', 'zzz', 'yay', 'wow', 'whee', 'boom', 'bang', 'splash', 'stomp', 'tiptoe', 'hop', 'clap', 'swish', 'whoosh', 'ding', 'dong',
  'hello', 'hi', 'bye', 'night', 'morning', 'cozy', 'soft', 'friend', 'friends',
]

/** 概念技能 → 英文字（顏色、形狀、數字、大小、比多少） */
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
export function conceptWords(keys: readonly string[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    const [kind, v] = k.split(':')
    if (!v) continue
    if (kind === 'color' || kind === 'shape' || kind === 'size') out.push(v)
    else if (kind === 'compare') out.push(v, v === 'more' ? 'many' : 'few')
    else if (['count', 'num', 'give', 'order'].includes(kind) && NUM[Number(v)]) out.push(...NUM.slice(1, Number(v) + 1))
  }
  return out
}

/** 單字 key（fire-truck、teddy-bear）→ 英文字 */
const keyWords = (k: string) => k.split('-')

const LEX_WORDS = new Set(LEXICON.flatMap((w) => wordsOf(w.en).map((x) => x.toLowerCase())))

/**
 * 孩子天天在 App 裡聽到的字（不含故事自己的台詞、不含圖卡單字）：所有遊戲旁白、稱讚、提示裡的字。
 * 圖卡單字（lexicon）要看孩子教過沒，不算在這裡。
 */
let heard: Set<string> | null = null
export function heardWords(): Set<string> {
  if (heard) return heard
  heard = new Set<string>()
  for (const [key, l] of allLines()) {
    if (key.startsWith('story.') || l.zh != null) continue
    for (const w of wordsOf(plainText(l))) {
      const x = w.toLowerCase()
      if (!LEX_WORDS.has(x)) heard.add(x)
    }
  }
  return heard
}

/** 沒有學習快照時：App 教得到的字都算（加重的字只檢查「是不是 App 會教的字」） */
export function defaultLearner(band: Band = 'small'): LearnerSnapshot {
  return {
    kind: 'learner',
    v: 1,
    date: '',
    band,
    words: LEXICON.map((w) => w.key),
    recent: [],
    unknown: [],
    concepts: ['color:red', 'color:orange', 'color:yellow', 'color:green', 'color:blue', 'color:purple', 'color:pink', 'color:brown', 'color:black', 'color:white', 'shape:circle', 'shape:square', 'shape:triangle', 'shape:star', 'shape:heart', 'count:10', 'size:big', 'size:small', 'compare:more', 'compare:less'],
    strands: [],
    friends: [],
    story: { part: 1, arc: '', next: 0, classicsDone: [] },
  }
}

export function loadLearner(path: string | undefined): { learner: LearnerSnapshot; from: string } {
  if (path && existsSync(path)) {
    const l = JSON.parse(readFileSync(path, 'utf8')) as LearnerSnapshot
    if (l.kind !== 'learner') throw new Error(`${path} 不是學習快照（家長區「故事審稿」→「下載學習快照」）`)
    return { learner: l, from: path }
  }
  if (path) throw new Error(`找不到學習快照 ${path}`)
  return { learner: defaultLearner(), from: '（沒有學習快照：App 教得到的字都算學過）' }
}

/** 孩子學過的字（加重的字只能用這些） */
export function learnedWords(l: LearnerSnapshot): Set<string> {
  const unknown = new Set(l.unknown)
  return new Set([...l.words.filter((k) => !unknown.has(k)).flatMap(keyWords), ...conceptWords(l.concepts)].map((w) => w.toLowerCase()))
}

// ── 禁用清單 ─────────────────────────────────────────────────

type Rule = [RegExp, string]

/** 禁用主題（故事世界 §3.5、成長系統 §3.8） */
export const TOPIC_RULES: Rule[] = [
  [/\b(hurt|hurts|injur(e|ed|y|ies)|wound(ed)?|bleed(s|ing)?|blood(y)?|bruise[ds]?)\b/i, '受傷、流血'],
  [/\b(die[sd]?|dying|dead|death|kill(s|ed|ing)?|murder\w*|drown\w*)\b/i, '死亡'],
  [/\b(sick|illness|fever|disease|virus|vomit\w*|throw(s|ing)? up)\b/i, '生病'],
  [/\b(monsters?|ogres?|trolls?|zombies?|ghosts?|demons?|witch(es)?|dragons? (eat|attack))\b/i, '怪物'],
  [/\b(villains?|bad (guy|guys|man|men|wolf)|robbers?|thie(f|ves)|burglars?|hunters?|kidnap\w*|pirates?)\b/i, '壞人'],
  [/\b(fight(s|ing)?|punch(es|ed)?|attack(s|ed)?|battle|war|swords?|guns?|weapons?|bombs?|shoot(s|ing)?|beat (him|her|them) up)\b/i, '打架'],
  [/\b((get|gets|got|is|are|am|was|were|feel|feels) lost|lost in the|can'?t find (my|his|her|our|the) (mom|mommy|dad|daddy|mama|papa|family|home|way)|where is (my )?(mom|mommy|dad|daddy|mama|papa))\b/i, '迷路'],
  [/\b(all alone|left behind|miss(es)? (my |his |her )?(mom|mommy|dad|daddy|mama|papa|family)|without (his |her |my )?(mom|mommy|dad|daddy|mama|papa)|orphans?|never (come|comes) back)\b/i, '和家人分開'],
  [/\b(eaten|gobble[sd]?|swallow(s|ed)? (him|her|them|whole)|(eat|eats|ate) (you|me|him|her|them|us|the little))\b/i, '被吃掉'],
  [/\b(locked (up|in)|lock(s|ed)? (him|her|them|you|me)|cages?d?|jail|prison|trapped)\b/i, '被關起來'],
  [/\b(allerg(y|ies|ic))\b/i, '食物過敏'],
  [/\b(ugly|stupid|dumb|fatty|laugh(s|ed|ing)? at|make(s)? fun of|teas(e|es|ed|ing))\b/i, '嘲笑別人'],
  [/\b(losers?|you lose|lost the (race|game)|(cry|cries|cried|sad)\b.{0,24}\b(lose|lost|loses))\b/i, '比輸贏、輸的一方難過'],
  [/\b(scary|scared|danger(ous)?|terrible|nightmares?|scream(s|ed)?)\b/i, '真正的危險、可怕'],
]

/** 受保護作品的招牌元素（成長系統 §3.6.1、故事世界 §3.5） */
export const BRAND_RULES: Rule[] = [
  [/\bring\b[^]*\bvolcano\b|\bvolcano\b[^]*\bring\b|\bone ring\b|\bmy precious\b/i, '《魔戒》：要丟進火山的戒指'],
  [/\b(hobbits?|halflings?|the shire|middle[- ]earth|mordor|frodo|bilbo|gandalf|gollum|sauron|orcs?|you shall not pass)\b/i, '《魔戒》的角色、地名、種族'],
  [/\b(lightning|bolt)[- ]?(shaped )?scar\b|\bscar on (his|her|the|my|your) forehead\b/i, '《哈利波特》：額頭上的閃電疤'],
  [/\b(sorting hat|talking hat)\b|\bhat\b.{0,40}\b(sorts?|picks?|chooses?)\b.{0,20}\bhouses?\b|\bfour houses\b/i, '《哈利波特》：分派學院的帽子、四個學院'],
  [/\b(hogwarts|gryffindor|hufflepuff|ravenclaw|slytherin|muggles?|quidditch|voldemort|dumbledore|hermione|harry potter|expecto|wingardium)\b/i, '《哈利波特》的角色、地名、咒語'],
  [/\bplatform nine\b|\b9 ?(¾|3\/4)\b|\bbroom(stick)?s?\b.{0,40}\bball\b/i, '《哈利波特》：9¾ 月台、騎掃把搶球'],
  [/\b(he who must not be named|you[- ]know[- ]who)\b/i, '《哈利波特》：不能說出名字的人'],
  [/\bmagic\s+tree\s*house\b/i, 'Magic Tree House（神奇樹屋）'],
  [/\b(jiminy|ruby slippers|hakuna matata|let it go|mickey|minnie|elsa|olaf|simba|nemo|buzz lightyear|to infinity and beyond|bibbidi|tinker ?bell|dumbo|bambi|cinderella'?s? (glass|carriage))\b/i, '迪士尼的角色名字、歌、招牌造型'],
  [/\b(very hungry caterpillar|brown bear, brown bear|what do you see\?|guess how much i love you|pete the cat|peppa|george pig|bluey|baby shark|doo,? doo|pinkfong|paw patrol|elmo|cookie monster|sesame street|gruffalo|paddington|curious george|thomas the tank|spongebob|pikachu|pok[eé]mon|totoro|doraemon|hello kitty|frozen)\b/i, '現代繪本、卡通的角色、書名、招牌句'],
  [/\b(winnie|pooh|piglet|eeyore|tigger|hundred acre|oh,? bother|peter pan|neverland|captain hook|narnia|aslan)\b/i, '家長決定不用、還在保護期的作品（小熊維尼、彼得潘、納尼亞）'],
]

/** 宗教類（faith 標籤）不能有的字詞（成長系統 §3.6.3b、故事世界 §5.1） */
export const FAITH_RULES: Rule[] = [
  [/\b(pray(s|ed|ing|er|ers)?|amen|hallelujah|worship\w*|praise[sd]?)\b/i, '禱告、讚美神'],
  [/\b(god|gods|lord|jesus|christ|allah|buddha|bodhisattva|holy|divine|angels?|devil|satan)\b/i, '神、佛陀、耶穌出現或說話'],
  [/\b(command(s|ed)?|obey(s|ed)?|told (him|her|them|noah) to)\b/i, '神的指令'],
  [/\b(believe[sd]?|faith|have to trust|must trust)\b/i, '「你要相信」'],
  [/\b(sins?|sinners?|punish\w*|wicked|evil|heaven|hell|karma|nirvana|judg(e|ed|ment))\b/i, '罪與懲罰、天堂地獄'],
  [/\b(prophets?|muhammad|mohammed|muhammed|messenger of)\b/i, '先知（不畫人像、不改編先知的故事）'],
]
/** 宗教類的家長中文對照裡不該出現的（禱告、神的指令、先知人像的描述） */
export const FAITH_ZH = /上帝|耶穌|佛陀|真主|阿拉|先知|穆罕默德|禱告|祈禱|讚美主|天堂|地獄|懲罰|罪人|光環/
/** 宗教類不能用的圖：宗教符號、光環、禱告的手、宗教建築 */
export const FAITH_PICS = /angel|halo|folded-hands|praying|place-of-worship|church|mosque|synagogue|hindu-temple|kaaba|latin-cross|orthodox-cross|star-and-crescent|star-of-david|om\b|wheel-of-dharma|menorah|khanda|yin-yang|dove-of-peace|person-in-lotus/

/** faith 標籤和故事時間編號的對應（故事世界 §5.3：B 聖經、J 本生經、P 五卷書） */
export const FAITH_OF_PREFIX: Record<string, string> = { B: 'bible', J: 'jataka', P: 'panchatantra' }

// ── 檢查 ─────────────────────────────────────────────────────

/** 固定句：開門口令、故事時間的開場結尾（年段的句長、一章的長度都不算它們，故事世界 §3.3 例外） */
export const KNOCK = 'Knock, knock! Open, magic door!'
const FIXED_EN = new Set([KNOCK, ...OPEN_BOOK.map((b) => b.en), ...CLOSE_BOOK.map((b) => b.en)])
export const isFixed = (en: string) => FIXED_EN.has(en)

const WHO = new Set(['dodo', 'bobo', 'momo', 'egg', 'all', 'friend'])
const DOORS = new Set(THEMES.map((t) => t.id))
let iconify: Set<string> | null = null
function inIconify(n: string): boolean {
  if (!iconify) {
    try {
      const set = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/fluent-emoji-flat/icons.json'), 'utf8'))
      iconify = new Set([...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})])
    } catch {
      iconify = new Set()
    }
  }
  return iconify.has(n)
}

export interface CheckOpts {
  learner: LearnerSnapshot
  /** 不能出現的個人資料（孩子的真名、幼兒園…）；從 .env.local 讀，也可以從參數加 */
  privateWords: string[]
  /** 是審稿佇列的劇本（要有中文對照；手寫的示範章節不用） */
  draft: boolean
}

/** 一章裡每一段（含依主線的每一版）：[段名, 句子] */
function segmentsOf(ch: Chapter): [string, Beat[]][] {
  const out: [string, Beat[]][] = [['開場', ch.intro]]
  const TRACK_ZH = { lang: '語言版', num: '數與規律版', think: '邏輯與程式版', hand: '動手版' } as const
  ch.stops.forEach((s: StopBeats | null, i) => {
    if (!s) return
    out.push([`第 ${i + 1} 站`, s.generic])
    for (const t of ['lang', 'num', 'think', 'hand'] as const) if (s[t]) out.push([`第 ${i + 1} 站（${TRACK_ZH[t]}）`, s[t]!])
  })
  if (ch.finale?.length) out.push(['終點', ch.finale])
  out.push(['結尾', ch.end])
  return out
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const quote = (b: Beat) => `「${b.en}」`

/** 一章最多幾個生字（有圖撐著、沒學過的字） */
export const NEW_WORDS: Record<Band, number> = { small: 2, middle: 3, big: 4 }
const BASIC = new Set(BASIC_WORDS)

/**
 * 檢查一章（手寫的示範章節也用這個檢查）。prior：這一篇前面幾章已經教過的生字（會把這一章的生字加進去）
 */
export function checkChapter(ch: Chapter, opts: CheckOpts, extra: { cast?: string[]; title?: string } = {}, prior: Set<string> = new Set()): Problem[] {
  const out: Problem[] = []
  const add = (cat: Category, msg: string, where?: string, warn?: boolean) => out.push({ cat, chapter: ch.id, where, msg, ...(warn ? { warn } : {}) })
  const band = (ch.band in FRAMES ? ch.band : 'small') as Band
  const f = FRAMES[band]
  const learned = learnedWords(opts.learner)
  const unknownWords = new Set(opts.learner.unknown.flatMap(keyWords))
  const cast = new Set([...STORY_NAMES, ...(extra.cast ?? [])].flatMap((n) => wordsOf(n)).map((w) => w.toLowerCase()))
  const fixed = new Set(STORY_FIXED)
  const heardSet = heardWords()
  const known = (w: string, set: Set<string>) => stems(w).some((x) => set.has(x))
  const segs = segmentsOf(ch)
  const allBeats = segs.flatMap(([, bs]) => bs)
  const enText = [extra.title ?? '', ch.look?.title ?? '', ...allBeats.map((b) => b.en)].join('\n')

  // ── 格式 ──
  const seenPics = new Set<string>()
  if (ch.door && !DOORS.has(ch.door)) add('format', `門 ${ch.door} 不存在（只能用 12 扇門：${[...DOORS].join('、')}）`)
  if (ch.kind === 'epic' && !ch.door) add('format', '原創長篇的每一章要指定今天走哪一扇門（door）')
  if (ch.kind === 'classic' && !ch.look) add('format', '故事時間要有書的樣子（look）')
  if (ch.kind === 'epic' && ch.intro[ch.intro.length - 1]?.en !== KNOCK) add('format', `開場最後一句要是開門口令 ${KNOCK}`, '開場')
  if (ch.kind === 'classic') {
    if (ch.intro.map((b) => b.en).join('|') !== OPEN_BOOK.map((b) => b.en).join('|')) add('format', '故事時間的開場要是固定兩句：Story time! Open the old book. ／ Long ago, people told this story.', '開場')
    if (ch.end.map((b) => b.en).join('|') !== CLOSE_BOOK.map((b) => b.en).join('|')) add('format', '故事時間的結尾要是固定一句：The end. Close the old book.', '結尾')
    if (ch.stops.length !== 5 || ch.stops.some((s) => !s)) add('format', '故事時間要分成 5 段（5 站之前各一段）')
  }
  if (ch.stops.length > 5) add('format', `最多 5 站，這一章有 ${ch.stops.length} 站`)
  // 書的樣子（故事時間）：封面、每一站、終點的圖
  for (const p of ch.look ? [ch.look.icon, ...ch.look.stops, ...ch.look.finale] : [])
    if (!seenPics.has(p) && !p.startsWith('@') && !EMOJI[p]) {
      seenPics.add(p)
      if (inIconify(p)) add('format', `書的樣子的圖 ${p} 還沒打包（story-weekly 會自動打包）`, undefined, true)
      else add('format', `書的樣子的圖 ${p} 不存在`)
    }
  if (ch.look && ch.look.stops.length !== 5) add('format', `書的樣子要有 5 站的圖（look.stops），現在 ${ch.look.stops.length} 張`)
  for (const [where, bs] of segs) {
    if (!Array.isArray(bs)) {
      add('format', '這一段不是句子的陣列', where)
      continue
    }
    for (const b of bs) {
      if (!WHO.has(b.who)) add('format', `${quote(b)} 說話的人 ${b.who} 不存在（只能是 dodo、bobo、momo、egg、all、friend）`, where)
      if (/[㐀-鿿]/.test(b.en)) add('format', `${quote(b)} 故事裡不出現中文（中文只寫在 zh，給家長看）`, where)
      if (opts.draft && !b.zh) add('format', `${quote(b)} 缺家長看的中文意思（zh）`, where)
      for (const p of (b.pic ?? '').split('+').filter(Boolean)) {
        if (seenPics.has(p)) continue
        seenPics.add(p)
        if (p.startsWith('@')) {
          // 自己畫的圖（content/story/art.ts，畫在 ui/StoryPic.tsx）：@two-<Fluent Emoji> 是兩隻一樣的動物，那隻動物也要有
          const parts = artParts(p)
          if (!parts) add('format', `${quote(b)} 圖 ${p} 不存在（自己畫的圖只有 ${Object.keys(STORY_ART).join('、')}、${TWO}<動物>）`, where)
          else if (p.startsWith(TWO) && !EMOJI[parts[0]]) add('format', `${quote(b)} 圖 ${p} 的 ${parts[0]} 不存在（${TWO}後面接 Fluent Emoji 的名字，例如 ${TWO}elephant）`, where)
        } else if (!EMOJI[p]) {
          if (inIconify(p)) add('format', `${quote(b)} 圖 ${p} 還沒打包（npm run emoji；story-weekly 會自動打包）`, where, true)
          else add('format', `${quote(b)} 圖 ${p} 不存在（Fluent Emoji 的名字，例如 rabbit、red-apple）`, where)
        }
      }
    }
  }

  // ── 太長：一句、一段、一章 ──
  for (const [where, bs] of segs) {
    if (bs.length > f.story.segment[1]) add('long', `一段 ${bs.length} 句，超過${band === 'small' ? '小班段' : band === 'middle' ? '中班段' : '大班段'}的 ${f.story.segment[1]} 句（FRAME-11）`, where)
    for (const b of bs) {
      if (isFixed(b.en)) continue
      const n = countWords(b.en)
      if (n > f.maxWords) add('long', `${quote(b)} ${n} 個字，超過一句 ${f.maxWords} 個字（FRAME-4）`, where)
      if (!f.joinWords && /\b(because|then|first|yesterday|but|if)\b/i.test(b.en.replace(/Then…/g, ''))) {
        // 小班段一句一個動作：then、because 這種連接詞中班段才用（「Then… a nap!」這種停頓的 Then 不算）
        add('long', `${quote(b)} 小班段一句一個動作，不用 because、first、then 連起來（中班段起才用）`, where)
      }
    }
  }
  // 一章：照沒有主線的那一版念完（門原本的旁白也算），固定句不算；字數照年段的「約」放寬一成
  const door = THEMES.find((t) => t.id === ch.door)
  const path: string[] = [
    ...ch.intro.map((b) => b.en),
    ...Array.from({ length: 5 }, (_, i) => {
      const st = ch.stops[i]
      if (st) return st.generic.map((b) => b.en)
      return door && !ch.look ? [doorStop(door, i).en] : []
    }).flat(),
    ...(ch.finale ?? []).map((b) => b.en),
    ...ch.end.map((b) => b.en),
  ].filter((t) => !isFixed(t))
  const nWords = path.reduce((n, t) => n + countWords(t), 0)
  const maxS = f.story.sentences[1]
  const maxW = Math.round(f.story.words * 1.1)
  if (path.length > maxS) add('long', `一章 ${path.length} 句（含門原本的旁白；不算開門口令、故事時間的固定句），超過 ${maxS} 句（故事世界 §3.3）`)
  if (nWords > maxW) add('long', `一章約 ${nWords} 個字，超過約 ${f.story.words} 字（最多 ${maxW}）`)

  // ── 加重的字：要在句尾、要學過 ──
  for (const [where, bs] of segs)
    for (const b of bs) {
      const bars = b.en.replace(/\|\|/g, '').split('|').length - 1
      if (bars === 0) continue
      const after = b.en.replace(/\|\|/g, '').split('|').slice(1).join('|')
      const tail = after.replace(/[\s.!?…,"'”’)]+$/u, '')
      if (bars > 1 || /[.!?…]/.test(tail) || countWords(after) > 3)
        add('emph', `${quote(b)} 加重的字要在句尾（\`|\` 之後到句子結束只能是加重的字；要加重句中的字就拆成兩句）`, where)
      // 圖卡單字（lexicon）要孩子教過；不是圖卡單字的，照下面「生字」的規則（要有圖撐著，算進今天剛教的字）
      for (const w of wordsOf(after)) {
        if (w === 'NAME' || cast.has(w.toLowerCase())) continue
        if (known(w, LEX_WORDS) && !known(w, learned)) add('word', `${quote(b)} 加重的字 ${w} 孩子還沒學過（加重的字要是學過的字）`, where)
      }
    }

  // ── 沒學過的字 ──
  // 可以自由用：學過的字、角色名字、故事世界的固定詞、App 天天聽得到的字、基本字（basic-words.ts）、這一篇前面幾章教過的生字。
  // 其他的是「生字」：那一句要有圖撐著（故事世界 §3.4），一章最多 NEW_WORDS 個（小班 2、中班 3、大班 4）。
  const flagged = new Set<string>()
  const fresh = new Map<string, { b: Beat; where: string }>()
  for (const [where, bs] of segs)
    for (const b of bs) {
      if (isFixed(b.en) || b.who === 'friend') continue
      const ws = wordsOf(b.en)
      ws.forEach((w, i) => {
        const lw = w.toLowerCase()
        if (w === 'NAME' || cast.has(lw) || flagged.has(lw) || fresh.has(lw)) return
        if (unknownWords.has(lw)) {
          flagged.add(lw)
          add('word', `${quote(b)} 用了家長勾「他不認得」的字 ${w}`, where)
          return
        }
        if (known(lw, learned) || known(lw, fixed) || known(lw, heardSet) || known(lw, BASIC) || known(lw, prior)) return
        // 圖卡單字沒教過：不能拿來當生字（要先在遊戲裡教）
        if (known(lw, LEX_WORDS)) {
          flagged.add(lw)
          add('word', `${quote(b)} ${w} 是圖卡單字，孩子還沒學過（要先在遊戲裡教過才放進故事）`, where)
          return
        }
        // 句中大寫開頭、又不是學過的字：多半是人名。孩子的名字只能寫 {name}
        const before = b.en.slice(0, b.en.indexOf(w)).trim()
        const sentenceStart = i === 0 || /[.!?…]$/.test(before)
        if (/^\p{Lu}/u.test(w) && !sentenceStart && !BRAND_RULES.some(([re]) => re.test(b.en))) {
          flagged.add(lw)
          add('private', `${quote(b)} ${w} 像是人名：孩子的名字只能寫 {name}；故事角色的名字要寫進劇本的 cast`, where)
          return
        }
        if (!b.pic) {
          flagged.add(lw)
          add('word', `${quote(b)} ${w} 孩子沒學過，這一句也沒有圖撐著（生字要有圖，或換成學過的字）`, where)
          return
        }
        fresh.set(lw, { b, where })
      })
    }
  const limit = NEW_WORDS[band]
  if (fresh.size > limit)
    add('word', `生字太多：${[...fresh.keys()].join('、')}（${fresh.size} 個；${band === 'small' ? '小班段' : band === 'middle' ? '中班段' : '大班段'}一章最多 ${limit} 個沒學過的字，其他換成學過的字）`)
  for (const w of fresh.keys()) prior.add(w)

  // ── 禁用主題、招牌元素 ──
  for (const [where, bs] of segs)
    for (const b of bs) {
      for (const [re, what] of TOPIC_RULES) if (re.test(b.en)) add('topic', `${quote(b)} 碰到禁用主題：${what}`, where)
      for (const [re, what] of BRAND_RULES) if (re.test(b.en)) add('brand', `${quote(b)} 像${what}`, where)
    }
  for (const t of [extra.title, ch.look?.title].filter(Boolean) as string[]) for (const [re, what] of BRAND_RULES) if (re.test(t)) add('brand', `標題「${t}」像${what}`)
  // 整章一起看（戒指和火山分在兩句也算）
  if (BRAND_RULES[0][0].test(enText) && !out.some((p) => p.cat === 'brand' && p.msg.includes('魔戒'))) add('brand', '這一章同時有戒指和火山：像《魔戒》要丟進火山的戒指')

  // ── 個人資料 ──
  for (const [where, bs] of segs)
    for (const b of bs) {
      if (/\{(?!name\})[^}]*\}|\{\{|\[name\]|<name>/i.test(b.en)) add('private', `${quote(b)} 孩子的名字只能寫成 {name}（小寫、一對大括號）`, where)
      if (/\b(19|20)\d\d\b|\b(january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}\b|\bborn (on|in)\b/i.test(b.en)) add('private', `${quote(b)} 不寫生日、年份、日期`, where)
      if (/\b(kindergarten|preschool|pre-school|daycare|nursery school)\b/i.test(b.en)) add('private', `${quote(b)} 不寫學校、幼兒園`, where)
    }

  // ── 宗教類 ──
  const faithTag = ch.faith
  if (faithTag) {
    for (const [where, bs] of segs)
      for (const b of bs) {
        for (const [re, what] of FAITH_RULES) if (re.test(b.en)) add('faith', `${quote(b)} 宗教類不能有：${what}`, where)
        if (b.zh && FAITH_ZH.test(b.zh)) add('faith', `中文意思「${b.zh}」宗教類不寫禱告、神的指令、先知人像、懲罰、天堂地獄`, where)
        if (b.pic && FAITH_PICS.test(b.pic)) add('faith', `${quote(b)} 圖 ${b.pic}：宗教類不畫神、佛陀、先知、光環和宗教符號`, where)
      }
    if (ch.kind !== 'classic') add('faith', '宗教經典只在故事時間講，原創長篇不加 faith 標籤')
    if (ch.kind === 'classic' && ch.intro[1]?.en !== OPEN_BOOK[1].en) add('faith', '宗教類的開場要有固定句 Long ago, people told this story.（讓孩子知道是古時候的人講的故事）', '開場')
  }
  return out
}

/** 檢查一整份劇本（一篇或一則故事時間） */
export function checkDraft(d: StoryDraft, opts: CheckOpts, raw?: string): Problem[] {
  const out: Problem[] = []
  const add = (cat: Category, msg: string) => out.push({ cat, chapter: null, msg })
  if (d.type !== 'arc' && d.type !== 'classic') return [{ cat: 'format', chapter: null, msg: 'type 要是 arc（原創長篇）或 classic（故事時間）' }]
  if (d.type === 'arc') {
    const a = d.arc
    if (!/^p\d-a\d\d$/.test(a.id)) add('format', `篇的 id 要像 p1-a02（第幾部、第幾篇），現在是 ${a.id}`)
    if (!Array.isArray(a.chapters) || !a.chapters.length) add('format', '這一篇沒有章')
    a.chapters?.forEach((c, i) => {
      if (c.id !== `${a.id}-c${i + 1}`) add('format', `第 ${i + 1} 章的 id 要是 ${a.id}-c${i + 1}，現在是 ${c.id}`)
    })
    const n = a.chapters?.length ?? 0
    const range = a.band === 'small' ? [5, 5] : a.band === 'middle' ? [3, 5] : [5, 7]
    if (n < range[0] || n > range[1]) add('long', `${a.band === 'small' ? '小班段' : a.band === 'middle' ? '中班段' : '大班段'}一篇 ${range[0] === range[1] ? range[0] : `${range[0]}–${range[1]}`} 章，這一篇有 ${n} 章（故事世界 §4）`)
    for (const [re, what] of BRAND_RULES) if (re.test(a.title)) add('brand', `篇名「${a.title}」像${what}`)
  } else {
    const c = d.classic
    if (!/^[A-Z]\d\d$/.test(c.id)) add('format', `故事時間的編號要照故事世界 §5.3（例如 J02），現在是 ${c.id}`)
    if (c.chapter.id !== `classic-${c.id.toLowerCase()}`) add('format', `故事時間這一章的 id 要是 classic-${c.id.toLowerCase()}，現在是 ${c.chapter.id}`)
    const need = FAITH_OF_PREFIX[c.id[0]]
    if (need && c.faith !== need) add('faith', `${c.id} 是宗教經典，要加 faith 標籤 ${need}（審稿頁才會標「宗教經典，請特別看」）`)
    if (!need && c.faith) add('faith', `${c.id} 不是宗教經典，不加 faith 標籤`)
    if (!c.source) add('format', '故事時間要寫出處（source，只給家長看）')
  }
  // 和手寫的章節撞 id（審稿佇列裡同一份劇本的舊版不算）
  for (const ch of draftChapters(d)) if (allChapters().some((x) => x.id === ch.id) && !weeklyOf(ch.id)) add('format', `已經有手寫的 ${ch.id}，換一個 id`)
  // 個人資料：整份 JSON（含中文對照、給家長的說明）都不能有真名、生日、幼兒園
  const text = raw ?? JSON.stringify(d)
  for (const p of opts.privateWords.filter((x) => x && x.length >= 2)) {
    const re = /[㐀-鿿]/.test(p) ? new RegExp(escape(p)) : new RegExp(`\\b${escape(p)}\\b`, 'i')
    if (re.test(text)) add('private', `劇本裡出現了不能進 repo 的個人資料「${p.slice(0, 1)}${'＊'.repeat(Math.max(1, p.length - 1))}」：孩子的名字只能寫 {name}`)
  }
  const prior = new Set<string>()
  for (const ch of draftChapters(d)) out.push(...checkChapter(ch, opts, { cast: d.cast, title: d.type === 'arc' ? d.arc.title : undefined }, prior))
  return out
}

/** .env、.env.local 裡的孩子名字和額外的私人字詞（STORY_PRIVATE_WORDS，逗號分隔：幼兒園的名字、生日…） */
export function privateWordsFromEnv(): string[] {
  const env: Record<string, string> = {}
  for (const f of ['.env', '.env.local']) {
    if (!existsSync(f)) continue
    for (const row of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = row.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  const get = (k: string) => process.env[k] ?? env[k]
  return [get('VITE_CHILD_NAME_EN'), get('VITE_CHILD_NAME_ZH'), ...(get('STORY_PRIVATE_WORDS') ?? '').split(',')]
    .map((x) => (x ?? '').trim())
    .filter((x) => x && x !== 'buddy' && x !== '小朋友')
}
