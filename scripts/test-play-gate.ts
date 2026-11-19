// 遊戲角的鎖（src/lib/play-gate.ts，T-152 P2）的單元測試。
// 執行：npx tsx scripts/test-play-gate.ts（npm run verify 的「單元：遊戲角的鎖」）
// 驗收（設計稿第五節）：三科今天都上完才開；少一科、只有開始沒有上完（中途離開）、昨天的紀錄都不開；
// 今天先打開只算今天；一直開著；跨過半夜才上完記在開始那一天；門燈三盞各自正確；設定的預設是一直開著（家長 2026-11-16）。
import assert from 'node:assert/strict'
import { firstUnlit, gateHint, playGate, GATE_HOST, GATE_ORDER } from '../src/lib/play-gate'
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

t('引導（T-169）：鎖住時點了，指向還沒上的第一科、那一科的恐龍說、算得出還差幾堂', () => {
  const none = playGate([], null, 'after', D)
  assert.deepEqual(gateHint(none), { subject: 'english', host: 'dodo', line: 'home.corner.next.english', left: 3 })
  // 英文上完、中文中途離開：去中文（莫莫），還差 2 堂
  const one = playGate([run('english'), run('chinese', D, false)], null, 'after', D)
  assert.deepEqual(gateHint(one), { subject: 'chinese', host: 'momo', line: 'home.corner.next.chinese', left: 2 })
  // 跳著上（先上數學）：還是照門的順序指英文，還差 2 堂
  assert.equal(gateHint(playGate([run('math')], null, 'after', D))?.subject, 'english')
  assert.equal(gateHint(playGate([run('math')], null, 'after', D))?.left, 2)
  // 只差數學：波波，還差 1 堂
  assert.deepEqual(gateHint(playGate([run('english'), run('chinese')], null, 'after', D)), { subject: 'math', host: 'bobo', line: 'home.corner.next.math', left: 1 })
  // 開著（三堂上完、今天先打開、一直開著）都不引導
  assert.equal(gateHint(playGate(ALL, null, 'after', D)), null)
  assert.equal(gateHint(playGate([], { date: D }, 'after', D)), null)
  assert.equal(gateHint(playGate([], null, 'always', D)), null)
})

t('台詞（T-169）：三科各一句，由那一科的恐龍說出自己的名字；英文、≤ 6 個字、不說「不行」和交換條件', () => {
  for (const s of GATE_ORDER) {
    const k = `home.corner.next.${s}`
    assert.ok(hasLine(k), `缺台詞 ${k}`)
    const l = line(k)
    assert.equal(l.speaker, GATE_HOST[s])
    const name = GATE_HOST[s][0].toUpperCase() + GATE_HOST[s].slice(1)
    assert.ok(l.text.includes(name), `${k} 要說出 ${name}：${l.text}`)
    assert.ok(l.text.replace(/[^A-Za-z' ]/g, '').trim().split(/\s+/).length <= 6, `${k} 超過 6 個字：${l.text}`)
    assert.ok(!/not yet|can't|cannot|finish|\bno\b|then play/i.test(l.text), `${k} 不說不行、不說交換條件：${l.text}`)
    assert.ok(!/[一-鿿]/.test(l.text), `${k} 只說英文`)
  }
  assert.ok(!hasLine('home.corner.first'), '舊的 First class. Then play! 不再用')
  assert.ok(hasLine('home.corner.open'))
  assert.equal(line('home.corner.open').speaker, 'dodo')
  assert.ok(line('home.corner.open').text.includes('Play corner is open!'))
})

console.log(`ALL PASS（${n} 項）`)
