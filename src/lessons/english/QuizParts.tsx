// 英文課選擇題的三種玩法共用的零件（T-127 B 案）：找卡片（Quiz.tsx）、泡泡（Bubbles.tsx）、餵豆豆（Feed.tsx）。
// 三種只換外觀和操作；出題、對錯、示範、答錯的說明、作答紀錄都在 Quiz.tsx，照 quiz-plan.ts 的規則。
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { Sparkles } from '../../ui/Sparkles'
import type { Opt, Question } from './quiz-plan'

/** 選擇題這一段今天用哪一種玩法（每天輪流，連續兩天不一樣：lib/variety.ts） */
export type QuizLook = 'cards' | 'bubbles' | 'feed'
export const QUIZ_LOOKS: readonly QuizLook[] = ['cards', 'bubbles', 'feed']

/** 作答紀錄的 game：家長區看得出是哪一種玩法；skill 三種都一樣（letter:S、phonics:s） */
export const QUIZ_GAME: Record<QuizLook, string> = { cards: 'lesson-en', bubbles: 'lesson-en-bubbles', feed: 'lesson-en-feed' }

/** 測試、家長除錯用：localStorage 的 `dodo:en-quiz` 設成 cards／bubbles／feed 就固定用那一種 */
export function forcedLook(): QuizLook | null {
  try {
    const v = globalThis.localStorage?.getItem('dodo:en-quiz')
    return (QUIZ_LOOKS as readonly string[]).includes(v ?? '') ? (v as QuizLook) : null
  } catch {
    return null
  }
}

/** Quiz 給玩法畫面的東西：這一題、每張選項的狀態，和點下去要叫的 choose */
export interface OptView {
  q: Question
  /** 第幾題（換題時整組換 key） */
  i: number
  still: boolean
  /** 外層的 class（is-big／is-little、答完、示範中……），三種玩法共用同一套狀態 class */
  boxClass: string
  accept: boolean
  /** 選項出來了沒（關鍵字開始念、或孩子搶點，T-109）；還沒出來的看不到、點不到 */
  ready: boolean
  /** 每張選項點過的樣子（yes 亮、no 淡掉） */
  state: Record<string, 'no' | 'yes'>
  /** 每張選項的 class（en-opt、大小、亮、錯、等他點……） */
  optClass: (o: Opt, k: number) => string
  /** 選項的 DOM（示範的手、等他點時跳一下要用） */
  tile: (id: string) => (el: HTMLElement | null) => void
  /** 點了（或餵了）這一張 */
  choose: (o: Opt, at?: { clientX: number; clientY: number }) => void
  /** 手指按到選項上（還沒判對錯）：示範、念題目的時候搶掉；回傳 false 表示現在不能拿（擋板時間） */
  grab: (at: { clientX: number; clientY: number }) => boolean
  /** 卡片裡面的樣子（字母或圖、發呆時的小手、答對的星星和打勾） */
  face: (o: Opt, k: number) => ReactNode
  /** 答對（完整慶祝）的那一張 */
  cheer: (o: Opt) => boolean
}

/** 選項裡面的樣子：三種玩法一樣（字母或圖；發呆 8 秒的小手；聽完才答、一次就對的星星和綠色大打勾） */
export function OptFace({ o, hand, cheer, still }: { o: Opt; hand: boolean; cheer: boolean; still: boolean }) {
  return (
    <>
      {/* 點了不跳、點錯不搖（T-109：點錯、亂點都平平的，沒有好玩的動畫，也不打叉） */}
      <span>{o.icon ? <Emoji name={o.icon} /> : <span className="en-opt-letter">{o.text}</span>}</span>
      {hand && (
        <span className="en-opt-hand" aria-hidden="true">
          <Hand x={58} y={58} tap={1} size="38%" cuff="#BFE0CC" />
        </span>
      )}
      {/* 答對：星星撒開、右上角綠色大打勾（跟中文課選圖一樣，T-97） */}
      {cheer && <Sparkles count={16} />}
      {cheer && (
        <motion.span
          className="en-yes"
          aria-hidden="true"
          initial={still ? false : { scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.12 }}
        >
          <svg viewBox="0 0 48 48" width="62%" aria-hidden="true">
            <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
      )}
    </>
  )
}

export const turnStyle = (k: number) => ({ '--turn-i': k }) as CSSProperties
