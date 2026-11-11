// 聽完才答（T-109）的單元測試：關鍵字什麼時候算念完、點下去那一刻聽完了沒、熟練只看聽完才答的、家長區的統計、
// 每一題的關鍵字都放在題目最前面、正確答案的位置是隨機的。
// 執行：npx tsx scripts/test-heard.ts（npm run verify 的「單元：聽完才答」）
import assert from 'node:assert/strict'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'
import { keywordWords } from '../src/content/keywords'
import type { Attempt } from '../src/lib/db'
import { GUESS_CEILING, HEARD_WINDOW, KeywordClock, choicesOf, guessTail, heardFirm, heardNeed, keywordEnd, pushHeard } from '../src/lib/heard'
import { listenLine, listenStats } from '../src/lib/listen-report'
import { afterChecks, askFor, checkCards, heardMastered, mergeChecks } from '../src/lib/parent-check'
import { counts, mastery } from '../src/lib/readiness'
import { lessonLetter, LESSON_LETTERS } from '../src/lessons/english/data'
import { lessonGood } from '../src/lessons/english/plan'
import { makeQuiz } from '../src/lessons/english/quiz-plan'
import { compareQs, countReady, range, reviewQs, type FirmAttempt, type Lesson } from '../src/lessons/math/plan'

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)

// ── 1. 關鍵字在第幾段、幾毫秒念完 ─────────────────────────────
{
  const big = [[[20, 300, 'Big']], [[20, 400, 'S']]] as const
  assert.equal(keywordEnd(big, Infinity), null, '沒登記：整句念完才算')
  const more = [[[20, 464, 'More'], [1480, 1719, 'Which'], [1732, 2215, 'side']]] as const
  assert.deepEqual(keywordEnd(more, 1), { seg: 0, ms: 464 }, 'More! Which side? 的 More 在 464ms 念完')
  assert.deepEqual(keywordEnd(big, 2), { seg: 1, ms: 400 }, '跨段：第二段的第一個字')
  assert.equal(keywordEnd([null, [[0, 100, 'x']]], 2), null, '前面一段沒有時間軸：等整句念完')
  assert.equal(keywordEnd(more, 9), null, '字數比整句還多：等整句念完')
}
ok('關鍵字念完的時間：照 timings.json 的逐字時間，算不出來就等整句念完')

// ── 2. 點下去那一刻聽完了沒 ───────────────────────────────────
{
  let t = 0
  const c = new KeywordClock(() => t)
  // 題目在 t=1000 開始，關鍵字預計 t=1464 念完
  t = 1000
  c.schedule('m.ask.more', 1464)
  t = 1300
  assert.equal(c.heardSince('m.ask.more', 1000), false, '關鍵字還在念就點：沒聽完')
  c.cut() // 孩子搶點，語音停在關鍵字中間
  t = 5000
  assert.equal(c.heardSince('m.ask.more', 1000), false, '話停在關鍵字中間：之後再問也不算聽完')
  // 15 秒沒動，題目再念一次，這次念完了關鍵字才點
  c.schedule('m.ask.more', 5464)
  t = 5600
  assert.equal(c.heardSince('m.ask.more', 1000), true, '關鍵字念完之後才點：聽完了（後面的 Which side? 還沒念完也算）')
  c.cut()
  assert.equal(c.heardSince('m.ask.more', 1000), true, '聽完之後被打斷，還是聽完過')
  // 下一題：上一題聽過的不算
  assert.equal(c.heardSince('m.ask.more', 6000), false, '上一題念完的關鍵字，不算這一題聽完')
  // 沒有時間軸的句子：整句念完（end）才算
  t = 7000
  c.end('ph.s.big')
  assert.equal(c.heardSince('ph.s.big', 6000), true)
  // 別的句子的 end 不會把正在等的關鍵字算成念完
  t = 8000
  c.schedule('ph.s.ask', 9000)
  c.end('teach.watch.dodo')
  assert.equal(c.heardSince('ph.s.ask', 7500), false, '別的句子念完不算')
  c.end('ph.s.ask') // 自然念完（比預計早一點也算）
  assert.equal(c.heardSince('ph.s.ask', 7500), true)
}
ok('點下去那一刻：關鍵字念完才算聽完；話停在關鍵字中間不算；只算這一題開始以後')

// ── 3. 熟練只看聽完才答，而且要明顯高於亂猜 ─────────────────────
{
  assert.equal(heardNeed(1), null, '只有一個選項：猜都猜得中，不算')
  assert.equal(heardNeed(2), 4, '2 選 1：最近 5 次聽完才答對 4 次')
  assert.equal(heardNeed(3), 4)
  assert.ok(Math.abs(guessTail(5, 4, 0.5) - 6 / 32) < 1e-9, '2 選 1 亂猜 5 次對 4 次以上的機會是 6/32')
  for (const opts of [2, 3, 4, 8]) assert.ok(guessTail(HEARD_WINDOW, heardNeed(opts)!, 1 / opts) <= GUESS_CEILING, `${opts} 選 1 用猜的做到的機會 ≤ 2 成`)
  assert.equal(heardFirm(undefined), true, 'T-109 之前的舊資料、不用聽的題目（數數）：照原本的盒子判斷')
  assert.equal(heardFirm([2, 2, 2]), false, '聽完才答還不到 5 次：還不算熟')
  assert.equal(heardFirm([2, 2, 2, -2, 2]), true, '5 次對 4 次')
  assert.equal(heardFirm([2, 2, -2, -2, 2]), false, '5 次對 3 次（2 選 1 猜的也有一半）不算')
  assert.equal(heardFirm([-2, -2, 2, 2, 2, 2]), true, '只看最近 5 次')
  let hw: number[] | undefined
  for (const r of [true, true, false, true, true, true]) hw = pushHeard(hw, r, 2)
  assert.deepEqual(hw, [2, -2, 2, 2, 2], '只留最近 5 次')
  assert.deepEqual(pushHeard(undefined, true, 1), [], '只有一個選項的不記，但從此照聽完才答判斷（不再只看盒子）')
  assert.equal(heardFirm(pushHeard(undefined, true, 1)), false)
}
ok('熟練只看聽完才答的：最近 5 次對 4 次以上（2 選 1 亂猜做到的機會 19%）；只有一個選項的不算')

// ── 4. 沒聽完就點的不計入熟練、也不算錯（家長區的熟練、數學 1～5 熟練了沒、英文隔天重不重上）────
let seq = 0
function att(skill: string, game: string, ok: boolean, heard: boolean | undefined, opts = 3, date = '2026-11-08', extra: Partial<Attempt> = {}): Attempt {
  seq++
  return {
    id: `a${seq}`,
    ts: Date.parse(`${date}T10:00:00`) + seq,
    date,
    sessionId: 's',
    station: game === 'lesson-en' ? 'english' : 'math',
    game,
    itemId: skill,
    skill,
    phase: 'quiz',
    level: 1,
    options: range(1, opts).map(String),
    answer: '1',
    taps: [],
    firstTryCorrect: ok,
    attempts: ok ? 1 : 2,
    responseMs: 1500,
    hintUsed: false,
    synced: 0,
    ...(heard === undefined ? {} : { heard }),
    ...extra,
  } as Attempt
}
{
  assert.equal(counts(att('num:3', 'm-find', true, false)), false, '沒聽完就點：不拿來判斷熟練')
  assert.equal(counts(att('num:3', 'm-find', true, true)), true)
  assert.equal(counts(att('num:3', 'm-find', true, undefined)), true, '舊紀錄（沒有 heard）照算')
  const ds = ['2026-11-01', '2026-11-04', '2026-11-07']
  const real = ds.flatMap((d) => range(1, 4).map(() => att('num:3', 'm-find', true, true, 3, d)))
  const guesses = ds.flatMap((d) => range(1, 6).map(() => att('num:3', 'm-find', false, false, 3, d)))
  const m = mastery([...real, ...guesses], 'num:3')
  assert.equal(m.right, 10, '沒聽完就點錯的不算錯')
  assert.equal(m.recent, 10)
  const onlyGuess = mastery(guesses.map((a) => ({ ...a, firstTryCorrect: true })), 'num:3')
  assert.equal(onlyGuess.recent, 0, '全都是猜對的：不算熟練')

  const firm: FirmAttempt[] = range(0, 9).map((i) => ({ skill: `count:${(i % 5) + 1}`, options: ['1', '2', '3'], firstTryCorrect: true, date: `2026-11-0${(i % 3) + 1}`, ts: i, phase: 'quiz' as const, heard: false }))
  assert.equal(countReady(firm).ready, false, '數學 1～5 熟練了沒：全都是猜對的不算')
  assert.equal(countReady(firm.map((a) => ({ ...a, heard: true }))).ready, true)

  assert.equal(lessonGood([{ kind: 'big', first: false, heard: false }, { kind: 'little', first: false, heard: false }, { kind: 'big', first: true, heard: true }]), true, '英文：沒聽完就點錯的不算錯（不會因此隔天重上）')
  assert.equal(lessonGood([{ kind: 'big', first: false, heard: true }, { kind: 'little', first: false, heard: true }, { kind: 'big', first: true, heard: false }]), false, '英文：猜對的不會把錯很多救回來')
}
ok('沒聽完就點的：不計入熟練、也不算錯（家長區熟練、數學開 6、英文隔天重不重上）')

// ── 5. 家長區的統計 ─────────────────────────────────────────
{
  const now = Date.parse('2026-11-08T12:00:00')
  const xs = [
    ...range(1, 6).map((i) => att('letter:S', 'lesson-en', i !== 3, true)),
    ...range(1, 9).map(() => att('letter:S', 'lesson-en', true, false)),
    att('letter:s', 'lesson-en', true, true),
    att('phonics:s', 'lesson-en', false, false),
    att('letter:S', 'lesson-en', true, undefined), // 舊紀錄不算
    att('letter:S', 'lesson-en', true, true, 2, '2026-11-08', { metrics: { shown: 1 } }), // 手先示範過的不算
    att('letter:S', 'lesson-en', true, true, 2, '2026-10-01'), // 太久以前
    att('compare:more', 'm-compare', true, false, 2),
  ]
  const st = listenStats(xs, 'english', 14, now)
  assert.equal(st.total, 17)
  assert.equal(st.heard, 7)
  assert.equal(st.right, 6)
  assert.equal(st.guessed, 10)
  const S = st.rows.find((r) => r.label === '找大 S')!
  assert.deepEqual([S.heard, S.right, S.guessed], [6, 5, 9])
  assert.equal(listenLine(S), '找大 S：聽完才答 6 次，對 5 次；沒聽完就點 9 次')
  assert.equal(st.rows.find((r) => r.label === '找 S 開頭的圖')?.guessed, 1)
  const ma = listenStats(xs, 'math', 14, now)
  assert.equal(ma.rows[0].label, '哪邊比較多')
  assert.equal(listenLine(ma.rows[0]), '哪邊比較多：還沒有聽完才答的；沒聽完就點 1 次')
}
ok('家長區：每一種題目聽完才答幾次、對幾次、沒聽完就點幾次（「找大 S：聽完才答 6 次，對 5 次；沒聽完就點 9 次」）')

// ── 6. 題目的關鍵字放在最前面 ─────────────────────────────────
{
  const firstWords = (key: string) => line(key).text.replace(/\|/g, '').trim().split(/\s+/)
  for (let idx = 0; idx < LESSON_LETTERS.length; idx++) {
    for (const q of makeQuiz(lessonLetter(idx), idx)) {
      for (const k of [...q.prompt, ...q.echo]) assert.ok(hasLine(k), `缺台詞 ${k}`)
      const k = q.prompt[0]
      if (q.kind === 'word') {
        assert.equal(k, `ph.${q.L.toLowerCase()}.ask`, '找開頭的圖：先念字母和它的音')
        assert.equal(keywordWords(k), 2, '關鍵字是字母名和第一個音')
      }
      else {
        // Big S! / Little s!：整句就是關鍵字，兩個字
        assert.equal(firstWords(k).length, 2, k)
        assert.equal(keywordWords(k), Infinity)
      }
    }
  }
  assert.deepEqual(firstWords('m.ask.more').slice(0, 1), ['More!'])
  assert.equal(keywordWords('m.ask.more'), 1)
  assert.deepEqual(firstWords('m.ask.less').slice(0, 1), ['Fewer!'])
  assert.equal(line('m.ask.num.3').text, line('m.num.3').text, '找數字、拿給波波的開頭「Three!」跟數數同一段音檔')
  assert.equal(line('ph.s.ask').text, line('ph.s.sound').text)
}
ok('題目的關鍵字放在最前面：Big S!、Little s!、S… s, s… Which one starts with S?、More! Which side?、Three! Where is three?')

// ── 7. 正確答案的位置是隨機的（不能靠位置猜）──────────────────
{
  const pos = new Map<string, number[]>()
  const note = (k: string, i: number, len: number) => {
    const a = pos.get(`${k}/${len}`) ?? Array<number>(len).fill(0)
    a[i]++
    pos.set(`${k}/${len}`, a)
  }
  for (let r = 0; r < 400; r++) {
    for (const idx of [1, 5, 12]) for (const q of makeQuiz(lessonLetter(idx), idx)) note(`en-${q.kind}`, q.options.findIndex((o) => o.id === q.answer), q.options.length)
    const l: Lesson = { mode: 'new', n: 4, max: 4, part: 0 }
    for (const q of compareQs(l)) note('compare', (q.ask === 'more' ? q.a > q.b : q.a < q.b) ? 0 : 1, 2)
    for (const q of reviewQs(l)) note(`review-${q.kind}`, q.options.indexOf(q.n), q.options.length)
  }
  for (const [k, a] of pos) {
    const total = a.reduce((x, y) => x + y, 0)
    if (total < 100) continue
    for (const c of a) assert.ok(Math.abs(c / total - 1 / a.length) < 0.12, `${k} 答案位置不夠平均：${a.join('/')}`)
  }
}
ok('正確答案的位置每個都差不多（英文三種題目、比多少、小複習）')

// ── 8. 真的學會了嗎？（家長確認卡）────────────────────────────
{
  const day = (d: number) => `2026-11-0${d}`
  // 找大 S：聽完才答 5 次對 4 次 → 出卡；之前猜的、示範過的不算
  const real = [true, true, false, true, true].map((ok, i) => att('letter:S', 'lesson-en', ok, true, 2, day(1 + (i % 3))))
  const noise = [att('letter:S', 'lesson-en', true, false, 2, day(4)), att('letter:S', 'lesson-en', true, true, 2, day(4), { metrics: { shown: 1 } })]
  assert.equal(heardMastered([...real.slice(0, 4), ...noise], 'letter:S'), false, '聽完才答只有 4 次：還不算（猜的、示範過的不算）')
  assert.equal(heardMastered([...real, ...noise], 'letter:S'), true, '最近 5 次聽完才答對 4 次')
  assert.equal(heardMastered([true, false, true, false, true].map((ok) => att('compare:more', 'm-compare', ok, true, 2)), 'compare:more'), false, '2 選 1 對 3 次不算')
  const all = [...real, ...noise]
  const cards = checkCards(all, {})
  assert.deepEqual(cards.map((c) => c.skill), ['letter:S'])
  assert.equal(cards[0].label, '找大 S')
  assert.match(cards[0].ask, /Where is big S\?/)
  // 他會：不再出卡
  assert.equal(checkCards(all, { 'letter:S': { ok: true, at: Date.now() } }).length, 0, '按過「他會」不再出')
  // 還不會：只看之後的作答；之後又熟練了才再出
  const at = Math.max(...all.map((a) => a.ts)) + 1
  const no = { 'letter:S': { ok: false, at } }
  assert.equal(checkCards(all, no).length, 0, '按「還不會」：退回練習，卡收起來')
  assert.equal(afterChecks(all, no).filter((a) => a.skill === 'letter:S').length, 0, '家長區的熟練只看「還不會」之後的作答')
  const again = range(1, 5).map(() => att('letter:S', 'lesson-en', true, true, 2, day(6)))
  assert.equal(checkCards([...all, ...again], no).length, 1, '之後又熟練了：卡再出來')
  // 兩台裝置合併：比較晚的為準
  const m = mergeChecks({ 'letter:S': { ok: true, at: 10 }, 'num:3': { ok: false, at: 5 } }, { 'letter:S': { ok: false, at: 20 }, 'num:3': { ok: true, at: 1 }, bad: { ok: 'x', at: 3 } as never })
  assert.deepEqual(m, { 'letter:S': { ok: false, at: 20 }, 'num:3': { ok: false, at: 5 } })
  // 每一種概念都有中文的問法
  for (const k of ['letter:S', 'letter:s', 'phonics:s', 'compare:more', 'compare:less', 'num:3', 'count:4', 'give:3']) assert.ok(!/照 App 裡的問法/.test(askFor(k)), k)
  assert.match(askFor('give:3'), /Give me three!/)
  assert.match(askFor('phonics:s'), /Which one starts with S\?/)
}
ok('真的學會了嗎？：新規則熟練了才出卡；他會不再出、還不會退回練習（之後又熟練才再出）；兩台裝置以比較晚的為準')

// ── 9. 分不出大小寫、一直點大的（盲測 e6ecd05 第 1 點）不會被當成學會 ────────────
{
  // 字母題的陪襯「同一個字母的另一種寫法」不算選項
  assert.equal(choicesOf({ skill: 'letter:S', options: ['S', 'S:little'] }), 1, '找大 S、只有 S 和 s：一直點大的就一定對')
  assert.equal(choicesOf({ skill: 'letter:S', options: ['S', 'A', 'S:little'] }), 2)
  assert.equal(choicesOf({ skill: 'num:3', options: ['3', '1', '5'] }), 3)
  // 一個一直點大的孩子：找大 S（S／s）每次都對、找小 s（s／S）每次都錯，都是聽完才點的
  const bigS = range(1, 8).map((i) => att('letter:S', 'lesson-en', true, true, 2, `2026-11-0${(i % 7) + 1}`, { options: ['S', 'S:little'] }))
  const littleS = range(1, 8).map((i) => att('letter:s', 'lesson-en', false, true, 2, `2026-11-0${(i % 7) + 1}`, { options: ['S', 'S:big'] }))
  const xs = [...bigS, ...littleS]
  assert.equal(heardMastered(xs, 'letter:S'), false, '確認卡：一直點大的，找大 S 不算學會')
  assert.equal(checkCards(xs, {}).length, 0, '不出確認卡')
  assert.equal(mastery(xs, 'letter:S').recent, 0, '家長區的熟練：只有 S／s 兩張的題目不算')
  // 孩子端的熟練：只有一個真正選項的題目不記、技能從此照聽完才答判斷，盒子再高也不算熟
  let hw: number[] | undefined
  for (const a of bigS) hw = pushHeard(hw, a.firstTryCorrect, choicesOf(a))
  assert.deepEqual(hw, [])
  assert.equal(heardFirm(hw), false, '孩子端：一直點大的，找大 S 不算熟')
  // 有別的大寫字母當陪襯（S、A、s）：一直點大的只剩一半機會，5 次要對 4 次才算
  const mixed = [true, true, true, true, false].map((ok) => att('letter:S', 'lesson-en', ok, true, 3, '2026-11-08', { options: ['S', 'A', 'S:little'] }))
  assert.equal(heardMastered(mixed, 'letter:S'), true, '真的認得：S／A／s 五次對四次')
}
ok('分不出大小寫、一直點大的：找大 S 不算學會（只有 S／s 兩張的題目不算進熟練，家長區、孩子端、確認卡都一樣）')

// ── 手帶著做的不算（T-111，盲測 a35cd5e：找大 S／小 s 答對的 12 次有 5 次是手指著答案時點的） ──
{
  const days = ['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-07', '2026-11-08']
  const opt = { options: ['S', 'A', 'B'] }
  // 每一次都是聽完才答、一次就對，但第一次點的時候手正指著答案（led）、或手先示範過（shown）、或一起練（guided）
  const led = days.flatMap((d) => [
    att('letter:S', 'lesson-en', true, true, 3, d, { ...opt, phase: 'guided', metrics: { led: 1 } }),
    att('letter:S', 'lesson-en', true, true, 3, d, { ...opt, phase: 'guided', metrics: { shown: 1 } }),
    att('letter:S', 'lesson-en', true, true, 3, d, { ...opt, metrics: { led: 1 } }),
  ])
  for (const a of led) assert.equal(counts(a), false, '下一步準備度：手帶著做的不算')
  assert.equal(mastery(led, 'letter:S').recent, 0, '家長區的熟練：一題都不算')
  assert.equal(listenStats(led, 'english', 30, Date.parse('2026-11-08T12:00:00')).total, 0, '「聽完才答」統計：不算')
  assert.equal(heardMastered(led, 'letter:S'), false, '確認卡：不算學會')
  assert.equal(checkCards(led, {}).length, 0, '不出確認卡')
  // 自己答的（手沒出來）照算
  const own = days.map((d) => att('letter:S', 'lesson-en', true, true, 3, d, opt))
  assert.equal(counts(own[0]), true)
  assert.equal(listenStats([...led, ...own], 'english', 30, Date.parse('2026-11-08T12:00:00')).total, own.length, '只算自己答的')
}
ok('手帶著做的（一起練、手示範過、第一次點的時候手正指著答案）：不計入熟練、準備度、聽完才答、確認卡；自己答的照算')

// ── T-127：英文課選擇題的三種玩法（找卡片、泡泡、餵豆豆）game 不一樣、skill 一樣，家長區的「聽完才答」都算英文 ─────
{
  const now = Date.parse('2026-11-08T12:00:00')
  const xs = ['lesson-en', 'lesson-en-bubbles', 'lesson-en-feed'].map((g) => ({ ...att('letter:S', 'lesson-en', true, true), game: g }))
  const st = listenStats(xs, 'english', 14, now)
  assert.equal(st.total, 3, '三種玩法都算')
  assert.equal(st.rows.find((r) => r.label === '找大 S')?.heard, 3)
}
ok('英文課三種玩法（lesson-en、lesson-en-bubbles、lesson-en-feed）的作答都算進家長區的「聽完才答」')

console.log('ALL PASS')
