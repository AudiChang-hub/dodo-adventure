import type { CSSProperties } from 'react'

/**
 * 單字：裡面今天的字母上色（apple 的 a、fox 的 x），其他字母照常。
 * 長的字（ambulance、watermelon）字小一點，不會超出卡片（--fit：7 個字母以內 1，越長越小）。
 */
export function Word({ w, l }: { w: string; l: string }) {
  const style = { '--fit': Math.min(1, 7.5 / w.length) } as CSSProperties
  const i = w.toLowerCase().indexOf(l)
  if (i < 0)
    return (
      <span className="en-word" style={style}>
        {w}
      </span>
    )
  return (
    <span className="en-word" style={style}>
      {w.slice(0, i)}
      <b>{w[i]}</b>
      {w.slice(i + 1)}
    </span>
  )
}
