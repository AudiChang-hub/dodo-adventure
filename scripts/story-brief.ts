// 寫作簡報（G-9，docs/成長系統設計.md §3.6.4）：寫下一篇長篇、下一則故事時間之前，把寫的人（AI 或人）需要知道的整理成一份 Markdown。
//
// 內容：要寫哪一篇（docs/故事世界.md §4 大綱的那一列、§5.3 授權表的那一列、§5.4 排法）、孩子的程度（學習快照：學過的字、
// 各支線的階、朋友；年段外框 content/growth.ts）、故事世界的規則全文（§1–§3、§5.1）、劇本 JSON 的格式和範例。
// 退回重寫時再加上 check-story 的問題、家長退回的原因和上一版劇本。
//
// 用法：
//   npx tsx scripts/story-brief.ts                 下一篇長篇＋下一則故事時間，各一份簡報
//   npx tsx scripts/story-brief.ts --what classic  只要故事時間（arc：只要長篇）
//   npx tsx scripts/story-brief.ts --arc 3         指定第幾篇；--classic J02 指定哪一則
//   --learner 學習快照.json（預設 scripts/.cache/learner.json）、--out 資料夾（預設 scripts/.cache/story/<這週星期一>/）
// 簡報裡有孩子學過的字，所以只寫在 gitignored 的 scripts/.cache/，不進 repo。
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { FRAMES, BAND_ZH, type Band } from '../src/content/growth'
import { THEMES, BEATS } from '../src/content/themes'
import { ARCS, CLASSICS, HOUSE_ITEMS, WEEKLY, draftId, type StoryDraft } from '../src/content/story'
import { LEXICON } from '../src/content/lexicon'
import { loadLearner, NEW_WORDS, STORY_FIXED, STORY_NAMES, type Problem } from './story/rules'
import { loadWorld, nextClassic, type ClassicRow, type World } from './story/world'
import type { LearnerSnapshot } from '../src/lib/learner'
import { formatProblems } from './check-story'

export const LEARNER_CACHE = 'scripts/.cache/learner.json'

/** 故事要給哪一週用：下一個星期一（星期日晚上跑就是明天；星期一當天跑就是今天）（YYYY-MM-DD） */
export function mondayOf(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((8 - d.getDay()) % 7))
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export interface BriefMeta {
  type: 'arc' | 'classic'
  /** 劇本的 id：p1-a02、J02 */
  id: string
  title: string
  band: Band
  week: string
  path: string
}

export interface BriefOpts {
  learner: LearnerSnapshot
  learnerFrom: string
  week: string
  out: string
  world?: World
  /** 指定第幾篇、哪一則 */
  arcNo?: number
  classicId?: string
  /** 退回重寫：上一版劇本、要改的原因（check-story 的問題、家長退回的原因） */
  redo?: { attempt: number; previous: string; problems?: Problem[]; parent?: { chapter: string; reason: string }[] }
}

const PART_BAND: Record<number, Band> = { 1: 'small', 2: 'middle', 3: 'big' }
const pad = (n: number) => String(n).padStart(2, '0')
const list = (xs: readonly string[]) => (xs.length ? xs.join('、') : '（沒有）')

/** 下一篇長篇是第幾篇：手寫的、審稿佇列裡的都算寫好了 */
export function nextArcNo(): number {
  return Math.max(0, ...ARCS.map((a) => a.no)) + 1
}

/** 孩子的程度（兩種簡報共用） */
function learnerPart(l: LearnerSnapshot, band: Band, from: string): string {
  const f = FRAMES[band]
  const lex = new Map(LEXICON.map((w) => [w.key, w]))
  const word = (k: string) => (lex.get(k) ? `${lex.get(k)!.en}（${lex.get(k)!.zh}）` : k)
  const strands = l.strands.length
    ? l.strands.map((s) => `- ${s.name}：完成 ${list(s.done)}；正在練 ${list(s.current)}`).join('\n')
    : '- （學習快照沒有支線的資料）'
  return `## 孩子現在的程度

學習快照：${from}${l.date ? `（${l.date} 匯出）` : ''}

**年段外框（${BAND_ZH[band]}，content/growth.ts，數字是上限，check-story 會擋）**

- 一句最多 **${f.maxWords} 個英文字**${f.joinWords ? '，可以用 first、then、because 連起來' : '，一句一個動作，現在式，不用 because、first、then 連起來'}。
- 一段（開場、每站之前、結尾）最多 **${f.story.segment[1]} 句**。
- 一章約 **${f.story.sentences[0]}–${f.story.sentences[1]} 句、${f.story.words} 字**（第一部門後原本的旁白也算；開門口令、故事時間的固定句不算）。
- ${f.storyChoices ? `每章最多 ${f.storyChoices} 次選擇。` : '沒有選擇。'}

**用字**

- 加重的字（\`|\` 後面那個字）只能用孩子**學過的字**：${list(l.words.map(word))}
- 學過的概念（可以直接說）：${list(l.concepts)}
- 最近兩週剛學熟的字，**優先拿來當道具**：${list(l.recent.map(word))}
- 家長勾「他不認得」的字，**不要用**：${list(l.unknown.map(word))}
- 其他可以自由用的：角色名字（${STORY_NAMES.filter((n) => n !== 'NAME').join('、')}、{name}）、故事世界的固定詞（${STORY_FIXED.slice(0, 24).join('、')}…）、Dolch 常見字和幼兒天天聽的字（scripts/story/basic-words.ts）。
- 上面都沒有的字是「生字」：一章最多 **${NEW_WORDS[band]} 個**，那一句一定要有圖撐著（\`pic\`），而且不能是還沒教過的圖卡單字。故事角色的名字（Rabbit、Noah）寫進 \`cast\`。

**各支線現在的階**（每站「依主線」的版本參考：排到哪條線就念那一版）

${strands}

**孩子孵到的朋友**：${list(l.friends)}（劇本只寫 \`"who": "friend"\` 和一句沒有朋友時的通用句，執行時會換成孩子真的有的朋友）
`
}

const FORMAT_ARC = (id: string, part: number, no: number, band: Band) => `## 劇本格式（只輸出這個 JSON，不要其他文字）

\`\`\`json
{
  "type": "arc",
  "rev": 1,
  "week": "YYYY-MM-DD",
  "by": "ai",
  "notes": ["給家長看：和大綱不一樣的地方、為什麼這樣寫（中文）"],
  "cast": [],
  "house": { "id": "英文-id", "zh": "魔法屋多了什麼（中文）", "room": "living", "pic": "Fluent Emoji 名字", "at": { "x": 990, "y": 520, "w": 70 } },
  "arc": {
    "id": "${id}", "part": ${part}, "no": ${no}, "title": "英文篇名", "zh": "中文篇名", "icon": "封面圖", "band": "${band}", "houseAdds": "同 house.id",
    "chapters": [
      {
        "id": "${id}-c1",
        "door": "bus",
        "intro": [
          { "who": "momo", "en": "Good morning, little | egg!", "pic": "@rainbow-egg", "zh": "早安，小蛋！" },
          { "who": "all", "en": "Knock, knock! Open, magic door!", "pic": "door", "zh": "叩叩！魔法門，打開！" }
        ],
        "stops": [
          null,
          {
            "generic": [{ "who": "momo", "en": "The egg rides the | bus, too!", "pic": "bus+@rainbow-egg", "zh": "蛋也一起坐公車！" }],
            "num": [{ "who": "momo", "en": "Count for the egg! One, two…", "pic": "@rainbow-egg+keycap-2", "zh": "數給蛋聽！一、二…" }]
          }
        ],
        "end": [
          { "who": "momo", "en": "Home to the Magic House.", "pic": "house-with-garden", "zh": "回魔法屋囉。" },
          { "who": "momo", "en": "Good night, little egg.", "pic": "@rainbow-egg+zzz", "zh": "晚安，小蛋。" }
        ]
      }
    ]
  }
}
\`\`\`

- 章的 id 一律是 \`${id}-c<第幾章>\`；${band === 'small' ? '小班段一篇 5 章' : band === 'middle' ? '中班段一篇 3–5 章' : '大班段一篇 5–7 章'}。
- \`door\`：今天走哪一扇門（下面的 12 扇門）。開場最後一句一定是開門口令 **Knock, knock! Open, magic door!**。
- \`stops\`：5 站之前各一段。${part === 1 ? '第一部只換其中一站（其他站寫 `null`，念門後原本的旁白）。' : '第二、三部 5 站都寫故事的句子。'}每一段可以加「依主線」的版本 \`lang\`（語言）、\`num\`（數與規律）、\`think\`（邏輯與程式）、\`hand\`（動手），沒有就念 \`generic\`。
- \`who\`：dodo、bobo、momo、egg（彩虹蛋，只會 Gurgle）、all（大家一起說）、friend（孵出來的朋友）。
- \`en\`：英文台詞；\`|\` 後面是加重的字，**只能放在句尾**（要加重句中的字就拆成兩句）。孩子的名字只寫 \`{name}\`。
- \`pic\`：Fluent Emoji 的名字（bus、red-apple、musical-notes…），或故事自己的圖 @rainbow-egg、@blanket、@egg-nest；用 \`+\` 疊兩張（第一張大的，第二張小的在右下角）。
- \`zh\`：每一句都要有中文意思（只給家長審稿看，App 裡不出現）。
- 魔法屋已經有的東西：${HOUSE_ITEMS.map((h) => `${h.id}（${h.zh}）`).join('、')}。這一篇講完多的東西照大綱寫進 \`house\`。
`

const FORMAT_CLASSIC = (c: ClassicRow, faith: string | null) => `## 劇本格式（只輸出這個 JSON，不要其他文字）

\`\`\`json
{
  "type": "classic",
  "rev": 1,
  "week": "YYYY-MM-DD",
  "by": "ai",
  "cast": ["故事角色的英文名字，例如 Rabbit"],
  "notes": ["給家長看：和原典不一樣的地方、為什麼這樣改（中文）"],
  "classic": {
    "id": "${c.id}",
    "source": "出處（只給家長看）",
    "zh": "${c.title}",
    "band": "${c.band}",
    "faith": ${faith ? `"${faith}"` : 'null'},
    "chapter": {
      "id": "classic-${c.id.toLowerCase()}",
      "look": { "title": "英文書名", "zh": "${c.title}（故事時間）", "host": "momo", "icon": "open-book", "scene": "park", "tint": "#EFE6D3", "deep": "#A8875A", "ground": "#DCCFB2",
                "stops": ["每一站的圖", "…共 5 張"], "finale": ["終點的圖"] },
      "stops": [
        { "generic": [{ "who": "momo", "en": "Here is a little | rabbit.", "pic": "rabbit", "zh": "這是一隻小兔子。" }] },
        { "generic": [ … ] }, { "generic": [ … ] }, { "generic": [ … ] }, { "generic": [ … ] }
      ]
    }
  }
}
\`\`\`

- 開場（Story time! Open the old book. ／ Long ago, people told this story.）和結尾（The end. Close the old book.）是固定句，**不用寫**，會自動加上。
- 故事分成 **5 段**（\`stops\` 5 個），放在 5 站之前。故事裡的角色借恐龍的聲音（\`who\` 寫 dodo、bobo），旁白是 momo。
- \`look.scene\` 可以用：city、valley、farm、sea、rain、market、zoo、site、night、party、park。
- \`|\` 後面是加重的字，**只能放在句尾**；每一句都要有 \`zh\`（只給家長看）。
`

function doorsPart(): string {
  return `## 12 扇魔法門（door 的值；門後原本的 5 站旁白）

${THEMES.map((t) => `- \`${t.id}\` ${t.zh}（主持：${t.host}）：${BEATS[t.id].stops.map((s, i) => `${i + 1}. ${s.replace(/\|\s*/g, '')}`).join(' ')}`).join('\n')}
`
}

function redoPart(o: BriefOpts): string {
  if (!o.redo) return ''
  const ps = o.redo.problems?.length ? `**自動檢查（check-story）擋下的問題**：\n\n${formatProblems(o.redo.problems)}\n` : ''
  const pr = o.redo.parent?.length ? `**家長退回的原因**（照家長的意思改那一章，其他章不要動）：\n\n${o.redo.parent.map((p) => `- ${p.chapter}：${p.reason}`).join('\n')}\n` : ''
  return `## 這是第 ${o.redo.attempt} 次寫：請照下面的原因改上一版

${ps}
${pr}
- 只改有問題的地方，沒問題的句子保持不變（家長已經聽過的不用重聽）。
- \`rev\` 加 1。

**上一版劇本**

\`\`\`json
${o.redo.previous.trim()}
\`\`\`
`
}

/** 長篇下一篇的簡報 */
export function arcBrief(o: BriefOpts): { meta: BriefMeta; md: string } {
  const w = o.world ?? loadWorld()
  const no = o.arcNo ?? nextArcNo()
  const row = w.arcs.get(no)
  if (!row) throw new Error(`故事世界 §4 的大綱沒有第 ${no} 篇`)
  const part = row.part
  const band = PART_BAND[part] ?? o.learner.band
  const noInPart = no
  const id = `p${part}-a${pad(noInPart)}`
  const title = row.cells['標題'] ?? ''
  const prev = ARCS.filter((a) => a.no < no).sort((a, b) => b.no - a.no)[0]
  const prevEnd = prev?.chapters[prev.chapters.length - 1]
  const recentDoors = prev?.chapters.map((c) => c.door).filter(Boolean) ?? []
  const md = `# 寫作簡報：第 ${part} 部 第 ${no} 篇〈${title}〉（${BAND_ZH[band]}）

產生：${new Date().toISOString().slice(0, 16).replace('T', ' ')}　這一週：${o.week}　故事世界：${basename(w.path)}

你要寫《彩虹蛋之旅》（The Rainbow Egg Journey）的下一篇，給一個 3 歲多的孩子在平板上聽。故事全英文，跟著每天的冒險走。
寫好之後會先經過自動檢查（check-story），再由家長逐章試聽、通過才給孩子聽。請**只輸出劇本的 JSON**。

## 這一篇要寫什麼（故事世界 §4 大綱）

${Object.entries(row.cells).map(([k, v]) => `- **${k}**：${v}`).join('\n')}

- 劇本 id：\`${id}\`，第 ${part} 部（${BAND_ZH[band]}）。
- 上一篇：${prev ? `第 ${prev.no} 篇〈${prev.zh}〉，最後一章的結尾是「${prevEnd?.end.map((b) => b.en.replace(/\|\s*/g, '')).join(' ')}」` : '（沒有）'}。${band === 'small' ? '小班段各章獨立，開場可以提一句昨天。' : '這一篇的各章有共同目標。'}
- 上一篇走過的門：${list(recentDoors as string[])}（這一篇盡量換不同的門）。

${learnerPart(o.learner, band, o.learnerFrom)}
${doorsPart()}
${FORMAT_ARC(id, part, no, band)}
## 故事世界的規則（docs/故事世界.md，必讀）

${w.section('1. 魔法屋')}

${w.section('2. 角色')}

${w.section('3. 寫作規則')}

## 範例：第 1 篇第 1 章（§6.1，家長確認過的語氣）

${w.section('6.1')}
${redoPart(o)}`
  return { meta: { type: 'arc', id, title, band, week: o.week, path: '' }, md }
}

/** 下一則故事時間的簡報 */
export function classicBrief(o: BriefOpts): { meta: BriefMeta; md: string } {
  const w = o.world ?? loadWorld()
  const told = [...new Set([...o.learner.story.classicsDone, ...CLASSICS.map((c) => c.id)])]
  const c = o.classicId ? w.classics.get(o.classicId) : nextClassic(w, o.learner.band, told)
  if (!c) throw new Error(o.classicId ? `授權表沒有 ${o.classicId}` : '授權表裡沒有還沒講過、年段適合的故事了')
  const faith = ({ B: 'bible', J: 'jataka', P: 'panchatantra' } as Record<string, string>)[c.id[0]] ?? null
  // 授權表裡這一類的說明（出處、查情節用的版本）：分類標題到表格之間那幾行
  const at = w.md.indexOf(`**${c.group}**`)
  const groupIntro = at >= 0 ? w.md.slice(at, w.md.indexOf('\n|', at)).trim() : ''
  const md = `# 寫作簡報：故事時間 ${c.id}〈${c.title}〉（${BAND_ZH[c.band]}${faith ? `，宗教經典 faith: ${faith}` : ''}）

產生：${new Date().toISOString().slice(0, 16).replace('T', ' ')}　這一週：${o.week}　故事世界：${basename(w.path)}

這一週的故事時間：莫莫在魔法屋的書房打開一本舊書，講一則古老的故事，給一個 3 歲多的孩子聽。故事全英文，分成 5 段放在當天的 5 站之間。
**一律用我們自己的話改寫**：古代原典只拿來查情節，不照抄任何譯本、繪本、動畫的文字。
寫好之後會先經過自動檢查（check-story），再由家長試聽、通過才給孩子聽。請**只輸出劇本的 JSON**。
${faith ? `\n**這是宗教經典的故事**：當故事講，不傳教義。不能有禱告、讚美神、神的指令、「你要相信」、罪與懲罰、天堂地獄；神、佛陀、耶穌、先知不出現、不說話；故事裡的人物是一般的古代人。家長審稿時會逐章特別看。\n` : ''}
## 授權表這一則（故事世界 §5.3）

${Object.entries(c.cells).map(([k, v]) => `- **${k}**：${v}`).join('\n')}

${groupIntro}

- 已經講過、寫好的：${list(told)}（同一則不重複）

${learnerPart(o.learner, c.band, o.learnerFrom)}
${FORMAT_CLASSIC(c, faith)}
## 故事世界的規則（docs/故事世界.md，必讀）

${w.section('2.1')}

${w.section('3.1')}

${w.section('3.3')}

${w.section('3.4')}

${w.section('3.5')}

${w.section('5.1')}

## 範例：龜兔賽跑（§7.1，家長確認過的語氣）

${w.section('7.1')}
${faith ? `\n## 範例：宗教經典的講法（§7.2 挪亞方舟）\n\n${w.section('7.2')}\n` : ''}${redoPart(o)}`
  return { meta: { type: 'classic', id: c.id, title: c.title, band: c.band, week: o.week, path: '' }, md }
}

export function writeBrief(o: BriefOpts, b: { meta: BriefMeta; md: string }, suffix = ''): BriefMeta {
  mkdirSync(o.out, { recursive: true })
  const path = join(o.out, `brief-${b.meta.id}${suffix}.md`)
  writeFileSync(path, b.md)
  return { ...b.meta, path }
}

/** 審稿佇列、手寫的故事裡已經有的 id */
export const writtenIds = () => new Set([...ARCS.map((a) => a.id), ...CLASSICS.map((c) => c.id), ...WEEKLY.map((d: StoryDraft) => draftId(d))])

function main() {
  const a = process.argv.slice(2)
  const opt = (k: string) => {
    const i = a.indexOf(k)
    return i >= 0 ? a[i + 1] : undefined
  }
  const lp = opt('--learner') ?? (existsSync(LEARNER_CACHE) ? LEARNER_CACHE : undefined)
  const { learner, from } = loadLearner(lp)
  const week = opt('--week') ?? mondayOf()
  const o: BriefOpts = {
    learner,
    learnerFrom: from,
    week,
    out: opt('--out') ?? join('scripts/.cache/story', week),
    arcNo: opt('--arc') ? Number(opt('--arc')) : undefined,
    classicId: opt('--classic'),
  }
  const what = opt('--what') ?? 'both'
  const made: BriefMeta[] = []
  if (what !== 'classic') made.push(writeBrief(o, arcBrief(o)))
  if (what !== 'arc') made.push(writeBrief(o, classicBrief(o)))
  for (const m of made) console.log(`✓ ${m.type === 'arc' ? '長篇' : '故事時間'} ${m.id}〈${m.title}〉→ ${m.path}（${readFileSync(m.path, 'utf8').length} 字元）`)
}

if (process.argv[1] && basename(process.argv[1]).startsWith('story-brief')) main()
