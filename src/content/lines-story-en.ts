// 故事時間英文版課文的台詞（T-129）：每一篇 4 句（storyen.<篇>.<句>）、單字三明治（Rabbit. → 兔子 → Rabbit.）、
// 念完 4 句的三題：故事題（storyen.q.<篇>）、認角色（Which one is the | rabbit?）、找一樣的英文字（Find the same word!，找對了念那個字）。
// 全部是莫莫念（中文課的主持人），一律 en-US-AnaNeural。
import { def, defBridge } from './registry'
import { EN_SAME_KEY, EN_TEXTS, enLineKey, enNounEn, enNounKey, enQKey, enSandwichWords, enSpokenWords, enWhichKey, enWordKey, enWordOf } from './story/english'
import { bridgeKey } from './zh-words'

for (const t of EN_TEXTS) {
  t.en.forEach((s, i) => def(enLineKey(t.day, i), 'momo', s))
  if (t.q) def(enQKey(t.day), 'momo', t.q.en)
  if (t.which) def(enWhichKey(t.which), 'momo', `Which one is the | ${enWordOf(t.which)}?`)
}
def(EN_SAME_KEY, 'momo', 'Find the same word!')

for (const zh of enSpokenWords()) def(enWordKey(zh), 'momo', enNounEn(zh))
for (const zh of enSandwichWords()) defBridge(bridgeKey(enNounKey(zh), 'momo'), 'momo', zh, enNounEn(zh))
