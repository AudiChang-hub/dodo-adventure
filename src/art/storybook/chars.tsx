// 故事時間的手繪角色（T-119 樣張，家長 2026-11-09 選了「全部改成手繪」）：自己畫的原創造型，不照任何繪本、卡通。
// 畫風（跟三隻恐龍 art/Dino.tsx 同一套）：淡色平塗、外框是同色系深一階、粗線圓角；不用漸層、不用細紋理（紙感螢幕，準則 DISPLAY）。
// 每個角色一個元件、幾個姿勢；座標是自己的 viewBox，頁面用 <Place> 擺位置、縮放。還沒接進 App（只給 tests/layout/story-art 預覽）。
import type { ReactNode } from 'react'

export const INK = '#2E2A25'
const CHEEK = '#F2A9A0'
const MOUTH = '#7A3E3A'
const TONGUE = '#E9908C'
/** 角色的外框粗細（自己的座標；頁面縮放 0.7～1.3 倍，畫面上約 3.5～6.5 px） */
export const W = 5

const line = (stroke: string, w = W) => ({ stroke, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const })

/** 一個角色的大小（viewBox），頁面擺位置要用 */
export interface Box {
  w: number
  h: number
}

function Eye({ x, y, r = 6, shut, happy }: { x: number; y: number; r?: number; shut?: boolean; happy?: boolean }) {
  if (shut) return <path d={`M${x - r * 1.3} ${y} Q${x} ${y + r * 1.4} ${x + r * 1.3} ${y}`} fill="none" {...line(INK, 4)} />
  if (happy) return <path d={`M${x - r * 1.3} ${y + 2} Q${x} ${y - r * 1.6} ${x + r * 1.3} ${y + 2}`} fill="none" {...line(INK, 4.5)} />
  return (
    <g>
      <ellipse cx={x} cy={y} rx={r * 0.85} ry={r * 1.15} fill={INK} />
      <circle cx={x + r * 0.3} cy={y - r * 0.45} r={r * 0.33} fill="#fff" />
    </g>
  )
}

// ── 兔子：奶油白、一隻耳朵折下來、脖子上一條珊瑚色圍巾（認得出是同一隻） ─────────────
const RB = { fur: '#FBF6EC', line: '#B49C82', ear: '#F4C1B6', nose: '#E98F86', scarf: '#E8907E', scarfLine: '#BF6A5C' }
export type RabbitPose = 'stand' | 'run' | 'sleep'
export const RABBIT_BOX: Record<RabbitPose, Box> = { stand: { w: 200, h: 250 }, run: { w: 280, h: 200 }, sleep: { w: 260, h: 170 } }

export function Rabbit({ pose }: { pose: RabbitPose }) {
  const s = line(RB.line)
  const sc = line(RB.scarfLine)
  if (pose === 'run')
    return (
      <g>
        {/* 跑得快：身後三條短短的速度線（靜止的，不是紋理） */}
        <g {...line('#CDBBA3', 6)} fill="none">
          <path d="M8 92 h40" />
          <path d="M0 120 h44" />
          <path d="M14 148 h30" />
        </g>
        <g {...s}>
          <path d="M184 62 C156 34 116 24 98 32 C112 50 144 64 174 78 Z" fill={RB.fur} />
          <path d="M178 66 C150 46 120 40 108 42 C122 54 146 64 170 74 Z" fill={RB.ear} stroke="none" />
          <path d="M192 54 C172 20 138 6 120 10 C130 30 158 50 184 70 Z" fill={RB.fur} />
          <ellipse cx={72} cy={160} rx={36} ry={13} transform="rotate(18 72 160)" fill={RB.fur} />
          <ellipse cx={130} cy={130} rx={66} ry={42} transform="rotate(-8 130 130)" fill={RB.fur} />
          <circle cx={66} cy={112} r={15} fill={RB.fur} />
          <ellipse cx={198} cy={170} rx={32} ry={12} transform="rotate(-14 198 170)" fill={RB.fur} />
          <ellipse cx={150} cy={160} rx={12} ry={20} transform="rotate(40 150 160)" fill={RB.fur} />
        </g>
        {/* 圍巾往後飛 */}
        <g {...sc}>
          <path d="M158 104 C138 84 118 82 96 66 C100 90 124 104 156 118 Z" fill={RB.scarf} />
          <path d="M152 104 Q178 118 200 104 L203 119 Q178 134 151 119 Z" fill={RB.scarf} />
        </g>
        <ellipse cx={206} cy={86} rx={46} ry={40} fill={RB.fur} {...s} />
        <Eye x={220} y={80} />
        <ellipse cx={230} cy={100} rx={9} ry={5.5} fill={CHEEK} opacity={0.85} />
        <ellipse cx={249} cy={90} rx={6} ry={4.5} fill={RB.nose} />
        <path d="M236 104 Q242 110 248 104" fill="none" {...line(INK, 3.5)} />
      </g>
    )
  if (pose === 'sleep')
    return (
      <g>
        <g {...s}>
          <path d="M172 72 C142 46 98 40 70 50 C90 66 132 78 168 88 Z" fill={RB.fur} />
          <path d="M166 74 C142 58 108 52 88 54 C108 66 136 76 162 82 Z" fill={RB.ear} stroke="none" />
          <path d="M182 70 C164 30 132 8 106 8 C116 32 146 60 176 84 Z" fill={RB.fur} />
          <circle cx={38} cy={112} r={15} fill={RB.fur} />
          <ellipse cx={118} cy={120} rx={86} ry={42} fill={RB.fur} />
          <ellipse cx={200} cy={154} rx={26} ry={10} fill={RB.fur} />
        </g>
        <g {...sc}>
          <path d="M150 98 Q170 114 192 102 L196 116 Q170 130 148 112 Z" fill={RB.scarf} />
          <path d="M156 112 L148 146 L164 144 L170 114 Z" fill={RB.scarf} />
        </g>
        <ellipse cx={200} cy={114} rx={44} ry={38} fill={RB.fur} {...s} />
        <Eye x={212} y={110} shut />
        <ellipse cx={224} cy={128} rx={9} ry={5.5} fill={CHEEK} opacity={0.85} />
        <ellipse cx={241} cy={118} rx={6} ry={4.5} fill={RB.nose} />
      </g>
    )
  return (
    <g>
      <g {...s}>
        <path d="M78 96 C62 60 60 22 74 10 C90 0 102 40 98 92 Z" fill={RB.fur} />
        <path d="M82 84 C72 58 72 30 78 22 C86 18 92 46 91 82 Z" fill={RB.ear} stroke="none" />
        {/* 右耳折下來（她的記號） */}
        <path d="M106 92 C106 50 114 24 132 22 C152 20 170 32 172 46 C160 44 142 40 132 52 C126 62 126 80 126 96 Z" fill={RB.fur} />
        <path d="M114 84 C114 54 120 34 132 32 C146 30 158 36 162 42 C150 40 136 40 126 50 C120 60 120 74 120 86 Z" fill={RB.ear} stroke="none" />
        <ellipse cx={100} cy={190} rx={48} ry={48} fill={RB.fur} />
        <ellipse cx={76} cy={238} rx={22} ry={10} fill={RB.fur} />
        <ellipse cx={124} cy={238} rx={22} ry={10} fill={RB.fur} />
        <ellipse cx={58} cy={186} rx={10} ry={18} transform="rotate(18 58 186)" fill={RB.fur} />
        <ellipse cx={142} cy={186} rx={10} ry={18} transform="rotate(-18 142 186)" fill={RB.fur} />
      </g>
      <g {...sc}>
        <path d="M118 160 L132 202 L114 198 L106 162 Z" fill={RB.scarf} />
        <path d="M56 142 Q100 160 144 142 L146 157 Q100 176 54 157 Z" fill={RB.scarf} />
      </g>
      <ellipse cx={100} cy={106} rx={56} ry={47} fill={RB.fur} {...s} />
      <Eye x={78} y={102} />
      <Eye x={122} y={102} />
      <ellipse cx={66} cy={122} rx={9} ry={5.5} fill={CHEEK} opacity={0.85} />
      <ellipse cx={134} cy={122} rx={9} ry={5.5} fill={CHEEK} opacity={0.85} />
      <ellipse cx={100} cy={117} rx={7} ry={5} fill={RB.nose} />
      <path d="M91 125 Q95 131 100 126 Q105 131 109 125" fill="none" {...line(INK, 3.5)} />
    </g>
  )
}

// ── 烏龜：芥末黃的殼、三塊大大的殼片、淺綠的頭和腳（跟豆豆的綠分得開） ─────────────
const TT = { shell: '#E9C978', line: '#B48F3E', plate: '#F4DC9C', rim: '#DDB862', skin: '#BBDA9E', skinBack: '#A6C98B', skinLine: '#6F9658' }
export type TurtlePose = 'walk' | 'cheer'
export const TURTLE_BOX: Record<TurtlePose, Box> = { walk: { w: 300, h: 190 }, cheer: { w: 300, h: 200 } }

function Shell() {
  const s = line(TT.line)
  return (
    <g>
      <path d="M36 140 C40 72 86 36 140 36 C194 36 238 72 242 140 Z" fill={TT.shell} {...s} />
      <g {...line(TT.line, 4)} fill={TT.plate}>
        <path d="M112 72 H168 L182 106 L168 134 H112 L98 106 Z" />
        <path d="M62 132 C64 104 74 86 92 74 L86 106 L98 132 Z" />
        <path d="M218 132 C216 104 206 86 188 74 L194 106 L182 132 Z" />
      </g>
      <path d="M28 138 H250 Q256 156 238 160 H42 Q22 156 28 138 Z" fill={TT.rim} {...s} />
    </g>
  )
}

export function Turtle({ pose }: { pose: TurtlePose }) {
  const k = line(TT.skinLine)
  const cheer = pose === 'cheer'
  return (
    <g>
      <g {...k}>
        <ellipse cx={80} cy={166} rx={17} ry={20} fill={TT.skinBack} />
        <ellipse cx={176} cy={166} rx={17} ry={20} fill={TT.skinBack} />
        <path d="M40 134 L14 148 L44 152 Z" fill={TT.skin} />
        {cheer ? <path d="M210 128 C220 96 230 70 244 58 L268 80 C252 92 240 110 232 140 Z" fill={TT.skin} /> : <path d="M206 128 C222 104 236 92 250 90 L262 120 C246 124 232 134 220 146 Z" fill={TT.skin} />}
        <ellipse cx={108} cy={170} rx={18} ry={20} transform="rotate(-14 108 170)" fill={TT.skin} />
        {!cheer && <ellipse cx={210} cy={170} rx={18} ry={20} transform="rotate(16 210 170)" fill={TT.skin} />}
      </g>
      <Shell />
      {cheer && <ellipse cx={232} cy={112} rx={14} ry={26} transform="rotate(-40 232 112)" fill={TT.skin} {...k} />}
      {cheer ? (
        <g>
          <ellipse cx={258} cy={56} rx={34} ry={30} fill={TT.skin} {...k} />
          <Eye x={266} y={46} happy />
          <ellipse cx={276} cy={64} rx={8} ry={5} fill={CHEEK} opacity={0.85} />
          <path d="M256 66 Q270 66 282 62 Q278 82 264 80 Q254 78 256 66 Z" fill={MOUTH} />
          <ellipse cx={268} cy={75} rx={7} ry={3.5} fill={TONGUE} />
        </g>
      ) : (
        <g>
          <ellipse cx={258} cy={98} rx={34} ry={30} fill={TT.skin} {...k} />
          <Eye x={268} y={90} />
          <ellipse cx={278} cy={108} rx={8} ry={5} fill={CHEEK} opacity={0.85} />
          <path d="M262 112 Q272 120 284 110" fill="none" {...line(INK, 3.5)} />
        </g>
      )}
    </g>
  )
}

// ── 大象（挪亞方舟）：淡藍灰、大耳朵裡淡粉紅 ─────────────
const EL = { body: '#C4CEDA', back: '#AEBACA', line: '#7D8C9D', ear: '#DCE3EB', inner: '#F0CBC5' }
export const ELEPHANT_BOX: Box = { w: 270, h: 220 }

export function Elephant() {
  const s = line(EL.line)
  return (
    <g>
      <g {...s}>
        <rect x={60} y={140} width={30} height={68} rx={13} fill={EL.back} />
        <rect x={150} y={140} width={30} height={68} rx={13} fill={EL.back} />
        <path d="M40 116 C28 128 26 140 30 152" fill="none" />
        <ellipse cx={120} cy={128} rx={86} ry={58} fill={EL.body} />
        <rect x={84} y={150} width={32} height={60} rx={13} fill={EL.body} />
        <rect x={172} y={150} width={32} height={60} rx={13} fill={EL.body} />
        <path d="M232 98 C258 110 260 148 250 168 C244 178 232 176 234 164 C242 144 236 124 220 118 Z" fill={EL.body} />
        <circle cx={200} cy={96} r={46} fill={EL.body} />
        <ellipse cx={172} cy={98} rx={30} ry={40} fill={EL.ear} />
        <ellipse cx={174} cy={100} rx={18} ry={26} fill={EL.inner} stroke="none" />
      </g>
      <Eye x={214} y={86} />
      <ellipse cx={222} cy={106} rx={8} ry={5} fill={CHEEK} opacity={0.85} />
    </g>
  )
}

// ── 場景的東西 ─────────────────────────────────────────────

/** 一棵大樹：樹冠是幾個圓疊起來，只描最外面一圈（先畫有框的、再蓋一層沒框的） */
export function Tree() {
  const blobs: [number, number, number][] = [
    [90, 110, 70],
    [170, 80, 80],
    [250, 112, 68],
    [170, 150, 72],
  ]
  return (
    <g>
      <path d="M150 300 C156 250 156 210 150 170 L194 170 C188 210 188 250 196 300 Z" fill="#C9A57E" {...line('#8F6E4B')} />
      {blobs.map(([x, y, r], i) => (
        <circle key={`o${i}`} cx={x} cy={y} r={r} fill="#A9D3A4" {...line('#6A9E6B', 6)} />
      ))}
      {blobs.map(([x, y, r], i) => (
        <circle key={`i${i}`} cx={x} cy={y} r={r - 3} fill="#A9D3A4" />
      ))}
    </g>
  )
}
export const TREE_BOX: Box = { w: 330, h: 300 }

/** 雲：同樣先畫有框的圓、再蓋沒框的 */
export function Cloud({ x, y, k = 1 }: { x: number; y: number; k?: number }) {
  const c: [number, number, number][] = [
    [0, 10, 26],
    [32, -6, 32],
    [66, 10, 26],
  ]
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <rect x={-20} y={8} width={106} height={28} rx={14} fill="#FBF8F2" {...line('#B9C9D3', 4)} />
      {c.map(([cx, cy, r], i) => (
        <circle key={`o${i}`} cx={cx} cy={cy} r={r} fill="#FBF8F2" {...line('#B9C9D3', 4)} />
      ))}
      {c.map(([cx, cy, r], i) => (
        <circle key={`i${i}`} cx={cx} cy={cy} r={r - 2} fill="#FBF8F2" />
      ))}
      <rect x={-18} y={10} width={102} height={24} rx={12} fill="#FBF8F2" />
    </g>
  )
}

export function Sun({ x, y, r = 46 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <g {...line('#D9B45A', 6)}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const t = (a * Math.PI) / 180
          return <path key={a} d={`M${x + Math.cos(t) * (r + 12)} ${y + Math.sin(t) * (r + 12)} L${x + Math.cos(t) * (r + 26)} ${y + Math.sin(t) * (r + 26)}`} />
        })}
      </g>
      <circle cx={x} cy={y} r={r} fill="#F6DE96" {...line('#D9B45A', 5)} />
    </g>
  )
}

/** 起點、終點的拱門：兩根柱子、上面一條大格子的布（格子大，不是細紋理） */
export function Banner({ w = 300 }: { w?: number }) {
  const cell = w / 6
  return (
    <g>
      <g {...line('#8F6E4B')}>
        <rect x={0} y={20} width={20} height={250} rx={8} fill="#C9A57E" />
        <rect x={w - 20} y={20} width={20} height={250} rx={8} fill="#C9A57E" />
      </g>
      <rect x={10} y={30} width={w - 20} height={cell * 1.2} fill="#FBF8F2" />
      {Array.from({ length: 12 }, (_, i) => {
        const col = i % 6
        const row = Math.floor(i / 6)
        return (col + row) % 2 ? null : <rect key={i} x={10 + col * ((w - 20) / 6)} y={30 + row * cell * 0.6} width={(w - 20) / 6} height={cell * 0.6} fill="#6B645A" />
      })}
      <rect x={10} y={30} width={w - 20} height={cell * 1.2} fill="none" {...line('#6B645A', 5)} />
    </g>
  )
}

/** 方舟：木頭船身、上面一間紅屋頂的小屋、船身左邊一扇門（大象從這裡走進去） */
export function Ark() {
  const wood = line('#8F6E4B')
  return (
    <g>
      <path d="M100 70 L210 14 L320 70 Z" fill="#E8907E" {...line('#BF6A5C')} />
      <rect x={112} y={64} width={196} height={96} rx={10} fill="#EFE0C2" {...line('#A8875A')} />
      <circle cx={162} cy={110} r={19} fill="#A9CBE6" {...line('#6F9CC8')} />
      <circle cx={258} cy={110} r={19} fill="#A9CBE6" {...line('#6F9CC8')} />
      <path d="M18 150 H402 L364 262 Q210 288 56 262 Z" fill="#C9A57E" {...wood} />
      <g {...line('#A8875A', 5)} fill="none">
        <path d="M150 196 H380" />
        <path d="M150 232 H366" />
      </g>
      <rect x={62} y={172} width={70} height={84} rx={14} fill="#8F6E4B" {...wood} />
    </g>
  )
}
export const ARK_BOX: Box = { w: 420, h: 290 }

/** 把一個角色擺到頁面上：x、y 是腳底的中間；k 是縮放；flip 左右翻 */
export function Place({ x, y, k = 1, box, flip, children, id, hop, delay = 0 }: { x: number; y: number; k?: number; box: Box; flip?: boolean; children: ReactNode; id?: string; hop?: number; delay?: number }) {
  return (
    <g transform={`translate(${x - (box.w * k) / 2} ${y - box.h * k})`}>
      {/* 跳一下：外面一層 g 負責（CSS 的 transform 不會蓋掉擺位置的 transform 屬性）；delay：兩隻一起跳時錯開一點 */}
      <g className={hop ? 'sb-hop' : undefined} key={hop} data-actor={id} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
        <g transform={`scale(${k})${flip ? ` translate(${box.w} 0) scale(-1 1)` : ''}`}>{children}</g>
      </g>
    </g>
  )
}
