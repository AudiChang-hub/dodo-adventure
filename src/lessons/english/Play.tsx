import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { isDue } from '../../lib/adaptive'
import { db, getKV, setKV, today, type Attempt } from '../../lib/db'
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
  makeOnsets,
  makePairs,
  pickNewWord,
  savePlay,
  isFresh,
  startPlay,
  wallLetters,
  type AbcGame,
  type FlipCard,
  type PairRound,
  type PlayState,
  type WordPick,
} from './abc'
import { PAUSE_KEY, STAGE4_KEY, advance, afterNewWord, afterOnset, canTeachNew, knownWords, moreSet, onsetMode, onsetToday, type Stage4Kv } from './stage4'
import type { TodayPlan } from './plan'
import { Wall } from './Wall'
import { Pair } from './Pair'
import { Flip } from './Flip'
import { NewWord } from './NewWord'

/** 字母遊戲時間現在在哪一段（課的上面小石頭、陪玩小字、data-abc 用） */
export interface PlayView {
  part: 'wall' | 'friend' | AbcGame | 'end'
  /** 配對遊戲：做完幾回合（翻翻卡：配好幾對）／一共幾回合 */
  done: number
  total: number
  /** 放進籃子這一回合要找的字、聽開頭的答案、新朋友（陪玩小字用） */
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

/** 4 歲內容（./stage4.ts）要的：門的 kv、家長的暫停開關、聽字找圖和聽開頭的作答紀錄。讀不到就當作門都關著 */
async function loadStage4(): Promise<{ kv: Stage4Kv; paused: boolean; attempts: Attempt[] }> {
  try {
    const [kv, paused, attempts] = await Promise.all([
      getKV<Stage4Kv | null>(STAGE4_KEY, {}),
      getKV<boolean | null>(PAUSE_KEY, null),
      db.attempts.where('skill').startsWithAnyOf(['enword:', 'onset:']).toArray(),
    ])
    return { kv: kv && typeof kv === 'object' ? kv : {}, paused: paused === true, attempts }
  } catch {
    return { kv: {}, paused: false, attempts: [] }
  }
}
const saveStage4 = (kv: Stage4Kv) => setKV(STAGE4_KEY, kv).catch(() => {})

interface Sets {
  wall: string[]
  pairs: PairRound[]
  flips: FlipCard[][]
  /** 聽開頭的回合（4 歲） */
  onsets: PairRound[]
  /** 聽開頭第 1 回合要不要示範（第一次玩、退一級） */
  onsetDemo: boolean
  fresh: string | null
  /** 教過第 3 個字的字母（4 歲的新朋友） */
  more: ReadonlySet<string>
  /** 這一次的新朋友（沒有就是 null） */
  friend: WordPick | null
}

/**
 * 字母遊戲時間（T-147 英文門案 A）：今天的課上完以後，同一天再進英文門玩的那一段（取代以前的「從頭再複習一次今天的字母」）。
 * 字母牆（自由點、不計分）→ 大箭頭 → 今天的配對遊戲（放進籃子：聽字找圖 4 回合，或翻翻卡：兩張一樣的圖 2 盤）→ onDone（下課的晚安道別、不定時的貼紙，跟上課一樣）。
 * 只用學過的字母和英文課教過的字（abc.ts）。學過的字母少於 2 個：只有字母牆。
 * 中途離開，同一天回來從離開的那一段接著玩（kv lesson.english.play）；玩完再進來是新的一次，換另一種配對遊戲。
 * 字母歌開場（設計稿 2-4，S4）這次不做。
 * 4 歲內容（T-150 E，./stage4.ts 的門開了、家長沒暫停才有）：
 * - 新朋友（更多單字）：字母牆之後、配對遊戲之前，認識一個學過的字母的第 3 個字（NewWord.tsx），一天最多 1 個；之後聽字找圖、翻翻卡、字母牆都會用到它。
 * - 聽開頭（開頭音）：配對遊戲換成聽開頭（Pair.tsx 的 onset 回合），只在今天第一次、而且隔夠久的時候（stage4.ts 的 onsetToday）。
 */
export function Play({ plan, onView, onDone }: { plan: TodayPlan; onView: (v: PlayView) => void; onDone: () => void }) {
  const [st, setSt] = useState<PlayState | null>(null)
  const [part, setPart] = useState<'wall' | 'friend' | 'game' | null>(null)
  const set = useRef<Sets>({ wall: [], pairs: [], flips: [], onsets: [], onsetDemo: false, fresh: null, more: new Set(), friend: null })
  const s4 = useRef<Stage4Kv>({})
  const live = useRef(true)
  const state = useRef<PlayState | null>(null)
  const todayL = plan.seq[plan.idx]

  const save = (s: PlayState) => {
    state.current = s
    setSt(s)
    void savePlay(s)
  }

  /** 這種配對遊戲出了幾回合（翻翻卡是幾盤） */
  const roundsOf = (g: AbcGame | null) =>
    g === 'pair' ? set.current.pairs.length : g === 'flip' ? set.current.flips.length : g === 'onset' ? set.current.onsets.length : 0

  useEffect(() => {
    live.current = true
    void (async () => {
      const d = today()
      const learned = learnedLetters(plan.idx, plan.seq, true)
      const [old, variety, st4] = await Promise.all([loadPlay(), pickVariety<'pair' | 'flip'>('english.abc', ABC_GAMES).catch(() => 'pair' as const), loadStage4()])
      if (!live.current) return
      // 4 歲的門：該開就開、聽開頭該退一級就退（./stage4.ts 的 advance）
      const kv = advance(st4.kv, st4.attempts, d, st4.paused)
      s4.current = kv
      if (kv !== st4.kv) void saveStage4(kv)
      const more = moreSet(kv, st4.paused)
      const known = knownWords(st4.attempts)
      const match = canMatch(learned, more)
      const friend = canTeachNew(kv, d, st4.paused) ? pickNewWord(learned, known, more) : null
      const resuming = !!old && old.date === d && !!old.cur
      const sessionsToday = old && old.date === d ? old.sessions : 0
      const mode = onsetMode(kv['en-onset'])
      const wantOnset = match && !st4.paused && (resuming ? old?.cur?.game === 'onset' : onsetToday(kv, d, sessionsToday, !!friend, st4.paused))
      const onsets = wantOnset ? makeOnsets(known, mode) : []
      let s0 = startPlay(old, !resuming && onsets.length ? 'onset' : variety, match, d)
      // 接著玩聽開頭、但這次出不了題（家長暫停了、字不夠）：換成放進籃子
      if (s0.cur?.game === 'onset' && !onsets.length) s0 = { ...s0, cur: { ...s0.cur, game: 'pair', round: 0 } }
      // 今天新學的那一塊第一次放上牆（E5）：這一次播放上去的動畫，記下來以後不再播
      const fresh = isFresh(s0, todayL) && learned.includes(todayL) ? todayL : null
      const s = fresh ? { ...s0, placed: todayL } : s0
      const g = s.cur?.game ?? null
      const mature = !!g && (s.solo?.[g] ?? 0) >= MATURE_AT
      set.current = {
        wall: wallLetters(learned, todayL, dueOf),
        pairs: g === 'pair' ? makePairs(learned, todayL, mature, dueOf, Math.random, more) : [],
        flips: g === 'flip' ? makeFlips(learned, todayL, mature, dueOf, Math.random, more) : [],
        onsets: g === 'onset' ? onsets : [],
        // 第一次玩、退一級：第 1 回合先示範
        onsetDemo: mode !== 2,
        fresh,
        more,
        friend,
      }
      save(s)
      const wallDone = !!s.cur?.wall
      // 配對遊戲出不了題（理論上不會）：當作沒有配對遊戲
      const ok = roundsOf(g) > 0
      if (wallDone && friend) setPart('friend')
      else if (wallDone && ok) setPart('game')
      else setPart('wall')
    })()
    return () => {
      live.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const game = st?.cur?.game ?? null
  const hasGame = roundsOf(game) > 0
  const round = st?.cur?.round ?? 0
  const pairs = set.current.pairs
  const onsets = set.current.onsets
  const flips = set.current.flips
  const flipTotal = flips.reduce((n, b) => n + b.length / 2, 0)
  const flipBefore = flips.slice(0, Math.min(round, flips.length)).reduce((n, b) => n + b.length / 2, 0)
  const [matches, setMatches] = useState(0)

  // 上面的小石頭、陪玩小字跟著現在這一段
  useEffect(() => {
    if (!part || !st) return
    const g = hasGame ? game : null
    if (part === 'wall') onView({ part: 'wall', done: 0, total: 0, game: g })
    else if (part === 'friend') onView({ part: 'friend', done: 0, total: 0, w: set.current.friend?.w.w, game: g })
    else if (game === 'onset') onView({ part: 'onset', done: round, total: onsets.length, w: onsets[Math.min(round, onsets.length - 1)]?.w, game: 'onset' })
    else if (game === 'pair') onView({ part: 'pair', done: round, total: pairs.length, w: pairs[Math.min(round, pairs.length - 1)]?.w, game: 'pair' })
    else if (game === 'flip') onView({ part: 'flip', done: Math.max(matches, flipBefore), total: flipTotal, game: 'flip' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, st, matches])

  const finish = () => {
    const s = state.current
    if (!s || !live.current) return
    // 玩完一次聽開頭：記下來（第一次玩完以後不再是示範＋一起做；隔幾天才再玩）
    if (s.cur?.game === 'onset' && hasGame) {
      s4.current = afterOnset(s4.current, s.date)
      void saveStage4(s4.current)
    }
    save(endPlay(s))
    onView({ part: 'end', done: 0, total: 0, game: hasGame ? game : null })
    onDone()
  }

  /** 字母牆點夠了：出大箭頭，點了才到新朋友或配對遊戲（都沒有就玩完了） */
  const wallReady = async () => {
    if (!(await nextStep()) || !live.current) return
    const s = state.current
    if (!s?.cur) return
    save({ ...s, cur: { ...s.cur, wall: true } })
    if (set.current.friend) setPart('friend')
    else if (hasGame) setPart('game')
    else finish()
  }

  /** 新朋友念完：記下這個字母教到第 3 個字（今天不再教新的），出大箭頭，點了才到配對遊戲 */
  const friendReady = async () => {
    const f = set.current.friend
    const s = state.current
    if (f && s) {
      s4.current = afterNewWord(s4.current, f.L, s.date)
      void saveStage4(s4.current)
    }
    if (!(await nextStep()) || !live.current) return
    set.current.friend = null
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
        data-abc={part === 'wall' ? 'wall' : part === 'friend' ? 'friend' : game ?? 'wall'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.4 } }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
      >
        {part === 'wall' && <Wall letters={set.current.wall} fresh={set.current.fresh} more={set.current.more} onReady={() => void wallReady()} />}
        {part === 'friend' && set.current.friend && <NewWord pick={set.current.friend} onReady={() => void friendReady()} />}
        {part === 'game' && game === 'pair' && <Pair rounds={pairs} from={Math.min(round, PAIR_ROUNDS - 1, pairs.length - 1)} demo={demo && round === 0} onRound={roundDone} onDone={finish} />}
        {part === 'game' && game === 'onset' && (
          <Pair rounds={onsets} from={Math.min(round, onsets.length - 1)} demo={set.current.onsetDemo && round === 0} onRound={roundDone} onDone={finish} />
        )}
        {part === 'game' && game === 'flip' && (
          <Flip boards={flips} from={Math.min(round, flips.length - 1)} demo={demo && round === 0} onMatch={setMatches} onBoard={roundDone} onDone={finish} />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
