// 貼紙本（T-132，src/screens/sticker-book.ts）的單元測試：最新的在最前面、同時間的照原本先後倒過來、不改原本的清單、
// 沒有貼紙是空的；每張貼紙歪的角度固定、在 -5° ～ 5° 之間。
// T-139：點貼紙的反應有變化（不同種類動作不同、同一張再點換一個），名字的單字三明治只用已經有中文音檔的詞。
// 執行：npx tsx scripts/test-sticker-book.ts（失敗就 exit 1）
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { BOARD_PEEK, CAT_MOVE, newestFirst, reactionOf, tiltOf, type Cat } from '../src/screens/sticker-book'

const { hasLine, line } = await import('../src/content/lines')
const { STICKER_ART } = await import('../src/content/sticker-art')
const { ACT_LINE, stickerBridge, stickerZh } = await import('../src/content/lines-stickers')
const { ZH_WORDS } = await import('../src/content/zh-words')

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

// ── T-139：點貼紙的反應 ──
const CATS = Object.keys(CAT_MOVE) as Cat[]
for (const cat of [...CATS, undefined]) {
  for (let n = 0; n < 9; n++) {
    const a = reactionOf(cat, n)
    const b = reactionOf(cat, n + 1)
    assert.ok(a.move !== b.move, `${cat} 第 ${n + 1}、${n + 2} 下動作一樣（${a.move}）`)
  }
  assert.equal(reactionOf(cat, 0).voice, 'name')
  assert.deepEqual(reactionOf(cat, 3), reactionOf(cat, 0))
}
ok('同一張連點：每一下都換一個動作，三下一輪，第一下念名字')

// 不是每一下都說話（孩子：「好多都在講話，我聽不懂」）
for (const cat of [...CATS, undefined]) assert.ok([0, 1, 2].some((n) => reactionOf(cat, n).voice === 'none'), `${cat} 每一下都在說話`)
ok('三下裡至少一下不說話')

assert.ok(new Set(Object.values(CAT_MOVE)).size >= 7, '各類的動作太少種')
assert.notEqual(reactionOf('dino', 0).move, reactionOf('car', 0).move)
assert.notEqual(reactionOf('sky', 0).move, reactionOf('fruit', 0).move)
ok('不同種類的貼紙第一下的動作不一樣')

const arts = new Set(STICKER_ART.map((a) => a.cat))
for (const cat of arts) {
  assert.ok(CAT_MOVE[cat as Cat], `${cat} 沒有動作`)
  assert.ok(hasLine(`stk.act.${cat}`), `${cat} 沒有狀聲詞台詞`)
  assert.ok(!/[一-鿿]/.test(ACT_LINE[cat as Cat]), `${cat} 的狀聲詞有中文`)
}
ok('每一類都有自己的動作和英文狀聲詞')

// 名字的單字三明治：每張圖庫貼紙都有三明治台詞（中文 → 英文），英文跟名字同一個字
for (const a of STICKER_ART) {
  const b = line(stickerBridge(a.id))
  assert.equal(b.zh, stickerZh(a.id))
  assert.equal(b.text.replace(/\.$/, '').toLowerCase(), a.en.replace(/!$/, '').toLowerCase(), a.id)
}
assert.equal(stickerZh(undefined), undefined)
ok('每張圖庫貼紙都有名字的三明治台詞，v1 舊貼紙沒有')

// 不做新的中文語音：貼紙不進 gen_zh_words.py 的清單（ZH_WORDS）；中文跟課程同一個英文字的一樣，共用音檔
const zhKeys = new Set(ZH_WORDS.map((w) => w.key))
assert.ok(![...zhKeys].some((k) => k.includes('sticker')), 'ZH_WORDS 裡有貼紙')
const lex = new Map(ZH_WORDS.map((w) => [w.en.replace(/[.!]+$/, '').toLowerCase(), w.zh]))
const lion = STICKER_ART.find((a) => a.id === 'lion')!
assert.equal(stickerZh('lion'), lex.get('lion') ?? lion.zh)
ok('不產生新的中文語音：貼紙不在中文清單裡，中文跟課程的字共用')

// 有中文音檔（public/audio/zh/index.json）的詞才會念中文（播的時候 lib/words.ts 的 zhClipReady 擋）；這裡算一下現在有幾張
if (existsSync('public/audio/zh/index.json')) {
  const have = new Set(Object.values(JSON.parse(readFileSync('public/audio/zh/index.json', 'utf8'))) as string[])
  const yes = STICKER_ART.filter((a) => have.has(stickerZh(a.id)!))
  assert.ok(yes.length >= STICKER_ART.length / 2, `只有 ${yes.length} 張有中文音檔`)
  ok(`有中文音檔的貼紙 ${yes.length}/${STICKER_ART.length} 張念三明治，其他只念英文`)
}

console.log('ALL PASS')
