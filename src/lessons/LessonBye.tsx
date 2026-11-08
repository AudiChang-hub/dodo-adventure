import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Dino } from '../art/Dino'
import { Hand } from '../games/Demo'
import { HomeIcon } from '../games/Shell'
import { useTaps } from '../ui/tap'
import { sfx } from '../lib/audio'
import { Sparkles } from '../ui/Sparkles'
import type { Speaker } from '../content/lines'

/** 多久沒點房子，示範的手在房子上點一下 */
const HAND_MS = 3000
/** 多久都沒碰畫面（可能走開了），自己回首頁 */
const BYE_MS = 20_000

/**
 * 沒有挑貼紙的那一堂的下課（A7：貼紙平均每 3～4 堂才出現一次、事先不說，lib/lesson-sticker.ts）。
 * 課自己剛稱讚過、說過再見，這裡是安靜的收尾：主持的恐龍開心地站著，旁邊一顆大大的房子（回首頁），
 * 大人的「現在去做」照樣在下面（LessonScreen 疊上去）。不說話、不出現貼紙的空位，孩子不會覺得少了什麼。
 * 不會卡住：一出現就可以點房子（跟首頁的門一樣，按下放開就算）；3 秒沒點，手在房子上點一下給他看；
 * 20 秒都沒碰畫面就自己回首頁。返回鍵也是回首頁（LessonScreen 的 useBack）。
 * 點恐龍（畫面上最吸引他的東西）恐龍跳一下，不會離開（AI 小男生測試：點了沒反應，T-87）。
 * T-110（盲測 e6ecd05：中文課下課連點 4 次恐龍，覺得沒反應）：跳得高一點、身體壓扁再伸長、頭上冒幾顆星星、彈一聲，
 * 跳完手在房子上點一下（下一步在那裡）；點空白處（後面淡掉的課）恐龍也一樣跳一下，不會什麼都沒有。
 * 動作只有出現時、被點到時跳一下（MOTION-1/2/3：不循環、不閃）。
 */
export function LessonBye({ host, onDone }: { host: Speaker; onDone: () => void }) {
  const tap = useTaps()
  const [hand, setHand] = useState(0)
  /** 點恐龍：跳一下（一次就停），讓他知道點到了；不會離開 */
  const [hop, setHop] = useState(0)
  const done = useRef(false)
  const lastTouch = useRef(performance.now())
  const handTimers = useRef<number[]>([])
  /** 手在房子上點一下：出來 → 點 → 收起來 */
  const pointHome = (after: number) => {
    handTimers.current.forEach(clearTimeout)
    handTimers.current = [
      window.setTimeout(() => setHand(1), after),
      window.setTimeout(() => setHand(2), after + 700),
      window.setTimeout(() => setHand(0), after + 1700),
    ]
  }
  /** 恐龍跳一下（點恐龍、點空白處都是），跳完手指著房子 */
  const bounce = () => {
    sfx.boing()
    setHop((n) => n + 1)
    pointHome(600)
  }
  const finish = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  useEffect(() => {
    sfx.pop()
    pointHome(HAND_MS)
    const idle = window.setInterval(() => {
      if (performance.now() - lastTouch.current > BYE_MS) finish()
    }, 1000)
    return () => {
      handTimers.current.forEach(clearTimeout)
      clearInterval(idle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="lesson-bye"
      onPointerDown={(e) => {
        lastTouch.current = performance.now()
        const el = e.target instanceof Element ? e.target : null
        // 點空白處（後面淡掉的課、恐龍旁邊）：恐龍跳一下；點恐龍、房子各自處理
        if (!el?.closest('.lb-host, .lb-home')) bounce()
        else setHand(0)
      }}
    >
      <motion.div
        className="lb-host"
        aria-hidden="true"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        {...tap('dino', bounce)}
      >
        <motion.div
          key={hop}
          style={{ transformOrigin: '50% 100%' }}
          // 先壓扁、跳高、在空中伸長、落地再壓一下（一次就停）
          animate={hop ? { y: [0, 6, -46, 0, 0], scaleY: [1, 0.86, 1.08, 0.92, 1], scaleX: [1, 1.1, 0.95, 1.06, 1] } : undefined}
          transition={{ duration: 0.7, times: [0, 0.15, 0.5, 0.8, 1], ease: 'easeOut' }}
        >
          <Dino who={host} mood="cheer" size="100%" />
        </motion.div>
        {hop > 0 && (
          <div key={hop} style={{ position: 'absolute', left: '55%', top: '18%', pointerEvents: 'none' }}>
            <Sparkles count={8} />
          </div>
        )}
      </motion.div>
      <motion.button
        className="lb-home turn-hop"
        aria-label="回首頁"
        // 「輪到你了」的跳一下（ui.css 的 .turn-hop）：等房子長出來以後才跳
        style={{ animationDelay: '1.1s' }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.35 }}
        whileTap={{ scale: 0.92 }}
        {...tap('home', () => {
          sfx.tap()
          finish()
        })}
      >
        <HomeIcon />
        <AnimatePresence>
          {hand > 0 && (
            <span className="lb-hand" aria-hidden="true">
              <Hand x={58} y={56} tap={hand - 1} size="52%" cuff="#F2C9A8" />
            </span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
