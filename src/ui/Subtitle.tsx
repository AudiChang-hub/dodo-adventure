import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { segments, type Line } from '../content/lines'
import { isBlankQuestion, revealsAnswer, LINGER_MS, REVEAL_HOLD_MS } from '../content/subtitles'
import { audioClock, onSpeakLevel, onSpeech, type SpeechEvent, type WordTiming } from '../lib/audio'
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

function makeLive(key: string, line: Line): Live {
  const blank = isBlankQuestion(key)
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

/** 說話時在上方中央顯示的英文字幕：逐字亮起，問題句的答案處是空格，作答後補上答案 */
export function Subtitle({ hidden }: { hidden: boolean }) {
  const [view, setView] = useState<View | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live: Live | null = null
    let pending: Live | null = null
    let shown: View | null = null
    let holding = false
    let holdTimer = 0
    let lingerTimer = 0
    let raf = 0
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
      raf = v?.mode === 'live' ? requestAnimationFrame(frame) : 0
    }

    const clearTimers = () => {
      clearTimeout(holdTimer)
      clearTimeout(lingerTimer)
      holding = false
    }

    /** 一般句子唸完後：回到還在等作答的問題（空格），沒有就淡出 */
    const settle = () => {
      if (live && !live.ended) return show({ live, mode: 'live' })
      if (pending) return show({ live: pending, mode: pending === live ? 'live' : 'still' })
      show(null)
    }

    const begin = (next: Live) => {
      clearTimeout(lingerTimer)
      const q = pending
      live = next
      if (q && revealsAnswer(q.key, next.key)) {
        // 作答之後的第一句：先把問題句補上答案、停一下，再換成正在唸的句子
        pending = null
        holding = true
        show({ live: q, mode: 'reveal' })
        clearTimeout(holdTimer)
        holdTimer = window.setTimeout(() => {
          holding = false
          settle()
        }, REVEAL_HOLD_MS)
      } else if (!holding) show({ live: next, mode: 'live' })
      if (next.blank) pending = next
    }

    const onEvent = (e: SpeechEvent) => {
      if (e.type === 'stop') {
        clearTimers()
        live = pending = null
        return show(null)
      }
      if (e.type === 'end') {
        const l = live
        if (!l || l.key !== e.key || l.ended) return
        l.ended = true
        if (shown?.live !== l) return
        paint(l)
        if (!l.blank) lingerTimer = window.setTimeout(() => shown?.live === l && settle(), LINGER_MS)
        return
      }
      const fresh = !live || live.ended || live.key !== e.key || e.type === 'whole' || e.seg === 0
      if (fresh) begin(makeLive(e.key, e.line))
      const l = live!
      if (e.type === 'whole') {
        l.whole = true
        l.toks.forEach((t) => (t.start = t.end = 0))
        l.segAt = l.toks.map(() => 0)
        if (shown?.live === l) show({ live: l, mode: 'still' })
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
    }
  }, [])

  // 說話者的小圓點跟著音量起伏
  useEffect(
    () =>
      onSpeakLevel((_, level) => {
        const dot = root.current?.querySelector<HTMLElement>('.sub-who')
        if (dot) dot.style.transform = `scale(${1 + level * 0.55})`
      }),
    [],
  )

  const v = hidden ? null : view
  return (
    <div className="subtitle" ref={root} aria-live="polite">
      {/* 先收掉上一句再出現下一句，兩個膠囊不會疊在一起；字的亮起跟著音訊時鐘，不受影響 */}
      <AnimatePresence mode="wait">
        {v && (
          <motion.div
            key={v.live.id}
            data-line={v.live.id}
            className={`sub-pill${v.mode === 'reveal' ? ' is-reveal' : ''}${v.live.line.text.length > LONG_CHARS ? ' is-long' : ''}`}
            style={{ '--who': `var(--${v.live.line.speaker}-deep)` } as CSSProperties}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <span className="sub-who" aria-hidden="true" />
            <span className="sub-text">
              {v.live.toks.map((t, i) => (
                <span key={i} data-i={i} className={`sub-w${t.key ? ' is-key' : ''}${t.minor ? ' is-minor' : ''}${v.mode !== 'live' ? ' is-said' : ''}`}>
                  {t.blank ? (
                    <>
                      {t.blank.pre}
                      <span className={`sub-blank${v.mode === 'reveal' ? ' is-filled' : ''}`}>
                        <span className="sub-ans">{t.blank.core}</span>
                        {v.mode === 'reveal' && (
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
        )}
      </AnimatePresence>
    </div>
  )
}
