import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { HomeIcon } from '../Shell'
import { Hand } from '../Demo'
import { say, sfx } from '../../lib/audio'
import { useTaps } from '../../ui/tap'

/** 停在作品上：說完以後多久沒選，豆豆再說一次（只再說一次，不一直唸） */
const AGAIN_MS = 9000

/**
 * 畫完、慶祝完，停在作品上（T-139⑧，盲測 becf39a 低 8：按完成、聽到 I love it、看到星星以後，
 * 孩子又去點星星和綠勾勾，分不清做完了沒有）：工具欄整個收起來，同一欄換成兩個大圖示，一看就知道接下來可以做什麼：
 * - 上面「再畫一張」（白紙：一張新的白紙；著色本：回著色本挑下一張）
 * - 下面「回首頁」（小房子，直接回首頁）
 * 豆豆一個一個說出來（T-140，盲測 73d57c7：只有圖示，孩子看不懂）：說「Draw another one?」（著色本：Color another one?）的時候
 * 「再畫一張」亮起來、跳一下；說「Or go home?」的時候小房子亮起來、跳一下。說完 3 秒沒選，手在「再畫一張」上點一下給他看。
 * 點作品（畫紙）會再說一次、手再點一次。白紙自由畫、著色本共用。
 *
 * T-143（盲測 9231aa6 低 6：著色本第 2 張塗完，孩子說「現在要做什麼？我不知道」就按返回）：以前手要等兩句都說完、再過 3 秒才出來，
 * 點一下就收起來，第 2 張以後孩子常常在手出來之前就走了。現在每一張都一樣：大圖示一出來，
 * 「再畫一張」就一直亮著一圈（輕輕呼吸），手也馬上在上面輕輕點，一直到他選了才收；說完 9 秒沒選，豆豆再說一次。
 */
export function DoneChoices({ again, againArt, againLabel, line, home, poke }: { again: () => void; againArt: ReactNode; againLabel: string; line: string; home: () => void; poke: number }) {
  const tap = useTaps()
  /** 手點一下的次數（豆豆說到「再畫一張」、點作品時各點一下）；沒在點的時候一直輕輕地點（beckon） */
  const [knock, setKnock] = useState(0)
  /** 豆豆正在說哪一個：那一個亮起來、跳一下 */
  const [said, setSaid] = useState<'again' | 'home' | null>(null)
  const alive = useRef(true)
  const talking = useRef(false)
  /** 已經再說過一次了：不一直唸 */
  const retold = useRef(false)
  const idle = useRef(0)
  /** 一個一個說出來：說到哪一個，哪一個亮、手點一下；說完 9 秒沒選，再說一次 */
  const tell = async () => {
    if (talking.current) return
    talking.current = true
    clearTimeout(idle.current)
    setSaid('again')
    setKnock((n) => n + 1)
    await say(line)
    if (!alive.current) return
    setSaid('home')
    await say('d.next.home')
    if (!alive.current) return
    setSaid(null)
    talking.current = false
    if (retold.current) return
    idle.current = window.setTimeout(() => {
      if (!alive.current) return
      retold.current = true
      void tell()
    }, AGAIN_MS)
  }
  useEffect(() => {
    alive.current = true
    void tell()
    return () => {
      alive.current = false
      clearTimeout(idle.current)
    }
    // 停下來的時候說一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 點畫紙：再說一次、手再點一次給他看
  useEffect(() => {
    if (!poke) return
    setKnock((n) => n + 1)
    void tell()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poke])
  // 手點一下以後，回到一直輕輕地點
  const [beckon, setBeckon] = useState(true)
  useEffect(() => {
    if (!knock) return
    setBeckon(false)
    const t = window.setTimeout(() => setBeckon(true), 900)
    return () => clearTimeout(t)
  }, [knock])
  return (
    <div className="draw-home-col draw-next-col" data-resting="">
      <motion.button
        className={`draw-next draw-again turn-hop is-hint${said === 'again' ? ' is-said' : ''}`}
        data-next="again"
        aria-label={againLabel}
        style={{ animationDelay: '0.9s' }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
        whileTap={{ scale: 0.92 }}
        {...tap('again', () => {
          sfx.tap()
          again()
        })}
      >
        <span className="draw-next-art">{againArt}</span>
        <span className="draw-home-hand" aria-hidden="true">
          <Hand x={60} y={58} tap={beckon ? 0 : knock} beckon={beckon} size="46%" cuff="#F2C9A8" />
        </span>
      </motion.button>
      <motion.button
        className={`draw-next draw-home${said === 'home' ? ' is-said' : ''}`}
        data-next="home"
        aria-label="回首頁"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.35 }}
        whileTap={{ scale: 0.92 }}
        {...tap('home', () => {
          sfx.tap()
          home()
        })}
      >
        <HomeIcon />
      </motion.button>
    </div>
  )
}
