import type { CSSProperties, ReactNode } from 'react'
import { Emoji } from '../art/Emoji'
import { Dino } from '../art/Dino'
import { THEMES, type ThemeId } from '../content/themes'
import { houseItem, type RoomId } from '../content/story'
import { StoryPic } from './StoryPic'
import { Sparkles } from './Sparkles'

// 魔法屋的剖面圖（docs/故事世界.md §1）：像娃娃屋拿掉前面那面牆。
// 二樓：臥室、廚房、書房、畫室；一樓：車庫、門廊（12 扇魔法門）、客廳；右邊是院子。
// 座標都在 1200×786 的畫布上（跟路線圖一樣），HTML 的東西（圖示、恐龍）用百分比疊在 SVG 上，任何大小都對得齊。
// 靜止不動：畫面靜止時不留循環動畫（MOTION-2）；新加的東西只有一圈靜態的光。

const INK = '#2E2A25'
const PAPER = '#FBF8F2'
const W = 1200
const H = 786

/** 每個房間的框（x、y、寬、高）和牆的顏色 */
export const ROOM_BOX: Record<RoomId, { x: number; y: number; w: number; h: number; wall: string }> = {
  bedroom: { x: 150, y: 222, w: 215, h: 222, wall: '#E7EEF4' },
  kitchen: { x: 365, y: 222, w: 215, h: 222, wall: '#F5EEDC' },
  book: { x: 580, y: 222, w: 215, h: 222, wall: '#EFE6D3' },
  art: { x: 795, y: 222, w: 215, h: 222, wall: '#F3E6EC' },
  garage: { x: 150, y: 456, w: 240, h: 240, wall: '#E9E6DF' },
  hall: { x: 390, y: 456, w: 380, h: 240, wall: '#F6F0E2' },
  living: { x: 770, y: 456, w: 240, h: 240, wall: '#EAF1E6' },
  yard: { x: 1010, y: 456, w: 180, h: 240, wall: 'transparent' },
}

/** 新加的東西放在房間的哪裡（相對畫布的中心點、寬度） */
const ITEM_AT: Record<string, { x: number; y: number; w: number }> = {
  'egg-nest': { x: 952, y: 626, w: 112 },
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`
/** 一個 HTML 的東西：中心在 (x, y)、寬 w（畫布座標） */
const at = (x: number, y: number, w: number): CSSProperties => ({ position: 'absolute', left: pct(x - w / 2, W), top: pct(y - w / 2, H), width: pct(w, W) })
/** 底邊站在 y 上（恐龍、家具） */
const stand = (x: number, y: number, w: number, h: number): CSSProperties => ({ position: 'absolute', left: pct(x - w / 2, W), top: pct(y - h, H), width: pct(w, W) })

/** 12 扇魔法門：兩排、每排 6 扇，顏色和圖跟著門後的主題（故事世界 §1.3） */
const DOOR_W = 44
const DOOR_H = 70
const doorAt = (i: number) => ({ x: 412 + (i % 6) * 58, y: i < 6 ? 486 : 588 })

interface Props {
  /** 亮著的房間（開場在門廊、故事時間在書房、結尾在客廳）；其他房間淡一點 */
  focus?: RoomId | null
  /** 今天打開的那一扇門 */
  door?: ThemeId | null
  /** 魔法屋多了的東西（house.ts 的 id，只會變多） */
  items: string[]
  /** 剛加進來的那一樣：外面一圈靜態的光 */
  fresh?: string | null
  /** 住進魔法屋的朋友（孵出來的），在院子 */
  friends?: string[]
  /** 新東西加進來的那一刻（冒險的結尾）：小星星炸開一次；魔法屋畫面只有靜態的光 */
  celebrate?: boolean
  /** 恐龍在不在家（冒險的開場、結尾由旁白卡上的恐龍說話，屋裡就不另外畫） */
  dinos?: boolean
  /** 點書房：打開我的故事書 */
  onBook?: () => void
  children?: ReactNode
}

export function MagicHouseArt({ focus, door, items, fresh, celebrate, friends = [], dinos = true, onBook, children }: Props) {
  const dim = (r: RoomId) => (focus && focus !== r ? 0.42 : 1)
  const fb = focus ? ROOM_BOX[focus] : null
  return (
    <div className="house-stage">
      <svg viewBox={`0 0 ${W} ${H}`} className="house-svg" aria-hidden="true">
        {/* 地面 */}
        <path d="M0 700 Q600 680 1200 700 V786 H0 Z" fill="#DCE8D2" />
        {/* 屋頂、煙囪、閣樓的圓窗（第一部講完才會有閣樓） */}
        <path d="M842 120 V60 H896 V150 Z" fill="#D9A891" stroke={INK} strokeOpacity={0.5} strokeWidth={4} strokeLinejoin="round" />
        <path d="M120 226 L580 54 L1040 226 Z" fill="#E7B9A2" stroke={INK} strokeOpacity={0.55} strokeWidth={5} strokeLinejoin="round" />
        <path d="M168 210 L580 70 L992 210" fill="none" stroke="#F3D7C6" strokeWidth={6} strokeLinecap="round" />
        <circle cx={580} cy={150} r={34} fill={PAPER} stroke={INK} strokeOpacity={0.45} strokeWidth={4} />
        <path d="M580 118 V182 M548 150 H612" stroke={INK} strokeOpacity={0.35} strokeWidth={3} />
        {/* 外牆 */}
        <rect x={140} y={214} width={880} height={492} rx={10} fill="#F1E3CC" stroke={INK} strokeOpacity={0.55} strokeWidth={5} />
        {(Object.entries(ROOM_BOX) as [RoomId, (typeof ROOM_BOX)[RoomId]][])
          .filter(([id]) => id !== 'yard')
          .map(([id, b]) => (
            <g key={id} opacity={dim(id)} style={{ transition: 'opacity .5s' }}>
              <rect x={b.x + 6} y={b.y + 6} width={b.w - 12} height={b.h - 12} rx={6} fill={b.wall} />
              {/* 地板 */}
              <rect x={b.x + 6} y={b.y + b.h - 26} width={b.w - 12} height={20} rx={4} fill="#E2CFAE" />
            </g>
          ))}
        {/* 亮著的房間：一圈暖暖的燈光框（靜態） */}
        {fb && focus !== 'yard' && <rect x={fb.x + 3} y={fb.y + 3} width={fb.w - 6} height={fb.h - 6} rx={8} fill="none" stroke="#F1D27C" strokeWidth={8} />}
        {/* 樓板 */}
        <rect x={140} y={444} width={880} height={14} fill="#D8C2A0" />

        <g opacity={dim('bedroom')}>
          {/* 四張床：豆豆、波波、莫莫，還有孩子的（黃色那張） */}
          {[
            ['#8FCBAA', 168],
            ['#F0B088', 218],
            ['#A3C4E4', 268],
            ['#F1D27C', 318],
          ].map(([c, x]) => (
            <g key={x as number} transform={`translate(${x} 362)`}>
              <rect x={0} y={20} width={40} height={36} rx={6} fill={c as string} stroke={INK} strokeOpacity={0.4} strokeWidth={3} />
              <rect x={4} y={10} width={20} height={14} rx={6} fill={PAPER} stroke={INK} strokeOpacity={0.3} strokeWidth={2.5} />
              <rect x={-2} y={0} width={6} height={58} rx={3} fill="#C9A57E" />
            </g>
          ))}
          {/* 窗外的月亮 */}
          <rect x={214} y={250} width={84} height={64} rx={8} fill="#DCE3EE" stroke={INK} strokeOpacity={0.4} strokeWidth={3.5} />
          <path d="M262 266 a16 16 0 1 0 12 26 a13 13 0 1 1 -12 -26 Z" fill="#F6DE95" />
        </g>
        <g opacity={dim('kitchen')}>
          {/* 窗戶、餐桌 */}
          <rect x={432} y={250} width={80} height={64} rx={8} fill="#DDEBF3" stroke={INK} strokeOpacity={0.4} strokeWidth={3.5} />
          <path d="M472 250 V314 M432 282 H512" stroke={INK} strokeOpacity={0.3} strokeWidth={3} />
          <rect x={404} y={378} width={136} height={12} rx={5} fill="#C9A57E" />
          <rect x={418} y={388} width={8} height={30} fill="#C9A57E" />
          <rect x={518} y={388} width={8} height={30} fill="#C9A57E" />
        </g>
        <g opacity={dim('book')}>
          {/* 莫莫的舊書架：故事書就在這裡 */}
          <rect x={608} y={252} width={112} height={164} rx={6} fill="#C9A57E" stroke={INK} strokeOpacity={0.45} strokeWidth={3.5} />
          {[0, 1, 2].map((r) => (
            <g key={r}>
              <rect x={614} y={300 + r * 50} width={100} height={6} fill="#A9865E" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <rect key={i} x={618 + i * 16} y={262 + r * 50 - (i % 3) * 3} width={12} height={38 + (i % 3) * 3} rx={2} fill={['#E8907E', '#9FCB9A', '#8DB8D8', '#EED37E', '#B79BCB', '#EDB07A'][(i + r) % 6]} />
              ))}
            </g>
          ))}
        </g>
        <g opacity={dim('art')}>
          {/* 畫架 */}
          <path d="M860 420 L890 282 L920 420 M890 282 V430" stroke="#A9865E" strokeWidth={7} strokeLinecap="round" fill="none" />
        </g>
        <g opacity={dim('garage')}>
          <path d="M150 470 H390" stroke="#C7C0B4" strokeWidth={10} />
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M162 ${486 + i * 18} H378`} stroke="#DAD5CC" strokeWidth={4} />
          ))}
        </g>
        <g opacity={dim('hall')}>
          {/* 12 扇魔法門排成兩排；今天打開的那扇門開著、裡面透出門後的顏色 */}
          {THEMES.map((t, i) => {
            const p = doorAt(i)
            const open = t.id === door
            return (
              <g key={t.id} transform={`translate(${p.x} ${p.y})`}>
                <path d={`M0 ${DOOR_H} V22 Q0 0 ${DOOR_W / 2} 0 Q${DOOR_W} 0 ${DOOR_W} 22 V${DOOR_H} Z`} fill={open ? t.tint : t.deep} stroke={INK} strokeOpacity={0.5} strokeWidth={3} />
                {open ? (
                  // 開著的門：門板轉到一邊（畫成窄窄的一片）
                  <path d={`M0 ${DOOR_H} V22 Q0 4 12 2 V${DOOR_H + 4} Z`} fill={t.deep} stroke={INK} strokeOpacity={0.5} strokeWidth={3} />
                ) : (
                  <circle cx={DOOR_W - 9} cy={44} r={3.5} fill={PAPER} />
                )}
              </g>
            )
          })}
        </g>
        <g opacity={dim('living')}>
          {/* 牆上的地圖框 */}
          <rect x={800} y={486} width={86} height={60} rx={6} fill={PAPER} stroke={INK} strokeOpacity={0.4} strokeWidth={3} />
        </g>
        {/* 院子：一棵小樹 */}
        <path d="M1100 700 V610" stroke="#A9865E" strokeWidth={12} strokeLinecap="round" />
        <circle cx={1100} cy={580} r={52} fill="#BFDCC8" />
        <circle cx={1070} cy={600} r={30} fill="#A9D0B5" />
        {/* 正門 */}
        <rect x={540} y={696} width={80} height={14} rx={4} fill="#D8C2A0" />
      </svg>

      {/* 門上的小圖：看門就知道今天去哪裡（只是畫，不能點：門太小，三歲點不準，TOUCH-1） */}
      {THEMES.map((t, i) => {
        const p = doorAt(i)
        return (
          <div key={t.id} className="house-door" style={{ ...at(p.x + DOOR_W / 2, p.y + DOOR_H / 2 + 4, DOOR_W + 10), opacity: dim('hall'), aspectRatio: `${DOOR_W + 10} / ${DOOR_H + 12}` }} aria-hidden="true">
            <Emoji name={t.icon} size="62%" />
          </div>
        )
      })}

      {/* 家具和裝飾（Fluent Emoji） */}
      <div style={{ ...stand(890, 682, 120, 100), opacity: dim('living') }}>
        <Emoji name="couch-and-lamp" />
      </div>
      <div style={{ ...at(843, 516, 50), opacity: dim('living') }}>
        <Emoji name="world-map" />
      </div>
      <div style={{ ...stand(470, 380, 44, 44), opacity: dim('kitchen') }}>
        <Emoji name="red-apple" />
      </div>
      <div style={{ ...stand(744, 428, 60, 60), opacity: dim('book') }}>
        <Emoji name="open-book" />
      </div>
      <div style={{ ...at(890, 320, 76), opacity: dim('art') }}>
        <Emoji name="framed-picture" />
      </div>
      <div style={{ ...stand(960, 428, 42, 42), opacity: dim('art') }}>
        <Emoji name="crayon" />
      </div>
      {/* 車庫：紅色小車（豆豆）、藍色吉普車（波波）、黃色公車（莫莫） */}
      {[
        ['automobile', 196, 66],
        ['sport-utility-vehicle', 270, 72],
        ['bus', 346, 72],
      ].map(([n, x, w]) => (
        <div key={n as string} style={{ ...stand(x as number, 684, w as number, w as number), opacity: dim('garage') }}>
          <Emoji name={n as string} />
        </div>
      ))}

      {/* 多出來的東西：只會變多 */}
      {items.map((id) => {
        const it = houseItem(id)
        const p = ITEM_AT[id]
        if (!it || !p) return null
        return (
          <div key={id} className={`house-item${id === fresh ? ' is-fresh' : ''}`} style={{ ...at(p.x, p.y, p.w), opacity: dim(it.room) }} aria-hidden="true">
            <StoryPic pic={it.pic} />
            {/* 剛加進來的那一下：小星星炸開一次（一次性的獎勵動畫，≤ 1 秒，FB-4） */}
            {id === fresh && celebrate && <Sparkles count={12} />}
          </div>
        )
      })}

      {/* 院子裡的朋友（孵出來的，最多 6 位） */}
      {friends.slice(-6).map((f, i) => (
        <div key={f} style={stand(1040 + (i % 3) * 52, 700 - Math.floor(i / 3) * 34, 44, 44)}>
          <Emoji name={f} />
        </div>
      ))}

      {dinos && (
        <>
          {/* 莫莫在書房（長脖子從書架旁邊探出來）、豆豆在客廳、波波在廚房的餐桌旁；靜靜待著，只有說話的嘴巴會動（MOTION-2） */}
          <div style={{ ...stand(676, 436, 96, 120), opacity: dim('book') }}>
            <Dino who="momo" mood="idle" size="100%" />
          </div>
          <div style={{ ...stand(812, 690, 80, 90), opacity: dim('living') }}>
            <Dino who="dodo" mood="idle" size="100%" />
          </div>
          <div style={{ ...stand(545, 420, 74, 70), opacity: dim('kitchen') }}>
            <Dino who="bobo" mood="idle" size="100%" flip />
          </div>
        </>
      )}

      {/* 書房可以點：打開我的故事書（房間夠大，≥ 2 cm） */}
      {onBook && (
        <button
          className="house-room"
          data-room="book"
          style={{ position: 'absolute', left: pct(ROOM_BOX.book.x, W), top: pct(ROOM_BOX.book.y, H), width: pct(ROOM_BOX.book.w, W), height: pct(ROOM_BOX.book.h, H) }}
          aria-label="故事書"
          onClick={onBook}
        />
      )}
      {children}
    </div>
  )
}
