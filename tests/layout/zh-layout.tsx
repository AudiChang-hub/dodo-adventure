// 中文課排版檢查用的頁面（scripts/check-zh-layout.mjs 開 vite dev 載入它）：在真的舞台（games/Shell）裡排一篇課文，
// window.zhLayout(day, line) 換成第 day 篇、亮第 line 行（同一篇 3 次都一樣，T-131）（line = -1：聊一聊之前全部念過、圖都是小的；line = 'talk'：聊一聊，T-126）。
// 不進 App 的打包（vite 只打包 index.html）。
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MotionConfig } from 'motion/react'
import { Shell } from '../../src/games/Shell'
import { Reader } from '../../src/lessons/chinese/Reader'
import { ZH_TEXTS } from '../../src/lessons/chinese/data'
import '../../src/styles/global.css'
import '../../src/ui/ui.css'
import '../../src/screens/screens.css'
import '../../src/lessons/chinese/chinese.css'

const root = createRoot(document.getElementById('root')!)
const host = { current: null as (() => void) | null }

declare global {
  interface Window {
    zhLayout: (day: number, line: number | 'talk') => void
    zhDays: number[]
    /** 每一篇有幾行（check-zh-layout 照這個量，不拿畫面上前一篇的行數，T-118） */
    zhLines: Record<number, number>
  }
}

window.zhDays = ZH_TEXTS.map((t) => t.day)
window.zhLines = Object.fromEntries(ZH_TEXTS.map((t) => [t.day, t.lines.length]))
window.zhLayout = (day, line) => {
  const t = ZH_TEXTS.find((x) => x.day === day)!
  flushSync(() =>
    root.render(
      // 量的是最後停下來的樣子：動畫一律瞬間到位
      <MotionConfig reducedMotion="always">
        <div className="screen" style={{ position: 'fixed', inset: 0 }}>
          <Shell station="mandarin" mood="idle" onExit={() => {}} hint={false}>
            <Reader key={`${day}:${line}`} t={t} host={host} onNext={() => {}} startAt={line === 'talk' ? 0 : line} startTalk={line === 'talk'} />
          </Shell>
        </div>
      </MotionConfig>,
    ),
  )
}
