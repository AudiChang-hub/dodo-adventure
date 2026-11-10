// 自由畫畫的「今天的背景」（T-127）：畫紙底下鋪一張今天的世界的淡色線稿（像著色本，可以照著塗、也可以不管它），
// 右上角一個「白紙」鍵，點一下換回空白、再點一下拿回來。
// 線稿就是故事插畫的場景（art/storybook/scenes.tsx），只是去掉顏色、線都改成同一種淡淡的粗細。
// 跟畫紙（Ink，1000×620）用同一個座標、同樣置中，存作品的時候直接疊在筆跡底下（save.ts 的 svgThumb）。
import { forwardRef } from 'react'
import type { SceneId } from '../../art/storybook/layout'
import { PAGE_H, PAGE_W } from '../../art/storybook/layout'
import { Scene } from '../../art/storybook/scenes'
import { firstFinger } from '../NotYet'
import { sfx } from '../../lib/audio'

/** 畫紙的邏輯大小（FreeDraw 給 Ink 的 w、h） */
export const PAPER_W = 1000
export const PAPER_H = 620
/** 線稿的顏色：畫紙上看得到，但比孩子畫的任何一個顏色都淡（紙感螢幕上不搶眼） */
const LINE = '#D9CDB8'
/** 畫紙的顏色（FreeDraw 的 .tool-room 背景） */
const PAPER = '#FBF8F2'

// 樣式寫在 SVG 自己裡面：存作品時把這個 SVG 轉成圖片，外面的 CSS 帶不過去。
// 選擇器都掛在 .draw-bd 底下，不會影響畫面上別的 SVG。
// 每個形狀都塗成畫紙的顏色、只描一圈淡線：疊在後面的形狀被前面的蓋住，看起來像一張著色本（雲不會變成好幾個圈圈疊在一起）。
// 960 寬的長方形是天空、地面這種整片的底色：不描邊（不然畫紙四周會多一個框）。
const CSS = `.draw-bd g *{fill:${PAPER}!important;stroke:${LINE}!important;stroke-width:5px!important;stroke-linecap:round!important;stroke-linejoin:round!important}
.draw-bd g [fill="none"]{fill:none!important}
.draw-bd g rect[width="960"]{stroke:none!important}`

export const Backdrop = forwardRef<SVGSVGElement, { scene: SceneId }>(function Backdrop({ scene }, ref) {
  return (
    <svg
      ref={ref}
      className="draw-bd"
      data-backdrop={scene}
      viewBox={`0 0 ${PAPER_W} ${PAPER_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <style>{CSS}</style>
      <defs>
        {/* 地面這種一路畫到邊的形狀，貼著畫紙邊的那一段描邊剪掉 */}
        <clipPath id="draw-bd-clip">
          <rect x={4} y={4} width={PAPER_W - 8} height={PAPER_H - 8} />
        </clipPath>
      </defs>
      <g clipPath="url(#draw-bd-clip)">
        <g transform={`scale(${PAPER_W / PAGE_W} ${PAPER_H / PAGE_H})`}>
          <Scene id={scene} />
        </g>
      </g>
    </svg>
  )
})

/** 對稱筆選到的時候：畫紙正中間一條淡淡的虛線（左右對稱的那條線）。靜止、不存進作品 */
export function MirrorGuide() {
  return (
    <svg
      className="draw-axis"
      viewBox={`0 0 ${PAPER_W} ${PAPER_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <path d={`M${PAPER_W / 2} 18 V${PAPER_H - 18}`} stroke="#CBBFA9" strokeWidth={5} strokeDasharray="4 22" strokeLinecap="round" />
    </svg>
  )
}

/**
 * 右上角的「白紙」鍵：有背景的時候畫一張空白的紙（點了換回白紙）；白紙的時候畫一小張今天的風景（點了拿回背景）。
 * 只換底下的線稿，孩子畫的東西都留著。
 */
export function PaperButton({ blank, onToggle }: { blank: boolean; onToggle: () => void }) {
  return (
    <button
      className="tool draw-paper-btn"
      aria-label={blank ? '拿回今天的背景' : '換成白紙'}
      data-blank={blank ? '' : undefined}
      onPointerDown={(e) => {
        if (!firstFinger(e.nativeEvent)) return
        sfx.pop()
        onToggle()
      }}
    >
      <svg viewBox="0 0 48 48" width="64%" aria-hidden="true">
        {blank ? (
          // 一小張風景：山、太陽、草地（照今天的背景是什麼都用這一張，三歲看得懂「有圖的紙」就好）
          <g strokeLinejoin="round" strokeLinecap="round">
            <rect x={7} y={9} width={34} height={30} rx={5} fill="#E3EEF2" stroke="#2E2A25" strokeWidth={3} />
            <circle cx={32} cy={18} r={4.5} fill="#F1D27C" />
            <path d="M8.5 37.5 L19 24 L26 31 L30 27 L39.5 37.5 Z" fill="#9FC98A" />
            <rect x={7} y={9} width={34} height={30} rx={5} fill="none" stroke="#2E2A25" strokeWidth={3} />
          </g>
        ) : (
          // 一張白紙（右上角折起來）
          <g strokeLinejoin="round" strokeLinecap="round">
            <path d="M11 7 H29 L37 15 V41 H11 Z" fill="#FFFFFF" stroke="#2E2A25" strokeWidth={3} />
            <path d="M29 7 V15 H37" fill="#EDE5D6" stroke="#2E2A25" strokeWidth={3} />
          </g>
        )}
      </svg>
    </button>
  )
}
