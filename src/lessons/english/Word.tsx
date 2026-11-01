/** 單字：裡面今天的字母上色（apple 的 a、fox 的 x），其他字母照常 */
export function Word({ w, l }: { w: string; l: string }) {
  const i = w.toLowerCase().indexOf(l)
  if (i < 0) return <span className="en-word">{w}</span>
  return (
    <span className="en-word">
      {w.slice(0, i)}
      <b>{w[i]}</b>
      {w.slice(i + 1)}
    </span>
  )
}
