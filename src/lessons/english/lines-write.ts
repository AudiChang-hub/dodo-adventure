// 寫寫看二選一（T-127 B 案，WriteChoice.tsx）的台詞（豆豆）。
// 英文課的 lines.ts 另一個工作階段在改，這個檔從 letters-extra.ts import（英文課 lines.ts → letters-extra.ts → 這裡），npm run audio 才找得到。
import { def } from '../../content/registry'

/** 寫寫看開始：兩張大卡片（描字、塗字母），手各示範一次 */
def('en.write.pick', 'dodo', 'Trace it, or color it?')
/** 選了塗字母：手示範塗一下、蓋一個印章 */
def('en.color.go', 'dodo', 'Color it in!')
/** 塗完（塗到大約六成，或按住完成鈕）：接著念 Big S! */
def('en.color.done', 'dodo', 'So colorful!')
