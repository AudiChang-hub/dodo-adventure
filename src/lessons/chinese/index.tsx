import { NotReady } from '../NotReady'
import type { LessonProps } from '../types'

/** 中文課（念短課文、重點字詞標紅、選圖）：還在準備，先放佔位畫面。這個資料夾由中文課的工作階段實作，介面見 ../README.md */
export function ChineseLesson(_: LessonProps) {
  return <NotReady subject="chinese" />
}
