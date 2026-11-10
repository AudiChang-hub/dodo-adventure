// 中文課排版檢查用的頁面（scripts/check-zh-layout.mjs 開 vite dev 載入它）：在真的舞台（games/Shell）裡排一篇課文，
// window.zhLayout(day, run, line) 換成第 day 篇、第 run 次、亮第 line 行（line = -1：聊一聊之前全部念過、圖都是小的；line = 'talk'：聊一聊，T-126；
// line = 'story'：第 3 次的故事題、'order'：第 3 次的排順序，T-127——出題時把前面的篇都當作上過了，題目跟課裡一樣）。
// 不進 App 的打包（vite 只打包 index.html）。
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MotionConfig } from 'motion/react'
import { Shell } from '../../src/games/Shell'
import { Reader } from '../../src/lessons/chinese/Reader'
import { Quiz } from '../../src/lessons/chinese/Quiz'
import { Order } from '../../src/lessons/chinese/Order'
import { ZH_TEXTS, storyRunOf } from '../../src/lessons/chinese/data'
import '../../src/styles/global.css'
import '../../src/ui/ui.css'
import '../../src/screens/screens.css'
import '../../src/lessons/chinese/chinese.css'

const root = createRoot(document.getElementById('root')!)
const host = { current: null as (() => void) | null }

type Line = number | 'talk' | 'story' | 'order'

declare global {
  interface Window {
    zhLayout: (day: number, run: number, line: Line) => boolean
    zhDays: number[]
    /** 每一篇有幾行（check-zh-layout 照這個量，不拿畫面上前一篇的行數，T-118） */
    zhLines: Record<number, number>
  }
}

window.zhDays = ZH_TEXTS.map((t) => t.day)
window.zhLines = Object.fromEntries(ZH_TEXTS.map((t) => [t.day, t.lines.length]))
/** 排好了回傳 true；這一篇沒有那種題目（故事題、排順序出不來）回傳 false */
window.zhLayout = (day, run, line) => {
  const t = ZH_TEXTS.find((x) => x.day === day)!
  const extra = line === 'story' || line === 'order' ? storyRunOf(t, new Set(ZH_TEXTS.filter((x) => x.day < day).map((x) => x.day))) : null
  const sq = extra?.story[0]
  if ((line === 'story' && !sq) || (line === 'order' && !extra?.order)) {
    flushSync(() => root.render(null))
    return false
  }
  flushSync(() =>
    root.render(
      // 量的是最後停下來的樣子：動畫一律瞬間到位
      <MotionConfig reducedMotion="always">
        <div className="screen" style={{ position: 'fixed', inset: 0 }}>
          <Shell station="mandarin" mood="idle" onExit={() => {}} hint={false}>
            {line === 'story' ? (
              <Quiz key={`${day}:story`} t={t} q={sq!} host={host} setMood={() => {}} onNext={() => {}} />
            ) : line === 'order' ? (
              <Order key={`${day}:order`} t={t} o={extra!.order!} host={host} setMood={() => {}} onNext={() => {}} />
            ) : (
              <Reader key={`${day}:${run}:${line}`} t={t} run={run} host={host} onNext={() => {}} startAt={line === 'talk' ? 0 : line} startTalk={line === 'talk'} />
            )}
          </Shell>
        </div>
      </MotionConfig>,
    ),
  )
  return true
}
