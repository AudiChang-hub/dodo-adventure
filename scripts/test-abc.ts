// 字母遊戲時間（T-147 英文門案 A，src/lessons/english/abc.ts）的單元測試：
// - 只用學過的（指引 HOW-2）：隨機 200 種進度，字母牆、放進籃子（聽字找圖）、翻翻卡都不出沒學過的字母、沒教過的字；
// - 選項 2～3 個（LOAD-1），翻翻卡一盤 2～3 對，回合數 3～5（LOAD-3）；
// - 學過的字母少於 2 個只有字母牆；同一天中途離開接著玩、玩完再進來換另一種配對遊戲；
// - 新台詞都在（Where's the apple?、三明治、字母名）。
// 執行：npx tsx scripts/test-abc.ts（失敗就 exit 1）
import assert from 'node:assert/strict'
import '../src/content/lines'
import { hasLine } from '../src/content/registry'
import { LESSON_LETTERS, ORDER, orderFor, wordId } from '../src/lessons/english/data'
import {
  DEMO_UNTIL,
  FLIP_BOARDS,
  PAIR_ROUNDS,
  WALL_MAX,
  canMatch,
  endPlay,
  learnedLetters,
  letterOf,
  makeFlips,
  makePairs,
  startPlay,
  taughtStarts,
  findable,
  kindOf,
  sandwich,
  taughtWords,
  wallLetters,
  isFresh,
} from '../src/lessons/english/abc'
import { byeTip, hasWordTip, wordTip } from '../src/lessons/english/coplay'

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)

/** 可重現的亂數 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── 每個字母都有教過、真的是這個字母開頭的代表字 ──
for (const x of LESSON_LETTERS) {
  assert.equal(taughtWords(x).length, 2, `${x.L} 要教 2 個代表字`)
  assert.ok(taughtStarts(x).length >= 1, `${x.L} 教過的 2 個字裡沒有 ${x.L} 開頭的`)
  for (const w of taughtStarts(x)) assert.equal(w.w[0].toUpperCase(), x.L, `${x.L} 的 ${w.w} 不是 ${x.L} 開頭`)
}
assert.deepEqual(
  taughtStarts(letterOf('X')).map((w) => w.w),
  ['x-ray'],
)
ok('26 個字母都有教過、真的是這個字母開頭的字（X 只配 x-ray）')

// ── 隨機 200 種進度：不出沒學過的、選項 2～3 個 ──
const names = ['', 'Ben', 'Sam', 'Zoe', 'Max', 'Quinn', 'Ivy', 'Otto']
let rounds = 0
let boards = 0
for (let k = 0; k < 200; k++) {
  const r = rng(1000 + k)
  const seq = orderFor(names[k % names.length])
  const idx = Math.floor(r() * 26)
  const learned = learnedLetters(idx, seq, true)
  const todayL = seq[idx]
  const set = new Set(learned)
  const words = new Set(learned.flatMap((L) => taughtWords(letterOf(L)).map((w) => wordId(w.w))))
  const icons = new Set(learned.flatMap((L) => taughtWords(letterOf(L)).map((w) => w.icon)))
  const due = (L: string) => r() < 0.3 && L !== todayL
  const mature = r() < 0.5
  assert.equal(learned.length, idx + 1)
  assert.equal(learned[learned.length - 1], todayL)

  // 字母牆：最多 6 塊、今天的字母第一塊、都學過、不重複
  const wall = wallLetters(learned, todayL, due)
  assert.ok(wall.length >= 1 && wall.length <= WALL_MAX, `牆上 ${wall.length} 塊`)
  assert.equal(wall[0], todayL)
  assert.equal(new Set(wall).size, wall.length)
  for (const L of wall) assert.ok(set.has(L), `第 ${k} 種：牆上的 ${L} 還沒學`)

  if (!canMatch(learned)) {
    assert.equal(learned.length, 1, '學過 2 個以上一定出得了配對題')
    continue
  }
  // 放進籃子（聽字找圖）：念教過的字、2～3 張圖、干擾圖不同類
  const ps = makePairs(learned, todayL, mature, due, r)
  assert.equal(ps.length, PAIR_ROUNDS, `第 ${k} 種：放進籃子 ${ps.length} 回合`)
  assert.equal(ps[0].L, todayL, '第一回合是今天的字')
  for (const p of ps) {
    rounds++
    assert.ok(set.has(p.L), `放進籃子的字母 ${p.L} 還沒學`)
    assert.ok(findable(letterOf(p.L)).some((w) => wordId(w.w) === p.answer), `答案 ${p.answer} 不是 ${p.L} 教過的字`)
    assert.ok(p.options.length >= 2 && p.options.length <= 3, `放進籃子 ${p.options.length} 個選項`)
    if (!mature) assert.equal(p.options.length, 2, '還不熟：2 選 1')
    assert.equal(new Set(p.options.map((o) => o.icon)).size, p.options.length, '圖不重複')
    assert.equal(new Set(p.options.map((o) => kindOf(o.w))).size, p.options.length, `干擾圖要不同類：${p.options.map((o) => o.w).join('、')}`)
    assert.equal(p.skill, `enword:${p.answer}`)
    for (const o of p.options) assert.ok(words.has(o.id) && icons.has(o.icon), `第 ${k} 種：放進籃子的圖 ${o.w} 沒教過`)
  }
  for (let i = 1; i < ps.length; i++) assert.notEqual(ps[i].answer, ps[i - 1].answer, '不連續兩回合同一個字')

  // 翻翻卡（兩張一樣的圖）
  const fs = makeFlips(learned, todayL, mature, due, r)
  assert.equal(fs.length, FLIP_BOARDS)
  for (const b of fs) {
    boards++
    const pairs = new Set(b.map((c) => c.pair))
    assert.ok(pairs.size >= 2 && pairs.size <= 3, `一盤 ${pairs.size} 對`)
    if (!mature) assert.equal(pairs.size, 2, '還不熟：一盤 2 對')
    assert.equal(b.length, pairs.size * 2)
    assert.equal(new Set(b.map((c) => c.icon)).size, pairs.size, '一對一種圖')
    for (const c of b) {
      assert.ok(set.has(c.L), `翻翻卡的 ${c.L} 還沒學`)
      assert.ok(words.has(c.pair), `翻翻卡的圖 ${c.w} 沒教過`)
      assert.equal(b.filter((x) => x.pair === c.pair && x.icon === c.icon).length, 2, '每一對是兩張一樣的圖')
    }
  }
  assert.ok(fs[0].some((c) => c.L === todayL), '翻翻卡第一盤有今天的字')
  const total = fs.reduce((a, b) => a + b.length / 2, 0)
  assert.ok(total >= 4 && total <= 5, `翻翻卡一共 ${total} 對（LOAD-3）`)
}
ok(`隨機 200 種進度：字母牆、放進籃子（${rounds} 回合）、翻翻卡（${boards} 盤）都只用學過的字母和教過的字；選項 2～3 個、干擾圖不同類；沒有「哪個是 A 開頭」`)

// ── 學過的字母少於 2 個：只有字母牆 ──
assert.equal(canMatch(learnedLetters(0, ORDER, true)), false)
assert.equal(canMatch(learnedLetters(1, ORDER, true)), true)
assert.deepEqual(wallLetters(['A'], 'A'), ['A'])
assert.equal(startPlay(null, 'pair', false, '2026-11-14').cur?.game, null)
ok('新帳號第一天（只學過 1 個字母）：只有字母牆，沒有配對遊戲')

// ── 進度：同一天中途離開接著玩、玩完再進來換另一種、隔天重新照輪替 ──
{
  const d = '2026-11-14'
  const s0 = startPlay(null, 'flip', true, d)
  assert.deepEqual(s0.cur, { game: 'flip', wall: false, round: 0 })
  assert.equal(s0.sessions, 0)
  // 玩到一半離開（字母牆看完、翻翻卡第一盤配完）：同一天回來接著玩，不重來、不換遊戲
  const mid = { ...s0, cur: { game: 'flip' as const, wall: true, round: 1 } }
  assert.deepEqual(startPlay(mid, 'pair', true, d).cur, { game: 'flip', wall: true, round: 1 })
  // 玩完：sessions 加一、再進來換成放進籃子（variety 今天還是 flip 也一樣）
  const end = endPlay(mid)
  assert.equal(end.sessions, 1)
  assert.equal(end.cur, undefined)
  assert.equal(startPlay(end, 'flip', true, d).cur?.game, 'pair')
  // 第三次又換回翻翻卡
  assert.equal(startPlay(endPlay(startPlay(end, 'flip', true, d)), 'flip', true, d).cur?.game, 'flip')
  // 隔天：照 variety，從頭（字母牆）開始；自己做對的次數留著
  const next = startPlay({ ...end, solo: { pair: 3 } }, 'pair', true, '2026-11-15')
  assert.deepEqual(next.cur, { game: 'pair', wall: false, round: 0 })
  assert.equal(next.sessions, 0)
  assert.deepEqual(next.solo, { pair: 3 })
  // 昨天玩到一半：今天不接著玩
  assert.deepEqual(startPlay(mid, 'pair', true, '2026-11-15').cur, { game: 'pair', wall: false, round: 0 })
  assert.ok(DEMO_UNTIL >= 1)
}
ok('同一天中途離開接著玩；玩完再進來換另一種配對遊戲；隔天照輪替從字母牆開始')

// ── T-149 E5：今天新學的那一塊放上牆的動畫只播一次（換天、玩完、接著玩都記得） ──
{
  const d = '2026-11-14'
  assert.equal(isFresh(null, 'E'), true)
  const s = { ...startPlay(null, 'pair', true, d), placed: 'E' }
  assert.equal(isFresh(s, 'E'), false)
  assert.equal(endPlay(s).placed, 'E')
  assert.equal(startPlay(endPlay(s), 'pair', true, d).placed, 'E')
  assert.equal(startPlay(s, 'pair', true, d).placed, 'E')
  assert.equal(isFresh(startPlay(endPlay(s), 'pair', true, '2026-11-15'), 'F'), true)
}
ok('E5 新積木放上牆的動畫：同一個字母只播一次，隔天的新字母再播')

// ── T-149 E3、C1：陪玩小字 ──
for (const x of LESSON_LETTERS) {
  for (const [i, w] of taughtWords(x).entries()) {
    assert.ok(hasWordTip(w.w), `${w.w} 沒有陪玩小字`)
    assert.ok(/[一-鿿]/.test(wordTip(x, i)), `${w.w} 的陪玩小字不是中文`)
  }
  const t = byeTip(x)
  assert.ok(t.includes(`${x.L} 開頭`), `${x.L} 的下課小字沒有提到 ${x.L}`)
}
assert.match(byeTip(letterOf('A')), /apple/)
ok('E3 每個代表字都有一句陪玩小字；C1 每個字母下課都有「今天在家可以做的事」')

// ── 新台詞都有 ──
for (const x of LESSON_LETTERS) {
  assert.ok(hasLine(`en.pop.${x.l}`), `沒有 en.pop.${x.l}`)
  for (const w of findable(x)) {
    const id = wordId(w.w)
    for (const key of [`en.where.word.${id}`, `en.that.word.${id}`, `en.find.word.${id}`, `ph.word.${id}`, ...sandwich(x.L, w.w)]) assert.ok(hasLine(key), `沒有 ${key}`)
  }
}
for (const k of ['en.party', 'en.abc.go', 'en.abc.flip', 'teach.watch.dodo', 'teach.turn.dodo']) assert.ok(hasLine(k), `沒有 ${k}`)
ok('泡泡派對、字母牆、放進籃子（Where’s the apple?、放錯的說明、三明治）、翻翻卡用到的台詞都有')

console.log('ALL PASS')
