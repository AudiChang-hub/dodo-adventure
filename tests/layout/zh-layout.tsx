// 中文課排版檢查用的頁面（scripts/check-zh-layout.mjs 開 vite dev 載入它）：在真的舞台（games/Shell）裡排一篇課文，
// window.zhLayout(day, run, line) 換成第 day 篇、第 run 次、亮第 line 行（line = -1：聊一聊之前全部念過、圖都是小的）。
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
    zhLayout: (day: number, run: number, line: number) => void
    zhDays: number[]
  }
}

window.zhDays = ZH_TEXTS.map((t) => t.day)
window.zhLayout = (day, run, line) => {
  const t = ZH_TEXTS.find((x) => x.day === day)!
  flushSync(() =>
    root.render(
      // 量的是最後停下來的樣子：動畫一律瞬間到位
      <MotionConfig reducedMotion="always">
        <div className="screen" style={{ position: 'fixed', inset: 0 }}>
          <Shell station="mandarin" mood="idle" onExit={() => {}} hint={false}>
            <Reader key={`${day}:${run}:${line}`} t={t} run={run} host={host} onNext={() => {}} startAt={line} />
          </Shell>
        </div>
      </MotionConfig>,
    ),
  )
}
