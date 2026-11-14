// 中文的 4 歲內容（T-150 Z，src/lessons/chinese/stage4.ts）：門的開、退級、暫停、混著出；找一樣的字第 4 級；加長版排進一堂課；舊進度照常。
// 造假的作答紀錄：剛好差 1 題、差 1 天、只有 2 選 1、沒聽完就點、手帶著做的、沒有隔 2 天再考，門都不能開。
// 執行：npx tsx scripts/test-zh-stage4.ts（npm run verify 的「單元：中文 4 歲內容」）
import assert from 'node:assert/strict'
import type { Attempt } from '../src/lib/db'
import { ZH_TEXTS, longOf, type ZhText } from '../src/lessons/chinese/data'
import { GLYPH_START, afterGlyph, type GlyphState } from '../src/lessons/chinese/match'
import { stepsOf } from '../src/lessons/chinese/steps'
import { FRESH_DAYS, NO_STAGE4, PAUSE_KEY, STAGE4_KEY, STAGE4_ON, advance, gates, glyphMax, longReady, planToday, type Stage4Kv } from '../src/lessons/chinese/stage4'

const day = (i: number) => new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10)
let seq = 0
/** 一筆作答（預設：三選一、自己答、第一次就對） */
function at(o: { skill: string; d: number; ok?: boolean; level?: number; options?: number; phase?: 'quiz' | 'guided'; heard?: boolean; long?: boolean }): Attempt {
  seq++
  const word = o.skill.split(':')[1]
  return {
    id: `a${seq}`,
    ts: Date.UTC(2026, 11, 1 + o.d) + seq,
    date: day(o.d),
    sessionId: 's',
    station: 'mandarin',
    game: o.skill.startsWith('zhglyph:') ? 'zh-glyph' : 'zh-lesson',
    itemId: `1:${word}`,
    skill: o.skill,
    phase: o.phase ?? 'quiz',
    level: o.level ?? 1,
    options: [word, 'x', 'y', 'z'].slice(0, o.options ?? 3),
    answer: word,
    taps: [],
    firstTryCorrect: o.ok ?? true,
    attempts: 1,
    responseMs: 1500,
    hintUsed: false,
    ...(o.heard === undefined ? {} : { heard: o.heard }),
    ...(o.long ? { metrics: { long: 1 } } : {}),
    synced: 0,
  }
}
const W = ['小狗', '骨頭', '青菜', '紅蘿蔔', '房子', '碗']
/**
 * 選圖：days 每一天答 per 題（字詞輪流），ok(i) 決定第 i 題對不對。
 * 預設的日子 0、1、2、5、6：同一個字詞隔了 3 天又考到（記得住）
 */
function texts(days = [0, 1, 2, 5, 6], per = 4, ok: (i: number) => boolean = () => true, extra: Partial<Parameters<typeof at>[0]> = {}): Attempt[] {
  const out: Attempt[] = []
  let i = 0
  for (const d of days) for (let k = 0; k < per; k++, i++) out.push(at({ skill: `zhtext:${W[i % W.length]}`, d, ok: ok(i), ...extra }))
  return out
}
const glyph3 = (d = 6) => at({ skill: 'zhglyph:狗', d, level: 3 })
/** 第 3 級的找字熟練：5 天、每天 2 題（同一個字隔 3 天又考到） */
const glyph3Firm = () => [0, 1, 2, 5, 6].flatMap((d) => ['狗', '碗'].map((c) => at({ skill: `zhglyph:${c}`, d, level: 3 })))

function main() {
  assert.equal(STAGE4_ON, true, '4 歲內容總開關平常是開的')
  assert.equal(STAGE4_KEY, 'lesson.chinese.stage4')
  assert.equal(PAUSE_KEY, 'stage4.paused.zh')
  const today = day(7)

  // ── 1. 加長版的門：全部做到才開 ──────────────────────────────
  {
    const good = [...texts(), glyph3()]
    assert.ok(longReady(good).ok, longReady(good).need)
    const kv = advance({}, good, today)
    assert.deepEqual(kv['zh-long'], { opened: today, level: 1 })
    const cases: [string, Attempt[]][] = [
      ['剛好差 1 題（19 題，NEXT-3 要 20 題）', [...texts([0, 1, 2, 5, 6], 4).slice(1), glyph3()]],
      ['差 1 天（都在 2 天裡）', [...texts([0, 3], 10), glyph3()]],
      ['只有 2 選 1', [...texts(undefined, undefined, undefined, { options: 2 }), glyph3()]],
      ['全是沒聽完就點', [...texts(undefined, undefined, undefined, { heard: false }), glyph3()]],
      ['全是手帶著做的', [...texts(undefined, undefined, undefined, { phase: 'guided' }), glyph3()]],
      ['20 題對 17 題（85%，要 90%）', [...texts(undefined, undefined, (i) => i % 7 !== 3), glyph3()]],
      ['沒有隔 2 天再考（天天練，每個字詞天天考）', [...texts([0, 1, 2, 3, 4], 6), glyph3()]],
      ['找一樣的字還沒到第 3 級', [...texts(), at({ skill: 'zhglyph:狗', d: 6, level: 2 })]],
      ['第 3 級的找字只有手示範的', [...texts(), at({ skill: 'zhglyph:狗', d: 6, level: 3, phase: 'guided' })]],
    ]
    for (const [why, xs] of cases) {
      assert.equal(longReady(xs).ok, false, `${why}：門不能開`)
      assert.deepEqual(advance({}, xs, today), {}, `${why}：門不能開`)
      const g = gates(xs, {}, today)[0]
      assert.ok(!g.open && g.need.length > 0, `${why}：家長區寫得出還差什麼`)
    }
    console.log(`ok 1 加長版的門：全部做到才開；${cases.map((c) => c[0]).join('、')}，門都不開，家長區寫得出還差什麼`)
  }

  // ── 2. 開了不關，答不好退回短版，再答穩升回來 ─────────────────
  {
    const base = [...texts(), glyph3()]
    let kv = advance({}, base, today)
    // 加長版裡的選圖全錯（最近 6 題對 0 題）
    const bad = [8, 8, 9, 9, 10, 10].map((d, i) => at({ skill: `zhtext:${W[i % W.length]}`, d, ok: false, long: true }))
    kv = advance(kv, [...base, ...bad], day(11))
    assert.equal(kv['zh-long']?.level, 0, '退回短版')
    assert.equal(kv['zh-long']?.opened, today, '門的開門日不變')
    assert.equal(kv['zh-long']?.downOn, day(11))
    const g = gates([...base, ...bad], kv, day(11))[0]
    assert.ok(g.open && g.level === 0 && g.need.includes('短版'), '家長區：開著、先用短版')
    assert.equal(planToday(kv, day(11), 4, 3).long, false, '退回短版：複習用短版')
    // 6 題對 4 題：不退
    const mid = [8, 8, 9, 9, 10, 10].map((d, i) => at({ skill: `zhtext:${W[i % W.length]}`, d, ok: i < 4, long: true }))
    assert.equal(advance(advance({}, base, today), [...base, ...mid], day(11))['zh-long']?.level, 1, '6 題對 4 題不退')
    // 只答了 5 題（全錯）：還不判斷
    assert.equal(advance(advance({}, base, today), [...base, ...bad.slice(1)], day(11))['zh-long']?.level, 1, '不到 6 題不退')
    // 退了以後，同一天再算一次不會升回去（退的那天以前的作答不算）
    assert.equal(advance(kv, [...base, ...bad], day(11))['zh-long']?.level, 0)
    // 退了以後，又答穩了（之後的日子、同樣的門檻：20 題 90%、mastery）→ 升回加長版
    const again = texts([12, 13, 14, 17, 18])
    const up = advance(kv, [...base, ...bad, ...again], day(19))
    assert.equal(up['zh-long']?.level, 1, '答穩了，回到加長版')
    // 退了以後答得還不夠穩：照樣短版
    assert.equal(advance(kv, [...base, ...bad, ...again.slice(0, 15)], day(19))['zh-long']?.level, 0)
    // 升回去以後，退之前那些錯的不會又讓它馬上退
    assert.equal(advance(up, [...base, ...bad, ...again], day(20))['zh-long']?.level, 1)
    console.log('ok 2 開了不關：加長版選圖最近 6 題對 ≤ 3 題退回短版（門還開著、家長區看得到），之後的作答再過同樣的門檻才升回來')
  }

  // ── 3. 4 選 1 的門：加長版開了、隔天以後、第 3 級熟練；一天一道門 ───
  {
    const all = [...texts(), ...glyph3Firm()]
    const k1 = advance({}, all, today)
    assert.ok(k1['zh-long'] && !k1['zh-glyph4'], '兩道都夠了：同一天只開加長版')
    assert.deepEqual(advance(k1, all, today), k1, '同一天再進來也不開第二道')
    const k2 = advance(k1, all, day(8))
    assert.deepEqual(k2['zh-glyph4'], { opened: day(8) }, '隔天開 4 選 1')
    // 第 3 級還不熟（最近 10 題對 7 題）
    const weak = [...texts(), ...glyph3Firm().map((a, i) => ({ ...a, firstTryCorrect: i % 3 !== 0 }))]
    assert.equal(advance(k1, weak, day(8))['zh-glyph4'], undefined, '第 3 級還不熟不開')
    // 第 3 級只有 2 選 1 那種（第 1 級）的作答：不算
    const lv1 = [...texts(), ...glyph3Firm().map((a) => ({ ...a, level: 1, options: a.options.slice(0, 2) })), glyph3()]
    assert.equal(advance(k1, lv1, day(8))['zh-glyph4'], undefined, '第 1、2 級的作答不算第 3 級熟練')
    // 加長版還沒開：4 選 1 不開
    const g = gates(all, {}, today)[1]
    assert.ok(!g.open && g.need.includes('加長版'), g.need)
    assert.equal(gates(all, k2, day(8))[1].open, true)
    console.log('ok 3 找一樣的字 4 選 1 的門：加長版開了、隔天以後、第 3 級照 mastery 熟練才開；同一天最多開一道門')
  }

  // ── 4. 暫停 ─────────────────────────────────────────────────
  {
    const all = [...texts(), ...glyph3Firm()]
    assert.deepEqual(advance({}, all, today, true), {}, '暫停時門不開')
    const kv: Stage4Kv = { 'zh-long': { opened: day(0), level: 1 }, 'zh-glyph4': { opened: day(1) } }
    assert.deepEqual(planToday(kv, day(30), 4, 4, true), NO_STAGE4, '暫停時照 3 歲的上')
    assert.equal(glyphMax(kv, true), 3, '暫停時找字最多第 3 級')
    assert.equal(glyphMax(kv, false), 4)
    assert.equal(glyphMax({}, false), 3, '門沒開最多第 3 級')
    // 暫停時找字在第 4 級：先降到 3（不會出 4 選 1）
    const s4: GlyphState = { level: 4, recent: [], demos: 3, learned: true }
    assert.equal(afterGlyph(s4, { date: day(30), first: true, demo: false, led: false, level: 3 }, 3).level, 3)
    // 暫停時排的課：沒有加長版、沒有 4 選 1
    const t = ZH_TEXTS.find((x) => x.day === 12)!
    const old = ZH_TEXTS.find((x) => x.day === 9)!
    const steps = stepsOf({ t, n: 1, old, review: [] }, new Set([9]), s4, rnd(1), planToday(kv, day(30), 4, 4, true))
    assert.ok(steps.every((s) => !s.t.long && (s.k !== 'glyph' || s.q.level <= 3)))
    console.log('ok 4 暫停（kv stage4.paused.zh＝true）：門不開、照 3 歲的上（沒有加長版、沒有 4 選 1）、找字退回第 3 級；預設不暫停')
  }

  // ── 5. 怎麼混著出 ───────────────────────────────────────────
  {
    const kv: Stage4Kv = { 'zh-long': { opened: day(0), level: 1 } }
    const fresh = [4, 5, 6, 7].map((i) => planToday(kv, day(3), i, 3).long)
    assert.deepEqual(fresh, [true, false, true, false], '頭 14 天每 2 次複習 1 次加長版')
    assert.deepEqual([4, 5].map((i) => planToday(kv, day(FRESH_DAYS), i, 3).long), [true, true], '14 天以後每次複習都用加長版')
    const both: Stage4Kv = { ...kv, 'zh-glyph4': { opened: day(1) } }
    assert.equal(planToday(both, day(3), 4, 4).glyph4, 0, '頭 14 天：這堂用了加長版就不出 4 選 1（一堂最多 1 個 4 歲回合）')
    assert.equal(planToday(both, day(3), 5, 4).glyph4, 1, '頭 14 天：沒用加長版的那堂出 1 題 4 選 1')
    assert.equal(planToday(both, day(1 + FRESH_DAYS), 5, 4).glyph4, 'half', '14 天以後最多一半')
    assert.equal(planToday(both, day(1 + FRESH_DAYS), 5, 3).glyph4, 0, '找字退回第 3 級：不出 4 選 1')
    assert.equal(planToday(both, day(3), 5, 4).demo4, true, '第一次出 4 選 1：手先示範')
    assert.equal(planToday({ ...both, 'zh-glyph4': { opened: day(1), demoed: true } }, day(3), 5, 4).demo4, false, '示範過就不再示範')
    console.log('ok 5 混著出：頭 14 天每 2 次複習 1 次加長版、一堂最多 1 個 4 歲回合；之後每次複習都加長、4 選 1 最多一半；第一次 4 選 1 手先示範')
  }

  // ── 6. 排進一堂課：舊篇用加長版、新篇短版；沒有加長版的篇照常 ─────
  {
    const withLong = ZH_TEXTS.filter((t) => t.linesLong?.length)
    const without = ZH_TEXTS.filter((t) => !t.linesLong?.length)
    assert.ok(withLong.length >= 30, `至少寫 30 篇加長版（現在 ${withLong.length} 篇）`)
    const s4 = planToday({ 'zh-long': { opened: day(0), level: 1 } }, day(20), 4, 3)
    let n = 0
    for (const old of [...withLong, ...without.slice(0, 20)]) {
      const t = ZH_TEXTS.find((x) => x.day === old.day + 3) ?? ZH_TEXTS[0]
      const done = new Set(ZH_TEXTS.filter((x) => x.day <= old.day + 3).map((x) => x.day))
      const steps = stepsOf({ t, n: 1, old, review: [ZH_TEXTS[0]] }, done, GLYPH_START, rnd(old.day), s4)
      const oldRead = steps.find((s) => s.part === 'old' && s.k === 'read')!
      const newRead = steps.find((s) => s.part === 'new' && s.k === 'read')!
      const has = !!old.linesLong?.length
      assert.equal(!!oldRead.t.long, has, `第 ${old.day} 篇：${has ? '舊篇用加長版' : '沒有加長版，用短版'}`)
      assert.deepEqual(oldRead.t.lines, has ? old.linesLong : old.lines)
      assert.ok(!newRead.t.long && newRead.t.lines === t.lines, '新篇照舊短版')
      for (const s of steps.filter((x) => x.part === 'old')) assert.equal(!!s.t.long, has, '舊篇的選圖、找字也是加長版（選圖記 long、找字的字從加長版挑）')
      assert.ok(steps.filter((x) => x.part === 'review').every((x) => !x.t.long), '小複習照舊')
      // 跟沒有 4 歲內容時比：步驟一樣多、題目一樣（選圖題不變）
      const plain = stepsOf({ t, n: 1, old, review: [ZH_TEXTS[0]] }, done, GLYPH_START, rnd(old.day))
      assert.deepEqual(
        steps.map((s) => (s.k === 'quiz' ? s.q.word : s.k)),
        plain.map((s) => (s.k === 'quiz' ? s.q.word : s.k)),
      )
      n++
    }
    // 沒給 4 歲內容（舊的呼叫方式）＝ NO_STAGE4
    const t = ZH_TEXTS[20]
    const a = stepsOf({ t, n: 1, old: ZH_TEXTS[10], review: [] }, new Set(), GLYPH_START, rnd(3))
    const b = stepsOf({ t, n: 1, old: ZH_TEXTS[10], review: [] }, new Set(), GLYPH_START, rnd(3), NO_STAGE4)
    assert.deepEqual(a, b)
    console.log(`ok 6 排進一堂課（${n} 篇）：門開了以後舊篇用加長版（念的、選圖、找字都是），新篇、小複習照舊短版；沒有加長版的篇照常短版；沒有 4 歲內容時跟以前一模一樣`)
  }

  // ── 7. 找字第 4 級排進一堂課 ──────────────────────────────────
  {
    const g4: GlyphState = { level: 4, recent: [], demos: 3, learned: true }
    const kv: Stage4Kv = { 'zh-long': { opened: day(0), level: 1 }, 'zh-glyph4': { opened: day(1) } }
    let fours = 0
    for (const old of ZH_TEXTS.filter((x) => x.linesLong?.length)) {
      const t = ZH_TEXTS.find((x) => x.day === old.day + 3)!
      for (const [idx, d] of [[5, day(3)], [4, day(3)], [5, day(30)]] as const) {
        const p4 = planToday(kv, d, idx, 4)
        const steps = stepsOf({ t, n: 1, old, review: [] }, new Set(), g4, rnd(old.day), p4)
        const gs = steps.filter((s) => s.k === 'glyph')
        const n4 = gs.filter((s) => s.k === 'glyph' && s.q.level === 4).length
        const cap = p4.glyph4 === 'half' ? Math.max(1, Math.floor(gs.length / 2)) : p4.glyph4
        assert.ok(n4 <= cap, `第 ${old.day} 篇：4 選 1 出了 ${n4} 題（最多 ${cap}）`)
        assert.ok(gs.every((s) => s.k === 'glyph' && (s.q.level === 4 ? s.q.options.length === 4 : s.q.options.length === 3)), '沒輪到的照第 3 級（3 選 1）')
        const firstFour = steps.findIndex((s) => s.k === 'glyph' && s.q.level === 4)
        if (firstFour >= 0) assert.equal((steps[firstFour] as { demo: boolean }).demo, p4.demo4, '第一題 4 選 1 照 demo4 示範')
        fours += n4
      }
    }
    assert.ok(fours > 0, '有出到 4 選 1')
    // 找字在第 3 級（門開了但還沒升）：照第 3 級出
    const s3 = stepsOf({ t: ZH_TEXTS[12], n: 1, old: ZH_TEXTS[9], review: [] }, new Set(), { ...g4, level: 3 }, rnd(1), planToday(kv, day(30), 5, 3))
    assert.ok(s3.every((s) => s.k !== 'glyph' || s.q.level === 3))
    console.log(`ok 7 找字第 4 級排進一堂課：頭 14 天一堂最多 1 題、之後最多一半（共出了 ${fours} 題 4 選 1），其他照 3 選 1；第一題 4 選 1 手先示範`)
  }

  // ── 8. 找字升降級（第 4 級）──────────────────────────────────
  {
    const r = (d: number, first: boolean, level?: number) => ({ date: day(d), first, demo: false, led: false, ...(level ? { level } : {}) })
    // 第 3 級熟練（8 題 ≥ 7、≥ 3 天）：門沒開停在 3；門開了升到 4
    let s3: GlyphState = { level: 3, recent: [], demos: 3, learned: true }
    let s4 = s3
    for (let i = 0; i < 8; i++) {
      s3 = afterGlyph(s3, r(Math.floor(i / 3), true))
      s4 = afterGlyph(s4, r(Math.floor(i / 3), true), 4)
    }
    assert.equal(s3.level, 3, '門沒開：最多第 3 級')
    assert.equal(s4.level, 4, '門開了：第 3 級熟練升到第 4 級')
    // 第 4 級：連錯 2 題退回 3
    assert.equal(afterGlyph(afterGlyph(s4, r(5, false), 4), r(5, false), 4).level, 3)
    // 第 4 級：最近 6 題對 3 題（沒有連錯 2 題）退回 3
    let s = s4
    for (const ok of [true, false, true, false, true, false]) s = afterGlyph(s, r(6, ok), 4)
    assert.equal(s.level, 3, '最近 6 題對 3 題退回第 3 級')
    // 6 題對 4 題不退
    s = s4
    for (const ok of [true, false, true, false, true, true]) s = afterGlyph(s, r(6, ok), 4)
    assert.equal(s.level, 4)
    // 這一題是照第 3 級出的（這一堂 4 選 1 出夠了）：不算進第 4 級
    const kept = afterGlyph(afterGlyph(s4, r(6, false, 3), 4), r(6, false, 3), 4)
    assert.equal(kept.level, 4, '照第 3 級出的題答錯不會讓第 4 級退')
    assert.deepEqual(kept.recent, [])
    // 示範、手指著的：不算
    assert.equal(afterGlyph(s4, { date: day(6), first: false, demo: true, led: false, level: 4 }, 4).recent.length, 0)
    console.log('ok 8 找字第 4 級：第 3 級熟練、門開了才升；連錯 2 題或最近 6 題對 ≤ 3 題退回 3；照第 3 級出的題、示範的題不算')
  }

  // ── 9. 舊進度相容 ───────────────────────────────────────────
  {
    // 舊的找字狀態（第 1～3 級、沒有新欄位）照常
    const old: GlyphState = { level: 2, recent: [{ date: day(0), ok: true }], demos: 1, learned: true }
    assert.equal(afterGlyph(old, { date: day(1), first: true, demo: false, led: false }).level, 2)
    assert.equal(afterGlyph(old, { date: day(1), first: true, demo: false, led: false }, 4).level, 2, '門開了也要一級一級升')
    // 沒有 kv（舊版）：門都關、照 3 歲的上
    assert.deepEqual(planToday({}, today, 4, 3), { long: false, glyph4: 0, demo4: false })
    assert.ok(gates([], {}, today).every((g) => !g.open))
    // 舊的作答（沒有 metrics.long）不會讓加長版退
    const base = [...texts(), glyph3()]
    const k = advance({}, base, today)
    const plainWrong = [8, 8, 9, 9, 10, 10].map((d, i) => at({ skill: `zhtext:${W[i % W.length]}`, d, ok: false }))
    assert.equal(advance(k, [...base, ...plainWrong], day(11))['zh-long']?.level, 1, '短版的選圖錯了不算加長版答不好')
    // gates 的形狀（家長區 T-150 P 接）
    for (const g of gates(base, k, today)) assert.ok(typeof g.id === 'string' && typeof g.label === 'string' && typeof g.open === 'boolean' && typeof g.need === 'string')
    // 加長版：做得出、沒有的篇是 null；同一篇做兩次一樣
    const t = ZH_TEXTS.find((x) => x.linesLong?.length) as ZhText
    const L = longOf(t)!
    assert.equal(longOf(L), L, '已經是加長版的再做一次還是它')
    assert.equal(longOf(ZH_TEXTS.find((x) => !x.linesLong)!), null)
    console.log('ok 9 舊進度：沒有 stage4 的 kv 門都關、照 3 歲的上；舊的找字狀態照常一級一級升；短版的作答不算加長版')
  }
  console.log('ALL PASS')
}

/** 固定的亂數 */
function rnd(seed: number) {
  let x = seed >>> 0 || 1
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

main()
