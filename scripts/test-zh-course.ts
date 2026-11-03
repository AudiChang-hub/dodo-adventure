// 中文課文的排課（src/lessons/chinese/course.ts）和第 2 次的挖空（cloze.ts）：每篇剛好上 3 次才換、跳過的日子不往前、
// 同一天再進來還是同一次、家長挑的那篇從第 1 次開始、舊版（照日期）的進度接得上。對照 docs/全球幼教指引-現況對照.md A3。
// 執行：npx tsx scripts/test-zh-course.ts（npm run verify 的「單元：中文課文每篇 3 次」）
import assert from 'node:assert/strict'
import { LEGACY, RUNS_PER_TEXT, applyPick, current, finishRun, migrate, nextDay, undoPick, type Course } from '../src/lessons/chinese/course'
import { CLOZE_WAIT_MS, beforeShare, cutAt, gapOf, passesOf } from '../src/lessons/chinese/cloze'
import { ZH_TEXTS } from '../src/lessons/chinese/data'

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
  // ── 第 2 次：念到紅字前停、挖空、自己念下去 ─────────────
  {
    assert.deepEqual(passesOf(1), ['plain', 'plain'])
    assert.deepEqual(passesOf(2), ['plain', 'gap'], '第 2 次：第一遍照念（A17 不插話），第二遍挖空')
    assert.deepEqual(passesOf(3), ['plain', 'plain'])
    assert.ok(CLOZE_WAIT_MS >= 1500, '停 ≥ 1.5 秒')
    assert.deepEqual(gapOf('三隻【小豬】蓋【房子】，'), { word: '房子', before: '三隻小豬蓋', after: '，' }, '一行兩個紅字挖後面那個')
    assert.equal(gapOf('沒有紅字。'), null)
    assert.equal(beforeShare('【小豬】說：'), 0)
    // 180 篇每一行：挖空的詞是紅字、前後接起來是原句
    let gaps = 0
    for (const t of ZH_TEXTS)
      for (const l of t.lines) {
        const g = gapOf(l)
        if (!g) continue
        gaps++
        assert.ok(t.redWords.includes(g.word), `〈${t.title}〉${l}`)
        assert.equal(g.before + g.word + g.after, l.replace(/[【】]/g, ''))
      }
    console.log(`ok 8 第 2 次第二遍挖空、停 ${CLOZE_WAIT_MS / 1000} 秒；180 篇共 ${gaps} 行有空格可以接`)
  }
  {
    // 停在哪裡：做一段假的聲音（前面 0.15 秒靜音，每個字 0.24 秒、字和字之間 0.04 秒小停頓，逗號停 0.35 秒），
    // 「三隻小豬蓋【房子】，」要停在「蓋」和「房」之間的停頓裡
    const rate = 16000
    const chars = '三隻小豬蓋房子'
    const seg: number[] = []
    const push = (sec: number, amp: number) => {
      for (let i = 0; i < Math.round(sec * rate); i++) seg.push(amp ? amp * Math.sin(i / 3) : 0)
    }
    push(0.15, 0)
    const bounds: number[] = []
    for (let k = 0; k < chars.length; k++) {
      push(0.24, 0.5)
      bounds.push(seg.length / rate)
      push(0.04, 0.003)
    }
    push(0.35, 0)
    const data = Float32Array.from(seg)
    const dur = bounds[bounds.length - 1] + 0.08
    const at = cutAt('三隻小豬蓋【房子】，', data, rate, dur)
    const gapStart = bounds[4]
    assert.ok(at >= gapStart - 0.005 && at <= gapStart + 0.045, `停在 ${at.toFixed(3)} 秒，停頓在 ${gapStart.toFixed(3)}～${(gapStart + 0.04).toFixed(3)}`)
    assert.equal(cutAt('【小豬】蓋房子，', data, rate, dur), 0, '紅字在行首：不播，直接等')
    // 字有長有短（前面念得慢、後面快）：照字數估會停錯，數得出每個字的高峰就照高峰停
    const lens = [0.4, 0.4, 0.4, 0.4, 0.4, 0.2, 0.2]
    const seg2: number[] = []
    // 每個字的音量中間大、兩頭小（像真的字）
    const push2 = (sec: number, amp: number) => {
      const n = Math.round(sec * rate)
      for (let i = 0; i < n; i++) seg2.push(amp ? amp * (0.2 + 0.8 * Math.sin((Math.PI * i) / n)) * Math.sin(i / 3) : 0)
    }
    push2(0.15, 0)
    const b2: number[] = []
    for (const len of lens) {
      push2(len, 0.5)
      b2.push(seg2.length / rate)
      push2(0.05, 0.003)
    }
    const at2 = cutAt('三隻小豬蓋【房子】，', Float32Array.from(seg2), rate, b2[6] + 0.08)
    assert.ok(at2 >= b2[4] - 0.01 && at2 <= b2[4] + 0.06, `快慢不一：停在 ${at2.toFixed(3)} 秒，停頓在 ${b2[4].toFixed(3)}～${(b2[4] + 0.05).toFixed(3)}`)
    console.log(`ok 9 念到紅字前停的位置對齊到字和字之間的停頓（${at.toFixed(2)} 秒；字有快有慢時照每個字的高峰 ${at2.toFixed(2)} 秒）`)
  }
  console.log('ALL PASS')
}

main()
