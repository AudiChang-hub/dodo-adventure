import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { VisualView } from '../ui/Visual'
import { Sparkles } from '../ui/Sparkles'
import { Emoji } from '../art/Emoji'
import { Hand } from './Demo'
import { preload, say, sfx } from '../lib/audio'
import type { TeachSpec, Visual } from '../content/games'
import { wait } from './lines'
import { useIdle } from './idle'
import { PACE } from './pace'
import './teach.css'

interface Props {
  spec: TeachSpec
  /** 答錯兩次的重教：只念精簡版、不貼「新的」星星 */
  short?: boolean
  /** 孩子點了內容、再聽一次之後才結束；ms 是念完到孩子點下去的時間 */
  onDone: (ms: number) => void
}

const spring = { type: 'spring', stiffness: 260, damping: 20 } as const

/** 同一題裡最大的一組數量：讓並排的兩組圖示一樣大 */
const fitOf = (vs: Visual[]) => Math.max(0, ...vs.map((v) => (v.t === 'group' ? v.count : 0)))

/**
 * 教學卡（PRD §5.8 我示範）：主持的恐龍把內容大大地拿出來、念教學句。
 * 念完之後出現「點我」的手，孩子點一下內容會再聽一次，然後才繼續——確保孩子真的看過、聽過。
 */
export function TeachCard({ spec, short, onDone }: Props) {
  const lines = short ? (spec.short ?? spec.lines.slice(0, 1)) : spec.lines
  const items = Array.isArray(spec.visual) ? spec.visual : [spec.visual]
  const duo = items.length > 1
  // 精簡版只念一句：例子貼紙跟著第一句就出現
  const sideAt = Math.min(spec.sideAt ?? (lines.length > 1 ? 1 : 0), lines.length - 1)

  const [step, setStep] = useState(-1)
  const [ready, setReady] = useState(false)
  const [tapped, setTapped] = useState(false)
  const [pop, setPop] = useState(0)
  const live = useRef(true)
  const readyAt = useRef(0)
  const idle = useIdle()
  const busy = useRef(false)
  const [nudge, setNudge] = useState(false)

  useEffect(() => {
    live.current = true
    preload(lines)
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時在念
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
      // 孩子沒反應：15 秒後再念一次第一句；再 15 秒卡片慢慢亮起來，不說話；之後安靜等，手會一直輕輕點
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
    // 還在念（或「點我」剛出現）：只給一點點回饋，不打斷；念的時候一直在點的孩子，不會一出現就被帶過去
    if (!ready || performance.now() - readyAt.current < PACE.TEACH_TAP_ARM) {
      setPop((p) => p + 1)
      return
    }
    if (busy.current) return
    busy.current = true
    idle.stop()
    const ms = Math.round(performance.now() - readyAt.current)
    setTapped(true)
    // 再聽一次的是第一句：並排的內容也指回第一句講的那一個
    setStep(0)
    setPop((p) => p + 1)
    sfx.pop()
    await say(lines[0])
    // 再聽一次之後，卡片和例子再停留一下才收起來
    await wait(PACE.TEACH_HOLD)
    if (live.current) onDone(ms)
  }

  const focus = spec.focus?.[Math.max(0, step)] ?? 0
  const showSide = !!spec.side && step >= sideAt
  const fit = fitOf(items)

  return (
    <motion.div className="teach-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.22 } }}>
      <motion.div
        className={`teach-card${duo ? ' duo' : ''}${ready && !tapped ? ' ready' : ''}${nudge && !tapped ? ' nudge' : ''}${spec.side ? ' has-side' : ''}`}
        role="button"
        aria-label="再聽一次"
        initial={{ scale: 0.6, rotate: -4, y: 40 }}
        animate={{ scale: 1, rotate: 0, y: 0 }}
        exit={{ scale: 0.86, y: 24, transition: { duration: 0.22 } }}
        transition={spring}
        whileTap={{ scale: 0.97 }}
        onPointerDown={tap}
      >
        {!short && (
          <motion.div className="teach-new" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: -12 }} transition={{ ...spring, delay: 0.25 }} aria-hidden="true">
            <Emoji name="glowing-star" />
          </motion.div>
        )}

        <div className="teach-stage">
          {items.map((v, i) => {
            const on = !duo || i === focus
            return (
              <motion.div
                key={i}
                className={`teach-item${duo && on && step >= 0 ? ' on' : ''}`}
                animate={duo ? { opacity: step < 0 || on ? 1 : 0.42, scale: on && step >= 0 ? 1.03 : 0.96, y: on && step >= 0 ? -6 : 0 } : { opacity: 1 }}
                transition={spring}
              >
                <motion.div key={on ? pop : 0} className="teach-vis" animate={on && pop ? { scale: [1, tapped ? 1.16 : 1.05, 1] } : {}} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                  <VisualView v={v} fit={fit} />
                </motion.div>
                {duo && on && step >= 0 && !ready && <Hand x={50} y={88} size="22cqmin" />}
              </motion.div>
            )
          })}
        </div>

        {spec.side && (
          <motion.div
            className="teach-side"
            initial={false}
            animate={showSide ? { scale: 1, rotate: 7, opacity: 1 } : { scale: 0.3, rotate: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          >
            <i className="tape" aria-hidden="true" />
            <div className="teach-vis">
              <VisualView v={spec.side} />
            </div>
          </motion.div>
        )}

        {ready && !tapped && <Hand x={duo ? 50 : 62} y={duo ? 78 : 70} size={duo ? '9cqmin' : '13cqmin'} beckon />}
        {tapped && (
          <div className="teach-burst">
            <Sparkles count={14} />
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
