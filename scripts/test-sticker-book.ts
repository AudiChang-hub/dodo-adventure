// 貼紙本（T-132，src/screens/sticker-book.ts）的單元測試：最新的在最前面、同時間的照原本先後倒過來、不改原本的清單、
// 沒有貼紙是空的；每張貼紙歪的角度固定、在 -5° ～ 5° 之間。
// 執行：npx tsx scripts/test-sticker-book.ts（失敗就 exit 1）
import assert from 'node:assert/strict'
import { BOARD_PEEK, newestFirst, tiltOf } from '../src/screens/sticker-book'

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)

const S = (key: string, ts: number) => ({ key, ts })

// album() 是照拿到的先後（舊 → 新）
const album = [S('a', 100), S('b', 200), S('c', 300), S('d', 400)]
assert.deepEqual(
  newestFirst(album).map((s) => s.key),
  ['d', 'c', 'b', 'a'],
)
ok('最新的在最前面')

// 舊資料補發的貼紙可能同一個時間：後面那張（album 裡比較後面的）排前面
assert.deepEqual(
  newestFirst([S('x', 50), S('y', 50), S('z', 60)]).map((s) => s.key),
  ['z', 'y', 'x'],
)
ok('同一個時間的照原本的先後倒過來')

// 亂序進來也排得對（album() 雖然排好了，這裡不依賴它）
assert.deepEqual(
  newestFirst([S('m', 300), S('k', 100), S('l', 200)]).map((s) => s.key),
  ['m', 'l', 'k'],
)
ok('亂序進來也照時間排')

const before = album.map((s) => s.key).join()
newestFirst(album)
assert.equal(album.map((s) => s.key).join(), before)
ok('不改原本的清單（只讀）')

assert.deepEqual(newestFirst([]), [])
ok('沒有貼紙：空的')

// 同一款貼了 50 張也都在，一張都不少
const many = Array.from({ length: 50 }, (_, i) => S(`k${i}`, 1000 + i))
const sorted = newestFirst(many)
assert.equal(sorted.length, 50)
assert.equal(new Set(sorted.map((s) => s.key)).size, 50)
assert.equal(sorted[0].key, 'k49')
ok('50 張都在、最新的那張在第一個')

for (let i = 0; i < 500; i++) {
  const key = `art:${i}:${i * 37}`
  const t = tiltOf(key)
  assert.ok(Number.isInteger(t) && t >= -5 && t <= 5, `${key} 歪 ${t}°`)
  assert.equal(tiltOf(key), t)
}
const tilts = new Set(Array.from({ length: 200 }, (_, i) => tiltOf(`t${i}`)))
assert.ok(tilts.size >= 6, `200 張只有 ${tilts.size} 種角度`)
ok('每張歪的角度固定、在 -5° ～ 5°、不會全部一樣')

assert.ok(BOARD_PEEK >= 1 && BOARD_PEEK <= 3)
ok('首頁貼紙板露出 1～3 張')

console.log('ALL PASS')
