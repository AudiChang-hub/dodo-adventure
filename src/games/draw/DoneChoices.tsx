import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HomeIcon } from '../Shell'
import { Hand } from '../Demo'
import { say, sfx } from '../../lib/audio'
import { useTaps } from '../../ui/tap'

/** 停在作品上：多久沒選，示範的手在「再畫一張」上點一下 */
const HAND_MS = 3000

/**
 * 畫完、慶祝完，停在作品上（T-139⑧，盲測 becf39a 低 8：按完成、聽到 I love it、看到星星以後，
 * 孩子又去點星星和綠勾勾，分不清做完了沒有）：工具欄整個收起來，同一欄換成兩個大圖示，一看就知道接下來可以做什麼：
 * - 上面「再畫一張」（白紙：一張新的白紙；著色本：回著色本挑下一張）
 * - 下面「回首頁」（小房子，直接回首頁）
 * 豆豆問一句「Draw another one?」（著色本：Color another one?）；3 秒沒選，手在「再畫一張」上點一下給他看。
 * 點作品（畫紙）也會讓手再點一次。白紙自由畫、著色本共用。
 */
export function DoneChoices({ again, againArt, againLabel, line, home, poke }: { again: () => void; againArt: ReactNode; againLabel: string; line: string; home: () => void; poke: number }) {
  const tap = useTaps()
  const [hand, setHand] = useState(0)
  useEffect(() => {
    void say(line)
    const h = window.setTimeout(() => setHand((v) => v || 1), HAND_MS)
    return () => clearTimeout(h)
    // 停下來的時候說一次就好
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 點畫紙：手再點一次給他看
  useEffect(() => {
    if (poke) setHand((v) => v || 1)
  }, [poke])
  useEffect(() => {
    if (hand !== 1) return
    const t = window.setTimeout(() => setHand(2), 700)
    const tt = window.setTimeout(() => setHand(0), 1700)
    return () => {
      clearTimeout(t)
      clearTimeout(tt)
    }
  }, [hand])
  return (
    <div className="draw-home-col draw-next-col" data-resting="">
      <motion.button
        className="draw-next draw-again turn-hop"
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
        <AnimatePresence>
          {hand > 0 && (
            <span className="draw-home-hand" aria-hidden="true">
              <Hand x={60} y={58} tap={hand - 1} size="46%" cuff="#F2C9A8" />
            </span>
          )}
        </AnimatePresence>
      </motion.button>
      <motion.button
        className="draw-next draw-home"
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
