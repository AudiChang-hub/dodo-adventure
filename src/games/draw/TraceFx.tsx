import { motion } from 'motion/react'
import type { P2 } from './track'

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
