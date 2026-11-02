// 蠟筆著色（src/games/draw/ColoringGame.tsx）的台詞：全部是豆豆說，句子短，3 歲聽得懂。
// 舊版是「點一下就塗滿」（Pick a color, and tap to paint!），2026-10-28 改成用蠟筆真的塗。
// 示範的「Watch me!」「Your turn!」沿用 teach.watch.dodo／teach.turn.dodo。著色遊戲的畫面 T-75 拿掉了，這裡只剩遊戲表（content/games.ts）用的開場句。
import { def } from './registry'

// 開場、閒置時再唸一次
def('d.color.intro', 'dodo', 'Pick a crayon, and color it in!')
