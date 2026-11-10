// 故事時間英文版課文（T-129）的單元測試：180 篇都有 4 句短英文、紅字詞的英文一致、三明治和念完的題目照中文課文算得對、
// 台詞都登記了、每一頁都有圖、念完 4 句的三題（故事題、認角色、找一樣的英文字）、書上那一圈。
// 執行：npx tsx scripts/test-story-en.ts（npm run verify 的「單元：故事時間英文版課文」）
import assert from 'node:assert/strict'
import { ZH_TEXTS } from '../src/lessons/chinese/data'
import { EN_PAGES, EN_SAME_KEY, EN_TEXTS, enLineKey, enNounKey, enQKey, enWhichKey, enWordId, enWordKey, enWordOf } from '../src/content/story/english'
import { hasLine, line } from '../src/content/lines'
import { bridgeKey, zhWord } from '../src/content/zh-words'
import { EN_RING, heardTimes, matchOf, pagePics, pictured, storyAskOf, whichOf } from '../src/screens/story/en-pages'
import TALK from '../src/lessons/chinese/talk.json'

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)
const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const mentions = (s: string, en: string) => new RegExp(`\\b${en.replace(/[-]/g, '.').replace(/ /g, '\\s+')}(s|es)?\\b`, 'i').test(s)

// 1. 180 篇、跟中文課同一篇同一個順序、每篇 4 句、一句 2～6 個字、只有英文字母和標點
assert.equal(EN_TEXTS.length, ZH_TEXTS.length)
EN_TEXTS.forEach((e, i) => {
  assert.equal(e.day, ZH_TEXTS[i].day, `第 ${i} 篇的 day 對不上`)
  assert.equal(e.en.length, EN_PAGES, `${e.day} 要 ${EN_PAGES} 句`)
  for (const s of e.en) {
    assert.ok(words(s) >= 2 && words(s) <= 6, `${e.day}「${s}」超過 6 個字（FRAME-4）`)
    assert.match(s, /^[A-Za-z][A-Za-z ,'\-!?.]*[.!?]$/, `${e.day}「${s}」有英文以外的字`)
  }
})
ok(`${EN_TEXTS.length} 篇都是 4 句、一句最多 6 個字`)

// 2. 每個紅字詞都有英文，同一個中文在每一篇都是同一個英文（三明治的台詞一個中文只有一句）
const seen = new Map<string, string>()
for (const [i, e] of EN_TEXTS.entries()) {
  for (const w of ZH_TEXTS[i].redWords) assert.ok(e.words[w], `${e.day} 的紅字「${w}」沒有英文`)
  for (const [zh, en] of Object.entries(e.words)) {
    assert.equal(seen.get(zh) ?? en, en, `「${zh}」在 ${e.day} 是 ${en}，別篇是 ${seen.get(zh)}`)
    seen.set(zh, en)
  }
}
const ids = new Map<string, string>()
for (const zh of seen.keys()) {
  const id = enWordId(zh)
  assert.ok(id && (!ids.has(id) || ids.get(id) === zh), `「${zh}」的 id ${id} 跟「${ids.get(id)}」重複`)
  ids.set(id, zh)
}
ok(`紅字詞 ${seen.size} 個，英文一致、id 不重複`)

// 3. 三明治（sw）：照中文課文重算一次要一樣——第 i 行的紅字（兩個字以上）、英文出現在第 i 句、這一篇第一次出現
for (const [k, e] of EN_TEXTS.entries()) {
  const t = ZH_TEXTS[k]
  const used = new Set<string>()
  const want = e.en.map((s, i) => {
    const l = t.lines[Math.min(i, t.lines.length - 1)]
    for (const zh of (l.match(/【([^】]+)】/g) ?? []).map((x) => x.slice(1, -1))) {
      // 一個字的（樹、貓）不念：中文音檔（BreezyVoice）至少要兩個字（extract-phrases 的規則）
      if (used.has(zh) || [...zh].length < 2 || !e.words[zh] || !mentions(s, e.words[zh])) continue
      used.add(zh)
      return zh
    }
    return null
  })
  assert.deepEqual(e.sw, want, `${e.day} 的三明治跟中文課文算的不一樣`)
  // 故事題的答案：中文課「聊一聊」的那張圖（畫在頁上的紅字才問）
  const pics = pictured(t, e)
  const ans = (TALK as Record<string, { pic: string }>)[t.day]?.pic
  assert.equal(e.q?.ans ?? null, ans && pics.includes(ans) ? ans : null, `${e.day} 故事題的答案`)
  if (e.q) {
    assert.match(e.q.en, /^[A-Za-z][A-Za-z ,'-]*\?$/, `${e.day} 故事題「${e.q.en}」`)
    assert.ok(words(e.q.en) <= 6, `${e.day} 故事題超過 6 個字`)
    assert.ok(!mentions(e.q.en, e.words[e.q.ans]), `${e.day} 故事題「${e.q.en}」把答案說出來了`)
  }
  // 認角色：畫在頁上的紅字，先挑選圖題答案，跟故事題的答案不一樣
  const pool = pics.filter((w) => w !== e.q?.ans)
  assert.equal(e.which, pool.includes(t.quiz.answer) ? t.quiz.answer : (pool[0] ?? (pics.includes(t.quiz.answer) ? t.quiz.answer : null)), `${e.day} 認角色`)
}
const sws = EN_TEXTS.reduce((s, e) => s + e.sw.filter(Boolean).length, 0)
assert.ok(EN_TEXTS.filter((e) => e.sw.some(Boolean)).length >= 170, '幾乎每一篇都要有三明治')
ok(`三明治 ${sws} 處、故事題 ${EN_TEXTS.filter((e) => e.q).length} 篇、認角色 ${EN_TEXTS.filter((e) => e.which).length} 篇，跟中文課文算的一樣`)

// 4. 台詞都登記了：每一句、問題、三明治（英文那一次和中文那一段；中文在 ZH_WORDS 裡，才會產生中文音檔）
for (const e of EN_TEXTS) {
  e.en.forEach((s, i) => {
    assert.ok(hasLine(enLineKey(e.day, i)), `${enLineKey(e.day, i)} 沒登記`)
    assert.equal(line(enLineKey(e.day, i)).text, s, `${enLineKey(e.day, i)} 不要加感嘆詞`)
    assert.equal(line(enLineKey(e.day, i)).speaker, 'momo')
  })
  if (e.q) assert.equal(line(enQKey(e.day)).text, e.q.en)
  if (e.which) {
    assert.equal(line(enWhichKey(e.which)).text, `Which one is the | ${enWordOf(e.which)}?`)
    assert.ok(hasLine(enWordKey(e.which)), `找一樣的英文字找對了要念 ${enWordKey(e.which)}`)
  }
  for (const zh of e.sw) {
    if (!zh) continue
    assert.ok(hasLine(enWordKey(zh)), `${enWordKey(zh)} 沒登記`)
    const br = bridgeKey(enNounKey(zh), 'momo')
    assert.ok(hasLine(br) && line(br).zh === zh, `${br} 的三明治沒登記`)
    assert.equal(zhWord(enNounKey(zh))?.zh, zh, `${zh} 不在 ZH_WORDS`)
  }
}
assert.ok(hasLine(EN_SAME_KEY))
ok('每一句、題目、三明治的台詞都登記了（莫莫念）')

// 5. 每一頁都有圖；念完 4 句的三題：兩張圖不一樣、對的那張是答案的圖；找一樣的英文字：兩個字不一樣、都畫在頁上
let qs = 0
let matches = 0
for (const [k, e] of EN_TEXTS.entries()) {
  const t = ZH_TEXTS[k]
  for (let i = 0; i < EN_PAGES; i++) assert.ok(pagePics(t, i).length > 0, `${e.day} 第 ${i + 1} 頁沒有圖`)
  for (const [x, w] of [
    [storyAskOf(t, e), e.q?.ans],
    [whichOf(t, e), e.which],
  ] as const) {
    if (!w) continue
    assert.ok(x, `${e.day} 有題目但湊不到兩張圖`)
    qs++
    assert.equal(x!.icons[x!.answer], t.emoji[w])
    assert.notEqual(x!.icons[0], x!.icons[1])
  }
  const m = matchOf(t, e)
  if (m) {
    matches++
    assert.equal(m.options[m.answer], enWordOf(e.which!))
    assert.notEqual(m.options[0], m.options[1])
    const shown = new Set(pictured(t, e).map((w) => enWordOf(w)))
    assert.ok(m.options.every((o) => shown.has(o)), `${e.day} 找一樣的字要用畫在頁上的字（${m.options}）`)
  }
}
assert.ok(qs >= 330, `念完的選圖題太少（${qs}）`)
assert.ok(matches >= 160, `找一樣的英文字太少（${matches} 篇）`)
ok(`每一頁都有圖；選圖題 ${qs} 題、找一樣的英文字 ${matches} 篇`)

// 6. 書上那一圈：聽完幾天（最多 3 格）
assert.equal(heardTimes({}, 1), 0)
assert.equal(heardTimes({ 1: ['2026-11-10', '2026-11-11'] }, 1), 2)
assert.equal(heardTimes({ 1: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'] }, 1), EN_RING)
ok('書上那一圈是聽完幾天（最多 3 格）')

console.log('ALL PASS')
