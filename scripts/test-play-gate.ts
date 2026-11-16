// 遊戲角的鎖（src/lib/play-gate.ts，T-152 P2）的單元測試。
// 執行：npx tsx scripts/test-play-gate.ts（npm run verify 的「單元：遊戲角的鎖」）
// 驗收（設計稿第五節）：三科今天都上完才開；少一科、只有開始沒有上完（中途離開）、昨天的紀錄都不開；
// 今天先打開只算今天；一直開著；跨過半夜才上完記在開始那一天；門燈三盞各自正確；設定的預設是一直開著（家長 2026-11-16）。
import assert from 'node:assert/strict'
import { firstUnlit, playGate, GATE_ORDER } from '../src/lib/play-gate'
import { migrateSettings } from '../src/lib/settings'
import { today } from '../src/lib/db'
import type { LessonRun } from '../src/lib/readiness'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'

let n = 0
const t = (name: string, fn: () => void) => {
  fn()
  n++
  console.log(`ok ${n} - ${name}`)
}

const D = '2026-11-16'
const Y = '2026-11-15'
const at = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}
const run = (subject: LessonRun['subject'], day = D, done = true, h = 9): LessonRun => ({
  subject,
  date: day,
  start: at(day, h),
  ...(done ? { done: at(day, h, 4) } : {}),
})
const ALL = [run('english'), run('chinese'), run('math')]

t('三科今天都上完 → 開（why = done），三盞都亮', () => {
  const g = playGate(ALL, null, 'after', D)
  assert.equal(g.open, true)
  assert.equal(g.why, 'done')
  assert.deepEqual(g.lit, { english: true, chinese: true, math: true })
  assert.equal(firstUnlit(g), null)
})

t('少一科 → 關；門燈只亮上完的兩盞；還沒上的第一扇照門的順序', () => {
  const g = playGate([run('english'), run('math')], null, 'after', D)
  assert.equal(g.open, false)
  assert.equal(g.why, undefined)
  assert.deepEqual(g.lit, { english: true, chinese: false, math: true })
  assert.equal(firstUnlit(g), 'chinese')
  assert.equal(firstUnlit(playGate([], null, 'after', D)), 'english')
  assert.equal(firstUnlit(playGate([run('english'), run('chinese')], null, 'after', D)), 'math')
  assert.deepEqual([...GATE_ORDER], ['english', 'chinese', 'math'])
})

t('中途離開不算：只有開始、沒有 done 的那一科不亮、不開', () => {
  const g = playGate([run('english'), run('chinese', D, false), run('math')], null, 'after', D)
  assert.equal(g.open, false)
  assert.equal(g.lit.chinese, false)
})

t('中途離開、同一天回去上完（第二筆有 done）→ 算', () => {
  const g = playGate([run('english'), run('chinese', D, false, 9), run('chinese', D, true, 10), run('math')], null, 'after', D)
  assert.equal(g.open, true)
  assert.equal(g.lit.chinese, true)
})

t('同一科上兩次還是一科：三科要都有', () => {
  const g = playGate([run('english'), run('english', D, true, 10), run('math')], null, 'after', D)
  assert.equal(g.open, false)
  assert.equal(g.lit.chinese, false)
})

t('換日：昨天三科都上完，今天全關、門燈全暗', () => {
  const g = playGate(ALL.map((r) => ({ ...r, date: Y })), null, 'after', D)
  assert.equal(g.open, false)
  assert.deepEqual(g.lit, { english: false, chinese: false, math: false })
})

t('跨過半夜：23:59 開始、00:01 上完，記在開始那一天（前一天）', () => {
  const late: LessonRun = { subject: 'math', date: Y, start: at(Y, 23, 59), done: at(D, 0, 1) }
  assert.equal(playGate([run('english', Y), run('chinese', Y), late], null, 'after', Y).open, true)
  const g = playGate([run('english'), run('chinese'), late], null, 'after', D)
  assert.equal(g.open, false)
  assert.equal(g.lit.math, false)
})

t('今天先打開：日期是今天 → 開（why = today），門燈照實際上完的亮', () => {
  const g = playGate([run('english')], { date: D }, 'after', D)
  assert.equal(g.open, true)
  assert.equal(g.why, 'today')
  assert.deepEqual(g.lit, { english: true, chinese: false, math: false })
})

t('今天先打開：日期是昨天 → 隔天自動失效', () => {
  assert.equal(playGate([], { date: Y }, 'after', D).open, false)
  assert.equal(playGate([], null, 'after', D).open, false)
})

t('一直開著 → 開（why = always），不管有沒有上課', () => {
  const g = playGate([], null, 'always', D)
  assert.equal(g.open, true)
  assert.equal(g.why, 'always')
})

t('why 的順序：一直開著 > 今天先打開 > 上完（只有「因為上完才開」的那天才說 Play corner is open!）', () => {
  assert.equal(playGate(ALL, { date: D }, 'always', D).why, 'always')
  assert.equal(playGate(ALL, { date: D }, 'after', D).why, 'today')
  assert.equal(playGate(ALL, { date: Y }, 'after', D).why, 'done')
})

t('today() 是裝置的當地日期（半夜 12 點換日）', () => {
  assert.equal(today(new Date(2026, 10, 16, 23, 59)), '2026-11-16')
  assert.equal(today(new Date(2026, 10, 17, 0, 0)), '2026-11-17')
})

t('設定：預設一直開著；舊裝置存著的 after（當時的預設）升級後改成一直開著；新版家長選的 after 照家長的', () => {
  const fp = (s: object) => migrateSettings(s as never).s.freePlay
  assert.equal(fp({ freePlay: 'after', defaultsV: 3 }), 'always')
  assert.equal(fp({ defaultsV: 2 }), 'always')
  assert.equal(fp({ freePlay: 'after', defaultsV: 4 }), 'after')
  assert.equal(fp({ freePlay: 'always', defaultsV: 4 }), 'always')
})

t('台詞：鎖住時、打開時兩句都是豆豆、英文、只說順序', () => {
  for (const k of ['home.corner.first', 'home.corner.open']) {
    assert.ok(hasLine(k), `缺台詞 ${k}`)
    assert.equal(line(k).speaker, 'dodo')
  }
  const first = line('home.corner.first').text
  assert.ok(first.includes('First class. Then play!'), first)
  assert.ok(!/not yet|can't|finish/i.test(first), '鎖住的那一句不說「不行」、不說交換條件')
  assert.ok(line('home.corner.open').text.includes('Play corner is open!'))
})

console.log(`ALL PASS（${n} 項）`)
