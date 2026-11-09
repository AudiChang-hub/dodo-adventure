// 故事插畫的東西：道具、車子、房子、天上的東西（T-119）。大小照 ./meta.ts（自己的 viewBox，底部是地面）。
// 一樣淡色平塗、粗外框、沒有漸層和細紋理；條紋、格子都用大塊的。
import type { ReactElement } from 'react'
import { Blob, Cheek, Eye, INK, Smile, line } from './kit'

const WOOD = '#C9A57E'
const WOOD_LINE = '#8F6E4B'
const TIRE = '#6B645A'

function Wheel({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={TIRE} {...line('#4A443C')} />
      <circle cx={x} cy={y} r={r * 0.42} fill="#D8D2C8" />
    </g>
  )
}

export function Seedling() {
  return (
    <g>
      <ellipse cx={75} cy={142} rx={60} ry={10} fill="#C9B48A" {...line('#A08A5E', 4)} />
      <path d="M75 140 V70" {...line('#6A9E6B', 8)} />
      <path d="M75 92 C50 96 28 80 26 56 C52 52 72 66 75 92 Z" fill="#A9D3A4" {...line('#6A9E6B')} />
      <path d="M75 76 C98 80 122 64 124 38 C98 34 78 50 75 76 Z" fill="#A9D3A4" {...line('#6A9E6B')} />
    </g>
  )
}

export function Trophy() {
  const s = line('#C29A3E')
  return (
    <g>
      <path d="M40 40 C8 40 8 92 50 92 M110 40 C142 40 142 92 100 92" fill="none" {...line('#C29A3E', 9)} />
      <path d="M36 20 H114 V60 C114 96 96 112 75 112 C54 112 36 96 36 60 Z" fill="#F2D27A" {...s} />
      <rect x={64} y={110} width={22} height={34} fill="#F2D27A" {...s} />
      <rect x={36} y={142} width={78} height={30} rx={8} fill={WOOD} {...line(WOOD_LINE)} />
      <path d="M75 44 l7 14 l15 2 l-11 10 l3 15 l-14 -8 l-14 8 l3 -15 l-11 -10 l15 -2 Z" fill="#FBF8F2" />
    </g>
  )
}

export function Hammer() {
  return (
    <g>
      <rect x={20} y={70} width={150} height={22} rx={11} transform="rotate(-30 95 81)" fill={WOOD} {...line(WOOD_LINE)} />
      <rect x={112} y={4} width={50} height={80} rx={10} transform="rotate(-30 137 44)" fill="#AEB7C2" {...line('#6F7B88')} />
      <ellipse cx={70} cy={150} rx={60} ry={8} fill="rgba(46,42,37,.08)" />
    </g>
  )
}

export function Planks() {
  return (
    <g {...line(WOOD_LINE)}>
      <rect x={10} y={86} width={220} height={28} rx={8} fill={WOOD} />
      <rect x={20} y={56} width={210} height={28} rx={8} fill="#D9B98E" />
      <rect x={4} y={26} width={200} height={28} rx={8} fill={WOOD} />
    </g>
  )
}

export function Apples() {
  return (
    <g>
      {[
        [60, 86, '#E8907E', '#BF6A5C'],
        [150, 86, '#A9D38A', '#6E9A42'],
        [106, 70, '#E8907E', '#BF6A5C'],
      ].map(([x, y, f, s], i) => (
        <g key={i}>
          <path d={`M${x} ${Number(y) - 36} C${Number(x) - 4} ${Number(y) - 50} ${Number(x) + 2} ${Number(y) - 56} ${Number(x) + 6} ${Number(y) - 60}`} fill="none" {...line(WOOD_LINE, 5)} />
          <path d={`M${x} ${Number(y) - 40} C${Number(x) + 16} ${Number(y) - 58} ${Number(x) + 34} ${Number(y) - 50} ${Number(x) + 30} ${Number(y) - 40} C${Number(x) + 22} ${Number(y) - 34} ${Number(x) + 8} ${Number(y) - 34} ${x} ${Number(y) - 40} Z`} fill="#9FCB9A" {...line('#6A9E6B', 3.5)} />
          <path d={`M${x} ${Number(y) - 30} C${Number(x) + 46} ${Number(y) - 54} ${Number(x) + 64} ${Number(y) + 4} ${Number(x) + 30} ${Number(y) + 40} C${Number(x) + 16} ${Number(y) + 54} ${Number(x) - 16} ${Number(y) + 54} ${Number(x) - 30} ${Number(y) + 40} C${Number(x) - 64} ${Number(y) + 4} ${Number(x) - 46} ${Number(y) - 54} ${x} ${Number(y) - 30} Z`} fill={String(f)} {...line(String(s))} />
        </g>
      ))}
    </g>
  )
}

export function BookOpen() {
  return (
    <g>
      <path d="M10 60 L150 76 L290 60 L290 186 L150 198 L10 186 Z" fill="#B98A5E" {...line('#8A6440')} />
      <path d="M22 44 C70 34 120 44 150 66 L150 184 C120 164 70 158 22 168 Z" fill="#FBF6EC" {...line('#B9A58E')} />
      <path d="M278 44 C230 34 180 44 150 66 L150 184 C180 164 230 158 278 168 Z" fill="#FBF6EC" {...line('#B9A58E')} />
      <g stroke="#D9C7A6" strokeWidth={6} strokeLinecap="round">
        <path d="M44 80 Q86 72 128 86" />
        <path d="M44 106 Q86 98 128 112" />
        <path d="M172 86 Q214 72 256 80" />
        <path d="M172 112 Q214 98 256 106" />
      </g>
      <path d="M150 66 V196" stroke="#E8907E" strokeWidth={6} />
    </g>
  )
}

export function BookClosed() {
  return (
    <g>
      <rect x={30} y={16} width={170} height={176} rx={14} fill="#FBF6EC" {...line('#B9A58E')} />
      <rect x={20} y={10} width={168} height={176} rx={14} fill="#B98A5E" {...line('#8A6440')} />
      <rect x={20} y={10} width={30} height={176} rx={10} fill="#A47650" {...line('#8A6440')} />
      <rect x={76} y={50} width={88} height={56} rx={10} fill="#F2D27A" {...line('#C29A3E', 4)} />
      <path d="M120 64 l6 12 l13 2 l-10 9 l3 13 l-12 -7 l-12 7 l3 -13 l-10 -9 l13 -2 Z" fill="#FBF8F2" />
    </g>
  )
}

/** 魔法門：圓拱、紫藍色、一顆星、金色門把 */
export function Door() {
  return (
    <g>
      <path d="M14 296 V100 C14 44 52 10 100 10 C148 10 186 44 186 100 V296 Z" fill={WOOD} {...line(WOOD_LINE)} />
      <path d="M32 296 V104 C32 58 62 30 100 30 C138 30 168 58 168 104 V296 Z" fill="#8E95C9" {...line('#646BA6')} />
      <path d="M100 74 l10 20 l22 3 l-16 15 l4 22 l-20 -11 l-20 11 l4 -22 l-16 -15 l22 -3 Z" fill="#F6DE96" {...line('#D9B45A', 4)} />
      <circle cx={146} cy={196} r={11} fill="#F2D27A" {...line('#C29A3E', 4)} />
      <path d="M60 170 H76 M60 220 H76 M124 240 H140" stroke="#A3A9D6" strokeWidth={8} strokeLinecap="round" />
    </g>
  )
}

/** 魔法屋（外面）：奶油色的牆、藍綠色屋頂、圓窗、屋頂上一顆星 */
export function House() {
  return (
    <g>
      <rect x={232} y={40} width={36} height={70} rx={6} fill="#E8907E" {...line('#BF6A5C')} />
      <path d="M20 150 L170 34 L320 150 Z" fill="#8FC2BF" {...line('#5E9A97')} />
      <rect x={44} y={142} width={252} height={174} rx={10} fill="#FBF0DC" {...line('#C9A57E')} />
      <path d="M170 48 l8 16 l17 2 l-12 12 l3 17 l-16 -8 l-16 8 l3 -17 l-12 -12 l17 -2 Z" fill="#F6DE96" {...line('#D9B45A', 4)} />
      <path d="M140 316 V236 C140 216 156 204 170 204 C184 204 200 216 200 236 V316 Z" fill="#8E95C9" {...line('#646BA6')} />
      <circle cx={186} cy={268} r={6} fill="#F2D27A" />
      <circle cx={92} cy={210} r={28} fill="#A9CBE6" {...line('#6F9CC8')} />
      <circle cx={250} cy={210} r={28} fill="#A9CBE6" {...line('#6F9CC8')} />
      <path d="M92 182 V238 M64 210 H120 M250 182 V238 M222 210 H278" stroke="#6F9CC8" strokeWidth={5} />
    </g>
  )
}

export function Bed() {
  return (
    <g>
      <rect x={8} y={40} width={30} height={148} rx={10} fill={WOOD} {...line(WOOD_LINE)} />
      <rect x={262} y={92} width={30} height={96} rx={10} fill={WOOD} {...line(WOOD_LINE)} />
      <rect x={30} y={100} width={240} height={50} rx={14} fill="#FBF8F2" {...line('#B9A58E')} />
      <ellipse cx={80} cy={96} rx={42} ry={20} fill="#FBF8F2" {...line('#B9A58E')} />
      <path d="M120 96 H262 Q272 96 272 108 V148 H112 Q108 120 120 96 Z" fill="#A9CBE6" {...line('#6F9CC8')} />
      <path d="M150 104 V146 M196 104 V146 M240 104 V146" stroke="#C6DCF0" strokeWidth={8} strokeLinecap="round" />
      <rect x={20} y={146} width={262} height={20} rx={8} fill="#B98A5E" {...line(WOOD_LINE)} />
    </g>
  )
}

export function Yarn() {
  return (
    <g>
      <path d="M118 112 C140 116 146 128 140 128 C130 128 112 124 96 126" fill="none" {...line('#C27A8E', 6)} />
      <circle cx={70} cy={70} r={56} fill="#F0B9C6" {...line('#C27A8E')} />
      <g fill="none" stroke="#DB97A8" strokeWidth={7} strokeLinecap="round">
        <path d="M30 50 C60 70 90 70 116 50" />
        <path d="M22 82 C56 100 92 100 122 82" />
        <path d="M54 18 C40 50 44 90 62 122" />
      </g>
    </g>
  )
}

/** 毯子：蜜桃色、兩條粗條紋、折起一角 */
export function Blanket() {
  return (
    <g>
      <path d="M20 40 Q140 22 262 40 L272 132 Q140 150 10 132 Z" fill="#F4D9C6" {...line('#C9967A')} />
      <path d="M16 74 Q140 58 266 74 L268 96 Q140 82 14 98 Z" fill="#E9B9A0" />
      <path d="M272 132 L220 140 Q236 112 262 98 Z" fill="#FBEFE4" {...line('#C9967A')} />
      <path d="M20 40 Q140 22 262 40 L272 132 Q140 150 10 132 Z" fill="none" {...line('#C9967A')} />
    </g>
  )
}

/** 籃子：粗粗的編織帶、提把；full：裝滿水果 */
export function Basket({ pose }: { pose: string }) {
  const full = pose === 'full'
  const dy = full ? 20 : 0
  return (
    <g transform={`translate(0 ${dy})`}>
      <path d="M40 76 C40 -6 200 -6 200 76" fill="none" {...line('#A8875A', 12)} />
      <path d="M40 76 C40 -6 200 -6 200 76" fill="none" stroke="#D9B98E" strokeWidth={5} />
      {full && (
        <g>
          <circle cx={88} cy={66} r={26} fill="#E8907E" {...line('#BF6A5C')} />
          <circle cx={150} cy={64} r={24} fill="#A9D38A" {...line('#6E9A42')} />
          <path d="M104 58 C120 30 160 26 178 40 C150 44 128 56 118 76 Z" fill="#F2D27A" {...line('#C29A3E')} />
        </g>
      )}
      <path d="M16 72 H224 L204 162 Q120 176 36 162 Z" fill={WOOD} {...line(WOOD_LINE)} />
      <path d="M22 100 H218 M28 128 H212" stroke="#A8875A" strokeWidth={7} strokeLinecap="round" />
      <rect x={12} y={64} width={216} height={18} rx={9} fill="#D9B98E" {...line(WOOD_LINE)} />
    </g>
  )
}

/** 彩虹蛋（ui/StoryPic 的 RainbowEgg 同一個樣子，改成這一套的線） */
export function Egg({ sleep }: { sleep?: boolean }) {
  const SPOTS = ['#E8907E', '#EDB07A', '#EED37E', '#9FCB9A', '#8DB8D8', '#8E95C9', '#B79BCB']
  const AT: [number, number, number][] = [
    [70, 70, 15],
    [128, 66, 12],
    [148, 120, 16],
    [58, 128, 13],
    [104, 112, 11],
    [76, 182, 16],
    [136, 178, 13],
  ]
  return (
    <g>
      <path d="M100 14 C150 14 184 92 184 144 C184 194 148 230 100 230 C52 230 16 194 16 144 C16 92 50 14 100 14 Z" fill="#FFF8EA" {...line('#D9C7A6', 6)} />
      {AT.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={SPOTS[i]} />
      ))}
      <ellipse cx={64} cy={54} rx={12} ry={20} fill="#fff" opacity={0.75} transform="rotate(-22 64 54)" />
      {sleep && (
        <g fill="#8E95C9" fontFamily="Fredoka, sans-serif" fontWeight={600}>
          <text x={190} y={90} fontSize={34}>
            z
          </text>
          <text x={214} y={52} fontSize={48}>
            Z
          </text>
        </g>
      )}
    </g>
  )
}

/** 蛋窩：籃子裡鋪著羊毛和毯子，蛋在中間，旁邊泰迪熊（彩虹蛋第 1 篇的結尾） */
export function Nest({ Teddy }: { Teddy: () => ReactElement }) {
  return (
    <g>
      <g transform="translate(222 110) scale(0.68)">
        <Teddy />
      </g>
      <g transform="translate(60 26) scale(0.62)">
        <Egg />
      </g>
      <path d="M30 150 Q60 120 100 140 Q140 112 180 140 Q220 120 246 150 Z" fill="#F0B9C6" {...line('#C27A8E')} />
      <path d="M24 144 Q130 128 250 144 L252 176 Q130 190 20 176 Z" fill="#F4D9C6" {...line('#C9967A')} />
      <path d="M14 168 H262 L240 250 Q140 264 36 250 Z" fill={WOOD} {...line(WOOD_LINE)} />
      <path d="M22 198 H254 M30 226 H246" stroke="#A8875A" strokeWidth={7} strokeLinecap="round" />
    </g>
  )
}

/** 恐龍蛋窩：樹枝窩、三顆有斑點的蛋 */
export function DinoNest() {
  return (
    <g>
      {[
        [96, 80, '#FBF6EC'],
        [184, 80, '#FBF6EC'],
        [140, 66, '#FBF6EC'],
      ].map(([x, y, f], i) => (
        <g key={i}>
          <ellipse cx={Number(x)} cy={Number(y)} rx={32} ry={42} fill={String(f)} {...line('#B9A58E')} />
          <circle cx={Number(x) - 8} cy={Number(y) - 10} r={7} fill="#9FCB9A" />
          <circle cx={Number(x) + 10} cy={Number(y) + 10} r={6} fill="#9FCB9A" />
        </g>
      ))}
      <path d="M10 100 Q140 80 270 100 L250 160 Q140 176 30 160 Z" fill="#C9A57E" {...line(WOOD_LINE)} />
      <g stroke="#A8875A" strokeWidth={7} strokeLinecap="round">
        <path d="M30 116 L90 108 M110 112 L190 104 M210 110 L256 112" />
        <path d="M44 140 L120 132 M140 136 L236 132" />
      </g>
    </g>
  )
}

/** 公車：黃色、四個大窗戶、前門 */
export function Bus() {
  return (
    <g>
      <rect x={10} y={20} width={360} height={170} rx={30} fill="#F2C14E" {...line('#B8902E')} />
      <rect x={10} y={150} width={360} height={30} fill="#E3AE3A" />
      <rect x={10} y={20} width={360} height={170} rx={30} fill="none" {...line('#B8902E')} />
      {[34, 112, 190].map((x) => (
        <rect key={x} x={x} y={44} width={64} height={60} rx={12} fill="#A9CBE6" {...line('#6F9CC8', 4)} />
      ))}
      <rect x={272} y={44} width={64} height={120} rx={10} fill="#A9CBE6" {...line('#6F9CC8', 4)} />
      <path d="M304 44 V164" stroke="#6F9CC8" strokeWidth={4} />
      <circle cx={360} cy={140} r={9} fill="#FBF8F2" {...line('#B8902E', 3)} />
      <Wheel x={84} y={190} r={32} />
      <Wheel x={290} y={190} r={32} />
    </g>
  )
}

export function BusStop() {
  return (
    <g>
      <rect x={58} y={80} width={16} height={216} rx={6} fill="#AEB7C2" {...line('#6F7B88')} />
      <circle cx={66} cy={70} r={58} fill="#8DB8D8" {...line('#5F89B0')} />
      <rect x={30} y={44} width={72} height={46} rx={10} fill="#FBF8F2" />
      <rect x={38} y={52} width={24} height={18} rx={4} fill="#8DB8D8" />
      <rect x={68} y={52} width={24} height={18} rx={4} fill="#8DB8D8" />
      <circle cx={46} cy={92} r={7} fill={TIRE} />
      <circle cx={86} cy={92} r={7} fill={TIRE} />
      <ellipse cx={66} cy={294} rx={40} ry={7} fill="#AEB7C2" />
    </g>
  )
}

export function TrafficLight() {
  return (
    <g>
      <rect x={52} y={170} width={16} height={146} rx={6} fill="#AEB7C2" {...line('#6F7B88')} />
      <rect x={14} y={8} width={92} height={180} rx={24} fill="#6B645A" {...line('#4A443C')} />
      <circle cx={60} cy={46} r={24} fill="#E8907E" />
      <circle cx={60} cy={98} r={24} fill="#5A544B" />
      <circle cx={60} cy={150} r={24} fill="#9FCB9A" />
    </g>
  )
}

export function Bridge() {
  return (
    <g>
      <path d="M0 150 Q310 40 620 150 V180 Q310 76 0 180 Z" fill="#E8907E" {...line('#BF6A5C')} />
      <rect x={0} y={150} width={620} height={30} fill="#D9C7A6" {...line('#A8875A')} />
      <g stroke="#BF6A5C" strokeWidth={8} strokeLinecap="round">
        {[80, 160, 240, 310, 380, 460, 540].map((x) => (
          <path key={x} d={`M${x} 150 V${150 - (110 - Math.abs(x - 310) * 0.33)}`} />
        ))}
      </g>
      <rect x={40} y={180} width={40} height={80} fill="#C9C2B6" {...line('#8C8478')} />
      <rect x={540} y={180} width={40} height={80} fill="#C9C2B6" {...line('#8C8478')} />
    </g>
  )
}

export function Footprints() {
  const foot = (x: number, y: number, r: number) => (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <ellipse cx={0} cy={14} rx={26} ry={22} fill="#B9C7A0" {...line('#7F9466', 4)} />
      <ellipse cx={-22} cy={-18} rx={9} ry={15} transform="rotate(-25 -22 -18)" fill="#B9C7A0" {...line('#7F9466', 4)} />
      <ellipse cx={0} cy={-24} rx={9} ry={15} fill="#B9C7A0" {...line('#7F9466', 4)} />
      <ellipse cx={22} cy={-18} rx={9} ry={15} transform="rotate(25 22 -18)" fill="#B9C7A0" {...line('#7F9466', 4)} />
    </g>
  )
  return (
    <g>
      {foot(60, 82, 80)}
      {foot(160, 50, 80)}
      {foot(262, 82, 80)}
    </g>
  )
}

export function Volcano() {
  return (
    <g>
      <Blob c={[[150, 60, 30], [190, 40, 36], [230, 62, 28]]} fill="#E6E1D8" stroke="#A39B8E" />
      <path d="M20 296 L136 96 Q190 82 244 96 L360 296 Z" fill="#B98A5E" {...line('#8A6440')} />
      <path d="M136 96 Q190 82 244 96 L226 126 Q190 112 154 126 Z" fill="#E8907E" {...line('#BF6A5C')} />
      <path d="M100 180 L130 160 M250 160 L282 182" stroke="#A47650" strokeWidth={9} strokeLinecap="round" />
    </g>
  )
}

export function Tractor() {
  return (
    <g>
      <rect x={40} y={110} width={220} height={70} rx={14} fill="#E8907E" {...line('#BF6A5C')} />
      <rect x={60} y={20} width={110} height={100} rx={12} fill="#FBF0DC" {...line('#BF6A5C')} />
      <rect x={76} y={36} width={78} height={54} rx={8} fill="#A9CBE6" {...line('#6F9CC8', 4)} />
      <rect x={230} y={60} width={16} height={56} rx={6} fill="#6B645A" />
      <Wheel x={100} y={180} r={58} />
      <Wheel x={256} y={200} r={36} />
    </g>
  )
}

export function FireTruck() {
  return (
    <g>
      <rect x={30} y={34} width={230} height={18} rx={8} fill="#D9C7A6" {...line('#8C8478', 4)} />
      <path d="M50 34 V52 M90 34 V52 M130 34 V52 M170 34 V52 M210 34 V52" stroke="#8C8478" strokeWidth={4} />
      <rect x={10} y={60} width={290} height={124} rx={18} fill="#E8907E" {...line('#BF6A5C')} />
      <path d="M296 80 H352 Q390 84 390 130 V184 H296 Z" fill="#E8907E" {...line('#BF6A5C')} />
      <rect x={312} y={92} width={56} height={44} rx={8} fill="#A9CBE6" {...line('#6F9CC8', 4)} />
      <rect x={320} y={60} width={34} height={22} rx={8} fill="#8DB8D8" {...line('#5F89B0', 4)} />
      <rect x={30} y={96} width={240} height={14} rx={6} fill="#FBF8F2" />
      <Wheel x={80} y={190} r={34} />
      <Wheel x={320} y={190} r={34} />
    </g>
  )
}

export function PoliceCar() {
  return (
    <g>
      <rect x={140} y={10} width={44} height={24} rx={8} fill="#8DB8D8" {...line('#5F89B0', 4)} />
      <path d="M70 70 Q90 30 130 30 H200 Q236 30 252 70 Z" fill="#FBF8F2" {...line('#5F89B0')} />
      <rect x={14} y={68} width={292} height={74} rx={24} fill="#FBF8F2" {...line('#5F89B0')} />
      <rect x={14} y={96} width={292} height={20} fill="#8DB8D8" />
      <rect x={14} y={68} width={292} height={74} rx={24} fill="none" {...line('#5F89B0')} />
      <path d="M96 64 Q106 42 130 42 H156 V64 Z M170 64 V42 H198 Q222 42 230 64 Z" fill="#A9CBE6" {...line('#6F9CC8', 4)} />
      <Wheel x={84} y={146} r={30} />
      <Wheel x={238} y={146} r={30} />
    </g>
  )
}

export function Ladder() {
  return (
    <g {...line('#8C8478')}>
      <rect x={20} y={6} width={18} height={322} rx={8} fill="#D9D2C6" />
      <rect x={102} y={6} width={18} height={322} rx={8} fill="#D9D2C6" />
      {[40, 100, 160, 220, 280].map((y) => (
        <rect key={y} x={30} y={y} width={80} height={14} rx={6} fill="#D9D2C6" />
      ))}
    </g>
  )
}

export function Water() {
  const drop = (x: number, y: number, k: number) => (
    <path transform={`translate(${x} ${y}) scale(${k})`} d="M0 -40 C14 -18 26 -4 26 12 C26 28 14 40 0 40 C-14 40 -26 28 -26 12 C-26 -4 -14 -18 0 -40 Z" fill="#A9CBE6" {...line('#6F9CC8', 5 / k)} />
  )
  return (
    <g>
      {drop(120, 60, 1.2)}
      {drop(50, 110, 0.9)}
      {drop(190, 110, 0.9)}
      <path d="M20 190 Q60 150 100 180 Q140 150 180 180 Q210 160 230 190 Z" fill="#BFDDEB" {...line('#6F9CC8')} />
    </g>
  )
}

export function Sailboat() {
  return (
    <g>
      <path d="M150 20 V200" {...line(WOOD_LINE, 8)} />
      <path d="M160 30 L260 190 H160 Z" fill="#FBF8F2" {...line('#B9A58E')} />
      <path d="M140 60 L60 190 H140 Z" fill="#E8907E" {...line('#BF6A5C')} />
      <path d="M150 20 L196 34 L150 48 Z" fill="#8DB8D8" {...line('#5F89B0', 4)} />
      <path d="M20 210 H280 L248 270 Q150 286 52 270 Z" fill={WOOD} {...line(WOOD_LINE)} />
      <circle cx={100} cy={238} r={9} fill="#A9CBE6" {...line('#6F9CC8', 3)} />
      <circle cx={150} cy={238} r={9} fill="#A9CBE6" {...line('#6F9CC8', 3)} />
      <circle cx={200} cy={238} r={9} fill="#A9CBE6" {...line('#6F9CC8', 3)} />
    </g>
  )
}

export function BeachUmbrella() {
  return (
    <g>
      <path d="M0 300 Q130 250 260 300 Z" fill="#F2E2B8" {...line('#CDB98C')} />
      <path d="M130 70 V280" {...line(WOOD_LINE, 8)} />
      <path d="M10 120 Q130 -4 250 120 Q220 104 190 120 Q160 104 130 120 Q100 104 70 120 Q40 104 10 120 Z" fill="#FBF8F2" {...line('#BF6A5C')} />
      <path d="M70 120 Q100 104 130 120 L130 40 Q86 52 70 120 Z M190 120 Q160 104 130 120 L130 40 Q174 52 190 120 Z" fill="#E8907E" />
      <path d="M10 120 Q130 -4 250 120 Q220 104 190 120 Q160 104 130 120 Q100 104 70 120 Q40 104 10 120 Z" fill="none" {...line('#BF6A5C')} />
    </g>
  )
}

export function Umbrella() {
  return (
    <g>
      <path d="M120 120 V250 Q120 274 100 274 Q82 274 82 256" fill="none" {...line('#8A6440', 9)} />
      <path d="M8 130 Q120 -10 232 130 Q204 112 176 130 Q148 112 120 130 Q92 112 64 130 Q36 112 8 130 Z" fill="#EED37E" {...line('#C2A140')} />
      <path d="M64 130 Q92 112 120 130 L120 40 Q76 54 64 130 Z M176 130 Q148 112 120 130 L120 40 Q164 54 176 130 Z" fill="#F6E2A0" />
      <path d="M8 130 Q120 -10 232 130 Q204 112 176 130 Q148 112 120 130 Q92 112 64 130 Q36 112 8 130 Z" fill="none" {...line('#C2A140')} />
      <circle cx={120} cy={22} r={9} fill="#EED37E" {...line('#C2A140', 4)} />
    </g>
  )
}

export function Banana() {
  return (
    <g>
      <path d="M30 40 C30 110 90 146 170 120 C186 116 190 104 178 102 C110 112 66 84 54 34 Z" fill="#F2D27A" {...line('#C29A3E')} />
      <path d="M30 40 L24 18 L44 16 L54 34" fill="#B9A06A" {...line('#8F7A4A', 4)} />
      <path d="M50 60 C66 94 110 112 160 108" fill="none" stroke="#E3BC5A" strokeWidth={6} strokeLinecap="round" />
    </g>
  )
}

export function Grapes() {
  const g: [number, number][] = [
    [36, 76],
    [76, 76],
    [116, 76],
    [56, 112],
    [96, 112],
    [76, 148],
  ]
  return (
    <g>
      <path d="M76 56 V22 C82 12 94 10 102 14" fill="none" {...line(WOOD_LINE, 6)} />
      <path d="M78 38 C96 18 126 22 128 38 C112 48 92 48 78 38 Z" fill="#9FCB9A" {...line('#6A9E6B', 4)} />
      {g.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={22} fill="#B79BCB" {...line('#86689E')} />
      ))}
    </g>
  )
}

export function Watermelon() {
  return (
    <g>
      <path d="M10 60 Q130 250 250 60 Z" fill="#9FCB9A" {...line('#6A9E6B')} />
      <path d="M26 62 Q130 220 234 62 Z" fill="#FBF6EC" />
      <path d="M38 62 Q130 200 222 62 Z" fill="#EE9A92" />
      <path d="M10 60 Q130 250 250 60 Z" fill="none" {...line('#6A9E6B')} />
      <path d="M10 60 H250" {...line('#6A9E6B')} />
      {[
        [90, 90],
        [130, 110],
        [170, 90],
        [110, 136],
        [152, 136],
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={5} ry={8} fill={INK} />
      ))}
    </g>
  )
}

export function Blocks() {
  const b = (x: number, y: number, f: string, s: string) => <rect x={x} y={y} width={96} height={46} rx={10} fill={f} {...line(s)} />
  return (
    <g>
      {b(20, 120, '#E8907E', '#BF6A5C')}
      {b(122, 120, '#8DB8D8', '#5F89B0')}
      {b(70, 72, '#EED37E', '#C2A140')}
      {b(98, 24, '#9FCB9A', '#6A9E6B')}
    </g>
  )
}

export function Truck() {
  return (
    <g>
      <rect x={10} y={20} width={240} height={160} rx={16} fill="#FBF0DC" {...line('#A8875A')} />
      <path d="M40 60 H220 M40 100 H220 M40 140 H220" stroke="#E8D3A8" strokeWidth={8} strokeLinecap="round" />
      <path d="M254 70 H320 Q366 74 368 130 V184 H254 Z" fill="#8DB8D8" {...line('#5F89B0')} />
      <rect x={272} y={86} width={66} height={44} rx={8} fill="#D8E7F5" {...line('#5F89B0', 4)} />
      <Wheel x={80} y={192} r={32} />
      <Wheel x={316} y={192} r={32} />
    </g>
  )
}

export function Cone() {
  return (
    <g>
      <rect x={10} y={136} width={110} height={20} rx={6} fill="#E8907E" {...line('#BF6A5C')} />
      <path d="M40 140 L58 14 Q65 6 72 14 L90 140 Z" fill="#EDB07A" {...line('#C2864A')} />
      <path d="M50 80 L80 80 L84 106 L46 106 Z" fill="#FBF8F2" />
    </g>
  )
}

/** 蓋到一半的房子：木頭的框、屋頂只有一半 */
export function Frame() {
  return (
    <g {...line(WOOD_LINE)}>
      <path d="M20 120 L160 20 L240 77" fill="none" stroke={WOOD} strokeWidth={22} />
      <path d="M20 120 L160 20 L240 77" fill="none" />
      <rect x={30} y={120} width={22} height={176} rx={6} fill={WOOD} />
      <rect x={150} y={120} width={22} height={176} rx={6} fill={WOOD} />
      <rect x={268} y={120} width={22} height={176} rx={6} fill={WOOD} />
      <rect x={24} y={116} width={272} height={22} rx={6} fill={WOOD} />
      <rect x={30} y={200} width={142} height={96} rx={6} fill="#E8907E" stroke="#BF6A5C" />
      <path d="M30 248 H172 M100 200 V248 M64 248 V296 M136 248 V296" stroke="#BF6A5C" />
    </g>
  )
}

/** 蓋好的房子：黃牆、藍屋頂、紅門 */
export function NewHouse() {
  return (
    <g>
      <path d="M10 130 L160 16 L310 130 Z" fill="#8DB8D8" {...line('#5F89B0')} />
      <rect x={36} y={124} width={248} height={172} rx={10} fill="#F4DC9C" {...line('#C29A3E')} />
      <rect x={130} y={196} width={60} height={100} rx={10} fill="#E8907E" {...line('#BF6A5C')} />
      <rect x={60} y={160} width={50} height={50} rx={8} fill="#A9CBE6" {...line('#6F9CC8', 4)} />
      <rect x={210} y={160} width={50} height={50} rx={8} fill="#A9CBE6" {...line('#6F9CC8', 4)} />
    </g>
  )
}

export function Bathtub() {
  return (
    <g>
      <Blob c={[[70, 64, 24], [110, 50, 30], [160, 56, 26], [210, 62, 24], [250, 70, 20]]} fill="#FBF8F2" stroke="#A9CBE6" />
      <path d="M10 76 H310 V110 Q310 176 240 176 H80 Q10 176 10 110 Z" fill="#FBF8F2" {...line('#9CB0C2')} />
      <rect x={4} y={70} width={312} height={20} rx={10} fill="#E6ECF2" {...line('#9CB0C2')} />
      <path d="M70 176 L56 198 M250 176 L264 198" {...line('#9CB0C2', 9)} />
      <circle cx={290} cy={40} r={12} fill="#FBF8F2" {...line('#A9CBE6', 4)} />
    </g>
  )
}

export function Toothbrush() {
  return (
    <g>
      <rect x={10} y={80} width={190} height={28} rx={14} fill="#8DB8D8" {...line('#5F89B0')} />
      <rect x={180} y={56} width={70} height={30} rx={8} fill="#FBF8F2" {...line('#9CB0C2')} />
      <path d="M190 56 V40 M206 56 V40 M222 56 V40 M238 56 V40" {...line('#9CB0C2', 6)} />
      <path d="M186 40 Q214 18 246 40 Q214 30 186 40 Z" fill="#A9CBE6" {...line('#6F9CC8', 4)} />
    </g>
  )
}

export function Gift() {
  return (
    <g>
      <rect x={20} y={80} width={160} height={124} rx={12} fill="#8DB8D8" {...line('#5F89B0')} />
      <rect x={10} y={56} width={180} height={36} rx={10} fill="#A9CBE6" {...line('#5F89B0')} />
      <rect x={88} y={56} width={24} height={148} fill="#E8907E" {...line('#BF6A5C', 4)} />
      <path d="M100 56 C70 10 40 30 60 52 Z M100 56 C130 10 160 30 140 52 Z" fill="#E8907E" {...line('#BF6A5C')} />
    </g>
  )
}

export function Balloons() {
  const b = (x: number, y: number, f: string, s: string) => (
    <g>
      <path d={`M${x} ${y + 56} Q${x + (110 - x) * 0.4} ${y + 140} 110 316`} fill="none" {...line('#A39B8E', 3)} />
      <ellipse cx={x} cy={y} rx={44} ry={54} fill={f} {...line(s)} />
      <path d={`M${x - 8} ${y + 60} L${x} ${y + 50} L${x + 8} ${y + 60} Z`} fill={f} {...line(s, 3)} />
      <ellipse cx={x - 16} cy={y - 20} rx={8} ry={14} fill="#fff" opacity={0.6} />
    </g>
  )
  return (
    <g>
      {b(60, 120, '#8DB8D8', '#5F89B0')}
      {b(160, 110, '#EED37E', '#C2A140')}
      {b(110, 62, '#E8907E', '#BF6A5C')}
    </g>
  )
}

export function Cake() {
  return (
    <g>
      <rect x={20} y={130} width={200} height={84} rx={14} fill="#F7D6CF" {...line('#C9837C')} />
      <rect x={50} y={70} width={140} height={66} rx={12} fill="#FBF6EC" {...line('#C9A57E')} />
      <path d="M20 150 Q45 168 70 150 Q95 168 120 150 Q145 168 170 150 Q195 168 220 150" fill="none" stroke="#FBF6EC" strokeWidth={10} strokeLinecap="round" />
      {[80, 120, 160].map((x) => (
        <g key={x}>
          <rect x={x - 6} y={30} width={12} height={42} rx={4} fill="#8DB8D8" {...line('#5F89B0', 3)} />
          <path d={`M${x} 6 C${x + 12} 18 ${x + 8} 28 ${x} 28 C${x - 8} 28 ${x - 12} 18 ${x} 6 Z`} fill="#F6C66B" {...line('#D9A040', 3)} />
        </g>
      ))}
      <circle cx={70} cy={176} r={9} fill="#E8907E" />
      <circle cx={120} cy={186} r={9} fill="#8DB8D8" />
      <circle cx={170} cy={176} r={9} fill="#EED37E" />
    </g>
  )
}

export function Confetti() {
  return (
    <g>
      <path d="M30 230 L90 120 L150 180 Z" fill="#EED37E" {...line('#C2A140')} />
      <path d="M60 176 L116 152" stroke="#E8907E" strokeWidth={10} strokeLinecap="round" />
      {[
        [140, 70, '#E8907E', 0],
        [196, 110, '#8DB8D8', 30],
        [180, 40, '#9FCB9A', -20],
        [110, 30, '#B79BCB', 15],
        [222, 60, '#EED37E', 40],
        [200, 170, '#E8907E', -30],
      ].map(([x, y, f, r], i) => (
        <rect key={i} x={Number(x) - 12} y={Number(y) - 7} width={24} height={14} rx={4} fill={String(f)} transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <circle cx={150} cy={120} r={8} fill="#8E95C9" />
      <circle cx={232} cy={130} r={8} fill="#9FCB9A" />
    </g>
  )
}

export function Kite() {
  return (
    <g>
      <path d="M100 160 C90 190 120 200 100 236" fill="none" {...line('#A39B8E', 4)} />
      <path d="M100 196 l-12 -8 v16 Z M100 196 l12 -8 v16 Z" fill="#E8907E" />
      <path d="M100 10 L176 84 L100 168 L24 84 Z" fill="#8DB8D8" {...line('#5F89B0')} />
      <path d="M100 10 L100 168 M24 84 H176" stroke="#5F89B0" strokeWidth={5} />
      <path d="M100 10 L176 84 L100 84 Z" fill="#EED37E" />
      <path d="M100 84 L24 84 L100 168 Z" fill="#EED37E" />
      <path d="M100 10 L176 84 L100 168 L24 84 Z" fill="none" {...line('#5F89B0')} />
    </g>
  )
}

export function Sandwich() {
  return (
    <g>
      <path d="M20 130 L110 20 L200 130 Z" fill="#F4DC9C" {...line('#C29A3E')} />
      <path d="M34 112 L110 30 L186 112" fill="none" stroke="#9FCB9A" strokeWidth={10} strokeLinejoin="round" />
      <path d="M44 120 H176" stroke="#E8907E" strokeWidth={10} strokeLinecap="round" />
      <path d="M20 130 L110 20 L200 130 Z" fill="none" {...line('#C29A3E')} />
      <rect x={14} y={124} width={192} height={18} rx={8} fill="#F4DC9C" {...line('#C29A3E')} />
    </g>
  )
}

export function PicnicBlanket() {
  return (
    <g>
      <path d="M60 20 H300 L350 120 H10 Z" fill="#F4D9C6" {...line('#C9967A')} />
      <path d="M140 20 L120 120 M220 20 L240 120" stroke="#E9B9A0" strokeWidth={22} />
      <path d="M40 60 H320 M24 94 H336" stroke="#E9B9A0" strokeWidth={14} />
      <path d="M60 20 H300 L350 120 H10 Z" fill="none" {...line('#C9967A')} />
    </g>
  )
}

export function Sun({ face }: { face?: boolean }) {
  const r = face ? 50 : 44
  const c = face ? 85 : 75
  return (
    <g>
      <g {...line('#D9B45A', 7)}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const t = (a * Math.PI) / 180
          return <path key={a} d={`M${c + Math.cos(t) * (r + 12)} ${c + Math.sin(t) * (r + 12)} L${c + Math.cos(t) * (r + 28)} ${c + Math.sin(t) * (r + 28)}`} />
        })}
      </g>
      <circle cx={c} cy={c} r={r} fill="#F6DE96" {...line('#D9B45A')} />
      {face && (
        <g>
          <Eye x={c - 16} y={c - 6} happy />
          <Eye x={c + 16} y={c - 6} happy />
          <Cheek x={c - 26} y={c + 12} r={8} />
          <Cheek x={c + 26} y={c + 12} r={8} />
          <Smile x={c} y={c + 14} w={12} />
        </g>
      )}
    </g>
  )
}

export function Moon() {
  return (
    <g>
      <path d="M100 10 C50 20 30 70 44 106 C58 140 104 150 138 128 C96 128 70 96 74 62 C78 36 90 20 100 10 Z" fill="#F6DE96" {...line('#D9B45A')} />
      <Eye x={70} y={82} shut r={6} />
      <Cheek x={64} y={100} r={7} />
    </g>
  )
}

export function Rainbow() {
  const cs = ['#E8907E', '#EDB07A', '#EED37E', '#9FCB9A', '#8DB8D8', '#B79BCB']
  return (
    <g>
      {cs.map((c, i) => (
        <path key={c} d={`M${20 + i * 18} 260 A${240 - i * 18} ${240 - i * 18} 0 0 1 ${500 - i * 18} 260`} fill="none" stroke={c} strokeWidth={19} />
      ))}
      <Blob c={[[40, 236, 30], [80, 248, 26], [10, 252, 20]]} fill="#FBF8F2" stroke="#B9C9D3" w={4} />
      <Blob c={[[480, 236, 30], [440, 248, 26], [510, 252, 20]]} fill="#FBF8F2" stroke="#B9C9D3" w={4} />
    </g>
  )
}

export function RainCloud() {
  return (
    <g>
      <g stroke="#8DB8D8" strokeWidth={8} strokeLinecap="round">
        <path d="M80 150 l-10 24 M140 160 l-10 24 M200 150 l-10 24 M110 186 l-8 18 M176 186 l-8 18 M236 172 l-8 18" />
      </g>
      <Blob c={[[80, 100, 46], [150, 70, 60], [222, 96, 50], [150, 116, 40]]} fill="#D8DEE6" stroke="#9CA8B5" />
      <Eye x={130} y={96} shut r={6} />
      <Eye x={170} y={96} shut r={6} />
    </g>
  )
}

export function Cloud({ x, y, k = 1 }: { x: number; y: number; k?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <Blob c={[[0, 10, 26], [32, -6, 32], [66, 10, 26], [33, 18, 24]]} fill="#FBF8F2" stroke="#B9C9D3" w={4} />
    </g>
  )
}
