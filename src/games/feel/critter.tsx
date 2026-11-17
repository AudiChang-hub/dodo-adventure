// 心情臉（T-160）的主角：14 種小動物，自己畫的 SVG，畫風跟故事插畫（art/storybook）同一套。
// 每一隻都有 5 種臉（平常、開心、難過、生氣、害怕），臉和身體一起表現心情（3 歲認情緒先看臉，再看身體）：
//   開心：笑彎的眼睛、張嘴笑、紅臉頰、兩手舉高
//   難過：眉毛內側往上、嘴角往下、眼淚、手垂下來、耳朵垂下來（兔子）
//   生氣：眉毛往中間壓、咬著牙、臉頰紅、頭上一個怒氣的記號、手插腰
//   害怕：眼睛睜很大（白眼珠、小黑眼珠）、眉毛抬高、嘴巴小小張開、冒汗、手摀著臉頰、身體旁邊發抖的線
// 座標：整隻 240×280（腳底在 y = 280，正中間 x = 120）；頭在 (120, 104)。
import type { ReactElement } from 'react'
import type { Mood, SpeciesId } from './data'

/** T-164：「為什麼」那一層多一種驚訝（surprised）：眉毛挑高、眼睛圓圓、嘴巴大大的 O、頭上一個驚嘆號、兩手張開 */
export type Face = Mood | 'neutral'
/** 右手的姿勢：拿著東西（手往前伸）或照心情 */
export type Arm = 'hold' | 'mood'

const INK = '#2E2A25'
const MOUTH = '#7A3E3A'
const TONGUE = '#E9908C'
const CHEEK = '#F2A9A0'
const L = (c: string, w = 5) => ({ stroke: c, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const })

interface Look {
  fur: string
  line: string
  belly: string
  inner: string
  /** 眼睛的位置（左眼；右眼對稱）、嘴巴的高度 */
  eye: [number, number]
  mouthY: number
  head?: { rx: number; ry: number; cy?: number }
}

const LOOKS: Record<SpeciesId, Look> = {
  bunny: { fur: '#F1ECF4', line: '#A79AB8', belly: '#FFFFFF', inner: '#F4B9C6', eye: [94, 104], mouthY: 136 },
  bear: { fur: '#C8946A', line: '#8A5E3E', belly: '#EBCBA6', inner: '#EBCBA6', eye: [94, 100], mouthY: 142 },
  kitty: { fur: '#F2BE7E', line: '#BE8443', belly: '#FBEBD3', inner: '#F4C1B6', eye: [94, 102], mouthY: 136 },
  puppy: { fur: '#F1E2C6', line: '#B89A6C', belly: '#FFFFFF', inner: '#B98A5E', eye: [94, 100], mouthY: 144 },
  piggy: { fur: '#F6C6CF', line: '#CF8796', belly: '#FBE1E6', inner: '#E99BAA', eye: [92, 96], mouthY: 152 },
  mouse: { fur: '#C9CDD6', line: '#878EA0', belly: '#ECEEF2', inner: '#F4B9C6', eye: [96, 102], mouthY: 138 },
  fox: { fur: '#EE9A55', line: '#B4652A', belly: '#FFF6EA', inner: '#5B3A2A', eye: [94, 100], mouthY: 142 },
  panda: { fur: '#FBFBF8', line: '#9A9AA2', belly: '#FFFFFF', inner: '#3E3E46', eye: [93, 104], mouthY: 142 },
  froggy: { fur: '#A8D27A', line: '#6E9A42', belly: '#D6EBB8', inner: '#FBF8F2', eye: [88, 54], mouthY: 128, head: { rx: 86, ry: 60, cy: 110 } },
  ducky: { fur: '#F7D86A', line: '#C9A43A', belly: '#FFF3C2', inner: '#F29D4B', eye: [94, 96], mouthY: 132 },
  lion: { fur: '#F2C46A', line: '#B98A32', belly: '#FBE6B8', inner: '#D9894A', eye: [96, 102], mouthY: 146, head: { rx: 66, ry: 62 } },
  elephant: { fur: '#AFC3D6', line: '#6F87A0', belly: '#D6E2EC', inner: '#F4C1CB', eye: [92, 96], mouthY: 150, head: { rx: 66, ry: 64 } },
  monkey: { fur: '#A87A55', line: '#6E4A30', belly: '#F2D5B4', inner: '#F2D5B4', eye: [100, 102], mouthY: 142 },
  koala: { fur: '#B8BCC6', line: '#7D828E', belly: '#E4E6EA', inner: '#F6F2F4', eye: [94, 98], mouthY: 146 },
}

/** 尾巴、耳朵這些「在頭和身體後面」的東西 */
function Back({ sp, face, tail = true }: { sp: SpeciesId; face: Face; tail?: boolean }): ReactElement | null {
  const c = LOOKS[sp]
  const T = (el: ReactElement) => (tail ? el : null)
  const s = L(c.line)
  const sad = face === 'sad'
  switch (sp) {
    case 'bunny': {
      // 難過：耳朵垂下來（往兩邊倒）
      const a = sad ? 62 : face === 'scared' ? 4 : 12
      return (
        <g>
          {T(<circle cx={176} cy={238} r={16} fill="#fff" {...s} />)}
          {[-1, 1].map((d) => (
            <g key={d} transform={`rotate(${d * a} ${120 + d * 26} 52)`}>
              <ellipse cx={120 + d * 26} cy={8} rx={19} ry={50} fill={c.fur} {...s} />
              <ellipse cx={120 + d * 26} cy={12} rx={9} ry={36} fill={c.inner} />
            </g>
          ))}
        </g>
      )
    }
    case 'bear':
    case 'panda':
      return (
        <g>
          <circle cx={66} cy={50} r={24} fill={sp === 'panda' ? c.inner : c.fur} {...L(sp === 'panda' ? '#2E2E34' : c.line)} />
          <circle cx={174} cy={50} r={24} fill={sp === 'panda' ? c.inner : c.fur} {...L(sp === 'panda' ? '#2E2E34' : c.line)} />
          {sp === 'bear' && <circle cx={66} cy={52} r={11} fill={c.inner} />}
          {sp === 'bear' && <circle cx={174} cy={52} r={11} fill={c.inner} />}
          {T(<circle cx={168} cy={244} r={12} fill={c.fur} {...s} />)}
        </g>
      )
    case 'kitty':
      return (
        <g>
          {T(
            <g>
              <path d="M168 250 C214 250 214 196 196 176" fill="none" {...L(c.line, 16)} />
              <path d="M168 250 C214 250 214 196 196 176" fill="none" stroke={c.fur} strokeWidth={8} strokeLinecap="round" />
            </g>,
          )}
          <path d={sad ? 'M56 74 L40 34 L92 46 Z' : 'M58 74 L58 16 L100 46 Z'} fill={c.fur} {...s} />
          <path d={sad ? 'M184 74 L200 34 L148 46 Z' : 'M182 74 L182 16 L140 46 Z'} fill={c.fur} {...s} />
          <path d={sad ? 'M58 62 L52 44 L76 48 Z' : 'M64 60 L64 32 L84 46 Z'} fill={c.inner} />
          <path d={sad ? 'M182 62 L188 44 L164 48 Z' : 'M176 60 L176 32 L156 46 Z'} fill={c.inner} />
        </g>
      )
    case 'puppy':
      return T(<path d="M164 246 Q200 236 196 206" fill="none" {...L(c.line, 14)} />)
    case 'piggy':
      return (
        <g>
          {T(<path d="M166 236 q16 -4 12 8 q-4 12 10 8" fill="none" {...L(c.line, 5)} />)}
          <path d="M62 66 L60 26 L98 46 Z" fill={c.fur} {...s} />
          <path d="M178 66 L180 26 L142 46 Z" fill={c.fur} {...s} />
          <path d="M68 58 L67 38 L86 48 Z" fill={c.inner} />
          <path d="M172 58 L173 38 L154 48 Z" fill={c.inner} />
        </g>
      )
    case 'mouse':
      return (
        <g>
          {T(<path d="M164 248 C210 262 222 220 204 200" fill="none" {...L(c.line, 6)} />)}
          <circle cx={56} cy={52} r={36} fill={c.fur} {...s} />
          <circle cx={184} cy={52} r={36} fill={c.fur} {...s} />
          <circle cx={58} cy={54} r={23} fill={c.inner} />
          <circle cx={182} cy={54} r={23} fill={c.inner} />
        </g>
      )
    case 'fox':
      return (
        <g>
          {T(
            <g>
              <path d="M160 246 C226 254 236 190 200 168 C206 206 190 226 160 230 Z" fill={c.fur} {...s} />
              <path d="M214 196 C222 212 214 232 196 240 C208 226 210 210 214 196 Z" fill="#fff" />
            </g>,
          )}
          <path d={sad ? 'M58 76 L34 26 L98 46 Z' : 'M56 76 L54 8 L102 46 Z'} fill={c.fur} {...s} />
          <path d={sad ? 'M182 76 L206 26 L142 46 Z' : 'M184 76 L186 8 L138 46 Z'} fill={c.fur} {...s} />
          <path d={sad ? 'M34 26 L50 32 L44 46 Z' : 'M54 8 L72 22 L56 34 Z'} fill={c.inner} />
          <path d={sad ? 'M206 26 L190 32 L196 46 Z' : 'M186 8 L168 22 L184 34 Z'} fill={c.inner} />
        </g>
      )
    case 'lion':
      return (
        <g>
          {T(
            <g>
              <path d="M164 246 Q206 250 204 208" fill="none" {...L(c.line, 6)} />
              <circle cx={206} cy={204} r={11} fill="#B9702E" />
            </g>,
          )}
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2
            return <circle key={i} cx={120 + Math.cos(a) * 80} cy={106 + Math.sin(a) * 76} r={30} fill="#D9894A" {...L('#A85E28')} />
          })}
          <circle cx={120} cy={106} r={84} fill="#D9894A" />
          <circle cx={70} cy={52} r={16} fill={c.fur} {...s} />
          <circle cx={170} cy={52} r={16} fill={c.fur} {...s} />
        </g>
      )
    case 'elephant': {
      const drop = sad ? 14 : 0
      return (
        <g>
          <ellipse cx={46} cy={104 + drop} rx={44} ry={58} fill={c.fur} {...s} />
          <ellipse cx={194} cy={104 + drop} rx={44} ry={58} fill={c.fur} {...s} />
          <ellipse cx={50} cy={106 + drop} rx={28} ry={40} fill={c.inner} />
          <ellipse cx={190} cy={106 + drop} rx={28} ry={40} fill={c.inner} />
        </g>
      )
    }
    case 'monkey':
      return (
        <g>
          {T(<path d="M162 244 C214 250 220 196 196 190 C182 188 180 206 192 208" fill="none" {...L(c.line, 9)} />)}
          <circle cx={44} cy={104} r={24} fill={c.fur} {...s} />
          <circle cx={196} cy={104} r={24} fill={c.fur} {...s} />
          <circle cx={46} cy={104} r={13} fill={c.inner} />
          <circle cx={194} cy={104} r={13} fill={c.inner} />
        </g>
      )
    case 'koala':
      return (
        <g>
          {[-1, 1].map((d) => (
            <g key={d}>
              <circle cx={120 + d * 70} cy={60} r={36} fill={c.fur} {...s} />
              <circle cx={120 + d * 70} cy={62} r={22} fill={c.inner} />
              <path d={`M${120 + d * 58} 56 l${d * 10} -8 M${120 + d * 64} 72 l${d * 12} -2`} stroke="#fff" strokeWidth={4} strokeLinecap="round" />
            </g>
          ))}
        </g>
      )
    case 'ducky':
      return T(<path d="M164 230 q24 -6 30 -28 q-18 6 -30 6" fill={c.fur} {...s} />)
    default:
      return null
  }
}

/** 頭（底色、口鼻、斑紋），不含眼睛和嘴巴 */
function Head({ sp, face }: { sp: SpeciesId; face: Face }) {
  const c = LOOKS[sp]
  const h = c.head ?? { rx: 72, ry: 66 }
  const cy = h.cy ?? 104
  const s = L(c.line)
  return (
    <g>
      {sp === 'froggy' && (
        <>
          <circle cx={88} cy={56} r={30} fill={c.fur} {...s} />
          <circle cx={152} cy={56} r={30} fill={c.fur} {...s} />
        </>
      )}
      <ellipse cx={120} cy={cy} rx={h.rx} ry={h.ry} fill={c.fur} {...s} />
      {sp === 'froggy' && (
        <>
          <circle cx={88} cy={56} r={27.5} fill={c.fur} />
          <circle cx={152} cy={56} r={27.5} fill={c.fur} />
          <circle cx={88} cy={54} r={18} fill={c.inner} />
          <circle cx={152} cy={54} r={18} fill={c.inner} />
        </>
      )}
      {sp === 'kitty' && <path d="M120 44 V60 M104 46 L108 60 M136 46 L132 60" stroke="#D9A563" strokeWidth={6} strokeLinecap="round" />}
      {sp === 'fox' && <path d="M50 112 Q84 116 120 150 Q156 116 190 112 Q184 168 120 170 Q56 168 50 112 Z" fill={c.belly} />}
      {sp === 'panda' &&
        [-1, 1].map((d) => <ellipse key={d} cx={120 + d * 27} cy={106} rx={17} ry={23} transform={`rotate(${d * -28} ${120 + d * 27} 106)`} fill={c.inner} />)}
      {sp === 'monkey' && <path d="M120 88 Q132 66 152 70 Q176 74 172 104 Q170 128 158 146 Q140 170 120 170 Q100 170 82 146 Q70 128 68 104 Q64 74 88 70 Q108 66 120 88 Z" fill={c.belly} />}
      {sp === 'puppy' && <ellipse cx={146} cy={96} rx={20} ry={18} fill="#E3C79C" />}
      {sp === 'ducky' && <path d="M112 42 q-2 -18 10 -22 M120 40 q6 -16 18 -14" fill="none" {...L(c.line, 6)} />}
      {/* 口鼻 */}
      {(sp === 'bear' || sp === 'puppy' || sp === 'lion' || sp === 'koala') && <ellipse cx={120} cy={136} rx={32} ry={24} fill={c.belly} />}
      {sp === 'piggy' && (
        <g>
          <ellipse cx={120} cy={126} rx={24} ry={17} fill="#F2A7B5" {...L(c.line, 4)} />
          <ellipse cx={112} cy={126} rx={4} ry={6} fill="#B9677A" />
          <ellipse cx={128} cy={126} rx={4} ry={6} fill="#B9677A" />
        </g>
      )}
      {(sp === 'bear' || sp === 'puppy' || sp === 'panda' || sp === 'fox' || sp === 'lion') && <ellipse cx={120} cy={sp === 'fox' ? 130 : 124} rx={11} ry={7.5} fill={INK} />}
      {sp === 'koala' && <ellipse cx={120} cy={120} rx={15} ry={20} fill="#4A4550" />}
      {(sp === 'bunny' || sp === 'kitty' || sp === 'mouse') && <path d="M113 120 H127 L120 128 Z" fill="#E98F86" {...L('#E98F86', 3)} />}
      {sp === 'monkey' && (
        <g fill={c.line}>
          <ellipse cx={114} cy={126} rx={3.5} ry={5} />
          <ellipse cx={126} cy={126} rx={3.5} ry={5} />
        </g>
      )}
      {(sp === 'kitty' || sp === 'mouse' || sp === 'bunny') && (
        <path d="M60 124 L92 128 M60 138 L92 134 M180 124 L148 128 M180 138 L148 134" stroke={c.line} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
      )}
      {sp === 'puppy' && (
        // 垂下來的耳朵：在頭的前面
        <g>
          <path d={face === 'sad' ? 'M58 70 Q24 92 34 150 Q48 158 64 128 Z' : 'M58 66 Q26 80 30 136 Q44 146 62 118 Z'} fill="#B98A5E" {...L('#8A5E3E')} />
          <path d={face === 'sad' ? 'M182 70 Q216 92 206 150 Q192 158 176 128 Z' : 'M182 66 Q214 80 210 136 Q196 146 178 118 Z'} fill="#B98A5E" {...L('#8A5E3E')} />
        </g>
      )}
    </g>
  )
}

/** 眼睛、眉毛、嘴巴、臉頰、眼淚、汗、怒氣 */
function Expression({ sp, face }: { sp: SpeciesId; face: Face }) {
  const c = LOOKS[sp]
  const [ex, ey] = c.eye
  const eyes: [number, number][] = [
    [ex, ey],
    [240 - ex, ey],
  ]
  const my = c.mouthY
  const panda = sp === 'panda'
  const eyeFill = panda ? '#fff' : INK
  const browY = sp === 'froggy' ? ey - 14 : ey
  const out: ReactElement[] = []
  // 眼睛
  eyes.forEach(([x, y], i) => {
    if (face === 'happy') out.push(<path key={`e${i}`} d={`M${x - 10} ${y + 3} Q${x} ${y - 11} ${x + 10} ${y + 3}`} fill="none" {...L(eyeFill, 5.5)} />)
    else if (face === 'scared') {
      out.push(
        <g key={`e${i}`}>
          <circle cx={x} cy={y} r={13} fill="#fff" {...L(INK, 3)} />
          <circle cx={x} cy={y + 1} r={4.6} fill={INK} />
        </g>,
      )
    } else if (face === 'surprised') {
      // 驚訝：眼睛圓圓亮亮的（黑眼珠大、有亮點），跟害怕的小黑點不一樣
      out.push(
        <g key={`e${i}`}>
          <circle cx={x} cy={y - 2} r={12} fill="#fff" {...L(INK, 3)} />
          <circle cx={x} cy={y - 2} r={7.4} fill={panda ? INK : eyeFill} />
          <circle cx={x + 2.6} cy={y - 5} r={2.6} fill="#fff" />
        </g>,
      )
    } else {
      const dy = face === 'sad' ? 3 : 0
      out.push(
        <g key={`e${i}`}>
          <ellipse cx={x} cy={y + dy} rx={6.6} ry={8.4} fill={eyeFill} />
          <circle cx={x + 2.2} cy={y + dy - 3} r={2.4} fill={panda ? INK : '#fff'} />
        </g>,
      )
    }
  })
  // 眉毛
  const brow = (d: string, k: string, w = 5.5) => out.push(<path key={k} d={d} fill="none" {...L(INK, w)} />)
  const [lx, rx] = [eyes[0][0], eyes[1][0]]
  if (face === 'sad') {
    brow(`M${lx - 13} ${browY - 15} L${lx + 10} ${browY - 25}`, 'b0')
    brow(`M${rx + 13} ${browY - 15} L${rx - 10} ${browY - 25}`, 'b1')
  } else if (face === 'angry') {
    brow(`M${lx - 14} ${browY - 26} L${lx + 12} ${browY - 13}`, 'b0', 7)
    brow(`M${rx + 14} ${browY - 26} L${rx - 12} ${browY - 13}`, 'b1', 7)
  } else if (face === 'scared') {
    brow(`M${lx - 14} ${browY - 22} Q${lx} ${browY - 34} ${lx + 12} ${browY - 25}`, 'b0')
    brow(`M${rx + 14} ${browY - 22} Q${rx} ${browY - 34} ${rx - 12} ${browY - 25}`, 'b1')
  } else if (face === 'surprised') {
    // 驚訝：眉毛挑得很高、圓弧
    brow(`M${lx - 13} ${browY - 26} Q${lx} ${browY - 42} ${lx + 13} ${browY - 26}`, 'b0')
    brow(`M${rx - 13} ${browY - 26} Q${rx} ${browY - 42} ${rx + 13} ${browY - 26}`, 'b1')
  }
  // 嘴巴
  // 大象的鼻子在中間：嘴巴畫在鼻子右邊
  const mx = sp === 'elephant' ? 146 : 120
  if (sp === 'ducky') {
    // 鴨子的嘴巴就是喙：開心、害怕張開，難過嘴角往下，生氣緊緊閉著
    const open = face === 'happy' || face === 'surprised' ? 14 : face === 'scared' ? 10 : 0
    const down = face === 'sad' ? 6 : 0
    out.push(
      <g key="m">
        {open > 0 && <path d={`M${mx - 26} ${my} Q${mx} ${my + open * 2.2} ${mx + 26} ${my} Z`} fill={MOUTH} />}
        <path d={`M${mx - 30} ${my + down} Q${mx - 30} ${my - 14} ${mx} ${my - 14} Q${mx + 30} ${my - 14} ${mx + 30} ${my + down} Q${mx} ${my + 4} ${mx - 30} ${my + down} Z`} fill="#F29D4B" {...L('#C46A22', 4)} />
        <path d={`M${mx - 24} ${my + 4 + open} Q${mx} ${my + 16 + open} ${mx + 24} ${my + 4 + open} Q${mx} ${my + 6 + open * 0.6} ${mx - 24} ${my + 4 + open} Z`} fill="#F29D4B" {...L('#C46A22', 4)} />
      </g>,
    )
  } else if (face === 'happy') {
    const w = sp === 'froggy' ? 30 : 17
    out.push(
      <g key="m">
        <path d={`M${mx - w} ${my - 2} Q${mx} ${my + w * 1.5} ${mx + w} ${my - 2} Z`} fill={MOUTH} {...L(MOUTH, 3.5)} />
        <ellipse cx={mx} cy={my + w * 0.62} rx={w * 0.48} ry={w * 0.22} fill={TONGUE} />
      </g>,
    )
  } else if (face === 'sad') {
    const w = sp === 'froggy' ? 24 : 14
    out.push(<path key="m" d={`M${mx - w} ${my + 9} Q${mx} ${my - 5} ${mx + w} ${my + 9}`} fill="none" {...L(INK, 4.5)} />)
  } else if (face === 'angry') {
    const w = sp === 'froggy' ? 24 : 16
    out.push(
      <g key="m">
        <rect x={mx - w} y={my - 2} width={w * 2} height={14} rx={6} fill="#fff" {...L(INK, 3.5)} />
        <path d={`M${mx - w + 4} ${my + 5} H${mx + w - 4} M${mx - w / 3} ${my - 1} V${my + 11} M${mx + w / 3} ${my - 1} V${my + 11}`} stroke={INK} strokeWidth={2.4} />
      </g>,
    )
  } else if (face === 'scared') {
    out.push(<ellipse key="m" cx={mx} cy={my + 6} rx={8.5} ry={11} fill={MOUTH} {...L(INK, 3)} />)
  } else if (face === 'surprised') {
    // 驚訝：大大的 O（比害怕的大、圓）
    out.push(
      <g key="m">
        <ellipse cx={mx} cy={my + 8} rx={13} ry={16} fill={MOUTH} {...L(INK, 3)} />
        <ellipse cx={mx} cy={my + 16} rx={7} ry={5} fill={TONGUE} />
      </g>,
    )
  } else {
    const w = sp === 'froggy' ? 22 : 9
    out.push(<path key="m" d={`M${mx - w} ${my + 1} Q${mx} ${my + w * 0.7} ${mx + w} ${my + 1}`} fill="none" {...L(INK, 4)} />)
  }
  // 臉頰
  const cheekY = sp === 'froggy' ? 116 : ey + 26
  if (face === 'happy' || face === 'neutral' || face === 'surprised') {
    out.push(<ellipse key="c0" cx={lx - 14} cy={cheekY} rx={11} ry={7} fill={CHEEK} opacity={face === 'neutral' ? 0.6 : 0.95} />)
    out.push(<ellipse key="c1" cx={rx + 14} cy={cheekY} rx={11} ry={7} fill={CHEEK} opacity={face === 'neutral' ? 0.6 : 0.95} />)
  }
  if (face === 'surprised') {
    // 頭上的驚嘆號（黃色，跟生氣的紅色記號不一樣）
    out.push(
      <g key="mark" transform="translate(190 30)">
        <path d="M0 -20 V2" fill="none" {...L('#E39A1E', 9)} />
        <circle cx={0} cy={16} r={5.5} fill="#E39A1E" />
      </g>,
    )
  }
  if (face === 'angry') {
    out.push(<ellipse key="c0" cx={lx - 12} cy={cheekY} rx={14} ry={8} fill="#E58A80" opacity={0.75} />)
    out.push(<ellipse key="c1" cx={rx + 12} cy={cheekY} rx={14} ry={8} fill="#E58A80" opacity={0.75} />)
    // 頭上的怒氣記號（四段彎線）
    out.push(
      <g key="mark" transform="translate(186 34)" fill="none" {...L('#E0604E', 5.5)}>
        <path d="M-14 -4 Q-6 -6 -4 -14 M4 -14 Q6 -6 14 -4 M14 4 Q6 6 4 14 M-4 14 Q-6 6 -14 4" />
      </g>,
    )
  }
  if (face === 'sad') {
    // 眼淚：左眼下面一大顆、右眼一小顆
    out.push(<path key="t0" d={`M${lx - 2} ${ey + 14} q-9 14 0 18 q9 -4 0 -18 Z`} fill="#8FC3EA" {...L('#5C95C9', 2.5)} />)
    out.push(<path key="t1" d={`M${rx + 3} ${ey + 14} q-6 9 0 12 q6 -3 0 -12 Z`} fill="#8FC3EA" {...L('#5C95C9', 2.5)} />)
  }
  if (face === 'scared') {
    // 汗：頭的右上方
    out.push(<path key="sw" d="M196 64 q-12 18 0 24 q12 -6 0 -24 Z" fill="#BFE1F2" {...L('#6FA8D2', 3)} />)
    out.push(<path key="sw2" d="M40 80 q-8 12 0 16 q8 -4 0 -16 Z" fill="#BFE1F2" {...L('#6FA8D2', 3)} />)
  }
  return <g>{out}</g>
}

/** 手臂：肩膀 → 手肘 → 手；照心情擺 */
const ARMS: Record<Face | 'hold', [string, string]> = {
  neutral: ['M74 188 Q60 212 56 238', 'M166 188 Q180 212 184 238'],
  hold: ['M74 188 Q60 212 56 238', 'M166 188 Q196 196 210 194'],
  happy: ['M74 184 Q50 166 38 128', 'M166 184 Q190 166 202 128'],
  sad: ['M78 192 Q72 218 72 246', 'M162 192 Q168 218 168 246'],
  angry: ['M74 188 Q34 206 70 236', 'M166 188 Q206 206 170 236'],
  scared: ['M76 186 Q46 170 60 138', 'M164 186 Q194 170 180 138'],
  surprised: ['M74 186 Q40 176 26 150', 'M166 186 Q200 176 214 150'],
}
const HANDS: Record<Face | 'hold', [[number, number], [number, number]]> = {
  neutral: [
    [56, 240],
    [184, 240],
  ],
  hold: [
    [56, 240],
    [212, 194],
  ],
  happy: [
    [37, 124],
    [203, 124],
  ],
  sad: [
    [72, 248],
    [168, 248],
  ],
  angry: [
    [72, 236],
    [168, 236],
  ],
  scared: [
    [62, 134],
    [178, 134],
  ],
  surprised: [
    [24, 146],
    [216, 146],
  ],
}

function Arms({ sp, face, arm }: { sp: SpeciesId; face: Face; arm: Arm }) {
  const c = LOOKS[sp]
  const left = ARMS[face][0]
  const right = arm === 'hold' ? ARMS.hold[1] : ARMS[face][1]
  const hands = [HANDS[face][0], arm === 'hold' ? HANDS.hold[1] : HANDS[face][1]]
  const limb = sp === 'panda' ? '#3E3E46' : c.fur
  const limbLine = sp === 'panda' ? '#2E2E34' : c.line
  return (
    <g>
      {[left, right].map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" {...L(limbLine, 25)} />
          <path d={d} fill="none" {...L(limb, 15)} />
        </g>
      ))}
      {hands.map(([x, y], i) => (
        <circle key={`h${i}`} cx={x} cy={y} r={13} fill={limb} {...L(limbLine, 5)} />
      ))}
    </g>
  )
}

/** 整隻（頭、身體、手腳）。arm = hold：右手往前伸（拿著東西） */
export function Critter({ sp, face, arm = 'mood' }: { sp: SpeciesId; face: Face; arm?: Arm }) {
  const c = LOOKS[sp]
  const s = L(c.line)
  const legs = sp === 'panda' ? '#3E3E46' : c.fur
  const sad = face === 'sad'
  return (
    <g>
      <Back sp={sp} face={face} />
      {/* 身體、肚子、腳 */}
      <ellipse cx={92} cy={268} rx={24} ry={12} fill={sp === 'ducky' ? '#F29D4B' : legs} {...L(sp === 'ducky' ? '#C46A22' : c.line)} />
      <ellipse cx={148} cy={268} rx={24} ry={12} fill={sp === 'ducky' ? '#F29D4B' : legs} {...L(sp === 'ducky' ? '#C46A22' : c.line)} />
      <ellipse cx={120} cy={214} rx={62} ry={56} fill={c.fur} {...s} />
      <ellipse cx={120} cy={224} rx={38} ry={36} fill={c.belly} />
      {sp === 'panda' && <path d="M66 190 Q120 166 174 190 L170 206 Q120 186 70 206 Z" fill="#3E3E46" />}
      {/* 頭：難過的時候往下低一點 */}
      <g transform={sad ? 'translate(0 8)' : face === 'scared' ? 'translate(0 -4)' : face === 'surprised' ? 'translate(0 -6)' : undefined}>
        <Head sp={sp} face={face} />
        <Expression sp={sp} face={face} />
        {sp === 'elephant' && <Trunk face={face} />}
      </g>
      <Arms sp={sp} face={face} arm={arm} />
      {/* 害怕：身體兩邊發抖的線（靜止的） */}
      {face === 'scared' && <path d="M30 200 q-8 10 0 20 q8 10 0 20 M210 200 q8 10 0 20 q-8 10 0 20" fill="none" {...L('#8E95C9', 4)} />}
    </g>
  )
}

/** 大象的鼻子：蓋在嘴巴的中間，兩邊露出嘴角（看得出笑或嘴角往下）；開心時鼻子往上捲 */
function Trunk({ face }: { face: Face }) {
  const c = LOOKS.elephant
  const d = face === 'happy' ? 'M112 112 Q104 146 90 156 Q76 162 76 146' : 'M112 112 Q108 146 98 166 Q90 180 78 174'
  return (
    <g>
      <path d={d} fill="none" {...L(c.line, 24)} />
      <path d={d} fill="none" {...L(c.fur, 15)} />
    </g>
  )
}

/** 只有頭（選項用的臉）：viewBox 0 -24 240 214 */
export function CritterHead({ sp, face }: { sp: SpeciesId; face: Face }) {
  return (
    <g>
      <HeadOnlyBack sp={sp} face={face} />
      <Head sp={sp} face={face} />
      <Expression sp={sp} face={face} />
      {sp === 'elephant' && <Trunk face={face} />}
    </g>
  )
}

/** 頭後面的耳朵、鬃毛（不畫尾巴） */
function HeadOnlyBack({ sp, face }: { sp: SpeciesId; face: Face }) {
  return <Back sp={sp} face={face} tail={false} />
}
