// 會動的繪本（T-127 B 案）的單元測試：一章最多 6 頁、一句只有一個角色動、門打開、睡著、第 2 天的停頓點、第 3 天的選圖、
// 第 1 天最後的問題、單字三明治（每個名詞一章只念一次、不念恐龍的名字、台詞都登記了）。
// 執行：npx tsx scripts/test-story-flow.ts（npm run verify 的「單元：會動的繪本」）
import assert from 'node:assert/strict'
import { allChapters, chapterLook, scriptOf } from '../src/content/story'
import { hasLine, line } from '../src/content/lines'
import { MAX_PAGES, MAX_PER_PAGE, actOf, flowOf, modeOfDay, pageStarts, peekOf, type StoryFlow } from '../src/content/story/flow'
import { STORY_NOUNS, storyNounKey } from '../src/content/story/words'
import { bridgeKey } from '../src/content/zh-words'
import { storyNextKey, storyWhereKey, storyWordKey } from '../src/content/lines-story'
import { PAGE_W, layout, type PageArt } from '../src/art/storybook/layout'

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)

// ── 每一章（小班段，念的那一版） ──
const chapters = allChapters().filter((c) => c.band === 'small')
const all: { id: string; f: StoryFlow; keys: string[]; texts: string[]; speakers: string[]; host: string }[] = []
for (const ch of chapters) {
  const look = chapterLook(ch, ch.door ?? 'bus')!
  const s = scriptOf(ch, { tracks: [], friend: null, door: ch.door ?? 'bus' })!
  const said = [...s.title, ...s.intro, ...s.stops.flat(), ...s.finale, ...s.end]
  const texts = said.map((x) => (hasLine(x.key) ? line(x.key).text : ''))
  const f = flowOf(ch, said.map((x) => ({ k: x.key, pic: x.pic })), texts, look.scene, look.icon)
  all.push({ id: ch.id, f, keys: said.map((x) => x.key), texts, speakers: said.map((x) => x.speaker), host: look.host })
}
assert.ok(all.length >= 40, `小班段的章節應該有 40 章以上（${all.length}）`)

// 1. 一章最多 6 頁、一頁最多 3 句，頁是連續的
for (const { id, f } of all) {
  assert.ok(f.pages >= 1 && f.pages <= MAX_PAGES, `${id} 分成 ${f.pages} 頁`)
  const sizes = Array.from({ length: f.pages }, (_, p) => f.pageOf.filter((x) => x === p).length)
  assert.ok(sizes.every((x) => x >= 1 && x <= MAX_PER_PAGE), `${id} 每頁的句數 ${sizes}`)
  f.pageOf.forEach((p, i) => i && assert.ok(p === f.pageOf[i - 1] || p === f.pageOf[i - 1] + 1, `${id} 第 ${i} 句的頁不連續`))
}
ok(`${all.length} 章都在 ${MAX_PAGES} 頁以內、一頁最多 ${MAX_PER_PAGE} 句`)

// 2. 一句最多一個動作，動的是擺法裡有的那一個
for (const { id, f } of all)
  f.acts.forEach((a, i) => {
    if (!a) return
    assert.ok(a.cast >= 0 && a.cast < f.arts[i].cast.length, `${id} 第 ${i} 句動的角色不在畫面上`)
  })
const moving = all.reduce((s, { f }) => s + f.acts.filter(Boolean).length, 0)
const beats = all.reduce((s, { f }) => s + f.acts.length, 0)
assert.ok(moving / beats > 0.5, `大部分的句子要有動作（${moving}/${beats}）`)
ok(`一句只有一個角色動（${moving}/${beats} 句有動作）`)

// 3. 動作的種類：門打開、睡著、走進來的方向、同一頁走過去
const KNOCK: PageArt = { scene: 'home', cast: [{ who: 'dodo', at: 'L' }, { who: 'door', at: 'C', size: 'L' }, { who: 'momo', at: 'R' }] }
const knock = actOf({ scene: 'home', cast: [{ who: 'egg', at: 'C', size: 'L' }] }, KNOCK, 'Knock, knock! Open, magic door!')
assert.equal(knock?.kind, 'open', '開門口令：門打開')
assert.equal(KNOCK.cast[knock!.cast].who, 'door')
const sleep = actOf({ scene: 'park', cast: [{ who: 'rabbit', at: 'RC' }] }, { scene: 'park', cast: [{ who: 'rabbit', at: 'RC', pose: 'sleep' }] }, 'Zzz… Rabbit sleeps.')
assert.equal(sleep?.kind, 'sleep', '換成睡覺的姿勢：睡著（ZZZ）')
assert.equal(sleep?.fromPose, 'stand')
const enterR = actOf(null, { scene: 'park', cast: [{ who: 'rabbit', at: 'C' }] }, 'Here is | Rabbit.')
assert.ok(enterR?.kind === 'enter' && enterR.dx < 0, '面向右邊的從左邊走進來')
const enterL = actOf(null, { scene: 'park', cast: [{ who: 'rabbit', at: 'C', flip: true }] }, 'Here is | Rabbit.')
assert.ok(enterL?.kind === 'enter' && enterL.dx > 0, '面向左邊的從右邊走進來')
const move = actOf({ scene: 'park', cast: [{ who: 'turtle', at: 'L', pose: 'walk' }] }, { scene: 'park', cast: [{ who: 'turtle', at: 'R', pose: 'walk' }] }, 'Turtle walks on.')
assert.ok(move?.kind === 'move' && move.dx < 0, '同一頁換位置：從原本的位置走過去')
const jump = actOf({ scene: 'park', cast: [{ who: 'rabbit', at: 'L' }] }, { scene: 'park', cast: [{ who: 'rabbit', at: 'R' }] }, 'Hop, hop! Rabbit jumps.')
assert.equal(jump?.kind, 'jump', '說 hop、jump：跳過去')
assert.equal(actOf(null, { scene: 'city', cast: [{ who: 'bus-stop', at: 'C' }] }, 'We wait here.'), null, '只有東西、沒有人說到：不動')
const rise = actOf(null, { scene: 'party', cast: [{ who: 'gift', at: 'C' }] }, 'Knock, knock! A | present!')
assert.ok(rise?.kind === 'enter' && rise.dx === 0 && rise.dy > 0, '說到的東西從下面慢慢升上來')
// 探出頭：走進來的角色停在畫面邊邊，身體有一部分在畫面裡（點得到）
const pk = peekOf(enterR!, { scene: 'park', cast: [{ who: 'rabbit', at: 'C' }] })
const p0 = layout({ scene: 'park', cast: [{ who: 'rabbit', at: 'C' }] })[0]
assert.ok(p0.x + pk.dx + p0.w > p0.w * 0.3 && p0.x + pk.dx < 0, '探出頭：一部分在畫面裡、一部分在左邊外面')
const pkR = peekOf(enterL!, { scene: 'park', cast: [{ who: 'rabbit', at: 'C', flip: true }] })
assert.ok(p0.x + pkR.dx < PAGE_W && p0.x + pkR.dx + p0.w > PAGE_W, '探出頭：從右邊探出來')
ok('門打開、睡著、走進來的方向、走過去、跳過去、探出頭')

// 4. 第 2 天的停頓點：每章 2～3 個、不在第一句、有重複句（Knock, knock!）的先停那一句
for (const { id, f, texts } of all) {
  assert.ok(f.actStops.length >= 2 && f.actStops.length <= 3, `${id} 第 2 天停 ${f.actStops.length} 次`)
  for (const s of f.actStops) {
    assert.ok(s.beat > 0, `${id} 第一句不停`)
    assert.equal(f.acts[s.beat]?.cast, s.cast, `${id} 停下來點的就是那一句要動的`)
  }
  const knockAt = texts.findIndex((t, i) => /Knock, knock/.test(t) && f.arts[i].cast.some((c) => c.who === 'door'))
  if (knockAt > 0) assert.ok(f.actStops.some((s) => s.beat === knockAt), `${id} 開門口令要停下來換他點門`)
}
ok('第 2 天每章停 2～3 次，開門口令一定停')

// 5. 第 3 天：第 2 頁起每一頁之前問一次，對的是那一頁的第一張圖、另一張看起來不一樣
for (const { id, f } of all) {
  const starts = pageStarts(f.pageOf)
  assert.ok(f.tellPicks.length >= starts.length - 2, `${id} 第 3 天問 ${f.tellPicks.length} 次（${starts.length} 頁）`)
  for (const t of f.tellPicks) {
    assert.ok(starts.includes(t.beat) && t.beat > 0, `${id} 只在換頁的時候問`)
    assert.equal(t.arts[t.answer], t.beat, `${id} 對的是這一頁的第一張`)
    const other = t.arts[1 - t.answer]
    assert.notEqual(f.pageOf[other], f.pageOf[t.beat] - 1, `${id} 另一張不是上一頁（剛剛看過的）`)
  }
}
ok('第 3 天換頁之前問 What happens next?，兩張圖選一張')

// 6. 第 1 天最後的問題：問的不是三隻恐龍，兩張圖不一樣，台詞登記了
let asks = 0
for (const { id, f, host } of all) {
  if (!f.ask) continue
  asks++
  assert.ok(!['dodo', 'bobo', 'momo'].includes(f.ask.noun), `${id} 不問恐龍`)
  assert.notEqual(f.ask.picks[0], f.ask.picks[1])
  assert.equal(f.ask.picks[f.ask.answer], f.ask.noun)
  assert.ok(hasLine(storyWhereKey(host as never, f.ask.noun)), `${id} 問題的台詞 ${storyWhereKey(host as never, f.ask.noun)} 要登記`)
}
assert.ok(asks >= all.length - 2, `幾乎每一章都要有第 1 天的問題（${asks}/${all.length}）`)
ok(`第 1 天念完問一題（${asks} 章）`)

// 7. 單字三明治：每個名詞一章只念一次、不念恐龍的名字、念的台詞都登記了（Rabbit. 和 兔子 → Rabbit.）
for (const { id, f, speakers } of all) {
  const nouns = [...f.sandwiches.values()]
  assert.equal(new Set(nouns).size, nouns.length, `${id} 同一個名詞念了兩次三明治`)
  for (const [i, noun] of f.sandwiches) {
    assert.ok(STORY_NOUNS[noun], `${id} ${noun} 沒有中文`)
    assert.ok(hasLine(storyWordKey(speakers[i] as never, noun)), `${id} 第 ${i} 句 ${noun} 的英文沒登記`)
    const br = bridgeKey(storyNounKey(noun), speakers[i] as never)
    assert.ok(hasLine(br) && line(br).zh === STORY_NOUNS[noun].zh, `${id} 第 ${i} 句 ${noun} 的三明治沒登記`)
  }
}
const none = flowOf(null, [{ k: 'x' }], ['Here is | Rabbit.'], 'park', 'rabbit', () => false)
assert.equal(none.sandwiches.size, 0, '中文音檔還沒產生的名詞不念三明治')
for (const s of ['dodo', 'bobo', 'momo'] as const) assert.ok(hasLine(storyNextKey(s)))
ok('單字三明治每個名詞一章念一次，台詞都登記了')

// 8. 第幾天念什麼玩法
assert.deepEqual([1, 2, 3, 4].map(modeOfDay), ['look', 'act', 'tell', 'tell'])
ok('第 1 天看、第 2 天一起演、第 3 天你來說')

console.log('ALL PASS')
