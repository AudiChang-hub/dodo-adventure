// 劇本自動檢查（G-9，docs/成長系統設計.md §3.8）：不合格的劇本擋下來，印出中文原因。規則在 scripts/story/rules.ts。
//
// 用法：
//   npx tsx scripts/check-story.ts 劇本.json …        檢查草稿（每週流程寫出來的、或人貼進來的）
//   npx tsx scripts/check-story.ts --builtin          檢查 App 裡已經有的故事（手寫的示範＋審稿佇列）
//   npx tsx scripts/check-story.ts --fixtures         驗收：故意寫壞的劇本（scripts/fixtures/story/bad/）每一份都要擋下，手寫的示範要全部通過
// 參數：
//   --learner 學習快照.json   孩子學過哪些字（家長區「故事審稿」→「下載學習快照」）；預設讀 scripts/.cache/learner.json，沒有就把 App 教得到的字都當學過
//   --private 名字,幼兒園     另外不能出現的個人資料（.env.local 的孩子名字、STORY_PRIVATE_WORDS 會自動加進來）
// 有任何問題（不含只提醒的）就以 1 結束。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { ARCS, CLASSICS, WEEKLY, draftChapters, draftId, normalizeDraft, weeklyOf, type StoryDraft } from '../src/content/story'
import { CATEGORY_ZH, checkChapter, checkDraft, loadLearner, privateWordsFromEnv, type Category, type CheckOpts, type Problem } from './story/rules'

export const LEARNER_CACHE = 'scripts/.cache/learner.json'

export function readDraft(path: string): { draft: StoryDraft; raw: string } {
  const raw = readFileSync(path, 'utf8')
  let d: StoryDraft
  try {
    d = JSON.parse(raw)
  } catch (e) {
    throw new Error(`${path} 不是正確的 JSON：${(e as Error).message}`)
  }
  return { draft: normalizeDraft(d), raw }
}

/** 一份劇本的問題（劇本格式壞到展不開也回傳一個格式問題，不丟例外） */
export function problemsOf(d: StoryDraft, opts: CheckOpts, raw?: string): Problem[] {
  try {
    return checkDraft(d, opts, raw)
  } catch (e) {
    return [{ cat: 'format', chapter: null, msg: `劇本的格式看不懂：${(e as Error).message}` }]
  }
}

const chName = (id: string | null) => {
  if (!id) return '整份'
  const m = id.match(/-c(\d+)$/)
  return m ? `第 ${m[1]} 章` : '這一章'
}

export function formatProblems(ps: Problem[]): string {
  return ps
    .map((p) => `  ${p.warn ? '△' : '✗'} [${CATEGORY_ZH[p.cat]}] ${chName(p.chapter)}${p.where ? ` ${p.where}` : ''}：${p.msg}`)
    .join('\n')
}

export const blocking = (ps: Problem[]) => ps.filter((p) => !p.warn)

function args() {
  const a = process.argv.slice(2)
  const opt = (k: string) => {
    const i = a.indexOf(k)
    return i >= 0 ? a.splice(i, 2)[1] : undefined
  }
  const flag = (k: string) => {
    const i = a.indexOf(k)
    return i >= 0 ? (a.splice(i, 1), true) : false
  }
  return { learner: opt('--learner'), priv: opt('--private'), builtin: flag('--builtin'), fixtures: flag('--fixtures'), files: a }
}

function main() {
  const a = args()
  const { learner, from } = loadLearner(a.learner ?? (existsSync(LEARNER_CACHE) ? LEARNER_CACHE : undefined))
  const privateWords = [...privateWordsFromEnv(), ...(a.priv ?? '').split(',').map((x) => x.trim()).filter(Boolean)]
  const opts: CheckOpts = { learner, privateWords, draft: true }
  console.log(`學過的字：${from}`)
  let bad = 0

  // App 裡已經有的故事：手寫的示範（不用中文對照）＋審稿佇列（要）
  const builtin = () => {
    for (const arc of ARCS.filter((x) => !weeklyOf(x.chapters[0]?.id ?? ''))) {
      const prior = new Set<string>()
      const ps = blocking(arc.chapters.flatMap((c) => checkChapter(c, { ...opts, draft: false }, {}, prior)))
      console.log(`${ps.length ? '✗' : '✓'} 手寫 ${arc.id}〈${arc.zh}〉${arc.chapters.length} 章${ps.length ? `：${ps.length} 個問題\n${formatProblems(ps)}` : ''}`)
      if (ps.length) bad++
    }
    for (const c of CLASSICS.filter((x) => !weeklyOf(x.chapter.id))) {
      const ps = blocking(checkChapter(c.chapter, { ...opts, draft: false }, { cast: ['Rabbit', 'Turtle'].filter((n) => c.id === 'A01' && n) }))
      console.log(`${ps.length ? '✗' : '✓'} 手寫 故事時間 ${c.id}〈${c.zh}〉${ps.length ? `：${ps.length} 個問題\n${formatProblems(ps)}` : ''}`)
      if (ps.length) bad++
    }
    for (const d of WEEKLY) {
      const ps = blocking(problemsOf(d, opts))
      console.log(`${ps.length ? '✗' : '✓'} 審稿佇列 ${draftId(d)}（${draftChapters(d).length} 章）${ps.length ? `：${ps.length} 個問題\n${formatProblems(ps)}` : ''}`)
      if (ps.length) bad++
    }
  }

  if (a.fixtures) {
    // 驗收用固定的範例學習快照（虛構的孩子），結果不會跟著真的學習進度變
    opts.learner = loadLearner('scripts/fixtures/story/learner.sample.json').learner
    console.log('fixtures 用範例學習快照 scripts/fixtures/story/learner.sample.json')
    const dir = 'scripts/fixtures/story/bad'
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    const covered = new Set<Category>()
    console.log(`\n── 故意寫壞的劇本（${files.length} 份，每一份都要擋下）──`)
    for (const f of files) {
      const { draft, raw } = readDraft(join(dir, f))
      const expect = (JSON.parse(raw) as { expect?: Category[] }).expect ?? []
      // 真名的 fixture 用一個假的名字代替孩子的真名（repo 裡不能有真名）
      const fake = (JSON.parse(raw) as { fakePrivate?: string[] }).fakePrivate ?? []
      const ps = blocking(problemsOf(draft, { ...opts, privateWords: [...privateWords, ...fake] }, raw))
      const got = new Set(ps.map((p) => p.cat))
      const miss = expect.filter((c) => !got.has(c))
      expect.forEach((c) => got.has(c) && covered.add(c))
      if (!ps.length || miss.length) bad++
      console.log(`${ps.length && !miss.length ? '✓ 擋下' : '✗ 沒擋下'} ${basename(f)}（該擋：${expect.map((c) => CATEGORY_ZH[c]).join('、')}${miss.length ? `；漏了：${miss.map((c) => CATEGORY_ZH[c]).join('、')}` : ''}）`)
      console.log(formatProblems(ps))
    }
    const all = Object.keys(CATEGORY_ZH) as Category[]
    const notCovered = all.filter((c) => c !== 'format' && !covered.has(c))
    if (notCovered.length) {
      bad++
      console.log(`✗ 沒有 fixture 驗到：${notCovered.map((c) => CATEGORY_ZH[c]).join('、')}`)
    }
    console.log('\n── App 裡已經有的故事（要全部通過）──')
    builtin()
  }
  if (a.builtin) builtin()

  for (const f of a.files) {
    const { draft, raw } = readDraft(f)
    const ps = problemsOf(draft, opts, raw)
    const b = blocking(ps)
    console.log(`${b.length ? '✗' : '✓'} ${f}${ps.length ? `：${b.length} 個問題${ps.length > b.length ? `、${ps.length - b.length} 個提醒` : ''}\n${formatProblems(ps)}` : ''}`)
    if (b.length) bad++
  }
  if (!a.files.length && !a.builtin && !a.fixtures) {
    console.log('用法：npx tsx scripts/check-story.ts 劇本.json … ｜ --builtin ｜ --fixtures')
    process.exit(2)
  }
  if (bad) {
    console.log(`\n✗ ${bad} 份不合格`)
    process.exit(1)
  }
  console.log('\n✓ 全部合格')
}

if (process.argv[1] && basename(process.argv[1]).startsWith('check-story')) main()
