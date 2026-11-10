import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../../games/lines'
import { useFlow } from '../../games/barge'
import { PACE } from '../../games/pace'
import { logTeach } from '../../lib/record'
import type { LessonLetter } from './data'
import { Word } from './Word'
import { firstFinger } from '../../games/NotYet'

type Lit = 'big' | 'little' | 'both' | null

/**
 * 認字母（英文課第 1 段）：今天的字母大寫、小寫放大，豆豆念「A, A, A… a, a… apple!」，念到單字時代表字的圖出來。
 * 自己往下走（念完停一下就到描字），不用孩子按「下一步」；念完之後點字母、點圖可以再聽一次（停的時間重新算）。
 * 搶點（T-108，games/barge.ts）：介紹還沒念完就點字母或圖：停掉介紹，直接念他點的那一個（圖也馬上出來），念完照常停一下就往下走。
 * 正在念他點的那一個時又點：字母輕輕跳一下、有聲音，不重念（三歲會一直點，不能每點一下就重念）。
 */
export function Meet({ letter, review, repeat = false, onDone }: { letter: LessonLetter; review: boolean; repeat?: boolean; onDone: () => void }) {
  const [lit, setLit] = useState<Lit>(null)
  const [pic, setPic] = useState(false)
  const [bump, setBump] = useState<{ which: 'big' | 'little' | 'pic'; n: number } | null>(null)
  const talking = useRef(true)
  /** 開頭的介紹還在念（可以被搶掉） */
  const intro = useRef(true)
  const live = useRef(true)
  const leaveAt = useRef(0)
  const flow = useFlow()
  const mountAt = useRef(performance.now())
  /** 介紹念完（或被搶掉）：開始倒數往下走（只開一次） */
  const settle = useRef<() => void>(() => {})
  const { L, l } = letter
  const anchor = letter.words[0]

  useEffect(() => {
    live.current = true
    mountAt.current = performance.now()
    let timer = 0
    const t = performance.now()
    let ticking = false
    settle.current = () => {
      if (ticking || !live.current) return
      ticking = true
      intro.current = false
      setPic(true)
      void logTeach({ station: 'english', game: 'lesson-en', itemId: `letter:${L}`, skill: `letter:${L}`, level: 1, ms: Math.round(performance.now() - t) })
      // 念完停一下就往下走；孩子點了又念，就從念完再等
      leaveAt.current = performance.now() + 1400
      const tick = () => {
        if (!live.current) return
        if (!talking.current && performance.now() >= leaveAt.current) return onDone()
        timer = window.setTimeout(tick, 200)
      }
      tick()
    }
    const run = async () => {
      const ok = flow.begin(live)
      await wait(350)
      if (!ok()) return
      // 開場：今天新的字母 Today's letter is S!；同一天複習 Let's practice S again!；
      // 隔天重上同一個字母 Look! S is back!（T-127：以前跟第一天一字不差，孩子聽到一模一樣的開場）
      await say(review ? `ph.${l}.again` : repeat ? `ph.${l}.back` : `ph.${l}.today`)
      if (!ok()) return
      setLit('big')
      await say(`ph.${l}.big`)
      if (!ok()) return
      setLit('little')
      await say(`ph.${l}.little`)
      if (!ok()) return
      setLit('both')
      // 念到單字之前把圖放上來：字幕念到 apple! 的時候圖已經在了
      window.setTimeout(() => live.current && setPic(true), 1600)
      await say(`ph.${l}.says`)
      if (!ok()) return
      setLit(null)
      talking.current = false
      settle.current()
    }
    void run()
    return () => {
      live.current = false
      clearTimeout(timer)
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async (which: 'big' | 'little' | 'pic') => {
    // 介紹還沒念完就點：停掉介紹，直接念他點的那一個
    // 剛出來的 0.5 秒（PACE.BARGE_ARM）：上一段連點的手指先不算
    if (intro.current && performance.now() - mountAt.current < PACE.BARGE_ARM) return void sfx.notYet()
    if (intro.current) {
      flow.cut()
      talking.current = false
      settle.current()
    }
    if (talking.current) return void sfx.notYet()
    // 真的要念了才跳一下；念到一半又點只有很輕的一聲「嗯？」，不跳（T-109：亂點沒有好玩的反應）
    setBump((b) => ({ which, n: (b?.n ?? 0) + 1 }))
    talking.current = true
    setLit(which === 'pic' ? null : which)
    await say(which === 'big' ? `ph.${l}.big` : which === 'little' ? `ph.${l}.little` : `ph.${l}.says`)
    if (!live.current) return
    setLit(null)
    talking.current = false
    leaveAt.current = performance.now() + 1400
  }

  /** 點了跳一下：裡面那一層換 key 重新播 CSS 動畫（外層的淡入不重來） */
  const hop = (which: 'big' | 'little' | 'pic', child: ReactNode) => (
    <span key={bump?.which === which ? bump.n : 0} className={bump?.which === which ? 'en-hop' : undefined}>
      {child}
    </span>
  )

  return (
    <div className="en-meet">
      <div className="en-meet-pair">
        <motion.button
          type="button"
          className={`en-letter is-big${lit === 'big' || lit === 'both' ? ' is-lit' : ''}`}
          aria-label={`大寫 ${L}`}
          // 手指一按下就有反應（T-112：以前用 click，手指滑一下就被取消）；鍵盤照樣可以按
          onPointerDown={(e) => {
            if (firstFinger(e.nativeEvent)) void tap('big')
          }}
          onClick={(e) => {
            if (e.detail === 0) void tap('big')
          }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {hop('big', L)}
        </motion.button>
        <motion.button
          type="button"
          className={`en-letter is-little${lit === 'little' || lit === 'both' ? ' is-lit' : ''}`}
          aria-label={`小寫 ${l}`}
          // 手指一按下就有反應（T-112：以前用 click，手指滑一下就被取消）；鍵盤照樣可以按
          onPointerDown={(e) => {
            if (firstFinger(e.nativeEvent)) void tap('little')
          }}
          onClick={(e) => {
            if (e.detail === 0) void tap('little')
          }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          {hop('little', l)}
        </motion.button>
      </div>
      <motion.button
        type="button"
        className="en-meet-pic"
        aria-label={anchor.w}
        // 手指一按下就有反應（T-112：以前用 click，手指滑一下就被取消）；鍵盤照樣可以按
          onPointerDown={(e) => {
            if (firstFinger(e.nativeEvent)) void tap('pic')
          }}
          onClick={(e) => {
            if (e.detail === 0) void tap('pic')
          }}
        initial={false}
        animate={{ opacity: pic ? 1 : 0, y: pic ? 0 : 16 }}
        transition={{ duration: 0.5 }}
        style={{ pointerEvents: pic ? 'auto' : 'none' }}
      >
        {hop(
          'pic',
          <>
            <Emoji name={anchor.icon} />
            <Word w={anchor.w} l={l} />
          </>,
        )}
      </motion.button>
    </div>
  )
}
