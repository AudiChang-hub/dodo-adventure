import type { ReactNode } from 'react'
import { Emoji } from '../../art/Emoji'
import { COLOR_HEX, SMALL, type BinId, type ColorId, type Thing } from './sort-plan'
import type { PatThemeId } from './pattern-plan'

// 邏輯遊戲的圖（T-152）：容器、玩具、珠子、繩子都是自己畫的簡單 SVG，跟恐龍同一套粗線條；其他東西用現成的 Fluent Emoji。
// T-157：多了可以換顏色的衣服、碗盤、玩具車，形狀餅乾，6 種容器（籃子、玩具箱、農場、抽屜、洗碗盆、餅乾罐、車庫），
// 串珠珠的火車車廂、彩旗、糖霜餅乾、花。容器都用不搶顏色的木頭、灰、米色，分顏色時不會變成線索（農場的紅只出現在分種類、大小）。

const INK = '#2E2A25'
const PAPER = '#FBF8F2'
const WICKER = '#E2B97F'
const WICKER_DEEP = '#C9975A'
const DOUGH = '#E3B57B'
const LEAF = '#5DAE76'

const Full = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
    {children}
  </svg>
)

/** 自己畫的、可以換顏色的東西（viewBox 0 0 100 100） */
function ToyBody({ toy, c }: { toy: string; c: string }) {
  const shine = { fill: '#fff', stroke: 'none', opacity: 0.55 }
  switch (toy) {
    case 'ball':
      return (
        <>
          <circle cx={50} cy={52} r={38} fill={c} />
          <path d="M14 46 Q50 66 86 46" fill="none" stroke={PAPER} strokeWidth={7} opacity={0.75} />
          <path d="M14 46 Q50 66 86 46" fill="none" />
          <ellipse cx={36} cy={32} rx={9} ry={6} {...shine} transform="rotate(-28 36 32)" />
        </>
      )
    case 'block':
      return (
        <>
          <path d="M18 34 L34 18 H84 V68 L68 84 H18 Z" fill={c} />
          <path d="M18 34 L34 18 H84 L68 34 Z" fill="#fff" fillOpacity={0.35} />
          <path d="M68 34 L84 18 V68 L68 84 Z" fill={INK} fillOpacity={0.14} />
          <path d="M18 34 H68 V84 M68 34 L84 18" fill="none" />
          <rect x={30} y={46} width={26} height={26} rx={5} fill="none" strokeWidth={3.5} opacity={0.55} />
        </>
      )
    case 'balloon':
      return (
        <>
          <path d="M50 74 Q52 84 46 94" fill="none" strokeWidth={3} />
          <ellipse cx={50} cy={40} rx={28} ry={33} fill={c} />
          <path d="M44 78 L50 72 L56 78 Z" fill={c} />
          <ellipse cx={39} cy={26} rx={6} ry={9} {...shine} transform="rotate(20 39 26)" />
        </>
      )
    case 'car':
      return (
        <>
          <path d="M8 66 Q8 52 20 50 L32 32 Q35 28 41 28 H63 Q69 28 72 33 L82 50 Q92 52 92 66 V72 H8 Z" fill={c} />
          <path d="M36 36 H48 V50 H28 Z M54 36 H64 L72 50 H54 Z" fill={PAPER} strokeWidth={3.5} />
          <circle cx={28} cy={74} r={11} fill={INK} />
          <circle cx={72} cy={74} r={11} fill={INK} />
          <circle cx={28} cy={74} r={4} fill={PAPER} stroke="none" />
          <circle cx={72} cy={74} r={4} fill={PAPER} stroke="none" />
        </>
      )
    case 'sock':
      return (
        <>
          <path d="M34 10 H64 V52 L76 64 Q86 76 74 88 Q64 96 52 86 L38 72 Q34 68 34 60 Z" fill={c} />
          <path d="M34 10 H64 V24 H34 Z" fill="#fff" fillOpacity={0.5} />
          <path d="M52 86 Q60 74 74 88" fill="none" strokeWidth={3.5} opacity={0.6} />
        </>
      )
    case 'shirt':
      return (
        <>
          <path d="M36 16 L22 22 L8 40 L22 50 L28 44 V88 H72 V44 L78 50 L92 40 L78 22 L64 16 Q50 30 36 16 Z" fill={c} />
          <path d="M36 16 Q50 30 64 16" fill="none" stroke={PAPER} strokeWidth={6} opacity={0.6} />
          <path d="M36 16 Q50 30 64 16" fill="none" />
        </>
      )
    case 'hat':
      return (
        <>
          <path d="M18 70 Q18 26 50 26 Q82 26 82 70 Z" fill={c} />
          <rect x={12} y={64} width={76} height={20} rx={8} fill={c} />
          <rect x={12} y={64} width={76} height={20} rx={8} fill="#fff" fillOpacity={0.45} />
          <circle cx={50} cy={20} r={10} fill={c} />
          <path d="M34 34 Q30 50 32 64 M66 34 Q70 50 68 64" fill="none" strokeWidth={3} opacity={0.4} />
        </>
      )
    case 'mitten':
      return (
        <>
          <path d="M32 78 V44 Q32 14 54 14 Q76 14 76 44 V78 Z" fill={c} />
          <path d="M34 58 Q18 56 16 44 Q15 32 26 32 Q32 33 34 42" fill={c} />
          <rect x={28} y={72} width={52} height={18} rx={6} fill={c} />
          <rect x={28} y={72} width={52} height={18} rx={6} fill="#fff" fillOpacity={0.5} />
        </>
      )
    case 'cup':
      return (
        <>
          <path d="M70 40 Q88 40 88 55 Q88 70 70 70" fill="none" strokeWidth={8} />
          <path d="M70 40 Q88 40 88 55 Q88 70 70 70" fill="none" stroke={c} strokeWidth={3} />
          <path d="M18 28 H72 V72 Q72 86 58 86 H32 Q18 86 18 72 Z" fill={c} />
          <ellipse cx={45} cy={28} rx={27} ry={6} fill="#fff" fillOpacity={0.5} />
          <ellipse cx={30} cy={50} rx={5} ry={12} {...shine} />
        </>
      )
    case 'bowl':
      return (
        <>
          <path d="M10 44 H90 Q88 82 50 84 Q12 82 10 44 Z" fill={c} />
          <path d="M38 84 H62 L60 92 H40 Z" fill={c} />
          <ellipse cx={50} cy={44} rx={40} ry={9} fill="#fff" fillOpacity={0.55} />
          <path d="M22 56 Q26 70 38 76" fill="none" stroke="#fff" strokeWidth={4} opacity={0.5} />
        </>
      )
    case 'plate':
      return (
        <>
          <ellipse cx={50} cy={58} rx={44} ry={30} fill={c} />
          <ellipse cx={50} cy={56} rx={28} ry={17} fill="#fff" fillOpacity={0.5} strokeWidth={3} />
        </>
      )
    case 'spoon':
      return (
        <g transform="rotate(-28 50 50)">
          <rect x={44} y={42} width={12} height={52} rx={6} fill={c} />
          <ellipse cx={50} cy={26} rx={18} ry={22} fill={c} />
          <ellipse cx={45} cy={22} rx={5} ry={9} {...shine} />
        </g>
      )
    default:
      return null
  }
}

/** 形狀餅乾：麵糰外圈、糖霜是 color；樣品（沒有 color）只有線條 */
function CookieShape({ shape, color }: { shape: string; color?: ColorId }) {
  const ice = color ? COLOR_HEX[color] : PAPER
  const dots = color ? (
    <g fill="#fff" stroke="none" opacity={0.85}>
      <circle cx={42} cy={50} r={2.6} />
      <circle cx={56} cy={60} r={2.6} />
      <circle cx={52} cy={44} r={2.6} />
    </g>
  ) : null
  if (shape === 'circle')
    return (
      <>
        <circle cx={50} cy={52} r={40} fill={DOUGH} />
        <circle cx={50} cy={52} r={28} fill={ice} strokeWidth={3.5} />
        {dots}
      </>
    )
  if (shape === 'square')
    return (
      <>
        <rect x={12} y={14} width={76} height={76} rx={12} fill={DOUGH} />
        <rect x={24} y={26} width={52} height={52} rx={6} fill={ice} strokeWidth={3.5} />
        {dots}
      </>
    )
  return (
    <>
      <path d="M50 8 L92 86 H8 Z" fill={DOUGH} />
      <path d="M50 32 L74 76 H26 Z" fill={ice} strokeWidth={3.5} />
      {dots}
    </>
  )
}

/** 一個東西（viewBox 0 0 100 100），放在 100%×100% 的格子裡 */
export function ThingArt({ thing }: { thing: Thing }) {
  if (thing.t === 'emoji') {
    const s = thing.scale ?? 1
    // 小的畫在格子的正中下方（像放在地上），大小差一眼看得出來
    return (
      <Full>
        <svg x={50 - 44 * s} y={94 - 88 * s} width={88 * s} height={88 * s}>
          <Emoji name={thing.icon} />
        </svg>
      </Full>
    )
  }
  return (
    <Full>
      <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round">
        {thing.t === 'toy' && <ToyBody toy={thing.toy} c={COLOR_HEX[thing.color]} />}
        {thing.t === 'swatch' && (
          // 一團顏料：不是哪一種東西，只告訴他「這個顏色」
          <path
            d="M50 12 C66 10 74 22 84 26 C94 32 92 48 88 58 C84 70 90 82 76 88 C62 94 52 86 40 88 C26 90 12 82 12 66 C12 54 6 44 14 32 C22 18 36 14 50 12 Z"
            fill={COLOR_HEX[thing.color]}
          />
        )}
        {thing.t === 'shape' && thing.look === 'cookie' && <CookieShape shape={thing.shape} color={thing.color} />}
        {thing.t === 'shape' && !thing.look && thing.shape === 'circle' && <circle cx={50} cy={52} r={36} fill={thing.color ? COLOR_HEX[thing.color] : PAPER} strokeWidth={thing.color ? 4.5 : 6} />}
        {thing.t === 'shape' && !thing.look && thing.shape === 'square' && <rect x={17} y={19} width={66} height={66} rx={6} fill={thing.color ? COLOR_HEX[thing.color] : PAPER} strokeWidth={thing.color ? 4.5 : 6} />}
        {thing.t === 'shape' && !thing.look && thing.shape === 'triangle' && <path d="M50 12 L88 84 H12 Z" fill={thing.color ? COLOR_HEX[thing.color] : PAPER} strokeWidth={thing.color ? 4.5 : 6} />}
      </g>
    </Full>
  )
}

// ── 容器（viewBox 0 0 240 210）────────────────────────────────

/**
 * 每一種容器：back 畫在收好的東西後面（農場的穀倉、車庫的房子），front 是前面那一面（東西的下半截被它擋住），
 * lid 是一局收完蓋上的蓋子。前面都有一個圓牌子（120,138），裡面是樣品。
 */
const BINS: Record<BinId, { back?: ReactNode; front: ReactNode; lid: ReactNode }> = {
  basket: {
    front: (
      <>
        <path d="M22 66 H218 L196 196 Q194 204 186 204 H54 Q46 204 44 196 Z" fill={WICKER} />
        {/* 編織的紋路 */}
        <path d="M30 104 H210 M36 142 H204 M42 178 H198" fill="none" stroke={WICKER_DEEP} strokeWidth={4} />
        {[70, 100, 140, 170].map((x) => (
          <path key={x} d={`M${x} 70 L${x + (x < 120 ? 6 : -6)} 200`} fill="none" stroke={WICKER_DEEP} strokeWidth={4} />
        ))}
        <rect x={12} y={52} width={216} height={24} rx={12} fill={WICKER_DEEP} />
      </>
    ),
    lid: (
      <g>
        <path d="M14 54 Q120 6 226 54 Z" fill={WICKER} />
        <path d="M104 26 Q120 12 136 26" fill="none" strokeWidth={6} />
      </g>
    ),
  },
  // 玩具箱：淺色木板釘成的箱子
  toybox: {
    front: (
      <>
        <path d="M24 66 H216 V196 Q216 204 208 204 H32 Q24 204 24 196 Z" fill="#EDD3A8" />
        <path d="M24 108 H216 M24 150 H216" fill="none" stroke="#C99E66" strokeWidth={4} />
        <path d="M24 66 H44 V204 M196 66 H216 V204" fill="#D9B47E" />
        <rect x={16} y={54} width={208} height={22} rx={6} fill="#C99E66" />
      </>
    ),
    lid: (
      <g>
        <path d="M14 56 Q14 26 44 26 H196 Q226 26 226 56 Z" fill="#D9B47E" />
        <rect x={104} y={16} width={32} height={14} rx={6} fill="#C99E66" />
      </g>
    ),
  },
  // 農場：後面一間穀倉，前面一圈木頭圍欄
  barn: {
    back: (
      <g stroke={INK} strokeWidth={5} strokeLinejoin="round">
        <path d="M44 70 V22 L120 -14 L196 22 V70 Z" fill="#C8604C" />
        <path d="M96 70 V34 H144 V70" fill="#7A3B2E" />
        <path d="M44 22 L120 -14 L196 22" fill="none" stroke={PAPER} strokeWidth={4} />
      </g>
    ),
    front: (
      <>
        <rect x={16} y={64} width={208} height={140} rx={10} fill="#F1DDBA" />
        <path d="M16 100 H224 M16 168 H224" fill="none" stroke="#C99E66" strokeWidth={8} />
        {[40, 200].map((x) => (
          <rect key={x} x={x - 9} y={54} width={18} height={150} rx={5} fill="#D9B47E" />
        ))}
      </>
    ),
    lid: (
      <g>
        <rect x={14} y={34} width={212} height={32} rx={10} fill="#D9B47E" />
        <path d="M30 50 H210" fill="none" stroke="#C99E66" strokeWidth={5} />
      </g>
    ),
  },
  // 抽屜：拉開的那一格
  drawer: {
    back: (
      <g stroke={INK} strokeWidth={5} strokeLinejoin="round">
        <rect x={30} y={8} width={180} height={64} rx={8} fill="#E6D6BE" />
      </g>
    ),
    front: (
      <>
        <rect x={18} y={60} width={204} height={144} rx={12} fill="#F4EADB" />
        <rect x={30} y={72} width={180} height={120} rx={8} fill="none" stroke="#D7C3A4" strokeWidth={4} />
        <rect x={12} y={54} width={216} height={18} rx={8} fill="#D7C3A4" />
        <circle cx={58} cy={178} r={7} fill="#C99E66" />
        <circle cx={182} cy={178} r={7} fill="#C99E66" />
      </>
    ),
    lid: (
      <g>
        <rect x={12} y={30} width={216} height={34} rx={10} fill="#E6D6BE" />
        <circle cx={120} cy={47} r={6} fill="#C99E66" />
      </g>
    ),
  },
  // 洗碗盆：淺灰藍的大盆子
  tub: {
    front: (
      <>
        <path d="M20 66 H220 L202 190 Q200 204 186 204 H54 Q40 204 38 190 Z" fill="#DCE6E8" />
        <path d="M34 120 Q60 110 82 120 M156 120 Q180 110 206 120" fill="none" stroke="#B9CBD0" strokeWidth={4} />
        <rect x={12} y={54} width={216} height={22} rx={11} fill="#B9CBD0" />
      </>
    ),
    lid: (
      <g>
        <path d="M18 56 Q120 14 222 56 Z" fill="#B9CBD0" />
        <circle cx={120} cy={26} r={9} fill="#DCE6E8" />
      </g>
    ),
  },
  // 餅乾罐：玻璃罐、木頭蓋
  jar: {
    front: (
      <>
        <path d="M42 62 H198 Q214 62 214 80 V186 Q214 204 196 204 H44 Q26 204 26 186 V80 Q26 62 42 62 Z" fill="#E4EEF0" />
        <path d="M44 84 V176" fill="none" stroke="#fff" strokeWidth={8} opacity={0.8} />
        <rect x={36} y={50} width={168} height={22} rx={8} fill="#D7C3A4" />
      </>
    ),
    lid: (
      <g>
        <rect x={30} y={26} width={180} height={30} rx={10} fill="#C99E66" />
        <rect x={104} y={12} width={32} height={18} rx={8} fill="#C99E66" />
      </g>
    ),
  },
  // 車庫：後面一間灰色的房子、前面一道矮牆
  garage: {
    back: (
      <g stroke={INK} strokeWidth={5} strokeLinejoin="round">
        <path d="M36 72 V14 L120 -10 L204 14 V72 Z" fill="#C9C6BF" />
        <rect x={64} y={24} width={112} height={48} fill="#6E6A63" />
        <path d="M64 38 H176 M64 52 H176" fill="none" stroke="#8C877E" strokeWidth={4} />
      </g>
    ),
    front: (
      <>
        <rect x={14} y={60} width={212} height={144} rx={10} fill="#E3E0DA" />
        <path d="M14 78 H226" fill="none" stroke="#B8B3AA" strokeWidth={6} />
        <path d="M40 190 H76 M102 190 H138 M164 190 H200" fill="none" stroke="#fff" strokeWidth={6} />
      </>
    ),
    lid: (
      <g>
        <rect x={20} y={20} width={200} height={44} rx={8} fill="#C9C6BF" />
        <path d="M30 34 H210 M30 48 H210" fill="none" stroke="#8C877E" strokeWidth={4} />
      </g>
    ),
  },
}

/**
 * 容器（viewBox 0 0 240 210）：前面掛一個圓牌子，裡面是樣品（這個容器收什麼）；收好的東西從上面露出來，越收越多。
 * closed：一局收完，蓋子蓋起來。
 */
export function BinArt({ bin, sample, inside, closed }: { bin: BinId; sample: Thing; inside: Thing[]; closed?: boolean }) {
  const b = BINS[bin]
  return (
    <svg viewBox="0 0 240 210" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }} data-bin={bin}>
      {b.back}
      {/* 收好的東西：排在容器口後面，下半截被前面擋住 */}
      {!closed &&
        inside.map((t, i) => {
          const x = 34 + ((i * 58) % 174)
          const y = 6 - Math.floor(i / 3) * 10
          return (
            <svg key={i} x={x} y={y} width={78} height={78} style={{ overflow: 'visible' }}>
              <ThingArt thing={t} />
            </svg>
          )
        })}
      <g stroke={INK} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
        {b.front}
        {/* 牌子 */}
        <circle cx={120} cy={138} r={48} fill={PAPER} />
        {closed && b.lid}
      </g>
      <svg x={84} y={102} width={72} height={72} style={{ overflow: 'visible' }}>
        <ThingArt thing={sample} />
      </svg>
    </svg>
  )
}

/** 籃子（T-152 原本的名字）：BinArt 的 basket */
export function BasketArt(p: { sample: Thing; inside: Thing[]; closed?: boolean }) {
  return <BinArt bin="basket" {...p} />
}

/** 一顆珠子（viewBox 0 0 100 100）：顏色珠子是圓珠中間穿線的洞；東西是木頭圓珠上畫著那個東西 */
export function BeadArt({ thing }: { thing: Thing }) {
  if (thing.t === 'toy') {
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
        <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round">
          <circle cx={50} cy={50} r={40} fill={COLOR_HEX[thing.color]} />
          <ellipse cx={50} cy={50} rx={9} ry={9} fill={INK} fillOpacity={0.55} stroke="none" />
          <ellipse cx={34} cy={30} rx={10} ry={6} fill="#fff" stroke="none" opacity={0.55} transform="rotate(-30 34 30)" />
        </g>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={50} cy={50} r={42} fill="#F3E3C6" stroke={INK} strokeWidth={4.5} />
      <svg x={18} y={18} width={64} height={64}>
        <ThingArt thing={thing} />
      </svg>
    </svg>
  )
}

/** 一個 emoji 放在 viewBox 0 0 100 100 的某個方框裡 */
const EmojiAt = ({ thing, x, y, s }: { thing: Thing; x: number; y: number; s: number }) => (
  <svg x={x} y={y} width={s} height={s} style={{ overflow: 'visible' }}>
    <ThingArt thing={thing} />
  </svg>
)

/**
 * 串珠珠的一格（viewBox 0 0 100 100），樣子跟著串的東西（T-157）：
 * 項鍊的珠子、火車車廂（顏色：客車；東西：載著它的木頭車）、彩旗、糖霜餅乾、花（顏色：花瓣），排隊的小動物就是 emoji。
 */
export function PatternArt({ theme, thing }: { theme: PatThemeId; thing: Thing }) {
  const color = thing.t === 'toy' ? COLOR_HEX[thing.color] : null
  if (theme === 'necklace') return <BeadArt thing={thing} />
  if (theme === 'train')
    return (
      <Full>
        <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round">
          {color ? (
            <>
              <rect x={6} y={22} width={88} height={54} rx={10} fill={color} />
              <rect x={16} y={32} width={28} height={22} rx={5} fill={PAPER} strokeWidth={3.5} />
              <rect x={56} y={32} width={28} height={22} rx={5} fill={PAPER} strokeWidth={3.5} />
              <rect x={2} y={16} width={96} height={10} rx={5} fill={color} />
            </>
          ) : (
            <>
              {/* 載的東西不能在描線的 g 裡（會被描上粗黑線），用 stroke none 蓋掉 */}
              <g stroke="none">
                <EmojiAt thing={thing} x={20} y={-4} s={60} />
              </g>
              <path d="M6 46 H94 V76 H6 Z" fill="#D9B47E" />
              <path d="M6 61 H94" fill="none" stroke="#B88A55" strokeWidth={4} />
            </>
          )}
          <circle cx={26} cy={82} r={10} fill={INK} />
          <circle cx={74} cy={82} r={10} fill={INK} />
        </g>
      </Full>
    )
  if (theme === 'flags')
    return (
      <Full>
        <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round">
          <path d="M8 6 H92 L50 94 Z" fill={color ?? PAPER} />
          {color && <path d="M22 6 L50 66 L78 6" fill="none" stroke="#fff" strokeWidth={4} opacity={0.35} />}
        </g>
        {!color && <EmojiAt thing={thing} x={28} y={12} s={44} />}
      </Full>
    )
  if (theme === 'cookies' && color)
    return (
      <Full>
        <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round">
          <circle cx={50} cy={50} r={42} fill={DOUGH} />
          <path d="M50 20 C66 18 80 30 78 48 C80 66 66 80 50 78 C34 80 20 68 22 50 C20 32 34 20 50 20 Z" fill={color} strokeWidth={3.5} />
          <g fill="#fff" stroke="none" opacity={0.85}>
            <rect x={38} y={38} width={8} height={3.5} rx={1.75} transform="rotate(30 42 40)" />
            <rect x={56} y={54} width={8} height={3.5} rx={1.75} transform="rotate(-20 60 56)" />
            <rect x={44} y={60} width={8} height={3.5} rx={1.75} transform="rotate(70 48 62)" />
            <rect x={58} y={36} width={8} height={3.5} rx={1.75} transform="rotate(-60 62 38)" />
          </g>
        </g>
      </Full>
    )
  if (theme === 'garden' && color)
    return (
      <Full>
        <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round">
          <path d="M50 54 V96" fill="none" stroke={INK} strokeWidth={9} />
          <path d="M50 54 V96" fill="none" stroke={LEAF} strokeWidth={4} />
          <path d="M50 82 Q34 70 26 78 Q36 90 50 84 Z" fill={LEAF} strokeWidth={3.5} />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx={50} cy={20} rx={13} ry={17} fill={color} transform={`rotate(${a} 50 38)`} />
          ))}
          <circle cx={50} cy={38} r={11} fill="#8C5A2B" />
        </g>
      </Full>
    )
  return <ThingArt thing={thing} />
}

/** 火車頭（串珠珠火車那一串最前面，不能點，只是裝飾） */
export function EngineArt() {
  return (
    <svg viewBox="0 0 120 100" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <g stroke={INK} strokeWidth={4.5} strokeLinejoin="round">
        <rect x={20} y={6} width={16} height={22} rx={3} fill="#6E6A63" />
        <path d="M12 76 V44 Q12 34 22 34 H68 V76 Z" fill="#6E6A63" />
        <rect x={64} y={14} width={46} height={62} rx={8} fill="#8C877E" />
        <rect x={74} y={24} width={26} height={22} rx={4} fill={PAPER} strokeWidth={3.5} />
        <path d="M4 76 L12 62 V76 Z" fill="#8C877E" />
        <circle cx={32} cy={82} r={11} fill={INK} />
        <circle cx={88} cy={82} r={11} fill={INK} />
      </g>
    </svg>
  )
}

/** 選玩法的圖示：籃子裡有幾樣收好的東西（豆豆收拾） */
export function SortPickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <svg x={30} y={0} width={180} height={190}>
        <BasketArt
          sample={{ t: 'swatch', color: 'red' }}
          inside={[
            { t: 'toy', toy: 'ball', color: 'red' },
            { t: 'emoji', icon: 'red-apple' },
            { t: 'toy', toy: 'block', color: 'red' },
          ]}
        />
      </svg>
    </svg>
  )
}

/** 選玩法的圖示：一條繩子串著紅藍紅藍的珠子（串珠珠） */
export function PatternPickArt() {
  const cs = ['red', 'blue', 'red', 'blue'] as const
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <path d="M14 70 Q120 190 226 70" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      {cs.map((c, i) => {
        const t = (i + 1) / 5
        const x = 14 + 212 * t
        const y = 70 + 240 * t * (1 - t) - 26
        return (
          <svg key={i} x={x - 26} y={y} width={52} height={52}>
            <BeadArt thing={{ t: 'toy', toy: 'ball', color: c }} />
          </svg>
        )
      })}
    </svg>
  )
}

/** 一局再玩一次的小圖示（DoneChoices 的「再一局」） */
export function AgainArt({ children }: { children: ReactNode }) {
  return <span className="lg-again-art">{children}</span>
}

export { SMALL }
