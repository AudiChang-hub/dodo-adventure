// 年段操作外框的台詞（成長系統 G-3；準則 FRAME-10 答錯之後）：中班段、大班段才會說，小班段照舊說 Try again!。
// 三隻恐龍句子一樣，莫莫用句號（同 lines.ts 的回饋句）。
import { def, type Speaker } from './registry'

const SPEAKERS: Speaker[] = ['dodo', 'bobo', 'momo']

for (const s of SPEAKERS) {
  const end = s === 'momo' ? '.' : '!'
  // 中班段第一層：先只說「再想想」，給孩子自己修正的時間
  def(`think.${s}`, s, `Think again${end}`)
  // 大班段第一層：換一個方法試試
  def(`another.${s}`, s, `Try another way${end}`)
  // 中班段起第二層：「哪裡不一樣？」答案淡淡亮起，孩子自己比
  def(`contrast.${s}`, s, 'Look. What is different?')
  // 大班段答對之後：回想自己是怎麼想的（一回合最多一次）
  def(`how.${s}`, s, 'How did you know?')
}
