import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from './Shell'
import { TeachCard } from './Teach'
import { Hand } from './Demo'
import { WaitShield, firstFinger } from './NotYet'
import { CueArt, VisualView } from '../ui/Visual'
import { Sparkles } from '../ui/Sparkles'
import { game as gameDef, station as stationDef, ROUND_ITEMS, type ChoiceItem, type TeachSpec } from '../content/games'
import { level, reportLevel, markPlayed, plays, mastered, skill, hintDelayMs, noteHintWait } from '../lib/adaptive'
import { planChoice, roundState } from './pick'
import { logAttempt, logTeach } from '../lib/record'
import { getKV, setKV, type Phase } from '../lib/db'
import { WAIT_WINDOW_MS } from '../lib/engine'
import { canTease, teaseKey } from '../content/lines-engine'
import { cueHint } from '../content/coplay'
import { FluencyGame, isFluency } from './FluencyGame'
import { FLUENCY_FALLBACK, fluencyTargets } from '../lib/fluency'
import { preload, say, sfx, stopSpeech } from '../lib/audio'
import { pick, shuffle } from '../lib/random'
import { challengeKey, praiseKey, retryKey, wait } from './lines'
import { useIdle } from './idle'
import { PACE, nextPause } from './pace'
import type { Mood } from '../art/Dino'
import { CardStage, Swap } from '../ui/Scenes'
import { REVEAL_MS } from '../ui/motion'
import { FADE } from '../ui/motion'
import './engine.css'

/** soft：延遲提示的淡淡一圈光；tease：Sam 教豆豆時，恐龍故意指錯的那一個 */
type Mark = 'wrong' | 'correct' | 'hint' | 'soft' | 'tease'

/** Sam 教豆豆：一局最多 1 次，而且只有約三成的局會出現（頻率要低） */
const PROTEGE_CHANCE = 0.3

/**
 * 比較題的題目徽章教過了沒（kv，家長重置學習進度時會一起清掉）。
 * 徽章是 2026-10-28 才加的：已經學過「比多少」的孩子第一次看到徽章時，也先上一次教學卡，教過才考。
 */
const CUE_KEY = 'cues:seen'

/** 這一題的特殊身分 */
interface QuizOpts {
  /** 剛一起練完的自己答 */
  afterGuide?: boolean
  /** 程度校準的探測題：用比較難的題型考學過的內容（pick.ts 保證是學過的） */
  probe?: boolean
  /** Sam 教豆豆：恐龍故意指著這個錯的選項 */
  decoy?: string
}

/** 一起練之後的自己答：重新洗牌，而且答案不要留在同一格（不然只是記位置） */
function reshuffle(it: ChoiceItem): ChoiceItem {
  if (it.options.length < 2) return it
  const at = it.options.findIndex((o) => o.id === it.answer)
  let opts = it.options
  for (let k = 0; k < 12; k++) {
    opts = shuffle(it.options)
    if (opts.findIndex((o) => o.id === it.answer) !== at) break
  }
  return { ...it, options: opts }
}

/**
 * 選擇題引擎：每一題都可能是「先教 → 一起練 → 自己答」。
 * - 新內容（從沒自己答過）：教學卡 → 一起練（答案發光、其他變淡、點錯不扣分）→ 自己答。
 * - 自己答時同一題錯兩次：重播精簡的教學卡，再一起練一次。
 * - 已經學過的：直接自己答（複習）。
 * 熟練度與難度只採計「自己答」。
 */
export function ChoiceGame(props: GameProps) {
  // 功文式小練習也是選擇題（kind: 'choice'），由它自己的元件負責。
  // 還沒有學過的數字題（例如第一天就從地圖點進數字快答）：改玩找數字，先教再考
  // 進來的那一刻決定（玩到一半學會了也不換遊戲）
  const [fallback] = useState(() => isFluency(props.gameId) && !fluencyTargets().length)
  if (fallback) return <ChoiceRound {...props} gameId={FLUENCY_FALLBACK} />
  return isFluency(props.gameId) ? <FluencyGame {...props} /> : <ChoiceRound {...props} />
}

/**
 * 第二批（學習引擎）在原本的流程上加了：
 * - 開局第一題出已熟的內容，先答對、建立信心。
 * - 程度校準：前 2–3 題是探測題，用比較難的題型考「學過的」內容（不教不考，placement.ts）。
 * - 延遲提示：學習中（0–2 格）的題目，唸完題目幾秒後正確答案才淡淡亮起。
 * - Sam 教豆豆：已熟的內容偶爾由恐龍故意指錯，孩子點正確的來糾正。
 */
function ChoiceRound({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const host = stationDef(def.station).host
  const english = def.station === 'english'

  const [idx, setIdx] = useState(0)
  const [item, setItem] = useState<ChoiceItem | null>(null)
  const [phase, setPhase] = useState<Phase>('quiz')
  const [card, setCard] = useState<{ spec: TeachSpec; short: boolean; n: number } | null>(null)
  const [view, setView] = useState(0)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [mood, setMood] = useState<Mood>('idle')
  const [burst, setBurst] = useState(0)
  /** 題目徽章重演一次（波波念題目、孩子點徽章的時候） */
  const [cuePing, setCuePing] = useState(0)
  /** 比較題的陪玩提示：跟著當題問的（多／少、大／小）換；句型一局固定 */
  const [hintVariant] = useState(() => Math.floor(Math.random() * 2))
  const [hintText, setHintText] = useState<string | undefined>(undefined)
  /**
   * 現在收不收作答（準則 PHASE-2、PHASE-3）：教學卡收起中、題目還在念的時候不收，
   * 選項上面蓋一層透明擋板，點了只出現「看這裡」的圈圈、不算作答（三歲模擬測試 B08、V-12）。念到最後一個字才打開。
   */
  const [accepting, setAccepting] = useState(false)
  /** 閒置第二段「手再示範一次」：手在答案上點一下（每次加一，再點一次） */
  const [handTap, setHandTap] = useState(0)

  const live = useRef(true)
  const locked = useRef(true)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const shownAt = useRef(0)
  const hintUsed = useRef(false)
  const firstTries = useRef(0)
  const idle = useIdle()
  const itemLevel = useRef(1)
  const idxRef = useRef(0)
  const itemRef = useRef<ChoiceItem | null>(null)
  const phaseRef = useRef<Phase>('quiz')
  /** 每換一個步驟就加一，舊步驟的計時器看到不一樣就不動作 */
  const stepRef = useRef(0)
  // 必須在 markPlayed 之前讀：第一次玩的遊戲，第一題一定先一起練一次
  const round = useRef(roundState(plays(def.id) === 0))
  /** 這一題剛走過教學卡或一起練：答對後多停一下再換題 */
  const taughtItem = useRef(false)
  /** 這一題是探測題 */
  const probeRef = useRef(false)
  /** Sam 教豆豆：恐龍指著的錯誤選項 */
  const decoyRef = useRef<string | null>(null)
  const protegeRound = useRef(Math.random() < PROTEGE_CHANCE)
  const protegeUsed = useRef(false)
  /** 延遲提示：這題有沒有延遲提示、光是什麼時候亮的 */
  const delayRef = useRef<{ ms: number; glowAt: number | null } | null>(null)
  const resolver = useRef<((ms: number) => void) | null>(null)
  /** 教學卡還蓋在題目上：一起練把題目換好之後才收起來（ui/Scenes.tsx 的 CardStage） */
  const cardUp = useRef(false)

  const waitStep = () => new Promise<number>((res) => (resolver.current = res))
  const release = (ms = 0) => {
    const r = resolver.current
    resolver.current = null
    r?.(ms)
  }

  const base = (it: ChoiceItem) => ({
    station: def.station,
    game: def.id,
    itemId: it.itemId,
    skill: it.skill,
    level: itemLevel.current,
    options: it.options.map((o) => o.id),
    answer: it.answer,
  })

  // ── 我示範：教學卡 ─────────────────────────────────────────
  const teach = async (it: ChoiceItem, short: boolean) => {
    stepRef.current++
    idle.stop()
    locked.current = true
    setAccepting(false)
    setMood('happy')
    cardUp.current = true
    setCard({ spec: it.teach!, short, n: stepRef.current })
    const ms = await waitStep()
    if (!live.current) return
    if (it.cue && it.teach?.cue) {
      const seen = await getKV<string[]>(CUE_KEY, [])
      if (!seen.includes(it.cue.cue)) void setKV(CUE_KEY, [...seen, it.cue.cue])
    }
    // 卡片先不收：一起練把題目換好的同一刻才收（收回恐龍時直接看到新題目，不會先閃回上一題或一片空白）
    void logTeach({ station: def.station, game: def.id, itemId: it.itemId, skill: it.skill, level: itemLevel.current, ms, retaught: short })
  }

  /** 教學卡收回主持的恐龍、題目拉遠回來；停頓和以前一樣（TEACH_TO_GUIDED），只是收卡的動畫也算在裡面 */
  const reveal = async () => {
    if (!cardUp.current) return
    cardUp.current = false
    setCard(null)
    await wait(Math.max(PACE.TEACH_TO_GUIDED, REVEAL_MS))
  }

  // ── 一起練：答案發光，點錯也沒關係 ─────────────────────────
  const guided = async (it: ChoiceItem) => {
    const my = ++stepRef.current
    phaseRef.current = 'guided'
    itemRef.current = it
    taps.current = []
    setPhase('guided')
    setItem(it)
    setMarks({})
    setHandTap(0)
    setAccepting(false)
    setMood('happy')
    setView((v) => v + 1)
    await reveal()
    if (!live.current || stepRef.current !== my) return
    const done = waitStep()
    setCuePing((c) => c + 1)
    // 「Here it is! Tap it!」念完才收作答：卡片收起、念題目的時候亂點不會被算成一起練（B08）
    await say(...it.prompt, `teach.here.${host}`)
    if (!live.current || stepRef.current !== my) return
    shownAt.current = performance.now()
    locked.current = false
    setAccepting(true)
    // 一起練的答案本來就在發光、手在指著，第二段提醒是手在答案上再點一下
    idle.start({
      repeat: () => {
        setCuePing((c) => c + 1)
        void say(...it.prompt, `teach.here.${host}`)
      },
      hint: () => setHandTap((n) => n + 1),
    })
    await done
  }

  // ── 自己答 ─────────────────────────────────────────────────
  const quiz = async (it: ChoiceItem, o: QuizOpts = {}) => {
    const my = ++stepRef.current
    const i = idxRef.current
    const isLast = i === ROUND_ITEMS - 1
    idle.stop()
    phaseRef.current = 'quiz'
    itemRef.current = it
    taps.current = []
    hintUsed.current = false
    probeRef.current = !!o.probe
    decoyRef.current = o.decoy ?? null
    // 延遲提示只給學習中（0–2 格）的題目；已熟的、探測題、教豆豆都不給
    delayRef.current = !o.probe && !o.decoy && skill(it.skill).box <= 2 ? { ms: hintDelayMs(), glowAt: null } : null
    setPhase('quiz')
    setItem(it)
    setMarks(o.decoy ? { [o.decoy]: 'tease' } : {})
    setHandTap(0)
    setAccepting(false)
    setMood(o.decoy ? 'peek' : 'idle')
    setView((v) => v + 1)
    await reveal()
    if (!live.current || stepRef.current !== my) return
    const challenge = isLast && itemLevel.current > level(def.id)
    const ask = o.decoy ? [teaseKey(it.skill)] : it.prompt
    if (!o.decoy) setCuePing((c) => c + 1)
    if (o.decoy) await say(`tease.try.${host}`, ...ask)
    else if (o.afterGuide) await say(`teach.turn.${host}`, ...ask)
    else if (challenge) await say(challengeKey(host), ...ask)
    else await say(...ask)
    if (!live.current || stepRef.current !== my) return
    // 題目念到最後一個字才收作答（準則 PHASE-3、V-12）：念的時候亂點不會被記成答錯、也不會累積到重教
    locked.current = false
    shownAt.current = performance.now()
    setAccepting(true)
    const d = delayRef.current
    if (d)
      window.setTimeout(() => {
        // 已經答完、換題：不亮；已經有其他標記（例如答錯兩次的提示）也不蓋過去
        if (!live.current || stepRef.current !== my || delayRef.current !== d) return
        d.glowAt = performance.now()
        setMarks((m) => (m[it.answer] ? m : { ...m, [it.answer]: 'soft' }))
      }, d.ms)
    idle.start({
      repeat: () => {
        setCuePing((c) => c + 1)
        void say(...ask)
      },
      // 手再示範一次：答案亮起來、手移過去點一下，不說話；看了提示就不算第一次答對
      hint: () => {
        hintUsed.current = true
        setMarks((m) => ({ ...m, [it.answer]: 'hint' }))
        setHandTap((n) => n + 1)
      },
    })
  }

  /** 出下一題：先決定這題要不要教 */
  const present = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    const isLast = i === ROUND_ITEMS - 1
    // 這題出什麼、要不要先教、是不是探測題（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份）
    const { it, lv, probe: probed, fresh, walk: walkThrough } = planChoice(def, round.current, i)
    itemLevel.current = lv
    // 教學卡出來之前就換好：卡片上教的、陪玩提示寫的、題目問的是同一件事
    setHintText(it.cue ? cueHint(it.cue.cue, hintVariant) : undefined)
    // 題目徽章第一次出現（這個技能以前學過、但還沒看過徽章）：照新內容的流程先教徽章，不當探測題
    const cueNew = !!it.cue && !!it.teach && !fresh && !(await getKV<string[]>(CUE_KEY, [])).includes(it.cue.cue)
    if (!live.current) return
    const probe = probed && !cueNew
    // Sam 教豆豆：已熟、有「這是 X 嗎？」台詞的題目，一局最多 1 次，不放在第一題和挑戰題
    const tease =
      !probe && !fresh && !cueNew && i > 0 && !isLast && protegeRound.current && !protegeUsed.current && mastered(it.skill) && canTease(it.skill) && it.options.length >= 2
    let decoy: string | undefined
    if (tease) {
      protegeUsed.current = true
      decoy = pick(it.options.filter((o) => o.id !== it.answer)).id
    }
    preload([
      ...it.prompt,
      ...it.correction,
      ...(it.after ?? []),
      ...(it.teach?.lines ?? []),
      `teach.here.${host}`,
      `teach.turn.${host}`,
      ...(decoy ? [`tease.try.${host}`, teaseKey(it.skill), `tease.thanks.${host}`, `tease.oops.${host}`] : []),
    ])

    if (fresh || cueNew) {
      await teach(it, false)
      if (!live.current) return
    }
    taughtItem.current = fresh || walkThrough || cueNew
    if (fresh || walkThrough || cueNew) {
      await guided(it)
      if (!live.current) return
      return quiz(reshuffle(it), { afterGuide: true })
    }
    return quiz(it, { probe, decoy })
  }

  /** 答對（或重教完）到下一題：剛教的新內容多停一下，複習題維持輕快 */
  const next = async (ms = nextPause(taughtItem.current)) => {
    await wait(ms)
    if (!live.current) return
    const n = idxRef.current + 1
    if (n >= ROUND_ITEMS) return onDone({ items: ROUND_ITEMS, firstTry: firstTries.current })
    present(n)
  }

  useEffect(() => {
    live.current = true
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
    const boot = window.setTimeout(async () => {
      markPlayed(def.id)
      await say(def.intro)
      if (live.current) present(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tapGuided = async (it: ChoiceItem, optId: string) => {
    taps.current.push({ pick: optId, ms: Math.round(performance.now() - shownAt.current) })
    if (optId !== it.answer) {
      // 一起練不會答錯：不搖、不扣分，再指一次（這是點錯的回饋，不算閒置提醒）
      sfx.gentle()
      void say(`teach.here.${host}`)
      return
    }
    locked.current = true
    stepRef.current++
    idle.stop()
    sfx.correct()
    setMarks({ [optId]: 'correct' })
    setMood('cheer')
    setBurst((b) => b + 1)
    void logAttempt({
      ...base(it),
      phase: 'guided',
      taps: taps.current,
      firstTryCorrect: taps.current.length === 1,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: true,
    })
    await say(praiseKey(host, english))
    // 答對的動畫跑完、孩子看清楚了，才換「Your turn!」
    await wait(PACE.GUIDED_TO_QUIZ)
    if (live.current) release()
  }

  /** 自己答錯兩次：不只是提示，而是重新教一次，再一起練 */
  const reteach = async (it: ChoiceItem) => {
    locked.current = true
    stepRef.current++
    idle.stop()
    hintUsed.current = true
    void logAttempt({
      ...base(it),
      phase: 'quiz',
      taps: taps.current,
      firstTryCorrect: false,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: true,
      metrics: { retaught: 1, ...(probeRef.current ? { probe: 1 } : {}) },
    })
    reportLevel(def.id, false, def.maxLevel, { probe: probeRef.current, skill: it.skill })
    delayRef.current = null
    await say(`teach.again.${host}`)
    if (!live.current) return
    await teach(it, true)
    if (!live.current) return
    await guided(reshuffle(it))
    // 一起練答對時已經停過了（GUIDED_TO_QUIZ），不用再多等
    if (live.current) next(PACE.NEXT_REVIEW)
  }

  /** Sam 教豆豆：點正確的就是糾正成功；點了恐龍指的（或其他錯的），恐龍自己發現、正確答案亮起 */
  const tapTease = async (it: ChoiceItem, optId: string) => {
    const decoy = decoyRef.current!
    if (optId !== it.answer) {
      sfx.gentle()
      hintUsed.current = true
      setMood('idle')
      setMarks((m) => {
        const { [decoy]: _d, ...rest } = m
        return { ...rest, [optId]: 'wrong', [it.answer]: 'hint' }
      })
      await say(`tease.oops.${host}`, ...it.correction)
      idle.poke()
      return
    }
    locked.current = true
    stepRef.current++
    idle.stop()
    const firstTry = taps.current.length === 1 && !hintUsed.current
    if (firstTry) firstTries.current++
    sfx.correct()
    setMarks({ [optId]: 'correct' })
    setMood('cheer')
    setBurst((b) => b + 1)
    // 研究證據在 3 歲還沒證實：完整記下來，4 週檢查點再評估（家長區「Sam 教豆豆」）
    void logAttempt({
      ...base(it),
      phase: 'quiz',
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: hintUsed.current,
      metrics: { protege: 1, decoy: it.options.findIndex((o) => o.id === decoy) },
    })
    decoyRef.current = null
    await say(`tease.thanks.${host}`, ...it.correction)
    next()
  }

  const tap = async (optId: string) => {
    const it = itemRef.current
    if (!it || locked.current) return
    // 任何點擊都重新計時（點到已經答錯的也算有在操作）
    idle.poke()
    if (marks[optId] === 'wrong') return
    if (phaseRef.current === 'guided') return tapGuided(it, optId)
    taps.current.push({ pick: optId, ms: Math.round(performance.now() - shownAt.current) })
    if (decoyRef.current) return tapTease(it, optId)

    if (optId !== it.answer) {
      sfx.gentle()
      setMarks((m) => ({ ...m, [optId]: 'wrong' }))
      const wrongs = taps.current.filter((t) => t.pick !== it.answer).length
      if (wrongs >= 2 && it.teach) return reteach(it)
      if (wrongs >= 2) {
        hintUsed.current = true
        setMarks((m) => ({ ...m, [optId]: 'wrong', [it.answer]: 'hint' }))
        await say(`hint.${host}`, ...it.correction)
      } else await say(retryKey(host))
      // 「再試一次」說完才重新計時，不算在閒置提醒裡
      idle.poke()
      return
    }

    locked.current = true
    stepRef.current++
    idle.stop()
    // 延遲提示：光亮了才點的，不算第一次答對；亮了之後很快就點，代表在等光
    const d = delayRef.current
    delayRef.current = null
    const glowed = !!d?.glowAt
    const waited = glowed && performance.now() - d!.glowAt! <= WAIT_WINDOW_MS
    if (d) noteHintWait(waited)
    const firstTry = taps.current.length === 1 && !hintUsed.current && !glowed
    if (firstTry) firstTries.current++
    sfx.correct()
    setMarks((m) => ({ ...m, [optId]: 'correct' }))
    setMood('cheer')
    setBurst((b) => b + 1)
    const metrics: Record<string, number> = {}
    if (probeRef.current) metrics.probe = 1
    if (d) Object.assign(metrics, { hintDelay: d.ms, glowed: glowed ? 1 : 0, waited: waited ? 1 : 0 })
    // 只靠淡淡的光就答對（沒有答錯、沒有閒置提示）：不算第一次答對，但也不退格
    if (glowed && taps.current.length === 1 && !hintUsed.current) metrics.softHint = 1
    void logAttempt({
      ...base(it),
      phase: 'quiz',
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: hintUsed.current || glowed,
      ...(Object.keys(metrics).length ? { metrics } : {}),
    })
    const change = reportLevel(def.id, firstTry, def.maxLevel, { probe: probeRef.current, skill: it.skill })
    const lines = [praiseKey(host, english), ...(it.after && Math.random() < 0.6 ? it.after : [])]
    if (change === 'up') lines.push('levelup')
    await say(...lines)
    next()
  }

  // 孩子主動點恐龍、點題目圖：是孩子要聽的，不是閒置提醒；也算有操作
  const onHost = () => {
    if (card || !item) return
    idle.poke()
    if (!decoyRef.current) setCuePing((c) => c + 1)
    if (phase === 'guided') void say(...item.prompt, `teach.here.${host}`)
    else if (decoyRef.current) void say(teaseKey(item.skill))
    else void say(...item.prompt)
  }

  const guide = phase === 'guided'
  const wide = item?.options.some((o) => o.v.t === 'group')
  const fit = Math.max(0, ...(item?.options ?? []).map((o) => (o.v.t === 'group' ? o.v.count : 0)))
  return (
    <Shell station={def.station} mood={mood} progress={{ total: ROUND_ITEMS, done: idx }} onExit={onExit} onHost={onHost} hintText={hintText}>
      {/* 教學卡在原地淡入、題目在後面淡掉；換題時新題目蓋在舊的上面淡入（ui/Scenes.tsx） */}
      <CardStage card={card && <TeachCard key={`teach-${card.n}`} spec={card.spec} short={card.short} camera onDone={release} />}>
        {item && (
          <Swap id={view}>
            {(quiet) => (
            <>
              {item.stimulus && (
                <motion.div
                  className={`stimulus${item.stimulus.t === 'group' ? ' wide' : item.stimulus.t === 'seq' ? ' seq' : ''}`}
                  initial={quiet ? false : { y: -18 }}
                  animate={{ y: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  onPointerDown={() => {
                    idle.poke()
                    void say(...(decoyRef.current ? [teaseKey(item.skill)] : item.prompt))
                  }}
                >
                  {/* 規律題答對後，答案補進最後一格的「？」 */}
                  <VisualView v={item.stimulus} fill={item.options.find((o) => marks[o.id] === 'correct')?.v} />
                </motion.div>
              )}
              {/* 比較題的題目徽章：一大堆／一點點、變大／變小，作答時一直掛在選項上方（教學卡貼過同一張） */}
              {item.cue && (
                <motion.button
                  className="q-cue"
                  aria-label="再聽一次題目"
                  initial={quiet ? false : { y: -18 }}
                  animate={{ y: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  onPointerDown={onHost}
                >
                  <div className="q-cue-in">
                    <CueArt cue={item.cue.cue} icon={item.cue.icon} play={cuePing} />
                  </div>
                </motion.button>
              )}
              <div className={`options${item.stimulus ? ' with-stim' : ''}${item.cue ? ' with-cue' : ''}`}>
                {item.options.map((o, i) => {
                  const m = marks[o.id]
                  const isAns = o.id === item.answer
                  const glow = guide && isAns && m !== 'correct'
                  const dim = guide && !isAns
                  return (
                    <motion.button
                      key={o.id}
                      className={`tile${wide ? ' wide' : ''}${m === 'correct' ? ' correct' : ''}${m === 'hint' ? ' hint' : ''}${m === 'soft' ? ' soft' : ''}${m === 'tease' ? ' tease' : ''}${glow ? ' guide' : ''}${dim ? ' dim' : ''}`}
                      aria-label={`選項 ${i + 1}`}
                      initial={quiet ? false : { y: 28, scale: 0.94 }}
                      animate={
                        m === 'wrong'
                          ? { x: [0, -14, 14, -9, 9, 0], opacity: 0.45, y: 0, scale: 0.94 }
                          : m === 'correct'
                            ? { scale: [1, 1.14, 1.06], y: -8, opacity: 1 }
                            : m === 'tease'
                              ? { y: 0, opacity: 1, scale: 1, rotate: [0, -3, 3, -2, 0] }
                            : dim
                              ? { y: 0, opacity: 0.3, scale: 0.88 }
                              : glow
                                ? { y: 0, opacity: 1, scale: 1.04 }
                                : // 念題目、教學卡收起中：還不能點，看起來淡一點（準則 PHASE-1）
                                  { y: 0, opacity: accepting || m ? 1 : 0.55, scale: 1 }
                      }
                      whileTap={{ scale: 0.94 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 20, delay: m ? 0 : 0.08 * i, opacity: FADE }}
                      onPointerDown={(e) => {
                        // 兩根手指、手掌同時壓到兩個選項：只算第一根手指（準則 TOUCH-3）
                        if (firstFinger(e.nativeEvent)) tap(o.id)
                      }}
                    >
                      <div className="tile-in">
                        <VisualView v={o.v} fit={fit} />
                      </div>
                      {glow && <Hand x={74} y={72} size="12cqmin" beckon tap={handTap} />}
                      {/* 閒置提示：手移到答案上點一下，之後停在那裡（靜態） */}
                      {!guide && isAns && handTap > 0 && m === 'hint' && <Hand x={74} y={72} size="12cqmin" tap={handTap} />}
                      {/* 恐龍的「是這個嗎？」：用問號泡泡而不是手，手在一起練代表「點這裡」 */}
                      {m === 'tease' && (
                        <motion.span className="tease-q" aria-hidden="true" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: -8 }} transition={{ type: 'spring', stiffness: 320, damping: 14, delay: 0.5 }}>
                          ?
                        </motion.span>
                      )}
                      {m === 'correct' && <Sparkles key={burst} />}
                    </motion.button>
                  )
                })}
              </div>
              <WaitShield on={!accepting} />
            </>
            )}
          </Swap>
        )}
      </CardStage>
    </Shell>
  )
}
