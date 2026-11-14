// 家長區「4 歲的內容」（src/screens/parent/stage4-registry.ts，T-150 P）的單元測試。
// 執行：npx tsx scripts/test-stage4-registry.ts（npm run verify 的「單元：家長區 4 歲內容」）
// 驗收：三科都在、暫停的 kv 跟各科 stage4.ts 讀的一致（中文 stage4.paused.zh）、英文數學還沒有 stage4.ts 時顯示尚未提供；
// 開了的門寫哪天開、剛開 14 天每堂最多 1 個、之後最多一半、目前級數；沒開的門寫還差什麼；暫停中照 3 歲的上。
import assert from 'node:assert/strict'
import type { Attempt } from '../src/lib/db'
import * as ZH from '../src/lessons/chinese/stage4'
import { FRESH_DAYS, STAGE4_SUBJECTS, gateRow, shortDate, subjectView, type Gate } from '../src/screens/parent/stage4-registry'

const T = '2026-11-20'
const by = (id: string) => STAGE4_SUBJECTS.find((s) => s.id === id)!

// 1. 三科照順序，kv 的名字照命名規則；中文用 stage4.ts 自己的 key
{
  assert.deepEqual(
    STAGE4_SUBJECTS.map((s) => s.id),
    ['zh', 'en', 'math'],
  )
  assert.equal(by('zh').pauseKey, 'stage4.paused.zh')
  assert.equal(by('zh').pauseKey, ZH.PAUSE_KEY)
  assert.equal(by('zh').kvKey, ZH.STAGE4_KEY)
  assert.equal(by('en').pauseKey, 'stage4.paused.en')
  assert.equal(by('math').pauseKey, 'stage4.paused.math')
  assert.equal(by('en').kvKey, 'lesson.english.stage4')
  assert.equal(by('math').kvKey, 'lesson.math.stage4')
  console.log('ok 1 三科、暫停的 kv（stage4.paused.zh／en／math）跟中文 stage4.ts 一致')
}

// 2. 英文、數學還沒有 stage4.ts：尚未提供，沒有門
{
  for (const id of ['en', 'math']) {
    const s = by(id)
    if (s.mod) {
      console.log(`（${s.name}已經接上 stage4.ts，略過「尚未提供」的檢查）`)
      continue
    }
    const v = subjectView(s, [], {}, false, T)
    assert.equal(v.ready, false)
    assert.deepEqual(v.rows, [])
  }
  console.log('ok 2 還沒有 stage4.ts 的科目顯示尚未提供')
}

// 3. 中文：沒有作答紀錄，兩道門都沒開、寫還差什麼
{
  const v = subjectView(by('zh'), [] as Attempt[], {}, false, T)
  assert.equal(v.ready, true)
  assert.deepEqual(
    v.rows.map((r) => r.id),
    ['zh-long', 'zh-glyph4'],
  )
  for (const r of v.rows) {
    assert.equal(r.state, 'closed')
    assert.equal(r.status, '還沒開')
    assert.match(r.need, /^還差：.+/)
    assert.equal(r.dose, undefined)
  }
  console.log('ok 3 中文沒作答：兩道門沒開、寫還差什麼')
}

// 4. 中文：加長版 3 天前開的（剛開），4 選 1 沒開；kv 讀出來是 null 也不會壞
{
  const kv: ZH.Stage4Kv = { 'zh-long': { opened: '2026-11-17', level: 1 } }
  const v = subjectView(by('zh'), [], kv, false, T)
  const [long, g4] = v.rows
  assert.equal(long.state, 'open')
  assert.equal(long.status, '11/17 開的')
  assert.match(long.dose!, /剛開.*每堂最多 1 個 4 歲回合/)
  assert.equal(long.level, '目前第 1 級')
  assert.equal(g4.state, 'closed')
  assert.ok(subjectView(by('zh'), [], null, false, T).rows.length === 2)
  console.log('ok 4 中文加長版開了：哪天開的、剛開每堂最多 1 個、目前級數')
}

// 5. 開了 14 天以後：每堂最多一半；退一級時 need 寫現在的狀況
{
  const g: Gate = { id: 'x', label: 'x', open: true, openedOn: '2026-11-06', need: '最近答得不太好，先用短版複習', level: 0 }
  const r = gateRow(g, T, false)
  assert.equal(r.dose, '每堂最多一半是 4 歲回合')
  assert.equal(r.level, '目前第 0 級')
  assert.equal(r.need, '最近答得不太好，先用短版複習')
  // 第 13 天還算剛開，第 14 天就不算
  assert.match(gateRow({ ...g, openedOn: '2026-11-07' }, T, false).dose!, /剛開/)
  assert.equal(FRESH_DAYS, ZH.FRESH_DAYS)
  console.log('ok 5 開了 14 天以後每堂最多一半、退一級寫現在的狀況')
}

// 6. 暫停中：開了的門記著但照 3 歲的上；沒開的門暫停中不會開
{
  const open = gateRow({ id: 'a', label: 'a', open: true, openedOn: '2026-11-17', need: '' }, T, true)
  assert.equal(open.state, 'paused')
  assert.equal(open.status, '11/17 開的')
  assert.match(open.dose!, /暫停中/)
  const closed = gateRow({ id: 'b', label: 'b', open: false, need: '選圖還在練' }, T, true)
  assert.equal(closed.state, 'paused')
  assert.match(closed.status, /暫停中不會開/)
  assert.equal(closed.need, '還差：選圖還在練')
  console.log('ok 6 暫停中：開了的門記著、沒開的不會開')
}

// 7. 日期：同一年不寫年份；某一科的 gates 丟錯也不會讓家長區壞掉
{
  assert.equal(shortDate('2026-01-05', T), '1/5')
  assert.equal(shortDate('2025-12-31', T), '2025/12/31')
  const bad = { ...by('zh'), mod: { gates: () => { throw new Error('壞了') } } }
  assert.deepEqual(subjectView(bad, [], {}, false, T).rows, [])
  console.log('ok 7 日期格式、gates 丟錯不會壞')
}

// 8. 家長區的字不寫「失敗」（PARENT-3）
{
  const texts = subjectView(by('zh'), [], {}, false, T).rows.flatMap((r) => [r.status, r.need, r.dose ?? ''])
  assert.ok(!texts.some((x) => x.includes('失敗')))
  console.log('ok 8 沒有「失敗」兩個字')
}

console.log('ALL PASS')
