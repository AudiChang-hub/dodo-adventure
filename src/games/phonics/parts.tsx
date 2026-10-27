import type { CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { upper } from '../../content/letters'

/**
 * 單字標籤：開頭字母上色（同一個音永遠同一個顏色，跟字幕一致）、發現共同開頭音時跳一下（jump），
 * 也可以讓開頭字母「飛走」（留下淡淡的空位）。
 * flyId 有值時開頭字母帶 layoutId，飛到大字母那裡時 motion 會自動做出位移動畫。
 */
export function WordLabel({ w, tint, jump, flyId, flown, fit }: { w: string; tint?: boolean; jump?: boolean; flyId?: string; flown?: boolean; fit?: number }) {
  const first = w[0]
  const rest = w.slice(1)
  return (
    // fit：同一排最長的字有幾個字母，字太長時整排一起縮小（三張卡的字一樣大）
    <span className="ph-label" aria-label={w} style={fit ? ({ '--len': fit } as CSSProperties) : undefined}>
      {flown ? (
        <span className="ph-init ghost">{first}</span>
      ) : (
        <motion.span layoutId={flyId} className={`ph-init${tint ? ' tint' : ''}`} animate={jump ? { y: [0, -14, 0], scale: [1, 1.25, 1] } : { y: 0, scale: 1 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
          {first}
        </motion.span>
      )}
      {rest}
    </span>
  )
}

/** 大小寫一起出現：B b */
export function LetterPair({ l, className = '' }: { l: string; className?: string }) {
  return (
    <span className={`ph-pair ${className}`} aria-label={`${upper(l)} ${l}`}>
      <span className="up">{upper(l)}</span>
      <span className="lo">{l}</span>
    </span>
  )
}

export function Pic({ icon }: { icon: string }) {
  return (
    <div className="ph-pic">
      <Emoji name={icon} />
    </div>
  )
}
