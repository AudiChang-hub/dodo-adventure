// 遊戲角的「躲在哪裡」「心情臉」（T-160，src/games/where、src/games/feel）的單元測試。
// 執行：npx tsx scripts/test-where-feel.ts（npm run verify 的「單元：躲在哪裡、心情臉」）
// 驗收：內容量（動物 ≥ 20、大東西 ≥ 20、場景 ≥ 10、組合 ≥ 200；情境 ≥ 60、每種心情 ≥ 15、主角 ≥ 12）、圖示都在；
// 每一級出 300 題：選項數對、答案只有一個、不跟最近幾題一樣；只有 in、on、under；升降級；台詞都有、句子 ≤ 6 個字；家長區的名稱。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { ANIMAL, HIDERS, OBJECT_IDS, OBJECTS, PLACE_IDS, PLACES, RELS, relsOf } from '../src/games/where/data'
import { RECENT_SIGS, WHERE_MAX, WHERE_QS, WHERE_START, afterWhere, comboCount, normalizeWhere, objectsFor, whereRound, type WhereLevel, type WhereMemory } from '../src/games/where/plan'
import { EMOS, SITUATIONS, SPECIES, SPECIES_IDS, sitLength } from '../src/games/feel/data'
import { FEEL_MAX, FEEL_QS, FEEL_START, RECENT_SITS, afterFeel, feelOptions, feelRound, normalizeFeel, type FeelLevel, type FeelMemory } from '../src/games/feel/plan'
import { EMOJI } from '../src/art/emoji.generated'
import { PLAY_EMOJI } from '../src/games/play-emoji.generated'
import { logicSkillLabel, LOGIC_GAME_NAME } from '../src/games/logic/report'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'
import { segments } from '../src/content/lines'
import { clipName } from '../src/lib/clip'
import { atKey, findKey, isKey as whIs } from '../src/games/where/lines'
import { askKey, faceKey, isKey as flIs, respKey, sitKey } from '../src/games/feel/lines'

function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}
const words = (t: string) => t.replace(/[.!?,]/g, ' ').split(/\s+/).filter(Boolean).length
const hasEmoji = (n: string) => !!(EMOJI[n] || PLAY_EMOJI[n])

function main() {
  // ── 躲在哪裡 ──
  {
    assert.ok(HIDERS.length >= 20, `小動物 ≥ 20：${HIDERS.length}`)
    assert.ok(OBJECT_IDS.length >= 20, `大東西 ≥ 20：${OBJECT_IDS.length}`)
    assert.ok(PLACE_IDS.length >= 10, `場景 ≥ 10：${PLACE_IDS.length}`)
    assert.equal(new Set(HIDERS.map((h) => h.id)).size, HIDERS.length, '小動物不重複')
    for (const h of HIDERS) assert.ok(hasEmoji(h.emoji), `${h.id} 的圖示 ${h.emoji}`)
    for (const o of OBJECT_IDS) {
      assert.ok(relsOf(o).length >= 2, `${o} 至少兩種位置`)
      assert.ok(
        PLACE_IDS.some((p) => PLACES[p].things.includes(o)),
        `${o} 至少放在一個場景`,
      )
      // 小動物不會小到點不到（平板上約 1.1 倍：≥ 75 → ≥ 80 px，點的範圍另外放大到 ≥ 132）
      for (const s of OBJECTS[o].slots) assert.ok(ANIMAL * (s.k ?? 1) >= 75, `${o} 的位置太小`)
    }
    for (const p of PLACE_IDS) for (const o of PLACES[p].things) assert.ok(OBJECTS[o], `${p} 的 ${o}`)
    const n = comboCount()
    assert.ok(n >= 200, `組合 ≥ 200：${n}`)
    console.log(`ok 1 躲在哪裡：小動物 ${HIDERS.length}、大東西 ${OBJECT_IDS.length}、場景 ${PLACE_IDS.length}，組合 ${n} 種（場景 × 放得下的大東西 × 動物 × 位置）`)
  }
  {
    // 每一級 300 局：選項數、答案唯一、位置只有 in/on/under、同一題的位置不重疊
    for (const level of [1, 2, 3] as WhereLevel[]) {
      const mem: WhereMemory = { sigs: [], places: [], objs: [], hiders: [] }
      const rnd = seeded(level * 101)
      const seen: string[] = []
      let repeats = 0
      let prev: { obj: string; place: string } | null = null
      for (let r = 0; r < 300; r++) {
        const qs = whereRound(level, mem, rnd)
        assert.equal(qs.length, WHERE_QS)
        for (const q of qs) {
          const n = q.hidden.length
          if (level === 1) assert.equal(n, 2)
          else if (level === 2) assert.equal(n, 3)
          else assert.ok(n === 3 || n === 4, `3 級 3～4 隻：${n}`)
          assert.ok(n <= 4, '最多 4 個選項（LOAD-1）')
          const t = q.hidden[q.answer]
          assert.equal(q.hidden.filter((h) => h.hider === t.hider && h.rel === t.rel).length, 1, '答案只有一個')
          assert.equal(new Set(q.hidden.map((h) => h.slot)).size, n, '不會兩隻擠在同一個位置')
          for (const h of q.hidden) {
            assert.ok(RELS.includes(h.rel), `只有 in、on、under：${h.rel}`)
            assert.equal(OBJECTS[q.obj].slots[h.slot].rel, h.rel, '位置對得上')
          }
          if (level === 1) assert.equal(new Set(q.hidden.map((h) => h.hider)).size, 1, '1 級同一種動物')
          if (level === 2) assert.deepEqual(new Set(q.hidden.map((h) => h.rel)), new Set(RELS), '2 級 in、on、under 各一')
          if (level === 3) {
            assert.equal(new Set(q.hidden.map((h) => h.hider)).size, 2, '3 級兩種動物')
            assert.ok(new Set(q.hidden.map((h) => h.rel)).size >= 2, '3 級位置也不同')
          }
          assert.ok(PLACES[q.place].things.includes(q.obj), `${q.place} 放得下 ${q.obj}`)
          if (prev) assert.ok(prev.obj !== q.obj && prev.place !== q.place, '連著兩題不同的大東西、場景')
          prev = q
          if (seen.slice(-RECENT_SIGS).includes(q.sig)) repeats++
          seen.push(q.sig)
        }
        // 一局 4 題 in、on、under 都有
        if (level !== 3 || qs.every((q) => objectsFor(3, q.hidden[q.answer].rel).length)) assert.equal(new Set(qs.map((q) => q.hidden[q.answer].rel)).size, 3, '一局 in、on、under 都問到')
      }
      assert.equal(repeats, 0, `${level} 級：最近 ${RECENT_SIGS} 題不重複（重複 ${repeats}）`)
      assert.ok(new Set(seen).size >= 200, `${level} 級：1200 題至少 200 種組合（${new Set(seen).size}）`)
    }
    console.log(`ok 2 躲在哪裡出題：1 級 2 選 1、2 級 3 選 1（in/on/under 各一）、3 級混合 3～4 選 1；答案唯一；最近 ${RECENT_SIGS} 題不重複`)
  }
  {
    let s = { ...WHERE_START }
    s = afterWhere(s, { counted: 4, misses: 0 })
    assert.equal(s.level, 1)
    s = afterWhere(s, { counted: 4, misses: 0 })
    assert.equal(s.level, 2, '連續 2 局全對升級')
    s = afterWhere(s, { counted: 4, misses: 1 })
    assert.equal(s.streak, 0, '有錯就重算')
    s = afterWhere(s, { counted: 4, misses: 2 })
    assert.equal(s.level, 1, '一局 2 題沒對退級')
    s = afterWhere({ ...s, level: WHERE_MAX }, { counted: 4, misses: 0 })
    s = afterWhere(s, { counted: 4, misses: 0 })
    assert.equal(s.level, WHERE_MAX, '最高不再升')
    s = afterWhere({ ...WHERE_START }, { counted: 1, misses: 0 })
    assert.equal(s.streak, 0, '示範、一起做的不算')
    assert.deepEqual(normalizeWhere({ level: 9, streak: -1, taught: ['x', 2], sigs: [1, 'a'] }), { ...WHERE_START, level: 3, taught: [2], sigs: ['a'] })
    assert.deepEqual(normalizeWhere(null), WHERE_START)
    console.log('ok 3 躲在哪裡升降級：連續 2 局全對升、一局 ≥ 2 題沒對退、壞掉的進度補預設')
  }
  // ── 心情臉 ──
  {
    assert.ok(SITUATIONS.length >= 60, `情境 ≥ 60：${SITUATIONS.length}`)
    for (const e of EMOS) assert.ok(SITUATIONS.filter((s) => s.emo === e).length >= 15, `${e} ≥ 15 個`)
    assert.equal(new Set(SITUATIONS.map((s) => s.id)).size, SITUATIONS.length, '情境 id 不重複')
    assert.ok(SPECIES.length >= 12, `主角 ≥ 12 種：${SPECIES.length}`)
    for (const s of SITUATIONS) {
      assert.ok(words(s.say) <= 6, `${s.id} 旁白 ≤ 6 個字：${s.say}`)
      assert.ok(!/\b(happy|sad|angry|mad|scared|afraid|cry|upset)\b/i.test(s.say), `${s.id} 旁白不說心情的字：${s.say}`)
      assert.ok(sitLength(s) <= 2600, `${s.id} 動畫 ≤ 2.6 秒：${sitLength(s)}`)
      for (const t of s.tracks) if ('e' in t.look) assert.ok(hasEmoji(t.look.e), `${s.id} 的圖示 ${t.look.e}`)
      for (const t of s.tracks) for (let i = 1; i < t.k.length; i++) assert.ok(t.k[i].t >= t.k[i - 1].t, `${s.id} 的時間點要照順序`)
      // 只用四種心情；燈關了、打雷這種只有一次（MOTION-3：不連閃）
      assert.ok((s.fx ?? []).filter((f) => f.kind === 'flash').length <= 1, `${s.id} 最多閃一次`)
    }
    assert.ok(hasEmoji('red-heart') && hasEmoji('sparkles') && hasEmoji('collision') && hasEmoji('musical-note'), '效果用的圖示')
    console.log(`ok 4 心情臉：情境 ${SITUATIONS.length} 個（${EMOS.map((e) => `${e} ${SITUATIONS.filter((s) => s.emo === e).length}`).join('、')}）、主角 ${SPECIES.length} 種；旁白 ≤ 6 個字、不說心情的字`)
  }
  {
    const rnd = seeded(7)
    for (let i = 0; i < 400; i++) {
      for (const e of EMOS) {
        const o1 = feelOptions(1, e, rnd)
        assert.equal(o1.length, 2)
        assert.ok(o1.includes(e) && o1.includes('happy') && o1.some((x) => x !== 'happy'), `1 級：開心 vs 不開心（${o1}）`)
        const o2 = feelOptions(2, e, rnd)
        assert.equal(o2.length, 3)
        assert.ok(o2.includes(e) && o2.includes('happy') && new Set(o2).size === 3)
        const o3 = feelOptions(3, e, rnd)
        assert.deepEqual(new Set(o3), new Set(EMOS))
      }
    }
    for (const level of [1, 2, 3] as FeelLevel[]) {
      const mem: FeelMemory = { sits: [], heroes: [] }
      const seen: string[] = []
      const heroes = new Set<string>()
      for (let r = 0; r < 200; r++) {
        const qs = feelRound(level, mem, seeded(level * 31 + r))
        assert.equal(qs.length, FEEL_QS)
        assert.deepEqual(new Set(qs.map((q) => q.answer)), new Set(EMOS), '一局四種心情各一')
        for (const q of qs) {
          assert.ok(q.options.includes(q.answer))
          assert.equal(q.sit.emo, q.answer)
          assert.notEqual(q.hero, q.friend, '朋友不是同一隻')
          assert.ok(!seen.slice(-RECENT_SITS).includes(q.sit.id), `最近 ${RECENT_SITS} 個情境不重複：${q.sit.id}`)
          seen.push(q.sit.id)
          heroes.add(q.hero)
        }
      }
      assert.equal(new Set(seen).size, SITUATIONS.length, '每個情境都輪得到')
      assert.equal(heroes.size, SPECIES_IDS.length, '每一隻主角都輪得到')
    }
    let s = { ...FEEL_START }
    s = afterFeel(afterFeel(s, { counted: 4, misses: 0 }), { counted: 4, misses: 0 })
    assert.equal(s.level, 2)
    s = afterFeel(s, { counted: 4, misses: 2 })
    assert.equal(s.level, 1)
    s = afterFeel({ ...s, level: FEEL_MAX }, { counted: 4, misses: 0 })
    assert.equal(afterFeel(s, { counted: 4, misses: 0 }).level, FEEL_MAX)
    assert.deepEqual(normalizeFeel('x'), FEEL_START)
    console.log(`ok 5 心情臉出題：1 級 2 選 1（開心 vs 不開心）、2 級 3 選 1、3 級 4 選 1；一局四種各一；最近 ${RECENT_SITS} 個情境不重複、每個都輪得到；升降級`)
  }
  // ── 台詞、家長區 ──
  {
    const keys = ['wh.intro', 'wh.this', 'wh.done', 'wh.again', 'fl.intro', 'fl.done', 'fl.again', 'teach.watch.dodo', 'teach.turn.dodo', 'd.next.home']
    for (const h of HIDERS) keys.push(findKey(h.id), whIs(h.id))
    for (const o of OBJECT_IDS) for (const r of relsOf(o)) keys.push(atKey(r, o))
    for (const sp of SPECIES_IDS) {
      keys.push(askKey(sp))
      for (const e of EMOS) keys.push(flIs(sp, e))
    }
    for (const e of EMOS) keys.push(faceKey(e), respKey(e, 0), respKey(e, 1), respKey(e, 2))
    for (const s of SITUATIONS) keys.push(sitKey(s.id))
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    // 拼起來的題目、回應也 ≤ 6 個字（PHASE-6）
    for (const h of HIDERS)
      for (const o of OBJECT_IDS)
        for (const r of relsOf(o)) {
          assert.ok(words(line(findKey(h.id)).text) + words(line(atKey(r, o)).text) <= 6, `Find the ${h.en} ${r} ${OBJECTS[o].en} ≤ 6 個字`)
          assert.ok(words(line(whIs(h.id)).text) + words(line(atKey(r, o)).text) <= 6, `The ${h.en} is ${r} ${OBJECTS[o].en} ≤ 6 個字`)
        }
    for (const k of keys.filter((k) => k.startsWith('wh.') || k.startsWith('fl.'))) assert.ok(words(line(k).text.replace(/\|/g, ' ')) <= 6, `${k} ≤ 6 個字：${line(k).text}`)
    const mine = keys.filter((k) => k.startsWith('wh.') || k.startsWith('fl.'))
    const files = new Set(mine.flatMap((k) => segments(line(k)).map((s) => clipName(line(k), s))))
    if (existsSync('public/audio')) {
      const miss = [...files].filter((n) => !existsSync(`public/audio/${n}.mp3`))
      assert.deepEqual(miss, [], `缺音檔 ${miss.length} 個`)
      console.log(`ok 6 台詞都有（${keys.length} 句，拼起來的題目也 ≤ 6 個字），音檔 ${files.size} 個都在`)
    } else console.log(`ok 6 台詞都有（${keys.length} 句，拼起來的題目也 ≤ 6 個字）；（跳過）沒有 public/audio，不檢查音檔`)
  }
  {
    assert.equal(LOGIC_GAME_NAME['logic-where'], '躲在哪裡')
    assert.equal(LOGIC_GAME_NAME['logic-feel'], '心情臉')
    for (const r of RELS) assert.ok(logicSkillLabel(`where:${r}`, 'logic'), `where:${r}`)
    for (const e of EMOS) assert.ok(logicSkillLabel(`feel:${e}`, 'logic'), `feel:${e}`)
    console.log('ok 7 家長區：遊戲名稱、技能名稱')
  }
  console.log('ALL PASS')
}

main()
