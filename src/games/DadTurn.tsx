import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Shell } from './Shell'
import { VisualView } from '../ui/Visual'
import { Sparkles } from '../ui/Sparkles'
import { dadAsk, type DadAsk } from '../content/coplay'
import { station as stationDef } from '../content/games'
import { db, phaseOf, today, type StationId } from '../lib/db'
import { logAttempt } from '../lib/record'
import { say, sfx, stopSpeech } from '../lib/audio'
import { wait } from './lines'
import { DUR, EASE, RANGE, rise } from '../ui/motion'

/** 爸爸沒有回應（孩子自己在玩）就安靜地跳過，不留下紀錄 */
const SKIP_MS = 30_000
/** 剛進來的這段時間不收按鍵：避免上一題的手指剛好點到 */
const ARM_MS = 1200

interface Props {
  gameId: string
  station: StationId
  onDone: () => void
  onExit: () => void
}

/**
 * 換爸爸問（benchmark 手法 2）：畫面顯示一張大圖，提示爸爸用中文問孩子，
 * 爸爸按「答對了／再練練」記錄結果。補上 Montessori 三段式的第三期「這是什麼？」，
 * 不需要麥克風。記成一筆 game: 'coplay' 的 quiz 紀錄，技能加上 coplay: 前綴。
 */
export function DadTurn({ gameId, station, onDone, onExit }: Props) {
  const host = stationDef(station).host
  const [ask, setAsk] = useState<DadAsk | null>(null)
  const [armed, setArmed] = useState(false)
  const [result, setResult] = useState<'yes' | 'again' | null>(null)
  const [wiggle, setWiggle] = useState(0)
  const t0 = useRef(0)
  const live = useRef(true)
  const finished = useRef(false)

  const finish = () => {
    if (finished.current || !live.current) return
    finished.current = true
    onDone()
  }

  useEffect(() => {
    live.current = true
    let skip = 0
    // 從孩子今天在這個遊戲答過的題目裡挑：學過的才問
    const boot = window.setTimeout(async () => {
      const rows = await db.attempts
        .where('game')
        .equals(gameId)
        .filter((a) => a.date === today() && phaseOf(a) !== 'teach')
        .toArray()
        .catch(() => [])
      if (!live.current) return
      const items = rows.sort((a, b) => b.ts - a.ts).slice(0, 8).map((a) => a.itemId)
      setAsk(dadAsk(gameId, items))
      t0.current = performance.now()
      sfx.pop()
      void say(`coplay.turn.${host}`)
      await wait(ARM_MS)
      if (live.current) setArmed(true)
      skip = window.setTimeout(finish, SKIP_MS)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      clearTimeout(skip)
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const answer = async (ok: boolean) => {
    if (!ask || !armed || result) return
    setResult(ok ? 'yes' : 'again')
    void logAttempt({
      station,
      game: 'coplay',
      itemId: ask.itemId,
      skill: ask.skill,
      phase: 'quiz',
      level: 1,
      options: [],
      answer: ask.itemId,
      taps: [{ pick: ok ? 'yes' : 'again', ms: Math.round(performance.now() - t0.current) }],
      firstTryCorrect: ok,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
    })
    if (ok) {
      sfx.correct()
      // 先稱讚孩子說出來了，再由恐龍用英文說一次答案
      await say(`coplay.yes.${host}`, ...(ask.answer ? [ask.answer] : []))
    } else {
      sfx.gentle()
      await say(...(ask.answer ? [ask.answer] : []), `coplay.again.${host}`)
      // 留一點時間讓孩子跟著說
      await wait(1400)
    }
    await wait(500)
    finish()
  }

  return (
    <Shell station={station} mood={result === 'yes' ? 'cheer' : 'happy'} onExit={onExit} onHost={() => void say(`coplay.turn.${host}`)} hint={false}>
      <AnimatePresence>
        {ask && (
          // 整塊一次淡入（ui/motion.ts 的 rise），大卡片跟著長大，自己不另外淡入（一個元素只變一次透明度）
          <motion.div className="dad-turn" variants={rise} initial="initial" animate="enter">
            <motion.div
              className="dad-card"
              initial={{ scale: RANGE.fromScale, rotate: -6 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: DUR.enter, ease: EASE.out }}
              onPointerDown={() => {
                // 孩子點大圖：動一下就好，不說答案（答案要由孩子說出來）
                sfx.tap()
                setWiggle((w) => w + 1)
              }}
            >
              <motion.div key={wiggle} className="dad-vis" animate={wiggle ? { scale: [1, 1.06, 1], rotate: [0, -3, 3, 0] } : {}} transition={{ duration: 0.45 }}>
                <VisualView v={ask.visual} />
              </motion.div>
              {result === 'yes' && (
                <motion.div className="dad-stamp" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: -8 }} transition={{ type: 'spring', stiffness: 380, damping: 14 }} aria-hidden="true">
                  <svg viewBox="0 0 48 48" width="56%">
                    <path d="M11 25 L20 34 L37 15" fill="none" stroke="#2E2A25" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.div>
              )}
              {result === 'yes' && <Sparkles count={14} />}
            </motion.div>

            <motion.aside className="dad-note" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <h3>換爸爸問</h3>
              <p>{ask.ask}</p>
              <small>說中文也可以；答完你再用英文說一次</small>
              <div className="dad-actions">
                <button className="yes" disabled={!armed || !!result} onClick={() => void answer(true)}>
                  答對了
                </button>
                <button disabled={!armed || !!result} onClick={() => void answer(false)}>
                  再練練
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  )
}
