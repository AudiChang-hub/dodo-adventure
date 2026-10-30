// 描數字字母前兩級「字的零件」（src/games/draw/glyphs.ts 的 PARTS，V-24）的台詞：全部是豆豆說。
// 名字句在示範之前唸（和 This is | A. 一樣），所以不能有 Draw、Go 這類叫孩子動手的動詞（準則 PHASE-3）；
// 用孩子摸得到的東西來叫：斜線是溜滑梯、⊂ 是月亮、∪ 是杯子。
import { def } from './registry'

def('d.part.down', 'dodo', 'This line goes | down.')
def('d.part.across', 'dodo', 'This line goes | across.')
def('d.part.circle', 'dodo', 'This is a | circle.')
def('d.part.cross', 'dodo', 'This is a | cross.')
def('d.part.slide', 'dodo', 'This is a | slide.')
def('d.part.slide2', 'dodo', 'This is a | slide.')
def('d.part.moon', 'dodo', 'This is a | moon.')
def('d.part.cup', 'dodo', 'This is a | cup.')
def('d.part.corner', 'dodo', 'This is a | corner.')
def('d.part.corner2', 'dodo', 'This is a | corner.')
// 描完一個零件（字描完是 d.glyph.done「Great writing!」）
def('d.part.done', 'dodo', 'Great drawing!')
