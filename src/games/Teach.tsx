import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { VisualView } from '../ui/Visual'
import { Sparkles } from '../ui/Sparkles'
import { Emoji } from '../art/Emoji'
import { Hand } from './Demo'
import { localPoint, useNotYet } from './NotYet'
import { preload, say, sfx } from '../lib/audio'
import { BRIDGE_GAP_MS } from '../lib/clip'
import { isBridge } from '../content/lines'
import type { TeachSpec, Visual } from '../content/games'
import { wait } from './lines'
import { useIdle } from './idle'
import { PACE } from './pace'
import { useFlow } from './barge'
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

/**
 * 上一下、再上一下點在畫面任何地方的時間（e.timeStamp）：判斷這一下是不是連點裡的一下（PACE.TEACH_TAP_STREAM）。
 * 放在模組裡、一直在記：上一段一直連點到教學卡出來，第一下也看得出是連點（T-108）
 */
const downs: [number, number] = [-Infinity, -Infinity]
if (typeof window !== 'undefined')
  window.addEventListener(
    'pointerdown',
    (e) => {
      downs[0] = downs[1]
      downs[1] = e.timeStamp
    },
    { capture: true },
  )

/** 同一題裡最大的一組數量：讓並排的兩組圖示一樣大 */
const fitOf = (vs: Visual[]) => Math.max(0, ...vs.map((v) => (v.t === 'group' ? v.count : 0)))

/**
 * 教學卡（PRD §5.8 我示範）：主持的恐龍把內容大大地拿出來、念教學句。
 * 念完之後出現「點我」的手，孩子點一下內容會再聽一次，然後才繼續——確保孩子真的看過、聽過。
 * 念完那一刻要看得出「輪到你了」（幼兒設計準則 PHASE-1，T-84：AI 小男生在數學課看不出念的時候和念完有什麼不一樣）：
 * - 念的時候：講到的那一邊加框、另一邊變淡、手指著；
 * - 念完：兩邊都全亮、不再只框一邊，依序輕輕往上跳一下（.turn-hop，一次就停），卡片外面一圈靜態的粗外框，招手的手放大。
 * 搶點（T-108，games/barge.ts）：念的時候「停一下再點」（不是一直連點）就停掉語音，直接變成念完、等他點的樣子；
 * 再點一下照常再聽第一句、往下走。一直連點（上一段的手指，T-104、T-106）照舊只給「看這裡」的圈圈。
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
  /** 念的時候被點了：跟全 App 一樣的「看這裡」圈圈，示範的手點一下頭（games/NotYet，準則 TOUCH-6） */
  const notYet = useNotYet()
  const layer = useRef<HTMLDivElement>(null)
  const flow = useFlow()
  const mountedAt = useRef(performance.now())
  const readyRef = useRef(false)

  /** 念完（或被搶掉）：兩邊全亮、招手的手出來，等他點 */
  const toReady = () => {
    if (readyRef.current) return
    readyRef.current = true
    readyAt.current = performance.now()
    setReady(true)
    // 孩子沒反應：15 秒後再念一次第一句；再 15 秒卡片慢慢亮起來，不說話；之後安靜等，手會一直輕輕點
    idle.start({ repeat: () => void say(lines[0]), hint: () => setNudge(true) })
  }

  useEffect(() => {
    live.current = true
    mountedAt.current = performance.now()
    preload(lines)
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時在念
    const boot = window.setTimeout(async () => {
      const ok = flow.begin(live)
      sfx.whoosh()
      await wait(PACE.TEACH_ENTER)
      for (let i = 0; i < lines.length; i++) {
        if (!ok()) return
        setStep(i)
        await say(lines[i])
        // 句子之間停一下，讓孩子看著圖把這一句聽進去；最後一句念完，例子貼紙也停留一下才出現「點我」。
        // 下一句是中文三明治（蘋果 → Apple.）：緊接著這一句的英文，只停 0.4 秒
        await wait(i === lines.length - 1 ? PACE.TEACH_SETTLE : isBridge(lines[i + 1]) ? BRIDGE_GAP_MS : PACE.TEACH_LINE_GAP)
      }
      if (!ok()) return
      toReady()
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async (e: { clientX: number; clientY: number }) => {
    // 一直在連點（上一個工作按完還在點同一個位置）、「點我」剛出現：只回「看這裡」的圈圈，不會一出現就被帶過去，停一下再點才算。
    // 還在念的時候停一下再點（T-108）：停掉語音，直接變成念完、等他點的樣子（不重念、不往下走）。
    const [prev, now] = downs
    const stream = now - prev < PACE.TEACH_TAP_STREAM
    if (!readyRef.current || performance.now() - readyAt.current < PACE.TEACH_TAP_ARM || stream) {
      if (layer.current) {
        const p = localPoint(layer.current, e.clientX, e.clientY)
        notYet.ping(p.x, p.y)
      }
      if (!readyRef.current && !stream && performance.now() - mountedAt.current >= PACE.BARGE_ARM) {
        flow.cut()
        toReady()
      }
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
    <motion.div ref={layer} className="teach-layer" initial={camera ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={camera ? undefined : { opacity: 0, transition: { duration: 0.22 } }}>
      <motion.div
        className={`teach-card${duo ? ' duo' : ''}${ready && !tapped ? ' ready' : ''}${nudge && !tapped ? ' nudge' : ''}${spec.side ? ' has-side' : ''}`}
        role="button"
        aria-label="再聽一次"
        initial={camera ? false : { y: LIFT }}
        animate={{ y: 0 }}
        exit={camera ? undefined : { y: LIFT / 2, transition: { duration: 0.22, ease: EASE.inOut } }}
        transition={enterTx}
        // 念完、等他點的時候才像按鈕一樣壓下去（念的時候點了不像按到東西）
        whileTap={ready ? { scale: 0.97 } : undefined}
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
            // 念完、等孩子點：兩邊都全亮、依序跳一下（輪到你了）
            const turn = ready && !tapped
            return (
              <motion.div
                key={i}
                className={`teach-item${duo && on && step >= 0 && !turn ? ' on' : ''}${turn ? ' turn-hop' : ''}`}
                style={{ '--turn-i': i } as CSSProperties}
                animate={duo ? { opacity: step < 0 || on || turn ? 1 : 0.42 } : { opacity: 1 }}
                transition={FADE}
              >
                <motion.div key={pop.at === i ? pop.n : 0} className="teach-vis" animate={pop.at === i && pop.n ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 0.45, ease: EASE.out }}>
                  <VisualView v={v} fit={fit} />
                </motion.div>
                {duo && on && step >= 0 && !ready && <Hand x={50} y={88} size="22cqmin" />}
                {duo && ready && !tapped && i === cueAt && <Hand x={50} y={80} size="14cqmin" beckon />}
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

        {/* 念完、等他點：招手的手。並排的兩邊放在第一句講的那一邊（問的那一邊）：手最後停在問的那一邊（AI 小男生 #5），點了再聽的也是這一邊 */}
        {ready && !tapped && !duo && <Hand x={62} y={70} size="13cqmin" beckon />}
        {tapped && (
          <div className="teach-burst">
            <Sparkles count={14} />
          </div>
        )}
      </motion.div>
      {notYet.view}
    </motion.div>
  )
}
