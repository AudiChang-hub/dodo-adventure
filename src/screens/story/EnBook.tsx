import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { Dino } from '../../art/Dino'
import { Swap } from '../../ui/Scenes'
import { Hand } from '../../games/Demo'
import { firstFinger } from '../../games/NotYet'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../../games/lines'
import { hasLine } from '../../content/lines'
import { bridgeKey } from '../../content/zh-words'
import { EN_PAGES, enLineKey, enNounKey, enQKey, enText, enWhichKey, enWordKey } from '../../content/story/english'
import { zhClipReady } from '../../lib/words'
import { Pic } from '../../lessons/chinese/Pic'
import { Choose } from './Tell'
import { WordMatch } from './WordMatch'
import { finishEn, saveEnAt, saveMatched, zhTextOf, type EnBookRow } from './en-book'
import { matchOf, pagePics, storyAskOf, whichOf, type PicPick, type WordMatch as MatchQ } from './en-pages'
import './en-flow.css'

/** 停下來等他點：第一次手來指的時間（小班段 8 秒），之後每隔這麼久再指一次。絕不自己往下（家長要求：等他點才講下一句） */
export const EN_HAND_MS = 8000

/**
 * 念的當下點圖（T-141，AI 小男生盲測 c9bb003 故事 2：點豬、點房子「都沒有變」，以前只有輕輕一聲）：
 * 被點的那張圖做一個動作，每一下換一種（跳、搖一搖、轉一圈、壓扁彈回），配那個動作的短音效；不跳過正在念的這一句
 */
const PIC_ACTS = ['hop', 'wiggle', 'spin', 'squish'] as const
type PicAct = (typeof PIC_ACTS)[number]
const PIC_SFX: Record<PicAct, () => void> = { hop: () => sfx.boing(), wiggle: () => sfx.pop(), spin: () => sfx.star(), squish: () => sfx.pop() }
/** 被點的那張圖：哪一頁、第幾張、第幾下 */
type Poke = { page: number; i: number; n: number }

/** 正在等他做的事：next 點一下講下一句；q 故事題、which 認角色（兩張圖選一張）；match 找一樣的英文字 */
type Wait = { kind: 'next' } | { kind: 'q' | 'which'; pick: PicPick; key: string } | { kind: 'match'; q: MatchQ; demo: boolean }

/**
 * 故事時間的英文版課文（T-129，家長選 A）：跟今天中文課同一篇，一篇 4 句、一句一頁，配中文課文那一行原本的圖。
 * 每天都是同一個流程（照中文課的結構，不輪流換玩法）：
 * 1. 4 句：每句念完就停（下面的箭頭亮起來），等他點一下才念下一句；絕不自己往下。發呆 8 秒手來指箭頭，之後每 8 秒再指一次，不再念一次整句。
 *    念的當下點圖只有輕輕一聲（不跳過正在念的這一句）。連點、好幾根手指只算第一下。
 *    主角名詞第一次出現時，念完那一句接著念三明治（Rabbit. → 兔子 → Rabbit.，中文音檔產生好了的才念）。
 * 2. 故事題（Who runs fast?，兩張圖選一張）。
 * 3. 認角色（Which one is the rabbit?，兩張圖選一張）。
 * 4. 找一樣的英文字（上面 rabbit，下面兩張，./WordMatch.tsx）。
 * 三題都不自己往下：一進來手就示範（選圖題手指對的那張、找字手先做一次，T-139），之後發呆手每 8 秒來指一次。
 * 先複習、新篇是提議（T-136、T-142，跟中文課同一份排課）：舊篇（3 次前的那篇，跟新篇一樣完整：4 句＋三題）講完就是讀完了，孩子點了書才講新篇；
 * 舊篇時右上角有大人用的「跳過舊篇」（onSkip）。新篇講完接結尾小題：前 1 次、前 7 次的各一題（認角色，出不了就找一樣的英文字）。
 * 動作只用位移和淡入淡出（紙感螢幕，MOTION-1、2）：換頁時圖從左邊慢慢滑進來，做完就停；找對了一對字放大跳一下（家長要看得出來的回饋）。
 */
export default function EnBook({
  row,
  from,
  back,
  onDone,
  onSkip,
}: {
  row: EnBookRow
  from: number
  /** 回書架的返回鍵（StoryBook 的 BookBack） */
  back: ReactNode
  onDone: () => void
  /** 今天的舊篇：大人按「跳過舊篇」（T-136） */
  onSkip?: () => void
}) {
  const t = zhTextOf(row.day)!
  const e = enText(row.day)!
  const pics = useMemo(() => Array.from({ length: EN_PAGES }, (_, i) => pagePics(t, i)), [t])
  const start = Math.min(from, EN_PAGES - 1)
  const [at, setAt] = useState(start)
  const [waiting, setWaiting] = useState<Wait | null>(null)
  const [hand, setHand] = useState(0)
  /** 第幾個等待（每一題換一個號，同一種題連著出也重新開始） */
  const [waitNo, setWaitNo] = useState(0)
  /** 結尾小題（T-136）：前幾次上過的那一篇 */
  const [review, setReview] = useState<number | null>(null)
  const skipLock = useRef(0)
  const [poke, setPoke] = useState<Poke | null>(null)
  const pokes = useRef(0)
  const resolve = useRef<(() => void) | null>(null)
  const run = useRef(0)

  const waitFor = (w: Wait) =>
    new Promise<void>((res) => {
      resolve.current = res
      setHand(0)
      setWaitNo((n) => n + 1)
      setWaiting(w)
    })
  const waitDone = () => {
    const r = resolve.current
    if (!r) return
    resolve.current = null
    setWaiting(null)
    setHand(0)
    r()
  }

  // 等他點下一句的時候：8 秒手來指，之後每 8 秒再指一次（不自己往下）
  useEffect(() => {
    if (waiting?.kind !== 'next') return
    const id = window.setInterval(() => setHand((n) => n + 1), EN_HAND_MS)
    return () => clearInterval(id)
  }, [waiting])

  useEffect(() => {
    const me = ++run.current
    const gone = () => run.current !== me
    const sandwich = async (i: number) => {
      const zh = e.sw[i]
      if (!zh || !zhClipReady(zh)) return
      const head = enWordKey(zh)
      const br = bridgeKey(enNounKey(zh), 'momo')
      if (!hasLine(head) || !hasLine(br)) return
      await wait(350)
      if (gone()) return
      await say(head, br)
    }
    void (async () => {
      await wait(400)
      for (let i = start; i < EN_PAGES; i++) {
        if (gone()) return
        setAt(i)
        void saveEnAt(row.day, i)
        const k = enLineKey(row.day, i)
        if (hasLine(k)) await say(k)
        if (gone()) return
        await sandwich(i)
        if (gone()) return
        await wait(250)
        if (gone()) return
        // 每句念完就停，等他點一下
        await waitFor({ kind: 'next' })
        if (gone()) return
      }
      // 念完 4 句：故事題 → 認角色 → 找一樣的英文字
      const q = storyAskOf(t, e)
      if (q && hasLine(enQKey(row.day))) {
        await waitFor({ kind: 'q', pick: q, key: enQKey(row.day) })
        if (gone()) return
      }
      const which = whichOf(t, e)
      if (which && hasLine(enWhichKey(which.word))) {
        await wait(300)
        if (gone()) return
        await waitFor({ kind: 'which', pick: which, key: enWhichKey(which.word) })
        if (gone()) return
      }
      const m = matchOf(t, e)
      if (m) {
        await wait(300)
        if (gone()) return
        // 每次都先示範（T-139：以前只有前 2 次；一天兩篇以後第一天就用完了。盲測 ccf7ac7 沒有示範的時候「都是字」就走了）
        await waitFor({ kind: 'match', q: m, demo: true })
        if (gone()) return
        void saveMatched()
      }
      // 結尾小題（今天的新篇才有）：前 1 次、前 7 次的那一篇各一題，認角色；出不了就找一樣的英文字
      for (const d of row.isNew ? (row.review ?? []) : []) {
        const rt = zhTextOf(d)
        const re = enText(d)
        if (!rt || !re) continue
        setReview(d)
        await wait(300)
        if (gone()) return
        const w = whichOf(rt, re)
        const rm = w && hasLine(enWhichKey(w.word)) ? null : matchOf(rt, re)
        if (w && hasLine(enWhichKey(w.word))) await waitFor({ kind: 'which', pick: w, key: enWhichKey(w.word) })
        else if (rm) await waitFor({ kind: 'match', q: rm, demo: true })
        if (gone()) return
      }
      setReview(null)
      await finishEn(row.day)
      if (gone()) return
      onDone()
    })()
    return () => {
      run.current++
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tapArt = (ev: React.PointerEvent) => {
    if (!firstFinger(ev.nativeEvent)) return
    if (waiting?.kind === 'next') {
      sfx.pop()
      return waitDone()
    }
    // 念的當下點圖：被點的那張（點在空白處就是第一張）做一個動作，每一下換一種（T-141）；不跳過正在念的這一句。
    // 選圖、找字由 Choose、WordMatch 自己回應
    if (waiting) return
    const el = (ev.target as Element).closest<HTMLElement>('.en-pic[data-i]')
    const i = el ? Number(el.dataset.i) : 0
    const n = ++pokes.current
    PIC_SFX[PIC_ACTS[(n - 1) % PIC_ACTS.length]]()
    setPoke({ page: at, i, n })
  }

  /** 大人跳過舊篇：連點、兩根手指只算一下 */
  const skip = (ev: React.PointerEvent) => {
    if (!firstFinger(ev.nativeEvent) || !onSkip) return
    const now = performance.now()
    if (now < skipLock.current) return
    skipLock.current = now + 1000
    run.current++
    stopSpeech()
    sfx.tap()
    onSkip()
  }

  const nextOn = waiting?.kind === 'next'
  return (
    <div className="book-replay en-book" data-en-day={row.day} data-part={row.isNew ? row.part : undefined} data-review={review ?? undefined}>
      {back}
      {/* 跳過舊篇（T-136）：大人用的，插畫下面右下角淡淡的底線字（孩子點的圖、下一句的箭頭以外），跟中文課一樣 */}
      {onSkip && (
        <button type="button" className="en-skip-old" onPointerDown={skip}>
          跳過舊篇
        </button>
      )}
      <div className="book-progress" aria-hidden="true">
        {Array.from({ length: EN_PAGES }, (_, i) => (
          <i key={i} className={i <= at ? 'is-done' : undefined} />
        ))}
      </div>
      <div className="book-art en-art" data-page={at} data-beat={at} data-wait={waiting?.kind} onPointerDown={tapArt}>
        <Swap id={`p${at}`} className="swap-pic" arm={false}>
          <EnPage pics={pics[at]} text={e.en[at]} poke={poke?.page === at ? poke : null} />
        </Swap>
        {/* 下一句的大箭頭：一直看得到（念的時候淡淡的），念完亮起來；點整張圖也算 */}
        <button type="button" className={`en-next${nextOn ? ' is-on' : ''}`} aria-label="下一句" tabIndex={nextOn ? 0 : -1}>
          <svg viewBox="0 0 48 48" width="56%" aria-hidden="true">
            <path d="M14 24 H34 M26 14 L36 24 L26 34" fill="none" stroke="#2E2A25" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <AnimatePresence>{hand > 0 && nextOn && <Hand key="hand-next" x={91} y={80} tap={hand} size="9cqmin" />}</AnimatePresence>
        {(waiting?.kind === 'q' || waiting?.kind === 'which') && (
          <Choose
            key={`${waiting.kind}${waitNo}`}
            kind="ask"
            auto={false}
            lead
            ask={waiting.key}
            answer={waiting.pick.answer}
            cards={[<EnCard key="a" pics={[waiting.pick.icons[0]]} />, <EnCard key="b" pics={[waiting.pick.icons[1]]} />]}
            onDone={waitDone}
          />
        )}
        {waiting?.kind === 'match' && <WordMatch key={`m${waitNo}`} q={waiting.q} demo={waiting.demo} wordKey={enWordKey(waiting.q.zh)} onDone={waitDone} />}
      </div>
      <div className="story-home-dino">
        <Dino who="momo" mood="happy" size="100%" />
      </div>
    </div>
  )
}

/** 一頁：中文課文那一行的圖（1～3 張）、下面一行英文（給大人看，孩子聽） */
function EnPage({ pics, text, poke }: { pics: string[]; text: string; poke: Poke | null }) {
  return (
    <div className="en-page">
      <div className={`en-pics n${Math.min(pics.length, 3)}`}>
        {pics.slice(0, 3).map((p, i) => {
          const act = poke?.i === i ? PIC_ACTS[(poke.n - 1) % PIC_ACTS.length] : undefined
          return (
            <span key={p} className="en-pic" data-i={i} data-act={act}>
              {/* 換 key 重播：同一張連點，每一下都看得到動作 */}
              <span key={act ? poke!.n : 0} className={`en-pic-in${act ? ` en-act-${act}` : ''}`}>
                <Pic name={p} />
              </span>
            </span>
          )
        })}
      </div>
      <p className="en-line">{text}</p>
    </div>
  )
}

/** 選圖的一張 */
function EnCard({ pics }: { pics: string[] }) {
  return (
    <span className={`en-card n${Math.min(pics.length, 3)}`}>
      {pics.slice(0, 3).map((p) => (
        <span key={p} className="en-pic">
          <Pic name={p} />
        </span>
      ))}
    </span>
  )
}
