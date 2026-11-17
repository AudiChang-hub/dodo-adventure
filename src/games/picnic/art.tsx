// 小熊野餐的圖（T-160）：野餐的地方、桌布、盤子、籃子、鈴鐺、選玩法的小圖示，都是自己畫的 SVG；食物是 Fluent Emoji；客人是故事繪本的角色（art/storybook）。
// 背景全部靜止（MOTION-2：等孩子操作的時候只有要看的那一個在動）。
import { memo, useId, type ReactElement } from 'react'
import { EMOJI } from '../../art/emoji.generated'
import { Emoji } from '../../art/Emoji'
import { drawItem } from '../../art/storybook/library'
import { ITEMS } from '../../art/storybook/meta'
import { PICNIC_FOOD_ART } from './food.generated'
import type { BasketId, ClothId, GuestId, PlaceId, PlateId } from './plan'

const INK = '#2E2A25'

// ── 食物 ──────────────────────────────────────────────────────

/** 一個食物：主程式那一套有的用 Emoji，沒有的用野餐自己的（./food.generated.ts） */
export const Food = memo(function Food({ icon }: { icon: string }) {
  if (EMOJI[icon]) return <Emoji name={icon} />
  const e = PICNIC_FOOD_ART[icon]
  if (!e) return null
  return <svg viewBox={`0 0 ${e.w} ${e.h}`} width="100%" height="100%" style={{ display: 'block' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: e.b }} />
})

// ── 客人 ──────────────────────────────────────────────────────

/** 客人的姿勢：繪本裡第一個姿勢（兔子站著、烏龜走路） */
export const guestPose = (who: string) => Object.keys(ITEMS[who]?.poses ?? { stand: 0 })[0]
export const guestBox = (who: string) => ITEMS[who]?.poses[guestPose(who)] ?? { w: 220, h: 220 }

/** 一個角色（腳在下緣、置中）；flip：轉過來面向左邊（看著籃子、看著孩子） */
export const Critter = memo(function Critter({ who, flip }: { who: GuestId | string; flip?: boolean }) {
  const b = guestBox(who)
  const art: ReactElement | null = drawItem(who, guestPose(who))
  return (
    <svg viewBox={`0 0 ${b.w} ${b.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <g transform={flip ? `translate(${b.w} 0) scale(-1 1)` : undefined}>{art}</g>
    </svg>
  )
})

// ── 野餐的地方 ────────────────────────────────────────────────

interface PlaceDef {
  sky: [string, string]
  ground: string
  /** 遠一點的地面（地平線那一條）：沒給就跟 ground 一樣 */
  far?: string
  /** 地平線在畫面多高（0～1） */
  horizon: number
  /** 遠景的東西：Fluent Emoji、位置（畫面的比例）、大小（畫面高的比例） */
  deco: [string, number, number, number][]
  /** 額外畫的（海、湖、山丘、彩虹…） */
  extra?: 'sea' | 'lake' | 'hills' | 'stars'
}

const PLACES: Record<PlaceId, PlaceDef> = {
  park: { sky: ['#CFE6F0', '#E8F3F6'], ground: '#A9CF8E', horizon: 0.4, deco: [['deciduous-tree', 0.06, 0.12, 0.26], ['deciduous-tree', 0.9, 0.16, 0.22], ['sun-with-face', 0.32, 0.03, 0.13], ['cloud', 0.62, 0.06, 0.1]] },
  beach: { sky: ['#BFE3F2', '#E6F4F8'], ground: '#F1DDA8', far: '#7DBBD9', horizon: 0.36, extra: 'sea', deco: [['sailboat', 0.72, 0.17, 0.12], ['sun', 0.1, 0.04, 0.12], ['beach-with-umbrella', 0.9, 0.24, 0.14]] },
  forest: { sky: ['#D8EBD8', '#EEF6EA'], ground: '#8FBF7A', horizon: 0.42, deco: [['evergreen-tree', 0.03, 0.1, 0.3], ['evergreen-tree', 0.15, 0.16, 0.24], ['evergreen-tree', 0.86, 0.12, 0.28], ['mushroom', 0.95, 0.33, 0.08]] },
  garden: { sky: ['#E4F1F6', '#F4F8F1'], ground: '#B5D99A', horizon: 0.4, deco: [['tulip', 0.05, 0.27, 0.12], ['sunflower', 0.13, 0.2, 0.18], ['tulip', 0.92, 0.27, 0.12], ['butterfly', 0.7, 0.08, 0.08], ['blossom', 0.4, 0.3, 0.07]] },
  meadow: { sky: ['#D6ECF7', '#EEF7F9'], ground: '#BFDF9C', horizon: 0.38, deco: [['blossom', 0.08, 0.3, 0.07], ['honeybee', 0.25, 0.1, 0.07], ['cloud', 0.5, 0.05, 0.11], ['blossom', 0.93, 0.3, 0.07], ['seedling', 0.82, 0.3, 0.07]] },
  snow: { sky: ['#DDE8F2', '#F2F6FA'], ground: '#F4F6F8', far: '#E4ECF2', horizon: 0.4, deco: [['snowman', 0.06, 0.16, 0.22], ['evergreen-tree', 0.9, 0.12, 0.26], ['snowflake', 0.35, 0.06, 0.07], ['snowflake', 0.6, 0.12, 0.05]] },
  lake: { sky: ['#CFE6F0', '#EAF4F7'], ground: '#A6CF8C', far: '#8CC4DE', horizon: 0.32, extra: 'lake', deco: [['duck', 0.3, 0.28, 0.08], ['sailboat', 0.62, 0.2, 0.1], ['deciduous-tree', 0.92, 0.12, 0.24]] },
  farm: { sky: ['#D9ECF5', '#F0F6F2'], ground: '#B9D88F', horizon: 0.4, deco: [['house-with-garden', 0.06, 0.16, 0.2], ['tractor', 0.88, 0.24, 0.13], ['sunflower', 0.7, 0.22, 0.14], ['sun', 0.42, 0.03, 0.11]] },
  night: { sky: ['#34446E', '#56679A'], ground: '#5E8A61', horizon: 0.4, extra: 'stars', deco: [['crescent-moon', 0.84, 0.05, 0.14], ['glowing-star', 0.2, 0.08, 0.07], ['star', 0.5, 0.04, 0.05], ['candle', 0.06, 0.28, 0.1]] },
  autumn: { sky: ['#F3E6CF', '#F8F0E2'], ground: '#D9B377', horizon: 0.4, deco: [['deciduous-tree', 0.05, 0.12, 0.26], ['leaf-fluttering-in-wind', 0.3, 0.12, 0.08], ['leaf-fluttering-in-wind', 0.7, 0.2, 0.07], ['mushroom', 0.92, 0.3, 0.09]] },
  rainbow: { sky: ['#DDEFF7', '#F1F8FA'], ground: '#A9D49A', horizon: 0.4, deco: [['rainbow', 0.3, 0.02, 0.3], ['cloud', 0.06, 0.12, 0.12], ['cloud', 0.86, 0.1, 0.1], ['tulip', 0.94, 0.3, 0.09]] },
  hill: { sky: ['#E2F0F7', '#F3F8F8'], ground: '#9CCB7F', far: '#B9DCA0', horizon: 0.42, extra: 'hills', deco: [['house', 0.1, 0.12, 0.13], ['kite', 0.62, 0.04, 0.12], ['deciduous-tree', 0.9, 0.14, 0.2]] },
}

/** 野餐的地方（整個背景，鋪滿；地平線以下是草地、沙灘、雪地…） */
export const PicnicPlace = memo(function PicnicPlace({ id }: { id: PlaceId }) {
  const p = PLACES[id]
  const uid = useId().replace(/:/g, '')
  const W = 1200
  const H = 800
  const hy = p.horizon * H
  return (
    <svg className="pn-place" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={hy + 2} fill={`url(#sky${uid})`} />
      {p.extra === 'stars' && [80, 260, 420, 640, 760, 980, 1120].map((x, i) => <circle key={x} cx={x} cy={40 + ((i * 67) % 200)} r={3 + (i % 3)} fill="#F8EFC8" />)}
      {p.extra === 'hills' && (
        <>
          <ellipse cx={260} cy={hy + 30} rx={420} ry={150} fill={p.far} />
          <ellipse cx={960} cy={hy + 40} rx={460} ry={130} fill={p.far} />
        </>
      )}
      <rect x={0} y={hy} width={W} height={H - hy} fill={p.ground} />
      {p.extra === 'sea' && <rect x={0} y={hy} width={W} height={H * 0.1} fill={p.far} />}
      {p.extra === 'sea' && <path d={`M0 ${hy + H * 0.1} q50 -14 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0`} fill="none" stroke="#FFFFFF" strokeWidth={6} opacity={0.7} />}
      {p.extra === 'lake' && <ellipse cx={420} cy={hy + 34} rx={360} ry={46} fill={p.far} />}
      {p.far && !p.extra && <rect x={0} y={hy} width={W} height={10} fill={p.far} />}
      {p.deco.map(([icon, x, y, s], i) => (
        <svg key={i} x={x * W} y={y * H} width={s * H} height={s * H}>
          <Emoji name={icon} />
        </svg>
      ))}
    </svg>
  )
})

// ── 桌布 ──────────────────────────────────────────────────────

interface ClothDef {
  base: string
  ink: string
  kind: 'check' | 'stripe' | 'dots' | 'plain' | 'stars' | 'hearts' | 'leaf' | 'straw'
}
const CLOTHS: Record<ClothId, ClothDef> = {
  'red-check': { base: '#FFF6EF', ink: '#E0604E', kind: 'check' },
  'blue-check': { base: '#F3F7FC', ink: '#4F7FC2', kind: 'check' },
  'green-check': { base: '#F4FAF1', ink: '#5DAE76', kind: 'check' },
  'yellow-stripe': { base: '#FFF7D6', ink: '#F2C94C', kind: 'stripe' },
  'pink-dots': { base: '#FBE3EA', ink: '#E98FAA', kind: 'dots' },
  'orange-plain': { base: '#F8CB97', ink: '#C9773A', kind: 'plain' },
  'purple-stars': { base: '#E6DDF5', ink: '#9C86C9', kind: 'stars' },
  'mint-hearts': { base: '#DDF2E8', ink: '#6DBE99', kind: 'hearts' },
  'leaf-mat': { base: '#C6E0A6', ink: '#7FAF5E', kind: 'leaf' },
  'straw-mat': { base: '#EBD7A2', ink: '#C3A363', kind: 'straw' },
}

function ClothPattern({ id, d }: { id: string; d: ClothDef }) {
  const s = 64
  return (
    <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse">
      <rect width={s} height={s} fill={d.base} />
      {d.kind === 'check' && (
        <>
          <rect width={s / 2} height={s} fill={d.ink} opacity={0.38} />
          <rect width={s} height={s / 2} fill={d.ink} opacity={0.38} />
        </>
      )}
      {d.kind === 'stripe' && <rect width={s / 2} height={s} fill={d.ink} opacity={0.75} />}
      {d.kind === 'dots' && (
        <>
          <circle cx={16} cy={16} r={7} fill={d.ink} />
          <circle cx={48} cy={48} r={7} fill={d.ink} />
        </>
      )}
      {d.kind === 'plain' && <path d={`M0 6 H${s}`} stroke={d.ink} strokeWidth={3} strokeDasharray="8 8" opacity={0.6} />}
      {d.kind === 'stars' && <path d="M32 14 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1 Z" fill={d.ink} opacity={0.8} />}
      {d.kind === 'hearts' && <path d="M32 46 C14 34 14 18 25 18 C29 18 31 21 32 23 C33 21 35 18 39 18 C50 18 50 34 32 46 Z" fill={d.ink} opacity={0.8} />}
      {d.kind === 'leaf' && (
        <>
          <path d="M8 56 Q8 20 56 8 Q52 52 8 56 Z" fill={d.ink} opacity={0.45} />
          <path d="M10 54 L52 12" stroke={d.ink} strokeWidth={2.5} />
        </>
      )}
      {d.kind === 'straw' && (
        <>
          <path d={`M0 16 H${s} M0 48 H${s}`} stroke={d.ink} strokeWidth={6} opacity={0.6} />
          <path d={`M16 0 V16 M48 16 V48 M16 48 V${s}`} stroke={d.ink} strokeWidth={3} opacity={0.5} />
        </>
      )}
    </pattern>
  )
}

/** 桌布：鋪在地上（前面寬、後面窄一點），花紋看得出不一樣 */
export const Cloth = memo(function Cloth({ id }: { id: ClothId }) {
  const uid = useId().replace(/:/g, '')
  const d = CLOTHS[id]
  return (
    <svg className="pn-cloth" viewBox="0 0 1000 500" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">
      <defs>
        <ClothPattern id={`c${uid}`} d={d} />
      </defs>
      <path d="M70 10 H930 Q950 10 956 30 L996 470 Q998 494 974 494 H26 Q2 494 4 470 L44 30 Q50 10 70 10 Z" fill={`url(#c${uid})`} stroke={d.ink} strokeWidth={6} />
    </svg>
  )
})

// ── 盤子 ──────────────────────────────────────────────────────

/** 盤子（從上面斜斜看下去，扁扁的）：鋪滿給它的框 */
export const Plate = memo(function Plate({ id }: { id: PlateId }) {
  const shape = (() => {
    switch (id) {
      case 'white':
        return (
          <>
            <ellipse cx={200} cy={80} rx={194} ry={74} fill="#FFFFFF" stroke={INK} strokeWidth={5} />
            <ellipse cx={200} cy={82} rx={148} ry={52} fill="#F4F0E8" />
          </>
        )
      case 'blue-rim':
        return (
          <>
            <ellipse cx={200} cy={80} rx={194} ry={74} fill="#FFFFFF" stroke={INK} strokeWidth={5} />
            <ellipse cx={200} cy={80} rx={172} ry={62} fill="none" stroke="#6E9BD1" strokeWidth={9} />
            <ellipse cx={200} cy={82} rx={140} ry={48} fill="#F2F6FB" />
          </>
        )
      case 'leaf':
        return (
          <>
            <path d="M8 84 Q90 -4 250 8 Q360 18 394 80 Q360 146 250 154 Q90 166 8 84 Z" fill="#8CC56F" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
            <path d="M30 84 H370 M120 84 L80 40 M120 84 L80 128 M220 84 L190 34 M220 84 L190 134 M310 84 L290 46 M310 84 L290 122" stroke="#5F9A48" strokeWidth={4} fill="none" strokeLinecap="round" />
          </>
        )
      case 'wood':
        return (
          <>
            <rect x={6} y={12} width={388} height={136} rx={30} fill="#D3A56C" stroke={INK} strokeWidth={5} />
            <path d="M40 50 Q160 36 300 52 M50 90 Q190 104 350 88 M70 122 Q180 112 280 126" stroke="#B4834A" strokeWidth={4} fill="none" strokeLinecap="round" />
          </>
        )
      case 'flower': {
        const pts = Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2
          return `${200 + Math.cos(a) * 186},${80 + Math.sin(a) * 70}`
        })
        return (
          <>
            {pts.map((p, i) => {
              const [x, y] = p.split(',').map(Number)
              return <ellipse key={i} cx={x} cy={y} rx={26} ry={14} fill="#F6C6D4" stroke={INK} strokeWidth={4} />
            })}
            <ellipse cx={200} cy={80} rx={186} ry={70} fill="#F9D9E2" />
            <ellipse cx={200} cy={82} rx={140} ry={48} fill="#FCEAEF" />
          </>
        )
      }
      case 'paper':
        return (
          <>
            <ellipse cx={200} cy={80} rx={194} ry={74} fill="#F7E3A1" stroke={INK} strokeWidth={5} />
            {Array.from({ length: 28 }, (_, i) => {
              const a = (i / 28) * Math.PI * 2
              return <path key={i} d={`M${200 + Math.cos(a) * 150} ${80 + Math.sin(a) * 56} L${200 + Math.cos(a) * 188} ${80 + Math.sin(a) * 71}`} stroke="#DCC07A" strokeWidth={3.5} />
            })}
            <ellipse cx={200} cy={82} rx={146} ry={52} fill="#FBEFC7" />
          </>
        )
      case 'tray':
        return (
          <>
            <rect x={6} y={14} width={388} height={132} rx={18} fill="#9FC3D9" stroke={INK} strokeWidth={5} />
            <rect x={26} y={30} width={348} height={100} rx={12} fill="#C8DFEC" />
            <rect x={-14} y={60} width={26} height={40} rx={8} fill="#9FC3D9" stroke={INK} strokeWidth={5} />
            <rect x={388} y={60} width={26} height={40} rx={8} fill="#9FC3D9" stroke={INK} strokeWidth={5} />
          </>
        )
      case 'basket':
        return (
          <>
            <ellipse cx={200} cy={80} rx={194} ry={74} fill="#D9B26F" stroke={INK} strokeWidth={5} />
            {Array.from({ length: 9 }, (_, i) => (
              <path key={i} d={`M${40 + i * 40} 24 Q${50 + i * 40} 80 ${40 + i * 40} 136`} stroke="#B98E4D" strokeWidth={5} fill="none" />
            ))}
            <ellipse cx={200} cy={82} rx={150} ry={52} fill="#E6C68B" />
          </>
        )
    }
  })()
  return (
    <svg viewBox="-20 0 440 160" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      {shape}
    </svg>
  )
})

// ── 籃子（孩子拿食物的地方） ────────────────────────────────────

export const Basket = memo(function Basket({ id }: { id: BasketId }) {
  const body = (() => {
    switch (id) {
      case 'basket':
        return (
          <>
            <path d="M120 70 Q300 -60 480 70" fill="none" stroke="#B98E4D" strokeWidth={22} strokeLinecap="round" />
            <rect x={10} y={60} width={580} height={330} rx={46} fill="#E2BE7E" stroke={INK} strokeWidth={6} />
            {Array.from({ length: 6 }, (_, i) => (
              <path key={i} d={`M30 ${110 + i * 46} H570`} stroke="#C9A061" strokeWidth={5} />
            ))}
          </>
        )
      case 'box':
        return (
          <>
            <rect x={10} y={40} width={580} height={350} rx={20} fill="#D8A86A" stroke={INK} strokeWidth={6} />
            <path d="M10 160 H590 M10 280 H590" stroke="#B4834A" strokeWidth={6} />
            <rect x={240} y={56} width={120} height={36} rx={18} fill="#B4834A" />
          </>
        )
      case 'bowl':
        return (
          <>
            <path d="M10 80 H590 Q590 390 300 390 Q10 390 10 80 Z" fill="#F2C7A3" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
            <path d="M60 140 Q300 180 540 140" stroke="#E2A57D" strokeWidth={8} fill="none" strokeLinecap="round" />
          </>
        )
      case 'cart':
        return (
          <>
            <rect x={10} y={40} width={580} height={300} rx={28} fill="#E8826F" stroke={INK} strokeWidth={6} />
            <circle cx={120} cy={360} r={36} fill="#5C5650" stroke={INK} strokeWidth={6} />
            <circle cx={480} cy={360} r={36} fill="#5C5650" stroke={INK} strokeWidth={6} />
            <path d="M590 120 H640" stroke={INK} strokeWidth={10} strokeLinecap="round" />
          </>
        )
    }
  })()
  return (
    <svg viewBox="-10 -30 660 440" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      {body}
    </svg>
  )
})

// ── 鈴鐺（「給你」） ──────────────────────────────────────────

/** 櫃台上的服務鈴：金色的圓頂、深色的底座、頂上的小按鈕 */
export function Bell() {
  return (
    <svg viewBox="0 0 120 110" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <g stroke={INK} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
        <rect x={14} y={78} width={92} height={20} rx={8} fill="#7A5A3C" />
        <path d="M22 80 Q22 30 60 30 Q98 30 98 80 Z" fill="#F1C24B" />
        <rect x={52} y={14} width={16} height={18} rx={5} fill="#C99A2E" />
      </g>
      <path d="M38 64 Q40 44 56 40" stroke="#FFF2C2" strokeWidth={6} fill="none" strokeLinecap="round" />
    </svg>
  )
}

// ── 選玩法的小圖示 ─────────────────────────────────────────────

/** 小熊坐在格子桌布上，前面一個盤子放了三顆蘋果 */
export function PicnicPickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <path d="M30 116 H210 L228 184 H12 Z" fill="#FFF6EF" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M48 116 L40 184 M84 116 L80 184 M120 116 V184 M156 116 L160 184 M192 116 L200 184 M24 140 H216 M18 162 H222" stroke="#E0604E" strokeWidth={9} opacity={0.45} />
      <svg x={74} y={14} width={92} height={104}>
        <Critter who="teddy" />
      </svg>
      <ellipse cx={120} cy={150} rx={66} ry={22} fill="#FFFFFF" stroke={INK} strokeWidth={5} />
      {[86, 120, 154].map((x) => (
        <svg key={x} x={x - 16} y={124} width={32} height={32}>
          <Emoji name="red-apple" />
        </svg>
      ))}
    </svg>
  )
}

/** 野餐的地方有幾個（回報、測試用） */
export const PLACE_COUNT = Object.keys(PLACES).length
export const CLOTH_COUNT = Object.keys(CLOTHS).length
