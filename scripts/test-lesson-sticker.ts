// 上完一堂有沒有挑貼紙的單元測試（docs/全球幼教指引-現況對照.md 的 A7 選項 2，lib/lesson-sticker.ts）：
// 模擬 40 堂，貼紙出現 8～14 次、最長間隔不超過 6 堂、不會連著兩堂都有、間隔不固定。
// 亂數用固定的種子跑很多個孩子（每個種子是一個孩子從第一堂開始），結果每次都一樣。
// 執行：npx tsx scripts/test-lesson-sticker.ts（失敗就 exit 1）
import assert from 'node:assert/strict'
import { afterLesson, drawGap, type LessonGap } from '../src/lib/lesson-sticker'

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)

/** 固定種子的亂數（mulberry32） */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LESSONS = 40
const KIDS = 5000

/** 一個孩子上 lessons 堂：第幾堂有貼紙（1 起算） */
function simulate(seed: number, lessons = LESSONS): number[] {
  const r = seeded(seed)
  let g: LessonGap | undefined
  const hits: number[] = []
  for (let i = 1; i <= lessons; i++) {
    const x = afterLesson(g, r)
    g = x.gap
    if (x.sticker) hits.push(i)
  }
  return hits
}

const counts = new Map<number, number>()
let maxGap = 0
let total = 0
const gapsSeen = new Set<number>()
for (let s = 1; s <= KIDS; s++) {
  const hits = simulate(s)
  counts.set(hits.length, (counts.get(hits.length) ?? 0) + 1)
  total += hits.length
  assert.ok(hits.length >= 8 && hits.length <= 14, `種子 ${s}：40 堂出現 ${hits.length} 次（${hits.join(',')}）`)
  // 間隔：從第一堂開始到第一張，和每兩張之間；最後一張之後到第 40 堂還沒出現的也算（不能拖太久）
  const gaps = hits.map((h, i) => h - (i ? hits[i - 1] : 0))
  const tail = LESSONS - (hits.at(-1) ?? 0)
  for (const gp of gaps) {
    assert.ok(gp >= 2, `種子 ${s}：連著兩堂都有（${hits.join(',')}）`)
    gapsSeen.add(gp)
  }
  maxGap = Math.max(maxGap, ...gaps, tail + 1)
  assert.ok(Math.max(...gaps, tail + 1) <= 6, `種子 ${s}：間隔超過 6 堂（${hits.join(',')}）`)
  assert.ok(new Set(gaps.slice(1)).size >= 2, `種子 ${s}：每次都隔一樣多堂（${gaps.join(',')}）`)
}
const dist = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} 次 ${((v / KIDS) * 100).toFixed(1)}%`)
ok(`${KIDS} 個孩子各上 40 堂：每個都出現 8～14 次（平均 ${(total / KIDS).toFixed(1)} 次；${dist.join('、')}）`)
ok(`最長間隔 ${maxGap} 堂（不超過 6），從來不會連著兩堂都有`)
assert.deepEqual([...gapsSeen].sort(), [2, 3, 4, 5])
ok('間隔不固定：2、3、4、5 堂都會出現，每個孩子至少兩種間隔')

// 平均每 3～4 堂一次
const draws = Array.from({ length: 20000 }, (_, i) => drawGap(seeded(i + 1)))
const mean = draws.reduce((a, b) => a + b, 0) / draws.length
assert.ok(mean >= 3 && mean <= 4, `平均間隔 ${mean}`)
ok(`平均每 ${mean.toFixed(2)} 堂一次`)

// 舊資料（沒有狀態）：第一堂不會馬上有，最晚第 5 堂
for (let s = 1; s <= 200; s++) {
  const first = simulate(s, 10)[0]
  assert.ok(first >= 2 && first <= 5, `種子 ${s}：第一張在第 ${first} 堂`)
}
ok('第一次（沒有狀態）：第 2～5 堂之間出現第一張')

// 亂數給到邊界（0、接近 1）也不會壞
assert.equal(drawGap(() => 0), 2)
assert.equal(drawGap(() => 0.999999), 5)
assert.equal(drawGap(() => 1), 5)
ok('亂數在邊界也只會抽到 2～5')

// 存起來的狀態：沒有貼紙的那堂只多算一堂，有貼紙的那堂從 0 重新算
assert.deepEqual(afterLesson({ since: 1, next: 4 }, () => 0), { sticker: false, gap: { since: 2, next: 4 } })
assert.deepEqual(afterLesson({ since: 3, next: 4 }, () => 0), { sticker: true, gap: { since: 0, next: 2 } })
ok('沒貼紙的那堂只多算一堂；有貼紙的那堂重新抽下一輪')

console.log('ALL PASS')
