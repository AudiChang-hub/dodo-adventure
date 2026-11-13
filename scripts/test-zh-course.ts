// 中文課文的排課（src/lessons/chinese/course.ts、一堂的每一步 steps.ts）、聊一聊（data.ts 的 talkOf）、中文課不出聲。
// 排課（T-136，家長 2026-11-11：一天兩篇，一舊一新）：每次換新的一篇、舊篇是 3 次前那篇、小複習是前 1 次和前 7 次的、跳過的日子不往前、
// 同一天再進來還是同一次、家長挑的那篇當今天的新篇、跳過舊篇不卡住、已存的進度和舊版（照日期）的進度接得上。對照 docs/全球幼教指引-現況對照.md A3。
// 執行：npx tsx scripts/test-zh-course.ts（npm run verify 的「單元：中文課文每篇 3 次」）
import assert from 'node:assert/strict'
import { LEGACY, OLD_BACK, REVIEW_BACK, RUNS_PER_TEXT, applyPick, current, finishRun, logSession, migrate, nextDay, planOf, reviewDone, seedLog, undoPick, type Course, type OldMark, type Session } from '../src/lessons/chinese/course'
import { stepsOf } from '../src/lessons/chinese/steps'
import { enTodayOf, type EnSkip, type Heard } from '../src/screens/story/en-pages'
import { ZH_RUN_MAX, zhRunKV, zhRunToday } from '../tests/ai-toddler/lib/zh-run'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ZH_TEXTS, linePics, plain, questionsOf, talkFor, talkOf, type ZhText } from '../src/lessons/chinese/data'
import { FAR, GLYPH_START, NEAR_MAX, afterGlyph, charOf, glyphPool, glyphQuestion, glyphSim, needsDemo, type GlyphQuestion, type GlyphState } from '../src/lessons/chinese/match'

/** 固定的亂數（同一個 seed 每次一樣） */
const rng = (seed: number) => {
  let x = seed >>> 0 || 1
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

/**
 * 找一樣的字的一題有什麼不對（不教不考、選項數、像不像）：
 * - 答案是這一篇紅字詞裡的字；干擾字都在這一篇課文裡（念課文時整篇都在畫面上），不是答案那個詞裡的字，選項不重複；
 * - 第 1 級 2 個選項，其他 3 個；
 * - 第 1、2 級的干擾字「差很多」：重疊 < FAR，或課文裡最不像的 3 個之一，而且不超過 0.5；第 3 級都不超過 NEAR_MAX。
 */
function glyphBad(t: ZhText, q: GlyphQuestion): string[] {
  const out: string[] = []
  const text = new Set(t.lines.map(plain).join(''))
  if (!t.redWords.includes(q.word) || ![...q.word].includes(q.char)) out.push(`答案「${q.char}」不是紅字裡的字`)
  const ds = q.options.slice(1)
  if (q.options[0] !== q.char) out.push('答案不在第一個')
  if (new Set(q.options).size !== q.options.length) out.push(`選項重複：${q.options.join('')}`)
  if (q.options.length !== (q.level === 1 ? 2 : 3)) out.push(`第 ${q.level} 級有 ${q.options.length} 個選項`)
  const least = new Set(
    glyphPool(t, q.word)
      .map((c) => ({ c, s: glyphSim(q.char, c)! }))
      .sort((a, b) => a.s - b.s)
      .slice(0, 3)
      .map((x) => x.c),
  )
  for (const d of ds) {
    if (!text.has(d)) out.push(`干擾字「${d}」不在這一篇課文裡（沒教就考）`)
    if ([...q.word].includes(d)) out.push(`干擾字「${d}」是答案那個詞（${q.word}）裡的字`)
    const s = glyphSim(q.char, d)
    if (s == null) out.push(`干擾字「${d}」沒有字形資料`)
    else if (s > NEAR_MAX) out.push(`干擾字「${d}」跟「${q.char}」太像（${s.toFixed(2)}）`)
  }
  const far = (d: string) => {
    const s = glyphSim(q.char, d) ?? 1
    return (s < FAR || least.has(d)) && s <= 0.5
  }
  if (q.level < 3 && !ds.every(far)) out.push(`第 ${q.level} 級的干擾字不夠不像：${ds.map((d) => `${d} ${glyphSim(q.char, d)?.toFixed(2)}`).join('、')}`)
  if (q.level === 3 && !ds.some(far)) out.push('第 3 級至少要有一個差很多的字')
  return out
}

const D = (i: number) => {
  const d = new Date(Date.UTC(2026, 10, 3 + i))
  return d.toISOString().slice(0, 10)
}

/** 一次課：進課看今天的排課（新篇、舊篇、小複習）；上完的話記下（progress.ts 的 markDone 做的事：排課換篇、上課紀錄多一筆） */
function session(c: Course, log: Session[], date: string, finish = true) {
  const p = planOf(c, log, date)
  return finish ? { p, c: finishRun(c, p.day, date), log: logSession(log, p.day, date) } : { p, c, log }
}

const textOf = (d: number) => ZH_TEXTS.find((t) => t.day === d)!

/** 這一堂的每一步（Lesson.tsx 照著走） */
const stepsFor = (p: { day: number; n: number; old: number | null; review: number[] }, log: Session[], seed = 1) =>
  stepsOf({ t: textOf(p.day), n: p.n, old: p.old == null ? null : textOf(p.old), review: p.review.map(textOf) }, new Set(log.map((s) => s.day)), GLYPH_START, rng(seed))

/** 一篇當新篇上的時候有哪幾步（念課文、選圖、找字）：舊篇要跟它一模一樣 */
const lessonKinds = (day: number, done: ReadonlySet<number>) =>
  stepsOf({ t: textOf(day), n: 1, old: null, review: [] }, done, GLYPH_START, rng(1))
    .filter((s) => s.part === 'new')
    .map((s) => s.k)

function main() {
  const first = ZH_TEXTS[0].day
  assert.equal(RUNS_PER_TEXT, 1, '每上一次就換新的一篇')
  // ── 連續 30 次課：中間有沒上的日子、家長挑篇、跳過舊篇 ─────────────
  {
    let c: Course = { day: first, runs: [] }
    let log: Session[] = []
    const skip = new Set([4, 9, 10, 17, 25, 26, 27])
    /** 家長在第幾天挑了哪一篇（挑的那篇當今天的新篇） */
    const picks = new Map([[12, 40], [30, 120]])
    /** 這幾次課大人跳過舊篇 */
    const skipOld = new Set([6, 15])
    /** 英文故事每一篇聽完的日期（en-book 的 heard）、大人跳過的舊篇 */
    const heard: Heard = {}
    let enSkip: EnSkip | undefined
    const lines: string[] = []
    const news: number[] = []
    let i = 0
    for (let d = 0; news.length < 30; d++) {
      if (skip.has(d)) {
        lines.push(`${D(d)} 沒上`)
        continue
      }
      if (picks.has(d)) c = applyPick(c, picks.get(d)!, D(d))
      // 進來一次沒上完就離開、再進來：同一次
      const a = session(c, log, D(d), false).p
      const x = session(c, log, D(d))
      const again = session(x.c, x.log, D(d), false).p
      assert.deepEqual([again.day, again.old, again.review], [a.day, a.old, a.review], `${D(d)} 上完再進來還是同一次`)
      assert.deepEqual([x.p.day, x.p.old, x.p.review], [a.day, a.old, a.review], `${D(d)} 上之前、上之後一樣`)
      const p = x.p
      assert.equal(p.idx, i, `第 ${i + 1} 次課`)
      if (picks.has(d)) assert.equal(p.day, picks.get(d), '家長挑的那篇就是今天的新篇')
      // 每次都是新篇（沒上過的）
      assert.ok(!news.includes(p.day), `第 ${i + 1} 次課的新篇（第 ${p.day} 篇）上過了`)
      // 舊篇＝3 次前那次課的新篇；前 3 次沒有舊篇
      assert.equal(p.old, i >= OLD_BACK ? news[i - OLD_BACK] : null, `第 ${i + 1} 次課的舊篇`)
      // 小複習＝前 1 次、前 7 次那兩次課的新篇（那一次還沒有就略過）
      const want = REVIEW_BACK.filter((k) => i - k >= 0).map((k) => news[i - k])
      assert.deepEqual(p.review, want, `第 ${i + 1} 次課的小複習`)
      // 這一堂的每一步：舊篇（跟它當新篇上的時候一模一樣）→ 新篇 → 小複習每篇一題
      const steps = stepsFor(p, log, i + 1)
      const parts = steps.map((s) => `${s.part}:${s.k}`)
      const old = steps.filter((s) => s.part === 'old')
      const done = new Set(log.map((s) => s.day))
      if (p.old != null) {
        assert.deepEqual(old.map((s) => s.k), lessonKinds(p.old, done), `舊篇跟原本的課一樣：${parts.join(' ')}`)
        assert.ok(old.every((s) => s.t.day === p.old))
      } else assert.equal(old.length, 0)
      assert.deepEqual(steps.filter((s) => s.part === 'new').map((s) => s.k), lessonKinds(p.day, done), '新篇是完整的一堂')
      const fresh = steps.filter((s) => s.part === 'new')
      assert.deepEqual([fresh[0].k, fresh[fresh.length - 1].k], ['read', 'glyph'], `新篇完整：${parts.join(' ')}`)
      assert.ok(fresh.every((s) => s.t.day === p.day))
      const rev = steps.filter((s) => s.part === 'review')
      assert.deepEqual(rev.map((s) => s.t.day), p.review, '小複習每篇一題')
      assert.ok(rev.every((s) => s.k === 'quiz' || s.k === 'glyph'), '小複習用現有的題型')
      // 順序：舊篇 → 新篇 → 小複習
      assert.deepEqual([...new Set(steps.map((s) => s.part))], [...(old.length ? ['old'] : []), 'new', ...(rev.length ? ['review'] : [])])
      // 跳過舊篇：直接到新篇的第一步（念課文），新篇照常上完
      if (skipOld.has(i) && p.old != null) {
        const to = steps.findIndex((s) => s.part !== 'old')
        assert.ok(to > 0 && steps[to].part === 'new' && steps[to].k === 'read', '跳過舊篇到新篇的念課文')
      }
      // 英文故事（screens/story/en-pages.ts 的 enTodayOf，跟中文課用同一份排課）：先講舊篇、聽完（或大人跳過）講新篇，結尾小題一樣
      const date = D(d)
      const e1 = enTodayOf(p, heard, enSkip, date)
      assert.deepEqual([e1.day, e1.part], p.old != null ? [p.old, 'old'] : [p.day, 'new'], `${date} 英文故事先講的跟中文課的舊篇一樣`)
      if (e1.part === 'old') {
        if (skipOld.has(i)) enSkip = { date, day: e1.day }
        else (heard[e1.day] ??= []).push(date)
      }
      const e2 = enTodayOf(p, heard, enSkip, date)
      assert.deepEqual([e2.day, e2.part, e2.isNew, e2.review], [p.day, 'new', true, p.review], `${date} 英文故事接著講的跟中文課的新篇、小複習一樣`)
      ;(heard[e2.day] ??= []).push(date)
      const e3 = enTodayOf(p, heard, enSkip, date)
      assert.deepEqual([e3.day, e3.isNew], [p.day, false], `${date} 英文故事兩篇都聽完：今天的書是新篇、聽過了`)
      c = x.c
      log = x.log
      news.push(p.day)
      lines.push(`${D(d)} 第 ${i + 1} 次：新〈${textOf(p.day).title}〉第 ${p.day} 篇${p.old != null ? `・舊第 ${p.old} 篇${skipOld.has(i) ? '（跳過）' : ''}` : ''}${p.review.length ? `・小複習 ${p.review.join('、')}` : ''}`)
      i++
    }
    // 跳過舊篇不影響排課：下一次照樣換新篇、舊篇照紀錄
    assert.equal(log.length, 30)
    console.log('ok 1 連續 30 次課（跳過 7 天、家長挑 2 次、跳過舊篇 2 次）：每次新篇、舊篇是 3 次前那篇（流程跟新篇一樣）、小複習是前 1 次和前 7 次的，同一天再進來還是同一次；英文故事每次的舊篇、新篇、小題都跟中文課一樣\n   ' + lines.join('\n   '))
  }
  {
    // 跳過的日子不往前；隔了好幾天沒上：下一次是下一篇
    let c: Course = { day: first, runs: [] }
    let log: Session[] = []
    ;({ c, log } = session(c, log, D(0)))
    const p = session(c, log, D(9), false).p
    assert.deepEqual([p.day, p.idx, p.old], [nextDay(first), 1, null])
    console.log('ok 2 隔了好幾天沒上：照上過幾次換下一篇，不照日期跳')
  }
  {
    // 家長挑篇：上完挑的那篇，回到原本排到的那篇（它還沒上）；舊篇、小複習照實際上過的紀錄
    let c: Course = { day: first, runs: [] }
    let log: Session[] = []
    for (const d of [0, 1, 2, 3]) ({ c, log } = session(c, log, D(d)))
    // 第 5 次課本來是第 5 篇；家長挑第 40 篇
    c = applyPick(c, 40, D(4))
    let x = session(c, log, D(4))
    assert.deepEqual([x.p.day, x.p.old, x.p.review], [40, ZH_TEXTS[1].day, [ZH_TEXTS[3].day]])
    ;({ c, log } = x)
    x = session(c, log, D(5), false)
    assert.deepEqual([x.p.day, x.p.old, x.p.review], [ZH_TEXTS[4].day, ZH_TEXTS[2].day, [40]], '挑的上完回到原本排到的那篇；前 1 次是挑的那篇')
    // 今天挑了又改挑、又改回來
    let y = applyPick(c, 41, D(5))
    y = applyPick(y, 42, D(5))
    assert.equal(session(y, log, D(5), false).p.day, 42)
    y = undoPick(y, D(5))
    assert.equal(session(y, log, D(5), false).p.day, ZH_TEXTS[4].day)
    // 昨天挑的改不回來
    const z = applyPick(c, 41, D(5))
    assert.equal(undoPick(z, D(6)), z)
    // 今天上完了又挑一篇再上：今天的紀錄換成挑的那篇（一天一筆）
    ;({ c, log } = session(c, log, D(5)))
    c = applyPick(c, 50, D(5))
    ;({ c, log } = session(c, log, D(5)))
    assert.deepEqual(log[log.length - 1], { date: D(5), day: 50 })
    assert.equal(log.length, 6)
    console.log('ok 3 家長挑的那篇當今天的新篇，上完回到原本那篇；舊篇、小複習照實際上過的；同一天可改挑、改回')
  }
  // ── 已存的進度不轉換 ─────────────────────────────
  {
    // 舊規則上到第 1、2 次的那篇：下一次就換新篇
    for (const runs of [[D(0)], [D(0), D(1)], [D(0), D(1), D(2)]]) {
      const c: Course = { day: 5, runs }
      assert.deepEqual([current(c, D(9)).day, current(c, D(9)).n], [6, 1], `上過 ${runs.length} 次 → 下一次換第 6 篇`)
      // 今天上過的：今天再進來還是它
      assert.equal(current(c, runs[runs.length - 1]).day, 5)
    }
    // 沒有上課紀錄：上過的篇照篇數排，一篇算一次課；今天上完的那篇記今天
    const log = seedLog([3, 1, 2, 5, 4], { day: 5, runs: [D(0)] }, D(0))
    assert.deepEqual(log, [...[1, 2, 3, 4].map((day) => ({ date: LEGACY, day })), { date: D(0), day: 5 }])
    assert.deepEqual(seedLog([], null, D(0)), [])
    // 推算出來的紀錄：今天（第 5 次上完的那天）再進來還是同一次；明天第 6 篇，舊篇是 3 次前的第 3 篇
    const c: Course = { day: 5, runs: [D(0)] }
    const today = planOf(c, log, D(0))
    assert.deepEqual([today.day, today.idx, today.old], [5, 4, 2])
    const p = planOf(c, log, D(1))
    assert.deepEqual([p.day, p.idx, p.old, p.review], [6, 5, 3, [5]])
    console.log('ok 4 已存的進度不轉換：舊規則上到第幾次都一樣，下一次換新篇；沒有上課紀錄時從上過的篇推算')
  }
  // ── 舊版（照日期）的進度 ─────────────────────────────
  {
    const t1 = ZH_TEXTS[0]
    const t2 = ZH_TEXTS[1]
    // 一篇都沒上過 → 第 1 篇
    const a = migrate([], null, '2026-11-20')
    assert.equal(current(a, '2026-11-20').day, t1.day)
    // 上過第 1、2 篇（昨天以前）→ 換第 3 篇：不倒退
    const b = migrate([t1.day, t2.day], null, '2026-11-20')
    assert.deepEqual(b.runs, [LEGACY])
    assert.equal(current(b, '2026-11-20').day, ZH_TEXTS[2].day)
    // 第 2 篇是今天照日期上的 → 今天再進來還是它，明天換下一篇
    const c = migrate([t1.day, t2.day], null, t2.date)
    assert.equal(current(c, t2.date).day, t2.day)
    const tomorrow = new Date(Date.parse(t2.date) + 86_400_000).toISOString().slice(0, 10)
    assert.equal(current(c, tomorrow).day, ZH_TEXTS[2].day)
    // 家長今天用舊版挑了第 9 篇（還沒上）→ 今天上第 9 篇，上完回到第 5 篇的下一篇（第 5 篇上過了）
    let e = migrate([1, 2, 5], { date: '2026-11-20', day: 9 }, '2026-11-20')
    assert.equal(current(e, '2026-11-20').day, 9)
    e = finishRun(e, 9, '2026-11-20')
    assert.equal(current(e, '2026-11-21').day, 6)
    assert.equal(migrate([1, 2, 5], { date: '2026-11-19', day: 9 }, '2026-11-20').day, 5)
    console.log('ok 5 舊版（照日期）進度：從上過的最後一篇的下一篇接著上，今天上過的今天還是它')
  }
  {
    // 180 篇上完從頭
    const last = ZH_TEXTS[ZH_TEXTS.length - 1].day
    let c: Course = { day: last, runs: [D(0)] }
    assert.equal(current(c, D(1)).day, first)
    c = finishRun(c, first, D(1))
    assert.deepEqual(c, { day: first, runs: [D(1)] })
    console.log('ok 6 180 篇上完從第 1 篇再來')
  }
  {
    // 舊篇跟原本的課一樣（家長 2026-11-11）：180 篇當舊篇，步驟跟當新篇時一模一樣；找一樣的字（換一個紅字考）都出得了、都合法；小複習每篇都出得了一題
    let n = 0
    for (const t of ZH_TEXTS)
      for (const level of [1, 2, 3] as const)
        for (let k = 0; k < 6; k++) {
          const q = glyphQuestion(t, 2, level, rng(k + 1))
          assert.ok(q, `第 ${t.day} 篇〈${t.title}〉當舊篇，第 ${level} 級出不了找一樣的字`)
          assert.deepEqual(glyphBad(t, q), [], `第 ${t.day} 篇舊篇的找一樣的字`)
          n++
        }
    const done = new Set(ZH_TEXTS.map((t) => t.day))
    for (const t of ZH_TEXTS) {
      const steps = stepsOf({ t: ZH_TEXTS[0].day === t.day ? ZH_TEXTS[1] : ZH_TEXTS[0], n: 1, old: t, review: [t] }, done, GLYPH_START, rng(t.day))
      assert.deepEqual(steps.filter((s) => s.part === 'old').map((s) => s.k), lessonKinds(t.day, done), `第 ${t.day} 篇舊篇跟新篇一樣`)
      const rev = steps.filter((s) => s.part === 'review')
      assert.deepEqual(rev.map((s) => s.k), [questionsOf(t, done).length ? 'quiz' : 'glyph'], `第 ${t.day} 篇小複習`)
    }
    console.log(`ok 7 舊篇跟原本的課一樣：180 篇當舊篇的步驟都跟當新篇時一模一樣（找一樣的字 ${n} 題都合法），小複習 180 篇都出得了一題`)
  }
  {
    // 盲測工具的 --zh-run N（tests/ai-toddler/lib/zh-run.ts，T-139）：寫進 kv 的舊紀錄，App 照自己的排課排出今天的課。
    // 以前最多只能放 2 次（走不到一天兩篇）；現在第 4 次起有舊篇，第 8 次起結尾小題有前 7 次的
    const today = '2026-11-11'
    for (const n of [1, 2, 3, 4, 5, 8, 30, ZH_RUN_MAX]) {
      const kv = zhRunKV(n)
      const c = (kv['zhLesson:course'] as Course | undefined) ?? migrate([], null, today)
      const log = (kv['zhLesson:log'] as Session[] | undefined) ?? seedLog((kv['zhLesson:done'] as number[] | undefined) ?? [], c, today)
      const p = planOf(c, log, today)
      const day = ZH_TEXTS[(n - 1) % ZH_TEXTS.length].day
      assert.equal(p.day, day, `--zh-run ${n}：新篇是第 ${day} 篇`)
      assert.equal(p.old, n >= 4 ? n - 3 : null, `--zh-run ${n}：舊篇`)
      assert.deepEqual(p.review, [n - 1, n - 7].filter((d) => d >= 1 && d !== p.old), `--zh-run ${n}：結尾小題`)
      // 英文故事也先講舊篇（同一份排課）
      assert.equal(enTodayOf(p, {}, undefined, today).day, p.old ?? p.day, `--zh-run ${n}：英文故事先講的`)
    }
    // 報告上寫今天排到什麼（T-140：測試員才分得出孩子在舊篇還是新篇）
    assert.equal(zhRunToday(5, today), '第 5 次課：先上舊篇 第 2 篇〈三隻小豬〉，再上新篇 第 5 篇〈獅子與老鼠〉；結尾小題 第 4 篇〈牛頓與蘋果〉')
    assert.ok(zhRunToday(1, today).includes('只有新篇 第 1 篇'))
    assert.throws(() => zhRunKV(0))
    assert.throws(() => zhRunKV(ZH_RUN_MAX + 1))
    assert.throws(() => zhRunKV(2.5))
    console.log(`ok 8 盲測工具 --zh-run 1～${ZH_RUN_MAX}：第 4 次起排得出「先上舊篇」（舊篇是第 N-3 篇）、第 8 次起有前 7 次的小題，中文課和英文故事一樣`)
  }
  {
    // 舊篇上完選「回家」（T-140）：這次只算上完舊篇——不記上完（finishRun、logSession 都不做），新篇不消耗；
    // 今天再進來、隔天都還是同一篇新篇，第幾次課沒有往前，舊篇、結尾小題照實際上過的紀錄（同一篇舊篇）
    let c: Course = { day: first, runs: [] }
    let log: Session[] = []
    for (const d of [0, 1, 2, 3]) ({ c, log } = session(c, log, D(d)))
    const before = planOf(c, log, D(4))
    assert.deepEqual([before.day, before.old, before.idx], [ZH_TEXTS[4].day, ZH_TEXTS[1].day, 4])
    // D(4) 上完舊篇、選回家：什麼都不記
    const same = planOf(c, log, D(4))
    const next = planOf(c, log, D(5))
    assert.deepEqual([same.day, same.old, same.review], [before.day, before.old, before.review], '今天再進來還是同一次')
    assert.deepEqual([next.day, next.old, next.idx, next.review], [before.day, before.old, before.idx, before.review], '隔天還是同一篇新篇、同一篇舊篇')
    // 隔天選再一篇、上完：才換下一篇
    ;({ c, log } = session(c, log, D(5)))
    assert.equal(planOf(c, log, D(6)).day, ZH_TEXTS[5].day)
    console.log('ok 14 舊篇上完選回家：新篇不消耗，今天再進來、隔天都還是同一篇新篇，舊篇、小題照實際上過的')
  }
  // ── 聊一聊（對話式共讀，T-102）：3 歲問得出來的一題，答不出來時大人示範 ─────────────
  {
    // 舊的陪讀小字：問句拿掉，剩下的（動一動、生活延伸）當「還可以」
    assert.deepEqual(talkOf('「兔子跑得比較快，為什麼烏龜先到？」讓孩子學烏龜在地上慢慢爬。'), { questions: ['兔子跑得比較快，為什麼烏龜先到？'], rest: '讓孩子學烏龜在地上慢慢爬。' })
    assert.deepEqual(talkOf('一起找家裡哪裡紅紅的。'), { questions: [], rest: '一起找家裡哪裡紅紅的。' })
    // 全球幼教指引 ZH-1、ZH-3：3 歲回答「誰、什麼、哪裡」，說得出或指得出誰做了什麼；「為什麼」是 4 歲的目標
    const BAN = ['為什麼', '怎麼', '如果', '覺得', '會不會', '要不要', '喜不喜歡', '還是']
    let pics = 0
    for (const t of ZH_TEXTS) {
      const k = talkFor(t)
      const where = `第 ${t.day} 篇〈${t.title}〉`
      assert.ok(k && k.q && k.a, `${where}沒有聊一聊`)
      assert.ok(!BAN.some((b) => k.q.includes(b)), `${where}「${k.q}」：3 歲不問為什麼、怎麼、如果……`)
      assert.ok(/誰|什麼|哪/.test(k.q), `${where}「${k.q}」：用誰、什麼、哪裡問`)
      assert.ok([...k.q].length <= 12 && k.q.endsWith('？'), `${where}「${k.q}」：≤ 12 字、問號結尾`)
      assert.ok([...k.a].length <= 16 && /[。！]$/.test(k.a), `${where}「${k.a}」：示範的回答 ≤ 16 字、一句`)
      // 答案在課文裡（回想，不是推理）：示範回答裡至少有兩個字連著出現在課文
      const text = t.lines.map(plain).join('')
      const core = k.a.replace(/[是！。，、「」：]/g, '')
      assert.ok([...Array(Math.max(0, core.length - 1)).keys()].some((i) => text.includes(core.slice(i, i + 2))), `${where}「${k.a}」：答案要在課文裡`)
      if (k.pic) {
        pics++
        assert.ok(t.redWords.includes(k.pic) && t.emoji[k.pic], `${where}圖「${k.pic}」要是有圖的紅字`)
      }
    }
    console.log(`ok 9 聊一聊：180 篇都是誰、什麼、哪裡的問法（沒有為什麼），答案在課文裡、有大人示範的回答；${pics} 篇有圖可以指`)
  }
  // ── 中文課文不出聲（2026-11-03）：沒有程式會去要中文課文、中文數數的音檔；中文課裡不說話、不用平板內建語音 ─────────────
  // （英文單字三明治的中文 audio/zh/ 家長要保留，不在這裡擋）
  {
    const bad: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(f)) {
          const src = readFileSync(p, 'utf8')
          for (const re of [/zh-lesson\//, /zh-math/, /sayClip/]) if (re.test(src)) bad.push(`${p}：${re}`)
          if (/[\/]lessons[\/]chinese[\/]/.test(p)) for (const re of [/\bsay\(/, /speechSynthesis/, /audio\//, /zhClip/]) if (re.test(src)) bad.push(`${p}：${re}`)
        }
      }
    }
    walk('src')
    assert.deepEqual(bad, [], '中文課文還有會出聲、會去要中文課文音檔的程式')
    console.log('ok 10 中文課文不出聲：src 沒有 zh-lesson、zh-math、sayClip；中文課裡沒有 say、平板內建語音、音檔路徑')
  }
  {
    // T-111：每一行旁邊都有圖可以點（沒有紅字的行借前後行的主角）
    const rabbit = ZH_TEXTS.find((t) => t.title === '龜兔賽跑')!
    assert.deepEqual(linePics(rabbit).map((ps) => ps.map((p) => `${p.word}${p.echo ? '(借)' : ''}`)), [['兔子'], ['兔子(借)'], ['烏龜'], ['烏龜(借)']], '龜兔賽跑：沒有紅字的行借上一行的主角')
    for (const t of ZH_TEXTS) {
      const ps = linePics(t)
      assert.equal(ps.length, t.lines.length)
      for (const [i, row] of ps.entries()) {
        assert.ok(row.length > 0, `第 ${t.day} 篇第 ${i + 1} 行沒有圖`)
        for (const p of row) assert.ok(t.emoji[p.word], `第 ${t.day} 篇第 ${i + 1} 行的圖 ${p.word} 沒有圖檔`)
      }
    }
    console.log('ok 11 每一行旁邊都有圖可以點：沒有紅字的行借上一行的主角（龜兔賽跑：跑到樹下睡大覺 → 兔子），180 篇每一行都有')
  }
  // ── 找一樣的字（T-117）：不教不考、2 選 1 起、干擾字差很多 ─────────────
  {
    assert.deepEqual(['小豬', '烏龜', '骨頭', '老鼠', '碗', '紅蘿蔔'].map(charOf), ['豬', '烏', '骨', '鼠', '碗', '紅'], '跳過子、小、大、頭、老這種常見字')
    assert.ok(glyphSim('大', '太')! > NEAR_MAX, '大／太只差一點點：不能當第 3 級的「有一點像」')
    assert.ok(glyphSim('豬', '小')! < FAR, '豬／小差很多')
    let n = 0
    const bad: string[] = []
    for (const t of ZH_TEXTS)
      for (const run of [1, 2, 3])
        for (const level of [1, 2, 3] as const)
          for (let seed = 1; seed <= 6; seed++) {
            const q = glyphQuestion(t, run, level, rng(seed * 7919 + t.day))
            const where = `第 ${t.day} 篇〈${t.title}〉第 ${run} 次第 ${level} 級`
            if (!q) {
              bad.push(`${where}出不了題`)
              continue
            }
            n++
            bad.push(...glyphBad(t, q).map((b) => `${where}：${b}`))
          }
    assert.deepEqual([...new Set(bad)].slice(0, 10), [], '找一樣的字有沒教就考、選項不對的題目')
    // 壞例子一定要抓到：課文裡沒有的字、答案那個詞裡的字、第 1 級放了很像的字、選項太多
    const t1 = ZH_TEXTS.find((t) => t.title === '龜兔賽跑')!
    const ok1 = glyphQuestion(t1, 2, 1, rng(1))!
    assert.equal(ok1.char, '兔', '龜兔賽跑第 2 次換考另一個紅字（兔子 → 兔）')
    assert.equal(glyphQuestion(t1, 1, 1, rng(1))!.char, '烏', '龜兔賽跑第 1 次考家長定的那題（烏龜 → 烏）')
    const bads: [string, typeof ok1][] = [
      ['課文裡沒有的字', { ...ok1, options: ['兔', '龍'] }],
      ['答案那個詞裡的字', { ...ok1, options: ['兔', '子'] }],
      ['第 1 級放了很像的字', { ...ok1, options: ['兔', '免'] }],
      ['第 1 級 3 個選項', { ...ok1, options: ['兔', '了', '下'] }],
      ['答案不是紅字裡的字', { ...ok1, char: '跑', options: ['跑', '了'] }],
    ]
    for (const [name, q] of bads) assert.ok(glyphBad(t1, q).length > 0, `壞例子沒擋下：${name}`)
    console.log(`ok 12 找一樣的字不教不考：180 篇 × 3 次 × 3 級 × 6 種亂數共 ${n} 題，答案都是當篇紅字裡的字、干擾字都在當篇課文裡、第 1 級 2 選 1 而且差很多；壞例子擋下 ${bads.length}/${bads.length}`)
  }
  {
    const D2 = (i: number) => D(i)
    let s: GlyphState = GLYPH_START
    assert.ok(needsDemo(s), '第一次要示範')
    s = afterGlyph(s, { date: D2(0), first: true, demo: true, led: false })
    assert.ok(!needsDemo(s) && s.recent.length === 0 && s.level === 1, '示範完自己第一下就對：之後不示範；示範那次不算熟練')
    let x: GlyphState = GLYPH_START
    for (let i = 0; i < 3; i++) x = afterGlyph(x, { date: D2(i), first: false, demo: true, led: false })
    assert.ok(!needsDemo(x), '示範過 3 堂就不再示範')
    // 同一天連對 20 題：只有一天，不升級
    for (let i = 0; i < 20; i++) s = afterGlyph(s, { date: D2(1), first: true, demo: false, led: false })
    assert.equal(s.level, 1, '同一天全對不升級')
    // 手指著答案才點的不算
    const before = s.recent.length
    s = afterGlyph(s, { date: D2(2), first: true, demo: false, led: true })
    assert.equal(s.recent.length, before, '手指著答案才點的不算熟練')
    // 8 題 7 對、分布在 3 天 → 第 2 級
    let y: GlyphState = { ...GLYPH_START, learned: true }
    const days = [3, 3, 4, 4, 4, 5, 5, 5]
    days.forEach((d, i) => (y = afterGlyph(y, { date: D2(d), first: i !== 2, demo: false, led: false })))
    assert.equal(y.level, 2, '8 題 7 對、3 天 → 第 2 級')
    assert.equal(y.recent.length, 0, '升級後重新算')
    // 第 2 級連錯 2 題 → 退回第 1 級
    y = afterGlyph(y, { date: D2(6), first: false, demo: false, led: false })
    assert.equal(y.level, 2)
    y = afterGlyph(y, { date: D2(7), first: false, demo: false, led: false })
    assert.equal(y.level, 1, '連錯 2 題退一級')
    // 第 3 級是上限
    let z: GlyphState = { level: 3, recent: [], demos: 0, learned: true }
    for (let i = 0; i < 12; i++) z = afterGlyph(z, { date: D2(i), first: true, demo: false, led: false })
    assert.equal(z.level, 3, '最多第 3 級（4 選 1、很像的字留給 4 歲）')
    console.log('ok 13 找一樣的字升降級：8 題 ≥ 7 題第一次就對、≥ 3 天才升；同一天全對不升；示範、手指著才點的不算；連錯 2 題退一級；最多第 3 級')
  }
  {
    // T-142（家長 2026-11-12：第二篇改成提議）：複習上完就下課，孩子沒點「再一篇」的話新篇不消耗，
    // 下次進來直接上那篇新篇（不再複習同一篇），上完照常下課；再下一次才是下一次的複習。複習和新篇輪流，不跳篇、不重複。
    let c: Course = { day: first, runs: [] }
    let log: Session[] = []
    let mark: OldMark | null = null
    /** 英文故事自己的複習紀錄（en-book 的 review）和聽過的 */
    let enMark: OldMark | null = null
    const heard: Heard = {}
    const did: string[] = []
    const news: number[] = []
    const olds: number[] = []
    for (let d = 0; news.length < 12; d++) {
      const date = D(d)
      const p = planOf(c, log, date)
      const e = enTodayOf(p, heard, undefined, date, enMark ?? undefined)
      if (p.old != null && !reviewDone(mark, p, date)) {
        // 今天是複習：上完就下課（沒點再一篇），新篇不消耗
        assert.equal(e.part, 'old', `${date} 英文故事也先講複習`)
        assert.equal(e.day, p.old)
        mark = { date, day: p.old, skipped: false, for: p.day }
        enMark = { date, day: p.old, for: p.day }
        ;(heard[p.old] ??= []).push(date)
        olds.push(p.old)
        did.push(`${date} 複習第 ${p.old} 篇`)
        // 同一天再進來：直接是那篇新篇（不再複習）
        const again = planOf(c, log, date)
        assert.deepEqual([again.day, again.old], [p.day, p.old])
        assert.ok(reviewDone(mark, again, date), '同一天再進來不再複習')
        assert.deepEqual([enTodayOf(again, heard, undefined, date, enMark).part, enTodayOf(again, heard, undefined, date, enMark).day], ['new', p.day], '英文故事同一天再進來是新篇')
        continue
      }
      // 今天是新篇（前 3 次沒有複習，或複習上次做過了）
      assert.deepEqual([e.part, e.day], ['new', p.day], `${date} 英文故事也是新篇`)
      assert.ok(!news.includes(p.day), `新篇第 ${p.day} 篇上過了`)
      if (news.length) assert.equal(p.day, nextDay(news[news.length - 1]), '照順序，不跳篇')
      ;({ c, log } = session(c, log, date))
      ;(heard[p.day] ??= []).push(date)
      news.push(p.day)
      did.push(`${date} 新篇第 ${p.day} 篇`)
    }
    // 前 3 次沒有複習，之後複習、新篇輪流；每一篇複習只做一次，是 3 次前的那篇
    const kinds = did.map((x) => (x.includes('複習') ? 'r' : 'n')).join('')
    assert.equal(kinds, 'nnn' + 'rn'.repeat(9), kinds)
    assert.deepEqual(olds, news.slice(0, olds.length), '複習的是 3 次前的那篇，依序、不重複')
    // 舊版的複習紀錄（沒有 for）：只認今天的
    assert.equal(reviewDone({ date: D(0), day: 1, skipped: false }, { day: 4, old: 1 }, D(1)), false)
    assert.equal(reviewDone({ date: D(1), day: 1, skipped: false }, { day: 4, old: 1 }, D(1)), true)
    // 別的一次課的複習紀錄不算
    assert.equal(reviewDone({ date: D(0), day: 1, for: 4 }, { day: 5, old: 2 }, D(1)), false)
    console.log('ok 15 第二篇是提議（T-142）：複習上完就下課，新篇不消耗；下次直接上那篇新篇（不再複習），之後複習、新篇輪流，不跳篇、不重複；中文課和英文故事一樣\n   ' + did.join('\n   '))
  }
  console.log('ALL PASS')
}

main()
