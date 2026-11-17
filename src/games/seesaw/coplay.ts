// 蹺蹺板比輕重給大人看的小字（PARENT-1、PARENT-4、HOW-12）：玩的時候是「陪玩」，一局玩完換成「現在去做」。中文小字，不念出來。
import { isOrderLevel, type SeesawLevel } from './plan'

export function seesawCoplay(level: SeesawLevel) {
  const play = isOrderLevel(level)
    ? level === 5
      ? '請他說說看：「氣球很大，可是很輕」，先想重量，不是看大小'
      : '一起指著說：「最輕的…再來…最重的」，排好再從頭念一次'
    : level === 4
      ? '問他：「大的一定比較重嗎？」猜完一起看蹺蹺板'
      : '先請他說「我猜這邊比較重」，再一起看蹺蹺板往哪邊下去'
  return { play, now: '現在去做：一手拿一顆蘋果、一手拿一張衛生紙，掂掂看哪邊比較重；去公園時一起坐蹺蹺板' }
}
