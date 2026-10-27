import { useRef, useState } from 'react'
import { motion, type TargetAndTransition } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { friendInfo, TICKLE_COUNT, type FriendMove } from '../content/friends'
import { hasLine } from '../content/lines'
import { say, sfx } from '../lib/audio'
import { logTeach } from '../lib/record'

/** 每一種動作的關鍵影格：動物跳兩下再轉身、交通工具開過去再開回來、會飛的飛起來繞一下 */
const MOVES: Record<FriendMove, TargetAndTransition> = {
  hop: {
    y: ['0%', '-34%', '0%', '-18%', '0%', '0%'],
    scaleX: [1, 1, 1, 1, -1, 1],
    scaleY: [1, 1.04, 0.9, 1.02, 1, 1],
    transition: { duration: 1.3, times: [0, 0.18, 0.36, 0.5, 0.72, 1], ease: 'easeInOut' },
  },
  drive: {
    x: ['0%', '70%', '70%', '-40%', '0%'],
    scaleX: [1, 1, -1, -1, 1],
    rotate: [0, -3, 0, 3, 0],
    transition: { duration: 1.6, times: [0, 0.35, 0.45, 0.82, 1], ease: 'easeInOut' },
  },
  fly: {
    y: ['0%', '-70%', '-62%', '-70%', '0%'],
    x: ['0%', '8%', '-8%', '4%', '0%'],
    rotate: [0, -12, 10, -6, 0],
    scale: [1, 1.12, 1.12, 1.08, 1],
    transition: { duration: 1.8, times: [0, 0.3, 0.55, 0.75, 1], ease: 'easeInOut' },
  },
}

const TICKLE: TargetAndTransition = {
  scale: [1, 1.14, 0.94, 1.06, 1],
  rotate: [0, -8, 8, -4, 0],
  transition: { duration: 0.8, ease: 'easeInOut' },
}

/** 第二次點：愛心從頭上飄出來 */
function Hearts({ n }: { n: number }) {
  return (
    <div className="friend-hearts" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => {
        // 從頭頂散開往上飄：左右位置用 left 固定，動畫只動 y（像素），各瀏覽器都穩
        const w = 26 + (i % 3) * 7
        const left = 50 + (i - 2) * 19 + (Math.random() * 8 - 4)
        return (
          <motion.svg
            key={`${n}-${i}`}
            viewBox="0 0 20 18"
            style={{ left: `${left}%`, width: `${w}%`, marginLeft: `${-w / 2}%` }}
            initial={{ y: 10, opacity: 0, scale: 0.4, rotate: (i - 2) * 8 }}
            animate={{ y: -70 - (i % 2) * 24, opacity: [0, 1, 1, 0], scale: [0.4, 1.1, 1, 0.85] }}
            transition={{ duration: 1.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <path d="M10 17 C4 12.6 1 9.6 1 6 C1 3.2 3.2 1 6 1 C7.8 1 9.2 2 10 3.4 C10.8 2 12.2 1 14 1 C16.8 1 19 3.2 19 6 C19 9.6 16 12.6 10 17 Z" fill={i % 2 ? '#F09DB9' : '#E99A84'} />
          </motion.svg>
        )
      })}
    </div>
  )
}

interface Props {
  id: string
  /** 收集頁顯示英文名字；首頁不顯示，避免畫面太多字 */
  label?: boolean
  className?: string
  /** 這次點擊的反應開始時（首頁用來讓牠停下來） */
  onReact?: () => void
}

/**
 * 會說話的朋友（benchmark 手法 7）：
 * 第一次點：依類型做動作，說「I'm a | fox!」再說叫聲；第二次點：愛心飄出來、「Again! Again!」，輪流。
 * 說名字時記一筆輕量的教學紀錄（game: friends、phase: teach），不影響熟練度。
 */
export function FriendActor({ id, label, className, onReact }: Props) {
  const f = friendInfo(id)
  const [taps, setTaps] = useState(0)
  const tickle = useRef(0)

  const tap = () => {
    const n = taps + 1
    setTaps(n)
    onReact?.()
    if (n % 2 === 1) {
      sfx.pop()
      const keys = [`friend.name.${id}`, `friend.sound.${id}`].filter(hasLine)
      if (keys.length) void say(...keys)
      void logTeach({ station: 'mandarin', game: 'friends', itemId: id, skill: `vocab:${f.vocab}`, level: 0, ms: 0 })
    } else {
      sfx.tap()
      const k = `friend.tickle.${f.voice}.${tickle.current++ % TICKLE_COUNT}`
      if (hasLine(k)) void say(k)
    }
  }

  const odd = taps % 2 === 1
  return (
    <motion.button className={`friend-actor${className ? ` ${className}` : ''}`} aria-label={f.name} onClick={tap} whileTap={{ scale: 0.94 }}>
      <motion.span key={taps} className="friend-body" animate={taps === 0 ? {} : odd ? MOVES[f.move] : TICKLE}>
        <Emoji name={id} />
      </motion.span>
      {taps > 0 && !odd && <Hearts n={taps} />}
      {label && (
        <span className="friend-name" lang="en">
          {f.name}
        </span>
      )}
    </motion.button>
  )
}
