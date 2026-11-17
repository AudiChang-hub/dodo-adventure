// 心情臉（T-160）給大人看的小字（PARENT-1、PARENT-4、HOW-12）：玩的時候是「陪玩」（跟著這一題的心情換），一局玩完換成「現在去做」。中文小字，不念出來。
import type { Emo } from './data'

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
