import { NotReady } from '../NotReady'
import type { LessonProps } from '../types'

/** 英文課（認字母 → 描字 → 單字範例 → 選擇）：還在準備，先放佔位畫面。這個資料夾由英文課的工作階段實作，介面見 ../README.md */
export function EnglishLesson(_: LessonProps) {
  return <NotReady subject="english" />
}
