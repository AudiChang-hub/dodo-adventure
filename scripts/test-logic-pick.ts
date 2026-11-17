// 遊戲角「邏輯遊戲」選單的分類和排法（2026-11-17：16 張分成 4 類）的單元測試。
// 執行：npx tsx scripts/test-logic-pick.ts（npm run verify 的「單元：遊戲角選單分類」）
// 驗收：lib/nav.ts 的 LogicGame 每一種都在選單、剛好在一類、沒有重複、共 16 張、4 類；
// 平板橫向 1200×786 一頁放下（不捲動），卡片 ≥ 2.5 公分（112px）、間距 ≥ 0.6 公分（28px）；手機直的每類最多 3 欄。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CARD_RATIO, PICK_GAP, PICK_GROUPS, TABLET_BOX, groupLayout } from '../src/games/logic/pick-grid'

// LogicGame 是型別，執行時讀原始碼取出全部的遊戲
const nav = fs.readFileSync('src/lib/nav.ts', 'utf8')
const union = /export type LogicGame =([^\n]+)/.exec(nav)?.[1] ?? ''
const ALL = [...union.matchAll(/'([a-z-]+)'/g)].map((m) => m[1])

{
  assert.equal(ALL.length, 16, `LogicGame 有 ${ALL.length} 種`)
  const listed = PICK_GROUPS.flatMap((g) => [...g.games])
  assert.equal(listed.length, 16, `選單有 ${listed.length} 張`)
  assert.equal(new Set(listed).size, listed.length, '有遊戲放在兩類或重複')
  for (const id of ALL) assert.equal(PICK_GROUPS.filter((g) => g.games.includes(id as never)).length, 1, `${id} 要剛好在一類`)
  for (const id of listed) assert.ok(ALL.includes(id), `${id} 不是 LogicGame`)
  console.log('ok 1 16 張都在選單、每張剛好一類、沒有重複')
}

{
  assert.deepEqual(
    PICK_GROUPS.map((g) => g.id),
    ['count', 'think', 'look', 'talk'],
  )
  assert.equal(new Set(PICK_GROUPS.map((g) => g.label)).size, 4)
  for (const g of PICK_GROUPS) assert.ok(g.games.length >= 2 && g.games.length <= 6, `${g.label} 有 ${g.games.length} 張`)
  const of = (id: string) => PICK_GROUPS.find((g) => g.games.includes(id as never))?.id
  assert.deepEqual(['picnic', 'drum', 'race', 'hide'].map(of), ['count', 'count', 'count', 'count'])
  assert.deepEqual(['memory', 'shadow', 'where'].map(of), ['look', 'look', 'look'])
  assert.deepEqual(['feel', 'order', 'listen'].map(of), ['talk', 'talk', 'talk'])
  console.log('ok 2 4 類：數一數、動動腦、看仔細、聽和說，每類 2～6 張')
}

{
  const sizes = PICK_GROUPS.map((g) => g.games.length)
  const l = groupLayout(sizes)
  assert.deepEqual(l.rows.flat(), [0, 1, 2, 3], '每一類都排到、順序不變')
  sizes.forEach((s, i) => assert.ok(l.cols[i] * Math.ceil(s / l.cols[i]) >= s, `${PICK_GROUPS[i].label} 排得下`))
  assert.ok(l.size.w <= TABLET_BOX.w + 0.5, `寬 ${l.size.w} 超出 ${TABLET_BOX.w}`)
  assert.ok(l.size.h <= TABLET_BOX.h + 0.5, `高 ${l.size.h} 超出 ${TABLET_BOX.h}`)
  assert.ok(l.card.w >= 112 && l.card.h >= 112, `卡片只有 ${l.card.w}×${l.card.h.toFixed(0)}`)
  assert.ok(Math.abs(l.card.w / l.card.h - CARD_RATIO) < 0.01)
  assert.ok(PICK_GAP >= 28, '間距 ≥ 0.6 公分')
  assert.ok(l.pcols.every((c) => c >= 1 && c <= 3), '手機直的每類最多 3 欄')
  console.log(`ok 3 平板橫向一頁放下：卡片 ${l.card.w}×${l.card.h.toFixed(0)}px（≥ 2.5 公分）、間距 ${PICK_GAP}px，選單 ${Math.round(l.size.w)}×${Math.round(l.size.h)} 在 ${TABLET_BOX.w}×${TABLET_BOX.h} 裡`)
}

{
  // 選單區大一點、小一點都放得下（排法照實際大小用 CSS 算）
  const sizes = PICK_GROUPS.map((g) => g.games.length)
  for (const box of [{ w: 1100, h: 520 }, { w: 1300, h: 600 }]) {
    const m = groupLayout(sizes, box)
    assert.ok(m.size.w <= box.w + 0.5 && m.size.h <= box.h + 0.5, `${box.w}×${box.h} 放得下`)
  }
  console.log('ok 4 不同大小的選單區都放得下')
}

console.log('ALL PASS')
