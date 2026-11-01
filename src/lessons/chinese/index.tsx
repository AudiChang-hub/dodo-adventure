import { lazy, Suspense } from 'react'
import type { LessonProps } from '../types'

// 180 篇課文和課文用的圖有幾百 KB：點了中文課的門才下載（首頁打開不用等它）
const Body = lazy(() => import('./Lesson').then((m) => ({ default: m.ChineseLessonBody })))

/**
 * 中文課（莫莫帶，約 5 分鐘）：學校的教法——念短課文、重點字詞標紅，再選圖（哪個是包子？）。
 * 1. 念課文：一行一行大字，莫莫念到哪一行哪一行亮；點紅字單獨再聽那個詞；念兩次，之後可以按「再聽一次」。
 * 2. 選圖：課文裡的紅字一個一題，三張圖選一張。
 * 照日期上今天那一篇（./progress.ts）；畫面在 ./Lesson.tsx，資料在 ./data.ts。介面見 ../README.md
 */
export function ChineseLesson(props: LessonProps) {
  return (
    <Suspense fallback={<div className="screen" style={{ background: '#D8E6F4' }} />}>
      <Body {...props} />
    </Suspense>
  )
}
