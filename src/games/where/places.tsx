// 躲在哪裡（T-160）的場景：房間（牆＋地板）和戶外。場景座標 1000×620，大東西站在 (500, 560)。
// 往左右、上下多畫一大塊（-600～1600），寬的螢幕、直的手機都不會露出空白。
// 裝飾都放在兩邊、後面，而且不放動物（不會跟要找的小動物搞混）；全部靜止（準則 MOTION-2）。
import type { ReactElement, ReactNode } from 'react'
import type { PlaceId } from './data'
import { L } from './things'

export const SCENE_W = 1000
export const SCENE_H = 620
export const GROUND = 560

function Room({ wall, floor, floorLine, board = '#FBF8F2', children }: { wall: string; floor: string; floorLine: string; board?: string; children?: ReactNode }) {
  return (
    <g>
      <rect x={-600} y={-300} width={2200} height={740} fill={wall} />
      <rect x={-600} y={430} width={2200} height={600} fill={floor} />
      {[480, 540, 610, 690].map((y) => (
        <path key={y} d={`M-600 ${y} H1600`} stroke={floorLine} strokeWidth={3} opacity={0.5} />
      ))}
      <rect x={-600} y={418} width={2200} height={16} fill={board} stroke={floorLine} strokeWidth={3} />
      {children}
    </g>
  )
}

function Window({ x, y, w = 170, h = 150, sky = '#CFE6F0', curtain }: { x: number; y: number; w?: number; h?: number; sky?: string; curtain?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={sky} {...L('#B9A58E', 6)} />
      <path d={`M${x + w / 2} ${y} V${y + h} M${x} ${y + h / 2} H${x + w}`} stroke="#B9A58E" strokeWidth={6} />
      <circle cx={x + w * 0.28} cy={y + h * 0.3} r={14} fill="#F2D27A" />
      {curtain && (
        <>
          <path d={`M${x - 26} ${y - 14} H${x + 24} Q${x + 10} ${y + h * 0.6} ${x + 26} ${y + h + 20} H${x - 26} Z`} fill={curtain} {...L('#2E2A25', 3)} opacity={0.95} />
          <path d={`M${x + w + 26} ${y - 14} H${x + w - 24} Q${x + w - 10} ${y + h * 0.6} ${x + w - 26} ${y + h + 20} H${x + w + 26} Z`} fill={curtain} {...L('#2E2A25', 3)} opacity={0.95} />
        </>
      )}
    </g>
  )
}

function Frame({ x, y, w = 110, h = 86, art }: { x: number; y: number; w?: number; h?: number; art: 'hill' | 'sun' | 'boat' | 'flower' }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="#FBF8F2" {...L('#A87A4E', 6)} />
      {art === 'hill' && <path d={`M${x + 6} ${y + h - 6} Q${x + w * 0.35} ${y + h * 0.35} ${x + w * 0.6} ${y + h * 0.7} Q${x + w * 0.8} ${y + h * 0.5} ${x + w - 6} ${y + h * 0.65} V${y + h - 6} Z`} fill="#9CCB7E" />}
      {art === 'sun' && <circle cx={x + w / 2} cy={y + h / 2} r={h * 0.26} fill="#F2C94C" />}
      {art === 'boat' && <path d={`M${x + w * 0.25} ${y + h * 0.62} H${x + w * 0.75} L${x + w * 0.66} ${y + h * 0.78} H${x + w * 0.34} Z M${x + w / 2} ${y + h * 0.6} V${y + h * 0.2} L${x + w * 0.7} ${y + h * 0.52} Z`} fill="#7FB2E5" />}
      {art === 'flower' && (
        <g>
          <circle cx={x + w / 2} cy={y + h * 0.42} r={10} fill="#F2C94C" />
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={x + w / 2 + Math.cos((a * Math.PI) / 180) * 18} cy={y + h * 0.42 + Math.sin((a * Math.PI) / 180) * 18} r={10} fill="#F2A9A0" />
          ))}
          <path d={`M${x + w / 2} ${y + h * 0.55} V${y + h - 8}`} stroke="#6E9E58" strokeWidth={5} />
        </g>
      )}
    </g>
  )
}

function Rug({ cx, color, line }: { cx: number; color: string; line: string }) {
  return (
    <g>
      <ellipse cx={cx} cy={572} rx={420} ry={44} fill={color} {...L(line, 4)} />
      <ellipse cx={cx} cy={572} rx={360} ry={30} fill="none" stroke="#fff" strokeWidth={5} opacity={0.5} strokeDasharray="18 14" />
    </g>
  )
}

function Plant({ x, y = 430, k = 1 }: { x: number; y?: number; k?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <path d="M-26 0 L-34 -60 H34 L26 0 Z" fill="#E0886E" {...L('#A85A44', 4)} />
      <path d="M0 -60 Q-50 -110 -30 -160 Q0 -110 0 -60 Q10 -130 50 -150 Q40 -90 0 -60 Q-20 -120 -70 -110 Q-50 -70 0 -60" fill="#9CCB7E" {...L('#6E9E58', 4)} />
    </g>
  )
}

function Sky({ top = '#CFE6F0', ground, line, horizon = 400 }: { top?: string; ground: string; line: string; horizon?: number }) {
  return (
    <g>
      <rect x={-600} y={-300} width={2200} height={horizon + 300} fill={top} />
      <rect x={-600} y={horizon} width={2200} height={900} fill={ground} />
      <path d={`M-600 ${horizon} H1600`} stroke={line} strokeWidth={4} />
    </g>
  )
}

function Cloud({ x, y, k = 1 }: { x: number; y: number; k?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} fill="#fff" {...L('#B6CFE0', 4)}>
      <path d="M-70 20 Q-90 -10 -56 -18 Q-50 -52 -10 -44 Q14 -70 46 -44 Q86 -46 76 -6 Q96 20 60 24 Z" />
    </g>
  )
}

function SunDisc({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={44} fill="#F5D27A" {...L('#E0B04A', 5)} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return <path key={i} d={`M${x + Math.cos(a) * 58} ${y + Math.sin(a) * 58} L${x + Math.cos(a) * 76} ${y + Math.sin(a) * 76}`} stroke="#E0B04A" strokeWidth={7} strokeLinecap="round" />
      })}
    </g>
  )
}

function FarTree({ x, y, k = 1, c = '#9CCB7E', d = '#6E9E58' }: { x: number; y: number; k?: number; c?: string; d?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <rect x={-12} y={-60} width={24} height={60} rx={6} fill="#B98A5E" {...L('#7E5B3C', 4)} />
      <circle cx={0} cy={-100} r={56} fill={c} {...L(d, 5)} />
    </g>
  )
}

function Pine({ x, y, k = 1, snow }: { x: number; y: number; k?: number; snow?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <rect x={-10} y={-34} width={20} height={34} fill="#B98A5E" {...L('#7E5B3C', 4)} />
      <path d="M0 -200 L60 -110 H34 L80 -34 H-80 L-34 -110 H-60 Z" fill={snow ? '#8FBF9A' : '#6FAF7E'} {...L('#3E7C51', 5)} />
      {snow && <path d="M0 -200 L30 -156 Q0 -146 -30 -156 Z M-40 -100 Q0 -88 40 -100 L52 -88 Q0 -76 -52 -88 Z" fill="#fff" />}
    </g>
  )
}

function Fence({ y, from, to, c = '#FBF8F2', d = '#B9A58E' }: { y: number; from: number; to: number; c?: string; d?: string }) {
  const posts: number[] = []
  for (let x = from; x <= to; x += 46) posts.push(x)
  return (
    <g>
      <path d={`M${from} ${y - 50} H${to} M${from} ${y - 20} H${to}`} stroke={d} strokeWidth={10} strokeLinecap="round" />
      {posts.map((x) => (
        <path key={x} d={`M${x - 13} ${y} V${y - 70} L${x} ${y - 86} L${x + 13} ${y - 70} V${y} Z`} fill={c} {...L(d, 4)} />
      ))}
    </g>
  )
}

function Flowers({ x, y, c = '#F2A9A0' }: { x: number; y: number; c?: string }) {
  return (
    <g>
      {[0, 34, 70].map((dx, i) => (
        <g key={i} transform={`translate(${x + dx} ${y - (i % 2) * 10})`}>
          <path d="M0 0 V-34" stroke="#6E9E58" strokeWidth={5} strokeLinecap="round" />
          <circle cx={0} cy={-40} r={12} fill={i === 1 ? '#F5D27A' : c} {...L('#C9736B', 3)} />
          <circle cx={0} cy={-40} r={4} fill="#fff" />
        </g>
      ))}
    </g>
  )
}

const BACKDROPS: Record<PlaceId, () => ReactElement> = {
  bedroom: () => (
    <Room wall="#E7DDF1" floor="#E3C9A6" floorLine="#C4A27C">
      <g fill="#fff" opacity={0.7}>
        {[
          [80, 60],
          [260, 130],
          [760, 80],
          [920, 170],
          [-60, 220],
          [1090, 60],
          [420, 40],
        ].map(([x, y]) => (
          <path key={`${x}`} d={`M${x} ${y - 12} L${x + 4} ${y - 4} L${x + 12} ${y} L${x + 4} ${y + 4} L${x} ${y + 12} L${x - 4} ${y + 4} L${x - 12} ${y} L${x - 4} ${y - 4} Z`} />
        ))}
      </g>
      <Window x={60} y={110} curtain="#CFA0C9" />
      <Frame x={820} y={150} art="sun" />
      <Rug cx={500} color="#A9CBE6" line="#6F9CC8" />
    </Room>
  ),
  kitchen: () => (
    <Room wall="#FBEFD9" floor="#D9DDE2" floorLine="#AEB5BE">
      <rect x={-600} y={300} width={2200} height={118} fill="#fff" />
      <path d={Array.from({ length: 50 }, (_, i) => `M${-600 + i * 46} 300 V418`).join(' ') + ' M-600 359 H1600'} stroke="#D7E3EA" strokeWidth={3} />
      <Window x={80} y={90} w={190} curtain="#F2A9A0" />
      {/* 時鐘、掛著的鍋子 */}
      <circle cx={840} cy={120} r={46} fill="#fff" {...L('#B9A58E', 6)} />
      <path d="M840 120 V92 M840 120 H862" stroke="#2E2A25" strokeWidth={5} strokeLinecap="round" />
      <path d="M770 220 H930" stroke="#8C96A0" strokeWidth={6} strokeLinecap="round" />
      <g>
        <path d="M790 220 V240" stroke="#8C96A0" strokeWidth={4} />
        <circle cx={790} cy={266} r={26} fill="#E0886E" {...L('#A85A44', 4)} />
        <path d="M900 220 V236" stroke="#8C96A0" strokeWidth={4} />
        <path d="M880 236 H920 L914 280 H886 Z" fill="#B4BCC4" {...L('#7D828A', 4)} />
      </g>
    </Room>
  ),
  living: () => (
    <Room wall="#DDEBD9" floor="#D4B08C" floorLine="#B38B65">
      <Frame x={90} y={120} w={130} h={100} art="hill" />
      <Frame x={240} y={150} w={80} h={70} art="flower" />
      {/* 立燈 */}
      <g>
        <path d="M900 430 V180" stroke="#8C96A0" strokeWidth={8} />
        <path d="M850 190 L870 120 H930 L950 190 Z" fill="#F5D27A" {...L('#C9A043', 5)} />
        <ellipse cx={900} cy={432} rx={36} ry={8} fill="#8C96A0" />
      </g>
      <Plant x={80} />
      <Rug cx={500} color="#F2C9A0" line="#C99A6A" />
    </Room>
  ),
  bathroom: () => (
    <Room wall="#D9EEF0" floor="#C9D6DE" floorLine="#9FB0BC" board="#E9F4F6">
      <path d={Array.from({ length: 50 }, (_, i) => `M${-600 + i * 60} 120 V418`).join(' ') + ' ' + [180, 240, 300, 360].map((y) => `M-600 ${y} H1600`).join(' ')} stroke="#fff" strokeWidth={4} opacity={0.8} />
      <rect x={60} y={80} width={130} height={150} rx={60} fill="#E7F3FA" {...L('#9AA7B2', 6)} />
      <path d="M90 140 Q110 110 140 104" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
      {/* 毛巾架 */}
      <path d="M800 200 H930" stroke="#8C96A0" strokeWidth={7} strokeLinecap="round" />
      <path d="M816 200 H900 V300 Q858 312 816 300 Z" fill="#F2A9A0" {...L('#C9736B', 4)} />
      <path d="M816 280 H900" stroke="#fff" strokeWidth={6} opacity={0.6} />
    </Room>
  ),
  playroom: () => (
    <Room wall="#FCE7C8" floor="#BFD9B0" floorLine="#8FB57E">
      {/* 三角旗 */}
      <path d="M-100 60 Q500 150 1100 60" fill="none" stroke="#B9A58E" strokeWidth={4} />
      {Array.from({ length: 13 }, (_, i) => {
        const x = -60 + i * 90
        const t = (x + 100) / 1200
        const y = 60 + 4 * t * (1 - t) * 90 * 0.95
        const c = ['#E0604E', '#F2C94C', '#5DAE76', '#4F7FC2'][i % 4]
        return <path key={i} d={`M${x - 22} ${y} L${x + 22} ${y} L${x} ${y + 42} Z`} fill={c} {...L('#2E2A25', 3)} />
      })}
      <g>
        <rect x={60} y={340} width={70} height={70} rx={8} fill="#7FB2E5" {...L('#4F7FC2', 4)} transform="rotate(-6 95 375)" />
        <rect x={120} y={360} width={56} height={56} rx={8} fill="#F2C94C" {...L('#B8913A', 4)} />
        <circle cx={900} cy={380} r={36} fill="#E0604E" {...L('#A8443A', 4)} />
        <path d="M866 380 Q900 400 934 380" fill="none" stroke="#fff" strokeWidth={5} />
      </g>
    </Room>
  ),
  classroom: () => (
    <Room wall="#F3EBD8" floor="#CDB79A" floorLine="#AE9572">
      <rect x={60} y={80} width={250} height={150} rx={10} fill="#4F7A64" {...L('#A87A4E', 10)} />
      <path d="M100 130 Q130 110 160 130 T220 130 M100 180 H200" fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.85} />
      <circle cx={860} cy={110} r={44} fill="#fff" {...L('#B9A58E', 6)} />
      <path d="M860 110 V86 M860 110 L880 122" stroke="#2E2A25" strokeWidth={5} strokeLinecap="round" />
      {/* 牆上的圖畫（小朋友畫的太陽、房子） */}
      <g>
        <rect x={760} y={200} width={90} height={80} rx={4} fill="#fff" {...L('#B9A58E', 4)} />
        <circle cx={805} cy={240} r={18} fill="#F2C94C" />
        <rect x={870} y={196} width={90} height={80} rx={4} fill="#fff" {...L('#B9A58E', 4)} />
        <path d="M890 262 V236 L915 216 L940 236 V262 Z" fill="#F2A9A0" />
      </g>
    </Room>
  ),
  garden: () => (
    <g>
      <Sky ground="#B9DB9C" line="#8FBF74" horizon={380} />
      <SunDisc x={880} y={90} />
      <Cloud x={200} y={100} />
      <Cloud x={620} y={70} k={0.7} />
      {/* 房子的牆角、窗戶 */}
      <rect x={-600} y={120} width={720} height={262} fill="#F3D9B8" {...L('#C9A57E', 5)} />
      <rect x={-20} y={180} width={110} height={100} rx={8} fill="#CFE6F0" {...L('#B9A58E', 5)} />
      <Fence y={384} from={150} to={1500} />
      <Flowers x={40} y={450} />
      <Flowers x={880} y={460} c="#CFA0C9" />
    </g>
  ),
  park: () => (
    <g>
      <Sky ground="#A9D68C" line="#82B466" horizon={370} />
      <path d="M-600 380 Q-100 260 300 340 Q700 250 1600 360 V420 H-600 Z" fill="#C8E3A6" {...L('#9CC27E', 4)} />
      <Cloud x={160} y={90} />
      <Cloud x={820} y={120} k={0.8} />
      <FarTree x={60} y={380} k={0.9} />
      <FarTree x={940} y={380} k={0.8} c="#B5D88A" d="#7FA552" />
      <path d="M380 620 Q460 480 600 400 H660 Q560 500 520 620 Z" fill="#EADBB8" opacity={0.8} />
      <Flowers x={820} y={470} c="#F5D27A" />
    </g>
  ),
  farm: () => (
    <g>
      <Sky ground="#C9DB8F" line="#9FB86A" horizon={380} />
      <path d="M-600 390 Q0 300 500 360 Q900 310 1600 380 V420 H-600 Z" fill="#D9E6A8" {...L('#A9BD72', 4)} />
      <SunDisc x={120} y={90} />
      {/* 遠遠的紅色穀倉 */}
      <g transform="translate(840 380)">
        <path d="M-90 0 V-110 L0 -170 L90 -110 V0 Z" fill="#E0604E" {...L('#A8443A', 5)} />
        <path d="M-36 0 V-70 H36 V0 M-36 -70 L36 0 M36 -70 L-36 0" fill="#FBF8F2" {...L('#A8443A', 5)} />
      </g>
      <Fence y={420} from={-600} to={300} c="#E3B98A" d="#A87A4E" />
      {/* 乾草捆 */}
      <g transform="translate(120 470)">
        <rect x={-60} y={-60} width={120} height={70} rx={20} fill="#F2D27A" {...L('#C9A043', 5)} />
        <path d="M-40 -50 V0 M0 -50 V0 M40 -50 V0" stroke="#C9A043" strokeWidth={4} opacity={0.6} />
      </g>
    </g>
  ),
  forest: () => (
    <g>
      <Sky top="#D7ECE4" ground="#9CC98A" line="#78A866" horizon={390} />
      {[-200, -20, 120, 260, 760, 880, 1020, 1160].map((x, i) => (
        <Pine key={x} x={x} y={392} k={0.9 + (i % 3) * 0.15} />
      ))}
      <FarTree x={640} y={392} k={0.7} c="#8FC07A" d="#5F8F4E" />
      {/* 香菇 */}
      <g transform="translate(140 520)">
        <path d="M-10 0 V-26 H10 V0 Z" fill="#FBF8F2" {...L('#B9A58E', 4)} />
        <path d="M-32 -24 Q0 -66 32 -24 Z" fill="#E0604E" {...L('#A8443A', 4)} />
        <circle cx={-10} cy={-38} r={5} fill="#fff" />
        <circle cx={10} cy={-32} r={4} fill="#fff" />
      </g>
      <g transform="translate(880 540)">
        <path d="M-8 0 V-20 H8 V0 Z" fill="#FBF8F2" {...L('#B9A58E', 4)} />
        <path d="M-26 -18 Q0 -52 26 -18 Z" fill="#E3B98A" {...L('#A87A4E', 4)} />
      </g>
    </g>
  ),
  beach: () => (
    <g>
      <Sky top="#CFE9F4" ground="#F3E0B0" line="#D8BF86" horizon={360} />
      <rect x={-600} y={300} width={2200} height={70} fill="#7FC1DE" />
      <path d="M-600 368 Q-500 352 -400 368 T-200 368 T0 368 T200 368 T400 368 T600 368 T800 368 T1000 368 T1200 368 T1400 368 T1600 368" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
      <SunDisc x={860} y={90} />
      <Cloud x={240} y={110} k={0.8} />
      {/* 貝殼、海星（不是動物的樣子：圓圓的貝殼） */}
      <path d="M120 500 q20 -34 40 0 Z" fill="#F2A9A0" {...L('#C9736B', 4)} />
      <path d="M880 520 q16 -28 32 0 Z" fill="#F5D27A" {...L('#C9A043', 4)} />
      {/* 沙堡 */}
      <g transform="translate(880 470)">
        <rect x={-50} y={-50} width={100} height={50} fill="#E8CC8E" {...L('#C2A266', 4)} />
        <rect x={-30} y={-90} width={60} height={40} fill="#E8CC8E" {...L('#C2A266', 4)} />
        <path d="M0 -90 V-120 L22 -110 L0 -100" fill="#E0604E" stroke="#2E2A25" strokeWidth={3} />
      </g>
    </g>
  ),
  street: () => (
    <g>
      <Sky ground="#C9CDD2" line="#A3A9B0" horizon={400} />
      {/* 房子、商店 */}
      {[
        [-160, 170, '#F2C9A0', '#C99A6A'],
        [40, 220, '#CFE0F2', '#7FA0C2'],
        [790, 190, '#F2D7E3', '#C99AB0'],
        [990, 160, '#DDEBD9', '#8FB57E'],
      ].map(([x, h, c, d], i) => (
        <g key={i}>
          <rect x={x as number} y={400 - (h as number)} width={180} height={h as number} fill={c as string} {...L(d as string, 5)} />
          <rect x={(x as number) + 30} y={430 - (h as number)} width={46} height={46} rx={6} fill="#FBF8F2" {...L(d as string, 4)} />
          <rect x={(x as number) + 104} y={430 - (h as number)} width={46} height={46} rx={6} fill="#FBF8F2" {...L(d as string, 4)} />
        </g>
      ))}
      <Cloud x={480} y={90} k={0.8} />
      <rect x={-600} y={400} width={2200} height={50} fill="#E3E5E8" />
      <path d="M-600 450 H1600" stroke="#A3A9B0" strokeWidth={4} />
      <path d={Array.from({ length: 30 }, (_, i) => `M${-560 + i * 90} 600 H${-510 + i * 90}`).join(' ')} stroke="#fff" strokeWidth={10} strokeLinecap="round" />
    </g>
  ),
  snow: () => (
    <g>
      <Sky top="#DCE7F0" ground="#F7FAFC" line="#C9D6E2" horizon={390} />
      <path d="M-600 400 Q-100 330 400 380 Q800 330 1600 390 V430 H-600 Z" fill="#FFFFFF" {...L('#C9D6E2', 4)} />
      {[-120, 60, 820, 980].map((x, i) => (
        <Pine key={x} x={x} y={400} k={0.8 + (i % 2) * 0.2} snow />
      ))}
      <g fill="#fff" {...L('#C9D6E2', 2)}>
        {[
          [120, 80],
          [300, 160],
          [520, 60],
          [700, 140],
          [880, 70],
          [-40, 180],
          [1060, 200],
        ].map(([x, y]) => (
          <circle key={`${x}`} cx={x} cy={y} r={8} />
        ))}
      </g>
      {/* 雪人（遠遠的、沒有臉以外的動物特徵） */}
      <g transform="translate(130 500)">
        <circle cx={0} cy={-36} r={40} fill="#fff" {...L('#C9D6E2', 4)} />
        <circle cx={0} cy={-100} r={28} fill="#fff" {...L('#C9D6E2', 4)} />
        <path d="M0 -98 L22 -92 L0 -88 Z" fill="#E0886E" />
        <circle cx={-9} cy={-108} r={3.5} fill="#2E2A25" />
        <circle cx={9} cy={-108} r={3.5} fill="#2E2A25" />
        <path d="M-26 -76 H26" stroke="#E0604E" strokeWidth={10} strokeLinecap="round" />
      </g>
    </g>
  ),
  lake: () => (
    <g>
      <Sky top="#D4EAF3" ground="#B9DB9C" line="#8FBF74" horizon={340} />
      <path d="M-600 350 Q-100 280 400 330 Q800 290 1600 340 V360 H-600 Z" fill="#C8E3A6" {...L('#9CC27E', 4)} />
      <path d="M-600 372 Q500 352 1600 380 V476 Q500 500 -600 470 Z" fill="#8FCBE3" {...L('#5FA3C2', 5)} />
      <path d="M-500 420 h120 M-200 400 h90 M160 440 h110 M640 410 h100 M960 440 h120" stroke="#fff" strokeWidth={6} strokeLinecap="round" opacity={0.7} />
      <Cloud x={220} y={90} k={0.9} />
      <FarTree x={-20} y={350} k={0.8} />
      <FarTree x={980} y={346} k={0.9} c="#B5D88A" d="#7FA552" />
      {/* 蘆葦 */}
      {[60, 84, 900, 930].map((x) => (
        <g key={x}>
          <path d={`M${x} 470 V380`} stroke="#6E9E58" strokeWidth={5} strokeLinecap="round" />
          <rect x={x - 6} y={372} width={12} height={34} rx={6} fill="#A87A4E" />
        </g>
      ))}
    </g>
  ),
}

/** 場景的背景（場景座標；要放在 overflow: visible 的 svg 裡） */
export function Backdrop({ place }: { place: PlaceId }) {
  return BACKDROPS[place]()
}

/** 戶外、湖邊、海邊：大東西站的地方要是陸地。湖邊、海邊的小船浮在水上，其他的東西站在草地或沙灘上 */
export const WATER_PLACES: PlaceId[] = ['lake', 'beach']
