// 三堂課的登記表：首頁的三個大門、App 的 lesson 路由都讀這裡。介面在 ./types.ts，說明在 ./README.md。
import { EnglishLesson } from './english'
import { ChineseLesson } from './chinese'
import { MathLesson } from './math'
import { INFO, type LessonDef, type Subject } from './types'

export type { Lesson, LessonDef, LessonProps, Subject } from './types'
export { SUBJECTS } from './types'

export const LESSONS: Record<Subject, LessonDef> = {
  english: { subject: 'english', ...INFO.english, Lesson: EnglishLesson },
  chinese: { subject: 'chinese', ...INFO.chinese, Lesson: ChineseLesson },
  math: { subject: 'math', ...INFO.math, Lesson: MathLesson },
}
