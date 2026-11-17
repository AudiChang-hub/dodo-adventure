// 躲在哪裡（T-160）的大東西：自己畫的 SVG，畫風跟故事插畫（art/storybook）同一套：淡色平塗、外框是同色系深一階的粗線、圓角，不用漸層。
// 座標：原點在大東西底部正中間（地板上），y 往上是負的；小動物躲的位置在 ./data.ts 的 slots。
// 每一樣分成兩層：back（整個東西，畫在小動物後面）、front（擋住 in 的小動物下半身的那一片：箱子前面的板子、浴缸的前壁…）。
// v：同一樣東西的配色（0～2），每一題隨機，同一張桌子不會每次都長一樣。
import type { ReactElement } from 'react'
import type { ObjectId } from './data'

export const L = (c: string, w = 5) => ({ stroke: c, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const })

const WOOD = ['#E3B98A', '#CFA0C9', '#A9CBE6']
const WOOD_D = ['#A87A4E', '#9A6E95', '#6F9CC8']
const SOFT = ['#F2A9A0', '#A9D6B5', '#F5D27A']
const SOFT_D = ['#C9736B', '#5F9E70', '#C9A043']
const DARK = '#5B4A3E'
const HOLE = '#6E5A4C'

type Part = (v: number) => ReactElement
export interface ThingArt {
  back: Part
  front?: Part
}

const wheel = (x: number, y: number, r: number, c = '#5B5E66') => (
  <g key={`w${x}`}>
    <circle cx={x} cy={y} r={r} fill={c} {...L('#2E2A25', 5)} />
    <circle cx={x} cy={y} r={r * 0.45} fill="#D8DCE2" {...L('#2E2A25', 4)} />
  </g>
)

export const THING_ART: Record<ObjectId, ThingArt> = {
  // ── 桌子：桌面、四隻腳（看得到兩隻）、桌巾的花邊 ──
  table: {
    back: (v) => (
      <g>
        <rect x={-240} y={-240} width={24} height={240} rx={8} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={216} y={-240} width={24} height={240} rx={8} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-232} y={-244} width={464} height={26} rx={6} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-276} y={-266} width={552} height={28} rx={12} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <path d="M-276 -246 H276" stroke="#fff" strokeWidth={4} opacity={0.4} />
        {/* 桌上的一個小花瓶（右後方，不擋小動物） */}
        <g transform="translate(236 -266)">
          <path d="M-14 0 Q-20 -24 -8 -34 H8 Q20 -24 14 0 Z" fill="#FBF8F2" {...L('#B9A58E', 4)} />
          <path d="M0 -34 V-52 M-4 -44 L-14 -54 M4 -46 L14 -56" stroke="#6E9E58" strokeWidth={4} strokeLinecap="round" />
          <circle cx={0} cy={-58} r={7} fill="#F2A9A0" {...L('#C9736B', 3)} />
        </g>
      </g>
    ),
  },
  // ── 椅子：椅背、椅面、四隻腳 ──
  chair: {
    back: (v) => (
      <g>
        <rect x={-96} y={-400} width={192} height={36} rx={14} fill={SOFT[v]} {...L(SOFT_D[v])} />
        <rect x={-92} y={-372} width={20} height={200} rx={8} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={72} y={-372} width={20} height={200} rx={8} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <path d="M-72 -330 H72 M-72 -290 H72" stroke={WOOD_D[v]} strokeWidth={8} strokeLinecap="round" />
        <rect x={-92} y={-170} width={20} height={170} rx={8} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={72} y={-170} width={20} height={170} rx={8} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <path d="M-80 -70 H80" stroke={WOOD_D[v]} strokeWidth={8} strokeLinecap="round" />
        <rect x={-108} y={-196} width={216} height={30} rx={12} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-100} y={-206} width={200} height={20} rx={10} fill={SOFT[v]} {...L(SOFT_D[v], 4)} />
      </g>
    ),
  },
  // ── 床：床頭板、床墊、被子、枕頭、高高的床腳 ──
  bed: {
    back: (v) => (
      <g>
        <rect x={-340} y={-420} width={46} height={420} rx={14} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={296} y={-312} width={42} height={312} rx={14} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-300} y={-172} width={600} height={34} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-296} y={-236} width={592} height={66} rx={20} fill="#FBF8F2" {...L('#B9A58E')} />
        <path d="M-40 -236 H286 Q298 -236 298 -224 V-176 H-50 Q-58 -210 -40 -236 Z" fill={SOFT[v]} {...L(SOFT_D[v])} />
        <path d="M20 -232 V-180 M90 -232 V-180 M160 -232 V-180 M230 -232 V-180" stroke="#fff" strokeWidth={6} opacity={0.45} strokeLinecap="round" />
        <ellipse cx={-212} cy={-250} rx={70} ry={26} fill="#FBF8F2" {...L('#B9A58E')} />
        <rect x={-300} y={-140} width={22} height={140} rx={8} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={278} y={-140} width={22} height={140} rx={8} fill={WOOD[v]} {...L(WOOD_D[v])} />
      </g>
    ),
  },
  // ── 沙發：椅背、兩個扶手、坐墊、底座、短腳 ──
  sofa: {
    back: (v) => (
      <g>
        <rect x={-250} y={-330} width={500} height={190} rx={40} fill={SOFT[v]} {...L(SOFT_D[v])} />
        <path d="M0 -316 V-180" stroke={SOFT_D[v]} strokeWidth={5} opacity={0.6} />
        <rect x={-262} y={-150} width={524} height={50} rx={16} fill={SOFT[v]} {...L(SOFT_D[v])} />
        <rect x={-236} y={-196} width={232} height={54} rx={18} fill={SOFT[v]} {...L(SOFT_D[v])} />
        <rect x={4} y={-196} width={232} height={54} rx={18} fill={SOFT[v]} {...L(SOFT_D[v])} />
        <rect x={-310} y={-250} width={70} height={150} rx={30} fill={SOFT[v]} {...L(SOFT_D[v])} />
        <rect x={240} y={-250} width={70} height={150} rx={30} fill={SOFT[v]} {...L(SOFT_D[v])} />
        <path d="M-270 -100 L-262 0 H-238 L-232 -100 M232 -100 L238 0 H262 L270 -100" fill={WOOD_D[0]} {...L(DARK, 4)} />
        {/* 一個靠墊 */}
        <rect x={150} y={-262} width={70} height={64} rx={18} fill="#FBF8F2" {...L('#B9A58E', 4)} transform="rotate(10 185 -230)" />
      </g>
    ),
  },
  // ── 書桌：桌面、左邊兩隻腳、右邊一個有開口的櫃子（in 躲在格子裡） ──
  desk: {
    back: (v) => (
      <g>
        <rect x={-250} y={-240} width={22} height={240} rx={8} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={60} y={-244} width={200} height={244} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={80} y={-216} width={160} height={130} rx={10} fill={HOLE} {...L(WOOD_D[v], 4)} />
        <rect x={-276} y={-266} width={552} height={28} rx={12} fill={WOOD[v]} {...L(WOOD_D[v])} />
        {/* 桌上：一盞小檯燈（右後方） */}
        <g transform="translate(220 -266)">
          <path d="M-6 0 V-50" stroke="#8C96A0" strokeWidth={8} strokeLinecap="round" />
          <path d="M-30 -48 L-2 -88 L26 -48 Z" fill="#F5D27A" {...L('#C9A043', 4)} />
          <ellipse cx={-6} cy={-2} rx={22} ry={6} fill="#8C96A0" />
        </g>
      </g>
    ),
    front: (v) => (
      <g>
        <rect x={60} y={-100} width={200} height={100} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={130} y={-62} width={60} height={14} rx={7} fill={WOOD_D[v]} />
      </g>
    ),
  },
  // ── 櫥櫃：高腳的櫃子、門打開、裡面兩格（in） ──
  cupboard: {
    back: (v) => (
      <g>
        <rect x={-160} y={-120} width={20} height={120} rx={8} fill={WOOD_D[v]} {...L(DARK, 4)} />
        <rect x={140} y={-120} width={20} height={120} rx={8} fill={WOOD_D[v]} {...L(DARK, 4)} />
        <rect x={-176} y={-312} width={352} height={200} rx={14} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-160} y={-296} width={150} height={166} rx={8} fill={HOLE} />
        <rect x={10} y={-296} width={150} height={166} rx={8} fill={HOLE} />
        {/* 打開的門 */}
        <path d="M-176 -306 L-238 -290 V-130 L-176 -118 Z" fill={WOOD[v]} {...L(WOOD_D[v])} />
        <path d="M176 -306 L238 -290 V-130 L176 -118 Z" fill={WOOD[v]} {...L(WOOD_D[v])} />
        <circle cx={-222} cy={-210} r={6} fill={WOOD_D[v]} />
        <circle cx={222} cy={-210} r={6} fill={WOOD_D[v]} />
        {/* 櫃子上的盆栽 */}
        <g transform="translate(150 -312)">
          <path d="M-20 0 L-16 -30 H16 L20 0 Z" fill="#E0886E" {...L('#A85A44', 4)} />
          <path d="M0 -30 Q-24 -56 -10 -74 Q2 -56 0 -30 Q8 -60 26 -66 Q22 -42 0 -30" fill="#9CCB7E" {...L('#6E9E58', 4)} />
        </g>
      </g>
    ),
    front: (v) => (
      <g>
        <rect x={-176} y={-152} width={352} height={40} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <path d="M0 -300 V-150" stroke={WOOD_D[v]} strokeWidth={10} />
      </g>
    ),
  },
  // ── 玩具箱：蓋子往後打開、短腳、裡面露出一顆球和積木 ──
  toybox: {
    back: (v) => (
      <g>
        <path d="M-226 -206 L-210 -330 H210 L226 -206 Z" fill={SOFT[v]} {...L(SOFT_D[v])} />
        <path d="M-180 -300 H180" stroke="#fff" strokeWidth={6} opacity={0.4} strokeLinecap="round" />
        <rect x={-236} y={-212} width={472} height={130} rx={18} fill={SOFT_D[v]} {...L(SOFT_D[v])} />
        <circle cx={0} cy={-206} r={30} fill="#7FB2E5" {...L('#4F7FC2', 4)} />
        <path d="M-28 -210 Q0 -190 28 -210" fill="none" stroke="#fff" strokeWidth={4} />
        <rect x={-210} y={-92} width={28} height={92} rx={10} fill={WOOD_D[0]} {...L(DARK, 4)} />
        <rect x={182} y={-92} width={28} height={92} rx={10} fill={WOOD_D[0]} {...L(DARK, 4)} />
      </g>
    ),
    front: (v) => (
      <g>
        <rect x={-240} y={-194} width={480} height={112} rx={18} fill={SOFT[v]} {...L(SOFT_D[v])} />
        <g fill="#fff" opacity={0.85}>
          <path d="M-150 -150 l12 -22 l12 22 l-12 22 Z" />
          <circle cx={0} cy={-138} r={14} />
          <rect x={126} y={-152} width={26} height={26} rx={5} />
        </g>
      </g>
    ),
  },
  // ── 浴缸：獅子腳的浴缸、泡泡 ──
  bathtub: {
    back: () => (
      <g>
        <path d="M-200 -110 Q-230 -50 -186 -30 L-170 0 M200 -110 Q230 -50 186 -30 L170 0" fill="none" stroke="#C9A043" strokeWidth={14} strokeLinecap="round" />
        <path d="M232 -206 V-330 Q232 -356 206 -356 H186" fill="none" stroke="#B4BCC4" strokeWidth={12} strokeLinecap="round" />
        <path d="M186 -356 V-326" stroke="#B4BCC4" strokeWidth={14} strokeLinecap="round" />
        <rect x={-270} y={-214} width={540} height={20} rx={10} fill="#E9EEF2" {...L('#9AA7B2')} />
        <ellipse cx={0} cy={-206} rx={250} ry={14} fill="#BFE1F2" />
      </g>
    ),
    front: () => (
      <g>
        <path d="M-266 -204 H266 Q262 -110 200 -96 H-200 Q-262 -110 -266 -204 Z" fill="#F4F7F9" {...L('#9AA7B2')} />
        <path d="M-230 -170 Q-226 -126 -190 -116" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
        <g fill="#fff" {...L('#B6CFE0', 3)}>
          <circle cx={-232} cy={-206} r={18} />
          <circle cx={-204} cy={-214} r={14} />
          <circle cx={4} cy={-208} r={16} />
          <circle cx={30} cy={-212} r={12} />
          <circle cx={228} cy={-208} r={18} />
        </g>
      </g>
    ),
  },
  // ── 汽車：側面、車頂可以坐、窗戶開著（in 從窗戶露出頭）、底盤高 ──
  car: {
    back: (v) => {
      const c = ['#E0604E', '#4F9FD9', '#F2C94C'][v]
      const d = ['#A8443A', '#2F6F9F', '#B8913A'][v]
      return (
        <g>
          <path d="M-170 -200 Q-150 -300 -110 -300 H110 Q160 -300 190 -200 Z" fill={c} {...L(d)} />
          <path d="M-138 -210 Q-124 -278 -100 -282 H-12 V-210 Z M12 -210 V-282 H96 Q140 -282 160 -210 Z" fill="#6E7A86" />
          <path d="M-138 -210 Q-124 -278 -100 -282 H-12 V-210 Z M12 -210 V-282 H96 Q140 -282 160 -210 Z" fill="#4C5560" opacity={0.6} />
        </g>
      )
    },
    front: (v) => {
      const c = ['#E0604E', '#4F9FD9', '#F2C94C'][v]
      const d = ['#A8443A', '#2F6F9F', '#B8913A'][v]
      return (
        <g>
          <path d="M-290 -150 Q-290 -206 -230 -208 H240 Q292 -206 292 -150 V-120 Q292 -96 270 -96 H-270 Q-290 -96 -290 -120 Z" fill={c} {...L(d)} />
          <path d="M-12 -296 V-200 M12 -296 V-200" stroke={d} strokeWidth={6} />
          <path d="M0 -204 V-104" stroke={d} strokeWidth={5} />
          <rect x={-60} y={-176} width={30} height={10} rx={5} fill={d} />
          <rect x={40} y={-176} width={30} height={10} rx={5} fill={d} />
          <ellipse cx={272} cy={-160} rx={14} ry={18} fill="#FFF3B0" {...L(d, 4)} />
          <rect x={-292} y={-154} width={24} height={20} rx={6} fill="#F2A9A0" {...L(d, 4)} />
          {wheel(-180, -62, 60)}
          {wheel(184, -62, 60)}
        </g>
      )
    },
  },
  // ── 紅色拖車：車斗、四個輪子、拉桿 ──
  wagon: {
    back: (v) => {
      const d = ['#A8443A', '#3E7C51', '#2F5C99'][v]
      return (
        <g>
          <path d="M-246 -130 L-330 -230" stroke="#8C96A0" strokeWidth={12} strokeLinecap="round" />
          <rect x={-352} y={-246} width={48} height={20} rx={10} fill="#5B5E66" transform="rotate(-50 -330 -236)" />
          <rect x={-240} y={-214} width={480} height={30} rx={10} fill={d} {...L(d)} />
        </g>
      )
    },
    front: (v) => {
      const c = ['#E0604E', '#5DAE76', '#4F7FC2'][v]
      const d = ['#A8443A', '#3E7C51', '#2F5C99'][v]
      return (
        <g>
          <path d="M-246 -196 H246 L232 -96 H-232 Z" fill={c} {...L(d)} />
          <path d="M-210 -170 H210" stroke="#fff" strokeWidth={6} opacity={0.45} strokeLinecap="round" />
          {wheel(-170, -48, 46)}
          {wheel(170, -48, 46)}
        </g>
      )
    },
  },
  // ── 嬰兒車：車籃、遮陽篷、把手、大輪子 ──
  stroller: {
    back: (v) => {
      const c = SOFT[v]
      const d = SOFT_D[v]
      return (
        <g>
          <path d="M130 -240 L210 -360 H250" fill="none" stroke="#8C96A0" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M-160 -236 Q-170 -380 -30 -386 Q-10 -300 -40 -236 Z" fill={c} {...L(d)} />
          <path d="M-140 -260 Q-130 -340 -60 -360 M-112 -244 Q-100 -320 -46 -340" fill="none" stroke={d} strokeWidth={5} opacity={0.6} />
          <path d="M-110 -112 L-150 -50 M90 -112 L130 -50" stroke="#8C96A0" strokeWidth={10} strokeLinecap="round" />
        </g>
      )
    },
    front: (v) => {
      const c = SOFT[v]
      const d = SOFT_D[v]
      return (
        <g>
          <path d="M-170 -240 H150 Q150 -120 60 -112 H-90 Q-170 -120 -170 -240 Z" fill={c} {...L(d)} />
          <path d="M-150 -214 H130" stroke="#fff" strokeWidth={6} opacity={0.5} strokeLinecap="round" />
          {wheel(-150, -44, 44, '#7D828A')}
          {wheel(130, -44, 44, '#7D828A')}
        </g>
      )
    },
  },
  // ── 溜滑梯：左邊梯子、平台、往右下的滑道 ──
  slide: {
    back: (v) => {
      const c = ['#F2C94C', '#E0604E', '#7FB2E5'][v]
      const d = ['#B8913A', '#A8443A', '#4F7FC2'][v]
      return (
        <g>
          <path d="M-230 0 V-300 M-120 0 V-300" stroke="#8C96A0" strokeWidth={14} strokeLinecap="round" />
          <path d="M-230 -60 H-120 M-230 -120 H-120 M-230 -180 H-120 M-230 -240 H-120" stroke="#8C96A0" strokeWidth={9} strokeLinecap="round" />
          <path d="M-250 -286 H-80 V-262 H-250 Z" fill={c} {...L(d)} />
          <path d="M-250 -286 V-340 M-80 -286 V-340 M-250 -330 H-80" stroke={d} strokeWidth={8} strokeLinecap="round" fill="none" />
          <path d="M-84 -290 C20 -280 60 -110 200 -48 H290 V-18 H190 C40 -84 0 -246 -84 -256 Z" fill={c} {...L(d)} />
          <path d="M-70 -280 C30 -266 74 -110 200 -60" fill="none" stroke="#fff" strokeWidth={6} opacity={0.5} strokeLinecap="round" />
          <path d="M260 -24 V0" stroke="#8C96A0" strokeWidth={12} strokeLinecap="round" />
        </g>
      )
    },
  },
  // ── 長椅：椅背的木條、椅面、鐵腳 ──
  bench: {
    back: (v) => (
      <g>
        <path d="M-260 0 V-150 M260 0 V-150 M-250 -150 V-310 M250 -150 V-310" stroke="#5B5E66" strokeWidth={14} strokeLinecap="round" />
        <rect x={-290} y={-306} width={580} height={30} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-290} y={-262} width={580} height={30} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-300} y={-176} width={600} height={26} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-306} y={-160} width={612} height={22} rx={10} fill={WOOD_D[v]} {...L(WOOD_D[v])} />
      </g>
    ),
  },
  // ── 樹：粗樹幹、樹洞（in）、兩根橫的樹枝（on）、大樹冠 ──
  tree: {
    back: (v) => {
      const leaf = ['#9CCB7E', '#B5D88A', '#E7B65C'][v]
      const leafD = ['#6E9E58', '#7FA552', '#B98632'][v]
      return (
        <g>
          {[
            [-170, -430, 120],
            [0, -480, 140],
            [170, -430, 120],
            [-90, -380, 110],
            [100, -380, 110],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={leaf} {...L(leafD)} />
          ))}
          {[
            [-170, -430, 120],
            [0, -480, 140],
            [170, -430, 120],
            [-90, -380, 110],
            [100, -380, 110],
          ].map(([x, y, r], i) => (
            <circle key={`i${i}`} cx={x} cy={y} r={r - 3} fill={leaf} />
          ))}
          <path d="M-80 0 Q-60 -200 -70 -380 H70 Q60 -200 80 0 Z" fill="#B98A5E" {...L('#7E5B3C')} />
          <path d="M-62 -290 Q-160 -300 -260 -296" fill="none" stroke="#7E5B3C" strokeWidth={34} strokeLinecap="round" />
          <path d="M-62 -290 Q-160 -300 -260 -296" fill="none" stroke="#B98A5E" strokeWidth={24} strokeLinecap="round" />
          <path d="M60 -316 Q160 -326 270 -322" fill="none" stroke="#7E5B3C" strokeWidth={34} strokeLinecap="round" />
          <path d="M60 -316 Q160 -326 270 -322" fill="none" stroke="#B98A5E" strokeWidth={24} strokeLinecap="round" />
          <ellipse cx={4} cy={-196} rx={58} ry={74} fill="#5A4030" {...L('#7E5B3C')} />
          <path d="M-36 -80 Q-20 -60 -30 -30 M40 -120 Q30 -90 44 -60" fill="none" stroke="#7E5B3C" strokeWidth={5} strokeLinecap="round" />
        </g>
      )
    },
    front: () => <path d="M-52 -164 Q4 -142 60 -164 Q58 -124 4 -122 Q-50 -124 -52 -164 Z" fill="#B98A5E" {...L('#7E5B3C')} />,
  },
  // ── 手推車：車斗往前斜、前面一個輪子、後面兩根把手 ──
  wheelbarrow: {
    back: (v) => {
      const d = ['#3E7C51', '#A8443A', '#2F6F9F'][v]
      return (
        <g>
          <path d="M-200 -130 L-320 -170" stroke="#8C7A66" strokeWidth={14} strokeLinecap="round" />
          <path d="M-150 -110 L-170 0 M70 -110 L60 0" stroke="#8C96A0" strokeWidth={12} strokeLinecap="round" />
          <path d="M-232 -204 L176 -204" stroke={d} strokeWidth={10} strokeLinecap="round" />
          {wheel(190, -56, 56)}
          <path d="M120 -110 L190 -56" stroke="#8C96A0" strokeWidth={12} strokeLinecap="round" />
          <ellipse cx={-30} cy={-202} rx={200} ry={14} fill="#8C6E54" />
        </g>
      )
    },
    front: (v) => {
      const c = ['#5DAE76', '#E0604E', '#4F9FD9'][v]
      const d = ['#3E7C51', '#A8443A', '#2F6F9F'][v]
      return (
        <g>
          <path d="M-236 -200 H180 Q170 -120 110 -110 H-150 Q-220 -120 -236 -200 Z" fill={c} {...L(d)} />
          <path d="M-200 -180 H150" stroke="#fff" strokeWidth={6} opacity={0.45} strokeLinecap="round" />
        </g>
      )
    },
  },
  // ── 狗屋：三角屋頂、圓拱門（in 從門裡探頭） ──
  doghouse: {
    back: (v) => {
      const c = ['#E3B98A', '#A9CBE6', '#F2A9A0'][v]
      const d = ['#A87A4E', '#6F9CC8', '#C9736B'][v]
      return (
        <g>
          <rect x={-170} y={-240} width={340} height={240} rx={8} fill={c} {...L(d)} />
          <path d="M-150 -200 H150 M-150 -150 H150 M-150 -100 H150 M-150 -50 H150" stroke={d} strokeWidth={4} opacity={0.35} />
          <path d="M-76 0 V-120 Q-76 -184 0 -184 Q76 -184 76 -120 V0 Z" fill={HOLE} {...L(d)} />
          <path d="M-220 -226 L0 -384 L220 -226 Z" fill="#E0604E" {...L('#A8443A')} />
          <path d="M-180 -246 L0 -364 L180 -246" fill="none" stroke="#fff" strokeWidth={6} opacity={0.35} strokeLinecap="round" />
          <rect x={-40} y={-232} width={80} height={30} rx={8} fill="#FBF8F2" {...L(d, 4)} />
          <ellipse cx={-14} cy={-217} rx={8} ry={6} fill={d} />
          <ellipse cx={14} cy={-217} rx={8} ry={6} fill={d} />
        </g>
      )
    },
    front: (v) => {
      const d = ['#A87A4E', '#6F9CC8', '#C9736B'][v]
      return <rect x={-86} y={-24} width={172} height={24} rx={8} fill="#C9B07A" {...L(d, 4)} />
    },
  },
  // ── 小船：船身、中間一個小船艙（on 坐在船艙頂上）、兩邊可以躲（in） ──
  boat: {
    back: (v) => {
      const c = ['#E0604E', '#4F9FD9', '#F2C94C'][v]
      const d = ['#A8443A', '#2F6F9F', '#B8913A'][v]
      return (
        <g>
          <rect x={-80} y={-260} width={160} height={140} rx={14} fill="#FBF8F2" {...L('#B9A58E')} />
          <rect x={-96} y={-276} width={192} height={24} rx={10} fill={c} {...L(d)} />
          <circle cx={0} cy={-196} r={24} fill="#A9CBE6" {...L('#6F9CC8', 4)} />
          <path d="M-300 -160 H300" stroke={d} strokeWidth={10} strokeLinecap="round" />
        </g>
      )
    },
    front: (v) => {
      const c = ['#E0604E', '#4F9FD9', '#F2C94C'][v]
      const d = ['#A8443A', '#2F6F9F', '#B8913A'][v]
      return (
        <g>
          <path d="M-310 -156 H310 Q290 -50 220 -30 H-220 Q-290 -50 -310 -156 Z" fill={c} {...L(d)} />
          <path d="M-280 -120 H280" stroke="#fff" strokeWidth={10} opacity={0.6} strokeLinecap="round" />
          <circle cx={-110} cy={-80} r={12} fill="#fff" {...L(d, 3)} />
          <circle cx={0} cy={-80} r={12} fill="#fff" {...L(d, 3)} />
          <circle cx={110} cy={-80} r={12} fill="#fff" {...L(d, 3)} />
        </g>
      )
    },
  },
  // ── 小貨車：左邊車斗（in）、右邊駕駛座（on 坐在車頂） ──
  truck: {
    back: (v) => {
      const c = ['#5DAE76', '#E0604E', '#4F9FD9'][v]
      const d = ['#3E7C51', '#A8443A', '#2F6F9F'][v]
      return (
        <g>
          <path d="M60 -214 V-290 Q60 -312 84 -312 H200 Q234 -312 248 -270 L268 -214 Z" fill={c} {...L(d)} />
          <path d="M90 -224 V-284 H190 Q214 -284 226 -250 L234 -224 Z" fill="#6E7A86" />
          <rect x={-290} y={-214} width={340} height={20} rx={8} fill={d} {...L(d)} />
        </g>
      )
    },
    front: (v) => {
      const c = ['#5DAE76', '#E0604E', '#4F9FD9'][v]
      const d = ['#3E7C51', '#A8443A', '#2F6F9F'][v]
      return (
        <g>
          <path d="M-296 -198 H56 V-112 H-296 Z" fill={c} {...L(d)} />
          <path d="M-270 -170 H30" stroke="#fff" strokeWidth={6} opacity={0.45} strokeLinecap="round" />
          <path d="M52 -224 H272 Q292 -224 292 -200 V-130 Q292 -112 272 -112 H52 Z" fill={c} {...L(d)} />
          <rect x={100} y={-190} width={28} height={10} rx={5} fill={d} />
          <ellipse cx={278} cy={-176} rx={10} ry={16} fill="#FFF3B0" {...L(d, 3)} />
          {wheel(-180, -62, 58)}
          {wheel(190, -62, 58)}
        </g>
      )
    },
  },
  // ── 公車：一排窗戶（in 從窗戶露出頭）、車頂（on） ──
  bus: {
    back: () => (
      <g>
        <rect x={-310} y={-330} width={620} height={30} rx={14} fill="#F2C94C" {...L('#B8913A')} />
        <path d="M-280 -296 H-40 V-214 H-280 Z M-30 -296 H70 V-214 H-30 Z" fill="#4C5560" />
      </g>
    ),
    front: () => (
      <g>
        <path d="M-310 -306 H-284 V-210 H-30 V-306 H-36 V-210 H76 V-306 H230 Q310 -306 310 -230 V-128 Q310 -100 282 -100 H-290 Q-310 -100 -310 -122 Z" fill="#F2C94C" {...L('#B8913A')} />
        <path d="M-40 -306 V-210" stroke="#B8913A" strokeWidth={10} />
        <rect x={110} y={-292} width={86} height={72} rx={8} fill="#A9CBE6" {...L('#6F9CC8', 4)} />
        <rect x={214} y={-292} width={80} height={110} rx={8} fill="#A9CBE6" {...L('#6F9CC8', 4)} />
        <path d="M-300 -160 H300" stroke="#2E2A25" strokeWidth={8} opacity={0.75} />
        <ellipse cx={296} cy={-130} rx={10} ry={14} fill="#FFF3B0" {...L('#B8913A', 3)} />
        {wheel(-200, -56, 54)}
        {wheel(196, -56, 54)}
      </g>
    ),
  },
  // ── 彈跳床：圓圓的跳墊、外圈軟墊、彎腳 ──
  trampoline: {
    back: (v) => {
      const c = ['#7FB2E5', '#5DAE76', '#E0604E'][v]
      const d = ['#4F7FC2', '#3E7C51', '#A8443A'][v]
      return (
        <g>
          <path d="M-250 -140 Q-262 -60 -236 0 M250 -140 Q262 -60 236 0 M0 -110 V0" fill="none" stroke="#8C96A0" strokeWidth={12} strokeLinecap="round" />
          <ellipse cx={0} cy={-148} rx={290} ry={40} fill={c} {...L(d)} />
          <ellipse cx={0} cy={-150} rx={240} ry={26} fill="#3B4048" />
        </g>
      )
    },
  },
  // ── 直立鋼琴：琴身、琴鍵、下面有空間（under） ──
  piano: {
    back: (v) => {
      const c = ['#5B4A3E', '#8A5A3C', '#3E4A5A'][v]
      return (
        <g>
          <rect x={-250} y={-320} width={500} height={150} rx={16} fill={c} {...L('#2E2A25')} />
          <rect x={-200} y={-292} width={120} height={70} rx={8} fill="#FBF8F2" {...L('#B9A58E', 4)} />
          <path d="M-180 -270 H-100 M-180 -250 H-120" stroke="#B9A58E" strokeWidth={4} strokeLinecap="round" />
          <rect x={-262} y={-184} width={524} height={44} rx={8} fill="#FBF8F2" {...L('#2E2A25')} />
          {Array.from({ length: 13 }, (_, i) => (
            <path key={i} d={`M${-222 + i * 37} -182 V-142`} stroke="#B9A58E" strokeWidth={3} />
          ))}
          {[0, 1, 3, 4, 5, 7, 8, 10, 11].map((i) => (
            <rect key={`b${i}`} x={-210 + i * 37} y={-184} width={20} height={24} rx={3} fill="#2E2A25" />
          ))}
          <rect x={-256} y={-142} width={30} height={142} rx={8} fill={c} {...L('#2E2A25')} />
          <rect x={226} y={-142} width={30} height={142} rx={8} fill={c} {...L('#2E2A25')} />
        </g>
      )
    },
  },
  // ── 木橋：拱形的橋面、欄杆 ──
  bridge: {
    back: () => (
      <g>
        <path d="M-360 0 Q-340 -200 0 -224 Q340 -200 360 0 H300 Q290 -160 0 -180 Q-290 -160 -300 0 Z" fill="#C99A6A" {...L('#8C6440')} />
        <path d="M-330 -60 Q-300 -200 0 -214" fill="none" stroke="#E3B98A" strokeWidth={6} strokeLinecap="round" opacity={0.7} />
        {[-300, -200, -100, 0, 100, 200, 300].map((x) => (
          <path key={x} d={`M${x} ${-200 + Math.abs(x) * 0.42} V${-280 + Math.abs(x) * 0.42}`} stroke="#8C6440" strokeWidth={14} strokeLinecap="round" />
        ))}
        <path d="M-300 -154 Q0 -300 300 -154" fill="none" stroke="#8C6440" strokeWidth={14} strokeLinecap="round" />
      </g>
    ),
  },
  // ── 嬰兒床：欄杆（in 從欄杆中間看得到）、高腳 ──
  crib: {
    back: (v) => (
      <g>
        <rect x={-240} y={-330} width={30} height={330} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={210} y={-330} width={30} height={330} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-214} y={-316} width={428} height={22} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-212} y={-162} width={424} height={30} rx={12} fill="#FBF8F2" {...L('#B9A58E')} />
        <path d="M-160 -300 V-160 M-80 -300 V-160 M0 -300 V-160 M80 -300 V-160 M160 -300 V-160" stroke={WOOD[v]} strokeWidth={10} opacity={0.6} />
      </g>
    ),
    front: (v) => (
      <g>
        {/* 前面的欄杆矮一點：只擋到小動物的腳，臉看得清楚 */}
        <rect x={-232} y={-178} width={464} height={20} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-232} y={-136} width={464} height={26} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        {[-180, 0, 180].map((x) => (
          <rect key={x} x={x - 6} y={-164} width={12} height={34} rx={5} fill={WOOD[v]} {...L(WOOD_D[v], 3)} />
        ))}
      </g>
    ),
  },
  // ── 海灘躺椅：斜斜的椅背、平的椅面（on）、四隻腳（下面可以躲 under） ──
  deckchair: {
    back: (v) => {
      const c = ['#E0604E', '#4F9FD9', '#5DAE76'][v]
      const d = ['#A8443A', '#2F6F9F', '#3E7C51'][v]
      return (
        <g>
          <path d="M-150 -150 L-160 0 M-60 -150 L-70 0 M190 -150 L200 0" stroke="#C99A6A" strokeWidth={14} strokeLinecap="round" />
          <path d="M-262 -330 L-150 -150" stroke="#C99A6A" strokeWidth={16} strokeLinecap="round" />
          <path d="M-268 -320 L-160 -148 L-130 -160 L-236 -334 Z" fill={c} {...L(d, 5)} />
          <path d="M-250 -300 L-170 -170" stroke="#fff" strokeWidth={10} opacity={0.55} strokeLinecap="round" />
          <rect x={-168} y={-166} width={380} height={26} rx={12} fill={c} {...L(d, 5)} />
          <path d="M-90 -164 V-142 M0 -164 V-142 M90 -164 V-142" stroke="#fff" strokeWidth={10} opacity={0.55} />
          <rect x={-172} y={-144} width={388} height={14} rx={7} fill="#C99A6A" {...L('#8C6440', 4)} />
        </g>
      )
    },
  },
  // ── 野餐籃：左邊的蓋子蓋著（on 坐在蓋子上），右邊打開（in 躲在裡面） ──
  basket: {
    back: () => (
      <g>
        <path d="M-150 -200 Q-150 -330 0 -330 Q150 -330 150 -200" fill="none" stroke="#A87A4E" strokeWidth={22} strokeLinecap="round" />
        <path d="M-150 -200 Q-150 -330 0 -330 Q150 -330 150 -200" fill="none" stroke="#E3B98A" strokeWidth={12} strokeLinecap="round" />
        {/* 右邊的蓋子翻起來 */}
        <path d="M10 -206 L40 -330 H220 L232 -206 Z" fill="#E3B98A" {...L('#A87A4E')} />
        <path d="M60 -300 H210 M50 -260 H220" stroke="#A87A4E" strokeWidth={4} opacity={0.5} />
      </g>
    ),
    front: () => (
      <g>
        <path d="M-236 -206 H236 L210 0 H-210 Z" fill="#E3B98A" {...L('#A87A4E')} />
        <path d="M-226 -150 H226 M-218 -96 H218 M-212 -44 H212" stroke="#A87A4E" strokeWidth={4} opacity={0.5} />
        {[-150, -70, 10, 90, 170].map((x) => (
          <path key={x} d={`M${x} -206 V0`} stroke="#A87A4E" strokeWidth={4} opacity={0.4} />
        ))}
        {/* 左邊的蓋子蓋著、紅白格子布從縫露出來 */}
        <rect x={-246} y={-218} width={252} height={24} rx={10} fill="#E3B98A" {...L('#A87A4E')} />
        <path d="M-20 -194 l18 34 l14 -34" fill="#E0604E" {...L('#A8443A', 3)} />
      </g>
    ),
  },
  // ── 書架：上層放書、下面兩格（in）、櫃頂（on）、高腳（under） ──
  shelf: {
    back: (v) => (
      <g>
        <rect x={-156} y={-110} width={20} height={110} rx={8} fill={WOOD_D[v]} {...L(DARK, 4)} />
        <rect x={136} y={-110} width={20} height={110} rx={8} fill={WOOD_D[v]} {...L(DARK, 4)} />
        <rect x={-176} y={-322} width={352} height={222} rx={12} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <rect x={-158} y={-306} width={316} height={64} rx={6} fill={HOLE} />
        <rect x={-158} y={-230} width={150} height={118} rx={6} fill={HOLE} />
        <rect x={8} y={-230} width={150} height={118} rx={6} fill={HOLE} />
        {/* 上層的書 */}
        {[
          [-150, '#E0604E', 54],
          [-124, '#F2C94C', 60],
          [-98, '#5DAE76', 50],
          [-72, '#4F7FC2', 58],
          [40, '#CFA0C9', 56],
          [66, '#F2A9A0', 48],
          [92, '#9CCB7E', 60],
        ].map(([x, c, h]) => (
          <rect key={x as number} x={x as number} y={-244 - (h as number)} width={22} height={h as number} rx={4} fill={c as string} {...L('#2E2A25', 3)} />
        ))}
        <path d="M-44 -246 L0 -300 L12 -290 L-30 -246 Z" fill="#F5D27A" {...L('#C9A043', 3)} />
      </g>
    ),
    front: (v) => (
      <g>
        <rect x={-176} y={-136} width={352} height={36} rx={10} fill={WOOD[v]} {...L(WOOD_D[v])} />
        <path d="M0 -230 V-130" stroke={WOOD[v]} strokeWidth={16} />
      </g>
    ),
  },
}
