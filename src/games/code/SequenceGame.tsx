import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { TeachCard } from '../Teach'
import { Hand } from '../Demo'
import { Emoji } from '../../art/Emoji'
import { Sparkles } from '../../ui/Sparkles'
import { game as gameDef, type TeachSpec, type Visual } from '../../content/games'
import { seqSkill, type Story } from '../../content/code'
import { markPlayed, plays, reportLevel } from '../../lib/adaptive'
import { planSequence, roundState } from '../pick'
import { logAttempt, logTeach } from '../../lib/record'
import type { Phase } from '../../lib/db'
import { preload, say, sfx, stopSpeech } from '../../lib/audio'
import { shuffle } from '../../lib/random'
import { praiseKey, retryKey, wait } from '../lines'
import { useIdle } from '../idle'
import { hit, useTapDrag } from './drag'
import type { Mood } from '../../art/Dino'
import './code.css'

const ROUNDS = 4

/** 教學卡：故事照順序排開，一張一張指著念旁白 */
const teachOf = (s: Story): TeachSpec => {
  const lines = s.lines.map((_, i) => `c.seq.${s.id}.${i}`)
  return { visual: s.icons.map((icon): Visual => ({ t: 'emoji', icon })), focus: s.icons.map((_, i) => i), lines, short: lines }
}

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

/**
 * 排順序（PRD §10，3–4 歲的「順序」）：一個生活或大自然的小故事，圖片打亂，
 * 孩子依序點出「先發生什麼、再來是什麼」，點到的圖飛進上面編好號的格子。
 * 互動和數字工地的「照順序」一樣（點對的排到上面），但內容是圖片故事，所以另外寫一個元件，
 * 不動數字的那一個。點或拖都可以；最後一張只剩一個選擇時自動放好，不做假的決定。
 * 新的故事：教學卡（照順序念旁白）→ 一起練（下一張發光）→ 自己答；自己答錯兩次就重教。
 */
export function SequenceGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [idx, setIdx] = useState(0)
  const [st, setSt] = useState<Story | null>(null)
  const [tray, setTray] = useState<number[]>([])
  const [placed, setPlaced] = useState<number[]>([])
  const [phase, setPhase] = useState<Phase>('quiz')
  const [card, setCard] = useState<{ spec: TeachSpec; short: boolean; n: number } | null>(null)
  const [shake, setShake] = useState<{ i: number; n: number } | null>(null)
  const [hintOn, setHintOn] = useState(false)
  const [done, setDoneView] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  const [view, setView] = useState(0)

  const live = useRef(true)
  const locked = useRef(true)
  const stRef = useRef<Story | null>(null)
  const placedRef = useRef<number[]>([])
  const trayRef = useRef<number[]>([])
  const phaseRef = useRef<Phase>('quiz')
  const stepRef = useRef(0)
  const idxRef = useRef(0)
  const taps = useRef<{ pick: string; ms: number }[]>([])
  const t0 = useRef(0)
  const wrongs = useRef(0)
  /** 點錯的次數（一起練也算，記錄用；一起練點錯不會被放進去） */
  const misses = useRef(0)
  const hintUsed = useRef(false)
  const lv = useRef(1)
  const firstTries = useRef(0)
  const round = useRef({ ...roundState(plays(def.id) === 0), stories: [] as Story[] })
  const resolver = useRef<((ms: number) => void) | null>(null)
  const stripEl = useRef<HTMLDivElement | null>(null)
  const rootEl = useRef<HTMLDivElement | null>(null)
  const idle = useIdle()

  const waitStep = () => new Promise<number>((res) => (resolver.current = res))
  const release = (ms = 0) => {
    const r = resolver.current
    resolver.current = null
    r?.(ms)
  }

  const question = () => (placedRef.current.length === 0 ? 'c.seq.first' : 'c.seq.next')

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
    setShake(null)
    setView((v) => v + 1)
    taps.current = []
    wrongs.current = 0
    misses.current = 0
    hintUsed.current = false
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

  // ── 我示範：教學卡 ─────────────────────────────────────────
  const teach = async (s: Story, short: boolean) => {
    stepRef.current++
    idle.stop()
    locked.current = true
    setMood('happy')
    setCard({ spec: teachOf(s), short, n: stepRef.current })
    const ms = await waitStep()
    if (!live.current) return
    setCard(null)
    void logTeach({ station: def.station, game: def.id, itemId: s.id, skill: seqSkill(s), level: lv.current, ms, retaught: short })
    await wait(260)
  }

  /** 一起練或自己答：同一個故事、重新洗牌 */
  const ask = async (s: Story, ph: Phase, afterGuide: boolean, avoid?: number[]) => {
    const my = ++stepRef.current
    phaseRef.current = ph
    setPhase(ph)
    const order = setup(s, avoid)
    setMood(ph === 'guided' ? 'happy' : 'idle')
    locked.current = false
    t0.current = performance.now()
    const finished = ph === 'guided' ? waitStep() : null
    await say(...(afterGuide ? ['teach.turn.bobo'] : []), 'c.seq.first', ...(ph === 'guided' ? ['teach.here.bobo'] : []))
    if (live.current && stepRef.current === my)
      idle.start({
        repeat: () => void say(question()),
        // 第二段：下一張該放的圖慢慢發光，不說話（一起練本來就在發光）
        hint: () => {
          if (ph === 'guided') return
          hintUsed.current = true
          setHintOn(true)
        },
      })
    if (finished) await finished
    return order
  }

  const present = async (i: number) => {
    idxRef.current = i
    setIdx(i)
    // 這題排哪個故事、要不要先教（pick.ts，自動檢查 scripts/sim-teach.ts 用同一份）
    const { s, lv: l, fresh, walk } = planSequence(def, round.current, i)
    lv.current = l
    preload([...teachOf(s).lines, 'c.seq.first', 'c.seq.next', 'teach.here.bobo', 'teach.turn.bobo'])

    if (fresh) {
      await teach(s, false)
      if (!live.current) return
    }
    if (fresh || walk) {
      const g = await ask(s, 'guided', false)
      if (!live.current) return
      await wait(300)
      return ask(s, 'quiz', true, g)
    }
    return ask(s, 'quiz', false)
  }

  const next = async () => {
    await wait(500)
    if (!live.current) return
    const n = idxRef.current + 1
    if (n >= ROUNDS) return onDone({ items: ROUNDS, firstTry: firstTries.current })
    present(n)
  }

  useEffect(() => {
    live.current = true
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

  /** 把第 k 張（故事裡的順序）放進下一格，並念它的旁白 */
  const put = (s: Story, k: number) => {
    const p = [...placedRef.current, k]
    placedRef.current = p
    setPlaced(p)
    trayRef.current = trayRef.current.filter((x) => x !== k)
    setTray(trayRef.current)
    setHintOn(false)
    sfx.pop()
    return say(`c.seq.${s.id}.${k}`)
  }

  const choose = async (k: number) => {
    const s = stRef.current
    if (!s || locked.current) return
    idle.poke()
    const want = placedRef.current.length
    taps.current.push({ pick: s.icons[k], ms: Math.round(performance.now() - t0.current) })
    if (k !== want) {
      sfx.gentle()
      misses.current++
      if (phaseRef.current === 'guided') {
        // 一起練不會答錯：不搖、不算，再指一次
        void say('teach.here.bobo')
        return
      }
      wrongs.current++
      setShake({ i: k, n: taps.current.length })
      window.setTimeout(() => live.current && setShake(null), 500)
      if (wrongs.current >= 2) return reteach(s)
      // 「再試一次」說的同時就可以再點，不鎖住（鎖住的話孩子會以為壞掉了）；說完才重新計時
      await say(retryKey('bobo'), question())
      return idle.poke()
    }
    locked.current = true
    stepRef.current++
    idle.stop()
    await put(s, k)
    if (!live.current) return
    // 只剩一張：不用選，自動放好
    if (trayRef.current.length === 1) {
      await wait(200)
      await put(s, trayRef.current[0])
      if (!live.current) return
    }
    if (trayRef.current.length === 0) return finish(s)
    locked.current = false
    const my = stepRef.current
    await say('c.seq.next')
    if (live.current && stepRef.current === my) idle.start({ repeat: () => void say(question()), hint: () => {
      if (phaseRef.current === 'guided') return
      hintUsed.current = true
      setHintOn(true)
    } })
  }

  const finish = async (s: Story) => {
    setDoneView(true)
    setMood('cheer')
    sfx.correct()
    const ph = phaseRef.current
    const firstTry = misses.current === 0 && !hintUsed.current
    void logAttempt({
      ...base(s),
      phase: ph,
      taps: taps.current,
      firstTryCorrect: firstTry,
      attempts: 1 + wrongs.current,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: ph === 'guided' || hintUsed.current,
      metrics: { steps: s.icons.length, wrongTaps: wrongs.current },
    })
    if (ph === 'guided') {
      await say(praiseKey('bobo'))
      await wait(250)
      return release()
    }
    if (firstTry) firstTries.current++
    const change = reportLevel(def.id, firstTry, def.maxLevel, { skill: seqSkill(s) })
    await say(praiseKey('bobo'), ...(change === 'up' ? ['levelup'] : []))
    next()
  }

  /** 自己答錯兩次：重新教一次故事，再一起練 */
  const reteach = async (s: Story) => {
    locked.current = true
    stepRef.current++
    idle.stop()
    hintUsed.current = true
    void logAttempt({
      ...base(s),
      phase: 'quiz',
      taps: taps.current,
      firstTryCorrect: false,
      attempts: 1 + wrongs.current,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: true,
      metrics: { steps: s.icons.length, wrongTaps: wrongs.current, retaught: 1 },
    })
    reportLevel(def.id, false, def.maxLevel, { skill: seqSkill(s) })
    await wait(450)
    await say('teach.again.bobo')
    if (!live.current) return
    await teach(s, true)
    if (!live.current) return
    await ask(s, 'guided', false)
    if (live.current) next()
  }

  const drag = useTapDrag<number>({
    enabled: () => !locked.current && !card,
    onPoke: () => idle.poke(),
    onTap: (k) => void choose(k),
    // 拖到上面的格子放開＝選這一張；拖到別的地方就當沒發生
    onDrop: (k, x, y) => {
      if (hit(stripEl.current, x, y, 30)) void choose(k)
    },
  })

  const onHost = () => {
    if (card || !st) return
    idle.poke()
    void say(question(), ...(phase === 'guided' ? ['teach.here.bobo'] : []))
  }

  const guide = phase === 'guided' && !card
  const want = placed.length
  const r = rootEl.current?.getBoundingClientRect()

  return (
    <Shell station={def.station} mood={mood} progress={{ total: ROUNDS, done: idx }} onExit={onExit} onHost={onHost}>
      <AnimatePresence mode="wait">
        {card ? (
          <TeachCard key={`teach-${card.n}`} spec={card.spec} short={card.short} onDone={release} />
        ) : (
          st && (
            <motion.div key={`s-${view}`} ref={rootEl} className="seq" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
              <LayoutGroup>
                {/* 編號的格子：1、2、3…，故事從左讀到右 */}
                <div ref={stripEl} className="seq-strip">
                  {st.icons.map((_, i) => {
                    const k = placed[i]
                    return (
                      <div key={i} className="prog-cell">
                        {i > 0 && <span className="prog-chev" aria-hidden="true" />}
                        <div className={`seq-slot${i === placed.length && !done ? ' is-next' : ''}`}>
                          <span className="prog-num" aria-hidden="true">
                            {i + 1}
                          </span>
                          {k !== undefined && (
                            <motion.div
                              layoutId={`seq-${view}-${k}`}
                              className={`seq-card${done ? ' is-done' : ''}`}
                              animate={done ? { y: [0, -16, 0] } : { y: 0 }}
                              transition={{ layout: { type: 'spring', stiffness: 300, damping: 26 }, y: { duration: 0.5, delay: i * 0.12 } }}
                            >
                              <div className="tile-in">
                                <Emoji name={st.icons[k]} />
                              </div>
                              {done && i === st.icons.length - 1 && <Sparkles count={14} />}
                            </motion.div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 打亂的圖 */}
                <div className="seq-tray">
                  {tray.map((k, j) => {
                    const lit = k === want && (guide || hintOn)
                    const dim = guide && k !== want
                    const shaking = shake?.i === k
                    return (
                      <motion.button
                        key={k}
                        layoutId={`seq-${view}-${k}`}
                        className={`seq-card${lit ? (guide ? ' guide' : ' hint') : ''}${dim ? ' dim' : ''}`}
                        aria-label={`圖 ${j + 1}`}
                        data-k={import.meta.env.DEV ? k : undefined}
                        initial={{ y: 50, opacity: 0, scale: 0.85 }}
                        animate={shaking ? { x: [0, -14, 14, -9, 9, 0], y: 0, opacity: 1, scale: 1 } : { x: 0, y: 0, opacity: dim ? 0.38 : 1, scale: dim ? 0.9 : 1 }}
                        whileTap={{ scale: 0.94 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 22, delay: shaking ? 0 : 0.06 * j, layout: { type: 'spring', stiffness: 300, damping: 26 } }}
                        {...drag.bind(k)}
                      >
                        <div className="tile-in">
                          <Emoji name={st.icons[k]} />
                        </div>
                        {lit && guide && <Hand x={72} y={70} size="10cqmin" beckon />}
                      </motion.button>
                    )
                  })}
                </div>
              </LayoutGroup>

              {drag.ghost && r && (
                <div className="seq-card ghost" style={{ left: drag.ghost.x - r.left, top: drag.ghost.y - r.top }} aria-hidden="true">
                  <div className="tile-in">
                    <Emoji name={st.icons[drag.ghost.item]} />
                  </div>
                </div>
              )}
            </motion.div>
          )
        )}
      </AnimatePresence>
    </Shell>
  )
}
