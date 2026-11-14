import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { isDue } from '../../lib/adaptive'
import { pickVariety } from '../../lib/variety'
import { nextStep } from '../../ui/NextStep'
import {
  ABC_GAMES,
  DEMO_UNTIL,
  MATURE_AT,
  PAIR_ROUNDS,
  canMatch,
  endPlay,
  learnedLetters,
  loadPlay,
  makeFlips,
  makePairs,
  savePlay,
  isFresh,
  startPlay,
  wallLetters,
  type AbcGame,
  type FlipCard,
  type PairRound,
  type PlayState,
} from './abc'
import type { TodayPlan } from './plan'
import { Wall } from './Wall'
import { Pair } from './Pair'
import { Flip } from './Flip'

/** 字母遊戲時間現在在哪一段（課的上面小石頭、陪玩小字、data-abc 用） */
export interface PlayView {
  part: 'wall' | AbcGame | 'end'
  /** 配對遊戲：做完幾回合（翻翻卡：配好幾對）／一共幾回合 */
  done: number
  total: number
  /** 放進籃子這一回合要找的字（陪玩小字用） */
  w?: string
  /** 這一次有沒有配對遊戲（學過的字母不夠：只有字母牆） */
  game: AbcGame | null
}

/** 字母牆到期該複習的：字母題（letter:A）到期了（lib/adaptive；讀不到就當作沒有） */
const dueOf = (L: string) => {
  try {
    return isDue(`letter:${L}`)
  } catch {
    return false
  }
}

/**
 * 字母遊戲時間（T-147 英文門案 A）：今天的課上完以後，同一天再進英文門玩的那一段（取代以前的「從頭再複習一次今天的字母」）。
 * 字母牆（自由點、不計分）→ 大箭頭 → 今天的配對遊戲（放進籃子：聽字找圖 4 回合，或翻翻卡：兩張一樣的圖 2 盤）→ onDone（下課的晚安道別、不定時的貼紙，跟上課一樣）。
 * 只用學過的字母和英文課教過的字（abc.ts）。學過的字母少於 2 個：只有字母牆。
 * 中途離開，同一天回來從離開的那一段接著玩（kv lesson.english.play）；玩完再進來是新的一次，換另一種配對遊戲。
 * 字母歌開場（設計稿 2-4，S4）這次不做。
 */
export function Play({ plan, onView, onDone }: { plan: TodayPlan; onView: (v: PlayView) => void; onDone: () => void }) {
  const [st, setSt] = useState<PlayState | null>(null)
  const [part, setPart] = useState<'wall' | 'game' | null>(null)
  const set = useRef<{ wall: string[]; pairs: PairRound[]; flips: FlipCard[][]; fresh: string | null }>({ wall: [], pairs: [], flips: [], fresh: null })
  const live = useRef(true)
  const state = useRef<PlayState | null>(null)
  const todayL = plan.seq[plan.idx]

  const save = (s: PlayState) => {
    state.current = s
    setSt(s)
    void savePlay(s)
  }

  useEffect(() => {
    live.current = true
    void (async () => {
      const learned = learnedLetters(plan.idx, plan.seq, true)
      const match = canMatch(learned)
      const [old, variety] = await Promise.all([loadPlay(), pickVariety<AbcGame>('english.abc', ABC_GAMES).catch(() => 'pair' as const)])
      if (!live.current) return
      const s0 = startPlay(old, variety, match)
      // 今天新學的那一塊第一次放上牆（E5）：這一次播放上去的動畫，記下來以後不再播
      const fresh = isFresh(s0, todayL) && learned.includes(todayL) ? todayL : null
      const s = fresh ? { ...s0, placed: todayL } : s0
      const g = s.cur?.game ?? null
      const mature = !!g && (s.solo?.[g] ?? 0) >= MATURE_AT
      set.current = {
        wall: wallLetters(learned, todayL, dueOf),
        pairs: g === 'pair' ? makePairs(learned, todayL, mature, dueOf) : [],
        flips: g === 'flip' ? makeFlips(learned, todayL, mature, dueOf) : [],
        fresh,
      }
      save(s)
      const wallDone = !!s.cur?.wall
      // 配對遊戲出不了題（理論上不會）：當作沒有配對遊戲
      const ok = g === 'pair' ? set.current.pairs.length > 0 : g === 'flip' ? set.current.flips.length > 0 : false
      if (wallDone && ok) setPart('game')
      else setPart('wall')
    })()
    return () => {
      live.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const game = st?.cur?.game ?? null
  const hasGame = game === 'pair' ? set.current.pairs.length > 0 : game === 'flip' ? set.current.flips.length > 0 : false
  const round = st?.cur?.round ?? 0
  const pairs = set.current.pairs
  const flips = set.current.flips
  const flipTotal = flips.reduce((n, b) => n + b.length / 2, 0)
  const flipBefore = flips.slice(0, Math.min(round, flips.length)).reduce((n, b) => n + b.length / 2, 0)
  const [matches, setMatches] = useState(0)

  // 上面的小石頭、陪玩小字跟著現在這一段
  useEffect(() => {
    if (!part || !st) return
    const g = hasGame ? game : null
    if (part === 'wall') onView({ part: 'wall', done: 0, total: 0, game: g })
    else if (game === 'pair') onView({ part: 'pair', done: round, total: pairs.length, w: pairs[Math.min(round, pairs.length - 1)]?.w, game: 'pair' })
    else if (game === 'flip') onView({ part: 'flip', done: Math.max(matches, flipBefore), total: flipTotal, game: 'flip' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, st, matches])

  const finish = () => {
    const s = state.current
    if (!s || !live.current) return
    save(endPlay(s))
    onView({ part: 'end', done: 0, total: 0, game: hasGame ? game : null })
    onDone()
  }

  /** 字母牆點夠了：出大箭頭，點了才到配對遊戲（沒有配對遊戲就玩完了） */
  const wallReady = async () => {
    if (!(await nextStep()) || !live.current) return
    const s = state.current
    if (!s?.cur) return
    save({ ...s, cur: { ...s.cur, wall: true } })
    if (hasGame) setPart('game')
    else finish()
  }

  /** 做完一回合（翻翻卡：一盤）：記下來，自己做對的累計（示範到什麼時候、熟了沒） */
  const roundDone = (n: number, solo: boolean) => {
    const s = state.current
    if (!s?.cur || !game) return
    const so = { ...(s.solo ?? {}), ...(solo ? { [game]: (s.solo?.[game] ?? 0) + 1 } : {}) }
    save({ ...s, solo: so, cur: { ...s.cur, round: n } })
  }

  if (!st || !part) return null
  const demo = !!game && (st.solo?.[game] ?? 0) < DEMO_UNTIL
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={part}
        className="en-abc"
        data-abc={part === 'wall' ? 'wall' : game ?? 'wall'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.4 } }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
      >
        {part === 'wall' && <Wall letters={set.current.wall} fresh={set.current.fresh} onReady={() => void wallReady()} />}
        {part === 'game' && game === 'pair' && <Pair rounds={pairs} from={Math.min(round, PAIR_ROUNDS - 1, pairs.length - 1)} demo={demo && round === 0} onRound={roundDone} onDone={finish} />}
        {part === 'game' && game === 'flip' && (
          <Flip boards={flips} from={Math.min(round, flips.length - 1)} demo={demo && round === 0} onMatch={setMatches} onBoard={roundDone} onDone={finish} />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
