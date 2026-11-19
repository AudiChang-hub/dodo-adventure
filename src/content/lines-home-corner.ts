// 首頁「遊戲角」的台詞（T-152 P2，設計稿第二節）。content/lines.ts import 這個檔，npm run audio 才找得到。
// 只說順序（先上課、再玩），不說條件、不說獎品、不說「不行」（FB-6、HOW-7；家長要求不能讓他覺得被罰）。
import { def } from './registry'

/**
 * 遊戲角還沒開、孩子點了（T-169）：說出下一堂課的恐龍名字，由那一隻自己說（門口那一隻跳一下、門亮著、手指指著）。
 * 以前是豆豆說 First class. Then play!，三歲孩子聽不出是哪一堂（家長 2026-11-18 回報）。一句 5 個字（PHASE-6）。
 * 順序跟首頁的門一樣（lib/play-gate.ts 的 GATE_ORDER）；key 是 home.corner.next.<科目>（gateHint 回傳）。
 */
def('home.corner.next.english', 'dodo', "Let's visit Dodo first!")
def('home.corner.next.chinese', 'momo', "Let's visit Momo first!")
def('home.corner.next.math', 'bobo', "Let's visit Bobo first!")
/** 三堂都上完、回到首頁的那一刻（每天一次）：窗簾拉開，只說這一句，不慶祝、不給貼紙 */
def('home.corner.open', 'dodo', 'Play corner is open!')
