import { useState } from 'react'
import { rand } from '../lib/random'
import { useHold, Ring } from './Hold'

function question() {
  const a = 12 + rand(8)
  const b = 4 + rand(6)
  return { a, b, sum: a + b }
}

/** 家長閘門：兩位數加法，3 歲孩子解不開，大人一秒就過 */
export function ParentGate({ onPass, onCancel, title = '家長確認' }: { onPass: () => void; onCancel: () => void; title?: string }) {
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
    <div className="gate-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="gate" role="dialog" aria-label={title}>
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
      </div>
    </div>
  )
}

/** 右上角隱形熱區：按住 3 秒才會出現家長閘門 */
export function ParentCorner({ onOpen }: { onOpen: () => void }) {
  const { progress, handlers } = useHold(3000, onOpen)
  return (
    <div className="parent-corner" {...handlers} aria-hidden="true">
      {progress > 0.12 && <Ring progress={(progress - 0.12) / 0.88} color="rgba(46,42,37,0.35)" width={7} />}
    </div>
  )
}
