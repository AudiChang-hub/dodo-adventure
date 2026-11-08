import { useState } from 'react'
import { TeachCard } from '../../games/Teach'
import { CueArt, VisualView } from '../../ui/Visual'
import { logAttempt, logTeach } from '../../lib/record'
import type { TeachSpec } from '../../content/games'
import { compareQs, countIcons, type CompareQ } from './plan'
import { Fade, Quiz, type PartCtx, type QuizResult } from './kit'

/**
 * 比多少（比多少 m-compare 的做法）：左右兩堆，「More! Which side?」（T-109 關鍵字放最前面）。波波頭上的對話泡泡是徽章（一大堆／只有一個），靜音也知道問的是哪一個；泡泡很小、不能點，畫面上能點的只有兩堆。
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
  /** 聽完才答的有幾題（沒聽完就點的是猜的，不算進「錯很多隔天重上」，T-109） */
  const [asked, setAsked] = useState(0)
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
      // 手示範過、或第一次點的時候手正指著答案（T-111）：一起練，不計入熟練
      phase: r.shown || r.led ? 'guided' : 'quiz',
      level: 1,
      options: [String(q.a), String(q.b)],
      answer: String(target),
      taps: r.taps,
      firstTryCorrect: r.firstTry,
      attempts: r.taps.length,
      responseMs: r.ms,
      hintUsed: r.hinted,
      heard: r.heard,
      metrics: { lesson: ctx.lesson.n, gap: Math.abs(q.a - q.b), ...(r.hinted ? { retaught: 1 } : {}), ...(r.shown ? { shown: 1 } : r.led ? { led: 1 } : {}) },
    })
    const m = missed + (r.heard && !r.firstTry ? 1 : 0)
    const n = asked + (r.heard ? 1 : 0)
    setMissed(m)
    setAsked(n)
    if (i + 1 >= qs.length) return ctx.done(n, m)
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
            // 關鍵字放最前面（T-109）：More! Which side?
            prompt: [q.ask === 'more' ? 'm.ask.more' : 'm.ask.less'],
            correction: [q.ask === 'more' ? 'm.this.more' : 'm.this.less'],
            // 錯第一次：點到的那邊是比較少（多）的那邊：「This side has fewer!」再問一次
            wrong: () => [q.ask === 'more' ? 'm.this.less' : 'm.this.more'],
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

/**
 * 比多少的教學卡：一大堆對一點點（5 對 1，在還沒開 6 的範圍裡）。
 * 先指問的那一邊、再指另一邊；念完招手的手停在**問的那一邊**，點了再聽的也是這一邊（AI 小男生測試 #5：手最後停在「少」的那邊，他就去點那邊）。
 * 以前念三句（多、少、再一次多）回到問的那一邊：拿給波波按完打勾要等 16 秒才能動手，盲測三次都說「好久喔」；
 * 第三句改成招手的手停在問的那一邊（games/Teach），少念一句。
 */
function teachOf(q: CompareQ & { icon: string }): TeachSpec {
  const less = q.ask === 'less'
  return {
    visual: [
      { t: 'group', icon: q.icon, count: 5 },
      { t: 'group', icon: q.icon, count: 1 },
    ],
    focus: less ? [1, 0] : [0, 1],
    lines: less ? ['teach.fewer', 'teach.more'] : ['teach.more', 'teach.fewer'],
    cue: { t: 'cue', cue: q.ask, icon: q.icon },
  }
}
