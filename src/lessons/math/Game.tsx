import { useRef, useState } from 'react'
import { nextStep } from '../../ui/NextStep'
import { gameQs } from './plan'
import { Fade, useLive, type PartCtx } from './kit'
import { ComparePart } from './Compare'
import { ReviewPart } from './Review'
import { SubitizePart } from './Subitize'
import { gameKinds, type GameKind, type GameSet, type MathToday } from './stage4'

/** 小遊戲每一題的外觀（data-game-stage、math.css 的 ma-skin-*） */
const SKIN: Record<GameKind, string> = { compare: 'boat', find: 'balloon', sub: 'dots' }

/**
 * 小遊戲（T-147，設計稿 3-1）：一堂 2 題，包成遊戲。
 * 1. 船：「More! Which side?」兩艘船載東西（數數用的圖示），點多的那艘；船開走。＝比多少（compare:more|less），第一次問先示範。
 * 2. 氣球：「Three! Pop the three!」三顆氣球，點對的破掉。＝找數字（num:N，3 選 1）。只教了 1、2 的那兩天湊不到 3 選 1，只有船。
 * 換皮不換題（設計稿 3-4 案 A）：作答紀錄、選項、熟練判斷跟原本的比多少、找數字一模一樣，只是畫面不同。
 * T-150 M：一眼看出的門開了（./stage4.ts），三種（船、點點、氣球）每天輪兩種（set，lib/variety.ts，連續兩天不一樣）；
 * 點點（Subitize.tsx）的結果不算進「錯很多隔天重上」。
 * 題目中間停住等「下一步」（T-118）；「聽完才答」、「不是一次就對」加起來算這一段的成績。
 */
export function GamePart({ ctx, today4, set }: { ctx: PartCtx; today4?: MathToday; set?: GameSet | null }) {
  const [qs] = useState(() => gameQs(ctx.lesson))
  const [kinds] = useState(() => gameKinds(!!qs.find, today4?.sub ? (set ?? null) : null))
  const [i, setI] = useState(0)
  const tally = useRef({ asked: 0, missed: 0 })
  const live = useLive()
  const kind = kinds[i]

  /** 這一題做完：最後一題交給課（這一段做完），不然停在答完的樣子，等孩子點「下一步」才換下一題 */
  const next = (asked: number, missed: number, opts?: { cue?: boolean }) => {
    tally.current.asked += asked
    tally.current.missed += missed
    if (i + 1 >= kinds.length) return ctx.done(tally.current.asked, tally.current.missed, opts)
    void nextStep({ cue: opts?.cue }).then((ok) => {
      if (ok && live.current) setI(i + 1)
    })
  }
  const sub = { ...ctx, done: next }

  return (
    <Fade id={`${i}-${kind}`}>
      <div className={`ma-fill ma-game ma-skin-${SKIN[kind]}`} data-game-stage={SKIN[kind]}>
        {kind === 'compare' ? (
          <ComparePart ctx={sub} pick={() => [qs.compare]} skin="boat" />
        ) : kind === 'find' ? (
          <ReviewPart ctx={sub} pick={() => (qs.find ? [qs.find] : [])} skin="balloon" />
        ) : (
          <SubitizePart ctx={sub} level={today4!.sub!.level} demo={today4!.sub!.demo} flash={today4!.sub!.flash} onDone={(opts?: { cue?: boolean }) => next(0, 0, opts)} />
        )}
      </div>
    </Fade>
  )
}
