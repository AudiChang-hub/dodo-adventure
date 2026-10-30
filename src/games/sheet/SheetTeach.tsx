import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Sparkles } from '../../ui/Sparkles'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../Demo'
import { preload, say, sfx } from '../../lib/audio'
import { wait } from '../lines'
import { useIdle } from '../idle'
import { PACE } from '../pace'
import '../teach.css'
import { FADE } from '../../ui/motion'

interface Props {
  /** 一個或兩個並排的例子；念第 i 句時指著第 i 個 */
  items: ReactNode[]
  lines: string[]
  /** 答錯兩次的重教：只念第一句、不貼「新的」星星 */
  short?: boolean
  /** 孩子點了卡片、再聽一次之後才結束；ms 是念完到孩子點下去的時間 */
  onDone: (ms: number) => void
}


/**
 * 學習單題型的教學卡（PRD §5.8 我示範）。
 * 和 Teach.tsx 的教學卡同一套外觀與節奏（teach.css），但內容可以是任何畫面：
 * 氣球、立體形狀、點點圖案。念完之後出現「點我」的手，孩子點一下會再聽一次第一句，然後才繼續。
 */
export function SheetTeach({ items, lines: all, short, onDone }: Props) {
  const lines = short ? all.slice(0, 1) : all
  const duo = items.length > 1
  const [step, setStep] = useState(-1)
  const [ready, setReady] = useState(false)
  const [tapped, setTapped] = useState(false)
  // 點一下的小回饋：at 是當時亮著的那一個（換句子時不會讓別的那一個也跳一下）
  const [pop, setPop] = useState({ n: 0, at: 0 })
  const [nudge, setNudge] = useState(false)
  const live = useRef(true)
  const busy = useRef(false)
  const readyAt = useRef(0)
  const idle = useIdle()

  useEffect(() => {
    live.current = true
    preload(lines)
    const boot = window.setTimeout(async () => {
      sfx.whoosh()
      await wait(PACE.TEACH_ENTER)
      for (let i = 0; i < lines.length; i++) {
        if (!live.current) return
        setStep(i)
        await say(lines[i])
        // 句子之間停一下，讓孩子看著圖把這一句聽進去；最後一句念完，例子貼紙也停留一下才出現「點我」
        await wait(i < lines.length - 1 ? PACE.TEACH_LINE_GAP : PACE.TEACH_SETTLE)
      }
      if (!live.current) return
      readyAt.current = performance.now()
      setReady(true)
      // 閒置：15 秒再念一次第一句 → 再 15 秒卡片慢慢亮起來（不說話）→ 之後安靜
      idle.start({ repeat: () => void say(lines[0]), hint: () => setNudge(true) })
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async () => {
    // 還在念（或「點我」剛出現）：只給一點點回饋，不會一出現就被帶過去
    if (!ready || performance.now() - readyAt.current < PACE.TEACH_TAP_ARM) return setPop((p) => ({ n: p.n + 1, at: duo ? Math.max(0, step) : 0 }))
    if (busy.current) return
    busy.current = true
    idle.stop()
    const ms = Math.round(performance.now() - readyAt.current)
    setTapped(true)
    setStep(0)
    setPop((p) => ({ n: p.n + 1, at: 0 }))
    sfx.pop()
    await say(lines[0])
    // 再聽一次之後，卡片和例子再停留一下才收起來
    await wait(PACE.TEACH_HOLD)
    if (live.current) onDone(ms)
  }

  const focus = Math.max(0, step)
  return (
    // 進出場由外層（ui/Scenes.tsx 的 CardStage）做：在原地淡入、淡出；這裡不另外淡入淡出，免得兩層動畫疊成兩段
    <div className="teach-layer">
      <motion.div
        className={`teach-card${duo ? ' duo' : ''}${ready && !tapped ? ' ready' : ''}${nudge && !tapped ? ' nudge' : ''}`}
        role="button"
        aria-label="再聽一次"
        whileTap={{ scale: 0.97 }}
        onPointerDown={tap}
      >
        {!short && (
          <motion.div className="teach-new" initial={{ opacity: 0, rotate: -12 }} animate={{ opacity: 1, rotate: -12 }} transition={{ ...FADE, delay: 0.25 }} aria-hidden="true">
            <Emoji name="glowing-star" />
          </motion.div>
        )}
        <div className="teach-stage">
          {items.map((node, i) => {
            const on = !duo || i === focus
            return (
              <motion.div
                key={i}
                className={`teach-item${duo && on && step >= 0 ? ' on' : ''}`}
                // 念到哪一個靠靜態的粗外框（.teach-item.on）和手來指，不縮放、不上下移（同 Teach.tsx）
                animate={duo ? { opacity: step < 0 || on ? 1 : 0.42 } : { opacity: 1 }}
                transition={FADE}
              >
                <motion.div key={pop.at === i ? pop.n : 0} className="teach-vis sheet-teach-vis" animate={pop.at === i && pop.n ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                  {node}
                </motion.div>
                {duo && on && step >= 0 && !ready && <Hand x={50} y={88} size="22cqmin" />}
              </motion.div>
            )
          })}
        </div>
        {ready && !tapped && <Hand x={duo ? 50 : 62} y={duo ? 78 : 70} size={duo ? '9cqmin' : '13cqmin'} beckon />}
        {tapped && (
          <div className="teach-burst">
            <Sparkles count={14} />
          </div>
        )}
      </motion.div>
    </div>
  )
}
