import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, type TargetAndTransition } from 'motion/react'
import { Shell } from '../Shell'
import { Hand } from '../Demo'
import { WaitShield, firstFinger, localPoint, useNotYet } from '../NotYet'
import { wait } from '../lines'
import { DoneChoices } from '../draw/DoneChoices'
import { hushSpeech, say, sfx } from '../../lib/audio'
import { logAttempt, logTeach } from '../../lib/record'
import { today } from '../../lib/db'
import { go } from '../../lib/nav'
import { bedtimeIfDue } from '../../lib/session'
import { useLive } from '../logic/kit'
import { Emoji } from '../../art/Emoji'
import { Critter } from '../picnic/art'
import { DrumArt, DrumPickArt, Stage } from './art'
import { playSegment, step, whoa } from './beat'
import { DRUM_COPLAY } from './coplay'
import { DRUM_GAME, DRUM_LEVELS, drumSkill, judgeStop, makeSong, rememberSong, songOk, stepDrum, type DrumSegment, type DrumSong, type DrumState } from './plan'
import { loadDrum, saveDrum } from './progress'
import '../draw/tools.css'
import './drum.css'

/** 鼓響了這麼久都沒點：說一次「Tap me to dance!」、手點一下角色（一首只提醒一次） */
const NUDGE_MS = 4000
/** 跳舞的動作（每點一下換一個）：跳一下、往左擺、往右擺、蹲一下、轉過身 */
const MOVES = ['hop', 'left', 'right', 'squat', 'turn'] as const
type Move = (typeof MOVES)[number]
const MOVE_ANIM: Record<Move, TargetAndTransition> = {
  hop: { y: ['0%', '-12%', '0%'] },
  left: { rotate: [0, -12, 0] },
  right: { rotate: [0, 12, 0] },
  squat: { scaleY: [1, 0.84, 1.04, 1], scaleX: [1, 1.1, 0.98, 1] },
  turn: { y: ['0%', '-6%', '0%'] },
}

/**
 * 鼓聲停就不動（T-160，指引 CG-3）：舞台上一個角色、旁邊一個鼓。鼓響的時候點畫面，角色跟著跳舞（每點一下換一個動作）；
 * 鼓一停（鼓棒交叉放下、上面一隻舉起來的手）就要停手。停的時候還在點，角色搖搖晃晃差點跌倒、滑哨「咻～」（好笑、不懲罰），
 * 豆豆說一次「Whoa! Freeze!」。一首停 3～5 次，跳完停在「再跳一次／回首頁」（HOW-9）。
 * 第 1 級停的時候豆豆說「Freeze!」、最後一下鼓加重；熟練了不說、不加重、停在一小節的中間、停的時間更短（./plan.ts 的 DRUM_LEVELS）。
 * 第一次玩：手先示範（點兩下跳舞、鼓停了手就拿開）。
 */
export function Drum() {
  const [song, setSong] = useState<DrumSong | null>(null)
  const prog = useRef<DrumState | null>(null)
  const [n, setN] = useState(0)
  const [resting, setResting] = useState(false)
  const start = (p: DrumState) => {
    const s = makeSong(p)
    prog.current = rememberSong(p, s)
    void saveDrum(prog.current)
    setSong(s)
  }
  useEffect(() => {
    let on = true
    void loadDrum().then((p) => {
      if (!on || prog.current) return
      start(p)
    })
    return () => {
      on = false
    }
  }, [])
  const again = () => {
    const p = prog.current
    if (!p || bedtimeIfDue()) return
    setResting(false)
    start(p)
    setN((k) => k + 1)
  }
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hintText={resting ? DRUM_COPLAY.now : DRUM_COPLAY.play}>
      {song && <DrumView key={n} song={song} prog={prog} onDone={() => setResting(true)} onAgain={again} resting={resting} />}
    </Shell>
  )
}

function DrumView({ song, prog, onDone, onAgain, resting }: { song: DrumSong; prog: { current: DrumState | null }; onDone: () => void; onAgain: () => void; resting: boolean }) {
  const { level } = song
  const spec = DRUM_LEVELS[level]
  const live = useLive()
  const notYet = useNotYet()
  const area = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<'intro' | 'play' | 'freeze' | 'end'>('intro')
  const [hit, setHit] = useState(0)
  const [dance, setDance] = useState(0)
  const [facing, setFacing] = useState(false)
  const [wobble, setWobble] = useState(0)
  const [hand, setHand] = useState<{ x: number; y: number; tap: number } | null>(null)
  const [hold, setHold] = useState(true)
  const [demo, setDemo] = useState(false)
  const [done, setDone] = useState(false)
  const [poke, setPoke] = useState(0)
  const [segNo, setSegNo] = useState(0)

  const st = useRef({
    phase: 'intro' as 'intro' | 'play' | 'freeze' | 'end',
    demo: false,
    taps: [] as number[],
    whoaSaid: false,
    nudged: false,
    results: [] as ('held' | 'moved' | 'idle')[],
    log: [] as { pick: string; ms: number }[],
    t0: 0,
    cancel: null as null | (() => void),
  })
  const setPh = (p: 'intro' | 'play' | 'freeze' | 'end') => {
    st.current.phase = p
    setPhase(p)
  }

  /** 角色跳一下（點畫面、示範的手） */
  const danceN = useRef(0)
  const danceStep = () => {
    const next = ++danceN.current
    if (MOVES[(next - 1) % MOVES.length] === 'turn') setFacing((f) => !f)
    step(next)
    setDance(next)
  }
  const wobbleNow = () => {
    setWobble((w) => w + 1)
    whoa()
  }

  /** 打一段鼓，等到鼓停；回傳這一段的開始、停的時間（performance.now 毫秒） */
  const drumOnce = async (seg: DrumSegment, ok: () => boolean) => {
    const c = playSegment(seg, song.kit, spec.accent, () => {
      if (live.current) setHit((h) => h + 1)
    })
    st.current.cancel = c.cancel
    await wait(Math.max(0, c.start - performance.now()))
    return { c, alive: ok() }
  }

  const record = () => {
    const s = st.current
    const r = songOk(s.results)
    const demoed = s.log.some((x) => x.pick === 'demo')
    const phaseKind = r.counted && !demoed ? 'quiz' : 'guided'
    void logAttempt({
      station: 'logic',
      game: DRUM_GAME,
      itemId: `drum:${song.dancer}:${song.kit}`,
      skill: drumSkill(level),
      phase: phaseKind,
      level,
      options: ['dance', 'freeze'],
      answer: 'freeze',
      taps: s.log,
      firstTryCorrect: r.ok,
      attempts: s.results.length,
      responseMs: Math.round(performance.now() - s.t0),
      hintUsed: s.nudged,
      heard: true,
      metrics: { stops: s.results.length, held: r.held, moved: r.moved, idle: s.results.filter((x) => x === 'idle').length, taps: s.taps.length, ...(demoed ? { shown: 1 } : {}) },
    })
    const p = prog.current
    if (p) {
      prog.current = stepDrum(p, { date: today(), ok: r.ok, counted: phaseKind === 'quiz' })
      void saveDrum(prog.current)
    }
    return r
  }

  /** 第一次玩：手點兩下讓角色跳舞，鼓一停手就拿開 */
  const runDemo = async (ok: () => boolean) => {
    const s = st.current
    s.demo = true
    setDemo(true)
    const t0 = performance.now()
    await say('teach.watch.dodo')
    if (!ok()) return false
    const seg: DrumSegment = { play: 3.2, bpm: [96, 96], pattern: 'march', freeze: 2 }
    setPh('play')
    const { c, alive } = await drumOnce(seg, ok)
    if (!alive) return false
    const at = { x: 50, y: 52 }
    for (let k = 0; k < 4 && performance.now() < c.stop - 500; k++) {
      setHand((h) => ({ ...at, tap: (h?.tap ?? 0) + 1 }))
      danceStep()
      await wait(700)
      if (!ok()) return false
    }
    await wait(Math.max(0, c.stop - performance.now()))
    if (!ok()) return false
    setPh('freeze')
    setHand({ x: 78, y: 70, tap: 0 })
    await say('dr.freeze')
    if (!ok()) return false
    await wait(1200)
    if (!ok()) return false
    setHand(null)
    void logTeach({ station: 'logic', game: DRUM_GAME, itemId: `drum:${song.dancer}:demo`, skill: drumSkill(level), level, ms: Math.round(performance.now() - t0) })
    s.log.push({ pick: 'demo', ms: 0 })
    await say('teach.turn.dodo')
    if (!ok()) return false
    s.demo = false
    setDemo(false)
    return true
  }

  const run = async () => {
    const s = st.current
    // 一首歌的流程只在離開畫面時停（停的時候點畫面只是插一句話，不會打斷整首）
    const ok = () => live.current
    s.t0 = performance.now()
    const p = prog.current
    // 第一次玩（剛開始的那一首）手先示範；前 3 首、還有第 1 級每次都先說規則
    const first = (p?.plays ?? 1) <= 1
    if (first || level === 1 || (p?.plays ?? 0) <= 3) {
      await say('dr.rule')
      if (!ok()) return
    }
    if (first && !(await runDemo(ok))) return
    await say('dr.tap')
    if (!ok()) return
    setHold(false)
    for (let i = 0; i < song.segments.length; i++) {
      const seg = song.segments[i]
      setSegNo(i + 1)
      s.whoaSaid = false
      setPh('play')
      if (i > 0 && spec.sayFreeze) void say('dr.dance')
      const { c, alive } = await drumOnce(seg, ok)
      if (!alive) return
      // 鼓響了一陣子都沒點：提醒一次（說一句、手點一下角色）
      const nudge = window.setTimeout(() => {
        const t = st.current
        if (!live.current || t.nudged || t.phase !== 'play' || t.taps.some((x) => x >= c.start)) return
        t.nudged = true
        void say('dr.tap')
        setHand((h) => ({ x: 50, y: 52, tap: (h?.tap ?? 0) + 1 }))
        window.setTimeout(() => setHand(null), 1600)
      }, NUDGE_MS)
      await wait(Math.max(0, c.stop - performance.now()))
      clearTimeout(nudge)
      if (!ok()) return
      setHand(null)
      setPh('freeze')
      if (spec.sayFreeze) void say('dr.freeze')
      const freezeEnd = c.stop + seg.freeze * 1000
      await wait(Math.max(0, freezeEnd - performance.now()))
      if (!ok()) return
      const r = judgeStop(s.taps, c.start, c.stop, freezeEnd, spec.grace * 1000)
      s.results.push(r)
      s.log.push({ pick: `stop${i + 1}:${r}`, ms: Math.round(c.stop - s.t0) })
    }
    // 跳完了
    setPh('end')
    setDone(true)
    setHold(true)
    sfx.done()
    const r = record()
    await wait(400)
    if (!ok()) return
    await say(r.held > 0 ? 'dr.praise' : 'dr.end')
    if (!ok()) return
    // 時間到了：跳完這一首才去睡覺（TIME-2）
    if (bedtimeIfDue()) return
    onDone()
  }

  useEffect(() => {
    // 延到下一輪才開始：StrictMode 開發模式會掛載兩次
    const t = window.setTimeout(() => void run(), 0)
    return () => {
      clearTimeout(t)
      st.current.cancel?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 點畫面：鼓響的時候跳舞；鼓停的時候搖搖晃晃（差點跌倒） */
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!firstFinger(e.nativeEvent)) return
    const s = st.current
    if (s.demo || s.phase === 'intro' || s.phase === 'end') {
      if (area.current && s.phase !== 'end') {
        const p = localPoint(area.current, e.clientX, e.clientY)
        notYet.ping(p.x, p.y)
      }
      return
    }
    s.taps.push(performance.now())
    setHand(null)
    if (s.phase === 'play') return danceStep()
    wobbleNow()
    if (!s.whoaSaid) {
      s.whoaSaid = true
      hushSpeech()
      void say('dr.whoa')
    }
  }

  const move = MOVES[(dance - 1 + MOVES.length) % MOVES.length]
  const playing = phase === 'play'
  return (
    <div
      className={`dr${done ? ' is-done' : ''}${resting ? ' is-resting' : ''}`}
      data-logic-game="drum"
      data-level={level}
      data-dancer={song.dancer}
      data-stage={song.stage}
      data-kit={song.kit}
      data-phase={phase}
      data-seg={segNo}
      data-demo={demo ? '1' : undefined}
      data-done={done ? '1' : undefined}
      onPointerDown={() => {
        if (resting) setPoke((k) => k + 1)
      }}
    >
      <div className="dr-play" ref={area} onPointerDown={down}>
        <Stage id={song.stage} />
        <div className={`dr-drum${playing ? ' is-playing' : ''}`} data-drum={playing ? 'on' : 'off'} aria-hidden="true">
          <DrumArt hit={hit} playing={playing} />
          {/* 鼓停了：一隻舉起來的手（「停」），靜音也看得出來 */}
          <AnimatePresence>
            {phase === 'freeze' && (
              <motion.span className="dr-stop" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <Emoji name="raised-hand" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="dr-dancer" data-dance={dance} data-wobble={wobble} role="img" aria-label="跳舞的角色">
          <motion.div key={`w${wobble}`} className="dr-dancer-wob" style={{ transformOrigin: '50% 100%' }} animate={wobble ? { rotate: [0, -16, 13, -9, 6, -2, 0], x: ['0%', '-4%', '3%', '-2%', '1%', '0%', '0%'] } : {}} transition={{ duration: 1, ease: 'easeInOut' }}>
            <motion.div key={`d${dance}`} className="dr-dancer-in" style={{ transformOrigin: '50% 100%' }} animate={dance ? MOVE_ANIM[move] : {}} transition={{ duration: 0.34, ease: 'easeOut' }}>
              <div className="dr-dancer-art" style={{ transform: facing ? 'scaleX(-1)' : undefined }}>
                <Critter who={song.dancer} />
              </div>
            </motion.div>
          </motion.div>
          {/* 差點跌倒：頭上冒出一滴汗（一次就停） */}
          <AnimatePresence>
            {wobble > 0 && (
              <motion.span key={`s${wobble}`} className="dr-sweat" initial={{ opacity: 0, y: 6 }} animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -6] }} transition={{ duration: 1.1, times: [0, 0.15, 0.7, 1] }}>
                <Emoji name="droplet" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence>{hand && <Hand key="hand" x={hand.x} y={hand.y} tap={hand.tap} size="96px" cuff="#F1D27C" />}</AnimatePresence>
        <WaitShield on={hold && !resting && !done} />
        {notYet.view}
      </div>
      {resting && <DoneChoices again={onAgain} againArt={<DrumPickArt />} againLabel="再跳一次" line="dr.again" home={() => go({ name: 'home' }, { back: true })} poke={poke} />}
    </div>
  )
}
