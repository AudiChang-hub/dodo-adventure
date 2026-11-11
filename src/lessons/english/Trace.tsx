import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ink, type InkHandle } from '../../games/draw/Ink'
import { HELP_MS, LIFT_FINISH, PathTracker, PX_PER_MM, SNAP_MM, samplePath, type P2 } from '../../games/draw/track'
import { GoalStar, RainbowDef, RestGuide, ResumeDot } from '../../games/draw/TraceFx'
import { HandArt, PenArt, easeInOut, tween } from '../../games/Demo'
import { Sparkles } from '../../ui/Sparkles'
import { useIdle } from '../../games/idle'
import { nextStep } from '../../ui/NextStep'
import { wait } from '../../games/lines'
import { useFlow } from '../../games/barge'
import { PACE } from '../../games/pace'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { LINES, type LessonLetter } from './data'
import '../../games/draw/glyph.css'

const LANE = 20
/** 描字板的邏輯座標（跟 SVG viewBox、Ink 一樣） */
const VIEW_H = 140

/**
 * 每一輪的顏色：兩輪看得出不一樣（A5：要多練的話每一輪要看得出不一樣）。
 * 起點圓點兩輪都是綠色：語音說「Start at the green dot!」，三歲認得顏色，圓點變藍色就對不上（AI 小男生測試 2026-11-02）。
 * tag：右邊大小寫格子的顏色。
 */
const LOOKS = {
  green: { rim: '#CFE3D6', lane: '#8FCBAA', dot: '#4E9A72', dash: '#9DB5A6', tag: '#4E9A72' },
  blue: { rim: '#D3E2F1', lane: '#9DC2E5', dot: '#4E9A72', dash: '#9AB0C6', tag: '#3E7DB6' },
  /**
   * 寫寫看（T-112，單字之後自己再描一次）：換一個顏色，看得出是新的一段。
   * T-113：以前是珊瑚色，盲測 8948054 他看成「紅色」，紅底對 3 歲太像「錯了」；換成溫和的淡紫
   */
  lilac: { rim: '#E6DEF3', lane: '#C7B6E8', dot: '#4E9A72', dash: '#A99BC4', tag: '#7A5FB5' },
} as const

/**
 * 描字的回合（A5，全球幼教指引：3～4 歲描字只示範、不求多）：大寫一次、小寫一次，每一次都先示範、描完就慶祝。
 * 以前是大寫兩次、小寫兩次，AI 小男生每次到第二遍就無聊、按返回。兩輪換顏色，看得出是新的一輪。
 */
export interface TraceRound {
  big: boolean
  demo: boolean
  look: keyof typeof LOOKS
}
const ROUNDS: TraceRound[] = [
  { big: true, demo: true, look: 'green' },
  { big: false, demo: true, look: 'blue' },
]

/**
 * 寫寫看（T-112，家長：「手寫的比例可以多一些」）：單字之後、選擇題之前，自己再描一次大寫。
 * 前面描字段已經看過兩次示範，這一次不示範，只說 Big S! Start at the green dot! Go this way!；換淡紫色，看得出是新的一段（T-113 以前是珊瑚色，看起來像紅色）。
 * 回饋、沒描上的處理跟描字段一樣（寬鬆、正面，沒描好就由筆帶著描完、往下，T-125）。
 */
export const WRITE_ROUNDS: TraceRound[] = [{ big: true, demo: false, look: 'lilac' }]

/** 描完的稱讚念完之後再停多久就換下一輪（T-110：以前 450 ms，他覺得要等很久） */
const PRAISE_TAIL_MS = 200

/**
 * 描得好不好（只影響這一輪的回饋，T-111；T-112 放寬 0.5 → 0.75）：自己描完、畫在跑道外面的點少於這個比例 → 彩虹＋Great writing!。
 * 量測（T-112，盲測軌跡重播）：歷次 AI 小男生自己描完的 22 輪 offRatio 是 0～0.31；合成的手抖（左右晃到兩倍跑道半寬）
 * 照樣描得完，offRatio 0.36～0.69。要描完本來就得照著跑道的順序走，所以描完的幾乎都算「大致照著線」；
 * 只有一路貼在跑道外面描（四分之三以上的點在外面）才是平平的 You drew it!。
 */
const NEAT_OFF = 0.75
/** 作答紀錄（熟練）的門檻：不變，而且要自己描完、中間沒有「沒描上」那一次（回饋寬鬆、熟練照樣嚴格） */
const GOOD_OFF = 0.4

/**
 * 一次「沒描好」：放開手指時這一筆還沒描完（也沒到 LIFT_FINISH 帶著描完），而且畫了一段（墨水 ≥ 這麼長，描字板單位，約 9 mm），
 * 不管進度有沒有跟著走。只點一下、碰一下不算。
 * T-112 只算「一大段墨水、進度幾乎沒動」（盲測 b637ff7 seed 3 跳過 S 上面的彎）；拖到一半放手、進度有走的照舊不說話、接著描。
 * T-113（盲測 8948054 英文 seed 1 第 9～11 步）：寫寫看拖 5 點就放手，進度有走，所以走的是「不說話、綠點等他接著描」那條路，
 * 畫面只有跑道顏色和流動的小點，他不知道對不對、按返回離開。現在所有沒描好的都走同一套：Nice try! → You drew it!
 */
const ATTEMPT_INK = 12
/**
 * 整堂課（描字、寫寫看加起來）最多讓他重描幾次（T-122，盲測 ca0d1e1 英文：每一輪沒描好都「Nice try」再描一次，
 * 一堂課重描好幾次，他說「好煩」按返回離開）。用完以後沒描好就直接由筆帶著描完、說 You drew it!、往下走。
 * T-125（盲測 0f3363f 英文：描字時說「畫好多次了，好久喔」離開兩次）：0 次。沒描好一次就由筆帶著描完、算描完、出「下一步」，
 * 不再要他重描（以前完全沒描上的那一次會 Nice try! 再描一次）。作答紀錄照舊：筆帶著描完的不算描好。
 */
export const LESSON_RETRIES = 0
/** 一堂課共用的重描次數（index.tsx 給描字、寫寫看同一個） */
export type RetryBudget = { left: number }

/** 鼓勵的話最少隔多久說一次（不要一直講） */
const CHEER_GAP_MS = 5000
/** 偏離路徑多少點才提醒（偶爾手抖不算） */
const STRAY_POINTS = 10

function strokeStart(d: string) {
  const s = samplePath(d, 3)
  const a = s[0]
  const b = s[Math.min(4, s.length - 1)]
  return { x: a.x, y: a.y, ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/**
 * 描字（英文課第 2 段）：今天的大寫、小寫各描一次，用觸控筆或手指都可以。
 * 粗跑道、起點圓點和箭頭、一筆一筆照筆順描（PathTracker）。描得好不好只寫進作答紀錄，不影響隔天上哪個字母（A5）。
 * - 每一輪先「Watch me!」筆照筆順描一次，示範完只說「Your turn!」。
 * - 搶點（T-108，games/barge.ts）：示範、說明的時候下筆：停掉語音、筆的示範收掉，那一筆照常描。
 *   描完的慶祝、筆帶著描完、放手後補滿的那一下不能搶（Ink disabled）。
 * - 要沿著跑道一路描到底才算描完一筆：點一下、亂畫都不會自動完成。沒描到的線放開後淡掉。
 * - 回饋（AI 小男生測試 #3）：
 *   - 起點附近按下去吸到起點（SNAP_MM，3 歲手指的偏差），圓點那邊亮一圈、有一條虛線從手指連過去；
 *   - 描到一半放手：綠點移到斷掉的地方、一圈光往外擴（TraceFx 的 ResumeDot），從那裡（或從起點沿著描好的部分）接著描，進度不歸零；
 *     描了一段（ATTEMPT_INK 以上）才放手的算一次「沒描好」（下面，T-113），筆從斷掉的地方帶著描完（T-122）；
 *   - 一直偏離跑道：圓點彈一下、還沒描的跑道亮兩下（不說話；以前說 Almost! Follow the line!，T-112 拿掉）；
 *   - 沒描好（放開時這一筆還沒描完，ATTEMPT_INK，T-112、T-113）：沒描上的那條線淡掉。
 *     描到一半放手：「You drew it!」、筆從他停下來的地方帶著描完，往下走（T-122：不要他重描）；
 *     完全沒描上（亂畫）：一樣「You drew it!」、筆帶著描完，往下走（T-125：不再要他重描，LESSON_RETRIES 0；
 *     以前整堂第一次是 Nice try! 再描一次）。不說 Almost、不讓他覺得錯了；
 *     筆示範時搶著畫的那一下、多指或手掌壓著的那一下不算沒描好（T-134）：示範收掉、輪到他，綠點等他描；
 *   - 按得太遠（吸不到）：圓點彈一下；連兩次再說一次「從綠點開始」；
 *   - 下一筆的起點有一圈光往外擴，看得出要從哪裡開始；
 *   - 10 秒沒動：筆從現在描到的地方往後描一次（不出墨、不說話）；再 15 秒說一次「從綠點開始」；
 *   - 畫完：字變彩虹色、跳一下、星星（TraceFx 的 RainbowDef），不靠語言就看得出「好了」，然後自己往下走；
 *     自己描完（照著跑道的順序走完，NEAT_OFF 0.75 以內）就這樣慶祝（T-111、T-112 放寬）；筆帶著描完、或描完但大多在跑道外：
 *     字填成這一輪的顏色、輕輕一聲、「You drew it!」（先肯定他有畫），自己描完的再由筆在字上輕輕描一次，念字的名字，照樣往下（drewIt）；
 *     作答紀錄照樣嚴格：自己描完、offRatio < 0.4、沒有沒描上的那一次，才算描好（GOOD_OFF）；
 *     稱讚（Great writing!）的時候（T-110，盲測 e6ecd05：他不知道要等，去點別的）：右邊這一輪的格子馬上變成描好的顏色、
 *     下一輪的格子跳一下（接下來描它）；這時候點描字板，彩虹字再跳一下、彈一聲（不會卡住、不會多記一筆）；
 *     稱讚念完只再停 0.2 秒就換下一輪（以前 0.45 秒）。作答紀錄在稱讚之前就記好了；稱讚本身照 T-108 不能搶；
 *   - 輪到他描 45 秒還沒描完（HELP_MS）：筆帶著把剩下的描完、照樣慶祝（不算自己描好）；
 *   - 描到這一筆的 60% 以上就放手（LIFT_FINISH，T-101、T-106）：剩下的一段補滿，算他描完（照常慶祝、往下走）；
 *   - 還剩哪一段（T-106）：描到一半，還沒描的跑道輕輕亮、小點往終點流（RestGuide），終點有星星，描過一半輕輕晃（GoalStar）。
 * from：同一天回來接著上時，從第幾輪開始（大寫描過了就只描小寫）；onRound 每一輪開始時告訴外面（記下接續點）。
 */
export function Trace({
  letter,
  rounds = ROUNDS,
  from = 0,
  onRound,
  retry,
  onDone,
}: {
  letter: LessonLetter
  /** 這一段描哪幾輪（描字段：大寫、小寫；寫寫看：大寫一輪、不示範） */
  rounds?: TraceRound[]
  from?: number
  onRound?: (round: number) => void
  /** 整堂課共用的重描次數（沒給：這一段自己算 LESSON_RETRIES 次） */
  retry?: RetryBudget
  onDone: (good: number) => void
}) {
  const ownRetry = useRef<RetryBudget>({ left: LESSON_RETRIES })
  const budget = retry ?? ownRetry.current
  const [r, setR] = useState(from)
  const round = rounds[r]
  const look = LOOKS[round.look]
  const strokes = round.big ? letter.upperLined : letter.lower
  const [stroke, setStroke] = useState(0)
  const [prog, setProg] = useState(0)
  const [done, setDone] = useState(false)
  const [demo, setDemo] = useState(false)
  const [hold, setHold] = useState(true)
  const [again, setAgain] = useState<number | null>(null)
  /** 稱讚的時候點了描字板：彩虹字再跳一下（每點一次加一） */
  const [cheerTap, setCheerTap] = useState(0)
  /** 這一輪描得好不好（描完才有）：好就彩虹慶祝；亂就平平地帶過、筆輕輕再示範一次（T-111） */
  const [neat, setNeat] = useState(true)
  /** 沒描上、亂畫的時候：字填滿、You drew it!、筆輕輕再描一次給他看 */
  const [review, setReview] = useState(false)
  /** 還沒描的跑道亮兩下（每次加一，T-112：偏離跑道、沒描上的時候只用畫面引導，不說 Almost） */
  const [glow, setGlow] = useState(0)
  /** 圓點彈一下（在哪裡、第幾次） */
  const [bounce, setBounce] = useState<{ at: P2; n: number } | null>(null)
  /** 吸附：手指按在哪裡（虛線從那裡連到起點） */
  const [snapFx, setSnapFx] = useState<{ from: P2; n: number } | null>(null)
  const tracker = useRef<PathTracker | null>(null)
  const paper = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const moved = useRef(false)
  /** 不能搶的那幾段：描完的慶祝、筆帶著描完、放手後補滿 */
  const busy = useRef(false)
  /** intro 說明、demo 筆的示範（可以搶）；turn 輪到孩子 */
  const phase = useRef<'intro' | 'demo' | 'turn'>('intro')
  /** 這一輪剛出來的 0.5 秒過了（PACE.BARGE_ARM） */
  const armed = useRef(false)
  const armTimer = useRef(0)
  const flow = useFlow()
  const live = useRef(true)
  const devs = useRef<{ offRatio: number; meanDev: number }[]>([])
  const good = useRef(0)
  const t0 = useRef(0)
  const misses = useRef(0)
  const strayed = useRef(0)
  const cheeredAt = useRef(0)
  const spoke = useRef(false)
  const fx = useRef(0)
  const ink = useRef<InkHandle>(null)
  const idle = useIdle()
  const helpTimer = useRef(0)
  /** 這一輪是筆帶著描完的 */
  const helped = useRef(false)
  /** 這一輪沒描好幾次（ATTEMPT_INK） */
  const tries = useRef(0)
  /** 已經說過 You drew it!（第二次沒描上，筆帶著描完之前先說） */
  const affirmed = useRef(false)
  /** 這一下（按下到放開）：墨水多長（描字板單位）、上一點 */
  const inkLen = useRef(0)
  const inkLast = useRef<P2 | null>(null)
  /** 按下去時描的是哪一筆（這一下描完一筆、換到下一筆的，不算沒描上） */
  const dragT = useRef<PathTracker | null>(null)
  /** 現在按在畫面上的手指（觸控的 pointerId）：兩根以上就是多指或手掌 */
  const touches = useRef(new Set<number>())
  /**
   * 這一下不算「沒描好」（T-134）：筆正在示範的時候搶著畫的那一下，或按著的時候畫面上有兩根以上的手指（手掌壓著）。
   * PM 三歲測試「走完一課」：示範時手掌壓上去滑一下，第一根手指畫了 9 mm 以上，就被當成沒描好、筆帶著描完，他根本沒描到。
   * 這一下照樣搶掉示範、描得上就照常算進度（描到 LIFT_FINISH 一樣補滿）；只是放手時不走 missed，綠點留著等他描。
   */
  const extra = useRef(false)
  const cur = useRef({ r: from, strokes, stroke: 0 })
  cur.current = { r, strokes, stroke }

  const nameKey = (big: boolean) => (big ? `ph.${letter.l}.big` : `ph.${letter.l}.little`)
  const glyphOf = (big: boolean) => (big ? letter.L : letter.l)

  const begin = (ss: string[], k: number) => {
    cur.current.stroke = k
    setStroke(k)
    tracker.current = new PathTracker(ss[k], 2, LANE * 0.85)
    setProg(0)
  }

  /** 吸附範圍換成描字板的座標（板子多大照實際畫面量） */
  const snapUnits = () => {
    const h = paper.current?.getBoundingClientRect().height ?? 0
    return h > 0 ? (SNAP_MM * PX_PER_MM * VIEW_H) / h : 0
  }

  /** 圓點彈一下：在這一筆現在要接著描的地方 */
  const bump = () => {
    const t = tracker.current
    if (!t) return
    setBounce({ at: t.samples[Math.min(t.progress, t.samples.length - 1)], n: ++fx.current })
  }

  /** 鼓勵的話：最少隔 CHEER_GAP_MS，不打斷別的話 */
  const cheer = (key: string) => {
    const now = performance.now()
    if (now - cheeredAt.current < CHEER_GAP_MS) return
    cheeredAt.current = now
    void say(key)
  }

  /** 筆照筆順描一次 */
  const showMe = async (ss: string[], big: boolean, ok: () => boolean) => {
    const s = performance.now()
    setDemo(true)
    await say('teach.watch.dodo')
    for (let k = 0; k < ss.length; k++) {
      if (!ok()) return
      begin(ss, k)
      const total = tracker.current!.samples.length - 1
      await wait(260)
      if (!ok()) return
      await tween(Math.max(900, total * 26), (f) => setProg(Math.round(f * total)), ok, easeInOut)
      if (!ok()) return
      sfx.correct()
    }
    setDone(true)
    await say(nameKey(big))
    if (!ok()) return
    await wait(300)
    if (!ok()) return
    setDone(false)
    setDemo(false)
    begin(ss, 0)
    phase.current = 'intro'
    void logTeach({ station: 'english', game: 'lesson-en', itemId: `write:${glyphOf(big)}`, skill: `write:${glyphOf(big)}`, level: 1, ms: Math.round(performance.now() - s) })
    // 示範完只說「Your turn!」（T-108：以前還先說 Start at the green dot! Go this way!，輪到他之前話太多；綠點一直在閃，10 秒沒動筆會再示範）
    await say('teach.turn.dodo')
  }

  /** 輪到孩子（說完、或被搶掉）：開始計時，45 秒還沒描完筆帶著描完 */
  const openTurn = () => {
    phase.current = 'turn'
    if (!t0.current) t0.current = performance.now()
    spoke.current = false
    idle.start(
      {
        repeat: () => void showAgain(),
        hint: () => {
          // 只說一次；之後每 40 秒筆再安靜地描一次
          if (!spoke.current) void say('d.intro.glyph')
          spoke.current = true
          void showAgain()
        },
      },
      { repeat: 10_000, hint: 15_000 },
    )
    clearTimeout(helpTimer.current)
    helpTimer.current = window.setTimeout(() => void helpFinish(), HELP_MS)
  }

  /** 孩子搶著下筆：停掉語音、筆的示範收掉，直接輪到他 */
  const takeOver = () => {
    const was = phase.current
    flow.cut()
    if (was === 'demo') {
      setDone(false)
      setDemo(false)
      begin(cur.current.strokes, 0)
    }
    openTurn()
  }

  /** 沒動 10 秒：筆從現在描到的地方往後描一次（不出墨），再停回孩子該接著描的地方 */
  const showAgain = async () => {
    const t = tracker.current
    if (!t || t.done) return
    const at = t.progress
    const to = t.samples.length - 1
    const same = () => live.current && tracker.current === t
    await tween(Math.max(1200, (to - at) * 22), (f) => setAgain(Math.round(at + (to - at) * f)), same, easeInOut)
    if (!same()) return setAgain(null)
    await wait(300)
    setAgain(same() ? t.progress : null)
  }

  /** 描太久（HELP_MS）：筆從孩子描到的地方把剩下的描完，跑道一樣填滿，然後照樣慶祝 */
  const helpFinish = async () => {
    if (!tracker.current || busy.current || !live.current) return
    busy.current = true
    drawing.current = false
    setHold(true)
    setAgain(null)
    idle.stop()
    helped.current = true
    const { strokes: ss } = cur.current
    setDemo(true)
    for (let k = cur.current.stroke; k < ss.length; k++) {
      if (k > cur.current.stroke) begin(ss, k)
      const t = tracker.current!
      const at = t.progress
      const total = t.samples.length - 1
      await tween(Math.max(700, (total - at) * 24), (f) => setProg(Math.round(at + (total - at) * f)), () => live.current, easeInOut)
      if (!live.current) return
      t.progress = total
      devs.current.push(t.metrics())
      sfx.correct()
    }
    setDemo(false)
    void finishRound()
  }

  const start = async (i: number) => {
    const rd = rounds[i]
    clearTimeout(helpTimer.current)
    helped.current = false
    tries.current = 0
    affirmed.current = false
    setNeat(true)
    setReview(false)
    setGlow(0)
    onRound?.(i)
    const ss = rd.big ? letter.upperLined : letter.lower
    const ok = flow.begin(live)
    devs.current = []
    setDone(false)
    setAgain(null)
    setBounce(null)
    setSnapFx(null)
    begin(ss, 0)
    busy.current = false
    phase.current = rd.demo ? 'demo' : 'intro'
    t0.current = 0
    armed.current = false
    setHold(true)
    clearTimeout(armTimer.current)
    // 剛出來的 0.5 秒：上一輪連點的手指先不算，之後示範、說明時下筆就搶
    armTimer.current = window.setTimeout(() => {
      if (!live.current || busy.current) return
      armed.current = true
      setHold(false)
    }, PACE.BARGE_ARM)
    idle.stop()
    ink.current?.clear()
    // 示範的「Watch me!」就是開頭，不再先說「Let's write it!」（T-108：少一句）
    if (rd.demo) await showMe(ss, rd.big, ok)
    else await say(nameKey(rd.big), 'd.intro.glyph')
    if (!ok()) return
    openTurn()
  }

  useEffect(() => {
    live.current = true
    const boot = window.setTimeout(() => void start(from), 0)
    return () => {
      live.current = false
      clearTimeout(boot)
      clearTimeout(armTimer.current)
      clearTimeout(helpTimer.current)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 數畫面上有幾根手指（T-134）：Ink 只跟著第一根手指，其他手指它不理，這裡在 window 的捕獲階段先數。
  // 按著的時候又多一根手指（手掌壓上來）：這一下也不算沒描好
  useEffect(() => {
    const set = touches.current
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      set.add(e.pointerId)
      if (set.size >= 2) extra.current = true
    }
    const up = (e: PointerEvent) => void set.delete(e.pointerId)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      set.clear()
    }
  }, [])

  const strokeDone = async () => {
    const { strokes: ss } = cur.current
    devs.current.push(tracker.current!.metrics())
    sfx.correct()
    const k = cur.current.stroke + 1
    if (k < ss.length) {
      begin(ss, k)
      return void say('d.glyph.next')
    }
    void finishRound()
  }

  /**
   * 筆帶著描完、或描完但大多在跑道外（T-111；T-112 改成先肯定）：「You drew it!」，自己描完的再由筆照筆順在填好的字上
   * 輕輕描一次（不出墨；筆剛帶著描完的就不再描），念出字的名字（Big S.）。
   * 這一段不能搶（busy）；點描字板只有輕輕一聲（不會卡住、不會多記一筆）
   */
  const drewIt = async (i: number) => {
    const ss = rounds[i].big ? letter.upperLined : letter.lower
    const alive = () => live.current
    setReview(true)
    if (!affirmed.current) await say('d.glyph.drew')
    if (!helped.current) {
      setDemo(true)
      for (let k = 0; k < ss.length; k++) {
        if (!alive()) return
        begin(ss, k)
        const total = tracker.current!.samples.length - 1
        await tween(Math.max(700, total * 18), (f) => setProg(Math.round(f * total)), alive, easeInOut)
      }
    }
    if (!alive()) return
    setDemo(false)
    await say(nameKey(rounds[i].big))
    setReview(false)
  }

  /** 這一下是不是一次「沒描好」（ATTEMPT_INK）：這一筆還沒描完、畫了一段；這一下描完一筆換到下一筆的不算 */
  const isAttempt = (t: PathTracker, ink: number) => t === dragT.current && !t.done && ink >= ATTEMPT_INK

  /**
   * 沒描上（T-112）：先肯定他有畫，只用畫面引導，不說 Almost。
   * 整堂課只有第一次、而且是完全沒描上跑道（亂畫）的時候：Nice try!、還沒描的跑道亮兩下、筆從他描到的地方輕輕帶到終點（不出墨），再讓他描。
   * 其他的（描到一半放手、這一輪重描過、這堂課已經重描過一次）：You drew it!，筆從他停下來的地方帶著描完（helpFinish，記成筆帶著的），往下走。
   * T-122（盲測 ca0d1e1 英文 seed 1、seed 2 重跑：描到一半放手被說 Nice try、要重描，「好煩」按返回離開）：描到一半放手不再要他重描。
   */
  const missed = async (partial: boolean) => {
    idle.poke()
    misses.current = 0
    // 這幾秒不要再插「從綠點開始」
    cheeredAt.current = performance.now()
    tries.current++
    if (!partial && tries.current === 1 && budget.left > 0) {
      budget.left--
      setGlow((g) => g + 1)
      void say('d.glyph.try')
      void showAgain()
      return
    }
    busy.current = true
    setHold(true)
    idle.stop()
    clearTimeout(helpTimer.current)
    affirmed.current = true
    await say('d.glyph.drew')
    if (!live.current) return
    busy.current = false
    void helpFinish()
  }

  /** 這一輪描完（自己描完，或筆帶著描完）：記一筆、慶祝，往下一輪 */
  const finishRound = async () => {
    const { r: i } = cur.current
    clearTimeout(helpTimer.current)
    setDone(true)
    busy.current = true
    setHold(true)
    idle.stop()
    const g = glyphOf(rounds[i].big)
    const off = devs.current.reduce((a, d) => a + d.offRatio, 0) / devs.current.length
    // 熟練照樣嚴格（T-112 只放寬回饋）：自己描完、大部分在跑道裡、中間沒有沒描上的那一次
    const ok = off < GOOD_OFF && !helped.current && !tries.current
    if (ok) good.current++
    void logAttempt({
      station: 'english',
      game: 'lesson-en',
      itemId: `write:${g}`,
      skill: `write:${g}`,
      phase: 'quiz',
      level: 1,
      options: [],
      answer: g,
      taps: [],
      firstTryCorrect: ok,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: helped.current,
      metrics: {
        strokes: cur.current.strokes.length,
        offRatio: Math.round(off * 100) / 100,
        ...(helped.current ? { helped: 1 } : {}),
        ...(tries.current ? { tries: tries.current } : {}),
      },
    })
    // 依描的品質給回饋（T-111；T-112 放寬，盲測 b637ff7：連兩次被說不對就離開了）：
    // - 自己描完（照著跑道的順序走完，NEAT_OFF 以內；沒描上一次、重描描完的也算）：彩虹、跳一下、星星、完成的音效、Great writing!（A5）
    // - 筆帶著描完、描完但大多在跑道外：字填成這一輪的顏色，輕輕一聲，先肯定他有畫（You drew it!），
    //   筆在字上輕輕再描一次、念出字的名字，然後照樣往下（不要求重描：三歲描不準是正常的，不能讓他受挫、也不拖長）
    const tidy = off < NEAT_OFF && !helped.current
    setNeat(tidy)
    if (tidy) {
      sfx.done()
      await say('d.glyph.done')
    } else {
      sfx.pop()
      await drewIt(i)
    }
    await wait(PRAISE_TAIL_MS)
    if (!live.current) return
    if (i + 1 >= rounds.length) return onDone(good.current)
    // 停在描好的字上，等孩子點「下一步」才描下一個（T-118：不自己換）；進度先記下，離開再回來從下一輪接著上
    onRound?.(i + 1)
    if (!(await nextStep()) || !live.current) return
    setR(i + 1)
    void start(i + 1)
  }

  const onDown = (p: P2) => {
    if (!tracker.current || busy.current || !armed.current) return
    // 示範、說明的時候下筆：示範收掉，這一筆照常描
    // 只有筆正在示範（demo）的那一下：示範完念「Your turn!」、說明的時候（intro）下筆是真的在描，照常算
    extra.current = phase.current === 'demo' || touches.current.size >= 2
    if (phase.current !== 'turn') takeOver()
    const t = tracker.current
    idle.poke()
    setAgain(null)
    moved.current = false
    strayed.current = 0
    inkLen.current = 0
    inkLast.current = p
    dragT.current = t
    // 接著描、描到一半又從起點重新開始、或起點附近吸過去（track.ts 的 penDown）
    const how = t.penDown(p, snapUnits())
    drawing.current = !!how
    if (how === 'snap') {
      setSnapFx({ from: p, n: ++fx.current })
      misses.current = 0
    } else if (how) misses.current = 0
    else {
      // 按得太遠：圓點彈一下告訴他在這裡；連兩次再說一次從綠點開始
      bump()
      if (++misses.current >= 2) {
        misses.current = 0
        cheer('d.intro.glyph')
      }
    }
  }
  const onMove = (p: P2) => {
    const t = tracker.current
    if (!t || busy.current || phase.current !== 'turn') return
    idle.poke()
    // 墨水長度（不管有沒有描上，按得太遠的那一下也算）：放開時判斷是不是畫了一大段卻沒描上
    if (inkLast.current) inkLen.current += Math.hypot(p.x - inkLast.current.x, p.y - inkLast.current.y)
    inkLast.current = p
    if (!drawing.current) return
    if (t.feed(p)) {
      moved.current = true
      strayed.current = 0
      setProg(t.progress)
      if (t.done) {
        drawing.current = false
        void strokeDone()
      }
    } else if (t.lastDev > LANE * 1.3 && ++strayed.current === STRAY_POINTS) {
      // 一直畫在跑道外面：圓點彈一下、還沒描的跑道亮兩下（只用畫面，不說話，T-112）
      bump()
      setGlow((g) => g + 1)
    }
  }
  /** 描到大部分就放手（LIFT_FINISH）：剩下的一小段很快補滿，接著跟描到底一樣 */
  const fillRest = async (t: PathTracker) => {
    busy.current = true
    const at = t.progress
    const end = t.samples.length - 1
    // 剩下的越長補得越慢一點（最多 0.6 秒）：看得到是「帶著描完」，不是突然跳到好了
    await tween(Math.min(600, 200 + (end - at) * 8), (f) => setProg(Math.round(at + (end - at) * f)), () => live.current && tracker.current === t)
    if (!live.current || tracker.current !== t) return
    t.progress = end
    busy.current = false
    void strokeDone()
  }

  const onUp = () => {
    const t = tracker.current
    const len = inkLen.current
    const was = inkLast.current
    inkLen.current = 0
    inkLast.current = null
    const open = !!t && !t.done && !busy.current && phase.current === 'turn'
    if (open && drawing.current && t.progress > 0 && t.ratio >= LIFT_FINISH) {
      // 描到大部分就放手：算描完（T-101）
      void fillRest(t)
    } else if (open && was && isAttempt(t, len) && !extra.current) {
      // 沒描好（沒描上、描到一半放手都算，T-112、T-113）：描到一半放手的，筆從斷掉的地方帶著描完往下走；
      // 完全沒描上的，整堂課第一次 Nice try! 再描一次，之後也是帶著描完（T-122，missed）。
      // 沒描上的線淡掉；描到一半的照舊留著（跑道已經填到那裡）
      if (drawing.current && t.progress > 0) bump()
      const partial = drawing.current && t.progress > 0
      if (!moved.current) ink.current?.fadeLast(200)
      drawing.current = false
      moved.current = false
      return void missed(partial)
    } else if (open && drawing.current && t.progress > 0) {
      // 只碰一下：圓點在停下來的地方彈一下
      bump()
    }
    drawing.current = false
    if (!moved.current) ink.current?.fadeLast()
    moved.current = false
  }

  /** 這一輪描完了（不是筆的示範畫完）：稱讚的時候、描得亂筆再描一次的時候 */
  const finished = done && (!demo || review)
  /** 描得好：彩虹字、跳一下、星星（描得亂只填這一輪的顏色，T-111） */
  const rainbow = finished && neat && !review
  const st = strokeStart(strokes[stroke])
  const samples = tracker.current?.samples ?? []
  const total = Math.max(1, samples.length - 1)
  const tip = samples[Math.min(prog, samples.length - 1)] ?? st

  /**
   * 還沒描的那一段跑道亮兩下（T-112，偏離跑道、沒描上的時候只用畫面引導，不說 Almost）：從描到的地方到終點。
   * 亮兩下用 CSS 動畫（english.css 的 en-trace-glow，只動透明度、播一次就停）；換 key 重新播。暖黃色，跟描好的綠色分得開
   */
  const glowLane = (w: number, color: string) =>
    glow > 0 && (
      <g key={`glow-${glow}-${w}`} className="en-trace-glow" data-trace-glow="">
        <path d={strokes[stroke]} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`0 ${prog} ${total + 5} 0`} />
      </g>
    )

  return (
    // data-demo、data-accepting：三歲模擬測試看得到「示範中」「還不能畫」（tests/toddler/probe.js 的 teaching()）
    <div
      className="en-trace"
      data-demo={demo ? '1' : undefined}
      data-accepting={hold ? 'false' : undefined}
      onPointerDown={() => {
        // 描完、稱讚的時候碰畫面：彩虹字再跳一下（溫和的回應，不會卡住，也不會多記一筆）；描得亂、筆在示範時只有輕輕一聲
        if (!finished) return
        sfx.tap()
        if (rainbow) setCheerTap((n) => n + 1)
      }}
    >
      {/* 兩輪：大寫、小寫，描好的變成那一輪的顏色。描完、稱讚的時候這一輪就變色，下一輪的格子跳一下（接下來描它，T-110） */}
      <div className="en-trace-rounds" aria-hidden="true">
        {rounds.map((x, i) => (
          <span
            key={i}
            className={i < r || (i === r && finished) ? 'is-done' : i === r ? 'is-now' : i === r + 1 && finished ? 'is-now turn-hop' : ''}
            style={{ '--round': LOOKS[x.look].tag } as CSSProperties}
          >
            {x.big ? letter.L : letter.l}
          </span>
        ))}
      </div>
      <div className="en-trace-paper" ref={paper}>
        <AnimatePresence initial={false}>
          <motion.div key={r} className="en-trace-board" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.45 } }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
            <svg viewBox={`0 0 100 ${VIEW_H}`} className="en-trace-svg" aria-hidden="true">
              <RainbowDef id={`en-rainbow-${r}`} w={100} h={VIEW_H} />
              {/*
                四線格（學校的作業簿；T-132 起大寫、小寫都有，同一個位置）：頂線、中線（虛線）、底線（深一點）、下緣。
                大 S 從頂線到底線、小 s 從中線到底線，兩輪一比就看得出大小寫差在哪裡。
                格線是暖灰色的細線，跟跑道（粗、彩色、有綠點和箭頭）長得完全不一樣，不會被當成要描的線；
                它只是畫在跑道底下的圖，描字的判斷（PathTracker）只看這一筆的跑道，跟格線無關
              */}
              <g className="en-trace-lines" data-grid="">
                <line x1="2" x2="98" y1={LINES.top} y2={LINES.top} data-line="top" />
                <line x1="2" x2="98" y1={LINES.mid} y2={LINES.mid} strokeDasharray="2.4 2.4" data-line="mid" />
                <line x1="2" x2="98" y1={LINES.base} y2={LINES.base} className="is-base" data-line="base" />
                <line x1="2" x2="98" y1={LINES.bottom} y2={LINES.bottom} data-line="bottom" />
              </g>
              {!done && glowLane(LANE + 14, '#FFEDB0')}
              {/* 畫完（不是示範）：整個字變彩虹色、跳一下 */}
              <g key={cheerTap} className={rainbow ? 'trace-pop' : undefined} data-trace-finished={finished ? '' : undefined} data-trace-neat={finished ? (neat ? '1' : '0') : undefined}>
                {strokes.map((d, i) => (
                  <g key={i}>
                    <path d={d} fill="none" stroke={look.rim} strokeWidth={LANE + 3} strokeLinecap="round" strokeLinejoin="round" />
                    <path
                      d={d}
                      fill="none"
                      stroke={rainbow ? `url(#en-rainbow-${r})` : i < stroke || done ? look.lane : '#FBF8F2'}
                      strokeWidth={LANE}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                ))}
              </g>
              {!done && (
                <>
                  {/* 還沒描的那一段跑道亮兩下（偏離跑道、沒描上的時候，T-112）：跑道中間亮黃，外圈的光暈在跑道下面（glowLane） */}
                  {glowLane(LANE - 6, '#FFE07A')}
                  <path d={strokes[stroke]} fill="none" stroke={look.lane} strokeWidth={LANE} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`${prog} ${total + 5}`} />
                  <path d={strokes[stroke]} fill="none" stroke={look.dash} strokeWidth={1.2} strokeDasharray="3 3" strokeLinecap="round" />
                  {/* 這一筆的起點：一圈光往外擴（每一筆開始時兩次），看得出要從哪裡開始 */}
                  {prog === 0 && !demo && !hold && (
                    <motion.circle
                      key={`ring-${r}-${stroke}`}
                      data-start-ring=""
                      cx={st.x}
                      cy={st.y}
                      fill="none"
                      stroke={look.dot}
                      strokeWidth={1.6}
                      initial={{ r: 6, opacity: 0.9 }}
                      animate={{ r: 17, opacity: 0 }}
                      transition={{ duration: 1.1, repeat: 2, ease: 'easeOut' }}
                    />
                  )}
                  {/* 起點：描到一半就淡掉，綠點換到要接著描的地方（ResumeDot） */}
                  <motion.circle cx={st.x} cy={st.y} r={6} fill={look.dot} animate={{ r: prog > 0 ? 4 : [5.5, 8, 5.5], opacity: prog > 0 && !demo ? 0.35 : 1 }} transition={{ duration: 1.2, repeat: prog > 0 || hold ? 0 : Infinity }} />
                  {/* 還剩哪一段：還沒描的跑道輕輕亮、小點往終點流；終點的星星，描過一半輕輕晃（快好了） */}
                  {prog > 0 && !demo && !hold && <RestGuide d={strokes[stroke]} at={prog} total={total} color={look.dot} lane={LANE} />}
                  {samples.length > 0 && <GoalStar at={samples[samples.length - 1]} from={samples[0]} near={prog / total >= 0.5 && !demo} />}
                  {prog > 0 && !demo && !hold && <ResumeDot at={tip} color={look.dot} />}
                  {prog === 0 && (
                    <g transform={`translate(${st.x} ${st.y}) rotate(${st.ang}) translate(13 0)`}>
                      <path d="M-4 -5 L4 0 L-4 5" fill="none" stroke={look.dot} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  )}
                </>
              )}
              {/* 吸附：從手指按下去的地方一條虛線連到起點，起點亮一圈 */}
              <AnimatePresence>
                {snapFx && !done && (
                  <motion.g key={snapFx.n} data-snap="" initial={{ opacity: 1 }} animate={{ opacity: 0, transition: { delay: 0.6, duration: 0.5 } }} onAnimationComplete={() => setSnapFx((s) => (s?.n === snapFx.n ? null : s))}>
                    <line x1={snapFx.from.x} y1={snapFx.from.y} x2={samples[0]?.x ?? st.x} y2={samples[0]?.y ?? st.y} stroke={look.dot} strokeWidth={1.4} strokeDasharray="2 2" strokeLinecap="round" />
                    <circle cx={snapFx.from.x} cy={snapFx.from.y} r={2.4} fill={look.dot} opacity={0.5} />
                    <motion.circle cx={st.x} cy={st.y} fill="none" stroke={look.dot} strokeWidth={2} initial={{ r: 6 }} animate={{ r: 11 }} transition={{ duration: 0.4, ease: 'easeOut' }} />
                  </motion.g>
                )}
              </AnimatePresence>
              {/* 圓點彈一下：在要接著描的地方 */}
              {bounce && !done && !demo && (
                <motion.circle
                  key={bounce.n}
                  data-bounce=""
                  cx={bounce.at.x}
                  cy={bounce.at.y}
                  fill={look.dot}
                  initial={{ r: 4, opacity: 0.95 }}
                  animate={{ r: [4, 10, 5.5], opacity: [0.95, 0.9, 0] }}
                  transition={{ duration: 0.9, ease: 'easeOut', times: [0, 0.35, 1] }}
                />
              )}
              {again !== null && !demo && !done && samples[again] && (
                <g data-demo-hand="" transform={`translate(${samples[again].x} ${samples[again].y})`} opacity={0.85}>
                  <PenArt scale={0.3} />
                </g>
              )}
              {demo && (
                <g transform={`translate(${tip.x} ${tip.y})`}>
                  <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <PenArt scale={0.3} />
                  </motion.g>
                </g>
              )}
            </svg>
            {rainbow && (
              <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
                <Sparkles count={18} />
              </div>
            )}
            <Ink
              ref={(v) => {
                if (v) ink.current = v
              }}
              w={100}
              h={VIEW_H}
              color="rgba(46,42,37,0.6)"
              size={3.2}
              disabled={hold}
              onDown={onDown}
              onMove={onMove}
              onUp={onUp}
            />
          </motion.div>
        </AnimatePresence>
      </div>
      {/* 手指也可以：只是個小提示，不擋 */}
      <div className="en-trace-tool" aria-hidden="true">
        <svg viewBox="-40 -92 90 100" width="46">
          <PenArt />
        </svg>
        <svg viewBox="-6 -2 76 92" width="34">
          <HandArt cuff="#BFE0CC" />
        </svg>
      </div>
    </div>
  )
}
