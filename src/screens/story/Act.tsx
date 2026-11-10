import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Hand } from '../../games/Demo'
import { firstFinger } from '../../games/NotYet'
import { say, sfx } from '../../lib/audio'
import { hasLine, type Speaker } from '../../content/lines'
import { PAGE_H, PAGE_W, layout, type PageArt } from '../../art/storybook/layout'

/** 多久沒點，手來點一下給他看（準則 idleSec 小班段 8 秒） */
export const ACT_HAND_MS = 8000
/** 手再點一次 */
export const ACT_AGAIN_MS = 16_000
/** 還是沒點：手點下去，故事自己往下走（30 秒內一定能往下，NAV-5） */
export const ACT_AUTO_MS = 24_000

/** 點的範圍至少多大（頁面座標；平板上約 2 公分，TOUCH-1） */
const MIN_HIT = 150

/**
 * 第 2 天「一起演」（T-127）：念到重複的句子（Knock, knock!、Gurgle, gurgle!）之前停下來，換他點門、點蛋，他點了那一句的動作才做、才念。
 * 只在句子和句子之間停，念的當下不停（Smeets & Bus 2012：互動放在停頓的地方）。
 * - 一停下來說 Your turn!；要點的那一個外面一圈靜態的黃框（不閃、不呼吸，MOTION-2：等他的時候只有手會動）。
 * - 8 秒沒點：手來點一下給他看；16 秒再一次；24 秒手點下去，故事自己往下走（30 秒內一定能往下）。
 * - 點別的地方：手馬上來指給他看（不算錯、不出怪聲）。手在示範的時候他搶著點對的：照樣算他點的。
 * - 連點、好幾根手指：只算第一下。
 * art 是這一句的插畫，cast 是要點的那一個，peek 是它現在停的位置（走進來的角色探出頭，content/story/flow.ts 的 peekOf）。
 */
export function ActWait({
  art,
  cast,
  peek,
  host,
  onDone,
}: {
  art: PageArt
  cast: number
  peek: { dx: number; dy: number }
  host: Speaker
  /** by：他自己點的（kid）還是手點的（auto） */
  onDone: (by: 'kid' | 'auto') => void
}) {
  const p = layout(art).filter((x) => !x.back)[cast]
  const done = useRef(false)
  const [tap, setTap] = useState(0)
  const [hand, setHand] = useState(false)
  const finish = (by: 'kid' | 'auto') => {
    if (done.current) return
    done.current = true
    sfx.pop()
    onDone(by)
  }
  useEffect(() => {
    const turn = `teach.turn.${host}`
    if (hasLine(turn)) void say(turn)
    const show = () => {
      setHand(true)
      setTap((n) => n + 1)
    }
    const ts = [window.setTimeout(show, ACT_HAND_MS), window.setTimeout(show, ACT_AGAIN_MS), window.setTimeout(() => (show(), window.setTimeout(() => finish('auto'), 450)), ACT_AUTO_MS)]
    return () => ts.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!p) return null
  // 要點的那一個現在的位置（探出頭的位置），點的範圍至少 MIN_HIT
  const x = Math.min(Math.max(p.x + peek.dx, 0), PAGE_W)
  const y = Math.min(Math.max(p.y + peek.dy, 0), PAGE_H)
  const right = Math.min(Math.max(p.x + p.w + peek.dx, 0), PAGE_W)
  const bottom = Math.min(Math.max(p.y + p.h + peek.dy, 0), PAGE_H)
  const cx = (x + right) / 2
  const cy = (y + bottom) / 2
  const w = Math.max(right - x, MIN_HIT)
  const h = Math.max(bottom - y, MIN_HIT)
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  return (
    <div
      className="story-act"
      data-act-wait={cast}
      onPointerDown={(e) => {
        if (!firstFinger(e.nativeEvent) || done.current) return
        // 點別的地方：手馬上來指給他看
        sfx.tap()
        setHand(true)
        setTap((n) => n + 1)
      }}
    >
      <button
        type="button"
        className="story-act-target"
        aria-label="點這裡"
        style={{ left: pct(cx - w / 2, PAGE_W), top: pct(cy - h / 2, PAGE_H), width: pct(w, PAGE_W), height: pct(h, PAGE_H) }}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (firstFinger(e.nativeEvent)) finish('kid')
        }}
      />
      <AnimatePresence>{hand && <Hand key="hand" x={(cx / PAGE_W) * 100 - 2} y={(cy / PAGE_H) * 100} tap={tap} size="9cqmin" />}</AnimatePresence>
    </div>
  )
}
