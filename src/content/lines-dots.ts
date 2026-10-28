// 連點成圖（src/games/draw/DotsGame.tsx）的台詞：起點是「家」，1、2、3… 是出門後的第幾站，最後一筆「回家」。
// 全部是豆豆說。數數用 lines.ts 的 dodo.num.n、圖案的名字用 d.dots.is.<id>（It's | a triangle!）。
// 感嘆詞用溫和的 Hooray!／Ooh!／Look!（`||` 前面是感嘆詞段，E4 語調另外合成），不用 Yay!、Wow!。
import { def } from './registry'

// 開場（第一張圖）、閒置時再唸一次
def('d.dots.intro', 'dodo', 'Start at home, and connect the dots!')
// 連到一半停住 15 秒：問下一個數字在哪裡（只用到 9：圖上最多 1–9）
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
for (let n = 2; n <= 9; n++) def(`d.dots.find.${n}`, 'dodo', `Where is ${NUM[n]}?`)
// 示範：筆停在家上面
def('d.dots.demo.home', 'dodo', 'We start at home.')
// 連到最後一個數字：家亮起來（示範和孩子自己連都用；閒置時也再唸這一句）
def('d.dots.gohome', 'dodo', 'Now, back home!')
// 示範閉合
def('d.dots.demo.back', 'dodo', "Ooh! || We're back home!")
// 示範完換孩子（接在 teach.turn.dodo「Your turn!」後面）；第二張圖開始時也提醒一次
def('d.dots.start', 'dodo', 'Start at home!')
// 孩子自己連回家：閉合、變彩色
def('d.dots.home', 'dodo', 'Hooray! || Back home!')
// 圖案名字之後的稱讚：稱讚「一路連完」這個方法，輪流兩種說法
export const DOTS_PRAISE = 2
def('d.dots.praise.0', 'dodo', 'You connected all the dots!')
def('d.dots.praise.1', 'dodo', 'You went all the way home!')
