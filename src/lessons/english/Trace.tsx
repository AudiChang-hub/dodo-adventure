import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ink, type InkHandle } from '../../games/draw/Ink'
import { HELP_MS, LIFT_FINISH, PathTracker, PX_PER_MM, SNAP_MM, samplePath, type P2 } from '../../games/draw/track'
import { GoalStar, RainbowDef, RestGuide, ResumeDot } from '../../games/draw/TraceFx'
import { HandArt, PenArt, easeInOut, tween } from '../../games/Demo'
import { Sparkles } from '../../ui/Sparkles'
import { useIdle } from '../../games/idle'
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
} as const

/**
 * 描字的回合（A5，全球幼教指引：3～4 歲描字只示範、不求多）：大寫一次、小寫一次，每一次都先示範、描完就慶祝。
 * 以前是大寫兩次、小寫兩次，AI 小男生每次到第二遍就無聊、按返回。兩輪換顏色，看得出是新的一輪。
 */
const ROUNDS: { big: boolean; demo: boolean; look: keyof typeof LOOKS }[] = [
  { big: true, demo: true, look: 'green' },
  { big: false, demo: true, look: 'blue' },
]

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
 * 一次「沒描上」（T-112）：這一下畫了一大段（墨水長度 ≥ 這一筆的 40%、至少 30 單位），進度卻幾乎沒動（< 這一筆的 25%）。
 * 盲測 b637ff7 seed 3：從綠點往右下畫、跳過 S 上面的彎，一大段墨水、進度 1%，被說兩次 Almost 就離開了。
 * 拖到一半放手、進度有跟著走的（歷次盲測 32～59%）不算，照舊從斷掉的地方接著描。
 */
const MESSY_INK = 0.4
const MESSY_INK_MIN = 30
const MESSY_GAIN = 0.25
/** 第幾次沒描上就由筆帶著描完、往下走（最多重試一次，不卡關） */
const MAX_TRIES = 2

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
 *     不說話（盲測：Keep going! 他聽不懂，T-95）；
 *   - 一直偏離跑道：圓點彈一下、還沒描的跑道亮兩下（不說話；以前說 Almost! Follow the line!，T-112 拿掉）；
 *   - 畫了一大段卻沒描上（MESSY_*，T-112）：那條線淡掉。第一次「Nice try!」、跑道亮兩下、筆從他描到的地方輕輕帶到終點，再讓他描；
 *     第二次「You drew it!」、筆帶著描完，往下一輪（最多重試一次，不卡關；不說 Almost、不讓他覺得錯了）；
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
export function Trace({ letter, from = 0, onRound, onDone }: { letter: LessonLetter; from?: number; onRound?: (round: number) => void; onDone: (good: number) => void }) {
  const [r, setR] = useState(from)
  const round = ROUNDS[r]
  const look = LOOKS[round.look]
  const strokes = round.big ? letter.upper : letter.lower
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
  /** 這一輪沒描上幾次（MESSY_*） */
  const tries = useRef(0)
  /** 已經說過 You drew it!（第二次沒描上，筆帶著描完之前先說） */
  const affirmed = useRef(false)
  /** 這一下（按下到放開）：墨水多長（描字板單位）、上一點、按下時進度到哪 */
  const inkLen = useRef(0)
  const inkLast = useRef<P2 | null>(null)
  const dragFrom = useRef(0)
  /** 按下去時描的是哪一筆（這一下描完一筆、換到下一筆的，不算沒描上） */
  const dragT = useRef<PathTracker | null>(null)
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
    const rd = ROUNDS[i]
    clearTimeout(helpTimer.current)
    helped.current = false
    tries.current = 0
    affirmed.current = false
    setNeat(true)
    setReview(false)
    setGlow(0)
    onRound?.(i)
    const ss = rd.big ? letter.upper : letter.lower
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
    const ss = ROUNDS[i].big ? letter.upper : letter.lower
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
    await say(nameKey(ROUNDS[i].big))
    setReview(false)
  }

  /** 這一下是不是「畫了一大段卻沒描上」（MESSY_*） */
  const isMessy = (t: PathTracker, ink: number) => {
    const n = t.samples.length - 1
    return t === dragT.current && !t.done && ink >= Math.max(MESSY_INK_MIN, n * 2 * MESSY_INK) && (t.progress - dragFrom.current) / n < MESSY_GAIN
  }

  /**
   * 沒描上（T-112）：先肯定他有畫，只用畫面引導，不說 Almost。
   * 第一次：Nice try!、還沒描的跑道亮兩下、筆從他描到的地方輕輕帶到終點（不出墨），再讓他描。
   * 第二次：You drew it!，筆帶著描完（helpFinish，記成筆帶著的），往下一輪。
   */
  const missed = async () => {
    idle.poke()
    misses.current = 0
    // 這幾秒不要再插「從綠點開始」
    cheeredAt.current = performance.now()
    if (++tries.current < MAX_TRIES) {
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
    const g = glyphOf(ROUNDS[i].big)
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
    if (i + 1 >= ROUNDS.length) return onDone(good.current)
    setR(i + 1)
    void start(i + 1)
  }

  const onDown = (p: P2) => {
    if (!tracker.current || busy.current || !armed.current) return
    // 示範、說明的時候下筆：示範收掉，這一筆照常描
    if (phase.current !== 'turn') takeOver()
    const t = tracker.current
    idle.poke()
    setAgain(null)
    moved.current = false
    strayed.current = 0
    inkLen.current = 0
    inkLast.current = p
    dragFrom.current = t.progress
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
    } else if (open && was && isMessy(t, len)) {
      // 畫了一大段卻沒描上：那條線淡掉，Nice try! ＋跑道亮、筆帶一次；第二次就帶著描完往下走（T-112）
      drawing.current = false
      moved.current = false
      ink.current?.fadeLast(200)
      return void missed()
    } else if (open && drawing.current && t.progress > 0) {
      // 描到一半放手：圓點在停下來的地方彈一下（之後綠點一直在那裡閃，ResumeDot），不說話
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
        {ROUNDS.map((x, i) => (
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
              {/* 小寫的四條線（學校的作業簿）：中線虛線 */}
              {!round.big && (
                <g className="en-trace-lines">
                  <line x1="2" x2="98" y1={LINES.top} y2={LINES.top} />
                  <line x1="2" x2="98" y1={LINES.mid} y2={LINES.mid} strokeDasharray="2.4 2.4" />
                  <line x1="2" x2="98" y1={LINES.base} y2={LINES.base} className="is-base" />
                  <line x1="2" x2="98" y1={LINES.bottom} y2={LINES.bottom} />
                </g>
              )}
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
