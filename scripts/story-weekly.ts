// 每週故事流程（G-9，docs/成長系統設計.md §3.6.4）：
//   寫作簡報（story-brief）→ 寫劇本（AI 或人貼進來）→ 自動檢查（check-story）→ 不合格就帶著原因退回重寫（最多 3 次）
//   → 放進審稿佇列（src/content/story/weekly/）→ 打包新用到的圖示 → 產生語音（edge-tts 的 Ana，跟現有流程一樣）。
// 之後 PM 照平常的流程 build、deploy；家長在家長區「故事審稿」逐章試聽，按通過（或退回並寫一句原因）。只有通過的章節會進孩子端。
//
// 用法（在 repo 根目錄，PM 手動或用 Windows 工作排程器每週日晚上跑）：
//   npx tsx scripts/story-weekly.ts --writer claude                 用 Claude Code（claude -p）寫劇本；不需要在 repo 放任何金鑰
//   npx tsx scripts/story-weekly.ts --writer "cmd:<指令>"           任何會從 stdin 讀簡報、在 stdout 印出劇本 JSON 的指令
//   npx tsx scripts/story-weekly.ts --writer paste                  人寫：簡報寫好就停下來，把劇本存成提示的檔名後再跑一次同一個指令
//   npx tsx scripts/story-weekly.ts --writer file:a.json,b.json     用現成的劇本（第 1 次用 a、退回重寫用 b…；驗收、測試用）
// 其他參數：
//   --what arc|classic|both|feedback（預設 both；feedback 只重寫家長退回的）、--arc 3、--classic J02：寫哪一篇、哪一則
//   --feedback 審稿結果.json：家長在審稿頁「匯出審稿結果」的檔案；退回的章節照家長的原因重寫（只重寫退回的那份劇本）
//   --learner 學習快照.json（預設 scripts/.cache/learner.json）、--week 2026-11-02、--max 3（最多寫幾次）
//   --no-audio：不產生語音（沒有網路、沒有 Python 時）；之後再跑 npm run audio
// 結束碼：0 全部進佇列；1 有劇本寫了 3 次還不合格（沒放進佇列）；3 等人貼劇本（--writer paste）
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { WEEKLY, draftChapters, draftId, normalizeDraft, weeklyById, type StoryDraft } from '../src/content/story'
import { CATEGORY_ZH, loadLearner, privateWordsFromEnv, type CheckOpts, type Problem } from './story/rules'
import { loadWorld } from './story/world'
import { blocking, formatProblems, problemsOf } from './check-story'
import { arcBrief, classicBrief, mondayOf, writeBrief, writtenIds, LEARNER_CACHE, type BriefOpts } from './story-brief'

const QUEUE = 'src/content/story/weekly'
const EMOJI_FILE = 'src/art/emoji.generated.ts'

// ── 參數 ─────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const opt = (k: string) => {
  const i = argv.indexOf(k)
  return i >= 0 ? argv[i + 1] : undefined
}
const flag = (k: string) => argv.includes(k)
const writer = opt('--writer') ?? 'paste'
const what = opt('--what') ?? 'both'
const MAX = Number(opt('--max') ?? 3)
const week = opt('--week') ?? mondayOf()
const out = opt('--out') ?? join('scripts/.cache/story', week)
mkdirSync(out, { recursive: true })

const log: string[] = []
const say = (s: string) => {
  console.log(s)
  log.push(s)
}

// ── 寫劇本的人 ───────────────────────────────────────────────

/** 從 AI 的回覆裡拿出 JSON（可能包在 ```json 裡、前後有說明） */
export function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  const body = fence ? fence[1] : text
  const a = body.indexOf('{')
  const b = body.lastIndexOf('}')
  if (a < 0 || b < a) throw new Error('回覆裡找不到 JSON')
  return body.slice(a, b + 1)
}

/**
 * 寫一次劇本。回傳劇本的文字；paste 模式還沒貼進來時回傳 null。
 * - claude：Claude Code 的非互動模式（claude -p），用家長電腦上已登入的 Claude 帳號，repo 裡不放任何金鑰
 * - cmd:<指令>：簡報從 stdin 進去、劇本從 stdout 出來（例如自己寫的 API 呼叫腳本，金鑰放在環境變數）
 * - file:a.json,b.json：第 n 次用第 n 個檔（超過就用最後一個）
 * - paste：人寫。劇本存成 draft-<id>-<n>.json 之後再跑一次
 */
function write(id: string, attempt: number, briefPath: string): string | null {
  const draftPath = join(out, `draft-${id}-${attempt}.json`)
  if (existsSync(draftPath)) return readFileSync(draftPath, 'utf8')
  const brief = readFileSync(briefPath, 'utf8')
  let text: string
  if (writer === 'paste') {
    say(`  ⏸ 等人寫劇本：照簡報 ${briefPath} 寫好，存成 ${draftPath}，再跑一次同一個指令`)
    return null
  } else if (writer.startsWith('file:')) {
    // 只用 id 對得上這一份的檔案（同一個指令可以給長篇和故事時間各自的檔案）
    const all = writer.slice(5).split(',')
    const idOf = (f: string) => {
      try {
        const j = JSON.parse(readFileSync(f, 'utf8'))
        return j.type === 'arc' ? j.arc?.id : j.classic?.id
      } catch {
        return null
      }
    }
    const mine = all.filter((f) => idOf(f) === id.replace(/-r\d+$/, ''))
    const files = mine.length ? mine : all
    const f = files[Math.min(attempt, files.length) - 1]
    text = readFileSync(f, 'utf8')
    say(`  ✎ 第 ${attempt} 次：用現成的劇本 ${f}`)
  } else {
    const cmd = writer === 'claude' ? 'claude -p --output-format text' : writer.startsWith('cmd:') ? writer.slice(4) : null
    if (!cmd) throw new Error(`不認得的 --writer ${writer}（claude、cmd:<指令>、paste、file:<檔案>）`)
    say(`  ✎ 第 ${attempt} 次：${cmd}`)
    const r = spawnSync(cmd, { input: brief, encoding: 'utf8', shell: true, maxBuffer: 20 * 1024 * 1024, timeout: 15 * 60_000 })
    if (r.status !== 0) throw new Error(`寫劇本的指令失敗（${r.status}）：${(r.stderr || r.error?.message || '').slice(0, 500)}`)
    text = extractJson(r.stdout)
  }
  writeFileSync(draftPath, text)
  return text
}

// ── 審稿佇列 ─────────────────────────────────────────────────

/** 依資料夾裡的 JSON 重寫 index.ts（照週、id 排） */
function writeIndex() {
  const files = readdirSync(QUEUE).filter((f) => f.endsWith('.json'))
  const ds = files.map((f) => ({ f, d: JSON.parse(readFileSync(join(QUEUE, f), 'utf8')) as StoryDraft }))
  ds.sort((a, b) => (a.d.week < b.d.week ? -1 : a.d.week > b.d.week ? 1 : a.f < b.f ? -1 : 1))
  const ident = (f: string) => '_' + f.replace(/\.json$/, '').replace(/[^A-Za-z0-9]/g, '_')
  writeFileSync(
    join(QUEUE, 'index.ts'),
    `// 審稿佇列：每週自動產生的劇本（由 scripts/story-weekly.ts 產生這個檔案，不要手改）。
// 每一份劇本是同一個資料夾裡的 JSON；家長在家長區「故事審稿」通過的章節才會進孩子端（lib/review.ts）。
import type { StoryDraft } from '../draft'
${ds.map(({ f }) => `import ${ident(f)} from './${f}'`).join('\n')}

export const WEEKLY_DRAFTS: StoryDraft[] = [${ds.map(({ f }) => `${ident(f)} as unknown as StoryDraft`).join(', ')}]
`,
  )
}

const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })

/** 放進佇列、打包圖示、產生語音；失敗就整個退回原樣 */
function enqueue(d: StoryDraft, warnPics: boolean): boolean {
  const id = draftId(d)
  const file = join(QUEUE, `${id}.json`)
  const backup = { index: readFileSync(join(QUEUE, 'index.ts'), 'utf8'), emoji: readFileSync(EMOJI_FILE, 'utf8'), draft: existsSync(file) ? readFileSync(file, 'utf8') : null }
  const rollback = (why: string) => {
    say(`  ✗ ${why}，佇列退回原樣`)
    writeFileSync(join(QUEUE, 'index.ts'), backup.index)
    writeFileSync(EMOJI_FILE, backup.emoji)
    if (backup.draft == null) rmSync(file, { force: true })
    else writeFileSync(file, backup.draft)
    return false
  }
  // 佇列裡只放劇本本身（不放驗收用的欄位）
  const { expect: _e, why: _w, fakePrivate: _f, ...clean } = d as StoryDraft & Record<string, unknown>
  writeFileSync(file, JSON.stringify({ ...clean, week: d.week || week }, null, 1) + '\n')
  writeIndex()
  if (warnPics) {
    say('  ⚙ 打包新用到的圖示（scripts/build-emoji.ts）')
    if (run('npx', ['tsx', 'scripts/build-emoji.ts']).status !== 0) return rollback('打包圖示失敗')
  }
  if (flag('--no-audio')) {
    say('  ⚠ 沒有產生語音（--no-audio）：上線前要跑 npm run audio')
    return true
  }
  say('  ⚙ 產生語音（extract-phrases → gen_audio.py --only，edge-tts 的 Ana）')
  if (run('npx', ['tsx', 'scripts/extract-phrases.ts']).status !== 0) return rollback('整理台詞失敗')
  const prefixes = draftChapters(d).map((c) => `story.${c.id}.`)
  if (run('python', ['scripts/gen_audio.py', '--only', ...prefixes]).status !== 0) return rollback('產生語音失敗（有缺檔）')
  return true
}

// ── 主流程 ───────────────────────────────────────────────────

interface Job {
  type: 'arc' | 'classic'
  /** 新寫（brief 決定 id）或重寫佇列裡的某一份 */
  redoOf?: StoryDraft
  parent?: { chapter: string; reason: string }[]
}

function main() {
  const lp = opt('--learner') ?? (existsSync(LEARNER_CACHE) ? LEARNER_CACHE : undefined)
  const { learner, from } = loadLearner(lp)
  const world = loadWorld()
  const check: CheckOpts = { learner, privateWords: privateWordsFromEnv(), draft: true }
  say(`# 每週故事流程 ${week}（寫劇本：${writer}；學過的字：${from}）`)

  const jobs: Job[] = []
  // 家長退回的：照原因重寫那一份劇本
  const fb = opt('--feedback')
  if (fb) {
    const ex = JSON.parse(readFileSync(fb, 'utf8')) as { kind: string; verdicts: { id: string; ok: boolean; reason?: string; current: boolean }[] }
    if (ex.kind !== 'story-review') throw new Error(`${fb} 不是審稿結果（家長區「故事審稿」→「匯出審稿結果」）`)
    const byDraft = new Map<string, { chapter: string; reason: string }[]>()
    for (const v of ex.verdicts.filter((x) => !x.ok && x.current)) {
      const d = WEEKLY.find((x) => draftChapters(x).some((c) => c.id === v.id))
      if (!d) continue
      byDraft.set(draftId(d), [...(byDraft.get(draftId(d)) ?? []), { chapter: v.id, reason: v.reason ?? '（沒寫原因）' }])
    }
    for (const [id, parent] of byDraft) {
      const d = weeklyById(id)!
      jobs.push({ type: d.type, redoOf: d, parent })
    }
    say(`家長退回：${byDraft.size ? [...byDraft.entries()].map(([id, p]) => `${id}（${p.length} 章）`).join('、') : '沒有'}`)
  }
  // --what feedback：只重寫家長退回的，不寫新的
  if (what !== 'feedback') {
    if (what !== 'classic') jobs.push({ type: 'arc' })
    if (what !== 'arc') jobs.push({ type: 'classic' })
  }

  let failed = 0
  let waiting = 0
  for (const job of jobs) {
    const bo: BriefOpts = {
      learner,
      learnerFrom: from,
      week,
      out,
      world,
      arcNo: opt('--arc') ? Number(opt('--arc')) : undefined,
      classicId: opt('--classic'),
    }
    if (job.redoOf) {
      bo.arcNo = job.redoOf.type === 'arc' ? job.redoOf.arc.no : undefined
      bo.classicId = job.redoOf.type === 'classic' ? job.redoOf.classic.id : undefined
    }
    const first = job.type === 'arc' ? arcBrief(bo) : classicBrief(bo)
    const id = first.meta.id
    say(`\n## ${job.type === 'arc' ? '長篇' : '故事時間'} ${id}〈${first.meta.title}〉${job.redoOf ? '：家長退回，重寫' : ''}`)
    if (!job.redoOf && writtenIds().has(id) && !flag('--force')) {
      say(`  已經寫好了（手寫的或審稿佇列裡已經有 ${id}），跳過；要重寫用 --force`)
      continue
    }
    let redo: BriefOpts['redo'] = job.redoOf ? { attempt: 1, previous: readFileSync(join(QUEUE, `${id}.json`), 'utf8'), parent: job.parent } : undefined
    const tag = job.redoOf ? `-r${job.redoOf.rev + 1}` : ''
    let done: StoryDraft | null = null
    let warnPics = false
    for (let n = 1; n <= MAX; n++) {
      // 第幾版：新寫的第 n 次就是第 n 版；家長退回重寫的，第 1 次已經是第 2 版
      const ro = redo && { ...redo, attempt: n + (job.redoOf ? 1 : 0) }
      const brief = writeBrief({ ...bo, redo: ro }, job.type === 'arc' ? arcBrief({ ...bo, redo: ro }) : classicBrief({ ...bo, redo: ro }), n > 1 || tag ? `${tag}-${n}` : '')
      say(`  簡報：${brief.path}`)
      const text = write(`${id}${tag}`, n, brief.path)
      if (text == null) {
        waiting++
        break
      }
      let d: StoryDraft
      let ps: Problem[]
      try {
        d = normalizeDraft(JSON.parse(text))
        ps = problemsOf(d, check, text)
        if (draftId(d) !== id) ps.push({ cat: 'format', chapter: null, msg: `這次要寫的是 ${id}，劇本的 id 是 ${draftId(d)}` })
        if (job.redoOf && d.rev <= job.redoOf.rev) ps.push({ cat: 'format', chapter: null, msg: `重寫的版本 rev 要比上一版（${job.redoOf.rev}）大`, warn: true })
      } catch (e) {
        d = null as never
        ps = [{ cat: 'format', chapter: null, msg: `不是正確的 JSON：${(e as Error).message}` }]
      }
      const b = blocking(ps)
      if (!b.length) {
        if (job.redoOf && d.rev <= job.redoOf.rev) d = { ...d, rev: job.redoOf.rev + 1 }
        say(`  ✓ 第 ${n} 次：check-story 通過${ps.length ? `（${ps.length} 個提醒）` : ''}`)
        warnPics = ps.some((p) => p.warn && p.msg.includes('還沒打包'))
        done = d
        break
      }
      const cats = [...new Set(b.map((p) => CATEGORY_ZH[p.cat]))].join('、')
      say(`  ✗ 第 ${n} 次：check-story 擋下 ${b.length} 個問題（${cats}）${n < MAX ? '，帶著原因退回重寫' : ''}`)
      say(formatProblems(b))
      redo = { attempt: n + 1, previous: text, problems: b, parent: job.parent }
    }
    if (!done) {
      if (!waiting) {
        failed++
        say(`  ✗ 寫了 ${MAX} 次還不合格，沒有放進審稿佇列（這週孩子講通用章節，故事不會斷）`)
      }
      continue
    }
    if (enqueue(done, warnPics)) say(`  ✓ 放進審稿佇列：${QUEUE}/${id}.json（${draftChapters(done).length} 章${done.type === 'classic' && done.classic.faith ? `，宗教經典 ${done.classic.faith}：家長要逐章通過` : ''}）`)
    else failed++
  }

  say(`\n## 下一步`)
  if (waiting) say(`- 有 ${waiting} 份劇本等人寫（看上面的檔名），寫好之後再跑一次同一個指令。`)
  say('- PM：npx tsc -b、npm run test:toddler -- --quick，commit 之後 npm run deploy。')
  say('- 家長：家長區「故事審稿」逐章試聽，按通過，或退回並寫一句原因。退回的用「匯出審稿結果」存檔，下次跑 --feedback 那個檔。')
  writeFileSync(join(out, 'report.md'), log.join('\n') + '\n')
  console.log(`\n報告：${join(out, 'report.md')}`)
  process.exit(failed ? 1 : waiting ? 3 : 0)
}

if (process.argv[1] && basename(process.argv[1]).startsWith('story-weekly')) main()
