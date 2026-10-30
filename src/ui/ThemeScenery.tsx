import type { ReactNode } from 'react'
import type { SceneKind, ThemeDef } from '../content/themes'

/**
 * 主題式冒險的背景：整趟冒險（路線、轉場、每一站的遊戲）都是同一個場景，孩子感覺是同一個故事。
 * 規則和 Scenery.tsx 一樣：只畫在地面帶與左右最外緣、低對比、單一色系的剪影，
 * 不畫圓點、彩色方塊這類像題目物件的東西（孩子會以為可以點、可以數）。
 * 顏色全部從主題的地面色、強調色推算，換主題不用另外調色。
 */

/** 兩個 #RRGGBB 依比例混色 */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

interface Ink {
  /** 地面 */
  ground: string
  /** 剪影（比地面深一點） */
  shape: string
  /** 剪影上的亮面（窗戶、條紋） */
  light: string
  /** 最淡的遠景 */
  far: string
}

const PAPER = '#FBF8F2'

const scenes: Record<SceneKind, (c: Ink) => ReactNode> = {
  // 街道：兩側的房子（窗戶是長方形、和牆同色系），地面是有虛線的馬路
  city: (c) => (
    <g>
      <path d="M0 694 H1200 V800 H0 Z" fill={c.ground} />
      <path d="M0 742 H1200" stroke={c.light} strokeWidth={7} strokeDasharray="46 34" strokeLinecap="round" />
      {[
        [-20, 470, 130, 224],
        [92, 540, 92, 154],
        [1040, 500, 120, 194],
        [1150, 430, 90, 264],
      ].map(([x, y, w, h], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} rx={14} fill={c.far} />
          {Array.from({ length: Math.floor((h - 40) / 52) }, (_, r) =>
            Array.from({ length: Math.floor((w - 20) / 40) }, (_, k) => <rect key={`${r}-${k}`} x={x + 18 + k * 40} y={y + 22 + r * 52} width={22} height={30} rx={5} fill={c.light} />),
          )}
        </g>
      ))}
    </g>
  ),
  // 恐龍谷：遠方的火山與蕨類，起伏的草地
  valley: (c) => (
    <g>
      <path d="M-40 560 L70 420 Q90 400 110 420 L230 560 Z" fill={c.far} />
      <path d="M70 420 Q90 392 110 420 L102 430 Q90 418 78 430 Z" fill={c.light} />
      <path d="M0 690 Q300 640 600 684 T1200 664 V800 H0 Z" fill={c.ground} />
      {[
        [1110, 700, 1],
        [1186, 690, 0.8],
        [40, 700, 0.75],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          {[-62, -30, 0, 30, 62].map((a) => (
            <path key={a} d="M0 0 Q-14 -90 0 -170 Q14 -90 0 0 Z" fill={c.shape} transform={`rotate(${a})`} />
          ))}
        </g>
      ))}
    </g>
  ),
  // 農場：木柵欄、遠方的穀倉
  farm: (c) => (
    <g>
      <path d="M1010 694 V560 L1090 500 L1170 560 V694 Z" fill={c.far} />
      <path d="M1066 694 V620 H1114 V694 M1066 620 L1114 694 M1114 620 L1066 694" stroke={c.light} strokeWidth={6} fill="none" />
      <path d="M0 694 Q600 668 1200 694 V800 H0 Z" fill={c.ground} />
      {[0, 1].map((side) => (
        <g key={side} transform={side ? 'translate(1200 0) scale(-1 1)' : undefined}>
          {[20, 90, 160].map((x) => (
            <rect key={x} x={x} y={630} width={16} height={84} rx={6} fill={c.shape} />
          ))}
          <rect x={0} y={650} width={190} height={12} rx={6} fill={c.shape} />
          <rect x={0} y={684} width={190} height={12} rx={6} fill={c.shape} />
        </g>
      ))}
    </g>
  ),
  // 海：一層一層的浪，遠方一艘小帆船
  sea: (c) => (
    <g>
      <path d="M60 640 L130 640 L118 662 L72 662 Z M96 640 V584 L130 630 Z" fill={c.far} />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M0 ${684 + i * 34} ${Array.from({ length: 13 }, () => `q50 ${i % 2 ? 16 : -16} 100 0`).join(' ')} V800 H0 Z`}
          fill={[c.far, c.ground, c.shape][i]}
          opacity={i === 2 ? 0.7 : 1}
        />
      ))}
    </g>
  ),
  // 下雨天：兩角的雲、斜斜的雨絲、地上的水窪
  rain: (c) => (
    <g>
      {[
        [80, 210, 1],
        [1120, 260, 0.85],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M-90 30 Q-96 -12 -54 -18 Q-40 -60 4 -50 Q40 -72 66 -34 Q104 -30 98 12 Q100 34 76 34 H-70 Q-92 34 -90 30 Z" fill={c.far} />
          {[-60, -20, 20, 60].map((dx) => (
            <path key={dx} d={`M${dx} 60 l-12 34`} stroke={c.shape} strokeWidth={6} strokeLinecap="round" />
          ))}
        </g>
      ))}
      <path d="M0 694 H1200 V800 H0 Z" fill={c.ground} />
      <ellipse cx={180} cy={748} rx={110} ry={16} fill={c.light} />
      <ellipse cx={1020} cy={760} rx={130} ry={18} fill={c.light} />
    </g>
  ),
  // 市場：兩側的攤子（條紋遮雨棚）與木箱
  market: (c) => (
    <g>
      <path d="M0 694 H1200 V800 H0 Z" fill={c.ground} />
      {[0, 1].map((side) => (
        <g key={side} transform={side ? 'translate(1200 0) scale(-1 1)' : undefined}>
          <rect x={14} y={480} width={12} height={220} rx={5} fill={c.shape} />
          <rect x={170} y={480} width={12} height={220} rx={5} fill={c.shape} />
          <path d={`M-10 470 H206 V500 ${Array.from({ length: 6 }, () => `q-18 26 -36 0`).join(' ')} Z`} fill={c.shape} />
          {[0, 2, 4].map((k) => (
            <rect key={k} x={-10 + k * 36} y={470} width={36} height={30} fill={c.light} />
          ))}
          <rect x={30} y={630} width={140} height={64} rx={8} fill={c.far} />
          <path d="M30 652 H170 M30 674 H170" stroke={c.shape} strokeWidth={5} />
        </g>
      ))}
    </g>
  ),
  // 動物園：平頂的樹與欄杆
  zoo: (c) => (
    <g>
      {[
        [90, 560, 1],
        [1110, 540, 1.15],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M-8 140 Q-4 60 -30 20 M8 140 Q4 60 30 20" stroke={c.shape} strokeWidth={14} strokeLinecap="round" fill="none" />
          <path d="M-110 26 Q-90 -26 0 -30 Q90 -26 110 26 Q60 40 0 36 Q-60 40 -110 26 Z" fill={c.far} />
        </g>
      ))}
      <path d="M0 694 Q600 672 1200 694 V800 H0 Z" fill={c.ground} />
      <path d="M0 660 H1200" stroke={c.shape} strokeWidth={8} opacity={0.55} />
      {Array.from({ length: 25 }, (_, k) => k * 50).map((x) => (
        <path key={x} d={`M${x} 652 V700`} stroke={c.shape} strokeWidth={6} opacity={0.55} strokeLinecap="round" />
      ))}
    </g>
  ),
  // 工地：吊車的線條、路邊的三角錐
  site: (c) => (
    <g>
      <g stroke={c.far} strokeWidth={12} strokeLinecap="round" fill="none">
        <path d="M70 700 V270 M70 280 H330 M70 330 L130 280 M330 280 V380" />
        <path d="M70 360 L110 320 M70 440 L110 400 M70 520 L110 480 M70 600 L110 560" strokeWidth={7} />
      </g>
      <rect x={300} y={380} width={60} height={34} rx={6} fill={c.far} />
      <path d="M0 700 H1200 V800 H0 Z" fill={c.ground} />
      {[1060, 1150].map((x) => (
        <g key={x} transform={`translate(${x} 704)`}>
          <path d="M-30 0 L-8 -84 H8 L30 0 Z" fill={c.shape} />
          <rect x={-20} y={-50} width={40} height={13} fill={c.light} />
          <rect x={-40} y={-6} width={80} height={12} rx={4} fill={c.shape} />
        </g>
      ))}
    </g>
  ),
  // 晚上：右邊的月亮（月牙）、四角星（不是圓點）、遠方的屋頂
  night: (c) => (
    <g>
      <path d="M1130 150 a64 64 0 1 0 50 104 a52 52 0 1 1 -50 -104 Z" fill={c.far} />
      {[
        [70, 230, 1],
        [150, 330, 0.6],
        [1060, 380, 0.7],
      ].map(([x, y, s], i) => (
        <path key={i} d="M0 -22 Q4 -4 22 0 Q4 4 0 22 Q-4 4 -22 0 Q-4 -4 0 -22 Z" fill={c.far} transform={`translate(${x} ${y}) scale(${s})`} />
      ))}
      <path d="M-20 694 V600 L60 540 L140 600 V694 Z M1040 694 V610 L1120 556 L1220 620 V694 Z" fill={c.shape} />
      <rect x={42} y={612} width={34} height={40} rx={6} fill={c.light} />
      <path d="M0 694 H1200 V800 H0 Z" fill={c.ground} />
    </g>
  ),
  // 派對：兩角垂下的三角旗（同色系、深淺交錯），地上的禮物盒剪影
  party: (c) => (
    <g>
      {[0, 1].map((side) => (
        <g key={side} transform={side ? 'translate(1200 0) scale(-1 1)' : undefined}>
          <path d="M-10 150 Q130 250 250 170" stroke={c.shape} strokeWidth={4} fill="none" />
          {[0, 1, 2, 3, 4].map((k) => {
            const x = 10 + k * 48
            const y = 160 + Math.sin((k + 0.6) / 1.6) * 52
            return <path key={k} d={`M${x} ${y} h38 l-19 46 Z`} fill={k % 2 ? c.light : c.far} />
          })}
        </g>
      ))}
      <path d="M0 694 H1200 V800 H0 Z" fill={c.ground} />
      <g transform="translate(1060 694)">
        <rect x={0} y={-74} width={90} height={74} rx={8} fill={c.shape} />
        <rect x={38} y={-74} width={14} height={74} fill={c.light} />
        <rect x={-6} y={-88} width={102} height={20} rx={6} fill={c.shape} />
      </g>
    </g>
  ),
  // 公園：圓圓的樹、起伏的草地
  park: (c) => (
    <g>
      {[
        [80, 560, 1],
        [1120, 540, 1.2],
        [1196, 610, 0.7],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x={-10} y={0} width={20} height={140} rx={9} fill={c.shape} />
          <path d="M-70 10 Q-90 -70 -20 -90 Q10 -130 50 -90 Q100 -70 74 6 Q40 36 0 24 Q-40 36 -70 10 Z" fill={c.far} />
        </g>
      ))}
      <path d="M0 690 Q300 650 600 688 T1200 668 V800 H0 Z" fill={c.ground} />
    </g>
  ),
}

export function ThemeScenery({ def }: { def: Pick<ThemeDef, 'ground' | 'deep' | 'tint' | 'scene'> }) {
  const ink: Ink = {
    ground: def.ground,
    shape: mix(def.ground, def.deep, 0.22),
    light: mix(def.ground, PAPER, 0.5),
    far: mix(def.tint, def.ground, 0.7),
  }
  return (
    <svg className="scenery" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}>
      {scenes[def.scene](ink)}
    </svg>
  )
}
