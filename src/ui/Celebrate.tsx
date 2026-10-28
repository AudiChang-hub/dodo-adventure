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
import { roundLine, stickerOfMilestone, type Milestone, type RoundSummary } from '../lib/achievements'
import { say, sfx, stopSpeech } from '../lib/audio'
import { rand } from '../lib/random'
import { wait } from '../games/lines'
import './celebrate.css'

/**
 * 每局結束的慶祝（成就感強化）。家長說過 App 太吵，所以：
 * - 每局回顧約 2.5 秒、里程碑約 3 秒，只說一句（里程碑多一句貼紙的名字），點一下就跳過；
 * - 沒有閃爍、沒有快速變色；只有真正的里程碑才有慢慢飄落的紙片。
 */

/** 剛出現的這段時間不接受「點一下跳過」：孩子答完最後一題的手常常還在點 */
const GRACE_MS = 500
const ROUND_MIN_MS = 2200
const ROUND_MAX_MS = 3800
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
    stopSpeech()
    finish()
  }
}

// ── 每局回顧：這一局做了什麼，一題一張圖，每張都有一顆星星 ─────────────
function RoundCheer({ s, host, onDone }: { s: RoundSummary; host: Speaker; onDone: () => void }) {
  const things = s.things.slice(-8)
  const finish = useOnce(onDone)
  const skip = useSkip(finish)

  useEffect(() => {
    let alive = true
    const t0 = performance.now()
    const timers = things.map((_, i) => window.setTimeout(() => sfx.chime(i), 330 + i * 130))
    const cap = window.setTimeout(finish, ROUND_MAX_MS)
    ;(async () => {
      await wait(250)
      if (!alive) return
      await say(roundLine(s, host))
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
    <motion.div className="cheer" onPointerDown={skip} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
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
      <motion.div className="cheer-host" initial={{ y: '40%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}>
        <Dino who={host} mood="cheer" size="100%" />
      </motion.div>
    </motion.div>
  )
}

// ── 里程碑：學會了、升級了、修好好幾個程式 ──────────────────────────
const RANK: Record<Milestone['kind'], number> = { master: 0, level: 1, fixes: 2 }

/** 拿到貼紙時念它的名字：只念一句短的（貼紙本裡點它才念完整的） */
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

/** 以前（大人陪著、手指著）→ 現在（自己來）：小小的「以前」卡片、虛線箭頭、大大的貼紙 */
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
  /** 其他一起拿到的貼紙：小小的排在下面，一起飛進貼紙本 */
  const extra = useMemo(() => sorted.slice(1).map(stickerOfMilestone).filter((x) => !!x), [sorted])
  const [toBook, setToBook] = useState(false)
  const finish = useOnce(onDone)
  const skip = useSkip(finish)
  const hasSticker = top.kind !== 'level' || extra.length > 0

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
          : [`ach.fixes.${top.n}`]
    ;(async () => {
      await wait(350)
      if (!alive) return
      await say(...lines.filter(hasLine))
      await wait(Math.max(120, MILESTONE_MIN_MS - 600 - (performance.now() - t0)))
      if (!alive) return
      // 貼紙飛進右下角的貼紙本：知道它被收好了、之後找得到
      if (hasSticker) {
        setToBook(true)
        await wait(580)
      }
      if (alive) finish()
    })()
    return () => {
      alive = false
      clearTimeout(cap)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const prevFix = top.kind === 'fixes' ? ([0, 1, 3, 5, 10, 20, 30].filter((x) => x < top.n).pop() ?? 0) : 0
  const fly = toBook ? { x: '34vw', y: '30vh', scale: 0.18, opacity: 0.2, rotate: 20 } : { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }
  return (
    <motion.div className="cheer is-milestone" onPointerDown={skip} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
      <div className="ms-glow" aria-hidden="true" />
      <Confetti />
      <motion.div className="ms-center" animate={top.kind === 'level' ? undefined : fly} transition={{ duration: 0.65, ease: [0.5, 0, 0.3, 1] }}>
        {top.kind === 'master' && <MasterStage m={top} />}
        {top.kind === 'level' && <LevelStage m={top} />}
        {top.kind === 'fixes' && <FixStage m={top} prev={prevFix} />}
      </motion.div>
      {extra.length > 0 && (
        <motion.div className="ms-extra" initial={{ opacity: 0, y: 20 }} animate={toBook ? { ...fly } : { opacity: 1, y: 0 }} transition={toBook ? { duration: 0.65, ease: [0.5, 0, 0.3, 1] } : { delay: 1.2 }}>
          {extra.slice(0, 5).map((d, i) => (
            <Sticker key={d.id} def={d} style={{ width: 84, rotate: `${(i % 2 ? 1 : -1) * 5}deg` } as CSSProperties} />
          ))}
        </motion.div>
      )}
      {hasSticker && (
        <motion.div className="ms-book" initial={{ opacity: 0, scale: 0.6 }} animate={toBook ? { opacity: 1, scale: [1, 1.22, 1], rotate: [0, -8, 0] } : { opacity: 1, scale: 1 }} transition={toBook ? { delay: 0.5, duration: 0.45 } : { delay: 0.6 }}>
          <Emoji name="open-book" />
        </motion.div>
      )}
      <motion.div className="cheer-host" initial={{ y: '40%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 }}>
        <Dino who={host} mood="cheer" size="100%" />
      </motion.div>
    </motion.div>
  )
}

/** 每局結束：先回顧這一局，有里程碑再慶祝一次，最後才交回去（冒險的蛋裂開、或回站點） */
export function Celebrate({ summary, onDone }: { summary: RoundSummary; onDone: () => void }) {
  const host = stationDef(gameDef(summary.game).station).host
  const [step, setStep] = useState<'round' | 'milestone'>(summary.things.length ? 'round' : 'milestone')
  const finish = useOnce(onDone)
  const afterRound = () => (summary.milestones.length ? setStep('milestone') : finish())
  return (
    <AnimatePresence mode="wait">
      {step === 'round' ? <RoundCheer key="r" s={summary} host={host} onDone={afterRound} /> : <MilestoneCheer key="m" ms={summary.milestones} host={host} onDone={finish} />}
    </AnimatePresence>
  )
}
