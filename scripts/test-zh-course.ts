// 中文課文的排課（src/lessons/chinese/course.ts）、第 2 次停一下的提示（cloze.ts）、聊一聊（data.ts 的 talkOf）、中文課不出聲：每篇剛好上 3 次才換、跳過的日子不往前、
// 同一天再進來還是同一次、家長挑的那篇從第 1 次開始、舊版（照日期）的進度接得上。對照 docs/全球幼教指引-現況對照.md A3。
// 執行：npx tsx scripts/test-zh-course.ts（npm run verify 的「單元：中文課文每篇 3 次」）
import assert from 'node:assert/strict'
import { LEGACY, RUNS_PER_TEXT, applyPick, current, finishRun, migrate, nextDay, undoPick, type Course } from '../src/lessons/chinese/course'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gapOf } from '../src/lessons/chinese/cloze'
import { ZH_TEXTS, plain, talkFor, talkOf } from '../src/lessons/chinese/data'

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
  console.log('ALL PASS')
}

main()
