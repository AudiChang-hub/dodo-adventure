import { useId } from 'react'
import { motion } from 'motion/react'
import type { P2 } from './track'

/**
 * 還剩哪一段（T-106，第六次盲測描小 s：描到右下的彎放手，剩下的尾巴只有淡淡的虛線，他說「不知道對不對」就離開）：
 * 描到一半時，這一筆還沒描的那一段跑道輕輕亮起來，一串小點從斷掉的地方往終點流過去（往這邊、還有這一段）。
 * 只蓋在還沒描的那一段（mask 用 pathLength 切），描好的那一段不受影響。
 */
export function RestGuide({ d, at, total, color, lane }: { d: string; at: number; total: number; color: string; lane: number }) {
  const id = `rest-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const rest = Math.max(0, total - at)
  return (
    <g data-trace-rest="" pointerEvents="none">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse">
          {/* 圓頭：終點那一端跟跑道一樣是圓的（不會切出一條直邊）；起點那一端的圓頭蓋在綠點下面 */}
          <path d={d} fill="none" stroke="#fff" strokeWidth={lane + 4} strokeLinecap="round" strokeLinejoin="round" pathLength={total} strokeDasharray={`${rest + 1} ${total + 5}`} strokeDashoffset={-at} />
        </mask>
      </defs>
      <g mask={`url(#${id})`}>
        <motion.path d={d} fill="none" stroke={color} strokeWidth={lane} strokeLinecap="round" strokeLinejoin="round" initial={{ opacity: 0.1 }} animate={{ opacity: [0.1, 0.28, 0.1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="0.01 6"
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: -6.01 }}
          transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
        />
      </g>
    </g>
  )
}

/**
 * 終點的星星（T-106）：這一筆描到這裡就好了。描過一半以後輕輕晃，看得出「快好了」。
 * 起點是綠點、終點是星星：不靠語言也看得出從哪裡到哪裡。繞一圈回到起點的筆畫不放。
 */
export function GoalStar({ at, from, near }: { at: P2; from: P2; near: boolean }) {
  // 起點、終點在同一個地方（o、0 這種繞一圈的）：不放星星，免得蓋住綠點
  if (Math.hypot(at.x - from.x, at.y - from.y) < 12) return null
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 2.6 : 6
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
  return (
    <g data-trace-goal="" transform={`translate(${at.x} ${at.y})`} pointerEvents="none">
      <motion.g animate={near ? { rotate: [0, -12, 12, 0], scale: [1, 1.15, 1] } : { rotate: 0, scale: 1 }} transition={near ? { duration: 1.2, repeat: Infinity, repeatDelay: 0.4 } : { duration: 0.3 }}>
        <polygon points={pts} fill="#F4C85A" stroke="#FFFFFF" strokeWidth={1.2} strokeLinejoin="round" />
      </motion.g>
    </g>
  )
}

// 描字的兩個不靠語言的記號（T-95，AI 小男生盲測：英文的鼓勵他聽不懂，看不出斷在哪裡、什麼時候算畫完）。
// 英文課的描字母（lessons/english/Trace.tsx）、數學課的寫數字（lessons/math/Write.tsx）共用。

/**
 * 描到一半放手：綠點移到要接著描的地方，一圈光一直往外擴（準則 DRAW-2：放開再畫不會重來）。
 * 起點的綠點同時淡掉；「Start at the green dot!」說的綠點就是這一顆。
 */
export function ResumeDot({ at, color }: { at: P2; color: string }) {
  return (
    <g data-resume-dot="">
      <motion.circle
        cx={at.x}
        cy={at.y}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        initial={{ r: 6, opacity: 0.9 }}
        animate={{ r: 16, opacity: 0 }}
        transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.5, ease: 'easeOut' }}
      />
      <motion.circle cx={at.x} cy={at.y} fill={color} initial={{ r: 6 }} animate={{ r: [5.5, 8, 5.5] }} transition={{ duration: 1.2, repeat: Infinity }} />
    </g>
  )
}

const RAINBOW = ['#EE8F86', '#F4B66A', '#EED36A', '#8FCB9B', '#86B6E3', '#B59BDA']

/**
 * 畫完：整個字的跑道變成彩虹色、跳一下（glyph.css 的 .trace-pop），加上星星（Sparkles）和完成的音效。
 * 斜著一條彩虹（左上到右下）：直的 1、橫的線都看得到好幾個顏色。
 */
export function RainbowDef({ id, w, h }: { id: string; w: number; h: number }) {
  return (
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2={h}>
        {RAINBOW.map((c, i) => (
          <stop key={c} offset={i / (RAINBOW.length - 1)} stopColor={c} />
        ))}
      </linearGradient>
    </defs>
  )
}
