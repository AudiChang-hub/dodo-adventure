import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { Sparkles } from '../ui/Sparkles'
import { onSpeech, say, sfx } from '../lib/audio'
import { markAsked, markPicked, recallIcon, recallToday, type RecallAsk } from '../lib/outing'
import { vocab } from '../content/vocab'
import './outing.css'

/** 打完招呼後停多久才問 */
const AFTER_HELLO_MS = 900
/** 沒點就安靜收起來：不再唸第二次（PRD §5.11、閒置規則：不嘮叨） */
const QUIET_AFTER_MS = 20_000
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * 回到 App 的那一刻（PRD §5.11）：豆豆從車上問「Did you see a | bus?」，旁邊浮出 2–3 張這週任務卡上的圖。
 * - 點哪一張都對：孩子說的就是他看到的，豆豆開心回應「Beep beep! You saw a | bus!」。
 * - 一天最多一次（lib/outing.ts 的 recallToday 決定今天要不要問）；不擋「出發」，什麼都不點也沒關係。
 * - 不寫進作答紀錄、不計熟練度；只在 kv 記下點了什麼，家長區的任務卡看得到。
 */
export function OutingAsk({ ready, away }: { ready: boolean; away: boolean }) {
  const [ask, setAsk] = useState<RecallAsk | null>(null)
  const [shown, setShown] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    let live = true
    recallToday()
      .then((a) => live && setAsk(a))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  // 招呼說完、安靜了一下、孩子還在首頁，才問；問了就算今天問過，沒點也不會再問。
  // 孩子在這段時間點了恐龍（恐龍在說話）或點了任何地方，就重新等：不搶別的台詞，也不打斷孩子
  useEffect(() => {
    if (!ready || !ask || shown || away) return
    let t = 0
    let talking = false
    const wait = () => {
      clearTimeout(t)
      if (talking) return
      t = window.setTimeout(() => {
        setShown(true)
        void markAsked(ask)
        void say(`out.saw.${ask.ids[0]}`)
      }, AFTER_HELLO_MS)
    }
    const off = onSpeech((e) => {
      talking = e.type === 'seg' || e.type === 'whole'
      wait()
    })
    window.addEventListener('pointerdown', wait, true)
    wait()
    return () => {
      clearTimeout(t)
      off()
      window.removeEventListener('pointerdown', wait, true)
    }
  }, [ready, ask, shown, away])

  useEffect(() => {
    if (!shown || pick) return
    const t = setTimeout(() => setGone(true), QUIET_AFTER_MS)
    return () => clearTimeout(t)
  }, [shown, pick])

  const tap = async (id: string) => {
    if (pick) return
    setPick(id)
    sfx.correct()
    void markPicked(id)
    await say(`out.yes.${id}`)
    setTimeout(() => setGone(true), 1200)
  }

  return (
    <AnimatePresence>
      {ask && shown && !gone && !away && (
        <motion.div
          className="outing-ask"
          role="group"
          aria-label="今天看到了什麼"
          style={{ originX: 0.3, originY: 1 }}
          initial={{ opacity: 0, scale: 0.86, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 170, damping: 19 } }}
          exit={{ opacity: 0, scale: 0.94, y: 10, transition: { duration: 0.45, ease: EASE } }}
        >
          {ask.ids.map((id, i) => {
            const on = pick === id
            return (
              <motion.button
                key={id}
                className={`outing-tile${on ? ' is-pick' : ''}`}
                aria-label={vocab(id).en}
                onClick={() => tap(id)}
                initial={{ opacity: 0, y: 14 }}
                animate={{
                  opacity: pick && !on ? 0.32 : 1,
                  y: 0,
                  scale: on ? 1.08 : pick ? 0.92 : 1,
                  transition: pick ? { type: 'spring', stiffness: 260, damping: 16 } : { delay: 0.18 + i * 0.12, duration: 0.5, ease: EASE },
                }}
                whileTap={pick ? undefined : { scale: 0.95 }}
              >
                <span className="outing-pic">
                  <Emoji name={recallIcon(id)} />
                </span>
                <span className="outing-word">{vocab(id).en}</span>
                {on && (
                  <>
                    {/* 打勾的小圓章：不只靠綠色框表示「就是這個」 */}
                    <motion.svg className="outing-check" viewBox="0 0 40 40" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 14 }} aria-hidden="true">
                      <circle cx={20} cy={20} r={19} fill="var(--good)" />
                      <path d="M11 20.5 L17.5 27 L29 14" fill="none" stroke="#FBF8F2" strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
                    </motion.svg>
                    <Sparkles count={10} />
                  </>
                )}
              </motion.button>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
