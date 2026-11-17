// 翻翻牌、影子配對的圖（T-160）：./icons.generated.ts 分開載入（遊戲打開才下載，不加大首頁），載好之前不出題。
import { memo, useEffect, useState, type CSSProperties } from 'react'

type Icons = Record<string, { b: string; w: number; h: number }>
let cache: Icons | null = null
let pending: Promise<Icons> | null = null

/** 載入圖示（同一次開 App 只下載一次） */
export function loadMatchIcons(): Promise<Icons> {
  if (cache) return Promise.resolve(cache)
  pending ??= import('./icons.generated').then((m) => (cache = m.MATCH_ICONS))
  return pending
}

/** 圖示載好了沒（載好才出題） */
export function useMatchIcons() {
  const [ready, setReady] = useState(!!cache)
  useEffect(() => {
    if (ready) return
    let on = true
    void loadMatchIcons().then(() => on && setReady(true))
    return () => {
      on = false
    }
  }, [ready])
  return ready
}

/**
 * 一樣東西：彩色，或 shadow 畫成影子（整個輪廓塗暗，看不到裡面的花紋）；flip 左右翻過來（影子配對最難的一級：影子朝另一邊）。
 */
export const MatchIcon = memo(function MatchIcon({ id, shadow, flip, style, className }: { id: string; shadow?: boolean; flip?: boolean; style?: CSSProperties; className?: string }) {
  const e = cache?.[id]
  if (!e) return null
  return (
    <svg
      className={`mt-icon${shadow ? ' is-shadow' : ''}${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${e.w} ${e.h}`}
      width="100%"
      height="100%"
      style={{ display: 'block', ...(flip ? { transform: 'scaleX(-1)' } : {}), ...style }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: e.b }}
    />
  )
})
