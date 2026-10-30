// 蠟筆著色（src/games/draw/ColoringGame.tsx）的台詞：全部是豆豆說，句子短，3 歲聽得懂。
// 舊版是「點一下就塗滿」（Pick a color, and tap to paint!），2026-10-28 改成用蠟筆真的塗。
// 稱讚沿用 lines.ts 的 d.color.done（So pretty!）；示範的「Watch me!」「Your turn!」沿用 teach.watch.dodo／teach.turn.dodo。
import { def } from './registry'

// 開場、閒置時再唸一次
def('d.color.intro', 'dodo', 'Pick a crayon, and color it in!')
// 示範：手在一塊區域裡來回塗的時候
def('d.color.demo', 'dodo', 'Scribble, scribble!')
// 塗了一些之後，完成鍵出現（只說一次）
def('d.color.ready', 'dodo', 'All done? Tap the check!')
// 完成：車子類的圖開走一點點時
def('d.color.beep', 'dodo', 'Beep beep!')
