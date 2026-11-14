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
  makeOnsets,
  pickNewWord,
  ONSET_ROUNDS,
} from '../src/lessons/english/abc'
import { byeTip, hasWordTip, wordTip } from '../src/lessons/english/coplay'
import * as S4 from '../src/lessons/english/stage4'
import type { Attempt } from '../src/lib/db'

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


// ── T-150 E 英文 4 歲內容（src/lessons/english/stage4.ts、abc.ts 的新朋友和聽開頭）──
{
  let ts = 0
  type Opt = { opts?: number; heard?: boolean; led?: boolean; phase?: 'quiz' | 'guided' | 'teach' }
  const att = (skill: string, date: string, right: boolean, o: Opt = {}): Attempt => ({
    id: `t${++ts}`,
    ts: ++ts,
    date,
    sessionId: 's',
    station: 'english',
    game: skill.startsWith('onset:') ? 'abc-onset' : 'abc-find',
    itemId: skill,
    skill,
    phase: o.phase ?? 'quiz',
    level: 1,
    options: Array.from({ length: o.opts ?? 3 }, (_, i) => `o${i}`),
    answer: 'o0',
    taps: [],
    firstTryCorrect: right,
    attempts: 1,
    responseMs: 1000,
    hintUsed: false,
    ...(o.led ? { metrics: { led: 1 } } : {}),
    heard: o.heard ?? true,
    synced: 0,
  })
  const W12 = ['apple', 'ant', 'bus', 'ball', 'car', 'cat', 'dinosaur', 'dog', 'egg', 'elephant', 'fish', 'fox']
  // 像真的在玩：每天 4 回合聽字找圖（12 個字輪流，每個字隔 3 天再考一次），10/20～10/31 共 12 天
  const DAYS = Array.from({ length: 12 }, (_, i) => `2026-10-${20 + i}`)
  const history = (o: Opt = {}, right = (_w: string, _d: number, _j: number) => true, days = DAYS, per = 4) =>
    days.flatMap((d, di) => Array.from({ length: per }, (_, j) => W12[(di * per + j) % W12.length]).map((w, j) => att(`enword:${w}`, d, right(w, di, j), o)))
  const good = history()
  const T = '2026-11-09'

  // 門檻：差一點都不開
  assert.ok(S4.moreReady(good).ok, S4.moreReady(good).need)
  assert.ok(S4.onsetReady(good).ok, S4.onsetReady(good).need)
  for (const [why, xs] of [
    ['只有 2 選 1', history({ opts: 2 })],
    ['全是沒聽完就點', history({ heard: false })],
    ['手帶著做的', history({ led: true })],
    ['一起練（guided）', history({ phase: 'guided' })],
    ['只分在 2 天', history({}, undefined, DAYS.slice(0, 2), 12)],
    ['沒有隔 2 天再考（天天考同樣 4 個字）', DAYS.slice(0, 6).flatMap((d) => W12.slice(0, 4).map((w) => att(`enword:${w}`, d, true)))],
  ] as const) {
    assert.equal(S4.moreReady(xs).ok, false, `${why}：更多單字不能開`)
    assert.equal(S4.onsetReady(xs).ok, false, `${why}：聽開頭不能開`)
    assert.equal(S4.advance({}, xs, T)['en-more'], undefined, `${why}：advance 不開門`)
  }
  // 最近 20 題 4 題錯（80%，最後 4 天每天第一題錯）：更多單字剛好開、聽開頭（85%）不開
  const eighty = history({}, (_w, di, j) => !(di >= 8 && j === 0))
  assert.ok(S4.moreReady(eighty).ok, S4.moreReady(eighty).need)
  assert.equal(S4.onsetReady(eighty).ok, false)
  // 答得出的字只有 3 種開頭音：聽開頭不開
  const three = good.filter((a) => /^enword:(apple|ant|bus|ball|car|cat)$/.test(a.skill))
  assert.equal(S4.onsetSpread(S4.knownWords(three)), 3)
  assert.equal(S4.onsetReady(three).ok, false)
  ok('4 歲門檻：只有 2 選 1、沒聽完、手帶著做、天數不夠、沒隔 2 天再考、正確率差一點、開頭音不夠多，門都不開')

  // 答得出的字
  const known = S4.knownWords(good)
  assert.equal(known.size, 12)
  const lastWrong = [...good, att('enword:apple', '2026-11-08', false)]
  assert.equal(S4.knownWords(lastWrong).has('apple'), false, '最近一次答錯就不算答得出')
  assert.equal(S4.knownWords([...lastWrong, att('enword:apple', '2026-11-08', false, { heard: false })]).has('apple'), false)
  assert.equal(S4.knownWords([att('enword:apple', '2026-11-01', true), att('enword:apple', '2026-11-01', true)]).size, 0, '同一天答對 2 次不算')
  ok('答得出的字：3 選 1 聽完第一次就對 ≥ 2 次、分在 2 天以上、最近一次沒錯')

  // 一天一道門、開了不關、暫停不開
  const k1 = S4.advance({}, good, T)
  assert.ok(k1['en-more'] && !k1['en-onset'], '同一天只開上面那道（更多單字）')
  assert.equal(S4.advance(k1, good, T), k1, '同一天再算一次：不變')
  const k2 = S4.advance(k1, good, '2026-11-10')
  assert.equal(k2['en-onset']?.opened, '2026-11-10', '隔天才開聽開頭')
  const bad = [...good, ...W12.map((w) => att(`enword:${w}`, '2026-11-11', false))]
  const k3 = S4.advance(k2, bad, '2026-11-12')
  assert.ok(k3['en-more'] && k3['en-onset'], '後來答錯：門不關')
  assert.deepEqual(S4.advance({}, good, T, true), {}, '暫停：不開門')
  assert.equal(S4.moreSet({ 'en-more': { opened: T, taught: { A: 3 } } }, true).size, 0, '暫停：第 3 個字先不用')
  const gs = S4.gates(good, k2, '2026-11-10')
  assert.deepEqual(gs.map((g) => [g.id, g.open]), [['en-more', true], ['en-onset', true]])
  const gs0 = S4.gates([], {}, T)
  assert.ok(gs0.every((g) => !g.open && g.need.length > 0), '沒開的門要寫還差什麼')
  assert.ok(gs0.every((g) => !/失敗/.test(g.need)))
  assert.equal(S4.STAGE4_KEY, 'lesson.english.stage4')
  assert.equal(S4.PAUSE_KEY, 'stage4.paused.en')
  ok('一天最多開一道門（先更多單字、隔天聽開頭）；開了不關；暫停不開、第 3 個字先不用；gates 給家長區的形狀')

  // 聽開頭退一級、升回來
  const O: S4.OnsetKv = { opened: '2026-11-01', plays: 3 }
  const solo3 = (n: number, right: number, d = '2026-11-08') => Array.from({ length: n }, (_, i) => att('onset:a', d, i < right))
  assert.equal(S4.onsetLevel(solo3(6, 4), O, T).level ?? 2, 2, '6 題對 4 題：不退')
  const down = S4.onsetLevel(solo3(6, 3), O, T)
  assert.equal(down.level, 1, '6 題對 3 題：退回示範＋2 選 1')
  assert.equal(S4.onsetMode(down), 1)
  assert.equal(S4.onsetLevel([...solo3(6, 3), ...solo3(6, 6, '2026-11-08')], down, '2026-11-10').level, 1, '退級以前的作答不算升回去')
  const two = (n: number, right: number) => Array.from({ length: n }, (_, i) => att('onset:a', '2026-11-10', i < right, { opts: 2 }))
  assert.equal(S4.onsetLevel(two(6, 3), down, '2026-11-11').level, 1)
  assert.equal(S4.onsetLevel(two(6, 4), down, '2026-11-11').level, 2, '退了以後 2 選 1 對 4 題：回到 3 選 1')
  assert.equal(S4.onsetLevel(solo3(6, 0, '2026-10-20'), O, T).level ?? 2, 2, '2 週以前的不算')
  assert.equal(S4.onsetLevel(Array.from({ length: 6 }, () => att('onset:a', '2026-11-08', false, { led: true })), O, T).level ?? 2, 2, '手帶著做的不算')
  assert.equal(S4.onsetMode({ opened: T }), 'intro', '第一次玩：示範＋一起做')
  ok('聽開頭：自己做 3 選 1 最近 6 題對 ≤ 3 題退一級；退了以後的 2 選 1 對 ≥ 4 題升回來；2 週前、手帶著做的不算')

  // 怎麼混著出
  const fresh: S4.Stage4Kv = { 'en-more': { opened: '2026-11-08' }, 'en-onset': { opened: '2026-11-09' } }
  assert.equal(S4.onsetToday(fresh, T, 0, false), true, '剛開、沒玩過：玩')
  assert.equal(S4.onsetToday(fresh, T, 1, false), false, '今天第二次：不玩')
  assert.equal(S4.onsetToday(fresh, T, 0, true), false, '剛開而且這一次有新朋友：一次只出 1 個 4 歲回合')
  assert.equal(S4.onsetToday(fresh, T, 0, false, true), false, '暫停：不玩')
  const played = (d: string): S4.Stage4Kv => ({ ...fresh, 'en-onset': { ...fresh['en-onset']!, lastPlay: d, plays: 1 } })
  assert.equal(S4.onsetToday(played('2026-11-09'), '2026-11-11', 0, false), false, '剛開：每 3 天最多 1 次')
  assert.equal(S4.onsetToday(played('2026-11-09'), '2026-11-12', 0, false), true)
  const old: S4.Stage4Kv = { 'en-more': { opened: '2026-10-01' }, 'en-onset': { opened: '2026-10-01', lastPlay: '2026-11-07', plays: 9 } }
  assert.equal(S4.onsetToday(old, T, 0, true), true, '14 天以後：隔 2 天再玩，有新朋友也可以')
  assert.equal(S4.onsetToday(old, '2026-11-08', 0, false), false)
  assert.equal(S4.canTeachNew({ 'en-more': { opened: T, lastNew: T } }, T), false, '新朋友一天最多 1 個')
  assert.equal(S4.canTeachNew({ 'en-more': { opened: T, lastNew: '2026-11-08' } }, T), true)
  assert.equal(S4.canTeachNew({}, T), false)
  ok('頭 14 天：有新朋友就不玩聽開頭、聽開頭每 3 天最多 1 次；14 天後隔 2 天；今天第一次才玩；新朋友一天 1 個')

  // 新朋友
  const learnedAF = ['A', 'B', 'C', 'D', 'E', 'F']
  assert.equal(pickNewWord(learnedAF, known, new Set())?.w.w, 'ambulance', '最久以前學的 A 先')
  assert.equal(pickNewWord(learnedAF, known, new Set(['A']))?.w.w, 'bear')
  const noAnt = new Set([...known].filter((w) => w !== 'ant'))
  assert.equal(pickNewWord(learnedAF, noAnt, new Set())?.L, 'B', 'A 的 ant 還答不出來：先教 B')
  assert.equal(pickNewWord(['Q'], new Set(['queen']), new Set()), null, 'Q 的第 3 個字 quiet 不教')
  assert.equal(pickNewWord(['U'], new Set(['umbrella']), new Set())?.w.w, 'unicorn', 'U 只看認得出的 umbrella')
  assert.equal(pickNewWord(learnedAF, new Set(), new Set()), null)
  const kvA = S4.afterNewWord({ 'en-more': { opened: T } }, 'A', T)
  assert.deepEqual(kvA['en-more'], { opened: T, taught: { A: 3 }, lastNew: T })
  const more = S4.moreSet(kvA)
  assert.equal(taughtWords(letterOf('A'), more).length, 3)
  assert.equal(taughtWords(letterOf('B'), more).length, 2)
  assert.equal(taughtWords(letterOf('A')).length, 2, '沒給 more：照 3 歲的 2 個字')
  // 教過第 3 個字以後：聽字找圖用得到它
  let seen = false
  for (let k = 0; k < 60 && !seen; k++) seen = makePairs(learnedAF, 'A', true, undefined, rng(7 + k), more).some((p) => p.answer === 'ambulance' || p.options.some((o) => o.id === 'ambulance'))
  assert.ok(seen, '教過的第 3 個字會出現在聽字找圖')
  for (let k = 0; k < 60; k++) assert.ok(!makePairs(learnedAF, 'A', true, undefined, rng(7 + k)).some((p) => p.options.some((o) => o.id === 'ambulance')), '沒教過第 3 個字：不出現')
  ok('新朋友：只教 2 個字都答得出的字母的第 3 個字、最久以前學的先、quiet 不教；教過才進聽字找圖')

  // 聽開頭出題：隨機 200 種「答得出的字」
  const ALL = [...new Set(LESSON_LETTERS.flatMap((x) => x.words.map((w) => wordId(w.w))))]
  const NEVER = /^(x-ray|unicorn|ice-cream|up|question|queen|quiet|volcano|van|violin)$/
  let onsetRounds = 0
  let empty = 0
  for (let k = 0; k < 200; k++) {
    const r = rng(5000 + k)
    const kn = new Set(ALL.filter(() => r() < 0.15 + (k % 10) * 0.08))
    const mode = (['intro', 1, 2] as const)[k % 3]
    const qs = makeOnsets(kn, mode, r)
    if (!qs.length) {
      empty++
      continue
    }
    assert.ok(qs.length >= 2 && qs.length <= ONSET_ROUNDS)
    for (const [i, q] of qs.entries()) {
      onsetRounds++
      assert.equal(q.skill, `onset:${q.onset}`)
      assert.equal(q.answer[0], q.onset, `${q.answer} 不是 ${q.onset} 開頭`)
      assert.ok(q.options.length >= 2 && q.options.length <= 3, `${q.options.length} 個選項`)
      if (mode !== 2 || i === 0) assert.equal(q.options.length, 2, '示範、一起做、退一級都是 2 選 1')
      assert.equal(!!q.led, mode === 'intro' ? i > 0 : mode === 2 && i === 0, `第 ${i} 回合的一起做不對（${mode}）`)
      const os = q.options.map((o) => o.id)
      for (const id of os) {
        assert.ok(kn.has(id), `${id} 不是答得出的字`)
        assert.ok(!NEVER.test(id), `${id} 不能拿來問開頭音`)
      }
      const on = os.map((id) => S4.onsetOf(id)!)
      for (let a = 0; a < on.length; a++) for (let b = a + 1; b < on.length; b++) assert.ok(S4.farApart(on[a], on[b]), `同一題有容易混的開頭：${os.join('、')}`)
      assert.equal(new Set(q.options.map((o) => kindOf(o.w))).size, os.length, `同一題有同一類的：${os.join('、')}`)
      assert.equal(new Set(q.options.map((o) => o.icon)).size, os.length)
      assert.ok(hasLine(`ph.${q.onset}.q.start`), `沒有 ph.${q.onset}.q.start`)
      assert.ok(hasLine(`ph.${q.onset}.echo.${q.answer}`), `沒有 ph.${q.onset}.echo.${q.answer}`)
      for (const id of os) assert.ok(hasLine(`ph.word.${id}`), `沒有 ph.word.${id}`)
      if (i > 0) assert.notEqual(q.onset, qs[i - 1].onset, '連續兩回合不同一個開頭音')
    }
  }
  assert.ok(onsetRounds > 300, `聽開頭只出了 ${onsetRounds} 回合`)
  assert.deepEqual(makeOnsets(new Set(['apple', 'ant']), 2), [], '字不夠：這一次不玩聽開頭')
  ok(`聽開頭隨機 200 種進度（${onsetRounds} 回合、${empty} 種字不夠不玩）：只用答得出的字、問音不問字母名、同一題沒有容易混的開頭和同類的圖、選項 2～3 個、一起做和示範照級數`)

  // 進度相容：聽開頭存得進去、玩完下一次換放進籃子
  const sO = startPlay(null, 'onset', true, T)
  assert.equal(sO.cur?.game, 'onset')
  assert.equal(startPlay(endPlay(sO), 'flip', true, T).cur?.game, 'pair', '同一天玩完聽開頭再進來：放進籃子')
  assert.equal(startPlay(sO, 'pair', true, T).cur?.game, 'onset', '玩到一半：接著聽開頭')
  // 新台詞
  for (const k of ['en.abc.new', 'en.where.word.ambulance', 'en.where.word.box', 'ph.i.q.start', 'ph.b.echo.box', 'ph.f.echo.fox']) assert.ok(hasLine(k), `沒有 ${k}`)
  for (const x of LESSON_LETTERS) for (const w of x.words) if (w.w !== 'quiet') assert.ok(hasLine(`en.where.word.${wordId(w.w)}`), `沒有 en.where.word.${wordId(w.w)}`)
  ok('聽開頭的進度存得進去、同一天再進來換放進籃子；新朋友、第 3 個字、聽開頭的台詞都有')
}

console.log('ALL PASS')
