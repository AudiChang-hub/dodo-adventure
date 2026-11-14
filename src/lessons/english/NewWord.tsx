import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { useFlow } from '../../games/barge'
import { wait } from '../../games/lines'
import { firstFinger } from '../../games/NotYet'
import { PACE } from '../../games/pace'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { logTeach } from '../../lib/record'
import { noteTaught } from '../../lib/words'
import { wordKey } from '../../content/lexicon'
import { Sparkles } from '../../ui/Sparkles'
import { letterOf, type WordPick } from './abc'
import { Word } from './Word'
import { linesOf } from './Words'

/**
 * 新朋友（T-150 E 4 歲內容「更多單字」，設計稿 3-1 案 A）：字母遊戲時間的字母牆之後，認識一個學過的字母的第 3 個字。
 * - 豆豆拿出新的圖：「A new friend!」→「Ambulance. → 救護車 → Ambulance.」（中文三明治，跟課裡的單字一樣；家長關掉中文就只念英文）。
 * - 念完 onReady（課在右下角出「下一步」大箭頭）；之後點圖可以再聽一次。只記 teach（logTeach），不記作答。
 * - 搶點：剛出來的 0.5 秒點的不算（上一段連點的手指）；介紹還沒念完就點，停掉介紹、直接念這個字；正在念又點：圖跳一下、輕輕一聲，不重念。
 */
export function NewWord({ pick, onReady }: { pick: WordPick; onReady: () => void }) {
  const still = useReducedMotion()
  const x = letterOf(pick.L)
  const [lit, setLit] = useState(false)
  const [bump, setBump] = useState(0)
  const talking = useRef(true)
  const intro = useRef(true)
  const live = useRef(true)
  const ready = useRef(false)
  const mountAt = useRef(performance.now())
  const flow = useFlow()

  const done = () => {
    if (ready.current || !live.current) return
    ready.current = true
    intro.current = false
    noteTaught([wordKey(pick.w.w)])
    // 念完一次（介紹念完、或搶點直接念完）才記教學
    void logTeach({ station: 'english', game: 'abc-new', itemId: `word:${wordKey(pick.w.w)}`, skill: `word:${wordKey(pick.w.w)}`, level: 1, ms: Math.round(performance.now() - mountAt.current) })
    onReady()
  }

  useEffect(() => {
    live.current = true
    mountAt.current = performance.now()
    void (async () => {
      const ok = flow.begin(live)
      await wait(350)
      if (!ok()) return
      await say('en.abc.new')
      if (!ok()) return
      setLit(true)
      await say(...(await linesOf(pick.w.w)))
      if (!ok()) return
      setLit(false)
      talking.current = false
      done()
    })()
    return () => {
      live.current = false
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async () => {
    if (performance.now() - mountAt.current < PACE.BARGE_ARM) return void sfx.notYet()
    if (intro.current) {
      // 介紹還沒念完就點：停掉介紹，直接念這個字
      flow.cut()
      talking.current = false
      intro.current = false
    }
    if (talking.current) {
      setBump((n) => n + 1)
      return void sfx.notYet()
    }
    const mine = flow.begin(live)
    talking.current = true
    setBump((n) => n + 1)
    setLit(true)
    await say(...(await linesOf(pick.w.w)))
    if (!mine()) return
    setLit(false)
    talking.current = false
    done()
  }

  return (
    <div className="en-new">
      <motion.button
        type="button"
        className={`en-word-card en-new-card${lit ? ' is-lit' : ''}`}
        aria-label={pick.w.w}
        data-word={pick.w.w}
        initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotate: -6 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={still ? { duration: 0.3 } : { type: 'spring', stiffness: 220, damping: 14 }}
        onPointerDown={(e) => {
          if (firstFinger(e.nativeEvent)) void tap()
        }}
        onClick={(e) => {
          if (e.detail === 0) void tap()
        }}
      >
        <span key={bump} className={bump ? 'en-hop' : undefined}>
          <Emoji name={pick.w.icon} />
        </span>
        <Word w={pick.w.w} l={x.l} />
        {!still && <Sparkles count={14} />}
      </motion.button>
    </div>
  )
}
