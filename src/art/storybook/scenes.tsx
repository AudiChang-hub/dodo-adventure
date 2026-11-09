// 故事插畫的場景（背景，960×600，T-119）：天空、地面、一兩樣固定的東西。全部平塗、靜止（準則 MOTION-2、DISPLAY-1），
// 顏色比角色淡，角色站上去才看得清楚（準則 DISPLAY-2）。
import type { SceneId } from './layout'
import { Blob, line } from './kit'
import { Cloud } from './things'

const SKY = '#E3EEF2'
const GRASS = '#CFE3B5'
const GRASS_LINE = '#9FBF86'

function Sky({ fill = SKY }: { fill?: string }) {
  return <rect width={960} height={600} fill={fill} />
}
function Ground({ fill = GRASS, stroke = GRASS_LINE, y = 400 }: { fill?: string; stroke?: string; y?: number }) {
  return <path d={`M0 ${y + 4} Q240 ${y - 24} 480 ${y - 4} T960 ${y - 10} V600 H0 Z`} fill={fill} stroke={stroke} strokeWidth={5} strokeLinejoin="round" />
}
function Path() {
  return <path d="M0 470 Q480 444 960 470 L960 540 Q480 512 0 540 Z" fill="#EBDDBB" stroke="#CDB98C" strokeWidth={5} strokeLinejoin="round" />
}
function Grass({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y} l-8 -18 M${x} ${y} l0 -22 M${x} ${y} l8 -18`} stroke="#86AE6E" strokeWidth={5} strokeLinecap="round" fill="none" />
}
/** 室內：牆、地板、踢腳板 */
function Room({ wall, floor, floorLine }: { wall: string; floor: string; floorLine: string }) {
  return (
    <g>
      <rect width={960} height={600} fill={wall} />
      <rect y={430} width={960} height={170} fill={floor} />
      <rect y={420} width={960} height={16} fill={floorLine} />
    </g>
  )
}

function Park({ path = true }: { path?: boolean }) {
  return (
    <g>
      <Sky />
      <Cloud x={130} y={90} />
      <Cloud x={560} y={70} k={0.8} />
      <Ground />
      {path && <Path />}
      <Grass x={70} y={440} />
      <Grass x={880} y={430} />
    </g>
  )
}

function City() {
  const b: [number, number, number, string, string][] = [
    [30, 180, 130, '#E6D6E8', '#B9A3BE'],
    [170, 120, 110, '#D8E7F5', '#9CB7D1'],
    [700, 150, 120, '#F4E0C4', '#C9AE86'],
    [830, 100, 110, '#DCEBD6', '#A3C09A'],
  ]
  return (
    <g>
      <Sky />
      <Cloud x={420} y={80} k={0.9} />
      {b.map(([x, top, w, f, s]) => (
        <g key={x}>
          <rect x={x} y={top} width={w} height={420 - top} rx={10} fill={f} {...line(s)} />
          {Array.from({ length: Math.floor((400 - top) / 70) }, (_, r) => (
            <g key={r}>
              <rect x={x + 18} y={top + 24 + r * 70} width={28} height={34} rx={6} fill="#FBF8F2" />
              <rect x={x + w - 46} y={top + 24 + r * 70} width={28} height={34} rx={6} fill="#FBF8F2" />
            </g>
          ))}
        </g>
      ))}
      <rect y={410} width={960} height={190} fill="#D9D2C6" />
      <rect y={404} width={960} height={14} fill="#C2BAAE" />
      <path d="M40 520 H140 M260 520 H360 M480 520 H580 M700 520 H800" stroke="#FBF8F2" strokeWidth={10} strokeLinecap="round" />
    </g>
  )
}

function Valley() {
  return (
    <g>
      <Sky fill="#EDEAD8" />
      <path d="M0 400 Q160 220 320 380 Q460 250 620 390 Q780 230 960 380 V600 H0 Z" fill="#BFD7A2" {...line('#8FB27A')} />
      <Ground fill="#D8E6B8" stroke="#A9C38C" y={430} />
      {[60, 900].map((x) => (
        <g key={x}>
          <path d={`M${x} 470 V350`} {...line('#8F6E4B', 12)} />
          {[-60, -25, 25, 60].map((a) => (
            <path key={a} d={`M${x} 350 q${a} -30 ${a * 1.6} 10`} fill="none" stroke="#7FAF6A" strokeWidth={18} strokeLinecap="round" />
          ))}
        </g>
      ))}
    </g>
  )
}

function Farm() {
  return (
    <g>
      <Sky />
      <Cloud x={600} y={80} />
      <Ground />
      <g transform="translate(40 230)">
        <path d="M0 80 L80 10 L160 80 Z" fill="#B9665A" {...line('#8F4A40')} />
        <rect x={10} y={76} width={140} height={110} fill="#E8907E" {...line('#BF6A5C')} />
        <rect x={52} y={110} width={56} height={76} fill="#FBF0DC" {...line('#BF6A5C')} />
        <path d="M52 110 L108 186 M108 110 L52 186" stroke="#BF6A5C" strokeWidth={5} />
      </g>
      <g stroke="#C9A57E" strokeWidth={10} strokeLinecap="round">
        <path d="M600 420 H960 M600 450 H960" />
        {[620, 700, 780, 860, 940].map((x) => (
          <path key={x} d={`M${x} 400 V470`} />
        ))}
      </g>
    </g>
  )
}

function Sea() {
  return (
    <g>
      <Sky />
      <Cloud x={120} y={90} />
      <Cloud x={700} y={70} k={0.8} />
      <rect y={400} width={960} height={200} fill="#BFDDEB" />
      <path d="M0 400 Q60 384 120 400 T240 400 T360 400 T480 400 T600 400 T720 400 T840 400 T960 400" fill="none" stroke="#7FA9C9" strokeWidth={6} />
      <path d="M80 500 q30 -14 60 0 M600 540 q30 -14 60 0 M360 560 q30 -14 60 0" fill="none" stroke="#9CC4DA" strokeWidth={6} strokeLinecap="round" />
    </g>
  )
}

function Beach() {
  return (
    <g>
      <Sky />
      <Cloud x={160} y={90} />
      <rect y={340} width={960} height={140} fill="#BFDDEB" />
      <path d="M0 340 Q60 326 120 340 T240 340 T360 340 T480 340 T600 340 T720 340 T840 340 T960 340" fill="none" stroke="#7FA9C9" strokeWidth={6} />
      <path d="M0 450 Q480 400 960 440 V600 H0 Z" fill="#F2E2B8" {...line('#CDB98C')} />
    </g>
  )
}

function Rain() {
  return (
    <g>
      <Sky fill="#D3DCE4" />
      <Blob c={[[120, 70, 50], [190, 50, 60], [260, 72, 48]]} fill="#C2CBD5" stroke="#9CA8B5" />
      <Blob c={[[700, 80, 46], [770, 56, 56], [840, 80, 44]]} fill="#C2CBD5" stroke="#9CA8B5" />
      <g stroke="#9CC4DA" strokeWidth={7} strokeLinecap="round">
        {[
          [80, 170], [230, 200], [380, 150], [520, 210], [640, 160], [800, 200], [900, 150], [300, 300], [600, 300], [120, 300], [860, 310],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} l-8 20`} />
        ))}
      </g>
      <Ground fill="#BFD6A8" stroke="#94B47D" />
      <ellipse cx={200} cy={560} rx={90} ry={16} fill="#BFDDEB" {...line('#9CC4DA', 4)} />
      <ellipse cx={760} cy={570} rx={70} ry={13} fill="#BFDDEB" {...line('#9CC4DA', 4)} />
    </g>
  )
}

function Market() {
  const stripes = ['#E8907E', '#FBF8F2']
  return (
    <g>
      <Sky />
      <rect y={410} width={960} height={190} fill="#E8DCC6" />
      <rect y={404} width={960} height={12} fill="#CDBB9C" />
      {[0, 520].map((x0) => (
        <g key={x0} transform={`translate(${x0 + 30} 140)`}>
          <rect x={20} y={60} width={16} height={210} fill="#C9A57E" {...line('#8F6E4B', 4)} />
          <rect x={344} y={60} width={16} height={210} fill="#C9A57E" {...line('#8F6E4B', 4)} />
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M${i * 64} 0 H${i * 64 + 64} V60 Q${i * 64 + 32} 84 ${i * 64} 60 Z`} fill={stripes[i % 2]} {...line('#BF6A5C', 4)} />
          ))}
          <rect x={0} y={190} width={380} height={40} rx={8} fill="#D9B98E" {...line('#8F6E4B')} />
        </g>
      ))}
    </g>
  )
}

function Zoo() {
  return (
    <g>
      <Sky />
      <Cloud x={420} y={70} />
      <Ground />
      <g stroke="#A8875A" strokeWidth={10} strokeLinecap="round">
        <path d="M0 360 H360 M600 360 H960" />
        {[20, 80, 140, 200, 260, 320, 620, 680, 740, 800, 860, 920].map((x) => (
          <path key={x} d={`M${x} 340 V420`} />
        ))}
      </g>
      <Blob c={[[60, 410, 40], [120, 400, 46], [180, 414, 36]]} fill="#A9D3A4" stroke="#6A9E6B" />
      <Blob c={[[800, 410, 38], [860, 398, 46], [920, 414, 36]]} fill="#A9D3A4" stroke="#6A9E6B" />
    </g>
  )
}

function Site() {
  return (
    <g>
      <Sky />
      <g {...line('#C29A3E', 10)} fill="none">
        <path d="M760 400 V90 H520 M760 90 L860 120 M760 140 L700 90" />
        <path d="M560 90 V150" stroke="#8C8478" strokeWidth={5} />
      </g>
      <rect x={540} y={150} width={40} height={26} rx={4} fill="#E8907E" {...line('#BF6A5C', 4)} />
      <Ground fill="#EBDDBB" stroke="#CDB98C" />
      <g stroke="#EDB07A" strokeWidth={12} strokeLinecap="round">
        <path d="M30 430 H180" />
      </g>
    </g>
  )
}

function Bedroom() {
  return (
    <g>
      <Room wall="#E7E3F2" floor="#E8D3A8" floorLine="#D2B98C" />
      <rect x={600} y={50} width={300} height={230} rx={18} fill="#8E95C9" {...line('#C9A57E', 10)} />
      <path d="M750 50 V280 M600 165 H900" stroke="#C9A57E" strokeWidth={8} />
      <g fill="#F6DE96">
        <path d="M650 90 l5 10 l11 1 l-8 8 l2 11 l-10 -5 l-10 5 l2 -11 l-8 -8 l11 -1 Z" />
        <path d="M840 210 l5 10 l11 1 l-8 8 l2 11 l-10 -5 l-10 5 l2 -11 l-8 -8 l11 -1 Z" />
      </g>
      <ellipse cx={480} cy={540} rx={300} ry={40} fill="#D8CCE6" />
    </g>
  )
}

function Party() {
  const cs = ['#E8907E', '#EED37E', '#8DB8D8', '#9FCB9A', '#B79BCB']
  return (
    <g>
      <Room wall="#F7E8D8" floor="#E8D3A8" floorLine="#D2B98C" />
      <path d="M0 40 Q480 140 960 40" fill="none" {...line('#A39B8E', 4)} />
      {Array.from({ length: 11 }, (_, i) => {
        const x = 40 + i * 88
        const t = x / 960
        const y = 40 + 4 * 50 * t * (1 - t)
        return <path key={i} d={`M${x - 26} ${y} L${x + 26} ${y} L${x} ${y + 52} Z`} fill={cs[i % cs.length]} {...line('#A39B8E', 3)} />
      })}
    </g>
  )
}

function Home() {
  return (
    <g>
      <Room wall="#F3EAD8" floor="#E3CFA8" floorLine="#C9B48A" />
      <circle cx={170} cy={190} r={90} fill="#D8E7F5" {...line('#C9A57E', 10)} />
      <path d="M170 100 V280 M80 190 H260" stroke="#C9A57E" strokeWidth={8} />
      <rect x={720} y={110} width={150} height={110} rx={10} fill="#FBF8F2" {...line('#C9A57E', 8)} />
      <path d="M760 190 l30 -40 l24 26 l14 -14 l22 28 Z" fill="#9FCB9A" />
      <circle cx={830} cy={140} r={12} fill="#F6DE96" />
      <ellipse cx={480} cy={545} rx={330} ry={42} fill="#EBC9B8" />
    </g>
  )
}

function ArkIn() {
  return (
    <g>
      <rect width={960} height={600} fill="#E9D3AE" />
      <g stroke="#CDAE80" strokeWidth={6}>
        {[80, 200, 320, 440, 560, 680, 800, 920].map((x) => (
          <path key={x} d={`M${x} 0 V430`} />
        ))}
      </g>
      <circle cx={480} cy={150} r={60} fill="#BFDDEB" {...line('#A8875A', 10)} />
      <rect y={430} width={960} height={170} fill="#EED9A0" />
      <path d="M0 430 H960" {...line('#C9A57E', 10)} />
      <g stroke="#D9BE78" strokeWidth={6} strokeLinecap="round">
        <path d="M60 500 l40 -10 M220 540 l40 10 M520 520 l40 -8 M760 500 l40 10 M880 560 l40 -6" />
      </g>
    </g>
  )
}

export function Scene({ id }: { id: SceneId }) {
  switch (id) {
    case 'park':
      return <Park />
    case 'meadow':
      return <Park path={false} />
    case 'city':
      return <City />
    case 'valley':
      return <Valley />
    case 'farm':
      return <Farm />
    case 'sea':
      return <Sea />
    case 'beach':
      return <Beach />
    case 'rain':
      return <Rain />
    case 'market':
      return <Market />
    case 'zoo':
      return <Zoo />
    case 'site':
      return <Site />
    case 'bedroom':
      return <Bedroom />
    case 'party':
      return <Party />
    case 'home':
      return <Home />
    case 'ark-in':
      return <ArkIn />
  }
}
