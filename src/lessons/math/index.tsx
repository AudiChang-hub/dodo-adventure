import { NotReady } from '../NotReady'
import type { LessonProps } from '../types'

/** 數學課（數數、比多少、寫數字）：還在準備，先放佔位畫面。這個資料夾由數學課的工作階段實作，介面見 ../README.md */
export function MathLesson(_: LessonProps) {
  return <NotReady subject="math" />
}
