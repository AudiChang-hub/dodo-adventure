import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { plainText, segments, type Line } from '../content/lines'
import { isBlankQuestion, revealsAnswer, BACK_TO_QUESTION_MS, REVEAL_HOLD_MS } from '../content/subtitles'
import { audioClock, isSpeaking, onSpeakLevel, onSpeech, replayLine, type SpeechEvent, type WordTiming } from '../lib/audio'
import { swap } from './motion'
import './subtitle.css'

/** 字幕上的一個字（挖空時，`|` 後那段整段是一個字） */
interface Tok {
  text: string
  /** 挖空的字：pre + 空格 + post，空格寬度等於 core */
  blank?: { pre: string; core: string; post: string }
  seg: number
  /** 目標字（`|` 後的加重段）：字幕上字級最大 */
  key: boolean
  /** 長句裡的次要字：字小一點、淡一點，讓目標字跳出來 */
  minor: boolean
  /** 中文三明治：中文字（用中文字型）、中英之間的破折號 */
  zh?: boolean
  sep?: boolean
  /** 相對於該段音檔開頭的毫秒 */
  start: number
  end: number
}

/** 正在唸（或唸過）的一句 */
interface Live {
  id: number
  key: string
  line: Line
  toks: Tok[]
  segAt: (number | undefined)[]
  ended: boolean
  /** 平板內建語音備援：沒有時間資料，整句一次亮起 */
  whole: boolean
  blank: boolean
}

/** live：跟著聲音逐字亮起；still：整句已唸過（等孩子作答時重新顯示問題）；reveal：空格補上答案 */
type Mode = 'live' | 'still' | 'reveal'

interface View {
  live: Live
  mode: Mode
  /** 這句唸完了：留在畫面上（換成「唸完」的樣式），直到下一句來取代 */
  done: boolean
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const EDGE = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u

let nextId = 1

/** 超過這個字數的句子字縮小一點，盡量維持一行，少擋到下面的東西 */
const LONG_CHARS = 40
/**
 * 字幕最好一句不超過 6 個字（benchmark 手法 6）。超過的句子照樣顯示，
 * 但目標字以外的字縮小、變淡，眼睛還是先看到目標字。
 */
const MAX_WORDS = 6

/**
 * 中文三明治（蘋果 → Apple.）：字幕顯示成「Apple — 蘋果 — Apple.」。最前面的 Apple 是上一句已經唸過的英文，
 * 中文一開始唸就跟著亮過去；中文沒有逐字時間，整個詞亮到後面的英文開始。
 */
function bridgeToks(line: Line): Tok[] {
  const at = (seg: number, text: string, extra: Partial<Tok>, end = 0): Tok => ({ text, seg, key: false, minor: false, start: 0, end, ...extra })
  return [
    at(0, line.lead ?? '', { key: true }),
    at(0, '—', { sep: true }),
    at(0, line.zh ?? '', { key: true, zh: true }, Infinity),
    at(1, '—', { sep: true }),
    { text: line.text, seg: 1, key: true, minor: false, start: NaN, end: NaN },
  ]
}

function makeLive(key: string, line: Line): Live {
  const blank = isBlankQuestion(key)
  if (line.zh != null) return { id: nextId++, key, line, toks: bridgeToks(line), segAt: [], ended: false, whole: false, blank: false }
  const toks: Tok[] = []
  segments(line).forEach((s, seg) => {
    if (!s.text) return
    if (blank && s.emph) {
      const [, pre, core, post] = s.text.match(EDGE)!
      toks.push({ text: s.text, blank: { pre, core, post }, seg, key: true, minor: false, start: NaN, end: NaN })
      return
    }
    for (const w of s.text.split(/\s+/)) toks.push({ text: w, seg, key: s.emph, minor: false, start: NaN, end: NaN })
  })
  if (toks.length > MAX_WORDS) for (const t of toks) t.minor = !t.key
  return { id: nextId++, key, line, toks, segAt: [], ended: false, whole: false, blank }
}

/** 把 edge-tts 的字對到字幕上的字：一個字幕字可能涵蓋多個語音字（例如 fire truck 挖空成一格） */
function align(toks: Tok[], words: WordTiming[] | null, durMs: number) {
  let j = 0
  if (words?.length) {
    for (const t of toks) {
      const target = norm(t.blank ? t.blank.core : t.text)
      if (!target) continue
      let acc = ''
      let first = -1
      while (j < words.length) {
        const w = norm(words[j][2])
        if (!w) {
          j++
          continue
        }
        if (!target.startsWith(acc + w)) break
        acc += w
        if (first < 0) first = j
        j++
        if (acc === target) break
      }
      if (first >= 0) {
        t.start = words[first][0]
        t.end = words[j - 1][1]
      }
    }
  }
  // 對不上的字（或整段沒有時間資料）：依字長在前後已知的時間之間平均分配
  const lead = words?.length ? words[0][0] : 100
  const tail = words?.length ? words[words.length - 1][1] : Math.max(lead + 200, durMs - 600)
  let i = 0
  while (i < toks.length) {
    if (!Number.isNaN(toks[i].start)) {
      i++
      continue
    }
    let k = i
    while (k < toks.length && Number.isNaN(toks[k].start)) k++
    const from = i > 0 ? toks[i - 1].end : lead
    const to = k < toks.length ? toks[k].start : Math.max(from, tail)
    const lens = toks.slice(i, k).map((t) => Math.max(1, norm(t.text).length))
    const total = lens.reduce((a, b) => a + b, 0)
    let at = from
    for (let n = i; n < k; n++) {
      const d = ((to - from) * lens[n - i]) / total
      toks[n].start = at
      toks[n].end = at + d
      at += d
    }
    i = k
  }
}

/**
 * 說話時在上方中央顯示的英文字幕：逐字亮起，問題句的答案處是空格，作答後補上答案。
 * 一句唸完後留在畫面上（「唸完」的樣式），直到下一句來取代；換畫面、離開遊戲（stopSpeech）才收起。
 * 換句是原地換（ui/motion.ts 的 swap）：新的一句蓋上來淡入，舊的等一下才淡掉，中間不會先變空白。
 * 點一下字幕：沒在說話時把這一句再唸一次（不算作答、不影響遊戲的計時）。
 */
export function Subtitle({ hidden }: { hidden: boolean }) {
  const [view, setView] = useState<View | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const replay = useRef<() => void>(() => {})

  useEffect(() => {
    let live: Live | null = null
    let pending: Live | null = null
    let shown: View | null = null
    let holding = false
    let holdTimer = 0
    let backTimer = 0
    let raf = 0
    /** 剛點了字幕要重播的那一句：之後第一個同 key 的播放事件就是重播 */
    let ask: string | null = null
    /** 每個字目前的狀態，只有改變時才動 DOM */
    let painted: string[] = []

    const nodes = (l: Live) => root.current?.querySelector(`[data-line="${l.id}"]`)?.querySelectorAll<HTMLElement>('[data-i]')

    const paint = (l: Live) => {
      const els = nodes(l)
      if (!els?.length) return false
      const now = audioClock()
      let cur = -1
      if (!l.ended)
        l.toks.forEach((t, i) => {
          const at = l.segAt[t.seg]
          if (at !== undefined && (now - at) * 1000 >= t.start) cur = i
        })
      // 唸完一個字後停一下就不再標成「正在唸」（句中停頓、最後一個字之後）
      let said = cur
      if (cur >= 0) {
        const t = l.toks[cur]
        if ((now - l.segAt[t.seg]!) * 1000 > t.end + 250) said = cur + 1
      }
      els.forEach((el, i) => {
        const s = l.ended || i < said ? 'said' : i === cur ? 'now' : ''
        if (painted[i] === s) return
        painted[i] = s
        el.classList.toggle('is-said', s === 'said')
        el.classList.toggle('is-now', s === 'now')
      })
      return true
    }

    const frame = () => {
      raf = 0
      if (!shown || shown.mode !== 'live') return
      const l = shown.live
      paint(l)
      if (!l.ended) raf = requestAnimationFrame(frame)
    }

    const show = (v: View | null) => {
      shown = v
      painted = []
      setView(v)
      cancelAnimationFrame(raf)
      raf = v?.mode === 'live' && !v.done ? requestAnimationFrame(frame) : 0
    }

    /** 一句要怎麼顯示：唸完了、補上答案、或是回到還在等作答的問題（still），都是「唸完」的樣式 */
    const viewOf = (l: Live, mode: Mode = l.whole ? 'still' : 'live'): View => ({ live: l, mode, done: l.ended || mode === 'reveal' || (mode === 'still' && l !== live) })

    const clearTimers = () => {
      clearTimeout(holdTimer)
      clearTimeout(backTimer)
      holding = false
    }

    /** 補上答案停一下之後、插話唸完之後：正在唸的句子優先，再來是還在等作答的問題，都沒有就留著最後一句 */
    const settle = () => {
      if (live && !live.ended) return show(viewOf(live))
      if (pending) return show(viewOf(pending, pending === live && !live.whole ? 'live' : 'still'))
      if (live) show(viewOf(live))
    }

    const begin = (next: Live, again: boolean) => {
      clearTimeout(backTimer)
      const q = pending
      live = next
      if (!again && q && revealsAnswer(q.key, next.key)) {
        // 作答之後的第一句：先把問題句補上答案、停一下，再換成正在唸的句子
        pending = null
        holding = true
        show(viewOf(q, 'reveal'))
        clearTimeout(holdTimer)
        holdTimer = window.setTimeout(() => {
          holding = false
          settle()
        }, REVEAL_HOLD_MS)
      } else if (!holding) show(viewOf(next))
      // 重播別的句子（例如「再試一次」）時，還在等作答的問題不變；重播的就是那個問題時，換成新的這一句
      if (next.blank) pending = next
    }

    replay.current = () => {
      if (!shown || holding || isSpeaking()) return
      const l = shown.live
      ask = l.key
      if (!replayLine(l.key)) ask = null
    }

    const onEvent = (e: SpeechEvent) => {
      if (e.type === 'stop') {
        clearTimers()
        live = pending = ask = null
        return show(null)
      }
      if (e.type === 'cut') {
        // 同一個畫面裡跳過：這一句停在唸完的樣子，留在畫面上等下一句
        ask = null
        const l = live
        if (!l || l.ended) return
        l.ended = true
        if (shown?.live === l) show(viewOf(l, shown.mode))
        return
      }
      if (e.type === 'end') {
        const l = live
        if (!l || l.key !== e.key || l.ended) return
        l.ended = true
        if (shown?.live !== l) return
        paint(l)
        show(viewOf(l, shown.mode))
        // 等作答時插進來的一句（再試一次、發呆提醒）唸完：停一下換回問題句，空格繼續等
        if (pending && pending !== l) backTimer = window.setTimeout(() => shown?.live === l && settle(), BACK_TO_QUESTION_MS)
        return
      }
      const fresh = !live || live.ended || live.key !== e.key || e.type === 'whole' || e.seg === 0
      if (fresh) {
        const again = ask === e.key
        ask = null
        begin(makeLive(e.key, e.line), again)
      }
      const l = live!
      if (e.type === 'whole') {
        l.whole = true
        l.toks.forEach((t) => (t.start = t.end = 0))
        l.segAt = l.toks.map(() => 0)
        if (shown?.live === l) show(viewOf(l, 'still'))
        return
      }
      l.segAt[e.seg] = e.at
      align(
        l.toks.filter((t) => t.seg === e.seg),
        e.words,
        e.dur * 1000,
      )
    }

    const off = onSpeech(onEvent)
    return () => {
      off()
      clearTimers()
      cancelAnimationFrame(raf)
      replay.current = () => {}
    }
  }, [])

  // 說話者的小圓點跟著音量起伏（只動最上面、正在顯示的那一句）
  useEffect(
    () =>
      onSpeakLevel((_, level) => {
        const dot = root.current?.querySelector<HTMLElement>('.sub-pill:not([data-gone]) .sub-dot')
        if (dot) dot.style.transform = `scale(${1 + level * 0.55})`
      }),
    [],
  )

  const v = hidden ? null : view
  return (
    <div className="subtitle" ref={root} aria-live="polite">
      {/* 原地換：新的一句蓋上來淡入，舊的等新的差不多蓋好才淡掉（兩個膠囊疊在同一格），不會先淡成空白再出現 */}
      <AnimatePresence initial={false}>{v && <Pill key={v.live.id} v={v} onTap={() => replay.current()} />}</AnimatePresence>
    </div>
  )
}

function Pill({ v, onTap }: { v: View; onTap: () => void }) {
  const present = useIsPresent()
  const { live, mode, done } = v
  return (
    <motion.div
      data-line={live.id}
      data-gone={present ? undefined : ''}
      className={`sub-pill${live.line.zh != null ? ' is-bridge' : ''}${mode === 'reveal' ? ' is-reveal' : ''}${done ? ' is-done' : ''}${plainText(live.line).length > LONG_CHARS ? ' is-long' : ''}`}
      style={{ '--who': `var(--${live.line.speaker}-deep)`, pointerEvents: present ? undefined : 'none' } as CSSProperties}
      variants={swap}
      initial="initial"
      animate="enter"
      exit="exit"
      role="button"
      aria-label="再聽一次"
      onPointerDown={(e) => {
        // 只有字幕自己收這一下，不傳給下面的畫面
        e.stopPropagation()
        onTap()
      }}
    >
      {/* 說話時是跟著音量起伏的小圓點，唸完換成「再聽一次」的小喇叭 */}
      <span className="sub-who" aria-hidden="true">
        <span className="sub-dot" />
        <svg className="sub-again" viewBox="0 0 24 24">
          <path d="M3.5 9.4h3.4L12 5.2v13.6l-5.1-4.2H3.5z" />
          <path className="sub-wave" d="M15.4 8.8a4.4 4.4 0 0 1 0 6.4M18.2 6.2a8 8 0 0 1 0 11.6" />
        </svg>
      </span>
      <span className="sub-text">
        {live.toks.map((t, i) => (
          <span key={i} data-i={i} className={`sub-w${t.key ? ' is-key' : ''}${t.minor ? ' is-minor' : ''}${t.zh ? ' is-zh' : ''}${t.sep ? ' is-sep' : ''}${mode !== 'live' || done ? ' is-said' : ''}`}>
            {t.blank ? (
              <>
                {t.blank.pre}
                <span className={`sub-blank${mode === 'reveal' ? ' is-filled' : ''}`}>
                  <span className="sub-ans">{t.blank.core}</span>
                  {mode === 'reveal' && (
                    <span className="sub-spark" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </span>
                {t.blank.post}
              </>
            ) : (
              t.text
            )}
          </span>
        ))}
      </span>
    </motion.div>
  )
}
