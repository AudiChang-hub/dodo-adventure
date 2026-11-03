// 三堂課的共用介面（給 App.tsx、Home.tsx 和三個課的資料夾用）。這個檔定好就不改：三堂課各自只改自己的資料夾。
import type { JSX } from 'react'
import type { Speaker } from '../content/lines'

export type Subject = 'english' | 'chinese' | 'math'

export const SUBJECTS: readonly Subject[] = ['english', 'chinese', 'math']

/** 每一課的名字和守門的恐龍（首頁的門、佔位畫面用；登記表 ./index.ts 再接上每一課的元件） */
export const INFO: Record<Subject, { title: string; host: Speaker }> = {
  english: { title: '英文字母', host: 'dodo' },
  chinese: { title: '中文課文', host: 'momo' },
  math: { title: '數學數字', host: 'bobo' },
}

export interface LessonProps {
  /** 上完一堂：下課畫面（有時候挑貼紙）再回首頁（App 的 LessonScreen 處理）。只叫一次；叫第二次不會再算一堂 */
  onDone: () => void
}

export type Lesson = (props: LessonProps) => JSX.Element

export interface LessonDef {
  subject: Subject
  /** 首頁大門上的字（給大人看；孩子看門上的圖和恐龍） */
  title: string
  /** 守這個門的恐龍：門上站的、課裡說話的 */
  host: Speaker
  Lesson: Lesson
}
