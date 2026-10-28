// 從 docs/vocab-audit.json 取出 App 現在用到的字的中文與層級，寫成 src/content/lexicon-info.ts
// 執行：npx tsx scripts/gen-lexicon-info.ts <主 repo 的 docs/vocab-audit.json>（docs/ 不在 git 裡）
import { readFileSync, writeFileSync } from 'node:fs'
import { VOCAB } from '../src/content/vocab'
import { PHONICS, wordId } from '../src/content/letters'
import { CATEGORIES, SHEET_NAMES } from '../src/content/worksheet-data'

const audit = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { en: string; zh: string; tier: number }[]
const byEn = new Map(audit.map((a) => [a.en.toLowerCase(), a]))

// 盤點之後才換上、盤點表裡沒有的字（依同樣的標準判斷層級）
const MANUAL: Record<string, [string, number]> = {
  noodles: ['麵', 1],
  elevator: ['電梯', 2],
  gift: ['禮物', 1],
  milk: ['牛奶', 1],
  soap: ['肥皂', 1],
  toothbrush: ['牙刷', 1],
  bike: ['腳踏車', 1],
  foot: ['腳', 1],
  flower: ['花', 1],
  cake: ['蛋糕', 1],
  rice: ['飯', 1],
  leg: ['腿', 1],
  ladder: ['梯子', 2],
  hand: ['手', 1],
  wheel: ['輪子', 2],
  chicken: ['雞', 1],
  dinosaur: ['恐龍', 2],
  boot: ['靴子', 2],
  'green-apple': ['青蘋果', 2],
  'race-car': ['賽車', 2],
}

const out: Record<string, [string, number]> = {}
const add = (en: string, zhFallback?: string) => {
  const key = wordId(en)
  if (out[key]) return
  const m = MANUAL[key]
  const a = byEn.get(en.toLowerCase())
  if (m) out[key] = m
  else if (a) out[key] = [a.zh, a.tier]
  else {
    console.warn('no info:', en)
    out[key] = [zhFallback ?? '', 2]
  }
}
for (const v of VOCAB) add(v.en, v.zh)
for (const u of PHONICS) for (const w of [...u.keys, ...u.review]) add(w.w)
for (const c of Object.values(CATEGORIES)) for (const icon of [...c.targets, ...c.easy, ...c.hard]) {
  const v = VOCAB.find((x) => x.icon === icon)
  const n = v?.en ?? SHEET_NAMES[icon]
  if (n) add(n, v?.zh)
}
const rows = Object.entries(out)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([k, [zh, t]]) => `  '${k}': ['${zh}', ${t}],`)
writeFileSync(
  'src/content/lexicon-info.ts',
  `// 單字的中文與層級（由 docs/vocab-audit.json 取出；盤點之後換上的字依同樣標準判斷）。家長區「單字清單」用。\n// 層級：1 生活中天天看到、中文已經會；2 從興趣延伸或第 1 層的下一步；3 以後再用。實際以家長勾選為準。\nexport const WORD_INFO: Record<string, [zh: string, tier: 1 | 2 | 3]> = {\n${rows.join('\n')}\n}\n`,
)
console.log(rows.length, 'words')
