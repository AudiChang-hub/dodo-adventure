// 每週新故事直接上線（T-120，家長 2026-11-09：「不用審稿，我相信你」）的單元測試：
// 審稿佇列的章節不用家長按通過就能播；家長撤下的這一版不播；撤下之後重寫過（內容不一樣）就又上線；放回就能播；
// 以前「通過」的紀錄照樣算上線。故事時間照第一輪的順序，沒有決定時直接講到佇列裡的那一則。
// 執行：npx tsx scripts/test-story-live.ts（npm run verify 的「單元：每週新故事直接上線」）
import assert from 'node:assert/strict'
import { A01 } from '../src/content/story/part1/a01'
import { CLASSICS, WEEKLY, chapterHash, draftChapters } from '../src/content/story'
import { playable, reviewStatus, statusOf, type Verdict } from '../src/lib/review'

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)
const v = (ok: boolean, hash: string): Verdict => ({ ok, hash, at: 1 })

const weekly = WEEKLY.flatMap(draftChapters)
assert.ok(weekly.length > 0, '審稿佇列裡要有章節')

// 1. 沒有任何決定：審稿佇列的每一章都上線、都能播
for (const ch of weekly) {
  assert.equal(statusOf(ch, undefined), 'live', `${ch.id} 沒有決定應該直接上線`)
  assert.equal(reviewStatus(ch), 'live', `${ch.id} 這台裝置沒有決定應該直接上線`)
  assert.ok(playable(ch), `${ch.id} 應該能播`)
}
ok(`審稿佇列 ${weekly.length} 章沒有決定就直接上線`)

// 2. 手寫的示範章節一直都能播
assert.equal(statusOf(A01.chapters[0], undefined), 'builtin')
assert.equal(statusOf(A01.chapters[0], v(false, 'x')), 'builtin', '手寫的章節不會被撤下')
ok('手寫的示範章節是 builtin')

// 3. 撤下、放回、重寫過、以前的通過
const ch = weekly[0]
const h = chapterHash(ch)
assert.equal(statusOf(ch, v(false, h)), 'off', '撤下的這一版不播')
assert.equal(statusOf(ch, v(true, h)), 'live', '放回（以前的通過）能播')
assert.equal(statusOf(ch, v(false, 'old-hash')), 'live', '撤下之後重寫過（內容不一樣）就又上線')
assert.equal(statusOf(ch, v(true, 'old-hash')), 'live', '以前通過的舊版紀錄不擋新版')
ok('撤下不播、放回能播、重寫過的新版直接上線')

// 4. 故事時間：沒有決定時照第一輪講（同 lib/story 的 nextClassic：第一則還沒講過、可以播的），佇列裡的不用等家長通過
const next = (done: string[]) => CLASSICS.find((c) => !done.includes(c.id) && playable(c.chapter))?.chapter.id ?? null
assert.equal(next([]), 'classic-a01')
assert.equal(next(['A01']), 'classic-j02', '佇列裡的 J02 不用等家長通過')
assert.equal(next(['A01', 'J02']), 'classic-a02')
assert.equal(next(['A01', 'J02', 'A02']), 'classic-b01')
ok('故事時間照第一輪的順序，佇列裡的直接講')

console.log('ALL PASS')
