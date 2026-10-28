import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { PicView, StarShape, Sticker } from '../ui/StickerArt'
import { NextCard } from '../ui/NextCard'
import { StickerPicker } from '../ui/StickerPicker'
import { game as gameDef } from '../content/games'
import { theme as themeDef } from '../content/themes'
import { stopIcon } from './Route'
import { hasLine } from '../content/lines'
import { CARD_GOAL, nextPick, stickerOfMilestone, todayMilestones, isSelfFix } from '../lib/achievements'
import { db, today } from '../lib/db'
import { say, sfx, stopSpeech } from '../lib/audio'
import type { Plan } from '../lib/plan'
import './recap.css'

/** 回顧最多放幾張今天的貼紙（再多就太擠，也念太久） */
const MAX_STICKERS = 5
/** 給爸爸看的時候最多念幾張 */
const MAX_TOLD = 3

interface Item {
  key: string
  /** 遊戲徽章（升級）或貼紙 */
  node: React.ReactNode
  lines: string[]
  zh: string
}

function todayItems(): Item[] {
  const out: Item[] = []
  const seen = new Set<string>()
  const all = todayMilestones()
  // 修好程式的貼紙今天可能拿了好幾張（1、3、5 次），只放最大的那一張
  const topFix = Math.max(0, ...all.map((m) => (m.kind === 'fixes' ? m.n : 0)))
  // 新的在前：今天最後拿到的最有印象
  for (const m of [...all].reverse()) {
    if (m.kind === 'fixes' && m.n !== topFix) continue
    if (m.kind === 'level') {
      const g = gameDef(m.game)
      if (!g || seen.has(`lv:${m.game}`)) continue
      seen.add(`lv:${m.game}`)
      out.push({
        key: m.id,
        node: <Sticker def={{ id: m.id, pic: { t: 'emoji', icon: g.icon }, tint: '#F8EDC6', lines: [], zh: '' }} stars={{ n: m.to, max: g.maxLevel }} />,
        lines: [`stk.stars.${Math.min(6, m.to)}`],
        zh: `${g.title}升到第 ${m.to} 級`,
      })
      continue
    }
    const d = stickerOfMilestone(m)
    if (!d || seen.has(d.id)) continue
    seen.add(d.id)
    out.push({ key: m.id, node: <Sticker def={d} />, lines: d.lines, zh: m.kind === 'sticker' ? `挑了貼紙「${d.zh}」` : d.zh })
  }
  return out.slice(0, MAX_STICKERS)
}

/**
 * 今日冒險的結尾（成就感強化）：今天走過的站（每站一顆星）、今天拿到的貼紙與學會的東西，
 * 和一個「給爸爸看」的按鈕：按了，豆豆把今天學會的念給爸爸聽，念到哪一張，那一張就跳一下。
 * 還有集滿了沒挑的貼紙（之前按了「等一下再選」）：多一張發光的卡片，點了就去挑。
 */
export function DayRecap({ plan }: { plan: Plan }) {
  // 主題式冒險：走過的站用故事的圖（和路線上的一樣），孩子看得出「這是今天的公車旅行」
  const th = themeDef(plan.theme)
  /** 挑完貼紙後重新整理今天的清單 */
  const [rev, setRev] = useState(0)
  const [picking, setPicking] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(todayItems, [rev])
  const waiting = useMemo(nextPick, [rev])
  const [active, setActive] = useState(-1)
  const [fixes, setFixes] = useState(0)
  const token = useRef(0)

  useEffect(() => {
    let alive = true
    void db.attempts
      .where('date')
      .equals(today())
      .filter((a) => isSelfFix(a))
      .count()
      .then((n) => alive && setFixes(n))
    return () => {
      alive = false
      token.current++
    }
  }, [])

  const tell = async () => {
    const my = ++token.current
    sfx.pop()
    const ok = () => my === token.current
    setActive(-1)
    await say('ach.recap.hi')
    for (let i = 0; i < Math.min(items.length, MAX_TOLD); i++) {
      if (!ok()) return
      setActive(i)
      await say(...items[i].lines.filter(hasLine))
    }
    if (!ok()) return
    setActive(-1)
    const friend = plan.hatched ? [`ach.recap.friend`, `friend.name.${plan.hatched}`].filter(hasLine) : []
    await say(...friend, 'ach.recap.end')
    if (ok()) setActive(-1)
  }

  // 給爸爸看的一行中文：說得出孩子今天做了什麼，比「好棒」更具體
  const zh = [
    th ? `今天的故事是「${th.zh}」` : '',
    items.length ? `今天：${items.map((x) => x.zh).join('、')}` : `今天走完 ${plan.items.length} 站`,
    fixes > 0 ? `錯了自己改對 ${fixes} 次` : '',
  ]
    .filter(Boolean)
    .join('；')

  return (
    <div className="recap">
      <motion.div className="recap-strip" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 22, delay: 0.2 }}>
        {plan.items.map((it, i) => (
          <motion.div key={i} className="recap-stop" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 340, damping: 16, delay: 0.3 + i * 0.1 }}>
            <span className="recap-stop-face">
              <span className="recap-stop-pic">
                <PicView pic={{ t: 'emoji', icon: th ? stopIcon(th, i) : gameDef(it.game).icon }} />
              </span>
            </span>
            <span className="recap-stop-star">
              <StarShape />
            </span>
          </motion.div>
        ))}
        {items.length > 0 && <span className="recap-sep" aria-hidden="true" />}
        {items.map((x, i) => (
          <motion.div
            key={x.key}
            className="recap-sticker"
            initial={{ scale: 0, rotate: -25 }}
            animate={active === i ? { scale: [1, 1.18, 1.1], rotate: 0 } : { scale: 1, rotate: (i % 2 ? 1 : -1) * 5 }}
            transition={active === i ? { duration: 0.4 } : { type: 'spring', stiffness: 300, damping: 15, delay: 0.7 + plan.items.length * 0.1 + i * 0.12 }}
          >
            {x.node}
          </motion.div>
        ))}
        {waiting && (
          <motion.button
            className="recap-wait"
            aria-label="挑一張貼紙"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 1.1 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              stopSpeech()
              sfx.pop()
              setPicking(true)
            }}
          >
            <NextCard layout="slot" stars={CARD_GOAL} goal={CARD_GOAL} feature={waiting.feature} ready />
          </motion.button>
        )}
        <motion.button
          className="round-btn recap-dad"
          aria-label="給爸爸看"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 1 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            stopSpeech()
            void tell()
          }}
        >
          <Emoji name="man" />
          <span className="recap-dad-wave">
            <Emoji name="waving-hand" />
          </span>
        </motion.button>
      </motion.div>
      <p className="coplay-hint recap-hint" aria-hidden="true">
        <span className="coplay-tag">給爸爸看</span>
        {zh}。點爸爸的按鈕，讓豆豆說給你聽。{waiting ? '發光的卡片是還沒挑的貼紙，點了就能挑。' : ''}
      </p>
      <AnimatePresence>
        {picking && (
          <StickerPicker
            onDone={() => {
              setPicking(false)
              setRev((r) => r + 1)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
