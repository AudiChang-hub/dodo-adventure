// 遊戲角的「故事排順序」「聽兩步驟指令」、心情臉「為什麼」（T-164，src/games/order、src/games/listen、src/games/feel/why-plan.ts）的單元測試。
// 執行：npx tsx scripts/test-order-listen.ts（npm run verify 的「單元：故事排順序、聽兩步驟指令、心情臉『為什麼』」）
// 驗收：
//   故事排順序：故事 ≥ 40（4 張的 ≥ 12）、圖示都在、相鄰兩張圖不一樣、旁白 ≤ 6 個字；每一級 300 局：張數、第一張放好了、下面那排不是排好的順序、同一天不重複；升降級。
//   聽指令：顏色 6 × 東西 11 ＋ 不分顏色的 ≥ 24；每一級 300 局：東西數、步驟數、答案只有一個、兩個字都要聽（2、4 級）、同一天不重複；升降級。
//   心情臉「為什麼」：情境 ≥ 30、五種心情都有、驚訝的旁白不說心情的字；每一級 300 局：問法、選項數、驚訝不跟開心／害怕一起、答案唯一；熟練了才開、原本的不變；升降級。
//   台詞都有、≤ 6 個字、全部英文；音檔；家長區的名稱。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { STORIES, stepsFor } from '../src/games/order/data'
import { ORDER_MAX, ORDER_QS, ORDER_START, afterOrder, cardsOf, normalizeOrder, orderRound, storiesFor, type OrderLevel, type OrderMemory } from '../src/games/order/plan'
import { ALL_THINGS, COLORS, PLAIN, SHAPES, thingId, type Thing } from '../src/games/listen/data'
import { LISTEN_MAX, LISTEN_QS, LISTEN_START, afterListen, comboCount, listenRound, normalizeListen, stepsOf, thingsOf, usesColor, type ListenLevel, type ListenMemory } from '../src/games/listen/plan'
import { EMOS, MOODS, SPECIES_IDS, WHY_SITS, sitLength } from '../src/games/feel/data'
import { FEEL_MAX, FEEL_START, UP_AFTER, afterFeel, normalizeFeel, openWhyIfMastered } from '../src/games/feel/plan'
import { WHY_MAX, WHY_QS, WHY_START, afterWhy, canPair, normalizeWhy, whyRound, type WhyLevel, type WhyMemory } from '../src/games/feel/why-plan'
import { EMOJI } from '../src/art/emoji.generated'
import { PLAY_EMOJI } from '../src/games/play-emoji.generated'
import { LANG_EMOJI } from '../src/games/lang-emoji.generated'
import { logicSkillLabel, LOGIC_GAME_NAME } from '../src/games/logic/report'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'
import { segments } from '../src/content/lines'
import { clipName } from '../src/lib/clip'
import { capKey, praiseKey as orPraise } from '../src/games/order/lines'
import { isKey as lsIs, praiseKey as lsPraise, thenKey, touchKey } from '../src/games/listen/lines'
import { askKey, faceKey, isKey as flIs, respKey, sitKey, whyKey } from '../src/games/feel/lines'

function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}
const words = (t: string) => t.replace(/[.!?,…|]/g, ' ').split(/\s+/).filter(Boolean).length
const hasEmoji = (n: string) => !!(EMOJI[n] || PLAY_EMOJI[n] || LANG_EMOJI[n])
const ids = (ts: Thing[]) => ts.map(thingId)

function main() {
  // ── 故事排順序 ──
  {
    assert.ok(STORIES.length >= 40, `故事 ≥ 40：${STORIES.length}`)
    const four = STORIES.filter((s) => s.steps.length === 4)
    assert.ok(four.length >= 12, `4 張的故事 ≥ 12：${four.length}`)
    assert.equal(new Set(STORIES.map((s) => s.id)).size, STORIES.length, '故事 id 不重複')
    for (const s of STORIES) {
      assert.ok(s.steps.length === 3 || s.steps.length === 4, `${s.id} 3～4 張`)
      assert.equal(stepsFor(s, 3).length, 3, `${s.id} 排得出 3 張`)
      if (s.steps.length === 4) assert.ok(s.drop == null || (s.drop >= 0 && s.drop < 4), `${s.id} 的 drop`)
      s.steps.forEach((p, i) => {
        assert.ok(p.pic.length >= 1, `${s.id}#${i} 有圖`)
        assert.ok(words(p.say) <= 6, `${s.id}#${i} 旁白 ≤ 6 個字：${p.say}`)
        assert.ok(!/[一-鿿]/.test(p.say), `${s.id}#${i} 不念中文`)
        for (const b of p.pic) {
          if ('e' in b) assert.ok(hasEmoji(b.e), `${s.id}#${i} 的圖示 ${b.e}`)
          assert.ok(b.x >= 0 && b.x <= 100 && b.y >= 0 && b.y <= 100 && b.s > 0 && b.s <= 100, `${s.id}#${i} 在卡片裡`)
        }
        if (i > 0) assert.notDeepEqual({ pic: p.pic, bg: p.bg }, { pic: s.steps[i - 1].pic, bg: s.steps[i - 1].bg }, `${s.id} 相鄰兩張圖不一樣`)
      })
      // 3 張的版本也是相鄰不一樣
      const three = stepsFor(s, 3)
      assert.ok(three.every((v, k) => k === 0 || v > three[k - 1]), `${s.id} 3 張照原本的順序`)
    }
    console.log(`ok 1 故事排順序：${STORIES.length} 個故事（4 張的 ${four.length} 個），圖示都在、相鄰兩張不一樣、旁白 ≤ 6 個字、全部英文`)
  }
  {
    for (const level of [1, 2, 3] as OrderLevel[]) {
      const pool = storiesFor(level)
      const perDay = Math.floor(pool.length / ORDER_QS)
      const mem: OrderMemory = { day: '', today: [], recent: [] }
      const rnd = seeded(level * 17)
      let day = 0
      let seenToday: string[] = []
      for (let r = 0; r < 300; r++) {
        // 每 perDay 局換一天
        if (r % perDay === 0) {
          day++
          seenToday = []
        }
        const qs = orderRound(level, mem, `2026-11-${String(day).padStart(2, '0')}`, rnd)
        assert.equal(qs.length, ORDER_QS)
        assert.equal(new Set(qs.map((q) => q.story.id)).size, ORDER_QS, '一局的故事不重複')
        for (const q of qs) {
          assert.equal(q.steps.length, cardsOf(level))
          assert.equal(q.given, level === 1 ? 1 : 0, '1 級第一張放好了')
          assert.equal(q.deck.length, q.steps.length - q.given)
          assert.deepEqual(
            [...q.deck].sort((a, b) => a - b),
            Array.from({ length: q.steps.length - q.given }, (_, i) => i + q.given),
            '下面那排就是還沒放的那幾張',
          )
          assert.ok(
            q.deck.some((v, i) => v !== i + q.given),
            '下面那排不是排好的順序',
          )
          assert.ok(!seenToday.includes(q.story.id), `同一天不重複：${q.story.id}（level ${level}、第 ${r} 局）`)
          seenToday.push(q.story.id)
        }
      }
      console.log(`ok 2.${level} 故事排順序 ${level} 級：${cardsOf(level)} 張${level === 1 ? '（第一張放好了）' : ''}、${pool.length} 個故事、一天 ${perDay} 局都不重複`)
    }
    let s = { ...ORDER_START }
    s = afterOrder(s, { counted: 3, misses: 0 })
    assert.equal(s.level, 1)
    s = afterOrder(s, { counted: 3, misses: 0 })
    assert.equal(s.level, 2, '連續 2 局全對升級')
    s = afterOrder(s, { counted: 3, misses: 1 })
    assert.equal(s.streak, 0, '有錯就重算')
    s = afterOrder(s, { counted: 3, misses: 2 })
    assert.equal(s.level, 1, '一局 2 個故事有點錯退級')
    s = afterOrder(afterOrder({ ...s, level: ORDER_MAX }, { counted: 3, misses: 0 }), { counted: 3, misses: 0 })
    assert.equal(s.level, ORDER_MAX, '最高不再升')
    assert.equal(afterOrder({ ...ORDER_START }, { counted: 1, misses: 0 }).streak, 0, '示範、一起做的不算')
    assert.deepEqual(normalizeOrder('x'), ORDER_START)
    assert.deepEqual(normalizeOrder({ level: 9, streak: -1, taught: ['x', 2], today: [1, 'plant'] }), { ...ORDER_START, level: 3, taught: [2], today: ['plant'] })
    console.log('ok 3 故事排順序升降級：連續 2 局全對升、一局 ≥ 2 個故事有點錯退、壞掉的進度補預設')
  }
  // ── 聽兩步驟指令 ──
  {
    assert.equal(COLORS.length, 6)
    assert.ok(SHAPES.length >= 10, `有顏色的東西 ≥ 10：${SHAPES.length}`)
    assert.ok(PLAIN.length >= 24, `不分顏色的東西 ≥ 24：${PLAIN.length}`)
    assert.equal(new Set(ALL_THINGS.map(thingId)).size, ALL_THINGS.length, '東西不重複')
    for (const p of PLAIN) assert.ok(hasEmoji(p.emoji), `${p.id} 的圖示 ${p.emoji}`)
    assert.ok(hasEmoji('ear'))
    for (const l of [1, 2, 3, 4] as ListenLevel[]) assert.ok(comboCount(l) >= 25, `${l} 級的組合 ≥ 25：${comboCount(l)}`)
    console.log(`ok 4 聽指令詞彙：顏色 ${COLORS.length} × 東西 ${SHAPES.length} ＋ 不分顏色的 ${PLAIN.length} = ${ALL_THINGS.length} 樣；組合 1 級 ${comboCount(1)}、2 級 ${comboCount(2)}、3 級 ${comboCount(3)}、4 級 ${comboCount(4)} 種`)
  }
  {
    for (const level of [1, 2, 3, 4] as ListenLevel[]) {
      const mem: ListenMemory = { day: '', today: [] }
      const rnd = seeded(level * 29)
      const today: string[] = []
      const heads: string[] = []
      for (let r = 0; r < 300; r++) {
        // 一天 20 局（100 句）
        const day = `2026-11-${String(1 + Math.floor(r / 20)).padStart(2, '0')}`
        if (r % 20 === 0) {
          today.length = 0
          heads.length = 0
        }
        const qs = listenRound(level, mem, day, rnd)
        assert.equal(qs.length, LISTEN_QS)
        for (const q of qs) {
          assert.equal(q.things.length, thingsOf(level))
          assert.ok(q.things.length <= 4, '最多 4 樣（LOAD-1）')
          assert.equal(q.targets.length, stepsOf(level))
          assert.equal(new Set(ids(q.things)).size, q.things.length, '畫面上的東西不重複 → 答案只有一個')
          assert.equal(new Set(q.targets).size, q.targets.length, '兩步不是同一樣')
          for (const t of q.things) assert.equal(t.kind === 'color', usesColor(level), '這一級有沒有分顏色')
          if (!usesColor(level)) assert.equal(new Set(q.things.map((t) => (t.kind === 'plain' ? t.plain : ''))).size, q.things.length, '名字都不一樣')
          else {
            const T = q.targets.map((k) => q.things[k]) as Extract<Thing, { kind: 'color' }>[]
            const others = q.things.filter((_, k) => !q.targets.includes(k)) as Extract<Thing, { kind: 'color' }>[]
            if (level === 2) {
              assert.ok(
                others.some((o) => o.shape === T[0].shape && o.color !== T[0].color),
                '有同名字別的顏色',
              )
              assert.ok(
                others.some((o) => o.color === T[0].color && o.shape !== T[0].shape),
                '有同顏色別的東西',
              )
            } else {
              assert.ok(T[0].color !== T[1].color && T[0].shape !== T[1].shape, '兩個答案顏色、東西都不一樣')
              assert.ok(
                others.some((o) => o.color === T[1].color && o.shape === T[0].shape),
                '顏色對調的',
              )
              assert.ok(
                others.some((o) => o.color === T[0].color && o.shape === T[1].shape),
                '顏色對調的',
              )
            }
          }
          assert.ok(!today.includes(q.sig), `同一天不重複：${q.sig}（${level} 級）`)
          today.push(q.sig)
          const head = q.sig.split('|')[0]
          // 要點的組合夠多的（2～4 級）同一天也不會重複要點同樣的
          if (comboCount(level) >= 100) assert.ok(!heads.includes(head), `同一天要點的不重複：${head}`)
          heads.push(head)
        }
      }
      console.log(`ok 5.${level} 聽指令 ${level} 級：${thingsOf(level)} 樣、${stepsOf(level)} 步${usesColor(level) ? '、顏色＋名字（兩個字都要聽）' : '、只說名字'}；一天 100 句不重複`)
    }
    let s = { ...LISTEN_START }
    s = afterListen(afterListen(s, { counted: 5, misses: 0 }), { counted: 5, misses: 0 })
    assert.equal(s.level, 2, '連續 2 局全對升級')
    s = afterListen(s, { counted: 5, misses: 2 })
    assert.equal(s.level, 1, '一局 2 句沒做對退級')
    s = afterListen(afterListen({ ...s, level: LISTEN_MAX }, { counted: 5, misses: 0 }), { counted: 5, misses: 0 })
    assert.equal(s.level, LISTEN_MAX, '最高不再升')
    assert.equal(afterListen({ ...LISTEN_START }, { counted: 2, misses: 0 }).streak, 0, '示範、一起做的不算')
    assert.deepEqual(normalizeListen(null), LISTEN_START)
    assert.deepEqual(normalizeListen({ level: 0, today: ['a', 3] }), { ...LISTEN_START, level: 1, today: ['a'] })
    console.log('ok 6 聽指令升降級：連續 2 局全對升、一局 ≥ 2 句沒做對退、壞掉的進度補預設')
  }
  // ── 心情臉「為什麼」 ──
  {
    assert.ok(WHY_SITS.length >= 30, `情境 ≥ 30：${WHY_SITS.length}`)
    assert.equal(new Set(WHY_SITS.map((s) => s.id)).size, WHY_SITS.length, '情境 id 不重複')
    for (const m of MOODS) assert.ok(WHY_SITS.filter((s) => s.emo === m).length >= 8, `${m} ≥ 8 個`)
    for (const s of WHY_SITS.filter((s) => s.emo === 'surprised')) {
      assert.ok(words(s.say) <= 6, `${s.id} 旁白 ≤ 6 個字：${s.say}`)
      assert.ok(!/\b(happy|sad|angry|mad|scared|afraid|surprise|surprised|wow|whoa)\b/i.test(s.say), `${s.id} 旁白不說心情的字：${s.say}`)
      assert.ok(sitLength(s) <= 2600, `${s.id} 動畫 ≤ 2.6 秒`)
      for (const t of s.tracks) if ('e' in t.look) assert.ok(hasEmoji(t.look.e), `${s.id} 的圖示 ${t.look.e}`)
      for (const t of s.tracks) for (let i = 1; i < t.k.length; i++) assert.ok(t.k[i].t >= t.k[i - 1].t, `${s.id} 的時間點要照順序`)
    }
    console.log(`ok 7 心情臉「為什麼」：情境 ${WHY_SITS.length} 個（${MOODS.map((m) => `${m} ${WHY_SITS.filter((s) => s.emo === m).length}`).join('、')}）`)
  }
  {
    for (const level of [1, 2, 3] as WhyLevel[]) {
      const mem: WhyMemory = { sits: [], heroes: [] }
      const moods = new Set<string>()
      const sits = new Set<string>()
      for (let r = 0; r < 300; r++) {
        const qs = whyRound(level, mem, seeded(level * 53 + r))
        assert.equal(qs.length, WHY_QS)
        assert.equal(new Set(qs.map((q) => q.answer)).size, WHY_QS, '一局四種心情不重複')
        if (level === 1) assert.ok(qs.every((q) => q.mode === 'face'), '1 級看情境選心情')
        if (level === 2) assert.ok(qs.every((q) => q.mode === 'cause'), '2 級看臉選情境')
        if (level === 3) assert.equal(qs.filter((q) => q.mode === 'face').length, 2, '3 級兩種問法輪流')
        for (const q of qs) {
          assert.equal(q.moods.length, level === 3 ? 3 : 2, '選項數')
          assert.ok(q.moods.includes(q.answer))
          assert.equal(new Set(q.moods).size, q.moods.length)
          for (const a of q.moods) for (const b of q.moods) if (a !== b) assert.ok(canPair(a, b), `驚訝不跟開心、害怕一起：${q.moods}`)
          assert.equal(q.sit.emo, q.answer)
          assert.notEqual(q.hero, q.friend)
          if (q.mode === 'cause') {
            assert.equal(q.sits.length, q.moods.length)
            q.sits.forEach((s, k) => assert.equal(s.emo, q.moods[k], '小圖的心情跟選項一樣'))
            assert.equal(new Set(q.sits.map((s) => s.id)).size, q.sits.length, '小圖不重複')
            assert.equal(q.sits.filter((s) => s.emo === q.answer).length, 1, '答案只有一張')
          }
          moods.add(q.answer)
          q.sits.forEach((s) => sits.add(s.id))
        }
      }
      assert.deepEqual(moods, new Set(MOODS), '五種心情都會出')
      assert.ok(sits.size >= WHY_SITS.length - 2, `情境都輪得到：${sits.size}/${WHY_SITS.length}`)
      console.log(`ok 8.${level} 「為什麼」${level} 級：${level === 1 ? '看情境選心情 2 選 1' : level === 2 ? '看臉選情境 2 選 1' : '兩種輪流 3 選 1'}、五種心情都會出、情境 ${sits.size} 個都輪得到`)
    }
    // 熟練了才開：原本的最高一級連續 2 局全對；原本的升降級不變
    let f = { ...FEEL_START }
    assert.equal(f.whyOpen, false)
    for (let r = 0; r < 4; r++) {
      f = openWhyIfMastered(afterFeel(f, { counted: 4, misses: 0 }))
      assert.equal(f.whyOpen, false, '還沒到最高一級不開')
    }
    assert.equal(f.level, FEEL_MAX)
    f = openWhyIfMastered(afterFeel(f, { counted: 4, misses: 1 }))
    assert.equal(f.whyOpen, false, '最高一級有錯不開')
    for (let r = 0; r < UP_AFTER - 1; r++) f = openWhyIfMastered(afterFeel(f, { counted: 4, misses: 0 }))
    assert.equal(f.whyOpen, false, `最高一級要連續 ${UP_AFTER} 局全對`)
    f = openWhyIfMastered(afterFeel(f, { counted: 4, misses: 0 }))
    assert.equal(f.whyOpen, true, '熟練了開「為什麼」')
    f = openWhyIfMastered(afterFeel(f, { counted: 4, misses: 3 }))
    assert.equal(f.whyOpen, true, '開了就一直開著')
    assert.deepEqual(normalizeFeel({ ...f, whyOpen: 'yes' }).whyOpen, false)
    assert.deepEqual(normalizeFeel(null).why, WHY_START)
    let w = { ...WHY_START }
    w = afterWhy(afterWhy(w, { counted: 4, misses: 0 }), { counted: 4, misses: 0 })
    assert.equal(w.level, 2)
    w = afterWhy(w, { counted: 4, misses: 2 })
    assert.equal(w.level, 1, '退級')
    w = afterWhy(w, { counted: 4, misses: 4 })
    assert.equal(w.level, 1, '最低 1 級，不會退回原本的玩法')
    w = afterWhy(afterWhy({ ...w, level: WHY_MAX }, { counted: 4, misses: 0 }), { counted: 4, misses: 0 })
    assert.equal(w.level, WHY_MAX)
    assert.deepEqual(normalizeWhy({ level: 7, taught: [1, 'a'] }), { ...WHY_START, level: 3, taught: [1] })
    console.log('ok 9 「為什麼」熟練了才開（原本的最高一級連續 2 局全對）、開了不關；原本的升降級不變；「為什麼」升降級')
  }
  // ── 台詞、音檔、家長區 ──
  {
    const keys = ['or.intro', 'or.ask.first', 'or.ask.next', 'or.ask.last', 'or.again', 'or.done', 'or.retell', 'or.w.first', 'or.w.then', 'or.w.last', 'ls.intro', 'ls.intro2', 'ls.done', 'ls.again', 'fl.why.intro', 'fl.done', 'fl.again', 'teach.watch.dodo', 'teach.turn.dodo', 'd.next.home']
    for (let i = 0; i < 3; i++) keys.push(orPraise(i))
    for (let i = 0; i < 4; i++) keys.push(lsPraise(i))
    for (const s of STORIES) s.steps.forEach((_, i) => keys.push(capKey(s.id, i)))
    for (const t of ALL_THINGS) keys.push(touchKey(t), thenKey(t), lsIs(t))
    for (const sp of SPECIES_IDS) {
      keys.push(askKey(sp))
      for (const m of MOODS) keys.push(whyKey(sp, m), flIs(sp, m))
    }
    for (const m of MOODS) keys.push(faceKey(m), respKey(m, 0), respKey(m, 1), respKey(m, 2))
    for (const s of WHY_SITS) keys.push(sitKey(s.id))
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    const mine = [...new Set(keys.filter((k) => /^(or|ls|fl)\./.test(k)))]
    for (const k of mine) {
      assert.ok(words(line(k).text.replace(/\|/g, ' ')) <= 6, `${k} ≤ 6 個字：${line(k).text}`)
      assert.ok(!/[一-鿿]/.test(line(k).text), `不念中文：${k}`)
    }
    // 拼起來的兩步驟指令（Touch the red ball. Then the blue car.）每一步 ≤ 6 個字
    for (const t of ALL_THINGS) assert.ok(words(line(touchKey(t)).text) <= 6 && words(line(thenKey(t)).text) <= 6)
    const files = new Set(mine.flatMap((k) => segments(line(k)).map((s) => clipName(line(k), s))))
    if (existsSync('public/audio')) {
      const miss = [...files].filter((n) => !existsSync(`public/audio/${n}.mp3`))
      assert.deepEqual(miss.slice(0, 10), [], `缺音檔 ${miss.length} 個`)
      console.log(`ok 10 台詞都有（${keys.length} 句，每句 ≤ 6 個字、全部英文），音檔 ${files.size} 個都在`)
    } else console.log(`ok 10 台詞都有（${keys.length} 句，每句 ≤ 6 個字、全部英文）；（跳過）沒有 public/audio，不檢查音檔`)
  }
  {
    assert.equal(LOGIC_GAME_NAME['logic-order'], '故事排順序')
    assert.equal(LOGIC_GAME_NAME['logic-listen'], '聽指令')
    for (const k of ['order:3-first', 'order:3', 'order:4', 'listen:1-name', 'listen:1-color', 'listen:2-name', 'listen:2-color', 'feel:why-face', 'feel:why-cause']) assert.ok(logicSkillLabel(k, 'logic'), k)
    for (const e of EMOS) assert.ok(logicSkillLabel(`feel:${e}`, 'logic'), `原本的 feel:${e} 還在`)
    console.log('ok 11 家長區：遊戲名稱、技能名稱')
  }
  console.log('ALL PASS')
}

main()
