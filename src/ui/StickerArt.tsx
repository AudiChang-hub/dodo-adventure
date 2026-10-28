import { memo, type CSSProperties } from 'react'
import { Emoji } from '../art/Emoji'
import { Solid } from '../art/Solid'
import { VisualView } from './Visual'
import type { Pic, StickerDef } from '../content/stickers'
import { stickerSvg } from '../content/sticker-look'
import './celebrate.css'

/** 一張小圖（貼紙、每局回顧都用它）：放在任何大小的容器裡，自己以容器為準縮放 */
export const PicView = memo(function PicView({ pic }: { pic: Pic }) {
  switch (pic.t) {
    case 'solid':
      return (
        <div className="pic">
          <div style={{ width: '88cqmin', height: '88cqmin' }}>
            <Solid solid={pic.solid} hex={pic.hex} />
          </div>
        </div>
      )
    case 'pair':
      return (
        <div className="pic">
          <span className="glyph pic-pair">{pic.ch}</span>
          {pic.icon && (
            <span className="pic-corner">
              <Emoji name={pic.icon} />
            </span>
          )}
        </div>
      )
    case 'text':
      return (
        <div className="pic">
          <span className={`glyph pic-text${pic.text.length > 2 ? ' long' : ''}`}>{pic.text}</span>
        </div>
      )
    case 'badge':
      return (
        <div className="pic">
          <div style={{ width: '78cqmin', height: '78cqmin' }}>
            <Emoji name={pic.icon} />
          </div>
          <span className="pic-num">{pic.n}</span>
        </div>
      )
    default:
      return (
        <div className="pic">
          <VisualView v={pic} />
        </div>
      )
  }
})

/** 星星（進度列、遊戲徽章、每局回顧共用）：圓角的五角星，紙感的粗邊 */
export function StarShape({ on = true, size = '100%' }: { on?: boolean; size?: number | string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path
        d="M20 3.5 L24.6 13.6 L35.6 14.8 L27.4 22.3 L29.7 33.2 L20 27.6 L10.3 33.2 L12.6 22.3 L4.4 14.8 L15.4 13.6 Z"
        fill={on ? '#F1D27C' : 'rgba(46,42,37,0.08)'}
        stroke={on ? '#C9A23E' : 'rgba(46,42,37,0.12)'}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      {on && <path d="M15 15.5 L18.5 14.6" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.7} />}
    </svg>
  )
}

interface StickerProps {
  def: StickerDef
  /** 遊戲徽章：圖下面一排星星 */
  stars?: { n: number; max: number }
  style?: CSSProperties
  className?: string
}

/**
 * 隨機外觀的貼紙（主角 + 種子，sticker-look.ts）。ghost：蓋著的貼紙，只看得到外框和主角的剪影。
 * SVG 字串有快取，同一張貼紙在畫面上出現幾次都只產生一次。
 */
export const ArtSticker = memo(function ArtSticker({ art, seed, ghost, style, className }: { art: string; seed: number; ghost?: boolean; style?: CSSProperties; className?: string }) {
  return <span className={`art-sticker${ghost ? ' is-ghost' : ''}${className ? ` ${className}` : ''}`} style={style} dangerouslySetInnerHTML={{ __html: stickerSvg(art, seed, ghost) }} />
})

/** 一張貼紙：白色的割線邊、淡色的底、中間是圖；遊戲徽章多一排星星。挑選式貼紙（def.art）畫成隨機外觀 */
export function Sticker({ def, stars, style, className }: StickerProps) {
  if (def.art != null && def.seed != null) return <ArtSticker art={def.art} seed={def.seed} style={style} className={className} />
  return (
    <span className={`sticker${stars ? ' is-badge' : ''}${className ? ` ${className}` : ''}`} style={{ '--tint': def.tint, ...style } as CSSProperties}>
      <span className="sticker-face">
        <span className="sticker-pic">
          <PicView pic={def.pic} />
        </span>
        {stars && (
          <span className="sticker-stars">
            {Array.from({ length: stars.max }, (_, i) => (
              <StarShape key={i} on={i < stars.n} />
            ))}
          </span>
        )}
      </span>
    </span>
  )
}
