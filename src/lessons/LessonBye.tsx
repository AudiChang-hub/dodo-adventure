import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Dino } from '../art/Dino'
import { Hand } from '../games/Demo'
import { HomeIcon } from '../games/Shell'
import { useTaps } from '../ui/tap'
import { say, sfx } from '../lib/audio'
import { wait } from '../games/lines'
import { Sparkles } from '../ui/Sparkles'
import type { Speaker } from '../content/lines'

/**
 * 下課畫面出來多久，恐龍就開口請他點、手同時來指恐龍（T-141：以前沒有聲音、手等 3 秒才來，
 * 孩子「好久喔、不知道要做什麼」先按了返回）。留一點時間給畫面淡入，也不蓋到課最後那一句 You did it!
 */
const ASK_MS = 600
/** 點空白處再請一次：這段時間內不重說（連點不會一直念） */
const ASK_GAP_MS = 3000
/** 之後每隔多久手再指一次（PHASE-7 小班段 8 秒）。不會自己離開（T-118） */
const AGAIN_MS = 8000
/** 揮手說晚安至少多久才躺下（說話比這個長就等說完） */
const WAVE_MS = 1700

type Phase = 'awake' | 'wave' | 'asleep'

/**
 * 下課畫面：跟這堂課的恐龍說晚安（T-118，家長：「下課畫面不要自己離開，讓小朋友跟他做最後晚安道別」）。
 * 以前 20 秒沒碰就自己回首頁，孩子回頭時課已經不見了（「怎麼不見了」）。現在**不會自己離開**：
 * 1. 恐龍站著、張著眼睛。一出來（0.6 秒）就開口 Tap me! Let's say good night!（莫莫不出聲），手同時指著恐龍點一下；
 *    之後每 8 秒手再指一次。點空白處：手再指一次、再請一次（T-141）。
 *    以前還沒道別的恐龍會睏得閉一下眼睛，孩子看了以為已經睡著、就去點左上角的房子（盲測 c9bb003 英文 2），拿掉了。
 * 2. 孩子點恐龍：恐龍左右揮手、旁邊一隻小手揮一揮，說 Good night, 名字!（豆豆、波波；中文課的莫莫不出聲，只有輕輕的音效）。
 * 3. 恐龍趴下睡覺（閉眼、身體放低、頭上三個 Z 一個一個冒出來），天色變暗一點、出現月亮。
 * 4. 房子（時間到的那一天是月亮）亮起來，手指著它；孩子點了才回首頁（時間到：去睡覺畫面）。
 * 道別之前房子不出來（家長：道別完才離開）；左上角的返回鍵一直都點得到（NAV-1），隨時可以離開。
 * 點空白處：手再指一次現在要點的東西（恐龍或房子）。睡著以後再點恐龍：Z 抖一下（打呼），不會醒來。
 * 動作都是一次就停（MOTION-1/2/3），沒有一直閃的東西。
 */
export function LessonBye({ host, timeUp = false, onDone, onAsleep }: { host: Speaker; timeUp?: boolean; onDone: () => void; onAsleep?: () => void }) {
  const tap = useTaps()
  const still = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('awake')
  const [hand, setHand] = useState(0)
  const [snore, setSnore] = useState(0)
  const done = useRef(false)
  const live = useRef(true)
  const handTimers = useRef<number[]>([])
  const phaseRef = useRef<Phase>('awake')
  phaseRef.current = phase
  const asked = useRef(-Infinity)

  /** 還沒道別：恐龍開口請他點自己（莫莫不出聲，只有手） */
  const ask = () => {
    if (host === 'momo' || phaseRef.current !== 'awake' || !live.current) return
    const t = performance.now()
    if (t - asked.current < ASK_GAP_MS) return
    asked.current = t
    void say(`bye.ask.${host}`)
  }

  /** 手在現在要點的東西（恐龍或房子）上點一下：出來 → 點 → 收起來 */
  const point = (after: number) => {
    handTimers.current.forEach(clearTimeout)
    handTimers.current = [
      window.setTimeout(() => live.current && setHand(1), after),
      window.setTimeout(() => live.current && setHand(2), after + 700),
      window.setTimeout(() => live.current && setHand(0), after + 1700),
    ]
  }

  /** 點恐龍：還沒道別就說晚安、躺下睡覺；睡著了就打呼一下 */
  const goodnight = async () => {
    if (phaseRef.current === 'asleep') {
      sfx.boing()
      setSnore((n) => n + 1)
      return point(500)
    }
    if (phaseRef.current !== 'awake') return
    setPhase('wave')
    setHand(0)
    handTimers.current.forEach(clearTimeout)
    sfx.pop()
    const talk = host === 'momo' ? (sfx.chime(0), wait(300).then(() => sfx.chime(2))) : say(`bye.night.${host}`)
    await Promise.all([talk, wait(WAVE_MS)])
    if (!live.current) return
    sfx.chime(4)
    setPhase('asleep')
    onAsleep?.()
    point(1400)
  }

  const finish = () => {
    if (done.current || phaseRef.current !== 'asleep') return
    done.current = true
    sfx.tap()
    onDone()
  }

  useEffect(() => {
    live.current = true
    sfx.pop()
    const a = window.setTimeout(ask, ASK_MS)
    point(ASK_MS)
    const again = window.setInterval(() => {
      if (phaseRef.current !== 'wave') point(0)
    }, AGAIN_MS)
    return () => {
      live.current = false
      handTimers.current.forEach(clearTimeout)
      clearTimeout(a)
      clearInterval(again)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const asleep = phase === 'asleep'
  return (
    <div
      className={`lesson-bye${asleep ? ' is-night' : ''}`}
      data-bye={phase}
      onPointerDown={(e) => {
        const el = e.target instanceof Element ? e.target : null
        // 點空白處：手再指一次現在要點的東西；還沒道別就再請一次（T-141）
        if (!el?.closest('.lb-host, .lb-home')) {
          point(0)
          ask()
        }
      }}
    >
      <AnimatePresence>
        {asleep && (
          <motion.svg
            key="moon"
            className="lb-moon"
            viewBox="0 0 64 64"
            aria-hidden="true"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          >
            <path d="M44 8 A26 26 0 1 0 56 44 A21 21 0 1 1 44 8 Z" fill="#F6D776" stroke="#C9A43E" strokeWidth={2.5} strokeLinejoin="round" />
          </motion.svg>
        )}
      </AnimatePresence>
      <motion.div
        className="lb-host"
        aria-label="跟恐龍說晚安"
        role="button"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        {...tap('dino', () => void goodnight())}
      >
        <motion.div
          style={{ transformOrigin: '50% 100%' }}
          // 揮手：左右搖兩下；睡覺：身體放低、往旁邊斜一點（趴下）
          animate={
            phase === 'wave'
              ? { rotate: [0, -7, 7, -7, 7, 0], y: 0, scaleY: 1 }
              : asleep
                ? { rotate: -5, y: 22, scaleY: 0.9 }
                : { rotate: 0, y: 0, scaleY: 1 }
          }
          transition={phase === 'wave' ? { duration: 1.4, ease: 'easeInOut' } : { duration: 0.9, ease: 'easeOut' }}
        >
          <Dino who={host} mood={asleep ? 'sleep' : phase === 'wave' ? 'cheer' : 'happy'} size="100%" />
        </motion.div>
        {/* 揮手的小手 */}
        <AnimatePresence>
          {phase === 'wave' && (
            <motion.svg
              key="wave"
              className="lb-wave"
              viewBox="0 0 64 64"
              aria-hidden="true"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1, rotate: still ? 0 : [0, 22, -12, 22, -12, 0] }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 1.3, ease: 'easeInOut' }}
              style={{ transformOrigin: '50% 90%' }}
            >
              <path
                d="M22 58 C14 52 10 44 10 36 V24 C10 21 12 19 15 19 C18 19 20 21 20 24 V30 V12 C20 9 22 7 25 7 C28 7 30 9 30 12 V28 V9 C30 6 32 4 35 4 C38 4 40 6 40 9 V28 V13 C40 10 42 8 45 8 C48 8 50 10 50 13 V40 C50 50 44 58 34 58 Z"
                fill="#FFE9D6"
                stroke="#2E2A25"
                strokeWidth={3}
                strokeLinejoin="round"
              />
            </motion.svg>
          )}
        </AnimatePresence>
        {/* 睡著了：Z 一個一個冒出來就停著；再點恐龍（打呼）抖一下 */}
        {asleep && (
          <motion.div key={`z${snore}`} className="lb-zzz" aria-hidden="true" animate={snore && !still ? { rotate: [0, -8, 8, 0] } : {}} transition={{ duration: 0.5 }}>
            {['Z', 'Z', 'Z'].map((z, i) => (
              <motion.span key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: snore ? 0 : 0.5 + i * 0.45, duration: 0.5 }} style={{ fontSize: `${1 + i * 0.35}em` }}>
                {z}
              </motion.span>
            ))}
          </motion.div>
        )}
        {phase === 'wave' && (
          <div style={{ position: 'absolute', left: '55%', top: '18%', pointerEvents: 'none' }}>
            <Sparkles count={8} />
          </div>
        )}
        <AnimatePresence>
          {hand > 0 && phase === 'awake' && (
            <span className="lb-hand lb-hand-dino" aria-hidden="true">
              <Hand x={50} y={46} tap={hand - 1} size="34%" cuff="#F2C9A8" />
            </span>
          )}
        </AnimatePresence>
      </motion.div>
      {/* 道別完才出來：房子（時間到的那一天是月亮：去睡覺畫面），亮起來、手指著它 */}
      <AnimatePresence>
        {asleep && (
          <motion.button
            key="home"
            className={`lb-home is-lit${timeUp ? ' is-bed' : ''}`}
            aria-label={timeUp ? '去睡覺' : '回首頁'}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.9 }}
            whileTap={{ scale: 0.92 }}
            {...tap('home', finish)}
          >
            {timeUp ? <BedIcon /> : <HomeIcon />}
            <AnimatePresence>
              {hand > 0 && (
                <span className="lb-hand" aria-hidden="true">
                  <Hand x={58} y={56} tap={hand - 1} size="52%" cuff="#F2C9A8" />
                </span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/** 時間到的那一天：月亮（去睡覺畫面） */
function BedIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M40 10 A22 22 0 1 0 54 42 A18 18 0 1 1 40 10 Z" fill="#F6D776" stroke="#2E2A25" strokeWidth={3.5} strokeLinejoin="round" />
      <path d="M14 14 l2 4 4 1 -4 2 -2 4 -2 -4 -4 -2 4 -1 Z" fill="#F6D776" stroke="#2E2A25" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}
