import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Dino } from '../art/Dino'
import { say } from '../lib/audio'
import { finishBreak } from '../lib/session'

const SECONDS = 20

/**
 * 護眼休息：看遠方 20 秒。畫面刻意很素、幾乎不動，
 * 讓孩子把視線移開螢幕，而不是盯著倒數。
 */
export function EyeBreak({ onDone }: { onDone?: () => void }) {
  const [left, setLeft] = useState(SECONDS)

  useEffect(() => {
    void say('eye.break')
    const t = setInterval(() => setLeft((l) => l - 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (left > 0) return
    finishBreak()
    void say('eye.done')
    onDone?.()
  }, [left, onDone])

  return (
    <div className="screen" style={{ zIndex: 120, background: '#E4ECE6' }}>
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        <path d="M0 520 L180 330 L330 470 L520 260 L740 480 L900 360 L1200 540 V800 H0 Z" fill="#C9D9D0" />
        <path d="M0 600 Q300 540 620 590 T1200 570 V800 H0 Z" fill="#B7CFBF" />
        <path d="M0 690 Q400 650 800 690 T1200 680 V800 H0 Z" fill="#A9C6B3" />
      </svg>
      <div style={{ position: 'absolute', left: '10vw', bottom: '6vh', width: '26vmin' }}>
        <Dino who="dodo" size="100%" flip />
      </div>
      <div style={{ position: 'absolute', right: '8vw', top: '8vh', display: 'flex', gap: 10 }} aria-label={`還有 ${left} 秒`}>
        {Array.from({ length: SECONDS / 2 }, (_, i) => (
          <motion.i key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: i < Math.ceil(left / 2) ? '#7FA58E' : 'rgba(46,42,37,.1)' }} />
        ))}
      </div>
    </div>
  )
}
