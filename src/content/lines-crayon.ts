// 著色本（src/games/draw/ColoringGame.tsx、DrawPick.tsx）的台詞：全部是豆豆說，句子短，3 歲聽得懂。
// T-75 拿掉著色遊戲時只留了開場句；T-138（家長 2026-11-11 要求「畫圖的部分我希望有著色本」）恢復著色本，示範、完成的句子跟著回來。
// 示範的「Watch me!」「Your turn!」沿用 teach.watch.dodo／teach.turn.dodo。
import { def } from './registry'

// 開場、閒置時再唸一次
def('d.color.intro', 'dodo', 'Pick a crayon, and color it in!')
// 示範：手在一塊區域裡來回塗的時候
def('d.color.demo', 'dodo', 'Scribble, scribble!')
// 塗了一些之後，完成鍵出現（只說一次）
def('d.color.ready', 'dodo', 'All done? Tap the check!')
// 完成：圖活起來的時候
def('d.color.done', 'dodo', 'So pretty!')
// 完成：車子類的圖開走一點點時
def('d.color.beep', 'dodo', 'Beep beep!')
// 畫畫的入口：選白紙自由畫還是著色本
def('d.pick.intro', 'dodo', 'Draw, or color?')
// 著色本：選一張圖
def('d.book.intro', 'dodo', 'Pick a picture!')
