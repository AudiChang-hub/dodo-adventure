import { useRef, useState } from 'react'
import { nextStep } from '../../ui/NextStep'
import { gameQs } from './plan'
import { Fade, useLive, type PartCtx } from './kit'
import { ComparePart } from './Compare'
import { ReviewPart } from './Review'

/**
 * 小遊戲（T-147，設計稿 3-1）：一堂 2 題，包成遊戲。
 * 1. 船：「More! Which side?」兩艘船載東西（數數用的圖示），點多的那艘；船開走。＝比多少（compare:more|less），第一次問先示範。
 * 2. 氣球：「Three! Pop the three!」三顆氣球，點對的破掉。＝找數字（num:N，3 選 1）。只教了 1、2 的那兩天湊不到 3 選 1，只有船。
 * 換皮不換題（設計稿 3-4 案 A）：作答紀錄、選項、熟練判斷跟原本的比多少、找數字一模一樣，只是畫面不同。
 * 兩題中間停住等「下一步」（T-118）；兩題的「聽完才答」、「不是一次就對」加起來算這一段的成績。
 */
export function GamePart({ ctx }: { ctx: PartCtx }) {
  const [qs] = useState(() => gameQs(ctx.lesson))
  const [stage, setStage] = useState<'boat' | 'balloon'>('boat')
  const tally = useRef({ asked: 0, missed: 0 })
  const live = useLive()

  const add = (asked: number, missed: number) => {
    tally.current.asked += asked
    tally.current.missed += missed
  }
  const boatCtx: PartCtx = {
    ...ctx,
    done: (asked, missed, opts) => {
      add(asked, missed)
      if (!qs.find) return ctx.done(tally.current.asked, tally.current.missed, opts)
      // 船答完：停在答完的樣子，等孩子點「下一步」才換氣球
      void nextStep({ cue: opts?.cue }).then((ok) => {
        if (ok && live.current) setStage('balloon')
      })
    },
  }
  const balloonCtx: PartCtx = {
    ...ctx,
    done: (asked, missed, opts) => {
      add(asked, missed)
      ctx.done(tally.current.asked, tally.current.missed, opts)
    },
  }

  return (
    <Fade id={stage}>
      <div className={`ma-fill ma-game ma-skin-${stage}`} data-game-stage={stage}>
        {stage === 'boat' ? (
          <ComparePart ctx={boatCtx} pick={() => [qs.compare]} skin="boat" />
        ) : (
          <ReviewPart ctx={balloonCtx} pick={() => (qs.find ? [qs.find] : [])} skin="balloon" />
        )}
      </div>
    </Fade>
  )
}
