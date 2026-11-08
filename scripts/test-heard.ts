// 聽完才答（T-109）的單元測試：關鍵字什麼時候算念完、點下去那一刻聽完了沒、熟練只看聽完才答的、家長區的統計、
// 每一題的關鍵字都放在題目最前面、正確答案的位置是隨機的。
// 執行：npx tsx scripts/test-heard.ts（npm run verify 的「單元：聽完才答」）
import assert from 'node:assert/strict'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'
import { keywordWords } from '../src/content/keywords'
import type { Attempt } from '../src/lib/db'
import { GUESS_CEILING, HEARD_WINDOW, KeywordClock, guessTail, heardFirm, heardNeed, keywordEnd, pushHeard } from '../src/lib/heard'
import { listenLine, listenStats } from '../src/lib/listen-report'
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
  assert.equal(pushHeard(undefined, true, 1), undefined, '只有一個選項的不記')
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

console.log('ALL PASS')
