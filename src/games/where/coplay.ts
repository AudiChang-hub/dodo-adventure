// 躲在哪裡（T-160）給大人看的小字（PARENT-1、PARENT-4、HOW-12）：玩的時候是「陪玩」，一局玩完換成「現在去做」。中文小字，不念出來。
import type { Rel } from './data'

const PLAY: Record<Rel, string> = {
  in: '指著問他：「在裡面還是外面？」說 in 的時候一起把手放進杯子裡',
  on: '指著問他：「在上面還是下面？」說 on 的時候把手放在頭上',
  under: '指著問他：「在上面還是下面？」說 under 的時候把手放在桌子下面',
}
export const whereCoplay = (rel: Rel) => ({
  play: PLAY[rel],
  now: '現在去做：把一隻玩偶藏在桌子下面、箱子裡面、椅子上面，說「在下面」「在裡面」請他去找',
})
