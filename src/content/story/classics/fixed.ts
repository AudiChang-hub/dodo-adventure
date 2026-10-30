// 故事時間每一則都一樣的開場、結尾（docs/故事世界.md §5.1，莫莫說）。key 固定，每一則共用同一個音檔
import type { Beat } from '../types'

export const OPEN_BOOK: Beat[] = [
  { who: 'momo', en: 'Story time! Open the old book.', pic: 'open-book', key: 'story.classic.open.0' },
  // 讓孩子知道這是「古時候的人講的故事」
  { who: 'momo', en: 'Long ago, people told this story.', pic: 'open-book', key: 'story.classic.open.1' },
]

export const CLOSE_BOOK: Beat[] = [{ who: 'momo', en: 'The end. Close the old book.', pic: 'closed-book', key: 'story.classic.close' }]
