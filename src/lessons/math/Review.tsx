import { useEffect, useState } from 'react'
import { VisualView } from '../../ui/Visual'
import { logAttempt } from '../../lib/record'
import { reviewQs } from './plan'
import { Fade, Quiz, type PartCtx, type QuizResult } from './kit'

/**
 * 小複習：兩題。「Where is three?」找出今天的數字（找數字 m-find）、「How many?」數一數上面那一堆、點數字（有幾個 m-match）。
 * 兩題都是剛剛教過、數過、寫過的；一律 3 選 1，只教了 1、2 的那兩天沒有小複習（plan.ts 的 reviewQs）。
 * 兩種題型的泡泡樣子固定（數字／點點→數字卡）；這種題型還不會，手先做一次（kit.tsx 的 Quiz、../formats.ts）。
 */
export function ReviewPart({ ctx }: { ctx: PartCtx }) {
  const [qs] = useState(() => reviewQs(ctx.lesson))
  const [i, setI] = useState(0)
  const [missed, setMissed] = useState(0)
  const q = qs[i]
  // 今天沒有小複習（只教了 1、2，index.tsx 本來就會跳過）：直接下課，不留一個空的畫面
  useEffect(() => {
    if (!qs.length) ctx.done(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!q) return null

  const answered = (r: QuizResult) => {
    void logAttempt({
      station: 'math',
      game: q.kind === 'find' ? 'm-find' : 'm-match',
      itemId: String(q.n),
      skill: q.kind === 'find' ? `num:${q.n}` : `count:${q.n}`,
      phase: r.shown ? 'guided' : 'quiz',
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
        showing={ctx.demo}
        spec={{
          id: String(i),
          format: q.kind === 'find' ? 'ma-find' : 'ma-howmany',
          // 波波頭上的泡泡（T-96）：找數字＝那個數字；有幾個＝點點 → 空的數字卡（數一數、點數字）
          ask:
            q.kind === 'find' ? (
              <div className="ma-cue">
                <span className="glyph num ma-ask-num">{q.n}</span>
              </div>
            ) : (
              <div className="ma-cue">
                <span className="ma-ask-many">
                  <span className="ma-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="ma-ask-card" />
                </span>
              </div>
            ),
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
