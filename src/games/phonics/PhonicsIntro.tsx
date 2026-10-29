import { useEffect, useRef, useState } from 'react'
import { LayoutGroup, motion, useAnimate } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Sparkles } from '../../ui/Sparkles'
import { Hand } from '../Demo'
import { preload, say, sfx } from '../../lib/audio'
import { soundUnit, upper, wordId, type SoundUnit } from '../../content/letters'
import { wait } from '../lines'
import { useIdle } from '../idle'
import { PACE } from '../pace'
import { Pic, WordLabel } from './parts'

interface Props {
  unit: SoundUnit
  /** 答錯兩次的重教：只看一個關鍵字和大字母，念一句 */
  short?: boolean
  /** 孩子點了大字母、再聽一次之後才結束；ms 是念完到孩子點下去的時間 */
  onDone: (ms: number) => void
}

const spring = { type: 'spring', stiffness: 260, damping: 20 } as const

/**
 * 字母飛出來時唸的那句：S, S, S… sss… snake!（snake 是代表字，畫面上一定有）。
 * 家長把代表字勾成「他不認得」時，學習循環換成別的字，畫面上沒有 snake，改唸 S… sss…（不提畫面上沒有的字）。
 */
const saysLine = (u: SoundUnit) => (u.keys[0].w === soundUnit(u.letter).keys[0].w ? `ph.${u.letter}.says` : `ph.${u.letter}.sound`)

/** 每一步要念的台詞（給預先載入用） */
export function introLines(u: SoundUnit, short = false): string[] {
  const l = u.letter
  const again = `ph.${l}.echo.${wordId(u.keys[0].w)}`
  if (short) return [saysLine(u), again]
  return [...u.keys.map((k) => `ph.word.${wordId(k.w)}`), `ph.${l}.discover`, saysLine(u), again]
}

/**
 * 一個字母音的學習循環（PRD §6.1b，取代一般的教學卡）：
 * 1. 聽單字：三張圖一張一張出來，唸 Bus. Ball. Bear.
 * 2. 發現共同的聲音：They all start with b, b, b… 三個字的開頭字母同時變色、跳一下。
 * 3. 字母從單字裡跑出來：三個 b 飛到下面合成一個，旁邊冒出大寫 B，變成大大的 B b。B, B, B… b, b, b… bus!
 * 4. 點一下大字母：再聽一次 B… b, b, b… bus! 然後才開始玩（確保孩子有看、有聽）。
 * 重教（short）：直接出現 bus 和 B b，念 B, B, B… b, b, b… bus!
 */
export function PhonicsIntro({ unit, short, onDone }: Props) {
  const l = unit.letter
  const keys = short ? unit.keys.slice(0, 1) : unit.keys
  const [step, setStep] = useState(short ? 4 : -1)
  const [ready, setReady] = useState(false)
  const [tapped, setTapped] = useState(false)
  const [big, animateBig] = useAnimate()
  const [nudge, setNudge] = useState(false)
  /** 下面騰出放大字母的空間（先騰出來再飛，字母才會飛到正確的位置） */
  const [room, setRoom] = useState(!!short)
  const live = useRef(true)
  const busy = useRef(false)
  const readyAt = useRef(0)
  const idle = useIdle()
  const says = saysLine(unit)
  const firstLine = short ? says : `ph.${l}.discover`

  useEffect(() => {
    live.current = true
    preload(introLines(unit, short))
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次
    const boot = window.setTimeout(async () => {
      sfx.whoosh()
      await wait(PACE.TEACH_ENTER)
      if (!short) {
        for (let i = 0; i < 3; i++) {
          if (!live.current) return
          setStep(i)
          sfx.pop()
          await say(`ph.word.${wordId(unit.keys[i].w)}`)
          // 三張圖一張一張來：每張停一下，孩子看清楚、聽清楚這個字
          await wait(PACE.TEACH_WORD_GAP)
        }
        if (!live.current) return
        setStep(3)
        await wait(250)
        await say(`ph.${l}.discover`)
        if (!live.current) return
        setRoom(true)
        await wait(560)
        if (!live.current) return
        setStep(4)
        sfx.whoosh()
        await wait(900)
      }
      if (!live.current) return
      await say(says)
      await wait(PACE.TEACH_SETTLE)
      if (!live.current) return
      readyAt.current = performance.now()
      setReady(true)
      // 沒反應：15 秒後再念一次發現句；再 15 秒卡片慢慢亮起來，不說話
      idle.start({ repeat: () => void say(firstLine, says), hint: () => setNudge(true) })
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async () => {
    if (!ready || performance.now() - readyAt.current < PACE.TEACH_TAP_ARM) return
    if (busy.current) return
    busy.current = true
    idle.stop()
    const ms = Math.round(performance.now() - readyAt.current)
    setTapped(true)
    sfx.pop()
    if (big.current) void animateBig(big.current, { scale: [1, 1.12, 1] }, { duration: 0.45, ease: [0.22, 1, 0.36, 1] })
    await say(`ph.${l}.echo.${wordId(unit.keys[0].w)}`)
    await wait(PACE.TEACH_HOLD)
    if (live.current) onDone(ms)
  }

  const flown = step >= 4
  const longest = Math.max(...unit.keys.map((k) => k.w.length))
  return (
    // 進出場由外層（ui/Scenes.tsx 的 CardStage）做：在原地淡入、淡出；這裡不另外淡入淡出，免得兩層動畫疊成兩段
    <div className="teach-layer">
      <motion.div
        className={`ph-card${short ? ' short' : ''}${room ? ' room' : ''}${ready && !tapped ? ' ready' : ''}${nudge && !tapped ? ' nudge' : ''}`}
        role="button"
        aria-label="再聽一次"
        onPointerDown={tap}
      >
        {!short && (
          <motion.div className="teach-new" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: -12 }} transition={{ ...spring, delay: 0.25 }} aria-hidden="true">
            <Emoji name="glowing-star" />
          </motion.div>
        )}
        <LayoutGroup id={`ph-${l}`}>
          <div className="ph-words">
            {keys.map((k, i) => (
              <motion.div
                key={k.w}
                className={`ph-word${step === i ? ' on' : ''}`}
                initial={{ y: 50, opacity: 0, scale: 0.7 }}
                animate={
                  step >= i || short
                    ? { y: 0, opacity: flown && !short ? 0.62 : 1, scale: step === i ? 1.06 : flown && !short ? 0.9 : 1 }
                    : { y: 50, opacity: 0, scale: 0.7 }
                }
                transition={spring}
              >
                <Pic icon={k.icon} />
                <WordLabel w={k.w} fit={short ? undefined : longest} tint jump={step === 3} flyId={short ? undefined : `fly-${i}`} flown={flown && !short} />
              </motion.div>
            ))}
          </div>
          <div className="ph-bigrow">
            {flown && (
              <div ref={big} className="ph-big">
                <motion.span className="up" initial={{ scale: 0, rotate: -25, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ ...spring, delay: short ? 0.1 : 0.75 }}>
                  {upper(l)}
                </motion.span>
                <span className="lo-stack">
                  {short ? (
                    <span className="lo">{l}</span>
                  ) : (
                    [0, 1, 2].map((i) => (
                      <motion.span key={i} layoutId={`fly-${i}`} className="lo" transition={{ type: 'spring', stiffness: 120, damping: 17, delay: i * 0.14 }}>
                        {l}
                      </motion.span>
                    ))
                  )}
                </span>
              </div>
            )}
          </div>
        </LayoutGroup>
        {ready && !tapped && <Hand x={short ? 76 : 66} y={short ? 66 : 86} size="11cqmin" beckon />}
        {tapped && (
          <div className="teach-burst">
            <Sparkles count={14} />
          </div>
        )}
      </motion.div>
    </div>
  )
}
