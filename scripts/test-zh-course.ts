// 中文課文的排課（src/lessons/chinese/course.ts）、第 2 次停一下的提示（cloze.ts）、聊一聊（data.ts 的 talkOf）、中文課不出聲：每篇剛好上 3 次才換、跳過的日子不往前、
// 同一天再進來還是同一次、家長挑的那篇從第 1 次開始、舊版（照日期）的進度接得上。對照 docs/全球幼教指引-現況對照.md A3。
// 執行：npx tsx scripts/test-zh-course.ts（npm run verify 的「單元：中文課文每篇 3 次」）
import assert from 'node:assert/strict'
import { LEGACY, RUNS_PER_TEXT, applyPick, current, finishRun, migrate, nextDay, undoPick, type Course } from '../src/lessons/chinese/course'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gapOf } from '../src/lessons/chinese/cloze'
import { WHO_ICONS, ZH_TEXTS, linePics, orderOf, pieces, plain, storyRunOf, talkFor, talkOf, type ZhOrder, type ZhQuestion, type ZhText } from '../src/lessons/chinese/data'
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

/**
 * 故事題有什麼不對（T-127）：挖空的句子要是課文的原句、答案是有圖的紅字、問誰／什麼跟圖對得上；
 * 選項 2～3 張、答案在第一個、圖不重複；陪襯是教過的（這一篇或上過的篇的紅字），而且不在那一句裡。
 */
function storyBad(t: ZhText, q: ZhQuestion, done: ReadonlySet<number>): string[] {
  const out: string[] = []
  const s = q.story
  if (!s) return ['不是故事題']
  if (plain(t.lines[s.line] ?? '') !== s.before + q.word + s.after) out.push(`句子跟課文第 ${s.line + 1} 行對不上`)
  if (!t.redWords.includes(q.word) || !t.emoji[q.word]) out.push(`答案「${q.word}」不是有圖的紅字`)
  if (s.who !== WHO_ICONS.has(t.emoji[q.word] ?? '')) out.push(`「${q.word}」該問${s.who ? '什麼' : '誰'}`)
  if ((s.before + s.after).replace(/[，。！？、：；「」『』—…\s]/g, '').length < 2) out.push('句子只剩空格')
  if (q.options.length < 2 || q.options.length > 3) out.push(`${q.options.length} 張圖`)
  if (q.options[0]?.word !== q.word || q.options[0]?.icon !== t.emoji[q.word]) out.push('答案不在第一個')
  if (new Set(q.options.map((o) => o.icon)).size !== q.options.length) out.push('圖重複')
  const taught = new Set([...t.redWords, ...ZH_TEXTS.filter((x) => done.has(x.day)).flatMap((x) => x.redWords)])
  for (const o of q.options.slice(1)) {
    if (!taught.has(o.word)) out.push(`陪襯「${o.word}」沒教過`)
    if ((s.before + s.after).includes(o.word)) out.push(`陪襯「${o.word}」就在句子裡`)
  }
  return out
}

/** 排順序有什麼不對：兩張都是有圖的紅字、圖不一樣、first 在課文裡比 then 先說到、行號是第一次說到的那一行 */
function orderBad(t: ZhText, o: ZhOrder): string[] {
  const out: string[] = []
  const at = (w: string) => {
    let k = 0
    for (const [line, l] of t.lines.entries())
      for (const p of pieces(l)) {
        k++
        if (p.red && p.text === w) return { k, line }
      }
    return null
  }
  const a = at(o.first.word)
  const b = at(o.then.word)
  for (const c of [o.first, o.then]) if (!t.redWords.includes(c.word) || t.emoji[c.word] !== c.icon) out.push(`「${c.word}」不是有圖的紅字`)
  if (o.first.icon === o.then.icon) out.push('兩張圖一樣')
  if (!a || !b || a.k >= b.k) out.push(`「${o.first.word}」不是比「${o.then.word}」先說到`)
  if (a && a.line !== o.first.line) out.push(`「${o.first.word}」的行號不對`)
  if (b && b.line !== o.then.line) out.push(`「${o.then.word}」的行號不對`)
  return out
}

const D = (i: number) => {
  const d = new Date(Date.UTC(2026, 10, 3 + i))
  return d.toISOString().slice(0, 10)
}

/** 一天：進課（看今天上哪一篇第幾次）、上完（progress.ts 的 markDone 做的事）；回傳今天的課和上完之後的排課 */
function day(c: Course, date: string, finish = true) {
  const r = current(c, date)
  return { r, c: finish ? finishRun(c, r.day, date) : c }
}

function main() {
  const first = ZH_TEXTS[0].day
  // ── 10 天、中間跳過 2 天 ─────────────────────────────
  {
    let c: Course = { day: first, runs: [] }
    const skip = new Set([3, 6])
    const log: string[] = []
    const seen: { day: number; n: number }[] = []
    for (let i = 0; i < 10; i++) {
      if (skip.has(i)) {
        log.push(`${D(i)} 沒上`)
        continue
      }
      const x = day(c, D(i))
      c = x.c
      seen.push({ day: x.r.day, n: x.r.n })
      log.push(`${D(i)} 第 ${x.r.day} 篇第 ${x.r.n} 次`)
    }
    // 8 天有上課：第 1 篇 3 次、第 2 篇 3 次、第 3 篇 2 次
    assert.deepEqual(
      seen.map((s) => `${s.day}-${s.n}`),
      [`${first}-1`, `${first}-2`, `${first}-3`, `${nextDay(first)}-1`, `${nextDay(first)}-2`, `${nextDay(first)}-3`, `${nextDay(nextDay(first))}-1`, `${nextDay(nextDay(first))}-2`],
      log.join('\n'),
    )
    for (const d of new Set(seen.map((s) => s.day))) {
      const ns = seen.filter((s) => s.day === d).map((s) => s.n)
      assert.ok(ns.length <= RUNS_PER_TEXT && ns.every((n, i) => n === i + 1), `第 ${d} 篇：${ns.join(',')}`)
    }
    console.log('ok 1 10 天跳過 2 天：每篇剛好 3 次才換，跳過的日子不往前\n   ' + log.join('\n   '))
  }
  {
    // 跳過的日子：前一天上完第 2 次，隔一週再來還是第 3 次
    let c: Course = { day: first, runs: [] }
    c = day(c, D(0)).c
    c = day(c, D(1)).c
    assert.deepEqual(current(c, D(9)), { day: first, n: 3, course: c })
    console.log('ok 2 隔了好幾天沒上：接著上同一篇的下一次')
  }
  {
    // 同一天再進來：上完之前、上完之後都是同一次；上兩次只算一次
    let c: Course = { day: first, runs: [] }
    assert.equal(day(c, D(0), false).r.n, 1)
    c = day(c, D(0)).c
    assert.equal(current(c, D(0)).n, 1, '上完再進來還是第 1 次')
    c = day(c, D(0)).c
    assert.deepEqual(c.runs, [D(0)], '同一天上兩次只算一次')
    c = day(c, D(1)).c
    c = day(c, D(2)).c
    // 第 3 次上完的那一天再進來：還是第 1 篇第 3 次，不會當天就換篇
    assert.deepEqual([current(c, D(2)).day, current(c, D(2)).n], [first, 3])
    assert.deepEqual([current(c, D(3)).day, current(c, D(3)).n], [nextDay(first), 1])
    console.log('ok 3 同一天再進來還是同一次（上完之前、之後都是），上滿 3 次隔天才換')
  }
  // ── 家長挑「今天上這篇」 ─────────────────────────────
  {
    let c: Course = { day: 5, runs: [D(0)] } // 第 5 篇上過 1 次
    c = applyPick(c, 40, D(1))
    assert.deepEqual([current(c, D(1)).day, current(c, D(1)).n], [40, 1], '挑的那篇從第 1 次開始')
    c = day(c, D(1)).c
    c = day(c, D(2)).c
    c = day(c, D(4)).c
    // 挑的那篇上滿 3 次 → 回到第 5 篇的第 2 次
    assert.deepEqual([current(c, D(5)).day, current(c, D(5)).n], [5, 2])
    c = day(c, D(5)).c
    c = day(c, D(6)).c
    assert.deepEqual([current(c, D(7)).day, current(c, D(7)).n], [6, 1], '第 5 篇上滿 → 照順序第 6 篇')
    console.log('ok 4 家長挑的那篇從第 1 次開始，上滿 3 次回到原本那篇接著上')
  }
  {
    // 今天挑了又改挑、又改回來
    const c0: Course = { day: 5, runs: [D(0), D(1)] }
    let c = applyPick(c0, 40, D(2))
    c = applyPick(c, 41, D(2))
    assert.deepEqual([current(c, D(2)).day, current(c, D(2)).n], [41, 1])
    assert.deepEqual(c.prev, { day: 5, runs: [D(0), D(1)] }, '改挑之後回去的地方還是原本那篇')
    c = undoPick(c, D(2))
    assert.deepEqual([current(c, D(2)).day, current(c, D(2)).n], [5, 3])
    // 昨天挑的改不回來（已經在上了）
    const y = applyPick(c0, 40, D(2))
    assert.equal(undoPick(y, D(3)), y)
    // 挑了正在上的那篇：從第 1 次重新開始，上滿 3 次往下一篇（不會回去再上一輪）
    let s = applyPick({ day: 5, runs: [D(0)] }, 5, D(1))
    for (const i of [1, 2, 3]) s = day(s, D(i)).c
    assert.deepEqual([current(s, D(4)).day, current(s, D(4)).n], [6, 1])
    console.log('ok 5 今天挑了可以改挑、改回原本那篇；昨天挑的不能改回；挑正在上的那篇從第 1 次重來')
  }
  // ── 舊版（照日期）的進度 ─────────────────────────────
  {
    const t1 = ZH_TEXTS[0]
    const t2 = ZH_TEXTS[1]
    // 一篇都沒上過 → 第 1 篇第 1 次（不照日期跳到今天的那篇）
    const a = migrate([], null, '2026-11-20')
    assert.deepEqual([current(a, '2026-11-20').day, current(a, '2026-11-20').n], [t1.day, 1])
    // 上過第 1、2 篇（昨天以前）→ 第 2 篇第 2 次：不倒退、不跳篇
    const b = migrate([t1.day, t2.day], null, '2026-11-20')
    assert.deepEqual(b.runs, [LEGACY])
    assert.deepEqual([current(b, '2026-11-20').day, current(b, '2026-11-20').n], [t2.day, 2])
    // 第 2 篇是今天照日期上的 → 今天再進來還是第 1 次，明天第 2 次
    const c = migrate([t1.day, t2.day], null, t2.date)
    assert.deepEqual([current(c, t2.date).day, current(c, t2.date).n], [t2.day, 1])
    const tomorrow = new Date(Date.parse(t2.date) + 86_400_000).toISOString().slice(0, 10)
    assert.deepEqual([current(c, tomorrow).day, current(c, tomorrow).n], [t2.day, 2])
    // 中間有沒上的（上過 1、2、5，跳了 3、4）→ 從最後的第 5 篇接著，不回頭補、不往前跳
    const d = migrate([1, 2, 5], null, '2026-11-20')
    assert.deepEqual([current(d, '2026-11-20').day, current(d, '2026-11-20').n], [5, 2])
    // 家長今天用舊版挑了第 9 篇（還沒上）→ 今天上第 9 篇第 1 次，上滿回到第 5 篇
    let e = migrate([1, 2, 5], { date: '2026-11-20', day: 9 }, '2026-11-20')
    assert.deepEqual([current(e, '2026-11-20').day, current(e, '2026-11-20').n], [9, 1])
    for (const x of ['2026-11-20', '2026-11-21', '2026-11-22']) e = day(e, x).c
    assert.deepEqual([current(e, '2026-11-23').day, current(e, '2026-11-23').n], [5, 2])
    // 昨天的舊挑選不算
    assert.equal(migrate([1, 2, 5], { date: '2026-11-19', day: 9 }, '2026-11-20').day, 5)
    console.log('ok 6 舊版進度：從上過的最後一篇的第 2 次接著上（今天上過的今天還是第 1 次），不倒退、不跳篇')
  }
  {
    // 180 篇上完從頭
    const last = ZH_TEXTS[ZH_TEXTS.length - 1].day
    let c: Course = { day: last, runs: [D(0), D(1), D(2)] }
    assert.equal(current(c, D(3)).day, first)
    c = finishRun(c, first, D(3))
    assert.deepEqual(c, { day: first, runs: [D(3)] })
    console.log('ok 7 180 篇上完從第 1 篇再來')
  }
  // ── 第 2 次：念到框起來的紅字前停一下（親子共讀：提示大人） ─────────────
  {
    assert.deepEqual(gapOf('三隻【小豬】蓋【房子】，'), { word: '房子', before: '三隻小豬蓋', after: '，' }, '一行兩個紅字框後面那個')
    assert.equal(gapOf('沒有紅字。'), null)
    // 180 篇每一行：框起來的詞是紅字、前後接起來是原句
    let gaps = 0
    for (const t of ZH_TEXTS)
      for (const l of t.lines) {
        const g = gapOf(l)
        if (!g) continue
        gaps++
        assert.ok(t.redWords.includes(g.word), `〈${t.title}〉${l}`)
        assert.equal(g.before + g.word + g.after, l.replace(/[【】]/g, ''))
      }
    console.log(`ok 8 第 2 次：每行最後一個紅字框起來提示大人停一下；180 篇共 ${gaps} 行`)
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
  // ── 第 3 次的故事題、排順序（T-127 B 案）：180 篇都從課文產生，題目合法，出不來的篇有退路 ─────────────
  {
    const t1 = ZH_TEXTS.find((t) => t.title === '龜兔賽跑')!
    const prev = (t: ZhText) => new Set(ZH_TEXTS.filter((x) => x.day < t.day).map((x) => x.day))
    let stories = 0
    let orders = 0
    const fallback: number[] = []
    const empty: number[] = []
    const bad: string[] = []
    for (const t of ZH_TEXTS)
      for (const [name, done] of [
        ['前面的篇都上過', prev(t)],
        ['第一次上中文課就挑這篇', new Set<number>()],
      ] as const) {
        const where = `第 ${t.day} 篇〈${t.title}〉（${name}）`
        const r = storyRunOf(t, done)
        for (const q of r.story) {
          stories++
          bad.push(...storyBad(t, q, done).map((b) => `${where}故事題：${b}`))
        }
        if (new Set(r.story.map((q) => q.word)).size !== r.story.length) bad.push(`${where}故事題問了兩次一樣的`)
        if (r.order) {
          orders++
          bad.push(...orderBad(t, r.order).map((b) => `${where}排順序：${b}`))
          if (r.story.length > 1) bad.push(`${where}有排順序還出兩題故事題`)
        } else if (name === '前面的篇都上過') fallback.push(t.day)
        // 前面的篇都上過（照順序上課）：每一篇的第 3 次至少多一題
        if (name === '前面的篇都上過' && !r.story.length && !r.order) empty.push(t.day)
      }
    assert.deepEqual(bad.slice(0, 10), [], '故事題、排順序有壞題')
    assert.deepEqual(empty, [], '照順序上課時，第 3 次一題都沒有多的篇')
    // 排順序出不來的篇（整篇有圖的紅字只有一種圖）：改成故事題（照順序上課時每篇都有）
    for (const d of fallback) {
      const t = ZH_TEXTS.find((x) => x.day === d)!
      assert.equal(new Set(t.redWords.map((w) => t.emoji[w]).filter(Boolean)).size <= 1 || !orderOf(t), true)
      assert.ok(storyRunOf(t, prev(t)).story.length >= 1, `第 ${d} 篇排順序出不來，也沒有故事題`)
    }
    assert.ok(fallback.length <= 20, `排順序出不來的篇太多：${fallback.length} 篇`)
    // 龜兔賽跑：問「誰」（會動的），不問「聊一聊」問過的兔子；先兔子、後烏龜
    const s1 = storyRunOf(t1, new Set())
    assert.equal(s1.story[0]?.word, '烏龜', '龜兔賽跑的故事題：聊一聊問過兔子，故事題問烏龜')
    assert.equal(s1.story[0]?.story?.who, true, '烏龜問「誰」')
    assert.equal(`${s1.story[0]?.story?.before}［］${s1.story[0]?.story?.after}`, '［］慢慢爬呀爬，')
    assert.deepEqual([s1.order?.first.word, s1.order?.then.word], ['兔子', '烏龜'], '龜兔賽跑：先說到兔子，後說到烏龜')
    // 壞例子一定要抓到
    const q1 = s1.story[0]!
    const story = q1.story!
    const o1 = s1.order!
    const bads: [string, string[]][] = [
      ['答案跟句子對不上', storyBad(t1, { ...q1, word: '兔子', options: [{ word: '兔子', icon: 'rabbit' }, q1.options[1]] }, new Set())],
      ['陪襯在句子裡', storyBad(t1, { ...q1, story: { ...story, after: '和兔子慢慢爬呀爬，' }, options: [q1.options[0], { word: '兔子', icon: 'rabbit' }] }, new Set())],
      ['沒教過的陪襯', storyBad(t1, { ...q1, options: [q1.options[0], { word: '飛機', icon: 'airplane' }] }, new Set())],
      ['只有答案一張', storyBad(t1, { ...q1, options: [q1.options[0]] }, new Set())],
      ['東西問成誰', storyBad(t1, { ...q1, story: { ...story, who: false } }, new Set())],
      ['先後顛倒', orderBad(t1, { first: o1.then, then: o1.first })],
      ['兩張一樣', orderBad(t1, { first: o1.first, then: { ...o1.first } })],
    ]
    for (const [name, b] of bads) assert.ok(b.length > 0, `壞例子沒擋下：${name}`)
    console.log(
      `ok 14 第 3 次的故事題、排順序（T-127）：180 篇 × 2 種上課情形，故事題 ${stories} 題、排順序 ${orders} 題都合法（句子是課文原句、答案是有圖的紅字、陪襯教過而且不在句子裡、先後照課文）；` +
        `排順序出不來的 ${fallback.length} 篇改成故事題；壞例子擋下 ${bads.length}/${bads.length}`,
    )
  }
  console.log('ALL PASS')
}

main()
