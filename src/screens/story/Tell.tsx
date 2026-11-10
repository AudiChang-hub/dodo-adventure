import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { Hand } from '../../games/Demo'
import { firstFinger } from '../../games/NotYet'
import { say, sfx } from '../../lib/audio'
import { hasLine } from '../../content/lines'
import { StoryPage } from '../../art/storybook/Page'
import type { PageArt, SceneId } from '../../art/storybook/layout'

/** 多久沒選，手來指對的那一張（小班段 8 秒） */
export const PICK_HAND_MS = 8000
export const PICK_AGAIN_MS = 16_000
/** 還是沒選：手點對的那一張，故事自己往下走（30 秒內一定能往下） */
export const PICK_AUTO_MS = 24_000

/**
 * 兩張圖選一張（T-127）：第 3 天「你來說」每一頁之前（What happens next?，對的是下一頁的插畫），
 * 和第 1 天念完最後問的一題（Where is the egg?，兩張角色的圖）。
 * - 問題念的時候就可以點（搶點不擋）。點對：那一張亮綠框、彈一聲，停一下就往下。
 * - 點錯：那一張淡下去（不出怪聲、不扣分），手馬上指對的那一張；他再點對的。
 * - 8 秒沒選：手指對的那一張點一下；16 秒再一次；24 秒手點下去，故事自己往下走（30 秒內一定能往下）。
 * - 連點、好幾根手指：只算第一下；選好之後再點都不算。
 */
export function Choose({
  cards,
  answer,
  ask,
  kind,
  auto = true,
  onDone,
}: {
  cards: [ReactNode, ReactNode]
  answer: 0 | 1
  /** 問題的台詞 key */
  ask: string
  /** tell：第 3 天（插畫）；ask：第 1 天最後的問題（角色） */
  kind: 'tell' | 'ask'
  /** 24 秒手點下去、自己往下（預設）；false 是絕不自己往下，手每 8 秒來指一次（故事時間英文版課文 T-129：家長要等他點） */
  auto?: boolean
  /** first：第一下就點對 */
  onDone: (r: { first: boolean; by: 'kid' | 'auto' }) => void
}) {
  const done = useRef(false)
  const missed = useRef(false)
  const [off, setOff] = useState<number[]>([])
  const [right, setRight] = useState(false)
  const [hand, setHand] = useState(0)
  const finish = (by: 'kid' | 'auto') => {
    if (done.current) return
    done.current = true
    setRight(true)
    sfx.correct()
    window.setTimeout(() => onDone({ first: !missed.current && by === 'kid', by }), 900)
  }
  useEffect(() => {
    if (hasLine(ask)) void say(ask)
    const show = () => setHand((n) => n + 1)
    if (!auto) {
      const id = window.setInterval(show, PICK_HAND_MS)
      return () => clearInterval(id)
    }
    const ts = [window.setTimeout(show, PICK_HAND_MS), window.setTimeout(show, PICK_AGAIN_MS), window.setTimeout(() => (show(), window.setTimeout(() => finish('auto'), 450)), PICK_AUTO_MS)]
    return () => ts.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pick = (i: number) => {
    if (done.current) return
    if (i === answer) return finish('kid')
    missed.current = true
    sfx.tap()
    setOff((o) => (o.includes(i) ? o : [...o, i]))
    setHand((n) => n + 1)
  }
  return (
    <div className={`story-choose is-${kind}`} data-choose={kind}>
      {cards.map((c, i) => (
        <button
          key={i}
          type="button"
          className={`story-choice${off.includes(i) ? ' is-off' : ''}${right && i === answer ? ' is-right' : ''}`}
          data-answer={i === answer ? '' : undefined}
          aria-label={i === answer ? '對的那一張' : '另一張'}
          onPointerDown={(e) => {
            if (firstFinger(e.nativeEvent)) pick(i)
          }}
        >
          {c}
        </button>
      ))}
      <AnimatePresence>{hand > 0 && !right && <Hand key="hand" x={answer === 0 ? 24 : 74} y={58} tap={hand} size="9cqmin" />}</AnimatePresence>
    </div>
  )
}

/** 第 3 天的一張選圖：那一頁的插畫（縮小） */
export function TellCard({ art }: { art: PageArt }) {
  return <StoryPage art={art} />
}

/** 第 1 天最後的問題的一張圖：一個角色站在這一章的場景裡 */
export function AskCard({ who, scene }: { who: string; scene: SceneId }) {
  return <StoryPage art={{ scene, cast: [{ who, at: 'C', size: 'L' }] }} />
}
