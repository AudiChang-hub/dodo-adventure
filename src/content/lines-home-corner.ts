// 首頁「遊戲角」的台詞（T-152 P2，設計稿第二節）。content/lines.ts import 這個檔，npm run audio 才找得到。
// 只說順序（先上課、再玩），不說條件、不說獎品、不說「不行」（FB-6、HOW-7；家長要求不能讓他覺得被罰）。
import { def } from './registry'

/** 遊戲角還沒開、孩子點了：還沒上的那一扇門亮起來，豆豆說先上課再玩（5 個字，PHASE-6） */
def('home.corner.first', 'dodo', 'First class. Then play!')
/** 三堂都上完、回到首頁的那一刻（每天一次）：窗簾拉開，只說這一句，不慶祝、不給貼紙 */
def('home.corner.open', 'dodo', 'Play corner is open!')
