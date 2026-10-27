import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Dino } from '../art/Dino'
import { ParentCorner, ParentGate } from '../ui/ParentGate'
import { go } from '../lib/nav'
import { say } from '../lib/audio'
import { grantExtra } from '../lib/session'

/** 每日時間到：豆豆睡著了。家長按住右上角 3 秒可以延長 */
export function Bedtime() {
  const [gate, setGate] = useState(false)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    void say('bedtime')
  }, [])

  return (
    <div className="screen bedtime">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        {Array.from({ length: 26 }, (_, i) => (
          <circle key={i} cx={(i * 137) % 1200} cy={(i * 89) % 420} r={(i % 3) + 2} fill="#F3EEE4" opacity={0.25 + (i % 4) * 0.15} />
        ))}
        <circle cx={960} cy={160} r={70} fill="#F6DE95" />
        <circle cx={990} cy={140} r={62} fill="#3b4560" />
        <path d="M0 640 Q600 590 1200 640 V800 H0 Z" fill="#2F374D" />
        <rect x={360} y={560} width={480} height={90} rx={30} fill="#A3C4E4" opacity={0.55} />
      </svg>
      <motion.div style={{ position: 'absolute', left: '50%', bottom: '18vh', width: '34vmin', marginLeft: '-17vmin' }} animate={{ y: [0, 4, 0] }} transition={{ duration: 3.6, repeat: Infinity }}>
        <Dino who="dodo" mood="sleep" size="100%" />
      </motion.div>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{ position: 'absolute', left: '58%', top: '34%', fontFamily: 'Fredoka', fontSize: 40 + i * 10, color: '#F3EEE4' }}
          animate={{ y: [-0, -120], x: [0, 40], opacity: [0, 1, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: i, ease: 'easeOut' }}
          aria-hidden="true"
        >
          z
        </motion.span>
      ))}
      {!gate && !menu && <ParentCorner onOpen={() => setGate(true)} color="rgba(243,238,228,0.5)" />}
      <div className="note">家長：按住右上角 3 秒可以延長時間</div>
      {gate && (
        <ParentGate
          title="延長遊戲時間"
          onCancel={() => setGate(false)}
          onPass={() => {
            setGate(false)
            setMenu(true)
          }}
        />
      )}
      {menu && (
        <div className="gate-backdrop">
          <div className="gate">
            <h2>要怎麼做呢？</h2>
            <p>今天的時間已經用完了</p>
            <div className="row stack">
              {[10, 20].map((m) => (
                <button
                  key={m}
                  className="primary"
                  onClick={() => {
                    grantExtra(m)
                    go({ name: 'home' })
                  }}
                >
                  再玩 {m} 分鐘
                </button>
              ))}
              <button onClick={() => go({ name: 'parent' })}>進入家長區</button>
              <button onClick={() => setMenu(false)}>維持休息</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
