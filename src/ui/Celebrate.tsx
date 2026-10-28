import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Dino } from '../art/Dino'
import { Emoji } from '../art/Emoji'
import { HandArt } from '../games/Demo'
import { PicView, StarShape, Sticker } from './StickerArt'
import type { StickerDef } from '../content/stickers'
import { game as gameDef, station as stationDef } from '../content/games'
import { hasLine, type Speaker } from '../content/lines'
import { ACH_COUNT } from '../content/lines-achieve'
import { CARD_GOAL, pendingPicks, roundLine, stickerOfMilestone, type Milestone, type RoundSummary } from '../lib/achievements'
import { say, sfx, hushSpeech } from '../lib/audio'
import { rand } from '../lib/random'
import { wait } from '../games/lines'
import { NextCard } from './NextCard'
import { StickerPicker } from './StickerPicker'
import { overlay, swap } from './motion'
import './celebrate.css'

/**
 * 每局結束的慶祝（成就感強化）。家長說過 App 太吵，所以：
 * - 每局回顧約 2.5 秒、里程碑約 3 秒，只說一句（里程碑多一句學會的東西的名字），點一下就跳過；
 * - 沒有閃爍、沒有快速變色；只有真正的里程碑才有慢慢飄落的紙片。
 *
 * 貼紙（2026-10-28）：每局回顧下面多一張「下一張貼紙」的進度卡，這一關的星星飛進去，再說一句「再 N 顆星就有貼紙」
 * （回顧的上限從 3.8 秒放寬到 6.2 秒，一樣點一下就跳過）。卡片集滿時，等回顧和里程碑都結束、
 * 交回冒險（蛋裂開、下一站）之前，才打開挑貼紙的畫面：題目進行中絕不打斷，也不會等到一天結束才給（3 歲要馬上看到「做了就拿到」）。
 * 挑選沒有時間上限（孩子自己決定），但隨時可以「等一下再選」，貼紙會留在貼紙本、今日回顧裡。
 */

/** 剛出現的這段時間不接受「點一下跳過」：孩子答完最後一題的手常常還在點 */
const GRACE_MS = 500
const ROUND_MIN_MS = 2200
const ROUND_MAX_MS = 3800
/** 有貼紙卡的回顧：多了星星飛進卡片和一句話 */
const ROUND_CARD_MAX_MS = 6200
const MILESTONE_MIN_MS = 2600
const MILESTONE_MAX_MS = 4600

function useOnce(fn: () => void) {
  const done = useRef(false)
  return () => {
    if (done.current) return
    done.current = true
    fn()
  }
}

/** 點一下跳過；剛出現的那一下不算 */
function useSkip(finish: () => void) {
  const t0 = useRef(performance.now())
  return () => {
    if (performance.now() - t0.current < GRACE_MS) return
    hushSpeech()
    finish()
  }
}

// ── 每局回顧：這一局做了什麼，一題一張圖，每張都有一顆星星 ─────────────
function RoundCheer({ s, host, onDone }: { s: RoundSummary; host: Speaker; onDone: () => void }) {
  const things = s.things.slice(-8)
  const card = s.card
  const [fly, setFly] = useState(false)
  const finish = useOnce(onDone)
  const skip = useSkip(finish)

  useEffect(() => {
    let alive = true
    const t0 = performance.now()
    const timers = things.map((_, i) => window.setTimeout(() => sfx.chime(i), 330 + i * 130))
    const cap = window.setTimeout(finish, card ? ROUND_CARD_MAX_MS : ROUND_MAX_MS)
    ;(async () => {
      await wait(250)
      if (!alive) return
      await say(roundLine(s, host))
      if (!alive) return
      // 貼紙卡：這一關的星星飛進卡片，再說「再 N 顆星就有貼紙」（集滿了：Five stars! You get a sticker!）
      if (card) {
        setFly(true)
        await wait(620 + card.gained.length * 380 + 150)
        if (!alive) return
        await say(card.full ? `stk.card.full.${host}` : `stk.card.left.${host}.${card.left}`)
        await wait(card.full ? 500 : 250)
      }
      await wait(Math.max(250, ROUND_MIN_MS - (performance.now() - t0)))
      if (alive) finish()
    })()
    return () => {
      alive = false
      timers.forEach(clearTimeout)
      clearTimeout(cap)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 一排放得下：最多 8 張，在 1200 寬的平板上每張至少約 100px
  const size = `min(128px, ${(68 / Math.max(3, things.length)).toFixed(1)}vw)`
  return (
    <motion.div className={`cheer${card ? ' has-card' : ''}`} onPointerDown={skip} variants={swap} initial="initial" animate="enter" exit="exit">
      <motion.div className="cheer-strip" initial={{ y: 24, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
        {things.map((t, i) => (
          <motion.div
            key={i}
            className={`medal${t.selfFix ? ' is-fix' : ''}`}
            style={{ width: size }}
            initial={{ y: 26, scale: 0.6, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 340, damping: 18, delay: 0.08 + i * 0.09 }}
          >
            <span className="medal-face">
              <span className="medal-pic">
                <PicView pic={t.pic} />
              </span>
            </span>
            <motion.span className="medal-star" initial={{ scale: 0, rotate: -70 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 13, delay: 0.33 + i * 0.13 }}>
              <StarShape />
            </motion.span>
            {/* 自己改正的那一題：多一個「用力」的小手臂，稱讚的是努力 */}
            {t.selfFix && (
              <motion.span className="medal-fix" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.5 + i * 0.13 }}>
                <Emoji name="flexed-biceps" />
              </motion.span>
            )}
          </motion.div>
        ))}
      </motion.div>
      {/* 下一張貼紙的進度：蓋著的貼紙 + 5 個星星格，這一關的星星（加速的星星下面有個小圖）一顆顆飛進來 */}
      {card && (
        <motion.div className="cheer-card" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.35 }}>
          <NextCard stars={card.before} goal={CARD_GOAL} feature={card.feature} gain={card.gained} play={fly} />
        </motion.div>
      )}
      <motion.div className="cheer-host" initial={{ y: '40%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}>
        <Dino who={host} mood="cheer" size="100%" />
      </motion.div>
    </motion.div>
  )
}

// ── 里程碑：學會了、升級了、修好好幾個程式 ──────────────────────────
const RANK: Record<Milestone['kind'], number> = { master: 0, level: 1, fixes: 2, sticker: 3 }

/** 學會的那一刻念它的名字：只念一句短的 */
const nameLine = (d: StickerDef | null) => (d ? [d.short ?? d.lines[0]].filter(Boolean) : [])

/** 慢慢飄落的紙片：只在里程碑出現，顏色是紙感的淡色 */
function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: 4 + ((i * 61) % 92),
        w: 10 + (i % 3) * 4,
        delay: (i % 5) * 0.16,
        dur: 2.8 + (i % 4) * 0.35,
        sway: (i % 2 ? 1 : -1) * (14 + (i % 3) * 8),
        spin: (i % 2 ? 1 : -1) * (160 + (i % 4) * 50),
        color: ['#F1D27C', '#E99A84', '#8FCBAA', '#A3C4E4', '#BFB2DF'][i % 5],
      })),
    [],
  )
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <motion.i
          key={i}
          style={{ left: `${b.left}%`, width: b.w, height: b.w * 0.62, background: b.color }}
          initial={{ y: '-8vh', x: 0, rotate: 0, opacity: 0 }}
          animate={{ y: '104vh', x: [0, b.sway, -b.sway / 2, b.sway / 3], rotate: b.spin, opacity: [0, 1, 1, 0.9] }}
          transition={{ duration: b.dur, delay: b.delay, ease: 'linear' }}
        />
      ))}
    </div>
  )
}

/** 以前（大人陪著、手指著）→ 現在（自己來）：小小的「以前」卡片、虛線箭頭、大大的「學會了」圓牌 */
function MasterStage({ m }: { m: Extract<Milestone, { kind: 'master' }> }) {
  const st = stickerOfMilestone(m)!
  return (
    <div className="ms-stage">
      <motion.div className="ms-before" initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.4 }}>
        <span className="ms-before-pic">
          <PicView pic={st.pic} />
        </span>
        <svg className="ms-hand" viewBox="0 0 64 84" aria-hidden="true">
          <HandArt />
        </svg>
      </motion.div>
      <motion.svg className="ms-arrow" viewBox="0 0 120 60" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
        <motion.path d="M8 40 Q60 0 104 30" fill="none" stroke="rgba(46,42,37,0.35)" strokeWidth={5} strokeLinecap="round" strokeDasharray="2 12" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.5 }} />
        <motion.path d="M92 20 L106 31 L90 38" fill="none" stroke="rgba(46,42,37,0.35)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} />
      </motion.svg>
      <motion.div className="ms-hero" initial={{ scale: 0, rotate: -24 }} animate={{ scale: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.75 }}>
        <Sticker def={st} />
      </motion.div>
    </div>
  )
}

/** 升級：遊戲的圖示下面一排星星，先亮著原本的，新的一顆一顆彈進來 */
function LevelStage({ m }: { m: Extract<Milestone, { kind: 'level' }> }) {
  const g = gameDef(m.game)
  return (
    <div className="ms-stage is-col">
      <motion.div className="ms-badge" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.1 }}>
        <Emoji name={g.icon} />
      </motion.div>
      <div className="ms-stars">
        {Array.from({ length: g.maxLevel }, (_, i) => {
          const fresh = i >= m.from && i < m.to
          return (
            <span key={i} className="ms-star">
              <StarShape on={false} />
              {(i < m.from || fresh) && (
                <motion.span
                  className="ms-star-on"
                  initial={fresh ? { scale: 0, rotate: -90 } : { scale: 1 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={fresh ? { type: 'spring', stiffness: 360, damping: 12, delay: 0.9 + (i - m.from) * 0.25 } : { duration: 0 }}
                >
                  <StarShape />
                </motion.span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** 修好程式：扳手貼紙，數字從上一張的次數數上來 */
function FixStage({ m, prev }: { m: Extract<Milestone, { kind: 'fixes' }>; prev: number }) {
  const st = stickerOfMilestone(m)!
  const [n, setN] = useState(prev)
  useEffect(() => {
    const steps = m.n - prev
    if (steps <= 0) return
    const every = Math.max(60, Math.min(260, 900 / steps))
    let k = prev
    const t = window.setInterval(() => {
      k++
      setN(k)
      if (k >= m.n) clearInterval(t)
    }, every)
    return () => clearInterval(t)
  }, [m.n, prev])
  return (
    <div className="ms-stage is-col">
      <motion.div className="ms-hero" initial={{ scale: 0, rotate: 20 }} animate={{ scale: 1, rotate: 3 }} transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.2 }}>
        <Sticker def={{ ...st, pic: { t: 'badge', icon: 'wrench', n } }} />
      </motion.div>
    </div>
  )
}

function MilestoneCheer({ ms, host, onDone }: { ms: Milestone[]; host: Speaker; onDone: () => void }) {
  const sorted = useMemo(() => [...ms].sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.ts - a.ts), [ms])
  const top = sorted[0]
  /** 這一關其他一起學會的：小小的排在下面（v2 起學會的東西不再變成貼紙，不飛進貼紙本，改成貼紙卡上的加速星星） */
  const extra = useMemo(() => sorted.slice(1).map(stickerOfMilestone).filter((x) => !!x), [sorted])
  const finish = useOnce(onDone)
  const skip = useSkip(finish)

  useEffect(() => {
    let alive = true
    const t0 = performance.now()
    const cap = window.setTimeout(finish, MILESTONE_MAX_MS)
    window.setTimeout(() => alive && sfx.milestone(), 180)
    const lines =
      top.kind === 'master'
        ? [`ach.master.${host}.${rand(ACH_COUNT.master)}`, ...nameLine(stickerOfMilestone(top))]
        : top.kind === 'level'
          ? [`ach.level.${host}.${Math.min(6, top.to)}`]
          : top.kind === 'fixes'
            ? [`ach.fixes.${top.n}`]
            : []
    ;(async () => {
      await wait(350)
      if (!alive) return
      await say(...lines.filter(hasLine))
      await wait(Math.max(300, MILESTONE_MIN_MS - (performance.now() - t0)))
      if (alive) finish()
    })()
    return () => {
      alive = false
      clearTimeout(cap)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const prevFix = top.kind === 'fixes' ? ([0, 1, 3, 5, 10, 20, 30].filter((x) => x < top.n).pop() ?? 0) : 0
  return (
    <motion.div className="cheer is-milestone" onPointerDown={skip} variants={swap} initial="initial" animate="enter" exit="exit">
      <div className="ms-glow" aria-hidden="true" />
      <Confetti />
      <div className="ms-center">
        {top.kind === 'master' && <MasterStage m={top} />}
        {top.kind === 'level' && <LevelStage m={top} />}
        {top.kind === 'fixes' && <FixStage m={top} prev={prevFix} />}
      </div>
      {extra.length > 0 && (
        <motion.div className="ms-extra" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}>
          {extra.slice(0, 5).map((d, i) => (
            <Sticker key={d.id} def={d} style={{ width: 84, rotate: `${(i % 2 ? 1 : -1) * 5}deg` } as CSSProperties} />
          ))}
        </motion.div>
      )}
      <motion.div className="cheer-host" initial={{ y: '40%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 }}>
        <Dino who={host} mood="cheer" size="100%" />
      </motion.div>
    </motion.div>
  )
}

/**
 * 每局結束：先回顧這一局（含貼紙卡），有里程碑再慶祝一次；貼紙卡集滿了就接著挑貼紙，最後才交回去（冒險的蛋裂開、或回站點）。
 * 轉場（ui/motion.ts）：紙色遮罩只淡入一次、整段一直都在；回顧 → 里程碑 → 挑貼紙在遮罩上原地換（swap），
 * 不會「遮罩淡掉露出遊戲、再淡回來」。最後交回去時遮罩不另外淡出，跟著遊戲一起收回（整頁轉場）。
 */
export function Celebrate({ summary, onDone }: { summary: RoundSummary; onDone: () => void }) {
  const host = stationDef(gameDef(summary.game).station).host
  const wantPick = !!summary.card?.full
  const [step, setStep] = useState<'round' | 'milestone' | 'pick'>(summary.things.length ? 'round' : 'milestone')
  const finish = useOnce(onDone)
  const afterMilestone = () => (wantPick && pendingPicks() > 0 ? setStep('pick') : finish())
  const afterRound = () => (summary.milestones.length ? setStep('milestone') : afterMilestone())
  return (
    <motion.div className="cheer-scrim" variants={overlay} initial="initial" animate="enter">
      <AnimatePresence initial={false}>
        {step === 'round' && <RoundCheer key="r" s={summary} host={host} onDone={afterRound} />}
        {step === 'milestone' && <MilestoneCheer key="m" ms={summary.milestones} host={host} onDone={afterMilestone} />}
        {step === 'pick' && <StickerPicker key="p" onDone={finish} />}
      </AnimatePresence>
    </motion.div>
  )
}
