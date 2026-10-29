import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Emoji } from '../../art/Emoji'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef } from '../../content/games'
import { seqSkill, type Story } from '../../content/code'
import { markPlayed, plays, reportLevel } from '../../lib/adaptive'
import { planSequence, roundState } from '../pick'
import { logAttempt, logTeach } from '../../lib/record'
import type { Phase } from '../../lib/db'
import { hushSpeech, preload, say, sfx, stopSpeech } from '../../lib/audio'
import { shuffle } from '../../lib/random'
import { praiseKey, wait } from '../lines'
import { PACE, nextPause } from '../pace'
import { hit, useTapDrag } from './drag'
import { GhostView, GuideLoop, HandView, demoCarry, useCarry, useLadder, type Box } from './carry'
import { Dino, type Mood } from '../../art/Dino'
import { Swap, useSwapRef } from '../../ui/Scenes'
import { EASE, FADE } from '../../ui/motion'
import './code.css'
import './seq.css'

const ROUNDS = 4

/** 洗牌，而且不能剛好就是正確順序（也盡量不要和上一次一樣） */
function scramble(n: number, avoid?: number[]): number[] {
  const id = Array.from({ length: n }, (_, i) => i)
  let o = id
  for (let k = 0; k < 20; k++) {
    o = shuffle(id)
    const sorted = o.every((v, i) => v === i)
    const again = avoid && o.every((v, i) => v === avoid[i])
    if (!sorted && !again) break
  }
  return o
}

type Stage = 'demo' | Phase

/** 豆豆在故事小路上走一格多久（毫秒） */
const STEP_MS = 560

/** 豆豆站的位置：0 是小路起點（第一格左邊），i + 1 是第 i 格告示牌底下 */
const walkX = (at: number) => (at <= 0 ? 'calc(var(--lead) * 0.46)' : `calc(var(--lead) + ${at - 1} * (var(--s) + var(--g)) + var(--s) / 2)`)

/**
 * 排順序（PRD §10，3–4 歲的「順序」）：一個生活或大自然的小故事，圖片打亂，
 * 孩子依序把「先發生的、再來的」放進上面的空格，每放好一張就念那一張的旁白。
 *
 * 2026-10-29 重做（家長：「這我看不懂要玩啥」——字幕 What comes first?、兩個標 1、2 的虛線格，3 歲看不出空格是時間的先後）：
 * - 故事小路：空格是一條小路旁邊的告示牌，小路從左邊（豆豆站的地方）走到右邊（箭頭），路走過的地方會亮起來。
 *   豆豆只能走到故事排好的地方：每放對一張，豆豆就往前跳一格，站到那張圖底下；不靠數字 1、2 和小小的「>」。
 * - 新故事第一次出現：先把故事演一次（豆豆一格一格走，每走到一格，那張圖就跳出來、念旁白），
 *   接著圖卡「咻」一聲飛下來打亂、豆豆跑回起點，手再一張一張放回去（Watch me!）。
 * - 孩子排好之後故事播一次：豆豆跑回起點、從左走到右，走到哪一張，那張就亮起來、動一下、叮一聲，最後歡呼、箭頭亮起來。
 *   （示範時故事剛演過，手放完就直接收尾，不再從頭走一次）
 * - 一起練、自己答開始時：豆豆在起點跳一跳、第一格脈動（從這裡開始）。
 * - 點一下卡片就自己飛進下一格（3 歲拖不穩）；拖過去放也可以。
 * - 閒置（和找規律一樣的階梯）：5 秒下一格脈動得更明顯 → 10 秒豆豆把排好的故事走一次（還沒放的話就在起點跳一跳）、再問一次
 *   → 20 秒手再示範一次（半透明，拿下一張放進下一格、再拿回去）→ 35 秒下一張發光、手帶著做。
 * - 放錯：卡片放進去接不住、搖一搖彈回來，小路晃一下，下一格用力脈動；第二次錯（只剩兩張時第一次錯就是）手示範一次。
 * 只算第一次就答對（沒點錯、沒用到提示）。最後一張只剩一個選擇時自動放好，不做假的決定。
 */
export function SequenceGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [idx, setIdx] = useState(0)
  const [st, setSt] = useState<Story | null>(null)
  const [tray, setTray] = useState<number[]>([])
  const [placed, setPlaced] = useState<number[]>([])
  const [stage, setStage] = useState<Stage>('quiz')
  const [away, setAway] = useState<number | null>(null)
  const [nudge, setNudge] = useState<{ k: number; n: number } | null>(null)
  const [shake, setShake] = useState(0)
  const [pulse, setPulse] = useState<1 | 2>(1)
  const [hintOn, setHintOn] = useState(false)
  const [loopOff, setLoopOff] = useState(false)
  const [guideBox, setGuideBox] = useState<{ from: Box; to: Box } | null>(null)
  const [done, setDoneView] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  const [view, setView] = useState(0)
  /** 豆豆在故事小路上的位置和動作 */
  const [walker, setWalker] = useState<Walk>(WALK0)
  /** 故事播放中：豆豆站在底下、亮起來的那一張（-1 沒有） */
  const [lit, setLit] = useState(-1)
  /** 那一張動一下（n 每變一次動一次） */
  const [act, setAct] = useState<{ i: number; n: number } | null>(null)
  /** 故事播完了：排好的圖變成完成的樣子、最後一張冒星星、箭頭亮起來 */
  const [finale, setFinale] = useState(0)
  /** 新故事先演一次：圖卡一張一張從格子裡跳出來，下面的圖卡先藏起來 */
  const [preview, setPreview] = useState(false)
  const [hideTray, setHideTray] = useState(false)
  /** 演完之後圖卡從格子飛下來（打亂）：每一張從哪裡飛過來 */
  const [fly, setFly] = useState<{ n: number; d: Record<number, { x: number; y: number }> } | null>(null)

  const live = useRef(true)
  const locked = useRef(true)
  const busy = useRef(false)
  const stRef = useRef<Story | null>(null)
  const placedRef = useRef<number[]>([])
  const trayRef = useRef<number[]>([])
  const stageRef = useRef<Stage>('quiz')
  const stepRef = useRef(0)
  const idxRef = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const wrongs = useRef(0)
  /** 點錯的次數（一起練也算，記錄用；一起練點錯不會被放進去） */
  const misses = useRef(0)
  const hintUsed = useRef(false)
  /** 這一題答錯後手示範過（記錄用，相當於以前的重教） */
  const showed = useRef(false)
  const lv = useRef(1)
  const firstTries = useRef(0)
  const round = useRef({ ...roundState(plays(def.id) === 0), stories: [] as Story[] })
  /** 這一題剛走過示範或一起練：答對後多停一下再換題 */
  const taughtItem = useRef(false)
  const resolver = useRef<(() => void) | null>(null)
  const actN = useRef(0)
  const flyN = useRef(0)
  const walkAt = useRef(0)
  /** 閒置時豆豆正在把排好的故事走一次（孩子一動手就停） */
  const replaying = useRef(false)
  const replayTok = useRef(0)
  const demoTok = useRef(0)
  const demoOn = useRef(false)
  /** 閒置提示的手正在示範（畫面要知道：孩子可以直接從手上搶過卡片） */
  const [demoLive, setDemoLive] = useState(false)
  const setDemo = (v: boolean) => {
    demoOn.current = v
    setDemoLive(v)
  }
  const dragging = useRef<{ k: number; drop: boolean } | null>(null)

  // 換題時新舊兩塊會疊著一下子：ref 跟著新的那一塊，舊的卸載時不清掉
  const stripEl = useRef<HTMLDivElement | null>(null)
  const stripRef = useSwapRef(stripEl)
  const stage0 = useRef<HTMLDivElement>(null)
  const slotEls = useRef<HTMLElement[]>([])
  const cardEls = useRef<Record<number, HTMLElement>>({})
  const carry = useCarry<number>(stage0)
  const ladder = useLadder()

  const waitStep = () => new Promise<void>((res) => (resolver.current = res))
  const release = () => {
    const r = resolver.current
    resolver.current = null
    r?.()
  }

  /**
   * 開場、閒置 10 秒、點波波時說的那一句。
   * 1、2 級（兩步的故事）不問「What comes first?」（2026-10-29 家長同意）：抽象的時間問句加上英文問句，3 歲聽不懂，
   * 只說「Help Dodo!」，要做什麼交給畫面（豆豆在起點跳、第一格脈動、閒置時手示範）；first、then 留在放卡時的旁白裡教。
   * 3、4 級（三步以上）已經聽過很多次 First… Then…，才開始問「What comes first? / What comes next?」。
   */
  const question = () => ((stRef.current?.icons.length ?? 0) <= 2 ? 'c.seq.help' : placedRef.current.length === 0 ? 'c.seq.first' : 'c.seq.next')
  const cardBox = (k: number) => carry.box(cardEls.current[k])
  const nextSlotBox = () => carry.box(slotEls.current[placedRef.current.length])

  // ── 豆豆 ──────────────────────────────────────────────────
  /** 豆豆走到 at（0 起點、i + 1 第 i 格底下）：一格 per 毫秒，邊走邊跳；往回走會轉身、用跑的 */
  const walkTo = async (at: number, per = STEP_MS) => {
    const from = walkAt.current
    const steps = Math.abs(at - from)
    walkAt.current = at
    if (!steps) return
    const ms = Math.round(per * steps)
    const back = at < from
    setWalker((w) => ({ at, ms, back, hopN: w.hopN + 1, hops: per >= 300 ? steps * 2 : 0, dur: ms, mood: w.mood }))
    if (!ms) return
    await wait(ms)
    // 跑回去之後轉回來，面向故事的方向
    if (back && walkAt.current === at) setWalker((w) => ({ ...w, back: false }))
  }
  /** 豆豆在原地跳 times 下（「從這裡開始喔」） */
  const hopHere = (times = 2) => setWalker((w) => ({ ...w, ms: 0, hopN: w.hopN + 1, hops: times, dur: times * 380 }))
  const dodoMood = (m: Mood) => setWalker((w) => ({ ...w, mood: m }))

  /**
   * 故事播一次：豆豆跑回起點，再從左走到右；走到哪一張，那張就亮起來、動一下、叮一聲。
   * 走完：排好的圖變成完成的樣子、最後一張冒星星、箭頭亮起來，豆豆歡呼。
   */
  const playStory = async () => {
    const n = placedRef.current.length
    replayTok.current++
    replaying.current = false
    await walkTo(0, 130)
    await wait(140)
    for (let i = 0; i < n; i++) {
      if (!live.current) return
      await walkTo(i + 1)
      setLit(i)
      setAct({ i, n: ++actN.current })
      sfx.chime(i * 2)
    }
    await wait(260)
    if (!live.current) return
    setLit(-1)
    setFinale((f) => f + 1)
    dodoMood('cheer')
  }

  const setup = (s: Story, avoid?: number[]) => {
    stRef.current = s
    setSt(s)
    const o = scramble(s.icons.length, avoid)
    trayRef.current = o
    setTray(o)
    placedRef.current = []
    setPlaced([])
    setHintOn(false)
    setDoneView(false)
    setAway(null)
    setNudge(null)
    setPulse(1)
    setLit(-1)
    setAct(null)
    setFinale(0)
    setPreview(false)
    setHideTray(false)
    setFly(null)
    walkAt.current = 0
    replaying.current = false
    setWalker(WALK0)
    setView((v) => v + 1)
    cardEls.current = {}
    taps.current = []
    wrongs.current = 0
    misses.current = 0
    hintUsed.current = false
    showed.current = false
    return o
  }

  const base = (s: Story) => ({
    station: def.station,
    game: def.id,
    itemId: s.id,
    skill: seqSkill(s),
    level: lv.current,
    options: trayRef.current.map((i) => s.icons[i]),
    answer: s.icons.join(','),
  })

  /** 把第 k 張（故事裡的順序）放進下一格：豆豆往前跳到那張底下，念它的旁白 */
  const put = (s: Story, k: number, talk = true) => {
    const p = [...placedRef.current, k]
    placedRef.current = p
    setPlaced(p)
    trayRef.current = trayRef.current.filter((x) => x !== k)
    setAway(null)
    setPulse(1)
    sfx.clack()
    void walkTo(p.length)
    return talk ? say(`c.seq.${s.id}.${k}`) : Promise.resolve()
  }

  /** 閒置 10 秒：豆豆把排好的故事走一次、停在下一格前面，下一格用力脈動；還沒放的話就在起點跳一跳 */
  const replay = async () => {
    const r = ++replayTok.current
    const ok = () => live.current && replayTok.current === r
    const n = placedRef.current.length
    if (!n) {
      hopHere(2)
      await wait(800)
      if (ok()) setPulse(2)
      return
    }
    replaying.current = true
    await walkTo(0, 130)
    for (let i = 0; i < n; i++) {
      if (!ok()) return
      await walkTo(i + 1)
      if (!ok()) return
      setLit(i)
      setAct({ i, n: ++actN.current })
      sfx.chime(i * 2)
    }
    await wait(300)
    if (!ok()) return
    replaying.current = false
    setLit(-1)
    setPulse(2)
  }

  const cancelDemo = () => {
    if (!demoOn.current) return
    setDemo(false)
    demoTok.current++
    carry.clear()
    setAway(null)
    setLoopOff(false)
  }

  /** 閒置或答錯後：半透明的手把下一張拿到下一格、停一下、再拿回去（不替孩子作答） */
  const hintDemo = async () => {
    const s = stRef.current
    const k = placedRef.current.length
    const from = cardBox(k)
    const to = nextSlotBox()
    if (!s || !from || !to) return
    hintUsed.current = true
    const d = ++demoTok.current
    setDemo(true)
    setLoopOff(true)
    await demoCarry(carry, k, from, to, {
      alive: () => live.current && demoTok.current === d,
      keep: false,
      faint: true,
      onLift: () => setAway(k),
      onBack: () => setAway(null),
    })
    if (demoTok.current !== d) return
    setDemo(false)
    setLoopOff(false)
  }

  /** 每放好一張（或剛出題）：閒置提示從頭計時（和找規律同一套階梯） */
  const startLadder = (my: number) => {
    let asked = false
    ladder.start([
      // 5 秒：下一格脈動得更明顯
      { at: 5000, run: () => setPulse(2) },
      // 10 秒：豆豆把排好的故事走一次（還沒放就在起點跳一跳），再問一次（整題只再問這一次）
      {
        at: 10_000,
        run: () =>
          void replay().then(() => {
            if (!asked && live.current && stepRef.current === my) {
              asked = true
              void say(question())
            }
          }),
      },
      // 20 秒：手再示範一次（半透明，拿下一張放進下一格、再拿回去）
      { at: 20_000, run: () => void hintDemo() },
      // 35 秒：下一張發光、手帶著做
      {
        at: 35_000,
        run: () => {
          if (stageRef.current === 'guided') return
          hintUsed.current = true
          setHintOn(true)
        },
      },
    ])
  }

  // ── 新故事先演一次：豆豆一格一格走，圖一張一張跳出來、念旁白；演完圖卡飛下來打亂、豆豆跑回起點 ──
  const tell = async (s: Story, ok: () => boolean) => {
    for (let k = 0; k < s.icons.length; k++) {
      if (!ok()) return false
      await walkTo(k + 1, k === 0 ? 480 : STEP_MS)
      if (!ok()) return false
      const p = [...placedRef.current, k]
      placedRef.current = p
      setPlaced(p)
      sfx.pop()
      await Promise.all([say(`c.seq.${s.id}.${k}`), wait(760)])
    }
    if (!ok()) return false
    dodoMood('cheer')
    await wait(650)
    if (!ok()) return false
    // 打亂：每一張從它的格子飛到下面（還藏著的）位子上，豆豆跑回起點
    const d: Record<number, { x: number; y: number }> = {}
    for (let k = 0; k < s.icons.length; k++) {
      const a = carry.box(slotEls.current[k])
      const b = cardBox(k)
      if (a && b) d[k] = { x: a.x - b.x, y: a.y - b.y }
    }
    placedRef.current = []
    setPlaced([])
    setPreview(false)
    setHideTray(false)
    setFly({ n: ++flyN.current, d })
    dodoMood('happy')
    sfx.whoosh()
    void walkTo(0, 150)
    await wait(950)
    return ok()
  }

  // ── 我示範：先演故事，再用手一張一張放回空格 ─────────────────────
  const demo = async (s: Story, intro: boolean) => {
    const my = ++stepRef.current
    const ok = () => live.current && stepRef.current === my
    stageRef.current = 'demo'
    setStage('demo')
    locked.current = true
    setMood('happy')
    setup(s)
    // 先演故事：下面的圖卡先藏起來，格子不脈動（還不是孩子要動手的時候）
    setHideTray(true)
    setPreview(true)
    const start = performance.now()
    await Promise.all([intro ? say(def.intro) : Promise.resolve(), wait(600)])
    if (!ok() || !(await tell(s, ok))) return
    void say('teach.watch.bobo')
    await wait(350)
    for (let k = 0; k < s.icons.length; k++) {
      if (!ok()) return
      const from = cardBox(k)
      const to = nextSlotBox()
      if (!from || !to) break
      await demoCarry(carry, k, from, to, {
        alive: ok,
        keep: true,
        onLift: () => setAway(k),
        onLand: () => void put(s, k, false),
      })
      await wait(250)
    }
    if (!ok()) return
    // 故事剛剛已經演過一次：手放完、豆豆走到最後一格，直接收尾（變成完成的樣子、箭頭亮、星星），不再從頭走一次
    setDoneView(true)
    await wait(300)
    setFinale((f) => f + 1)
    dodoMood('cheer')
    setMood('cheer')
    sfx.correct()
    await wait(PACE.DEMO_HOLD)
    void logTeach({ station: def.station, game: def.id, itemId: s.id, skill: seqSkill(s), level: lv.current, ms: Math.round(performance.now() - start), retaught: false })
  }

  /** 一起練或自己答：同一個故事、重新洗牌 */
  const ask = async (s: Story, ph: Phase, o: { afterGuide?: boolean; intro?: boolean; avoid?: number[] } = {}) => {
    const my = ++stepRef.current
    stageRef.current = ph
    setStage(ph)
    const order = setup(s, o.avoid)
    setMood(ph === 'guided' ? 'happy' : 'idle')
    setLoopOff(false)
    locked.current = true
    await wait(320)
    if (!live.current || stepRef.current !== my) return order
    locked.current = false
    t0.current = performance.now()
    const finished = waitStep()
    // 豆豆在起點跳一跳：故事從這裡開始，第一格在脈動
    window.setTimeout(() => {
      if (live.current && stepRef.current === my && placedRef.current.length === 0) hopHere(2)
    }, 380)
    void (async () => {
      await say(...(o.intro ? [def.intro] : []), ...(o.afterGuide ? ['teach.turn.bobo'] : []), question(), ...(ph === 'guided' ? ['teach.here.bobo'] : []))
      if (live.current && stepRef.current === my) startLadder(my)
    })()
    await finished
    return order
  }

  const present = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    // 這題排哪個故事、要不要先教（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份）
    const { s, lv: l, fresh, walk } = planSequence(def, round.current, i)
    lv.current = l
    preload([...s.lines.map((_, k) => `c.seq.${s.id}.${k}`), ...(s.icons.length <= 2 ? ['c.seq.help'] : ['c.seq.first', 'c.seq.next']), 'teach.here.bobo', 'teach.turn.bobo', 'teach.watch.bobo'])
    let intro = i === 0
    if (fresh) {
      await demo(s, intro)
      intro = false
      if (!live.current) return
    }
    taughtItem.current = fresh || walk
    if (fresh || walk) {
      // 一起練答對後的停頓在 GUIDED_TO_QUIZ（finish 裡），這裡不用再等
      const g = await ask(s, 'guided', { intro })
      if (!live.current) return
      return ask(s, 'quiz', { afterGuide: true, avoid: g })
    }
    return ask(s, 'quiz', { intro })
  }

  /** 答對到下一題：剛教的新內容多停一下，複習題維持輕快 */
  const next = async (ms = nextPause(taughtItem.current)) => {
    await wait(ms)
    if (!live.current) return
    const n = idxRef.current + 1
    if (n >= ROUNDS) return onDone({ items: ROUNDS, firstTry: firstTries.current })
    present(n)
  }

  useEffect(() => {
    live.current = true
    const boot = window.setTimeout(() => {
      markPlayed(def.id)
      // 開場說明和第一題一起出現（不先讓孩子看空的舞台）
      if (live.current) present(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      ladder.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 一起練、最後一階提示的手：量好下一張卡和下一格（換題、放好一張之後重量）
  const guideOn = (stage === 'guided' || hintOn) && !done
  useLayoutEffect(() => {
    if (!guideOn || !st) return setGuideBox(null)
    const t = window.setTimeout(() => {
      const from = cardBox(placedRef.current.length)
      const to = nextSlotBox()
      setGuideBox(from && to ? { from, to } : null)
    }, 380)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideOn, st, view, placed])

  // ── 孩子的操作 ─────────────────────────────────────────────
  const touched = () => {
    ladder.poke()
    cancelDemo()
    replayTok.current++
    setLit(-1)
    // 豆豆正在把故事走一次：馬上回到故事排到的地方
    if (replaying.current) {
      replaying.current = false
      void walkTo(placedRef.current.length, 0)
    }
  }

  /** 卡片已經在下一格上了：對就放好，不對就彈回去 */
  const judge = async (k: number) => {
    const s = stRef.current!
    const my = stepRef.current
    const ok = () => live.current && stepRef.current === my
    const want = placedRef.current.length
    taps.current.push({ pick: s.icons[k], ms: Math.round(performance.now() - t0.current) })
    if (k === want) {
      locked.current = true
      stepRef.current++
      ladder.stop()
      carry.drop()
      setHintOn(false)
      busy.current = false
      await put(s, k)
      if (!live.current) return
      // 只剩一張：不用選，自動飛進去
      if (trayRef.current.length === 1) {
        const last = trayRef.current[0]
        const from = cardBox(last)
        const to = nextSlotBox()
        await wait(200)
        if (from && to) {
          carry.lift(last, from)
          setAway(last)
          await carry.glide(to, 420)
          carry.drop()
        }
        await put(s, last)
        if (!live.current) return
      }
      if (trayRef.current.length === 0) return finish(s)
      locked.current = false
      const step = stepRef.current
      await say(question())
      if (live.current && stepRef.current === step) startLadder(step)
      return
    }

    // 放錯了：接不住、搖一搖彈回去，小路晃一下
    misses.current++
    hushSpeech()
    sfx.boing()
    carry.wobble()
    setShake((x) => x + 1)
    await wait(560)
    if (!ok()) return
    const home = cardBox(k)
    if (home) await carry.glide(home, 460, false)
    carry.drop()
    setAway(null)
    busy.current = false
    setNudge({ k, n: Date.now() })
    setPulse(2)
    if (!ok() || stageRef.current === 'guided') return
    wrongs.current++
    // 第二次錯（只剩兩張時第一次錯就是）：手示範一次，下一張發光（盤點 8-3）
    if (wrongs.current >= 2 || trayRef.current.length <= 2) {
      showed.current = true
      await wait(300)
      await hintDemo()
      if (!ok()) return
      hintUsed.current = true
      setHintOn(true)
    }
    ladder.poke()
  }

  /** 點一下：卡片自己飛進下一格 */
  const choose = async (k: number) => {
    if (!stRef.current || locked.current || busy.current) return
    touched()
    const from = cardBox(k)
    const to = nextSlotBox()
    if (!from || !to) return
    busy.current = true
    sfx.tap()
    carry.lift(k, from)
    setAway(k)
    await carry.glide(to, 440)
    if (live.current) void judge(k)
  }

  /** 閒置提示的手拿著卡片時，孩子直接點它：從手上搶過來、飛進下一格 */
  const grabDemo = async () => {
    const k = carry.holding()
    const to = nextSlotBox()
    if (!demoOn.current || locked.current || busy.current || k === null || !to) return
    ladder.poke()
    replayTok.current++
    setDemo(false)
    demoTok.current++
    busy.current = true
    setLoopOff(true)
    carry.handOff()
    sfx.tap()
    await carry.glide(to, 300)
    setLoopOff(false)
    if (live.current) void judge(k)
  }

  const goHome = async (k: number) => {
    const home = cardBox(k)
    if (home) await carry.glide(home, 320, false)
    carry.drop()
    setAway(null)
    dragging.current = null
    busy.current = false
  }

  const drag = useTapDrag<number>({
    enabled: () => !locked.current && (!busy.current || !!dragging.current),
    onPoke: () => touched(),
    onTap: (k) => void choose(k),
    // 拖到上面的小路放開＝放進下一格；拖到別的地方就放回去
    onDrop: async (k, x, y) => {
      const d = dragging.current
      if (!d || d.k !== k) return
      d.drop = true
      const to = nextSlotBox()
      if (to && hit(stripEl.current, x, y, 30)) {
        await carry.glide(to, 160)
        dragging.current = null
        if (live.current) void judge(k)
        return
      }
      void goHome(k)
    },
  })

  useEffect(() => {
    const g = drag.ghost
    const d = dragging.current
    if (!g) {
      if (d && !d.drop) void goHome(d.k)
      return
    }
    if (!d) {
      if (busy.current) return
      const from = cardBox(g.item)
      if (!from) return
      busy.current = true
      dragging.current = { k: g.item, drop: false }
      carry.lift(g.item, from)
      setAway(g.item)
    } else if (d.k !== g.item) return
    const p = carry.point(g.x, g.y)
    if (p) carry.follow(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.ghost])

  const finish = async (s: Story) => {
    setDoneView(true)
    setMood('cheer')
    sfx.correct()
    const ph = stageRef.current as Phase
    const firstTry = misses.current === 0 && !hintUsed.current
    void logAttempt({
      ...base(s),
      phase: ph,
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: 1 + wrongs.current,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: ph === 'guided' || hintUsed.current,
      metrics: { steps: s.icons.length, wrongTaps: wrongs.current, ...(showed.current ? { retaught: 1 } : {}) },
    })
    // 稱讚和「故事播一次」同時：豆豆從頭走一次孩子排好的故事
    const story = wait(250).then(playStory)
    if (ph === 'guided') {
      await Promise.all([say(praiseKey('bobo')), story])
      // 排好的故事和答對的動畫停留一下，才換「Your turn!」
      await wait(PACE.GUIDED_TO_QUIZ)
      return release()
    }
    if (firstTry) firstTries.current++
    const change = reportLevel(def.id, firstTry, def.maxLevel, { skill: seqSkill(s) })
    await Promise.all([say(praiseKey('bobo'), ...(change === 'up' ? ['levelup'] : [])), story])
    release()
    next()
  }

  /** 點小路：豆豆把排好的故事走一次、下一格脈動（放不進去的地方點了也有反應） */
  const onStrip = () => {
    if (locked.current || busy.current) return
    touched()
    void replay()
  }

  const onHost = () => {
    if (locked.current || !st) return
    touched()
    void say(question(), ...(stage === 'guided' ? ['teach.here.bobo'] : []))
  }

  const want = placed.length
  const lead = stage === 'guided' || hintOn
  const n = st?.icons.length ?? 2
  // 只剩最後一張時它會自己飛進去，不用再帶
  const showLoop = lead && !!guideBox && !loopOff && !done && !busy.current && want < n - 1

  return (
    <Shell station={def.station} mood={mood} progress={{ total: ROUNDS, done: idx }} onExit={onExit} onHost={onHost}>
      <div ref={stage0} className="seq-stage" style={{ '--n': n } as CSSProperties}>
        {st && (
          <Swap id={view} className="seq">
            {(quiet) => (
              <>
                {/* 故事小路：從豆豆站的地方往右走到箭頭，路邊一個個告示牌就是空格 */}
                <div ref={stripRef} className="sq-road" onPointerDown={onStrip}>
                  <div className="sq-ribbon" aria-hidden="true">
                    {/* 故事播完：整條路一路亮到箭頭 */}
                    <span className="sq-lit" style={finale ? { width: '100%', transitionDuration: '520ms' } : { width: walkX(walker.at), transitionDuration: `${walker.ms}ms` }} />
                  </div>
                  <motion.svg
                    key={`arrow-${finale}`}
                    className={`sq-arrow${finale ? ' is-lit' : ''}`}
                    viewBox="0 0 60 80"
                    aria-hidden="true"
                    animate={finale ? { scale: [1, 1.28, 1], x: [0, 8, 0] } : {}}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  >
                    <path d="M8 8 L54 40 L8 72 Q2 40 8 8 Z" />
                  </motion.svg>
                  <motion.div
                    key={`signs-${shake}`}
                    className="sq-signs"
                    animate={shake ? { x: [0, -10, 9, -5, 0] } : {}}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  >
                    {st.icons.map((_, i) => {
                      const k = placed[i]
                      const next = i === placed.length && !done && !preview
                      return (
                        <div key={i} className="sq-sign" style={{ '--i': i } as CSSProperties}>
                          <span className={`sq-post${walker.at > i ? ' is-past' : ''}`} aria-hidden="true" />
                          <div
                            ref={(el) => {
                              if (el) slotEls.current[i] = el
                            }}
                            className={`seq-slot${k !== undefined ? ' is-full' : ''}${next ? ` is-next pulse-${pulse}` : ''}`}
                          >
                            {k !== undefined && (
                              <SlotCard
                                icon={st.icons[k]}
                                first={i === 0}
                                pop={preview}
                                act={act?.i === i ? act.n : 0}
                                lit={lit === i}
                                done={finale > 0}
                                burst={finale > 0 && i === st.icons.length - 1 ? finale : 0}
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </motion.div>
                  <Walker w={walker} />
                </div>

                {/* 打亂的圖：位置固定，放上去的那一張留下空位（不會一放就整排擠過去） */}
                <div className="seq-tray">
                  {tray.map((k, j) => {
                    const used = placed.includes(k)
                    const glow = !used && k === want && lead
                    const dim = stage === 'guided' && !used && k !== want
                    const nudged = nudge?.k === k
                    const from = fly?.d[k]
                    return (
                      <div key={k} className="seq-spot">
                        <motion.button
                          key={`${k}-${fly?.n ?? 0}`}
                          ref={(el: HTMLButtonElement | null) => {
                            if (el) cardEls.current[k] = el
                          }}
                          className={`seq-card${glow ? ' guide' : ''}${dim ? ' dim' : ''}${used || hideTray || away === k ? ' is-away' : ''}`}
                          aria-label={`圖 ${j + 1}`}
                          data-k={k}
                          initial={from ? { x: from.x, y: from.y, scale: 1.04 } : quiet ? false : { y: 28, scale: 0.94 }}
                          animate={nudged ? { x: [0, -12, 12, -7, 0], y: 0, opacity: 1, scale: 1 } : { x: 0, y: 0, opacity: dim ? 0.38 : 1, scale: dim ? 0.9 : 1 }}
                          whileTap={{ scale: 0.94 }}
                          transition={
                            from && !nudged
                              ? { type: 'spring', stiffness: 150, damping: 18, delay: 0.1 * j, opacity: FADE }
                              : { type: 'spring', stiffness: 360, damping: 22, delay: nudged ? 0 : 0.06 * j, opacity: FADE }
                          }
                          {...drag.bind(k)}
                        >
                          <div className="tile-in">
                            <Emoji name={st.icons[k]} />
                          </div>
                        </motion.button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Swap>
        )}
        {showLoop && guideBox && <GuideLoop key={`${view}-${want}`} from={guideBox.from} to={guideBox.to} />}
        <GhostView
          ghost={carry.ghost}
          className="seq-ghost"
          render={(k) =>
            st && (
              <div className="seq-card">
                <div className="tile-in">
                  <Emoji name={st.icons[k]} />
                </div>
              </div>
            )
          }
          onGrab={demoLive && stage !== 'demo' ? () => void grabDemo() : undefined}
        />
        <HandView hand={carry.hand} />
        {/* 給自動測試看現在是哪一段（畫面上看不到） */}
        <span hidden data-stage={stage} data-story={st?.id} data-order={st ? st.icons.join(',') : undefined} />
      </div>
    </Shell>
  )
}

/** 豆豆在小路上的狀態：at 站在哪裡、ms 走過去多久、back 往回跑（轉身）、hopN 每變一次就跳 hops 下（dur 毫秒內跳完） */
interface Walk {
  at: number
  ms: number
  back: boolean
  hopN: number
  hops: number
  dur: number
  mood: Mood
}
const WALK0: Walk = { at: 0, ms: 0, back: false, hopN: 0, hops: 0, dur: 0, mood: 'happy' }

/** 故事小路上的豆豆：left 用 CSS 轉場走過去，邊走邊跳 */
function Walker({ w }: { w: Walk }) {
  const ys = w.hops ? ['0%', ...Array.from({ length: w.hops }, () => ['-22%', '0%']).flat()] : undefined
  return (
    <div className="sq-dodo" style={{ left: walkX(w.at), transitionDuration: `${w.ms}ms` }} aria-hidden="true">
      <motion.div key={w.hopN} className="sq-dodo-hop" animate={ys ? { y: ys } : {}} transition={{ duration: w.dur / 1000, ease: 'easeInOut' }}>
        <div className={`sq-dodo-face${w.back ? ' is-back' : ''}`}>
          <Dino who="dodo" mood={w.mood} size="100%" />
        </div>
      </motion.div>
    </div>
  )
}

/**
 * 格子裡的圖：
 * - pop：新故事演一次時，從格子裡跳出來（後面幾張還會冒星星，「然後變成…」）
 * - act：故事播放時豆豆走到這一張，第一張搖一搖（蛋在動、雲在下雨），後面的跳一下
 * - lit：豆豆正站在底下；done：故事播完，變成完成的樣子；burst：最後一張冒星星
 */
function SlotCard({ icon, first, pop, act, lit, done, burst }: { icon: string; first: boolean; pop: boolean; act: number; lit: boolean; done: boolean; burst: number }) {
  return (
    <motion.div
      className="seq-hop"
      initial={pop ? { scale: 0.2, y: '30%', rotate: -8 } : false}
      animate={{ scale: 1, y: '0%', rotate: 0 }}
      transition={{ type: 'spring', stiffness: 330, damping: 15 }}
    >
      <motion.div
        key={act}
        className="sq-act"
        animate={act ? (first ? { rotate: [0, -9, 8, -6, 4, 0], y: ['0%', '-6%', '0%'] } : { y: ['0%', '-16%', '0%'], scale: [1, 1.12, 1] }) : {}}
        transition={{ duration: first ? 0.55 : 0.42, ease: EASE.out }}
      >
        <div className={`seq-card in-slot${lit ? ' is-lit' : ''}${done ? ' is-done' : ''}`}>
          <div className="tile-in">
            <Emoji name={icon} />
          </div>
          {pop && !first && <Sparkles count={10} />}
          {burst > 0 && <Sparkles key={burst} count={14} />}
        </div>
      </motion.div>
    </motion.div>
  )
}
