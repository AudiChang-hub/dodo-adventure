// 中文三明治的缺漏檢查：教學卡可能教的每一個字（和 content/games.ts 用同樣的英文台詞），
// 都要有三明治台詞（zh.<恐龍>.<字>），而且中文音檔已經產生（public/audio/zh/index.json 有列、mp3 存在）。
// 用法：npx tsx scripts/check-zh.ts（缺漏不是 0 就以錯誤結束）
import { existsSync, readFileSync } from 'node:fs'

const { line, hasLine } = await import('../src/content/lines')
const { VOCAB } = await import('../src/content/vocab')
const { PHONICS, wordId } = await import('../src/content/letters')
const { COLORS, SHAPES } = await import('../src/content/park')
const { keyOfVocab, thisIs } = await import('../src/content/lexicon')
const { bridgeKey, colorKey, shapeKey, zhClip, zhWord } = await import('../src/content/zh-words')

const index: Record<string, string> = existsSync('public/audio/zh/index.json') ? JSON.parse(readFileSync('public/audio/zh/index.json', 'utf8')) : {}

/** [單字 key, 教學卡上教這個字的英文台詞] */
const cards: [string, string][] = []
for (const v of VOCAB) {
  const k = keyOfVocab(v.id)
  cards.push([k, `teach.vocab.${v.id}`], [k, thisIs(k)])
  if (v.sound) cards.push([k, `teach.sound.${v.id}`])
}
for (const u of PHONICS)
  for (const w of [...u.keys, ...u.review]) {
    const k = wordId(w.w)
    cards.push([k, `ph.word.${k}`], [k, thisIs(k)])
  }
for (const c of COLORS) cards.push([colorKey(c.id), `teach.color.${c.id}`])
for (const s of SHAPES) cards.push([shapeKey(s.id), `teach.shape.${s.id}`])

const problems: string[] = []
const words = new Set<string>()
for (const [key, en] of cards) {
  if (!hasLine(en)) continue // 沒有這種卡（例如沒有叫聲的動物沒有 teach.sound）
  words.add(key)
  const w = zhWord(key)
  if (!w) {
    problems.push(`${key}：沒有中文（lexicon-info.ts）`)
    continue
  }
  const b = bridgeKey(key, line(en).speaker)
  if (!hasLine(b)) problems.push(`${key}：沒有三明治台詞 ${b}（${en}）`)
  const file = zhClip(w.zh)
  const name = file.split('/')[1]
  if (!index[name] || !existsSync(`public/audio/${file}.mp3`)) problems.push(`${key}：中文音檔還沒產生（${w.zh}，${file}.mp3）`)
}
const uniq = [...new Set(problems)]
console.log(`教學卡上的字 ${words.size} 個（${cards.length} 種卡），中文音檔 ${Object.keys(index).length} 個，缺漏 ${uniq.length}`)
for (const p of uniq) console.log('  ' + p)
if (uniq.length) process.exit(1)
