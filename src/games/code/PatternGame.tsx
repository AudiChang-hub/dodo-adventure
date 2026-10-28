import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { Sparkles } from '../../ui/Sparkles'
import { Swap } from '../../ui/Scenes'
import { EASE, FADE } from '../../ui/motion'
import { game as gameDef, station as stationDef, type ChoiceItem } from '../../content/games'
import { patternRounds, patternTok, type PatternTok } from '../../content/code'
import { markPlayed, plays, reportLevel } from '../../lib/adaptive'
import { planChoice, roundState } from '../pick'
import { logAttempt, logTeach } from '../../lib/record'
import type { Phase } from '../../lib/db'
import { hushSpeech, preload, say, sfx, stopSpeech } from '../../lib/audio'
import { shuffle } from '../../lib/random'
import { praiseKey, wait } from '../lines'
import { PACE } from '../pace'
import type { Mood } from '../../art/Dino'
import { hit, useTapDrag } from './drag'
import { GhostView, GuideLoop, HandView, demoCarry, useCarry, useLadder, type Box } from './carry'
import { EmptyWagonArt, LocoArt, WagonArt } from './TrainArt'
import './pattern.css'

/** 節奏一拍多長（毫秒）：3 歲跟得上、又不會拖太長 */
const BEAT = 420
/** 火車開進來、開走 */
const ARRIVE_MS = 1000
const DEPART_MS = 1150

/** 一列火車要知道的：每一節載什麼、是 A 還是 B（決定音高）、答案、月台上的選項 */
interface Info {
  it: ChoiceItem
  row: PatternTok[]
  roles: number[]
  ans: PatternTok
  opts: PatternTok[]
  roleOf: (id: string) => number
}

/** itemId 是「規律:圖-圖-圖…」（content/code.ts 的 cPattern）；第一次出現的是 A、第二個是 B… */
function parse(it: ChoiceItem): Info {
  const ids = it.itemId.split(':')[1].split('-')
  const row = ids.map((id) => patternTok(id)!)
  const order: string[] = []
  for (const t of row) if (!order.includes(t.id)) order.push(t.id)
  const roleOf = (id: string) => (order.includes(id) ? order.indexOf(id) : 3)
  return { it, row, roles: row.map((t) => roleOf(t.id)), ans: patternTok(it.answer)!, opts: it.options.map((o) => patternTok(o.id)!), roleOf }
}

/** 重新洗牌，答案不要留在同一格（不然只是記位置） */
function reorder(opts: PatternTok[], ans: string, prev?: PatternTok[]): PatternTok[] {
  if (opts.length < 2) return opts
  const at = prev?.findIndex((o) => o.id === ans) ?? -1
  let o = opts
  for (let k = 0; k < 12; k++) {
    o = shuffle(opts)
    if (o.findIndex((x) => x.id === ans) !== at) break
  }
  return o
}

type Stage = 'demo' | Phase

/**
 * 找規律（2026-10-28 重做，docs/玩法看得懂盤點.md 第 0 節）：
 * 豆豆的火車頭拉著一節節車廂，車廂上載著規律（紅圓、藍方、紅圓、藍方…），最後一節是虛線的空車廂。
 * 孩子把月台上對的那一節接上去，火車就嘟嘟開走（完成的獎勵）；開進來時每一節依序跳一下、配一個固定的音（A 高 B 低），
 * 靜音時看跳動、聽不懂英文時聽音高，都感受得到「叮、咚、叮、咚、…？」。
 *
 * 流程（出題規則和選擇題一樣，pick.ts 的 planChoice；sim-teach.ts 檢查同一份）：
 * - 新的規律（AB、AABB、ABC 第一次出現）：示範——火車開進來、跑一次節奏，手從月台拿起對的車廂、拖到空位接上，火車開走。
 *   不用教學卡：畫面一開始就是「先看到空位，再看手把答案放進去」。
 * - 一起練（新的規律、或第一次玩的第一題）：對的車廂發光，手從它滑到空位、一直重複；點或拖都行。
 * - 自己答：點選項，車廂自己飛進空位（3 歲拖不穩，點一下就好；想拖也可以）。
 * - 閒置（從可以作答開始算）：5 秒空位脈動變明顯 → 10 秒節奏再跑一次 → 20 秒手再示範一次（半透明、做完拿回去）→ 35 秒對的發光、手帶著做。
 * - 接錯：車廂接不上、搖一搖彈回月台，火車晃一下，節奏再跑一次，錯的那一節變淡做記號；不扣分、不責備。
 *   第二次錯（2 選 1 時第一次錯就是）：手示範一次，再帶著做。
 */
export function PatternGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const host = stationDef(def.station).host

  // 必須在 markPlayed 之前讀：第一次玩的遊戲，第一題一定先一起練一次；一局也比較短
  const round = useRef(roundState(plays(def.id) === 0))
  const [rounds] = useState(() => patternRounds(round.current.firstPlay))

  const [idx, setIdx] = useState(0)
  const [info, setInfo] = useState<Info | null>(null)
  const [opts, setOpts] = useState<PatternTok[]>([])
  const [stage, setStage] = useState<Stage>('quiz')
  const [train, setTrain] = useState<{ n: number; out: boolean } | null>(null)
  /** 火車停好了（開進來的途中量空位會量到畫面外） */
  const [parked, setParked] = useState(false)
  const [filled, setFilled] = useState<string | null>(null)
  const [hop, setHop] = useState<{ i: number; n: number } | null>(null)
  const [pulse, setPulse] = useState<0 | 1 | 2>(1)
  const [marks, setMarks] = useState<Record<string, 'wrong'>>({})
  const [away, setAway] = useState<string | null>(null)
  const [guide, setGuide] = useState(false)
  const [loopOff, setLoopOff] = useState(false)
  const [guideBox, setGuideBox] = useState<{ from: Box; to: Box } | null>(null)
  const [shake, setShake] = useState(0)
  const [nudge, setNudge] = useState<{ id: string; n: number } | null>(null)
  const [burst, setBurst] = useState(0)
  const [mood, setMood] = useState<Mood>('idle')
  const [view, setView] = useState(0)

  const live = useRef(true)
  const locked = useRef(true)
  /** 有東西正在飛（孩子點的、拖的）：這段時間不收其他操作 */
  const busy = useRef(false)
  const stepRef = useRef(0)
  const idxRef = useRef(0)
  const infoRef = useRef<Info | null>(null)
  const optsRef = useRef<PatternTok[]>([])
  const stageRef = useRef<Stage>('quiz')
  const filledRef = useRef<string | null>(null)
  const marksRef = useRef<Record<string, 'wrong'>>({})
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const shownAt = useRef(0)
  const wrongs = useRef(0)
  const hintUsed = useRef(false)
  const probeRef = useRef(false)
  const itemLevel = useRef(1)
  const firstTries = useRef(0)
  const taughtItem = useRef(false)
  /** 這一列火車孩子有沒有動過（動過就不再接著念題目） */
  const acted = useRef(false)
  const hopN = useRef(0)
  const rhythmTok = useRef(0)
  const demoTok = useRef(0)
  const demoOn = useRef(false)
  /** 閒置提示的手正在示範（畫面要知道：孩子可以直接從手上搶過車廂） */
  const [demoLive, setDemoLive] = useState(false)
  const setDemo = (v: boolean) => {
    demoOn.current = v
    setDemoLive(v)
  }
  const answered = useRef<(() => void) | null>(null)
  const trainN = useRef(0)

  const root = useRef<HTMLDivElement>(null)
  const slotEl = useRef<HTMLDivElement>(null)
  const optEls = useRef<Record<string, HTMLElement>>({})
  const carry = useCarry<string>(root)
  const ladder = useLadder()

  const alive = (my: number) => () => live.current && stepRef.current === my

  // ── 小工具 ─────────────────────────────────────────────────
  const markHidden = (id: string | null) => setAway(id)
  const fill = (id: string | null) => {
    filledRef.current = id
    setFilled(id)
  }
  const optBox = (id: string) => carry.box(optEls.current[id])
  const slotBox = () => carry.box(slotEl.current)

  /** 停掉正在跑的節奏（孩子動手了） */
  const stopRhythm = () => {
    rhythmTok.current++
    setHop(null)
  }

  /** 停掉正在做的閒置示範：孩子先動手就讓他做（盤點 8-7），手和幽靈當場收掉 */
  const cancelDemo = () => {
    if (!demoOn.current) return
    setDemo(false)
    demoTok.current++
    carry.clear()
    markHidden(null)
    setLoopOff(false)
  }

  /**
   * 節奏：每一節依序跳一下、響一聲（同一種東西同一個音高）；names 時同時念英文名字（Apple! Banana!）。
   * 最後一拍是空位：空位用力脈動一下、不出聲（「…？」）；已經接上了就照樣響。
   */
  const rhythm = async (names = false) => {
    const r = ++rhythmTok.current
    const ok = () => live.current && rhythmTok.current === r
    const inf = infoRef.current
    if (!inf) return false
    for (let i = 0; i < inf.row.length; i++) {
      if (!ok()) return false
      setHop({ i, n: ++hopN.current })
      sfx.beat(inf.roles[i])
      if (names) await Promise.all([say(`c.name.${inf.row[i].id}`), wait(BEAT)])
      else await wait(BEAT)
    }
    if (!ok()) return false
    setHop({ i: inf.row.length, n: ++hopN.current })
    const f = filledRef.current
    if (f) sfx.beat(inf.roleOf(f))
    await wait(BEAT + 180)
    if (!ok()) return false
    setHop(null)
    return true
  }

  /** 新的一列火車從右邊開進來（題目、月台的選項一起換） */
  const arrive = async (inf: Info, order: PatternTok[]) => {
    infoRef.current = inf
    optsRef.current = order
    marksRef.current = {}
    setInfo(inf)
    setOpts(order)
    setMarks({})
    markHidden(null)
    fill(null)
    setPulse(1)
    setHop(null)
    setView((v) => v + 1)
    setTrain({ n: ++trainN.current, out: false })
    setParked(false)
    sfx.chug()
    await wait(ARRIVE_MS + 40)
    setParked(true)
  }

  /** 火車嘟嘟開走（往左開出畫面） */
  const depart = async (talk = true) => {
    setTrain((t) => (t ? { ...t, out: true } : t))
    setGuide(false)
    setGuideBox(null)
    sfx.toot()
    if (talk) void say('c.pat.choo')
    await wait(DEPART_MS)
  }

  const base = (it: ChoiceItem) => ({
    station: def.station,
    game: def.id,
    itemId: it.itemId,
    skill: it.skill,
    level: itemLevel.current,
    options: optsRef.current.map((o) => o.id),
    answer: it.answer,
  })

  /** 閒置或答錯後的示範：半透明的手把對的車廂拖到空位、停一下、再拿回月台（不替孩子作答） */
  const hintDemo = async () => {
    const inf = infoRef.current
    const from = inf && optBox(inf.ans.id)
    const to = slotBox()
    if (!inf || !from || !to || filledRef.current) return
    hintUsed.current = true
    const d = ++demoTok.current
    setDemo(true)
    setLoopOff(true)
    await demoCarry(carry, inf.ans.id, from, to, {
      alive: () => live.current && demoTok.current === d,
      keep: false,
      faint: true,
      onLift: () => markHidden(inf.ans.id),
      onBack: () => markHidden(null),
    })
    if (demoTok.current !== d) return
    setDemo(false)
    setLoopOff(false)
  }

  /** 對的車廂發光、手帶著做（一起練一開始就是；自己答是最後一階的提示） */
  const showGuide = () => setGuide(true)

  // 一起練的手：量好月台上那一節和空位的位置（火車停好、選項換好之後）
  useLayoutEffect(() => {
    if (!guide || !info || !parked) return setGuideBox(null)
    const t = window.setTimeout(() => {
      const from = optBox(info.ans.id)
      const to = slotBox()
      if (from && to) setGuideBox({ from, to })
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, info, opts, view, parked])

  // ── 我示範：手拿起對的車廂、接上去，火車開走 ───────────────────
  const demo = async (inf: Info, intro: boolean) => {
    const my = ++stepRef.current
    const ok = alive(my)
    stageRef.current = 'demo'
    setStage('demo')
    setGuide(false)
    locked.current = true
    setMood('happy')
    const order = reorder(inf.opts, inf.ans.id)
    const t0 = performance.now()
    // 「Watch me!」邊說，火車一停好節奏就開始（不等說完：從示範開始到孩子能作答控制在 10 秒左右）
    void say(...(intro ? [def.intro] : []), `teach.watch.${host}`)
    await arrive(inf, order)
    if (!ok()) return
    await rhythm()
    if (!ok()) return
    const from = optBox(inf.ans.id)
    const to = slotBox()
    if (from && to) {
      const d = ++demoTok.current
      await demoCarry(carry, inf.ans.id, from, to, {
        alive: () => ok() && demoTok.current === d,
        keep: true,
        onLift: () => markHidden(inf.ans.id),
        onLand: () => {
          fill(inf.ans.id)
          sfx.clack()
          setBurst((b) => b + 1)
        },
      })
    }
    if (!ok()) return
    setPulse(0)
    await wait(200)
    await rhythm()
    if (!ok()) return
    setMood('cheer')
    await depart()
    void logTeach({ station: def.station, game: def.id, itemId: inf.it.itemId, skill: inf.it.skill, level: itemLevel.current, ms: Math.round(performance.now() - t0), retaught: false })
  }

  // ── 一起練、自己答：火車開進來，等孩子接上最後一節 ─────────────────
  const ask = async (inf: Info, ph: Phase, o: { afterGuide?: boolean; probe?: boolean; intro?: boolean; prev?: PatternTok[] } = {}) => {
    const my = ++stepRef.current
    const ok = alive(my)
    stageRef.current = ph
    setStage(ph)
    setGuide(ph === 'guided')
    setLoopOff(false)
    locked.current = true
    acted.current = false
    taps.current = []
    wrongs.current = 0
    hintUsed.current = false
    probeRef.current = !!o.probe
    setMood(ph === 'guided' ? 'happy' : 'idle')
    const order = reorder(inf.opts, inf.ans.id, o.prev)
    const done = new Promise<void>((res) => (answered.current = res))
    // 開進來的時候就可以碰（從進遊戲到能作答不超過 3 秒），一邊說「Your turn!」
    const lead = [...(o.intro ? [def.intro] : []), ...(o.afterGuide ? [`teach.turn.${host}`] : [])]
    const coming = arrive(inf, order)
    const talk = lead.length ? say(...lead) : Promise.resolve()
    await wait(ARRIVE_MS * 0.6)
    if (!ok()) return
    locked.current = false
    shownAt.current = performance.now()
    void (async () => {
      await Promise.all([coming, talk])
      if (!ok()) return
      // 孩子已經先動手了：不再接著念題目，只開始閒置計時
      if (!acted.current) {
        await rhythm(true)
        if (!ok()) return
        if (!acted.current) await say('c.pat.what', ...(ph === 'guided' ? [`teach.here.${host}`] : []))
        if (!ok()) return
      }
      let asked = false
      ladder.start([
        // 5 秒：空位脈動得更明顯
        { at: 5000, run: () => setPulse(2) },
        // 10 秒：節奏再跑一次（英文題目整題只再念這一次）
        {
          at: 10_000,
          run: () =>
            void rhythm().then((r) => {
              if (r && !asked && ok()) {
                asked = true
                void say('c.pat.what')
              }
            }),
        },
        // 20 秒：手再完整示範一次（半透明，做完拿回去）
        { at: 20_000, run: () => void hintDemo() },
        // 35 秒：對的發光、手帶著做
        {
          at: 35_000,
          run: () => {
            hintUsed.current = true
            showGuide()
          },
        },
      ])
    })()
    await done
    if (!live.current) return
    await depart()
    return order
  }

  const present = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    // 這題出什麼、要不要先示範、是不是探測題（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份）
    const { it, lv, probe, fresh, walk } = planChoice(def, round.current, i)
    itemLevel.current = lv
    const inf = parse(it)
    preload([...inf.row.map((t) => `c.name.${t.id}`), 'c.pat.what', 'c.pat.choo', `teach.watch.${host}`, `teach.turn.${host}`, `teach.here.${host}`, ...(i === 0 ? [def.intro] : [])])
    taughtItem.current = fresh || walk
    let intro = i === 0
    if (fresh) {
      await demo(inf, intro)
      intro = false
      if (!live.current) return
    }
    let prev: PatternTok[] | undefined
    if (fresh || walk) {
      prev = await ask(inf, 'guided', { intro })
      intro = false
      if (!live.current) return
    }
    await ask(inf, 'quiz', { afterGuide: fresh || walk, probe, intro, prev })
    if (!live.current) return
    const n = i + 1
    if (n >= rounds) return onDone({ items: rounds, firstTry: firstTries.current })
    present(n)
  }

  useEffect(() => {
    live.current = true
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
    const boot = window.setTimeout(() => {
      markPlayed(def.id)
      // 開場說明和第一列火車一起出現（不先讓孩子看空的舞台）
      void present(0)
    }, 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      ladder.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 孩子的操作 ─────────────────────────────────────────────

  /** 任何操作：閒置提示從這一階重新計時、正在跑的節奏和閒置示範停下 */
  const touched = () => {
    acted.current = true
    ladder.poke()
    cancelDemo()
    stopRhythm()
  }

  /** 東西已經在空位上了：接得上就接上，接不上就彈回月台 */
  const judge = async (id: string) => {
    const inf = infoRef.current!
    const my = stepRef.current
    const ok = alive(my)
    const ph = stageRef.current as Phase
    taps.current.push({ pick: id, ms: Math.round(performance.now() - shownAt.current) })
    if (id === inf.ans.id) return finish(inf, ph)

    // 接不上：搖一搖、火車晃一下、彈回月台
    hushSpeech()
    sfx.boing()
    carry.wobble()
    setShake((s) => s + 1)
    await wait(560)
    if (!ok()) return
    const home = optBox(id)
    if (home) await carry.glide(home, 460, false)
    carry.drop()
    markHidden(null)
    busy.current = false
    setLoopOff(false)
    if (!ok()) return
    if (ph === 'guided') {
      // 一起練不會錯：不記號、不算，手繼續帶著
      void rhythm()
      return
    }
    wrongs.current++
    // 錯的那一節變淡做記號（不能再選，點了會輕輕搖一下）
    marksRef.current = { ...marksRef.current, [id]: 'wrong' }
    setMarks(marksRef.current)
    setPulse(2)
    const two = inf.opts.length <= 2
    await rhythm()
    if (!ok()) return
    if (wrongs.current >= 2 || two) {
      // 第二次錯（2 選 1 時第一次錯就是）：手示範一次，再帶著做（盤點 8-3）
      await hintDemo()
      if (!ok()) return
      showGuide()
    }
    ladder.poke()
  }

  /** 接上了 */
  const finish = async (inf: Info, ph: Phase) => {
    locked.current = true
    stepRef.current++
    ladder.stop()
    stopRhythm()
    cancelDemo()
    carry.drop()
    fill(inf.ans.id)
    busy.current = false
    setPulse(0)
    setGuide(false)
    sfx.clack()
    setBurst((b) => b + 1)
    setMood('cheer')
    const it = inf.it
    if (ph === 'guided') {
      void logAttempt({ ...base(it), phase: 'guided', taps: taps.current, firstTryCorrect: taps.current.length === 1, attempts: taps.current.length, responseMs: taps.current[0].ms, hintUsed: true })
      await Promise.all([say(praiseKey(host)), wait(250).then(() => rhythm())])
      await wait(PACE.GUIDED_TO_QUIZ * 0.4)
      answered.current?.()
      return
    }
    const firstTry = taps.current.length === 1 && !hintUsed.current
    if (firstTry) firstTries.current++
    const metrics: Record<string, number> = { wrongTaps: wrongs.current }
    if (probeRef.current) metrics.probe = 1
    if (wrongs.current >= 2 || (wrongs.current >= 1 && inf.opts.length <= 2)) metrics.retaught = 1
    void logAttempt({
      ...base(it),
      phase: 'quiz',
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: taps.current.length,
      responseMs: taps.current[0].ms,
      hintUsed: hintUsed.current,
      metrics,
    })
    const change = reportLevel(def.id, firstTry, def.maxLevel, { probe: probeRef.current, skill: it.skill })
    await Promise.all([say(praiseKey(host), ...(change === 'up' ? ['levelup'] : [])), wait(250).then(() => rhythm())])
    if (taughtItem.current) await wait(300)
    answered.current?.()
  }

  /** 點一下選項：車廂自己飛進空位（3 歲拖不穩，點一下就好） */
  const tapOpt = async (id: string) => {
    if (locked.current || busy.current || filledRef.current) return
    touched()
    if (marksRef.current[id] === 'wrong') {
      setNudge({ id, n: Date.now() })
      sfx.gentle()
      return
    }
    const from = optBox(id)
    const to = slotBox()
    if (!from || !to) return
    busy.current = true
    setLoopOff(true)
    sfx.tap()
    carry.lift(id, from)
    markHidden(id)
    await carry.glide(to, 440)
    if (!live.current) return
    void judge(id)
  }

  /** 正在被手指拖著的那一節（drop：手指已經放開、正在處理） */
  const dragging = useRef<{ id: string; drop: boolean } | null>(null)

  /** 沒放到空位（或拖曳被系統取消）：回月台，不算一次 */
  const goHome = async (id: string) => {
    const home = optBox(id)
    if (home) await carry.glide(home, 320, false)
    carry.drop()
    markHidden(null)
    dragging.current = null
    busy.current = false
    setLoopOff(false)
  }

  const drag = useTapDrag<string>({
    enabled: () => !locked.current && !filledRef.current && (!busy.current || !!dragging.current),
    onPoke: () => touched(),
    onTap: (id) => void tapOpt(id),
    onDrop: async (id, x, y) => {
      const d = dragging.current
      if (!d || d.id !== id) return
      d.drop = true
      const to = slotBox()
      if (to && hit(slotEl.current, x, y, 48)) {
        await carry.glide(to, 160)
        dragging.current = null
        if (live.current) void judge(id)
        return
      }
      void goHome(id)
    },
  })

  // 拖曳中：幽靈跟著手指（drag.ts 給的是視窗座標，換成這一層的座標，轉場縮放中也對得上）
  useEffect(() => {
    const g = drag.ghost
    const d = dragging.current
    if (!g) {
      // 拖到一半被系統取消（沒有放開）：放回月台
      if (d && !d.drop) void goHome(d.id)
      return
    }
    if (!d) {
      if (busy.current || marksRef.current[g.item] === 'wrong' || filledRef.current) return
      const from = optBox(g.item)
      if (!from) return
      busy.current = true
      setLoopOff(true)
      dragging.current = { id: g.item, drop: false }
      carry.lift(g.item, from)
      markHidden(g.item)
    } else if (d.id !== g.item) return
    const p = carry.point(g.x, g.y)
    if (p) carry.follow(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.ghost])

  /** 閒置提示的手拿著車廂時，孩子直接點它：從手上搶過來、飛進空位（示範途中孩子先動手，就讓他做） */
  const grabDemo = async () => {
    const id = carry.holding()
    const to = slotBox()
    if (!demoOn.current || locked.current || busy.current || id === null || !to) return
    acted.current = true
    ladder.poke()
    stopRhythm()
    setDemo(false)
    demoTok.current++
    busy.current = true
    setLoopOff(true)
    carry.handOff()
    sfx.tap()
    await carry.glide(to, 300)
    if (live.current) void judge(id)
  }

  /** 點火車上的車廂：那一節跳一下、響它的音（自己玩節奏） */
  const tapCar = (i: number) => {
    const inf = infoRef.current
    if (!inf || locked.current) return
    touched()
    setHop({ i, n: ++hopN.current })
    sfx.beat(inf.roles[i])
  }

  /** 點空位：再跑一次節奏（不能放東西的時候也有看得到的反應） */
  const tapSlot = () => {
    if (locked.current || busy.current || filledRef.current) return
    touched()
    setPulse(2)
    void rhythm()
  }

  const onHost = () => {
    if (locked.current || !infoRef.current) return
    touched()
    void rhythm().then((r) => {
      if (r) void say('c.pat.what')
    })
  }

  // ── 畫面 ───────────────────────────────────────────────────
  const n = (info?.row.length ?? 4) + 1
  const ansId = info?.ans.id
  const showLoop = guide && !!guideBox && !loopOff && !filled
  const enterX = root.current?.offsetWidth ?? 1400
  return (
    <Shell station={def.station} mood={mood} progress={{ total: rounds, done: idx }} onExit={onExit} onHost={onHost}>
      <div ref={root} className="pt" style={{ '--n': n } as CSSProperties}>
        {/* 鐵軌 */}
        <div className="pt-rails" aria-hidden="true" />

        {train && info && (
          <motion.div
            key={train.n}
            className="pt-train"
            initial={{ x: enterX }}
            animate={{ x: train.out ? -enterX * 1.05 : 0 }}
            transition={train.out ? { duration: DEPART_MS / 1000, ease: EASE.in } : { duration: ARRIVE_MS / 1000, ease: EASE.out }}
          >
            <motion.div
              key={shake}
              className="pt-cars"
              animate={shake ? { rotate: [0, -1.4, 1.1, -0.6, 0], y: [0, -4, 2, -1, 0] } : {}}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div className="pt-loco">
                <LocoArt mood={mood === 'cheer' ? 'cheer' : 'happy'} puff={!parked || train.out} />
              </div>
              {info.row.map((t, i) => (
                <button key={i} className="pt-car" aria-label={`車廂 ${i + 1}`} onPointerDown={() => tapCar(i)}>
                  <Hop n={hop?.i === i ? hop.n : 0}>
                    <WagonArt v={t.v} />
                  </Hop>
                </button>
              ))}
              <div ref={slotEl} className={`pt-slot${filled ? ' is-full' : ` pulse-${pulse}`}`} onPointerDown={tapSlot} role="button" aria-label="空的車廂">
                <Hop n={hop?.i === info.row.length ? hop.n : 0}>
                  {filled ? <WagonArt v={patternTok(filled)?.v} /> : <EmptyWagonArt />}
                </Hop>
                {filled && <Sparkles key={burst} count={14} />}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 月台：等著被接上去的車廂 */}
        <div className="pt-platform" aria-hidden="true" />
        <Swap id={view} className="pt-dock">
          {(quiet) => (
            <>
              {opts.map((t, j) => {
                const wrong = marks[t.id] === 'wrong'
                const isAns = t.id === ansId
                const lit = guide && isAns
                const dim = guide && !isAns
                const gone = away === t.id || (filled === t.id && !!filled)
                return (
                  <motion.button
                    key={t.id}
                    ref={(el: HTMLButtonElement | null) => {
                      if (el) optEls.current[t.id] = el
                    }}
                    className={`pt-opt${lit ? ' is-guide' : ''}${wrong ? ' is-wrong' : ''}${gone ? ' is-away' : ''}`}
                    aria-label={`選項 ${j + 1}`}
                    data-id={t.id}
                    initial={quiet ? false : { y: 24 }}
                    animate={
                      nudge?.id === t.id
                        ? { x: [0, -8, 8, -4, 0], y: 0, opacity: 0.42, scale: 0.92 }
                        : { x: 0, y: 0, opacity: wrong ? 0.42 : dim ? 0.4 : 1, scale: wrong || dim ? 0.92 : 1 }
                    }
                    transition={{ type: 'spring', stiffness: 360, damping: 24, delay: quiet ? 0 : 0.06 * j, opacity: FADE }}
                    {...drag.bind(t.id)}
                  >
                    <WagonArt v={t.v} />
                    <span className="pt-opt-rail" aria-hidden="true" />
                  </motion.button>
                )
              })}
            </>
          )}
        </Swap>

        {showLoop && guideBox && <GuideLoop key={`${view}-${train?.n}`} from={guideBox.from} to={guideBox.to} />}
        <GhostView ghost={carry.ghost} render={(id) => <WagonArt v={patternTok(id)?.v} />} className="pt-ghost" onGrab={demoLive && stage !== 'demo' ? () => void grabDemo() : undefined} />
        <HandView hand={carry.hand} />
        {/* 給自動測試看現在是哪一段、答案是哪一個（畫面上看不到） */}
        <span hidden data-stage={stage} data-ans={ansId} data-lv={itemLevel.current} data-kind={info?.it.skill} />
      </div>
    </Shell>
  )
}

/** 節奏的一拍：跳一下（n 每變一次就跳一次） */
function Hop({ n, children }: { n: number; children: ReactNode }) {
  if (!n) return <div className="pt-hop">{children}</div>
  return (
    <motion.div key={n} className="pt-hop" initial={{ y: 0, scale: 1 }} animate={{ y: ['0%', '-16%', '0%'], scale: [1, 1.07, 1] }} transition={{ duration: 0.34, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}
