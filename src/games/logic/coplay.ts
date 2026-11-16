// 邏輯遊戲給大人看的小字（T-152，PARENT-1、PARENT-4、HOW-12）：玩的時候是「陪玩」，一局玩完換成「現在去做」（放下平板，在家裡做一次）。
// 都是中文小字，不念出來（Shell 的 CoplayHint 會在前面加「陪玩」的標籤；現在去做的句子自己帶開頭）。
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
/** 選玩法的畫面 */
export const LOGIC_PICK_HINT = '讓他自己挑一個，不用每次每種都玩'
