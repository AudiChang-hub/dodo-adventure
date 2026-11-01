import { useState } from 'react'
import { TeachCard } from '../../games/Teach'
import { CueArt, VisualView } from '../../ui/Visual'
import { logAttempt, logTeach } from '../../lib/record'
import type { TeachSpec } from '../../content/games'
import { compareQs, countIcons, type CompareQ } from './plan'
import { Fade, Quiz, type PartCtx, type QuizResult } from './kit'

/**
 * 比多少（比多少 m-compare 的做法）：左右兩堆，「Which side has more?」。波波頭上的對話泡泡是徽章（一大堆／只有一個），靜音也知道問的是哪一個；泡泡很小、不能點，畫面上能點的只有兩堆。
 * 第一次問「多」或「少」先上教學卡（6 對 2，這邊比較多、這邊比較少），教過才考。
 */
export function ComparePart({ ctx }: { ctx: PartCtx }) {
  const [qs] = useState(() => {
    const icons = countIcons(3)
    return compareQs(ctx.lesson).map((q, k) => ({ ...q, icon: icons[k] }))
  })
  const [i, setI] = useState(0)
  // 要先教的題目：教學卡先上，教完才出題（跟換題同一次決定，題目不會先閃一下）
  const [card, setCard] = useState<TeachSpec | null>(() => (qs[0].teach ? teachOf(qs[0]) : null))
  const [missed, setMissed] = useState(0)
  const q = qs[i]

  const taught = (ms: number) => {
    void logTeach({ station: 'math', game: 'm-compare', itemId: `teach-${q.ask}`, skill: `compare:${q.ask}`, level: 1, ms })
    setCard(null)
  }

  const answered = (r: QuizResult) => {
    const target = q.ask === 'more' ? Math.max(q.a, q.b) : Math.min(q.a, q.b)
    void logAttempt({
      station: 'math',
      game: 'm-compare',
      itemId: `${q.a}v${q.b}${q.ask === 'less' ? '<' : '>'}`,
      skill: `compare:${q.ask}`,
      phase: 'quiz',
      level: 1,
      options: [String(q.a), String(q.b)],
      answer: String(target),
      taps: r.taps,
      firstTryCorrect: r.firstTry,
      attempts: r.taps.length,
      responseMs: r.ms,
      hintUsed: r.hinted,
      metrics: { lesson: ctx.lesson.n, gap: Math.abs(q.a - q.b), ...(r.hinted ? { retaught: 1 } : {}) },
    })
    const m = missed + (r.firstTry ? 0 : 1)
    setMissed(m)
    if (i + 1 >= qs.length) return ctx.done(qs.length, m)
    const nq = qs[i + 1]
    setI(i + 1)
    setCard(nq.teach ? teachOf(nq) : null)
  }

  const fit = Math.max(q.a, q.b)
  return (
    <Fade id={`${i}-${card ? 'card' : 'q'}`}>
      {card ? (
        <TeachCard spec={card} camera onDone={taught} />
      ) : (
        <Quiz
          host={ctx.host}
          onDone={answered}
          spec={{
            id: String(i),
            prompt: [q.ask === 'more' ? 'm.more' : 'm.less'],
            correction: [q.ask === 'more' ? 'm.this.more' : 'm.this.less'],
            answer: String(q.ask === 'more' ? Math.max(q.a, q.b) : Math.min(q.a, q.b)),
            wide: true,
            ask: (
              <div className="ma-cue">
                <CueArt cue={q.ask} icon={q.icon} />
              </div>
            ),
            options: [q.a, q.b].map((c, k) => ({ id: String(c), label: k ? '右邊' : '左邊', view: <VisualView v={{ t: 'group', icon: q.icon, count: c }} fit={fit} /> })),
          }}
        />
      )}
    </Fade>
  )
}

/** 比多少的教學卡：一大堆對一點點，先指問的那一邊（跟 m-compare 的教學卡同一個樣子） */
function teachOf(q: CompareQ & { icon: string }): TeachSpec {
  const less = q.ask === 'less'
  return {
    visual: [
      { t: 'group', icon: q.icon, count: 6 },
      { t: 'group', icon: q.icon, count: 2 },
    ],
    focus: less ? [1, 0] : [0, 1],
    lines: less ? ['teach.fewer', 'teach.more'] : ['teach.more', 'teach.fewer'],
    cue: { t: 'cue', cue: q.ask, icon: q.icon },
  }
}
