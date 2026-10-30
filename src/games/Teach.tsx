import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { VisualView } from '../ui/Visual'
import { Sparkles } from '../ui/Sparkles'
import { Emoji } from '../art/Emoji'
import { Hand } from './Demo'
import { preload, say, sfx } from '../lib/audio'
import { BRIDGE_GAP_MS } from '../lib/clip'
import { isBridge } from '../content/lines'
import type { TeachSpec, Visual } from '../content/games'
import { wait } from './lines'
import { useIdle } from './idle'
import { PACE } from './pace'
import { DUR, EASE, FADE } from '../ui/motion'
import './teach.css'

interface Props {
  spec: TeachSpec
  /** 答錯兩次的重教：只念精簡版、不貼「新的」星星 */
  short?: boolean
  /** 孩子點了內容、再聽一次之後才結束；ms 是念完到孩子點下去的時間 */
  onDone: (ms: number) => void
  /** 外層自己做鏡頭過場（開車：卡片在路面前面淡入、淡出）：卡片本身不另外淡入淡出、彈進彈出，免得兩層動畫疊成兩段 */
  camera?: boolean
}

/**
 * 教學卡的動態只用淡入、輕輕滑上來（ui/motion.ts 的節奏）：不彈簧、不旋轉、念每一句時不縮放。
 * 「現在講的是哪一個」靠靜態的粗外框（.teach-item.on）和手來指（幼兒設計準則 MOTION-1／2，對照表 V-19）。
 */
const LIFT = 14
const enterTx = { duration: DUR.fadeIn, ease: EASE.out }

/** 同一題裡最大的一組數量：讓並排的兩組圖示一樣大 */
const fitOf = (vs: Visual[]) => Math.max(0, ...vs.map((v) => (v.t === 'group' ? v.count : 0)))

/**
 * 教學卡（PRD §5.8 我示範）：主持的恐龍把內容大大地拿出來、念教學句。
 * 念完之後出現「點我」的手，孩子點一下內容會再聽一次，然後才繼續——確保孩子真的看過、聽過。
 */
export function TeachCard({ spec, short, onDone, camera }: Props) {
  const lines = short ? (spec.short ?? spec.lines.slice(0, 1)) : spec.lines
  const items = Array.isArray(spec.visual) ? spec.visual : [spec.visual]
  const duo = items.length > 1
  // 精簡版只念一句：例子貼紙跟著第一句就出現
  const sideAt = Math.min(spec.sideAt ?? (lines.length > 1 ? 1 : 0), lines.length - 1)

  const [step, setStep] = useState(-1)
  const [ready, setReady] = useState(false)
  const [tapped, setTapped] = useState(false)
  // 點一下的小回饋：n 每點一次加一，at 是當時被點到（亮著）的那一個；換句子時不會讓別的那一個也跳一下
  const [pop, setPop] = useState({ n: 0, at: 0 })
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
        // 句子之間停一下，讓孩子看著圖把這一句聽進去；最後一句念完，例子貼紙也停留一下才出現「點我」。
        // 下一句是中文三明治（蘋果 → Apple.）：緊接著這一句的英文，只停 0.4 秒
        await wait(i === lines.length - 1 ? PACE.TEACH_SETTLE : isBridge(lines[i + 1]) ? BRIDGE_GAP_MS : PACE.TEACH_LINE_GAP)
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
      setPop((p) => ({ n: p.n + 1, at: duo ? focus : 0 }))
      return
    }
    if (busy.current) return
    busy.current = true
    idle.stop()
    const ms = Math.round(performance.now() - readyAt.current)
    setTapped(true)
    // 再聽一次的是第一句：並排的內容也指回第一句講的那一個
    setStep(0)
    setPop((p) => ({ n: p.n + 1, at: duo ? cueAt : 0 }))
    sfx.pop()
    await say(lines[0])
    // 再聽一次之後，卡片和例子再停留一下才收起來
    await wait(PACE.TEACH_HOLD)
    if (live.current) onDone(ms)
  }

  const focus = spec.focus?.[Math.max(0, step)] ?? 0
  const cueAt = spec.focus?.[0] ?? 0
  const showSide = !!spec.side && step >= sideAt
  const fit = fitOf(items)

  return (
    <motion.div className="teach-layer" initial={camera ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={camera ? undefined : { opacity: 0, transition: { duration: 0.22 } }}>
      <motion.div
        className={`teach-card${duo ? ' duo' : ''}${ready && !tapped ? ' ready' : ''}${nudge && !tapped ? ' nudge' : ''}${spec.side ? ' has-side' : ''}`}
        role="button"
        aria-label="再聽一次"
        initial={camera ? false : { y: LIFT }}
        animate={{ y: 0 }}
        exit={camera ? undefined : { y: LIFT / 2, transition: { duration: 0.22, ease: EASE.inOut } }}
        transition={enterTx}
        whileTap={{ scale: 0.97 }}
        onPointerDown={tap}
      >
        {!short && (
          <motion.div className="teach-new" initial={{ opacity: 0, rotate: -12 }} animate={{ opacity: 1, rotate: -12 }} transition={{ ...FADE, delay: 0.25 }} aria-hidden="true">
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
                animate={duo ? { opacity: step < 0 || on ? 1 : 0.42 } : { opacity: 1 }}
                transition={FADE}
              >
                <motion.div key={pop.at === i ? pop.n : 0} className="teach-vis" animate={pop.at === i && pop.n ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 0.45, ease: EASE.out }}>
                  <VisualView v={v} fit={fit} />
                </motion.div>
                {duo && on && step >= 0 && !ready && <Hand x={50} y={88} size="22cqmin" />}
                {/* 題目徽章（比多少、比大小）：念第一句時貼到第一句講的那一邊，之後一直留著——作答時題目上方的就是這一張 */}
                {spec.cue && i === cueAt && step >= 0 && (
                  <motion.div className="teach-cue" initial={{ y: LIFT, rotate: -6, opacity: 0 }} animate={{ y: 0, rotate: -6, opacity: 1 }} transition={FADE}>
                    <i className="tape" aria-hidden="true" />
                    <div className="teach-vis">
                      <VisualView v={spec.cue} />
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )
          })}
        </div>

        {spec.side && (
          <motion.div
            className="teach-side"
            initial={false}
            animate={showSide ? { y: 0, rotate: 7, opacity: 1 } : { y: LIFT, rotate: 7, opacity: 0 }}
            transition={FADE}
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
