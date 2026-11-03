// 單字的中文三明治台詞（zh-words.ts）：zh.<說話者>.<單字> = 中文 → 停一下 → 英文再唸一次（加重的目標字聲線）。
// 每個字只定義會教它的恐龍（字出現在哪一站，那一站的主持人；和 lines.ts 的 lex.this.* 同一個規則）。
import { LEXICON } from './lexicon'
import { COLORS, SHAPES } from './park'
import { defBridge, type Speaker } from './registry'
import { ZH_WORDS, bridgeKey, colorKey, shapeKey } from './zh-words'

const voiceOf = (where: string): Speaker => (where === '動物村' ? 'momo' : where === '字母森林' ? 'dodo' : 'bobo')

const speakers = new Map<string, Set<Speaker>>()
for (const w of LEXICON) speakers.set(w.key, new Set(w.where.map(voiceOf)))
for (const c of COLORS) speakers.set(colorKey(c.id), new Set(['bobo']))
for (const s of SHAPES) speakers.set(shapeKey(s.id), new Set(['bobo']))

for (const w of ZH_WORDS) for (const s of speakers.get(w.key) ?? []) defBridge(bridgeKey(w.key, s), s, w.zh, w.en)
