import { DinoArt, type Mood } from '../../art/Dino'
import { Emoji } from '../../art/Emoji'
import { ShapeSvg } from '../../ui/Visual'
import type { Visual } from '../../content/games'

/*
 * 找規律的小火車：豆豆開的火車頭（車頭朝左，往左開）＋一節節車廂。
 * 和恐龍、手同一套紙感粗線條：深色描邊、圓角、平塗。車廂一律同一個顏色，孩子只看車上載的東西。
 */

const INK = '#2E2A25'

function Wheel({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={INK} />
      <circle cx={x} cy={y} r={r * 0.42} fill="#EDE6DA" />
    </g>
  )
}

/** 火車頭：viewBox 176×146，車輪底在最下緣 */
export function LocoArt({ mood = 'happy', puff = false }: { mood?: Mood; puff?: boolean }) {
  const coral = '#E99A84'
  const deep = '#C7735D'
  const s = { stroke: deep, strokeWidth: 4, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 176 146" width="100%" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      {/* 開動時煙囪冒出一團團白煙（往後飄） */}
      {puff &&
        [0, 1, 2].map((i) => <circle key={i} className="pt-puff" cx={43} cy={16} r={11} fill="#FBF8F2" stroke="rgba(46,42,37,0.18)" strokeWidth={3} style={{ animationDelay: `${i * 0.28}s` }} />)}
      {/* 駕駛室的柱子和屋頂（在豆豆後面） */}
      <rect x={104} y={16} width={8} height={70} rx={3} fill={deep} />
      <rect x={158} y={16} width={8} height={70} rx={3} fill={deep} />
      <rect x={96} y={8} width={78} height={14} rx={7} fill={coral} {...s} />
      {/* 豆豆（翻過來，面向左邊開車）；尾巴收在駕駛室裡，不伸到車廂上 */}
      <clipPath id="pt-cab-clip">
        <rect x={86} y={-30} width={90} height={150} />
      </clipPath>
      <g clipPath="url(#pt-cab-clip)">
        <g transform="translate(206 4) scale(-0.5 0.5)">
          <DinoArt who="dodo" mood={mood} />
        </g>
      </g>
      {/* 煙囪 */}
      <path d="M32 66 L34 34 H52 L54 66 Z" fill="#6F8499" stroke="#4F6377" strokeWidth={4} strokeLinejoin="round" />
      <rect x={26} y={24} width={34} height={12} rx={5} fill="#6F8499" stroke="#4F6377" strokeWidth={4} />
      {/* 鍋爐 */}
      <rect x={12} y={64} width={100} height={58} rx={26} fill={coral} {...s} />
      <path d="M44 66 V120 M76 66 V120" stroke={deep} strokeWidth={4} />
      <rect x={24} y={74} width={60} height={9} rx={4.5} fill="#F3C1B2" />
      {/* 車頭燈 */}
      <circle cx={16} cy={86} r={9} fill="#F6DE95" stroke={deep} strokeWidth={3.5} />
      {/* 駕駛室的牆（擋在豆豆前面） */}
      <rect x={100} y={80} width={70} height={44} rx={10} fill={coral} {...s} />
      <rect x={110} y={90} width={50} height={8} rx={4} fill="#F3C1B2" />
      {/* 排障器 */}
      <path d="M14 112 L2 132 H26 Z" fill="#B9AE9C" stroke={INK} strokeWidth={3.5} strokeLinejoin="round" />
      {/* 後面的連結器：接第一節車廂 */}
      <rect x={168} y={108} width={16} height={8} rx={3} fill={INK} />
      <Wheel x={44} y={130} r={14} />
      <Wheel x={80} y={130} r={14} />
      <Wheel x={140} y={128} r={17} />
    </svg>
  )
}

/** 車廂上載的東西：積木（形狀）或圖示 */
export function Cargo({ v }: { v: Visual }) {
  if (v.t === 'shape') return <ShapeSvg shape={v.shape} hex={v.hex} />
  if (v.t === 'emoji') return <Emoji name={v.icon} />
  return null
}

/** 車廂：viewBox 120×110。cargo 畫在車身後面，車身前緣蓋住它的下緣，看起來是「裝在車上」 */
export function WagonArt({ v }: { v?: Visual }) {
  return (
    <div className="pt-wagon">
      {v && (
        <div className="pt-cargo">
          <Cargo v={v} />
        </div>
      )}
      <svg viewBox="0 0 120 110" width="100%" style={{ display: 'block', overflow: 'visible', position: 'relative' }} aria-hidden="true">
        <rect x={-12} y={78} width={22} height={8} rx={3} fill={INK} />
        <rect x={6} y={56} width={108} height={40} rx={11} fill="#F1D27C" stroke="#CFA94E" strokeWidth={4} strokeLinejoin="round" />
        <rect x={16} y={65} width={88} height={7} rx={3.5} fill="#F7E2A6" />
        <Wheel x={32} y={98} r={11} />
        <Wheel x={88} y={98} r={11} />
      </svg>
    </div>
  )
}

/** 空的車廂：跟車廂同形狀、同大小的虛線輪廓（盤點 8-5：空格要用和答案同形狀的虛線輪廓） */
export function EmptyWagonArt() {
  const d = { fill: 'rgba(255,255,255,0.55)', stroke: 'rgba(46,42,37,0.55)', strokeWidth: 4, strokeDasharray: '9 7', strokeLinejoin: 'round' as const }
  return (
    <div className="pt-wagon">
      <svg viewBox="0 0 120 110" width="100%" style={{ display: 'block', overflow: 'visible', position: 'relative' }} aria-hidden="true">
        <rect x={-12} y={78} width={22} height={8} rx={3} fill="none" stroke="rgba(46,42,37,0.4)" strokeWidth={3} strokeDasharray="5 4" />
        {/* 載貨的位置 */}
        <rect x={20} y={4} width={80} height={56} rx={14} {...d} fill="rgba(255,255,255,0.35)" />
        <rect x={6} y={56} width={108} height={40} rx={11} {...d} />
        <circle cx={32} cy={98} r={11} {...d} />
        <circle cx={88} cy={98} r={11} {...d} />
      </svg>
    </div>
  )
}
