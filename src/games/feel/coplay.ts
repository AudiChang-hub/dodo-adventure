// 心情臉（T-160）給大人看的小字（PARENT-1、PARENT-4、HOW-12）：玩的時候是「陪玩」（跟著這一題的心情換），一局玩完換成「現在去做」。中文小字，不念出來。
import type { Emo, Mood } from './data'

const PLAY: Record<Emo, string> = {
  happy: '一起做開心的臉，問他：「什麼事會讓你開心？」',
  sad: '一起做難過的臉，問他：「難過的時候，抱一下會不會好一點？」',
  angry: '一起做生氣的臉，再一起慢慢吸一口氣、吐出來',
  scared: '一起做害怕的臉，問他：「害怕的時候可以找誰？」',
}
export const feelCoplay = (emo: Emo) => ({
  play: PLAY[emo],
  now: '現在去做：看繪本時指著角色問「他覺得怎樣？」也說說你自己今天的心情',
})

/** T-164「為什麼」那一層：大人問「為什麼」，讓他用自己的話說原因（指引 SE-1 的 4 歲：說出情緒的原因） */
const WHY: Record<Mood, string> = {
  happy: '問他：「他為什麼開心？」讓他用自己的話說，你再幫他說完整',
  sad: '問他：「他為什麼難過？我們可以怎麼幫他？」',
  angry: '問他：「他為什麼生氣？生氣的時候可以怎麼做？」',
  scared: '問他：「他為什麼害怕？害怕的時候可以找誰？」',
  surprised: '一起做嚇一跳的臉，問他：「什麼事會讓你嚇一跳？」',
}
export const whyCoplay = (m: Mood) => ({
  play: WHY[m],
  now: '現在去做：看繪本時問「他為什麼會這樣覺得？」也說說你自己今天為什麼開心',
})
