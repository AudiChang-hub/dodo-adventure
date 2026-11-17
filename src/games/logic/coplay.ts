// 邏輯遊戲給大人看的小字（T-152，PARENT-1、PARENT-4、HOW-12）：玩的時候是「陪玩」，一局玩完換成「現在去做」（放下平板，在家裡做一次）。
// 都是中文小字，不念出來（Shell 的 CoplayHint 會在前面加「陪玩」的標籤；現在去做的句子自己帶開頭）。
// T-157：陪玩跟著這一局分的特徵（豆豆收拾）、串的東西（串珠珠）換；現在去做跟著情境換。
import type { SceneId, SortDim } from './sort-plan'
import type { PatThemeId } from './pattern-plan'

export const LOGIC_COPLAY: Record<'sort' | 'pattern', { play: string; now: string }> = {
  sort: {
    play: '請他說說看為什麼放這裡：「因為都是紅色的」',
    now: '現在去做：收玩具時一起分，車子一籃、積木一籃',
  },
  pattern: {
    play: '一起念：紅、藍、紅、藍，下一個呢？',
    now: '現在去做：用拍手、拍腿排規律：拍手、拍腿、拍手、拍腿',
  },
}

/** 豆豆收拾：玩的時候（看這一局分什麼） */
const SORT_PLAY: Record<SortDim, string> = {
  color: LOGIC_COPLAY.sort.play,
  kind: '請他說說看：「這是動物，所以回農場」',
  shape: '一起摸摸邊邊：圓圓的、三個角、四個角',
  size: '請他比比看：哪一個大、哪一個小',
  // 4 歲玩法（./sort-switch.ts）
  thing: '請他說說看：「這是車子，所以放這裡」',
  both: '請他兩個都說：「紅色的、圓形的，放這裡」',
}
/** 第 6 級換規則：換之前、換之後都提醒大人「規則換了」 */
const SORT_SWITCH = '換規則了：問他「現在要看顏色，還是看形狀？」，他說對了再放'
/** 豆豆收拾：一局玩完（看這一局的情境） */
const SORT_NOW: Record<SceneId, string> = {
  toys: LOGIC_COPLAY.sort.now,
  fruit: '現在去做：買菜回來，請他把水果照顏色分兩堆',
  farm: '現在去做：把動物玩偶送回「家」，一樣的放一起',
  clothes: '現在去做：收衣服時請他把襪子放一堆、上衣放一堆',
  kitchen: '現在去做：擺餐具時請他把湯匙放一邊、碗放一邊',
  garage: '現在去做：玩具車停一排，一樣的停在一起',
}
export const sortCoplay = (scene: SceneId, dim: SortDim, switching = false) => ({ play: switching ? SORT_SWITCH : SORT_PLAY[dim], now: SORT_NOW[scene] })

const PAT_COPLAY: Record<PatThemeId, { play: string; now: string }> = {
  necklace: LOGIC_COPLAY.pattern,
  train: { play: '一起念車廂：紅、藍、紅、藍，下一節呢？', now: '現在去做：用積木排火車：一個紅、一個藍、一個紅…' },
  flags: { play: '一起指著旗子念，念到空的那一面停一下', now: '現在去做：曬衣服時排排看：一件大、一件小、一件大…' },
  cookies: { play: '一起念：一個接一個，下一個輪到誰？', now: '現在去做：點心排成規律：一片蘋果、一片香蕉、一片蘋果…' },
  garden: { play: '一起念：念到空的地方停一下，讓他接', now: '現在去做：散步時排石頭和葉子：石頭、葉子、石頭、葉子' },
  animals: { play: '一起學動物叫：喵、呱、喵、呱，下一個呢？', now: '現在去做：學動物走路排規律：跳、走、跳、走' },
}
export const patternCoplay = (theme: PatThemeId) => PAT_COPLAY[theme]

/** 選玩法的畫面 */
export const LOGIC_PICK_HINT = '讓他自己挑一個，不用每次每種都玩'
