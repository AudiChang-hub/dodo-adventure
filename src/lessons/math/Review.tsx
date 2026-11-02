import { useState } from 'react'
import { VisualView } from '../../ui/Visual'
import { logAttempt } from '../../lib/record'
import { reviewQs } from './plan'
import { Fade, Quiz, type PartCtx, type QuizResult } from './kit'

/**
 * 小複習：兩題。「Where is three?」找出今天的數字（找數字 m-find）、「How many?」數一數上面那一堆、點數字（有幾個 m-match）。
 * 兩題都是剛剛教過、數過、寫過的；教過 3 個數字以後一律 3 選 1（plan.ts 的 reviewQs）。
 */
export function ReviewPart({ ctx }: { ctx: PartCtx }) {
  const [qs] = useState(() => reviewQs(ctx.lesson))
  const [i, setI] = useState(0)
  const [missed, setMissed] = useState(0)
  const q = qs[i]

  const answered = (r: QuizResult) => {
    void logAttempt({
      station: 'math',
      game: q.kind === 'find' ? 'm-find' : 'm-match',
      itemId: String(q.n),
      skill: q.kind === 'find' ? `num:${q.n}` : `count:${q.n}`,
      phase: 'quiz',
      level: 1,
      options: q.options.map(String),
      answer: String(q.n),
      taps: r.taps,
      firstTryCorrect: r.firstTry,
      attempts: r.taps.length,
      responseMs: r.ms,
      hintUsed: r.hinted,
      metrics: { lesson: ctx.lesson.n, ...(r.hinted ? { retaught: 1 } : {}) },
    })
    const m = missed + (r.firstTry ? 0 : 1)
    setMissed(m)
    if (i + 1 >= qs.length) return ctx.done(qs.length, m)
    setI(i + 1)
  }

  return (
    <Fade id={i}>
      <Quiz
        host={ctx.host}
        onDone={answered}
        spec={{
          id: String(i),
          prompt: [q.kind === 'find' ? `m.findnum.${q.n}` : 'm.howmany'],
          correction: [q.kind === 'find' ? `m.thisis.${q.n}` : `m.total.${q.n}`],
          // 錯第一次：「This is four.」再問一次（Where is three?／How many?）
          wrong: (picked) => [`m.thisis.${picked}`],
          answer: String(q.n),
          top:
            q.kind === 'howmany' ? (
              <div className="ma-pile">
                <VisualView v={{ t: 'group', icon: q.icon, count: q.n }} />
              </div>
            ) : undefined,
          options: q.options.map((x) => ({ id: String(x), label: String(x), view: <span className="glyph num">{x}</span> })),
        }}
      />
    </Fade>
  )
}
