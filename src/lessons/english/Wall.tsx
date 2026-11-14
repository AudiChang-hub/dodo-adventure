import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { Hand } from '../../games/Demo'
import { useFlow } from '../../games/barge'
import { wait } from '../../games/lines'
import { firstFinger } from '../../games/NotYet'
import { PACE } from '../../games/pace'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { hasLine } from '../../content/lines'
import { logTeach } from '../../lib/record'
import { pointIn } from '../math/kit'
import { letterOf, taughtWords } from './abc'
import { wordId } from './data'

/** 點幾下、或過多久，右下角出「下一步」大箭頭（設計稿 1-1：6 下或 20 秒） */
export const WALL_TAPS = 6
export const WALL_MS = 20_000
/** 一直沒點：手出來點今天的字母（我做） */
const WALL_HINT_MS = 4000

/** 一塊積木念什麼：A, A, A… a, a… apple!（認字母那一句）；沒有那一句就念字母音＋代表字 */
const linesOf = (L: string) => {
  const x = letterOf(L)
  return hasLine(`ph.${x.l}.says`) ? [`ph.${x.l}.says`] : [`ph.${x.l}.sound`, `ph.word.${wordId(taughtWords(x)[0].w)}`]
}

/**
 * 字母牆（字母遊戲時間第 1 段，T-147 英文門案 A）：學過的字母當大積木，一頁最多 6 塊，自由探索、不計分。
 * - 點一塊：豆豆念「A, A, A… a, a… apple!」，代表字的圖從積木後面探出來。
 * - 念的時候點別塊：停掉、改念新的那一塊（搶點，T-108）；點同一塊：輕輕一聲，不重念。
 * - 剛出來的 0.5 秒（PACE.BARGE_ARM）：上一段連點的手指不算。
 * - 4 秒都沒點：手出來點今天的字母（不幫他點）。
 * - 點了 6 下或過了 20 秒：onReady（課在右下角出「下一步」大箭頭；之後照樣可以點）。
 * - 只記 teach（logTeach），不記作答。
 * - 今天新學的那一塊第一次放上牆（fresh，T-149 E5）：別的積木先在原位淡淡出來（不動），它從上面落下、輕輕彈一下（約 1 秒），
 *   讓孩子看到「我又多一個」。不加星星、分數、連續天數；減少動態效果時只淡入。
 */
export function Wall({ letters, fresh = null, onReady }: { letters: string[]; /** 今天新學、第一次放上牆的那一塊（T-149 E5） */ fresh?: string | null; onReady: () => void }) {
  const still = useReducedMotion()
  const [lit, setLit] = useState<string | null>(null)
  const [seen, setSeen] = useState<string[]>([])
  const [hand, setHand] = useState(false)
  const [tap, setTap] = useState(0)
  const [bump, setBump] = useState<{ L: string; n: number } | null>(null)
  const taps = useRef(0)
  const live = useRef(true)
  const ready = useRef(false)
  const mountAt = useRef(performance.now())
  const layer = useRef<HTMLDivElement | null>(null)
  const blocks = useRef(new Map<string, HTMLElement>())
  const flow = useFlow()
  const talking = useRef<string | null>(null)

  const done = () => {
    if (ready.current || !live.current) return
    ready.current = true
    onReady()
  }

  useEffect(() => {
    live.current = true
    mountAt.current = performance.now()
    const ok = flow.begin(live)
    void (async () => {
      await wait(250)
      if (!ok()) return
      await say('en.abc.go')
    })()
    const t = window.setTimeout(done, WALL_MS)
    return () => {
      live.current = false
      clearTimeout(t)
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 一直沒點：手出來點今天的字母（第一塊），之後每 2.5 秒再點一下；點了就收起來
  useEffect(() => {
    if (seen.length) return setHand(false)
    const a = window.setTimeout(() => {
      setHand(true)
      setTap((n) => n + 1)
    }, WALL_HINT_MS)
    const b = window.setInterval(() => setTap((n) => n + 1), 2500)
    return () => {
      clearTimeout(a)
      clearInterval(b)
    }
  }, [seen.length])

  const press = async (L: string) => {
    if (performance.now() - mountAt.current < PACE.BARGE_ARM) return void sfx.notYet()
    if (talking.current === L) {
      setBump((b) => ({ L, n: (b?.n ?? 0) + 1 }))
      return void sfx.notYet()
    }
    // 搶掉開場的 Let's play ABC! 或正在念的另一塊
    flow.cut()
    const mine = flow.begin(live)
    talking.current = L
    setLit(L)
    setSeen((s) => (s.includes(L) ? s : [...s, L]))
    sfx.tap()
    const t = performance.now()
    if (++taps.current >= WALL_TAPS) done()
    await say(...linesOf(L))
    if (!mine()) return
    void logTeach({ station: 'english', game: 'abc-wall', itemId: `wall:${L}`, skill: `abc:${L}`, level: 1, ms: Math.round(performance.now() - t) })
    talking.current = null
    setLit(null)
  }

  const at = hand && letters.length ? pointIn(blocks.current.get(letters[0]), layer.current, 0.5, 0.62) : null
  return (
    <div className={`en-wall n${letters.length}`} ref={layer} data-seen={seen.length}>
      {letters.map((L, i) => {
        const x = letterOf(L)
        const w = taughtWords(x)[0]
        const on = lit === L
        const isNew = fresh === L
        return (
          <motion.button
            key={L}
            ref={(el) => {
              if (el) blocks.current.set(L, el)
            }}
            type="button"
            className={`en-block c${i % 6}${on ? ' is-lit' : ''}${seen.includes(L) ? ' is-seen' : ''}${isNew ? ' is-new' : ''}`}
            aria-label={L}
            data-new={isNew ? '1' : undefined}
            initial={isNew && !still ? { opacity: 0, y: -160, scale: 0.9 } : { opacity: 0 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={
              isNew && !still
                ? { delay: 0.5, y: { type: 'spring', stiffness: 260, damping: 13, mass: 0.9 }, opacity: { duration: 0.2, delay: 0.5 }, scale: { duration: 0.6, delay: 0.5 } }
                : { duration: 0.35, delay: isNew ? 0.5 : 0 }
            }
            onPointerDown={(e) => {
              if (firstFinger(e.nativeEvent)) void press(L)
            }}
            onClick={(e) => {
              if (e.detail === 0) void press(L)
            }}
          >
            {/* 代表字的圖：點了才從積木後面探出來（上面），念完收回去 */}
            <AnimatePresence>
              {on && (
                <motion.span
                  key="peek"
                  className="en-block-peek"
                  aria-hidden="true"
                  initial={still ? { opacity: 0 } : { y: '60%', opacity: 0 }}
                  animate={{ y: '0%', opacity: 1 }}
                  exit={still ? { opacity: 0 } : { y: '60%', opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Emoji name={w.icon} />
                </motion.span>
              )}
            </AnimatePresence>
            <span key={bump?.L === L ? bump.n : 0} className={`en-block-face${bump?.L === L ? ' en-hop' : ''}`}>
              <b>{x.L}</b>
              <i>{x.l}</i>
            </span>
          </motion.button>
        )
      })}
      <AnimatePresence>{at && <Hand key="wall" x={at.x} y={at.y} tap={tap} size="min(110px, 13vmin)" cuff="#BFE0CC" />}</AnimatePresence>
    </div>
  )
}
