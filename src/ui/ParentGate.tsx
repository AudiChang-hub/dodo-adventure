import { useState } from 'react'
import { motion } from 'motion/react'
import { rand } from '../lib/random'
import { useHold, Ring } from './Hold'
import { overlay, overlayPanel } from './motion'

function question() {
  const a = 12 + rand(8)
  const b = 4 + rand(6)
  return { a, b, sum: a + b }
}

interface GateProps {
  onPass: () => void
  onCancel: () => void
  title?: string
}

/** 家長閘門：兩位數加法，3 歲孩子解不開，大人一秒就過 */
export function ParentGate(props: GateProps) {
  return (
    // 遮罩和面板一起淡入、面板微微長大（ui/motion.ts 的 overlay）；放在 AnimatePresence 裡，收起時一起淡出
    <motion.div className="gate-backdrop" variants={overlay} initial="initial" animate="enter" exit="exit" onPointerDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <GatePanel {...props} />
    </motion.div>
  )
}

/** 閘門的面板本身：已經有遮罩的地方（睡覺畫面：閘門 → 延長時間的選單）直接換面板，遮罩不閃 */
export function GatePanel({ onPass, onCancel, title = '家長確認' }: GateProps) {
  const [q, setQ] = useState(question)
  const [val, setVal] = useState('')
  const [bad, setBad] = useState(false)

  const submit = () => {
    if (Number(val) === q.sum) return onPass()
    setBad(true)
    setVal('')
    setQ(question())
    setTimeout(() => setBad(false), 450)
  }
  const press = (k: string) => {
    if (k === '⌫') return setVal((v) => v.slice(0, -1))
    setVal((v) => (v.length < 3 ? v + k : v))
  }

  return (
    <motion.div className="gate" role="dialog" aria-label={title} variants={overlayPanel} initial="initial" animate="enter" exit="exit">
        <h2>{title}</h2>
        <p>請回答下面的題目，證明你是大人</p>
        <div className="q">
          {q.a} + {q.b} = ?
        </div>
        <div className={`ans${bad ? ' bad' : ''}`} aria-live="polite">
          {val}
        </div>
        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].map((k) => (
            <button key={k} onClick={() => press(k)} aria-label={k === '⌫' ? '刪除' : k}>
              {k}
            </button>
          ))}
          <button onClick={submit} style={{ background: 'var(--ink)', color: 'var(--card)', fontSize: 18, fontFamily: 'Huninn' }}>
            確定
          </button>
        </div>
        <div className="row">
          <button onClick={onCancel}>取消</button>
        </div>
    </motion.div>
  )
}

/** 右上角隱形熱區：按住 3 秒才會出現家長閘門 */
export function ParentCorner({ onOpen, color = 'rgba(46,42,37,0.35)' }: { onOpen: () => void; color?: string }) {
  const { progress, handlers } = useHold(3000, onOpen)
  return (
    <div className="parent-corner" {...handlers} aria-hidden="true">
      {progress > 0.12 && <Ring progress={(progress - 0.12) / 0.88} color={color} width={7} />}
    </div>
  )
}
