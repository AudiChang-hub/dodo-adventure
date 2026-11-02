// 連點成圖（src/games/draw/DotsGame.tsx）的台詞：起點是「家」，1、2、3… 是出門後的第幾站，最後一筆「回家」。
// 全部是豆豆說。圖案的名字用 d.dots.is.<id>（It's | a triangle!）。連點成圖的畫面 T-75 拿掉了，留下的是遊戲表、貼紙還在用的句子。
// 感嘆詞用溫和的 Hooray!／Ooh!／Look!（`||` 前面是感嘆詞段，E4 語調另外合成），不用 Yay!、Wow!。
import { def } from './registry'

// 開場（第一張圖）、閒置時再唸一次
def('d.dots.intro', 'dodo', 'Start at home. Go to one!')
// 連到一半停住 15 秒：問下一個數字在哪裡（只用到 9：圖上最多 1–9）
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
for (let n = 2; n <= 9; n++) def(`d.dots.find.${n}`, 'dodo', `Where is ${NUM[n]}?`)
