import { AnimatePresence, motion } from 'motion/react'
import { firstFinger } from '../../games/NotYet'
import { turnStyle, type OptView } from './QuizParts'

/**
 * 選擇題的玩法二：泡泡（T-127 B 案，docs/T-127-新鮮感提案.md 第四節 (a)）。
 * 字母（或圖）裝在透明的泡泡裡，從今天的世界下面飄上來、停在空中高高低低的地方；點今天的字母那一顆。
 * - 跟找卡片一樣的題目、對錯、示範的手、答錯的說明、作答紀錄（Quiz.tsx 管），只換外觀：
 *   大寫在大泡泡、小寫在小泡泡（T-100：聽不懂 big／little 也看得出哪個大）。
 * - 紙感螢幕（MOTION-2）：泡泡只在出來的時候飄上來一次，等他點的時候都不動；答對的那一顆泡泡破掉（外圈散開），字留著、打勾。
 * - 點錯：那一顆淡掉，不搖、不打叉（T-109）。
 * - 減少動態效果：直接出現，不飄。
 */
export function Bubbles({ v }: { v: OptView }) {
  const { q, i, still } = v
  const n = q.options.length
  /** 泡泡停的位置（選項區的百分比）：左右分開、高高低低，看得出是飄著的 */
  const spots = n >= 3 ? SPOTS3 : SPOTS2
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={i}
        className={`en-options en-bubbles ${v.boxClass}`}
        data-accepting={v.accept ? undefined : 'false'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3 } }}
        exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.1 } }}
      >
        {q.options.map((o, k) => {
          const s = spots[k % spots.length]
          const cheer = v.cheer(o)
          return (
            <motion.button
              key={o.id}
              ref={v.tile(o.id)}
              type="button"
              className={`${v.optClass(o, k)} en-bubble${cheer ? ' is-pop' : ''}`}
              style={{ ...turnStyle(k), left: `${s.x}%`, top: `${s.y}%` }}
              aria-label={o.text ?? o.id}
              // 關鍵字一念、選項出來的時候從下面飄上來（一次，錯開一點）；還沒出來時停在下面（看不到、點不到，.is-wait）；答對的放大一點。
              // 不動 opacity：淡入淡出、點錯淡掉都交給 CSS（.is-wait、.is-no）
              initial={false}
              animate={{ y: v.ready || still ? (cheer && !still ? -10 : 0) : 260, scale: cheer ? 1.08 : 1 }}
              transition={{ duration: still ? 0 : 1.1, delay: still || !v.ready ? 0 : 0.15 * k, ease: [0.22, 1, 0.36, 1] }}
              onPointerDown={(e) => {
                if (firstFinger(e.nativeEvent)) v.choose(o, e)
              }}
              onClick={(e) => {
                if (e.detail === 0) v.choose(o)
              }}
            >
              {v.face(o, k)}
              {/* 泡泡亮亮的反光 */}
              <i className="en-bubble-shine" aria-hidden="true" />
            </motion.button>
          )
        })}
      </motion.div>
    </AnimatePresence>
  )
}

const SPOTS2 = [
  { x: 34, y: 56 },
  { x: 68, y: 40 },
]
const SPOTS3 = [
  { x: 24, y: 54 },
  { x: 52, y: 34 },
  { x: 80, y: 58 },
]
