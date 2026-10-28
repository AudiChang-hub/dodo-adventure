import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'motion/react'
import { FriendActor } from '../ui/FriendActor'
import { useIntro } from '../ui/Scenes'
import { DUR, EASE } from '../ui/motion'
import { friendInfo } from '../content/friends'
import { db, today, type Friend } from '../lib/db'
import { fnv1a } from '../lib/hash'
import './friends.css'

/** 首頁一次最多出來幾隻 */
const MAX = 3
/** 走路速度（每秒走過草地寬度的百分比）：刻意很慢，不搶「出發」 */
const SPEED = { hop: 3.2, drive: 6, fly: 4 }

/**
 * 今天出來玩的朋友：剛孵出的一定在，其餘用日期當種子挑，同一天每次進首頁都是同一批。
 */
function pickToday(all: Friend[]): string[] {
  const d = today()
  const fresh = all.filter((f) => today(new Date(f.ts)) === d).map((f) => f.id)
  const rest = all
    .map((f) => f.id)
    .filter((id) => !fresh.includes(id))
    .sort((a, b) => fnv1a(`${d}:${a}`).localeCompare(fnv1a(`${d}:${b}`)))
  return [...fresh.slice(-MAX), ...rest].slice(0, MAX)
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** 一隻在草地上慢慢走的朋友：走一段、停下來東張西望，點牠會停下來說話 */
function Walker({ id, slot, count }: { id: string; slot: number; count: number }) {
  const f = friendInfo(id)
  // 一開始各自站在自己那一段，不會疊在一起
  const x = useMotionValue(((slot + 0.5) / count) * 86)
  const left = useTransform(x, (v) => `${v}%`)
  const [walking, setWalking] = useState(false)
  const [face, setFace] = useState(slot % 2 ? 1 : -1)
  const [look, setLook] = useState(0)
  const anim = useRef<AnimationPlaybackControls | null>(null)
  const timer = useRef(0)
  const live = useRef(true)
  const walkId = useRef(0)

  const rest = (ms: number) => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(step, ms)
  }

  function step() {
    if (!live.current) return
    // 停下來時偶爾東張西望一下
    if (Math.random() < 0.45) setLook((n) => n + 1)
    const from = x.get()
    // 在自己那一段附近走，三隻不會擠成一團
    const lo = (slot / count) * 86
    const hi = ((slot + 1) / count) * 86
    let to = rnd(lo, hi)
    if (Math.abs(to - from) < 6) to = from > (lo + hi) / 2 ? lo : hi
    setFace(to > from ? 1 : -1)
    setWalking(true)
    const my = ++walkId.current
    anim.current = animate(x, to, { duration: Math.abs(to - from) / SPEED[f.move], ease: 'linear' })
    anim.current.finished.then(() => {
      // 走到一半被點了（stop）就不接著排下一段，交給 react() 排
      if (!live.current || my !== walkId.current) return
      setWalking(false)
      rest(rnd(2600, 6000))
    })
  }

  useEffect(() => {
    live.current = true
    rest(rnd(1200, 3500) + slot * 900)
    return () => {
      live.current = false
      clearTimeout(timer.current)
      anim.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 被點了：停下來，轉過來面對孩子，說完話再繼續走
  const react = () => {
    walkId.current++
    anim.current?.stop()
    setWalking(false)
    rest(6000)
  }

  // App 一打開才一隻隻慢慢走出來；從別的畫面回到首頁時直接淡入（資料讀到就出現，不再等一秒多）
  const intro = useIntro()
  const bob = f.move === 'fly' ? { y: ['0%', '-10%', '0%'] } : walking ? { y: f.move === 'drive' ? ['0%', '-2%', '0%'] : ['0%', '-7%', '0%'] } : { y: '0%' }
  return (
    <motion.div className="home-friend" style={{ left, bottom: f.move === 'fly' ? '38%' : `${(slot % 2) * 10}%` }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={intro ? { delay: 1.2 + slot * 0.4, duration: 0.8 } : { duration: DUR.swapIn, ease: EASE.out }}>
      <motion.div animate={bob} transition={{ duration: f.move === 'fly' ? 2.4 : 0.55, repeat: f.move === 'fly' || walking ? Infinity : 0, ease: 'easeInOut' }}>
        <motion.div
          key={look}
          animate={{ scaleX: walking ? -face : look ? [-face, face, face, -face] : -face, rotate: look && !walking ? [0, 6, -6, 0] : 0 }}
          transition={walking ? { duration: 0.25 } : { duration: 1.6, times: [0, 0.3, 0.7, 1] }}
        >
          <FriendActor id={id} onReact={react} />
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

/** 首頁草地上的朋友們（最多 3 隻） */
export function HomeFriends() {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    db.friends.toArray().then((all) => setIds(pickToday(all)))
  }, [])
  if (!ids.length) return null
  return (
    <div className="home-friends">
      {ids.map((id, i) => (
        <Walker key={id} id={id} slot={i} count={ids.length} />
      ))}
    </div>
  )
}
